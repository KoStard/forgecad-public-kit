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
use crate::types::{Constraint, Line, LocalPoint, ParamCoord, Point, SketchGroup};
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

    // Connect via structural constraints.
    for c in constraints {
        match c {
            Constraint::Coincident { a, b, .. } => {
                if let (Some(&ai), Some(&bi)) = (pt_idx.get(a.as_str()), pt_idx.get(b.as_str())) {
                    uf_union(&mut parent, &mut rank, ai, bi);
                }
            }
            Constraint::PointOnLine { point, line, .. } => {
                if let Some(&pi) = pt_idx.get(point.as_str()) {
                    if let Some(l) = line_map.get(line.as_str()) {
                        if let Some(&ai) = pt_idx.get(l.a.as_str()) {
                            uf_union(&mut parent, &mut rank, pi, ai);
                        }
                    }
                }
            }
            Constraint::Midpoint { point, line, .. } => {
                if let Some(&pi) = pt_idx.get(point.as_str()) {
                    if let Some(l) = line_map.get(line.as_str()) {
                        if let Some(&ai) = pt_idx.get(l.a.as_str()) {
                            uf_union(&mut parent, &mut rank, pi, ai);
                        }
                    }
                }
            }
            _ => {}
        }
    }

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
        let internal_dof = if unique_coords > frame_dof { unique_coords - frame_dof } else { 0 };
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

        // Map representative → param index.
        // For frame DOF, we subtract the centroid from each param value.
        // If rotation is locked, params are just the unique local coordinates.
        // If rotation is free, the first edge direction is the frame angle, and params are local coords.

        // For the axis-aligned (rotation_locked) case:
        // - unique x-representatives form x-params (local x = param - centroid_x_component)
        // - unique y-representatives form y-params (local y = param - centroid_y_component)
        // For general rotation:
        // - params are the local coordinates of each unique representative

        let n_x_params = repr_x_sorted.len();
        // Param layout: [x_param_0, x_param_1, ..., y_param_0, y_param_1, ...]
        let repr_x_to_param: HashMap<usize, usize> = repr_x_sorted.iter().enumerate()
            .map(|(pi, &repr)| (repr, pi))
            .collect();
        let repr_y_to_param: HashMap<usize, usize> = repr_y_sorted.iter().enumerate()
            .map(|(pi, &repr)| (repr, pi + n_x_params))
            .collect();

        // Build param values from local coordinates.
        let mut params = vec![0.0f64; n_x_params + repr_y_sorted.len()];
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

            let lx_expr = if let Some(&pi) = repr_x_to_param.get(&repr_x) {
                // Check if the point's local x equals the param value or has an offset.
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

            let ly_expr = if let Some(&pi) = repr_y_to_param.get(&repr_y) {
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
                Constraint::BlockRotation { points: pts, axis, .. } => {
                    let pts_in = pts.iter().all(|p| member_ids.contains(p.as_str()));
                    let axis_in = member_ids.contains(axis.as_str());
                    pts_in && axis_in
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
        assert_eq!(g.params.len(), 4, "should have 4 params (2 unique x + 2 unique y)");
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
}
