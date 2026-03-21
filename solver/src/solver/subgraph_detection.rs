//! General rigid/semi-rigid subgraph detection.
//!
//! Analyzes connected components of non-fixed, non-group-owned points.
//! For each component, computes internal DOF using coordinate equivalence
//! classes from `coord_reduction`. If profitable, collapses the component
//! into a parameterized `SketchGroup`.
//!
//! This is shape-agnostic: it works for rectangles, triangles, hexagons,
//! or any constraint pattern that creates a semi-rigid structure.

use std::collections::{HashMap, HashSet};
use crate::types::{Constraint, Line, LocalPoint, ParamCoord, Point, Shape, SketchGroup};
use super::coord_reduction::CoordReduction;

/// Result of subgraph detection: new groups to add and constraints to absorb.
pub struct DetectionResult {
    /// New parameterized groups created from detected subgraphs.
    pub new_groups: Vec<SketchGroup>,
    /// Indices of constraints absorbed by the new groups (internal structural constraints).
    pub absorbed_constraint_indices: HashSet<usize>,
}

/// Detect rigid/semi-rigid subgraphs and create parameterized groups.
///
/// The algorithm:
/// 1. Build connected components via lines + structural constraints
/// 2. Skip components containing already-group-owned points
/// 3. For each component with enough points, analyze DOF via coord_reduction
/// 4. If profitable, create a parameterized group
pub fn detect_subgraphs(
    points: &[Point],
    lines: &[Line],
    constraints: &[Constraint],
    existing_groups: &[SketchGroup],
    coord_red: &CoordReduction,
) -> DetectionResult {
    if points.is_empty() {
        return DetectionResult { new_groups: vec![], absorbed_constraint_indices: HashSet::new() };
    }

    let n = points.len();
    let pt_idx: HashMap<&str, usize> = points.iter().enumerate()
        .map(|(i, p)| (p.id.as_str(), i))
        .collect();
    let line_map: HashMap<&str, &Line> = lines.iter()
        .map(|l| (l.id.as_str(), l))
        .collect();

    // Set of point IDs already owned by existing groups.
    let group_owned: HashSet<&str> = existing_groups.iter()
        .flat_map(|g| g.points.iter().map(|lp| lp.id.as_str()))
        .collect();

    // ── Union-find over points ──────────────────────────────────────────────
    let mut parent: Vec<usize> = (0..n).collect();
    let mut rank: Vec<usize> = vec![0; n];

    fn uf_find(parent: &mut [usize], x: usize) -> usize {
        if parent[x] != x {
            parent[x] = uf_find(parent, parent[x]);
        }
        parent[x]
    }
    fn uf_union(parent: &mut [usize], rank: &mut [usize], a: usize, b: usize) {
        let ra = uf_find(parent, a);
        let rb = uf_find(parent, b);
        if ra == rb { return; }
        match rank[ra].cmp(&rank[rb]) {
            std::cmp::Ordering::Less => parent[ra] = rb,
            std::cmp::Ordering::Greater => parent[rb] = ra,
            std::cmp::Ordering::Equal => { parent[rb] = ra; rank[ra] += 1; }
        }
    }

    // Connect via lines.
    for line in lines {
        if let (Some(&ai), Some(&bi)) = (pt_idx.get(line.a.as_str()), pt_idx.get(line.b.as_str())) {
            uf_union(&mut parent, &mut rank, ai, bi);
        }
    }

    // NOTE: We intentionally do NOT union via structural constraints (Coincident,
    // PointOnLine, Midpoint). This ensures that bridge points (e.g., from
    // attachCentered) don't merge separate shapes into one giant component.
    // Each shape's natural boundary is defined by its lines.

    // ── Group non-fixed, non-group-owned points by component ────────────────
    let mut components: HashMap<usize, Vec<usize>> = HashMap::new();
    for i in 0..n {
        if points[i].fixed || group_owned.contains(points[i].id.as_str()) {
            continue;
        }
        let root = uf_find(&mut parent, i);
        components.entry(root).or_default().push(i);
    }

    let mut new_groups = Vec::new();
    let mut all_absorbed: HashSet<usize> = HashSet::new();

    for (_root, members) in &components {
        // Need at least 4 points for a profitable group.
        // 3 points = 6 DOF - 3 frame = 3 internal → saves 6 - 3 - 3 = 0 vars.
        // 4 points = 8 DOF → even 4 internal DOF saves 8 - 3 - 4 = 1, not worth it.
        // In practice we need the structural constraints to reduce internal DOF.
        if members.len() < 4 { continue; }

        let member_set: HashSet<usize> = members.iter().copied().collect();
        let member_ids: HashSet<&str> = members.iter().map(|&i| points[i].id.as_str()).collect();

        // Count unique representative coordinates within this component.
        let mut unique_repr_x: HashSet<usize> = HashSet::new();
        let mut unique_repr_y: HashSet<usize> = HashSet::new();
        for &i in members {
            // The representative must be within this component or be the point itself
            // (if it's the representative of its class).
            if coord_red.repr_x.len() > i {
                unique_repr_x.insert(coord_red.repr_x[i]);
            } else {
                unique_repr_x.insert(i);
            }
            if coord_red.repr_y.len() > i {
                unique_repr_y.insert(coord_red.repr_y[i]);
            } else {
                unique_repr_y.insert(i);
            }
        }

        let unique_coords = unique_repr_x.len() + unique_repr_y.len();
        let total_point_dof = members.len() * 2;

        // Determine if rotation is locked.
        // Rotation is locked if all lines in the component have H or V constraints.
        let component_line_ids: HashSet<&str> = lines.iter()
            .filter(|l| {
                let a_in = pt_idx.get(l.a.as_str()).map_or(false, |&i| member_set.contains(&i));
                let b_in = pt_idx.get(l.b.as_str()).map_or(false, |&i| member_set.contains(&i));
                a_in && b_in
            })
            .map(|l| l.id.as_str())
            .collect();

        let mut hv_constrained_lines: HashSet<&str> = HashSet::new();
        let mut block_rotation = false;
        for c in constraints {
            match c {
                Constraint::Horizontal { line, .. } | Constraint::Vertical { line, .. } => {
                    if component_line_ids.contains(line.as_str()) {
                        hv_constrained_lines.insert(line.as_str());
                    }
                }
                Constraint::BlockRotation { points: pts, .. } => {
                    // Check if at least 2 points are in this component.
                    let in_comp = pts.iter().filter(|p| member_ids.contains(p.as_str())).count();
                    if in_comp >= 2 { block_rotation = true; }
                }
                _ => {}
            }
        }

        // Rotation is locked if all internal lines are H/V constrained OR blockRotation is present.
        let rotation_locked = block_rotation ||
            (!component_line_ids.is_empty() && component_line_ids.iter().all(|l| hv_constrained_lines.contains(l)));

        let frame_dof = if rotation_locked { 2 } else { 3 };
        // Frame anchor absorption: the frame centroid absorbs one x-repr and
        // one y-repr (they become Constants). Only remaining reprs become params.
        let x_params = if unique_repr_x.len() > 1 { unique_repr_x.len() - 1 } else { 0 };
        let y_params = if unique_repr_y.len() > 1 { unique_repr_y.len() - 1 } else { 0 };
        let internal_dof = x_params + y_params;
        let vars_after = frame_dof + internal_dof;
        let vars_saved = if total_point_dof > vars_after { total_point_dof - vars_after } else { 0 };

        // Only profitable if we save at least 2 variables.
        if vars_saved < 2 { continue; }

        // ── Build the parameterized group ───────────────────────────────────

        // Compute frame: centroid + angle.
        let cx = members.iter().map(|&i| points[i].x).sum::<f64>() / members.len() as f64;
        let cy = members.iter().map(|&i| points[i].y).sum::<f64>() / members.len() as f64;

        let theta = if rotation_locked {
            0.0
        } else {
            // Use the first internal line's direction as the frame angle.
            let mut angle = 0.0;
            for l in lines {
                if !component_line_ids.contains(l.id.as_str()) { continue; }
                if let (Some(&ai), Some(&bi)) = (pt_idx.get(l.a.as_str()), pt_idx.get(l.b.as_str())) {
                    let dx = points[bi].x - points[ai].x;
                    let dy = points[bi].y - points[ai].y;
                    if dx.abs() > 1e-12 || dy.abs() > 1e-12 {
                        angle = dy.atan2(dx);
                        break;
                    }
                }
            }
            angle
        };

        let (cos_t, sin_t) = (theta.cos(), theta.sin());

        // Transform points to local coordinates.
        let local_coords: Vec<(f64, f64)> = members.iter().map(|&i| {
            let dx = points[i].x - cx;
            let dy = points[i].y - cy;
            // Inverse rotation: multiply by R(-θ)
            let lx = dx * cos_t + dy * sin_t;
            let ly = -dx * sin_t + dy * cos_t;
            (lx, ly)
        }).collect();

        // ── Identify shape parameters ───────────────────────────────────────
        // For axis-aligned structures: each unique representative x-coordinate
        // becomes an x-param, each unique representative y-coordinate becomes a y-param.
        // We map each point's local coords to these params.

        // Collect unique representative coords and sort them for deterministic param ordering.
        let mut repr_x_sorted: Vec<usize> = unique_repr_x.iter().copied().collect();
        repr_x_sorted.sort();
        let mut repr_y_sorted: Vec<usize> = unique_repr_y.iter().copied().collect();
        repr_y_sorted.sort();

        // ── Frame anchor absorption ───────────────────────────────────────
        // The frame centroid (gx, gy) already provides translation DOF.
        // To avoid redundancy, the first representative in each axis becomes
        // a Constant (its local coord is fixed; the frame absorbs its world
        // position). Only remaining representatives become solver params.
        //
        // For a rect: 2 unique x-reprs → 1 becomes constant, 1 becomes param
        //             2 unique y-reprs → 1 becomes constant, 1 becomes param
        //             Total: 2 frame + 2 params = 4 vars (instead of 8)

        // Anchor = first repr in each axis (constant local coord).
        let x_anchor = repr_x_sorted[0];
        let y_anchor = repr_y_sorted[0];

        // Remaining reprs become params.
        let x_param_reprs: Vec<usize> = repr_x_sorted[1..].to_vec();
        let y_param_reprs: Vec<usize> = repr_y_sorted[1..].to_vec();
        let n_x_params = x_param_reprs.len();

        // Map representative → param index (only non-anchor reprs).
        let repr_x_to_param: HashMap<usize, usize> = x_param_reprs.iter().enumerate()
            .map(|(pi, &repr)| (repr, pi))
            .collect();
        let repr_y_to_param: HashMap<usize, usize> = y_param_reprs.iter().enumerate()
            .map(|(pi, &repr)| (repr, pi + n_x_params))
            .collect();

        // Collect anchor local coord values (for Constant expressions).
        let mut anchor_lx = 0.0f64;
        let mut anchor_ly = 0.0f64;
        for (mi, &pt_i) in members.iter().enumerate() {
            let repr_x = if coord_red.repr_x.len() > pt_i { coord_red.repr_x[pt_i] } else { pt_i };
            let repr_y = if coord_red.repr_y.len() > pt_i { coord_red.repr_y[pt_i] } else { pt_i };
            if repr_x == x_anchor { anchor_lx = local_coords[mi].0; }
            if repr_y == y_anchor { anchor_ly = local_coords[mi].1; }
        }

        // Build param values from local coordinates of non-anchor reprs.
        let mut params = vec![0.0f64; n_x_params + y_param_reprs.len()];
        for (mi, &pt_i) in members.iter().enumerate() {
            let (lx, ly) = local_coords[mi];
            let repr_x = if coord_red.repr_x.len() > pt_i { coord_red.repr_x[pt_i] } else { pt_i };
            let repr_y = if coord_red.repr_y.len() > pt_i { coord_red.repr_y[pt_i] } else { pt_i };
            if let Some(&pi) = repr_x_to_param.get(&repr_x) {
                params[pi] = lx;
            }
            if let Some(&pi) = repr_y_to_param.get(&repr_y) {
                params[pi] = ly;
            }
        }

        // Build param_point_map: each point's local coords as ParamCoord expressions.
        let mut local_points = Vec::new();
        let mut param_point_map = Vec::new();

        for (mi, &pt_i) in members.iter().enumerate() {
            let (lx, ly) = local_coords[mi];
            let repr_x = if coord_red.repr_x.len() > pt_i { coord_red.repr_x[pt_i] } else { pt_i };
            let repr_y = if coord_red.repr_y.len() > pt_i { coord_red.repr_y[pt_i] } else { pt_i };

            let lx_expr = if repr_x == x_anchor {
                // Anchor: local coord is constant (absorbed by frame gx).
                ParamCoord::Constant(anchor_lx)
            } else if let Some(&pi) = repr_x_to_param.get(&repr_x) {
                let param_val = params[pi];
                let diff = lx - param_val;
                if diff.abs() < 1e-12 {
                    ParamCoord::Param(pi)
                } else {
                    ParamCoord::ParamOffset(pi, diff)
                }
            } else {
                ParamCoord::Constant(lx)
            };

            let ly_expr = if repr_y == y_anchor {
                ParamCoord::Constant(anchor_ly)
            } else if let Some(&pi) = repr_y_to_param.get(&repr_y) {
                let param_val = params[pi];
                let diff = ly - param_val;
                if diff.abs() < 1e-12 {
                    ParamCoord::Param(pi)
                } else {
                    ParamCoord::ParamOffset(pi, diff)
                }
            } else {
                ParamCoord::Constant(ly)
            };

            local_points.push(LocalPoint {
                id: points[pt_i].id.clone(),
                lx,
                ly,
            });
            param_point_map.push((lx_expr, ly_expr));
        }

        // Collect lines internal to this component.
        let component_lines: Vec<Line> = lines.iter()
            .filter(|l| component_line_ids.contains(l.id.as_str()))
            .cloned()
            .collect();

        // Generate a unique group ID from component members.
        let group_id = format!("_auto_group_{}", members.iter().min().unwrap_or(&0));

        let group = SketchGroup {
            id: group_id,
            x: cx,
            y: cy,
            theta,
            fixed: false,
            fixed_rotation: rotation_locked,
            points: local_points,
            lines: component_lines,
            params,
            param_point_map,
            auto_detected: true,
        };
        new_groups.push(group);

        // ── Collect absorbed constraints ────────────────────────────────────
        // Structural constraints that are internal to this component are absorbed.
        // They are: H, V, Coincident, Ccw, BlockRotation, Midpoint — IF all
        // referenced entities are within the component.
        for (ci, c) in constraints.iter().enumerate() {
            let absorbed = match c {
                Constraint::Horizontal { line, .. } | Constraint::Vertical { line, .. } => {
                    if let Some(l) = line_map.get(line.as_str()) {
                        let a_in = pt_idx.get(l.a.as_str()).map_or(false, |&i| member_set.contains(&i));
                        let b_in = pt_idx.get(l.b.as_str()).map_or(false, |&i| member_set.contains(&i));
                        a_in && b_in
                    } else { false }
                }
                Constraint::Coincident { a, b, .. } => {
                    let a_in = pt_idx.get(a.as_str()).map_or(false, |&i| member_set.contains(&i));
                    let b_in = pt_idx.get(b.as_str()).map_or(false, |&i| member_set.contains(&i));
                    a_in && b_in
                }
                Constraint::Ccw { points: pts, .. } => {
                    pts.iter().all(|p| member_ids.contains(p.as_str()))
                }
                Constraint::BlockRotation { points: pts, .. } => {
                    // axis is "x" or "y" (not a point ID), so only check points.
                    pts.iter().all(|p| member_ids.contains(p.as_str()))
                }
                Constraint::Midpoint { point, line, .. } => {
                    let p_in = member_ids.contains(point.as_str());
                    if let Some(l) = line_map.get(line.as_str()) {
                        let a_in = pt_idx.get(l.a.as_str()).map_or(false, |&i| member_set.contains(&i));
                        let b_in = pt_idx.get(l.b.as_str()).map_or(false, |&i| member_set.contains(&i));
                        p_in && a_in && b_in
                    } else { false }
                }
                _ => false,
            };
            if absorbed {
                all_absorbed.insert(ci);
            }
        }
    }

    // Also include coord_reduction's absorbed constraints that correspond to
    // points now owned by new groups.
    let new_group_point_ids: HashSet<&str> = new_groups.iter()
        .flat_map(|g| g.points.iter().map(|lp| lp.id.as_str()))
        .collect();
    for &ci in &coord_red.absorbed_constraints {
        // Check if the constraint's points are all in new groups.
        if ci < constraints.len() {
            let c = &constraints[ci];
            let all_in = match c {
                Constraint::Horizontal { line, .. } | Constraint::Vertical { line, .. } => {
                    if let Some(l) = line_map.get(line.as_str()) {
                        new_group_point_ids.contains(l.a.as_str()) && new_group_point_ids.contains(l.b.as_str())
                    } else { false }
                }
                Constraint::Coincident { a, b, .. } => {
                    new_group_point_ids.contains(a.as_str()) && new_group_point_ids.contains(b.as_str())
                }
                _ => false,
            };
            if all_in {
                all_absorbed.insert(ci);
            }
        }
    }

    DetectionResult {
        new_groups,
        absorbed_constraint_indices: all_absorbed,
    }
}

// ─── Constraint classification for bottom-up decomposition ──────────────────

/// Result of classifying constraints into per-cluster internal vs bridge.
pub struct ConstraintClassification {
    /// Each cluster: (point indices, constraint indices internal to this cluster).
    pub clusters: Vec<(Vec<usize>, Vec<usize>)>,
    /// Indices of constraints that span multiple clusters (bridges).
    pub bridge_indices: Vec<usize>,
    /// Total number of line-connected components found (for diagnostics).
    pub total_components: usize,
    /// Sizes of all components found (sorted descending, for diagnostics).
    pub component_sizes: Vec<usize>,
}

/// Collect all point indices that a constraint references (directly or through lines).
fn constraint_point_indices(
    c: &Constraint,
    pt_idx: &HashMap<&str, usize>,
    line_map: &HashMap<&str, &Line>,
    _shape_map: &HashMap<&str, &Shape>,
) -> Vec<usize> {
    let mut out = Vec::new();

    // Inline helpers avoid borrow-checker issues with closures.
    macro_rules! push_pt {
        ($id:expr) => { if let Some(&i) = pt_idx.get($id.as_str()) { out.push(i); } };
    }
    macro_rules! push_line {
        ($lid:expr) => {
            if let Some(l) = line_map.get($lid.as_str()) {
                if let Some(&i) = pt_idx.get(l.a.as_str()) { out.push(i); }
                if let Some(&i) = pt_idx.get(l.b.as_str()) { out.push(i); }
            }
        };
    }

    match c {
        Constraint::Coincident { a, b, .. } => { push_pt!(a); push_pt!(b); }
        Constraint::Horizontal { line, .. } | Constraint::Vertical { line, .. }
        | Constraint::Length { line, .. } | Constraint::AbsoluteAngle { line, .. } => {
            push_line!(line);
        }
        Constraint::Parallel { a, b, .. } | Constraint::Perpendicular { a, b, .. }
        | Constraint::Equal { a, b, .. } | Constraint::Angle { a, b, .. }
        | Constraint::LineDistance { a, b, .. } | Constraint::AngleBetween { a, b, .. }
        | Constraint::SameDirection { a, b, .. } | Constraint::OppositeDirection { a, b, .. } => {
            push_line!(a); push_line!(b);
        }
        Constraint::Symmetric { a, b, axis, .. } => {
            push_pt!(a); push_pt!(b); push_line!(axis);
        }
        Constraint::Concentric { .. } | Constraint::EqualRadius { .. } => {
            // Circle/arc-only — no point references for line-based decomposition.
        }
        Constraint::Collinear { point, line, .. }
        | Constraint::Midpoint { point, line, .. }
        | Constraint::PointOnLine { point, line, .. }
        | Constraint::PointLineDistance { point, line, .. } => {
            push_pt!(point); push_line!(line);
        }
        Constraint::Fixed { point, .. } => { push_pt!(point); }
        Constraint::PointOnCircle { point, .. } => { push_pt!(point); }
        Constraint::Distance { a, b, .. } | Constraint::HDistance { a, b, .. }
        | Constraint::VDistance { a, b, .. } | Constraint::ShapeEqualCentroid { a, b, .. } => {
            push_pt!(a); push_pt!(b);
        }
        Constraint::Radius { .. } | Constraint::Diameter { .. }
        | Constraint::ArcLength { .. } => {
            // Circle/arc-only — no point references.
        }
        Constraint::Tangent { line, .. } => {
            if let Some(lid) = line { push_line!(lid); }
        }
        Constraint::LineTangentArc { line, .. } => {
            push_line!(line);
        }
        Constraint::ShapeCentroidX { .. } | Constraint::ShapeCentroidY { .. }
        | Constraint::ShapeWidth { .. } | Constraint::ShapeHeight { .. }
        | Constraint::ShapeArea { .. } => {
            // Shape constraints — treated as bridges for line-based decomposition.
        }
        Constraint::Ccw { points: pts, .. } => {
            for p in pts { push_pt!(p); }
        }
        Constraint::BlockRotation { points: pts, .. } => {
            // axis is "x" or "y" (not a point ID), only points matter.
            for p in pts { push_pt!(p); }
        }
    }

    out
}

/// Classify constraints into per-cluster internal constraints and bridge constraints.
///
/// Uses line-based union-find (same as `detect_subgraphs`) to identify connected
/// components of non-fixed, non-group-owned points. A constraint is "internal" to
/// a cluster if all its referenced points belong to that cluster. Otherwise it's a bridge.
///
/// Only returns clusters with ≥4 points (minimum for profitable group creation).
pub fn classify_constraints(
    points: &[Point],
    lines: &[Line],
    shapes: &[Shape],
    constraints: &[Constraint],
    existing_groups: &[SketchGroup],
) -> ConstraintClassification {
    if points.is_empty() {
        return ConstraintClassification { clusters: vec![], bridge_indices: vec![], total_components: 0, component_sizes: vec![] };
    }

    let n = points.len();
    let pt_idx: HashMap<&str, usize> = points.iter().enumerate()
        .map(|(i, p)| (p.id.as_str(), i))
        .collect();
    let line_map: HashMap<&str, &Line> = lines.iter()
        .map(|l| (l.id.as_str(), l))
        .collect();
    let shape_map: HashMap<&str, &Shape> = shapes.iter()
        .map(|s| (s.id.as_str(), s))
        .collect();

    // Set of point IDs already owned by existing groups.
    let group_owned: HashSet<&str> = existing_groups.iter()
        .flat_map(|g| g.points.iter().map(|lp| lp.id.as_str()))
        .collect();

    // Union-find over points — connect via lines only.
    let mut parent: Vec<usize> = (0..n).collect();
    let mut rank: Vec<usize> = vec![0; n];

    fn uf_find_local(parent: &mut [usize], x: usize) -> usize {
        if parent[x] != x {
            parent[x] = uf_find_local(parent, parent[x]);
        }
        parent[x]
    }
    fn uf_union_local(parent: &mut [usize], rank: &mut [usize], a: usize, b: usize) {
        let ra = uf_find_local(parent, a);
        let rb = uf_find_local(parent, b);
        if ra == rb { return; }
        match rank[ra].cmp(&rank[rb]) {
            std::cmp::Ordering::Less => parent[ra] = rb,
            std::cmp::Ordering::Greater => parent[rb] = ra,
            std::cmp::Ordering::Equal => { parent[rb] = ra; rank[ra] += 1; }
        }
    }

    for line in lines {
        if let (Some(&ai), Some(&bi)) = (pt_idx.get(line.a.as_str()), pt_idx.get(line.b.as_str())) {
            uf_union_local(&mut parent, &mut rank, ai, bi);
        }
    }

    // Group non-fixed, non-group-owned points by component root.
    let mut components: HashMap<usize, Vec<usize>> = HashMap::new();
    for i in 0..n {
        if points[i].fixed || group_owned.contains(points[i].id.as_str()) {
            continue;
        }
        let root = uf_find_local(&mut parent, i);
        components.entry(root).or_default().push(i);
    }

    let total_components = components.len();
    let mut component_sizes: Vec<usize> = components.values().map(|v| v.len()).collect();
    component_sizes.sort_unstable();
    component_sizes.reverse();

    // Filter to components with ≥4 points (minimum for profitable grouping).
    let large_components: Vec<(usize, Vec<usize>)> = components.into_iter()
        .filter(|(_, members)| members.len() >= 4)
        .collect();

    if large_components.len() < 2 {
        // Need at least 2 clusters for bottom-up to be worthwhile.
        return ConstraintClassification {
            clusters: vec![], bridge_indices: vec![],
            total_components, component_sizes,
        };
    }

    // Build point-index → cluster-index mapping.
    let mut point_to_cluster: HashMap<usize, usize> = HashMap::new();
    for (ci, (_, members)) in large_components.iter().enumerate() {
        for &pi in members {
            point_to_cluster.insert(pi, ci);
        }
    }

    // Classify each constraint.
    let mut cluster_constraints: Vec<Vec<usize>> = vec![vec![]; large_components.len()];
    let mut bridge_indices = Vec::new();

    for (ci, c) in constraints.iter().enumerate() {
        let pts = constraint_point_indices(c, &pt_idx, &line_map, &shape_map);
        if pts.is_empty() {
            // No point references (circle/arc-only) — treat as bridge.
            bridge_indices.push(ci);
            continue;
        }

        // Find which cluster(s) this constraint's points belong to.
        let mut cluster_id: Option<usize> = None;
        let mut is_bridge = false;
        for &pi in &pts {
            match point_to_cluster.get(&pi) {
                Some(&cid) => {
                    if let Some(prev) = cluster_id {
                        if prev != cid {
                            is_bridge = true;
                            break;
                        }
                    } else {
                        cluster_id = Some(cid);
                    }
                }
                None => {
                    // Point not in any large cluster (fixed, group-owned, or small component).
                    is_bridge = true;
                    break;
                }
            }
        }

        if is_bridge {
            bridge_indices.push(ci);
        } else if let Some(cid) = cluster_id {
            cluster_constraints[cid].push(ci);
        } else {
            bridge_indices.push(ci);
        }
    }

    let clusters = large_components.into_iter().enumerate()
        .map(|(ci, (_, members))| (members, cluster_constraints[ci].clone()))
        .collect();

    ConstraintClassification {
        clusters,
        bridge_indices,
        total_components,
        component_sizes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Point;

    fn pt(id: &str, x: f64, y: f64) -> Point {
        Point { id: id.to_string(), x, y, fixed: false }
    }

    fn ln(id: &str, a: &str, b: &str) -> Line {
        Line { id: id.to_string(), a: a.to_string(), b: b.to_string() }
    }

    #[test]
    fn rect_detected_as_parameterized_group() {
        let points = vec![
            pt("bl", 0.0, 0.0),
            pt("br", 10.0, 0.0),
            pt("tr", 10.0, 5.0),
            pt("tl", 0.0, 5.0),
        ];
        let lines = vec![
            ln("bottom", "bl", "br"),
            ln("right", "br", "tr"),
            ln("top", "tr", "tl"),
            ln("left", "tl", "bl"),
        ];
        let constraints = vec![
            Constraint::Horizontal { id: "h1".into(), line: "bottom".into() },
            Constraint::Horizontal { id: "h2".into(), line: "top".into() },
            Constraint::Vertical { id: "v1".into(), line: "right".into() },
            Constraint::Vertical { id: "v2".into(), line: "left".into() },
        ];

        let coord_red = super::super::coord_reduction::build_coord_reduction(&points, &lines, &constraints);
        let result = detect_subgraphs(&points, &lines, &constraints, &[], &coord_red);

        assert_eq!(result.new_groups.len(), 1, "should detect one group");
        let g = &result.new_groups[0];
        assert_eq!(g.points.len(), 4, "group should have 4 points");
        assert!(g.fixed_rotation, "rotation should be locked (all H/V)");
        // 4 points → 8 DOF total. 4 unique coords (left_x, right_x, bottom_y, top_y).
        // Frame = 2 (rotation locked). Internal = 4 - 2 = 2 params.
        // With anchor absorption: 2 unique x - 1 anchor + 2 unique y - 1 anchor = 2 params.
        assert_eq!(g.params.len(), 2, "should have 2 params (1 x-param + 1 y-param after anchor absorption)");
        // Vars saved: 8 - 2 - 4 = 2
        assert!(result.absorbed_constraint_indices.len() >= 4, "all H/V constraints absorbed");
    }

    #[test]
    fn three_points_not_grouped() {
        let points = vec![
            pt("a", 0.0, 0.0),
            pt("b", 5.0, 0.0),
            pt("c", 5.0, 5.0),
        ];
        let lines = vec![
            ln("l1", "a", "b"),
            ln("l2", "b", "c"),
        ];
        let constraints = vec![
            Constraint::Horizontal { id: "h1".into(), line: "l1".into() },
            Constraint::Vertical { id: "v1".into(), line: "l2".into() },
        ];

        let coord_red = super::super::coord_reduction::build_coord_reduction(&points, &lines, &constraints);
        let result = detect_subgraphs(&points, &lines, &constraints, &[], &coord_red);
        assert_eq!(result.new_groups.len(), 0, "3 points should not be grouped");
    }

    #[test]
    fn two_rects_connected_by_bridge_detected_separately() {
        // Simulate two rects connected by attachCentered:
        // Rect A: 4 corners + 4 edges + diagonal
        // Rect B: 4 corners + 4 edges + diagonal
        // Bridge: mid1 + mid2 + bridge line
        // Midpoint constraints connect mid1→rectA edge, mid2→rectB edge
        let points = vec![
            // Rect A corners
            pt("a_bl", 0.0, 0.0),   // 0
            pt("a_br", 10.0, 0.0),  // 1
            pt("a_tr", 10.0, 5.0),  // 2
            pt("a_tl", 0.0, 5.0),   // 3
            // Rect B corners
            pt("b_bl", 20.0, 0.0),  // 4
            pt("b_br", 30.0, 0.0),  // 5
            pt("b_tr", 30.0, 5.0),  // 6
            pt("b_tl", 20.0, 5.0),  // 7
            // Bridge midpoints
            pt("mid1", 10.0, 2.5),  // 8
            pt("mid2", 20.0, 2.5),  // 9
        ];
        let lines = vec![
            // Rect A
            ln("a_bottom", "a_bl", "a_br"),
            ln("a_right", "a_br", "a_tr"),
            ln("a_top", "a_tr", "a_tl"),
            ln("a_left", "a_tl", "a_bl"),
            // Rect B
            ln("b_bottom", "b_bl", "b_br"),
            ln("b_right", "b_br", "b_tr"),
            ln("b_top", "b_tr", "b_tl"),
            ln("b_left", "b_tl", "b_bl"),
            // Bridge line connecting the two midpoints
            ln("bridge", "mid1", "mid2"),
        ];
        let constraints = vec![
            // Rect A structural
            Constraint::Horizontal { id: "ah1".into(), line: "a_bottom".into() },
            Constraint::Horizontal { id: "ah2".into(), line: "a_top".into() },
            Constraint::Vertical { id: "av1".into(), line: "a_right".into() },
            Constraint::Vertical { id: "av2".into(), line: "a_left".into() },
            // Rect B structural
            Constraint::Horizontal { id: "bh1".into(), line: "b_bottom".into() },
            Constraint::Horizontal { id: "bh2".into(), line: "b_top".into() },
            Constraint::Vertical { id: "bv1".into(), line: "b_right".into() },
            Constraint::Vertical { id: "bv2".into(), line: "b_left".into() },
            // Bridge constraints (cross-shape)
            Constraint::Midpoint { id: "mp1".into(), point: "mid1".into(), line: "a_right".into() },
            Constraint::Midpoint { id: "mp2".into(), point: "mid2".into(), line: "b_left".into() },
            Constraint::Horizontal { id: "bh".into(), line: "bridge".into() },
        ];

        let coord_red = super::super::coord_reduction::build_coord_reduction(&points, &lines, &constraints);
        let result = detect_subgraphs(&points, &lines, &constraints, &[], &coord_red);

        assert_eq!(result.new_groups.len(), 2, "should detect two separate groups (one per rect)");
        for g in &result.new_groups {
            assert_eq!(g.points.len(), 4, "each group should have 4 corner points");
            assert!(g.fixed_rotation, "rotation should be locked");
        }
        // Bridge midpoints and bridge line should NOT be in any group.
        let all_group_point_ids: HashSet<&str> = result.new_groups.iter()
            .flat_map(|g| g.points.iter().map(|p| p.id.as_str()))
            .collect();
        assert!(!all_group_point_ids.contains("mid1"), "bridge point mid1 should not be grouped");
        assert!(!all_group_point_ids.contains("mid2"), "bridge point mid2 should not be grouped");
    }

    #[test]
    fn existing_group_points_excluded() {
        let points = vec![
            pt("bl", 0.0, 0.0),
            pt("br", 10.0, 0.0),
            pt("tr", 10.0, 5.0),
            pt("tl", 0.0, 5.0),
        ];
        let lines = vec![
            ln("bottom", "bl", "br"),
            ln("right", "br", "tr"),
            ln("top", "tr", "tl"),
            ln("left", "tl", "bl"),
        ];
        let constraints = vec![
            Constraint::Horizontal { id: "h1".into(), line: "bottom".into() },
            Constraint::Horizontal { id: "h2".into(), line: "top".into() },
            Constraint::Vertical { id: "v1".into(), line: "right".into() },
            Constraint::Vertical { id: "v2".into(), line: "left".into() },
        ];

        // Pretend an existing group owns these points.
        let existing = vec![SketchGroup {
            id: "existing".into(),
            x: 5.0, y: 2.5, theta: 0.0,
            fixed: false, fixed_rotation: true,
            points: vec![
                LocalPoint { id: "bl".into(), lx: -5.0, ly: -2.5 },
                LocalPoint { id: "br".into(), lx: 5.0, ly: -2.5 },
                LocalPoint { id: "tr".into(), lx: 5.0, ly: 2.5 },
                LocalPoint { id: "tl".into(), lx: -5.0, ly: 2.5 },
            ],
            lines: vec![],
            params: vec![],
            param_point_map: vec![],
            auto_detected: false,
        }];

        let coord_red = super::super::coord_reduction::build_coord_reduction(&points, &lines, &constraints);
        let result = detect_subgraphs(&points, &lines, &constraints, &existing, &coord_red);
        assert_eq!(result.new_groups.len(), 0, "already-grouped points should be skipped");
    }

    #[test]
    fn classify_two_rects_finds_two_clusters() {
        let points = vec![
            // Rect A corners
            pt("a_bl", 0.0, 0.0),   // 0
            pt("a_br", 10.0, 0.0),  // 1
            pt("a_tr", 10.0, 5.0),  // 2
            pt("a_tl", 0.0, 5.0),   // 3
            // Rect B corners
            pt("b_bl", 20.0, 0.0),  // 4
            pt("b_br", 30.0, 0.0),  // 5
            pt("b_tr", 30.0, 5.0),  // 6
            pt("b_tl", 20.0, 5.0),  // 7
            // Bridge midpoints
            pt("mid1", 10.0, 2.5),  // 8
            pt("mid2", 20.0, 2.5),  // 9
        ];
        let lines = vec![
            ln("a_bottom", "a_bl", "a_br"),
            ln("a_right", "a_br", "a_tr"),
            ln("a_top", "a_tr", "a_tl"),
            ln("a_left", "a_tl", "a_bl"),
            ln("b_bottom", "b_bl", "b_br"),
            ln("b_right", "b_br", "b_tr"),
            ln("b_top", "b_tr", "b_tl"),
            ln("b_left", "b_tl", "b_bl"),
            ln("bridge", "mid1", "mid2"),
        ];
        let constraints = vec![
            // Rect A structural
            Constraint::Horizontal { id: "ah1".into(), line: "a_bottom".into() },
            Constraint::Horizontal { id: "ah2".into(), line: "a_top".into() },
            Constraint::Vertical { id: "av1".into(), line: "a_right".into() },
            Constraint::Vertical { id: "av2".into(), line: "a_left".into() },
            // Rect B structural
            Constraint::Horizontal { id: "bh1".into(), line: "b_bottom".into() },
            Constraint::Horizontal { id: "bh2".into(), line: "b_top".into() },
            Constraint::Vertical { id: "bv1".into(), line: "b_right".into() },
            Constraint::Vertical { id: "bv2".into(), line: "b_left".into() },
            // Bridge constraints (cross-shape)
            Constraint::Midpoint { id: "mp1".into(), point: "mid1".into(), line: "a_right".into() },
            Constraint::Midpoint { id: "mp2".into(), point: "mid2".into(), line: "b_left".into() },
            Constraint::Horizontal { id: "bh".into(), line: "bridge".into() },
        ];

        let classification = classify_constraints(&points, &lines, &[], &constraints, &[]);
        assert_eq!(classification.clusters.len(), 2,
            "should find 2 clusters (one per rect), got {} clusters",
            classification.clusters.len());

        // Each cluster should have 4 points and 4 internal constraints (H/V).
        for (pts, cis) in &classification.clusters {
            assert_eq!(pts.len(), 4, "each cluster should have 4 points");
            assert_eq!(cis.len(), 4, "each cluster should have 4 internal constraints (H/V)");
        }

        // Bridge constraints: mp1, mp2, and bh (3 total).
        assert_eq!(classification.bridge_indices.len(), 3,
            "should have 3 bridge constraints");
    }

    #[test]
    fn classify_single_cluster_returns_empty() {
        // Spectrometer-like: single component, no profitable decomposition.
        let points = vec![
            pt("a", 0.0, 0.0),
            pt("b", 10.0, 0.0),
            pt("c", 10.0, 5.0),
            pt("d", 0.0, 5.0),
        ];
        let lines = vec![
            ln("l1", "a", "b"),
            ln("l2", "b", "c"),
            ln("l3", "c", "d"),
            ln("l4", "d", "a"),
        ];
        let constraints = vec![
            Constraint::Horizontal { id: "h1".into(), line: "l1".into() },
            Constraint::Vertical { id: "v1".into(), line: "l2".into() },
        ];

        let classification = classify_constraints(&points, &lines, &[], &constraints, &[]);
        // Single cluster → returns empty (not profitable for bottom-up).
        assert_eq!(classification.clusters.len(), 0,
            "single cluster should return empty classification");
    }
}
