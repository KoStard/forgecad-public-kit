use std::collections::{HashMap, HashSet};
use std::cell::RefCell;
use crate::constraints::{constraint_jacobian_impl, evaluate_residuals};
use crate::types::{Arc, Circle, Constraint, Line, Point, Shape, SketchGroup, SolveTrailStep};
use super::linear::solve_linear;
use super::resolve_group_points;
use super::reconstruction::ReconstructionGraph;
use super::profiler;

// ─── Solve trail (thread-local accumulator) ──────────────────────────────────

thread_local! {
    static SOLVE_TRAIL: RefCell<Vec<SolveTrailStep>> = RefCell::new(Vec::new());
}

pub fn trail_push(phase: &str, error: f64) {
    SOLVE_TRAIL.with(|t| t.borrow_mut().push(SolveTrailStep {
        phase: phase.to_string(),
        error,
    }));
}

pub fn trail_reset() {
    SOLVE_TRAIL.with(|t| t.borrow_mut().clear());
}

pub fn trail_take() -> Vec<SolveTrailStep> {
    SOLVE_TRAIL.with(|t| std::mem::take(&mut *t.borrow_mut()))
}

// ─── Variable abstraction ─────────────────────────────────────────────────────

/// A solver variable: index into the flat state vector, with physical scale and entity id.
pub struct Variable {
    pub entity_id: String,
    pub scale: f64,
}

/// Build the variable list and extract initial state.
/// Per-point variable index pair: x and y can be independently present or absent.
#[derive(Clone, Copy)]
struct PtVarIdx {
    x: usize,  // usize::MAX = not a variable (fixed/linked/group-owned)
    y: usize,  // usize::MAX = not a variable
}

impl PtVarIdx {
    fn skip() -> Self { PtVarIdx { x: usize::MAX, y: usize::MAX } }
    fn is_skip(&self) -> bool { self.x == usize::MAX && self.y == usize::MAX }
}

fn build_variables(
    points: &Vec<Point>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    groups: &Vec<SketchGroup>,
    scale: f64,
    graph: &ReconstructionGraph,
    coord_red: Option<&super::coord_reduction::CoordReduction>,
) -> (Vec<Variable>, Vec<PtVarIdx>, Vec<usize>, Vec<usize>, Vec<usize>) {
    // Returns: (vars, point_indices, circle_indices, arc_indices, group_indices)
    // point_indices[i].x → variable index for points[i].x (usize::MAX = skipped)
    // point_indices[i].y → variable index for points[i].y (usize::MAX = skipped)
    let mut vars: Vec<Variable> = Vec::new();
    let mut pt_var_idx: Vec<PtVarIdx> = Vec::new();
    let mut circ_var_idx = Vec::new();
    let mut arc_var_idx = Vec::new();
    let mut group_var_idx = Vec::new();

    // Build set of group-owned point IDs — these are NOT independent solver variables.
    let mut group_owned_points: HashSet<String> = HashSet::new();
    for group in groups {
        for lp in &group.points {
            group_owned_points.insert(lp.id.clone());
        }
    }

    for (i, p) in points.iter().enumerate() {
        // Skip: fixed, group-owned, or reconstructed (determined by constructive geometry).
        if p.fixed || group_owned_points.contains(&p.id) || graph.determined_point_indices.contains(&i) {
            pt_var_idx.push(PtVarIdx::skip());
        } else {
            // Check coordinate reduction: skip linked coordinates.
            let x_linked = coord_red.map_or(false, |cr| cr.x_is_linked(i));
            let y_linked = coord_red.map_or(false, |cr| cr.y_is_linked(i));

            let x_idx = if x_linked { usize::MAX } else {
                let idx = vars.len();
                vars.push(Variable { entity_id: p.id.clone(), scale });
                idx
            };
            let y_idx = if y_linked { usize::MAX } else {
                let idx = vars.len();
                vars.push(Variable { entity_id: p.id.clone(), scale });
                idx
            };
            pt_var_idx.push(PtVarIdx { x: x_idx, y: y_idx });
        }
        let _ = i;
    }

    for c in circles.iter() {
        if c.fixed_radius {
            circ_var_idx.push(usize::MAX);
        } else {
            circ_var_idx.push(vars.len());
            vars.push(Variable { entity_id: c.id.clone(), scale });
        }
    }

    for a in arcs.iter() {
        arc_var_idx.push(vars.len());
        vars.push(Variable { entity_id: a.id.clone(), scale });
    }

    // Group frame + param variables.
    for g in groups.iter() {
        if g.fixed {
            group_var_idx.push(usize::MAX);
        } else {
            group_var_idx.push(vars.len());
            vars.push(Variable { entity_id: g.id.clone(), scale }); // gx
            vars.push(Variable { entity_id: g.id.clone(), scale }); // gy
            if !g.fixed_rotation {
                vars.push(Variable { entity_id: g.id.clone(), scale: 1.0 }); // gθ (radians)
            }
            // Shape parameter variables (parameterized groups).
            for _pi in 0..g.params.len() {
                vars.push(Variable { entity_id: g.id.clone(), scale });
            }
        }
    }

    (vars, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx)
}

fn capture_state(
    points: &Vec<Point>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    groups: &Vec<SketchGroup>,
    pt_var_idx: &Vec<PtVarIdx>,
    circ_var_idx: &Vec<usize>,
    arc_var_idx: &Vec<usize>,
    group_var_idx: &Vec<usize>,
    n_vars: usize,
) -> Vec<f64> {
    let mut state = vec![0.0f64; n_vars];
    for (i, p) in points.iter().enumerate() {
        let pv = &pt_var_idx[i];
        if pv.x != usize::MAX { state[pv.x] = p.x; }
        if pv.y != usize::MAX { state[pv.y] = p.y; }
    }
    for (i, c) in circles.iter().enumerate() {
        let vi = circ_var_idx[i];
        if vi != usize::MAX {
            state[vi] = c.radius;
        }
    }
    for (i, a) in arcs.iter().enumerate() {
        state[arc_var_idx[i]] = a.radius;
    }
    for (i, g) in groups.iter().enumerate() {
        let vi = group_var_idx[i];
        if vi != usize::MAX {
            state[vi] = g.x;
            state[vi + 1] = g.y;
            let mut offset = 2;
            if !g.fixed_rotation {
                state[vi + offset] = g.theta;
                offset += 1;
            }
            for (pi, &pv) in g.params.iter().enumerate() {
                state[vi + offset + pi] = pv;
            }
        }
    }
    state
}

fn apply_state(
    state: &Vec<f64>,
    points: &mut Vec<Point>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    groups: &mut Vec<SketchGroup>,
    pt_var_idx: &Vec<PtVarIdx>,
    circ_var_idx: &Vec<usize>,
    arc_var_idx: &Vec<usize>,
    group_var_idx: &Vec<usize>,
) {
    for (i, p) in points.iter_mut().enumerate() {
        let pv = &pt_var_idx[i];
        if pv.x != usize::MAX { p.x = state[pv.x]; }
        if pv.y != usize::MAX { p.y = state[pv.y]; }
    }
    for (i, c) in circles.iter_mut().enumerate() {
        let vi = circ_var_idx[i];
        if vi != usize::MAX {
            c.radius = state[vi].max(1e-9);
        }
    }
    for (i, a) in arcs.iter_mut().enumerate() {
        a.radius = state[arc_var_idx[i]].max(1e-9);
    }
    for (i, g) in groups.iter_mut().enumerate() {
        let vi = group_var_idx[i];
        if vi != usize::MAX {
            g.x = state[vi];
            g.y = state[vi + 1];
            let mut offset = 2;
            if !g.fixed_rotation {
                g.theta = state[vi + offset];
                offset += 1;
            }
            for pi in 0..g.params.len() {
                g.params[pi] = state[vi + offset + pi];
            }
            g.update_local_coords_from_params();
        }
    }
    // Resolve group-owned points to world coordinates.
    resolve_group_points(points, groups);
}

/// Copy representative coordinate values to linked (slaved) points.
/// Must be called after every apply_state when coord_red is active,
/// otherwise residuals will read stale values for linked coordinates.
fn propagate_coord_links(points: &mut Vec<Point>, coord_red: &super::coord_reduction::CoordReduction) {
    for i in 0..points.len() {
        let rx = coord_red.repr_x[i];
        if rx != i { points[i].x = points[rx].x; }
        let ry = coord_red.repr_y[i];
        if ry != i { points[i].y = points[ry].y; }
    }
}

/// Fast coord link propagation using the prebuilt link map.
fn propagate_coord_links_fast(points: &mut Vec<Point>, link_map: &super::coord_reduction::CoordLinkMap) {
    for (repr_idx, followers) in link_map.x_followers.iter().enumerate() {
        if !followers.is_empty() {
            let val = points[repr_idx].x;
            for &fi in followers { points[fi].x = val; }
        }
    }
    for (repr_idx, followers) in link_map.y_followers.iter().enumerate() {
        if !followers.is_empty() {
            let val = points[repr_idx].y;
            for &fi in followers { points[fi].y = val; }
        }
    }
}

// ─── Reference length ─────────────────────────────────────────────────────────

fn compute_reference_length(points: &Vec<Point>, circles: &Vec<Circle>, arcs: &Vec<Arc>, constraints: &Vec<Constraint>) -> f64 {
    let mut xs: Vec<f64> = points.iter().map(|p| p.x).collect();
    let mut ys: Vec<f64> = points.iter().map(|p| p.y).collect();
    for c in circles {
        xs.push(c.radius);
        xs.push(-c.radius);
        ys.push(c.radius);
        ys.push(-c.radius);
    }
    for a in arcs {
        xs.push(a.radius);
        xs.push(-a.radius);
        ys.push(a.radius);
        ys.push(-a.radius);
    }

    // Include constraint-specified values so the solver knows the scale
    // even when all points start at the origin.
    let mut max_constraint_value: f64 = 0.0;
    for c in constraints {
        let v = match c {
            Constraint::Length { value, .. }
            | Constraint::Distance { value, .. }
            | Constraint::LineDistance { value, .. }
            | Constraint::PointLineDistance { value, .. }
            | Constraint::Radius { value, .. }
            | Constraint::Diameter { value, .. } => value.abs(),
            Constraint::HDistance { value, .. }
            | Constraint::VDistance { value, .. } => value.abs(),
            Constraint::Fixed { x, y, .. } => x.abs().max(y.abs()),
            _ => 0.0,
        };
        if v > max_constraint_value { max_constraint_value = v; }
    }

    if xs.is_empty() && max_constraint_value < 1e-9 {
        return 1.0;
    }
    let span_x = xs.iter().cloned().fold(f64::NEG_INFINITY, f64::max)
        - xs.iter().cloned().fold(f64::INFINITY, f64::min);
    let span_y = ys.iter().cloned().fold(f64::NEG_INFINITY, f64::max)
        - ys.iter().cloned().fold(f64::INFINITY, f64::min);
    span_x.hypot(span_y).max(max_constraint_value).max(1.0)
}

// ─── Residual evaluation (including arc consistency) ─────────────────────────

fn eval_residuals_full(
    points: &Vec<Point>,
    lines: &Vec<Line>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
) -> Option<(Vec<f64>, f64)> {
    let mut vals = evaluate_residuals(points, lines, circles, arcs, shapes, constraints);

    // Arc consistency equations.
    let pts_map: HashMap<&str, &Point> = points.iter().map(|p| (p.id.as_str(), p)).collect();
    for arc in arcs {
        if let (Some(center), Some(start), Some(end)) = (
            pts_map.get(arc.center.as_str()),
            pts_map.get(arc.start.as_str()),
            pts_map.get(arc.end.as_str()),
        ) {
            let r0 = (start.x - center.x).hypot(start.y - center.y) - arc.radius;
            let r1 = (end.x - center.x).hypot(end.y - center.y) - arc.radius;
            vals.push(r0);
            vals.push(r1);
        }
    }

    if vals.iter().any(|value| !value.is_finite()) {
        return None;
    }

    let max_abs = vals.iter().copied().fold(0.0f64, |a, v| a.max(v.abs()));
    if !max_abs.is_finite() {
        return None;
    }
    Some((vals, max_abs))
}

pub fn current_max_error(
    points: &Vec<Point>,
    lines: &Vec<Line>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
) -> f64 {
    match eval_residuals_full(points, lines, circles, arcs, shapes, constraints) {
        Some((_, max_abs)) => max_abs,
        None => f64::INFINITY,
    }
}

// ─── Sparsity map ─────────────────────────────────────────────────────────────

struct SparsityMap {
    /// Per variable: which constraint residual ranges it affects.
    var_to_constraint_rows: Vec<Vec<(usize, usize)>>, // (start_row, row_count)
    /// Per variable: which arc consistency rows it affects.
    var_to_arc_rows: Vec<Vec<usize>>,
    arc_row_start: usize,
    /// Set of variable column indices that are group frame variables.
    group_var_cols: HashSet<usize>,
    /// Set of variable column indices that affect reconstructed points
    /// (require calling reconstruct() during FD).
    reconstruction_var_cols: HashSet<usize>,
    /// Per constraint: (row_start, row_count). Avoids re-evaluating residuals just for row layout.
    constraint_row_layout: Vec<(usize, usize)>,
    /// row_start → constraint_index for O(1) lookup in FD loop.
    row_to_constraint: HashMap<usize, usize>,
}

fn build_sparsity(
    points: &Vec<Point>,
    lines: &Vec<Line>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    groups: &Vec<SketchGroup>,
    vars: &Vec<Variable>,
    pt_var_idx: &Vec<PtVarIdx>,
    circ_var_idx: &Vec<usize>,
    arc_var_idx: &Vec<usize>,
    group_var_idx: &Vec<usize>,
    graph: &ReconstructionGraph,
    coord_red: Option<&super::coord_reduction::CoordReduction>,
) -> (SparsityMap, usize) {
    let n_vars = vars.len();

    // Build set of group-owned point IDs and map them to their group's variable indices.
    let mut group_point_to_group_idx: HashMap<String, usize> = HashMap::new();
    for (gi, group) in groups.iter().enumerate() {
        for lp in &group.points {
            group_point_to_group_idx.insert(lp.id.clone(), gi);
        }
    }

    // Build the set of all group variable columns (frame + params).
    let mut group_var_cols: HashSet<usize> = HashSet::new();
    for (gi, g) in groups.iter().enumerate() {
        let vi = group_var_idx[gi];
        if vi != usize::MAX {
            group_var_cols.insert(vi);     // gx
            group_var_cols.insert(vi + 1); // gy
            let mut offset = 2;
            if !g.fixed_rotation {
                group_var_cols.insert(vi + offset); // gθ
                offset += 1;
            }
            for pi in 0..g.params.len() {
                group_var_cols.insert(vi + offset + pi); // param
            }
        }
    }

    // Map entity_id → variable indices it contributes.
    let mut entity_to_vars: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, p) in points.iter().enumerate() {
        let pv = &pt_var_idx[i];
        // Check if this point has any own variables OR linked coordinates.
        let has_own_vars = pv.x != usize::MAX || pv.y != usize::MAX;
        let has_linked_coords = coord_red.map_or(false, |cr| cr.x_is_linked(i) || cr.y_is_linked(i));

        if has_own_vars || has_linked_coords {
            let entry = entity_to_vars.entry(p.id.clone()).or_default();
            // Add own variables.
            if pv.x != usize::MAX { entry.push(pv.x); }
            if pv.y != usize::MAX { entry.push(pv.y); }
            // For linked coordinates, add the representative's variable.
            if let Some(cr) = coord_red {
                if cr.x_is_linked(i) {
                    let repr_pv = &pt_var_idx[cr.repr_x[i]];
                    if repr_pv.x != usize::MAX { entry.push(repr_pv.x); }
                }
                if cr.y_is_linked(i) {
                    let repr_pv = &pt_var_idx[cr.repr_y[i]];
                    if repr_pv.y != usize::MAX { entry.push(repr_pv.y); }
                }
            }
        } else if let Some(&gi) = group_point_to_group_idx.get(&p.id) {
            // Group-owned point — maps to the group's frame + param variables.
            let gvi = group_var_idx[gi];
            if gvi != usize::MAX {
                let entry = entity_to_vars.entry(p.id.clone()).or_default();
                entry.push(gvi);     // gx
                entry.push(gvi + 1); // gy
                let mut offset = 2;
                if !groups[gi].fixed_rotation {
                    entry.push(gvi + offset); // gθ
                    offset += 1;
                }
                for pi in 0..groups[gi].params.len() {
                    entry.push(gvi + offset + pi); // param
                }
            }
        }
        // Reconstructed point routing is done below after entity_to_vars is populated.
    }

    // Route reconstructed points to the variables of the points they depend on.
    // This must happen after the initial entity_to_vars population so that
    // transitive dependencies through other free points are already registered.
    let dep_map = graph.dependency_point_indices();
    let mut reconstruction_var_cols: HashSet<usize> = HashSet::new();
    for (&recon_idx, dep_indices) in &dep_map {
        let recon_id = points[recon_idx].id.clone();
        let mut dep_vars: Vec<usize> = Vec::new();
        for &dep_idx in dep_indices {
            let dep_id = &points[dep_idx].id;
            if let Some(vars) = entity_to_vars.get(dep_id.as_str()) {
                dep_vars.extend(vars);
            }
        }
        dep_vars.sort();
        dep_vars.dedup();
        for &vi in &dep_vars {
            reconstruction_var_cols.insert(vi);
        }
        entity_to_vars.insert(recon_id, dep_vars);
    }
    for (i, c) in circles.iter().enumerate() {
        let vi = circ_var_idx[i];
        if vi != usize::MAX {
            entity_to_vars.entry(c.id.clone()).or_default().push(vi);
        }
    }
    for (i, a) in arcs.iter().enumerate() {
        entity_to_vars.entry(a.id.clone()).or_default().push(arc_var_idx[i]);
    }

    // Build lines/circles/arcs/shapes lookup for entity expansion.
    let lines_map: HashMap<&str, &Line> = lines.iter().map(|l| (l.id.as_str(), l)).collect();
    let circles_map: HashMap<&str, &Circle> = circles.iter().map(|c| (c.id.as_str(), c)).collect();
    let arcs_map: HashMap<&str, &Arc> = arcs.iter().map(|a| (a.id.as_str(), a)).collect();
    let shapes_map: HashMap<&str, &Shape> = shapes.iter().map(|s| (s.id.as_str(), s)).collect();

    // For each constraint, compute which variable indices it involves.
    let mut constraint_rows: Vec<(usize, usize)> = Vec::new(); // (row_start, count)
    let mut constraint_var_sets: Vec<Vec<usize>> = Vec::new();
    let mut row = 0usize;

    for c in constraints {
        let res = crate::constraints::constraint_residual_impl(
            c, points, lines, circles, arcs, shapes,
        );
        let count = res.len();
        constraint_rows.push((row, count));
        row += count;

        // Expand entity IDs to variable indices.
        let entity_ids = crate::constraints::constraint_entity_ids(c, &lines_map, &circles_map, &arcs_map, &shapes_map);
        let mut var_indices: Vec<usize> = Vec::new();
        for eid in &entity_ids {
            if let Some(vis) = entity_to_vars.get(eid.as_str()) {
                var_indices.extend_from_slice(vis);
            }
        }
        var_indices.sort();
        var_indices.dedup();
        constraint_var_sets.push(var_indices);
    }

    let arc_row_start = row;

    // Invert: var → constraints it affects.
    let mut var_to_constraint_rows: Vec<Vec<(usize, usize)>> = vec![Vec::new(); n_vars];
    for (ci, var_set) in constraint_var_sets.iter().enumerate() {
        for &vi in var_set {
            var_to_constraint_rows[vi].push(constraint_rows[ci]);
        }
    }

    // var → arc consistency rows it affects.
    let mut var_to_arc_rows: Vec<Vec<usize>> = vec![Vec::new(); n_vars];
    for (ai, arc) in arcs.iter().enumerate() {
        let arc_row_0 = arc_row_start + ai * 2;
        let arc_entity_ids = [arc.id.as_str(), arc.center.as_str(), arc.start.as_str(), arc.end.as_str()];
        for eid in arc_entity_ids {
            if let Some(vis) = entity_to_vars.get(eid) {
                for &vi in vis {
                    var_to_arc_rows[vi].push(arc_row_0);
                }
            }
        }
    }
    // De-dup arc row references per variable.
    for rows in var_to_arc_rows.iter_mut() {
        rows.sort();
        rows.dedup();
    }

    // Build row_to_constraint map for O(1) lookup in FD loop.
    let row_to_constraint: HashMap<usize, usize> = constraint_rows.iter().enumerate()
        .filter(|(_, &(_, count))| count > 0)
        .map(|(ci, &(row_start, _))| (row_start, ci))
        .collect();

    (SparsityMap {
        var_to_constraint_rows, var_to_arc_rows, arc_row_start,
        group_var_cols, reconstruction_var_cols,
        constraint_row_layout: constraint_rows,
        row_to_constraint,
    }, arc_row_start + arcs.len() * 2)
}

// ─── Structural info for graph decomposition ─────────────────────────────────

/// Identifies what entity/DOF a variable column represents.
#[derive(Debug, Clone)]
pub enum VarOrigin {
    PointX(usize),   // point index
    PointY(usize),
    CircleR(usize),  // circle index
    ArcR(usize),     // arc index
    GroupX(usize),   // group index
    GroupY(usize),
    GroupTheta(usize),
}

/// Structural information for building the scalar bipartite graph.
pub struct StructuralInfo {
    pub n_vars: usize,
    pub constraint_var_sets: Vec<Vec<usize>>,
    pub constraint_row_ranges: Vec<(usize, usize)>,
    pub arc_var_sets: Vec<Vec<usize>>,
    pub arc_row_start: usize,
    pub var_origins: Vec<VarOrigin>,
}

/// Extract the structural info needed by graph decomposition.
/// This builds the variable list and sparsity map, then extracts the
/// bipartite graph structure without running any LM iterations.
pub fn extract_structural_info(
    points: &Vec<Point>,
    lines: &Vec<Line>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    groups: &Vec<SketchGroup>,
    graph: &ReconstructionGraph,
) -> StructuralInfo {
    let ref_len = compute_reference_length(points, circles, arcs, constraints);
    let scale = ref_len.max(1.0);

    let (vars, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx) =
        build_variables(points, circles, arcs, groups, scale, graph, None);

    let n_vars = vars.len();

    // Build var_origins: what entity/DOF each variable column represents.
    let mut var_origins: Vec<VarOrigin> = vec![VarOrigin::PointX(0); n_vars];
    for (i, _p) in points.iter().enumerate() {
        let pv = &pt_var_idx[i];
        if pv.x != usize::MAX { var_origins[pv.x] = VarOrigin::PointX(i); }
        if pv.y != usize::MAX { var_origins[pv.y] = VarOrigin::PointY(i); }
    }
    for (i, _c) in circles.iter().enumerate() {
        let vi = circ_var_idx[i];
        if vi != usize::MAX {
            var_origins[vi] = VarOrigin::CircleR(i);
        }
    }
    for (i, _a) in arcs.iter().enumerate() {
        var_origins[arc_var_idx[i]] = VarOrigin::ArcR(i);
    }
    for (i, g) in groups.iter().enumerate() {
        let vi = group_var_idx[i];
        if vi != usize::MAX {
            var_origins[vi] = VarOrigin::GroupX(i);
            var_origins[vi + 1] = VarOrigin::GroupY(i);
            if !g.fixed_rotation {
                var_origins[vi + 2] = VarOrigin::GroupTheta(i);
            }
        }
    }

    // Now build the constraint_var_sets and constraint_row_ranges using the
    // same logic as build_sparsity, but only extracting the structural part.
    let mut group_point_to_group_idx: HashMap<String, usize> = HashMap::new();
    for (gi, group) in groups.iter().enumerate() {
        for lp in &group.points {
            group_point_to_group_idx.insert(lp.id.clone(), gi);
        }
    }

    let mut entity_to_vars: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, p) in points.iter().enumerate() {
        let pv = &pt_var_idx[i];
        if pv.x != usize::MAX || pv.y != usize::MAX {
            let entry = entity_to_vars.entry(p.id.clone()).or_default();
            if pv.x != usize::MAX { entry.push(pv.x); }
            if pv.y != usize::MAX { entry.push(pv.y); }
        } else if let Some(&gi) = group_point_to_group_idx.get(&p.id) {
            let gvi = group_var_idx[gi];
            if gvi != usize::MAX {
                let entry = entity_to_vars.entry(p.id.clone()).or_default();
                entry.push(gvi);
                entry.push(gvi + 1);
                if !groups[gi].fixed_rotation {
                    entry.push(gvi + 2);
                }
            }
        }
    }
    // Route reconstructed points.
    let dep_map = graph.dependency_point_indices();
    for (&recon_idx, dep_indices) in &dep_map {
        let recon_id = points[recon_idx].id.clone();
        let mut dep_vars: Vec<usize> = Vec::new();
        for &dep_idx in dep_indices {
            let dep_id = &points[dep_idx].id;
            if let Some(vars) = entity_to_vars.get(dep_id.as_str()) {
                dep_vars.extend(vars);
            }
        }
        dep_vars.sort();
        dep_vars.dedup();
        entity_to_vars.insert(recon_id, dep_vars);
    }
    for (i, c) in circles.iter().enumerate() {
        let vi = circ_var_idx[i];
        if vi != usize::MAX {
            entity_to_vars.entry(c.id.clone()).or_default().push(vi);
        }
    }
    for (i, a) in arcs.iter().enumerate() {
        entity_to_vars.entry(a.id.clone()).or_default().push(arc_var_idx[i]);
    }

    let lines_map: HashMap<&str, &Line> = lines.iter().map(|l| (l.id.as_str(), l)).collect();
    let circles_map: HashMap<&str, &Circle> = circles.iter().map(|c| (c.id.as_str(), c)).collect();
    let arcs_map: HashMap<&str, &Arc> = arcs.iter().map(|a| (a.id.as_str(), a)).collect();
    let shapes_map: HashMap<&str, &Shape> = shapes.iter().map(|s| (s.id.as_str(), s)).collect();

    let mut constraint_var_sets: Vec<Vec<usize>> = Vec::with_capacity(constraints.len());
    let mut constraint_row_ranges: Vec<(usize, usize)> = Vec::with_capacity(constraints.len());
    let mut row = 0usize;

    for c in constraints {
        let res = crate::constraints::constraint_residual_impl(c, points, lines, circles, arcs, shapes);
        let count = res.len();
        constraint_row_ranges.push((row, count));
        row += count;

        let entity_ids = crate::constraints::constraint_entity_ids(c, &lines_map, &circles_map, &arcs_map, &shapes_map);
        let mut var_indices: Vec<usize> = Vec::new();
        for eid in &entity_ids {
            if let Some(vis) = entity_to_vars.get(eid.as_str()) {
                var_indices.extend_from_slice(vis);
            }
        }
        var_indices.sort();
        var_indices.dedup();
        constraint_var_sets.push(var_indices);
    }

    let arc_row_start = row;

    // Arc var sets.
    let mut arc_var_sets: Vec<Vec<usize>> = Vec::with_capacity(arcs.len());
    for arc in arcs {
        let arc_entity_ids = [arc.id.as_str(), arc.center.as_str(), arc.start.as_str(), arc.end.as_str()];
        let mut vs: Vec<usize> = Vec::new();
        for eid in arc_entity_ids {
            if let Some(vis) = entity_to_vars.get(eid) {
                vs.extend(vis);
            }
        }
        vs.sort();
        vs.dedup();
        arc_var_sets.push(vs);
    }

    StructuralInfo {
        n_vars,
        constraint_var_sets,
        constraint_row_ranges,
        arc_var_sets,
        arc_row_start,
        var_origins,
    }
}

// ─── Jacobian + linearization ─────────────────────────────────────────────────

fn fd_step(value: f64, scale: f64) -> f64 {
    1e-6 * 1.0_f64.max(value.abs()).max(scale)
}

fn linearize(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    groups: &mut Vec<SketchGroup>,
    vars: &Vec<Variable>,
    pt_var_idx: &Vec<PtVarIdx>,
    circ_var_idx: &Vec<usize>,
    arc_var_idx: &Vec<usize>,
    group_var_idx: &Vec<usize>,
    sparsity: &SparsityMap,
    n_rows: usize,
    graph: &ReconstructionGraph,
    link_map: Option<&super::coord_reduction::CoordLinkMap>,
) -> Option<LinearizedSystem> {
    let t_resid = profiler::platform::now_us();
    let (base, max_abs) = eval_residuals_full(points, lines, circles, arcs, shapes, constraints)?;
    profiler::add(|p| p.linearize_residual_us += profiler::platform::now_us() - t_resid);

    let n_vars = vars.len();
    let n_eq = base.len();

    if n_eq != n_rows {
        return None;
    }

    let mut jacobian = vec![vec![0.0f64; n_vars]; n_eq];

    let t_analytic = profiler::platform::now_us();
    let pts_map: HashMap<String, usize> = points.iter().enumerate().map(|(i, p)| (p.id.clone(), i)).collect();
    let circs_map: HashMap<String, usize> = circles.iter().enumerate().map(|(i, c)| (c.id.clone(), i)).collect();
    let arcs_map_idx: HashMap<String, usize> = arcs.iter().enumerate().map(|(i, a)| (a.id.clone(), i)).collect();
    let mut key_to_col: HashMap<String, usize> = HashMap::new();
    for (i, point) in points.iter().enumerate() {
        let pv = &pt_var_idx[i];
        if pv.x != usize::MAX { key_to_col.insert(format!("{}.x", point.id), pv.x); }
        if pv.y != usize::MAX { key_to_col.insert(format!("{}.y", point.id), pv.y); }
    }
    for (i, circle) in circles.iter().enumerate() {
        let vi = circ_var_idx[i];
        if vi != usize::MAX {
            key_to_col.insert(format!("{}.r", circle.id), vi);
        }
    }
    for (i, arc) in arcs.iter().enumerate() {
        key_to_col.insert(format!("{}.r", arc.id), arc_var_idx[i]);
    }

    let mut analytic_rows: HashMap<usize, usize> = HashMap::new();
    static LOGGED_MISSING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    for (ci, constraint) in constraints.iter().enumerate() {
        let (row_start, row_count) = sparsity.constraint_row_layout[ci];
        if row_count == 0 {
            continue;
        }
        if let Some((_residuals, partials)) = constraint_jacobian_impl(
            constraint, points, lines, circles, arcs, shapes,
        ) {
            for (key, derivs) in partials {
                if let Some(&col) = key_to_col.get(&key) {
                    for (r, value) in derivs.iter().enumerate().take(row_count) {
                        jacobian[row_start + r][col] = *value;
                    }
                }
            }
            analytic_rows.insert(row_start, row_count);
        } else if !LOGGED_MISSING.swap(true, std::sync::atomic::Ordering::Relaxed) {
            let mut missing_types: Vec<String> = Vec::new();
            for (ci2, c) in constraints.iter().enumerate() {
                let (_, rc) = sparsity.constraint_row_layout[ci2];
                if rc > 0 && constraint_jacobian_impl(c, points, lines, circles, arcs, shapes).is_none() {
                    let type_name = format!("{:?}", c).split('{').next().unwrap_or("?").trim().to_string();
                    if !missing_types.contains(&type_name) {
                        missing_types.push(type_name);
                    }
                }
            }
            #[cfg(target_arch = "wasm32")]
            {
                use wasm_bindgen::prelude::*;
                #[wasm_bindgen]
                extern "C" {
                    #[wasm_bindgen(js_namespace = console)]
                    fn warn(s: &str);
                }
                warn(&format!("[solver] Constraints without analytic Jacobian: {:?}", missing_types));
            }
        }
    }
    profiler::add(|p| p.linearize_analytic_us += profiler::platform::now_us() - t_analytic);

    // ── Build col → (entity_kind, entity_index, field) for O(1) get/set ──
    // 0=point.x, 1=point.y, 2=circle.r, 3=arc.r, 4=group.x, 5=group.y, 6=group.theta
    let col_to_entity: Vec<(u8, usize)> = {
        let mut map = vec![(255u8, 0usize); n_vars];
        for (i, pv) in pt_var_idx.iter().enumerate() {
            if pv.x != usize::MAX { map[pv.x] = (0, i); }  // point.x
            if pv.y != usize::MAX { map[pv.y] = (1, i); }  // point.y
        }
        for (i, &vi) in circ_var_idx.iter().enumerate() {
            if vi != usize::MAX {
                map[vi] = (2, i);       // circle.r
            }
        }
        for (i, &vi) in arc_var_idx.iter().enumerate() {
            if vi != usize::MAX {
                map[vi] = (3, i);       // arc.r
            }
        }
        for (i, &vi) in group_var_idx.iter().enumerate() {
            if vi != usize::MAX {
                map[vi] = (4, i);       // group.x
                map[vi + 1] = (5, i);   // group.y
                let mut offset = 2;
                if !groups[i].fixed_rotation {
                    map[vi + offset] = (6, i); // group.theta
                    offset += 1;
                }
                // Param vars: kind=7, idx = group_idx * 256 + param_idx
                for pi in 0..groups[i].params.len() {
                    map[vi + offset + pi] = (7, i * 256 + pi);
                }
            }
        }
        map
    };

    let t_fd = profiler::platform::now_us();
    let mut fd_cols_run = 0u32;
    let mut fd_cols_skipped = 0u32;
    for col in 0..n_vars {
        let is_group = sparsity.group_var_cols.contains(&col);

        // Skip FD entirely if all constraint rows for this column have analytics
        // and there are no arc rows to evaluate — the analytic pass already filled them.
        if !is_group {
            let all_analytic = sparsity.var_to_constraint_rows[col]
                .iter()
                .all(|&(row_start, _)| analytic_rows.contains_key(&row_start));
            if all_analytic && sparsity.var_to_arc_rows[col].is_empty() {
                fd_cols_skipped += 1;
                continue;
            }
        }
        fd_cols_run += 1;

        let v = &vars[col];
        let base_val = get_var_fast(col, points, circles, arcs, groups, &col_to_entity);
        let step = fd_step(base_val, v.scale);
        let needs_reconstruct = sparsity.reconstruction_var_cols.contains(&col);

        // Central differences: evaluate at x+h and x-h, derivative = (f(x+h) - f(x-h)) / (2h)
        // Collect forward residuals (x+h).
        set_var_fast(col, base_val + step, points, circles, arcs, groups, &col_to_entity, link_map);
        if is_group { resolve_group_points(points, groups); }
        if needs_reconstruct { super::reconstruction::reconstruct(graph, points, lines, constraints); }

        let mut fwd_constraint_res: Vec<(usize, usize, Vec<f64>)> = Vec::new();
        for &(row_start, row_count) in &sparsity.var_to_constraint_rows[col] {
            if analytic_rows.contains_key(&row_start) && !is_group {
                continue;
            }
            if let Some(&ci) = sparsity.row_to_constraint.get(&row_start) {
                let res = crate::constraints::constraint_residual_impl(
                    &constraints[ci], points, lines, circles, arcs, shapes,
                );
                fwd_constraint_res.push((row_start, row_count, res));
            }
        }

        let mut fwd_arc_res: Vec<(usize, f64, f64)> = Vec::new();
        for &arc_row_0 in &sparsity.var_to_arc_rows[col] {
            let ai = (arc_row_0 - sparsity.arc_row_start) / 2;
            let arc = &arcs[ai];
            let center = pts_map.get(&arc.center).map(|&i| &points[i]);
            let start = pts_map.get(&arc.start).map(|&i| &points[i]);
            let end = pts_map.get(&arc.end).map(|&i| &points[i]);
            if let (Some(center), Some(start), Some(end)) = (center, start, end) {
                let r0 = (start.x - center.x).hypot(start.y - center.y) - arc.radius;
                let r1 = (end.x - center.x).hypot(end.y - center.y) - arc.radius;
                fwd_arc_res.push((arc_row_0, r0, r1));
            }
        }

        // Collect backward residuals (x-h).
        set_var_fast(col, base_val - step, points, circles, arcs, groups, &col_to_entity, link_map);
        if is_group { resolve_group_points(points, groups); }
        if needs_reconstruct { super::reconstruction::reconstruct(graph, points, lines, constraints); }

        let two_h = 2.0 * step;
        let mut bwd_idx = 0usize;
        for &(row_start, row_count) in &sparsity.var_to_constraint_rows[col] {
            if analytic_rows.contains_key(&row_start) && !is_group {
                continue;
            }
            if let Some(&ci) = sparsity.row_to_constraint.get(&row_start) {
                let res = crate::constraints::constraint_residual_impl(
                    &constraints[ci], points, lines, circles, arcs, shapes,
                );
                if bwd_idx < fwd_constraint_res.len() {
                    let (fwd_row_start, fwd_row_count, ref fwd_res) = fwd_constraint_res[bwd_idx];
                    if fwd_row_start == row_start && fwd_row_count == row_count {
                        for r in 0..row_count {
                            if let (Some(fv), Some(bv)) = (fwd_res.get(r), res.get(r)) {
                                jacobian[row_start + r][col] = (fv - bv) / two_h;
                            }
                        }
                    }
                    bwd_idx += 1;
                }
            }
        }

        let mut bwd_arc_idx = 0usize;
        for &arc_row_0 in &sparsity.var_to_arc_rows[col] {
            let ai = (arc_row_0 - sparsity.arc_row_start) / 2;
            let arc = &arcs[ai];
            let center = pts_map.get(&arc.center).map(|&i| &points[i]);
            let start = pts_map.get(&arc.start).map(|&i| &points[i]);
            let end = pts_map.get(&arc.end).map(|&i| &points[i]);
            if let (Some(center), Some(start), Some(end)) = (center, start, end) {
                let r0 = (start.x - center.x).hypot(start.y - center.y) - arc.radius;
                let r1 = (end.x - center.x).hypot(end.y - center.y) - arc.radius;
                if bwd_arc_idx < fwd_arc_res.len() {
                    let (fwd_row, fwd_r0, fwd_r1) = fwd_arc_res[bwd_arc_idx];
                    if fwd_row == arc_row_0 {
                        jacobian[arc_row_0][col] = (fwd_r0 - r0) / two_h;
                        jacobian[arc_row_0 + 1][col] = (fwd_r1 - r1) / two_h;
                    }
                    bwd_arc_idx += 1;
                }
            }
        }

        // Restore original value.
        set_var_fast(col, base_val, points, circles, arcs, groups, &col_to_entity, link_map);
        if is_group { resolve_group_points(points, groups); }
        if needs_reconstruct { super::reconstruction::reconstruct(graph, points, lines, constraints); }

        let _ = (&pts_map, &circs_map, &arcs_map_idx);
    }
    profiler::add(|p| {
        p.linearize_fd_us += profiler::platform::now_us() - t_fd;
        // Encode fd_cols stats in unused fields for debugging
        p.state_capture_count += fd_cols_skipped;
        p.state_apply_count += fd_cols_run;
    });

    if jacobian
        .iter()
        .flat_map(|row| row.iter())
        .any(|value| !value.is_finite())
    {
        return None;
    }

    let weights = compute_row_weights(&jacobian, vars[0].scale.max(1.0));
    if weights.iter().any(|value| !value.is_finite()) {
        return None;
    }
    let weighted_residual: Vec<f64> = base.iter().zip(&weights).map(|(r, w)| r * w).collect();
    let weighted_jacobian: Vec<Vec<f64>> = jacobian
        .iter()
        .zip(&weights)
        .map(|(row, w)| row.iter().map(|v| v * w).collect())
        .collect();
    let weighted_cost: f64 = 0.5 * weighted_residual.iter().map(|v| v * v).sum::<f64>();
    if weighted_residual.iter().any(|value| !value.is_finite())
        || weighted_jacobian
            .iter()
            .flat_map(|row| row.iter())
            .any(|value| !value.is_finite())
        || !weighted_cost.is_finite()
    {
        return None;
    }

    Some(LinearizedSystem {
        residual: base,
        weights,
        weighted_residual,
        weighted_jacobian,
        max_abs,
        weighted_cost,
    })
}

/// Find the constraint index whose rows start at `row_start`.
fn constraint_index_at_row(
    row_start: usize,
    constraints: &Vec<Constraint>,
    points: &Vec<Point>,
    lines: &Vec<Line>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    shapes: &Vec<Shape>,
) -> Option<usize> {
    let mut row = 0usize;
    for (i, c) in constraints.iter().enumerate() {
        if row == row_start {
            return Some(i);
        }
        let res = crate::constraints::constraint_residual_impl(c, points, lines, circles, arcs, shapes);
        row += res.len();
        if row > row_start {
            break;
        }
    }
    None
}

fn get_var(
    col: usize,
    points: &Vec<Point>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    groups: &Vec<SketchGroup>,
    pt_var_idx: &Vec<PtVarIdx>,
    circ_var_idx: &Vec<usize>,
    arc_var_idx: &Vec<usize>,
    group_var_idx: &Vec<usize>,
) -> f64 {
    for (i, p) in points.iter().enumerate() {
        let pv = &pt_var_idx[i];
        if pv.x == col { return p.x; }
        if pv.y == col { return p.y; }
    }
    for (i, c) in circles.iter().enumerate() {
        let vi = circ_var_idx[i];
        if vi == col { return c.radius; }
    }
    for (i, a) in arcs.iter().enumerate() {
        if arc_var_idx[i] == col { return a.radius; }
    }
    for (i, g) in groups.iter().enumerate() {
        let vi = group_var_idx[i];
        if vi == usize::MAX { continue; }
        if vi == col { return g.x; }
        if vi + 1 == col { return g.y; }
        if !g.fixed_rotation && vi + 2 == col { return g.theta; }
    }
    0.0
}

fn set_var(
    col: usize,
    value: f64,
    points: &mut Vec<Point>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    groups: &mut Vec<SketchGroup>,
    pt_var_idx: &Vec<PtVarIdx>,
    circ_var_idx: &Vec<usize>,
    arc_var_idx: &Vec<usize>,
    group_var_idx: &Vec<usize>,
) {
    for (i, p) in points.iter_mut().enumerate() {
        let pv = &pt_var_idx[i];
        if pv.x == col { p.x = value; return; }
        if pv.y == col { p.y = value; return; }
    }
    for (i, c) in circles.iter_mut().enumerate() {
        let vi = circ_var_idx[i];
        if vi == col { c.radius = value.max(1e-9); return; }
    }
    for (i, a) in arcs.iter_mut().enumerate() {
        if arc_var_idx[i] == col { a.radius = value.max(1e-9); return; }
    }
    for (i, g) in groups.iter_mut().enumerate() {
        let vi = group_var_idx[i];
        if vi == usize::MAX { continue; }
        if vi == col { g.x = value; return; }
        if vi + 1 == col { g.y = value; return; }
        if !g.fixed_rotation && vi + 2 == col { g.theta = value; return; }
    }
}

/// O(1) variable access using precomputed col → (kind, entity_index) mapping.
/// Kinds: 0=point.x, 1=point.y, 2=circle.r, 3=arc.r, 4=group.x, 5=group.y, 6=group.theta
#[inline]
fn get_var_fast(
    col: usize,
    points: &[Point],
    circles: &[Circle],
    arcs: &[Arc],
    groups: &[SketchGroup],
    col_to_entity: &[(u8, usize)],
) -> f64 {
    let (kind, idx) = col_to_entity[col];
    match kind {
        0 => points[idx].x,
        1 => points[idx].y,
        2 => circles[idx].radius,
        3 => arcs[idx].radius,
        4 => groups[idx].x,
        5 => groups[idx].y,
        6 => groups[idx].theta,
        7 => {
            let gi = idx / 256;
            let pi = idx % 256;
            groups[gi].params[pi]
        }
        _ => 0.0,
    }
}

#[inline]
fn set_var_fast(
    col: usize,
    value: f64,
    points: &mut [Point],
    circles: &mut [Circle],
    arcs: &mut [Arc],
    groups: &mut [SketchGroup],
    col_to_entity: &[(u8, usize)],
    link_map: Option<&super::coord_reduction::CoordLinkMap>,
) {
    let (kind, idx) = col_to_entity[col];
    match kind {
        0 => {
            points[idx].x = value;
            // Propagate to x-followers.
            if let Some(lm) = link_map {
                for &fi in &lm.x_followers[idx] { points[fi].x = value; }
            }
        }
        1 => {
            points[idx].y = value;
            // Propagate to y-followers.
            if let Some(lm) = link_map {
                for &fi in &lm.y_followers[idx] { points[fi].y = value; }
            }
        }
        2 => circles[idx].radius = value.max(1e-9),
        3 => arcs[idx].radius = value.max(1e-9),
        4 => groups[idx].x = value,
        5 => groups[idx].y = value,
        6 => groups[idx].theta = value,
        7 => {
            let gi = idx / 256;
            let pi = idx % 256;
            groups[gi].params[pi] = value;
            groups[gi].update_local_coords_from_params();
        }
        _ => {}
    }
}

fn compute_row_weights(jacobian: &Vec<Vec<f64>>, reference_length: f64) -> Vec<f64> {
    let min_norm = 1e-9 / reference_length.max(1.0);
    jacobian
        .iter()
        .map(|row| {
            let norm = row.iter().map(|v| v * v).sum::<f64>().sqrt();
            1.0 / norm.max(min_norm)
        })
        .collect()
}

struct LinearizedSystem {
    residual: Vec<f64>,
    weights: Vec<f64>,
    weighted_residual: Vec<f64>,
    weighted_jacobian: Vec<Vec<f64>>,
    max_abs: f64,
    weighted_cost: f64,
}

// ─── Levenberg–Marquardt step ─────────────────────────────────────────────────

struct LmStep {
    dx: Vec<f64>,
    predicted_reduction: f64,
}

fn lm_step(
    wj: &Vec<Vec<f64>>,
    wr: &Vec<f64>,
    lambda: f64,
    prior_offset: Option<&[f64]>,
    prior_diag: f64,
) -> Option<LmStep> {
    let n_eq = wj.len();
    let n_var = if n_eq > 0 { wj[0].len() } else { 0 };
    if n_var == 0 {
        return Some(LmStep { dx: vec![], predicted_reduction: 0.0 });
    }

    let mut jtj = vec![vec![0.0f64; n_var]; n_var];
    let mut jtr = vec![0.0f64; n_var];

    for row in 0..n_eq {
        for i in 0..n_var {
            jtr[i] += wj[row][i] * wr[row];
            for j in 0..=i {
                jtj[i][j] += wj[row][i] * wj[row][j];
            }
        }
    }
    if let Some(offset) = prior_offset {
        for i in 0..n_var {
            jtj[i][i] += prior_diag;
            jtr[i] += prior_diag * offset[i];
        }
    }
    // Symmetrize.
    for i in 0..n_var {
        for j in 0..i {
            jtj[j][i] = jtj[i][j];
        }
    }

    // Damp: A = J^T J + λ·diag(J^T J + ε)
    let mut a = jtj.clone();
    for i in 0..n_var {
        a[i][i] += lambda * (jtj[i][i] + 1e-9);
    }

    let rhs: Vec<f64> = jtr.iter().map(|v| -v).collect();
    let dx = solve_linear(&a, &rhs);
    if dx.iter().any(|value| !value.is_finite()) {
        return None;
    }

    let mut predicted = 0.0f64;
    for i in 0..n_var {
        let mut jtjdx = 0.0;
        for j in 0..n_var {
            jtjdx += jtj[i][j] * dx[j];
        }
        predicted += dx[i] * (-jtr[i] - 0.5 * jtjdx);
    }
    if !predicted.is_finite() {
        return None;
    }

    Some(LmStep { dx, predicted_reduction: predicted })
}

fn scaled_step_norm(dx: &[f64], scale: f64) -> f64 {
    dx.iter().map(|v| (v / scale.max(1e-9)).powi(2)).sum::<f64>().sqrt()
}

fn limit_step(dx: Vec<f64>, scale: f64, max_norm: f64) -> Vec<f64> {
    let norm = scaled_step_norm(&dx, scale);
    if norm <= max_norm || norm < 1e-12 {
        dx
    } else {
        let factor = max_norm / norm;
        dx.into_iter().map(|v| v * factor).collect()
    }
}

fn scaled_state_displacement(state: &[f64], anchor_state: &[f64], scale: f64) -> f64 {
    state
        .iter()
        .zip(anchor_state.iter())
        .map(|(s, a)| ((s - a) / scale.max(1e-9)).powi(2))
        .sum::<f64>()
        .sqrt()
}

// ─── Projector warm-start (GS iterations) ────────────────────────────────────

fn projector_warm_start(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    groups: &mut Vec<SketchGroup>,
    iters: u32,
    tolerance: f64,
) {
    for _ in 0..iters {
        for c in constraints {
            crate::constraints::apply_projector(c, points, lines, circles, arcs, shapes, tolerance);
        }
    }
    // After GS iterations, resolve group points to keep them consistent.
    resolve_group_points(points, groups);
}

// ─── Deterministic restart seeding ───────────────────────────────────────────

fn seed_restart(
    points: &mut Vec<Point>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    groups: &mut Vec<SketchGroup>,
    initial_state: &Vec<f64>,
    pt_var_idx: &Vec<PtVarIdx>,
    circ_var_idx: &Vec<usize>,
    arc_var_idx: &Vec<usize>,
    group_var_idx: &Vec<usize>,
    attempt: u32,
    reference_length: f64,
) {
    apply_state(initial_state, points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx);
    if attempt == 0 {
        return;
    }

    let radius = reference_length * (0.15 + 0.2 * (attempt.min(4) as f64));
    let golden_angle = 2.399963229728653f64;
    let mut point_index = 0usize;

    for p in points.iter_mut() {
        if p.fixed { continue; }
        let angle = (attempt as f64 * 1.37 + point_index as f64) * golden_angle;
        let local_radius = radius * (1.0 + (point_index % 4) as f64 * 0.15);
        p.x += local_radius * angle.cos();
        p.y += local_radius * angle.sin();
        point_index += 1;
    }

    for (i, c) in circles.iter_mut().enumerate() {
        if c.fixed_radius { continue; }
        let scale = 1.0 + 0.1 * (((attempt as usize + i) % 3) as f64 - 1.0);
        c.radius = (c.radius * scale).max(1e-6);
    }

    for (i, a) in arcs.iter_mut().enumerate() {
        let scale = 1.0 + 0.1 * (((attempt as usize + i + 1) % 3) as f64 - 1.0);
        a.radius = (a.radius * scale).max(1e-6);
    }

    // Perturb non-fixed group frames.
    let mut group_index = 0usize;
    for g in groups.iter_mut() {
        if g.fixed { continue; }
        let angle = (attempt as f64 * 1.37 + group_index as f64) * golden_angle;
        let local_radius = radius * (1.0 + (group_index % 4) as f64 * 0.15);
        g.x += local_radius * angle.cos();
        g.y += local_radius * angle.sin();
        group_index += 1;
    }
    // Resolve group-owned points after perturbation.
    resolve_group_points(points, groups);
}

// ─── Null-space restart ───────────────────────────────────────────────────────

fn seed_nullspace_restart(
    points: &mut Vec<Point>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    groups: &mut Vec<SketchGroup>,
    best_state: &Vec<f64>,
    pt_var_idx: &Vec<PtVarIdx>,
    circ_var_idx: &Vec<usize>,
    arc_var_idx: &Vec<usize>,
    group_var_idx: &Vec<usize>,
    nullspace_basis: &Vec<Vec<f64>>,
    attempt: u32,
    reference_length: f64,
) {
    apply_state(best_state, points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx);

    let n = best_state.len();
    let scale = reference_length * 0.2;
    let golden_angle = 2.399963229728653f64;

    // Build a random unit vector in the null space using golden-angle seeded coefficients.
    let k = nullspace_basis.len();
    let mut perturbation = vec![0.0f64; n];
    let mut norm2 = 0.0f64;
    for (i, basis_vec) in nullspace_basis.iter().enumerate() {
        let coeff = ((attempt as f64 * 1.37 + i as f64) * golden_angle).sin();
        for j in 0..n {
            perturbation[j] += coeff * basis_vec[j];
        }
        norm2 += coeff * coeff;
    }

    let norm = norm2.sqrt().max(1e-12);
    let amplitude = scale * (1.0 + 0.3 * (attempt.min(4) as f64));

    // Apply perturbation to state.
    let mut new_state = best_state.clone();
    for j in 0..n {
        new_state[j] += (perturbation[j] / norm) * amplitude;
    }

    apply_state(&new_state, points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx);
}

// ─── Null-space computation ───────────────────────────────────────────────────

/// Compute approximate null-space basis of J^T·J via symmetric eigendecomposition.
/// Returns eigenvectors whose eigenvalues are below `threshold × max_eigenvalue`.
fn compute_nullspace_basis(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    groups: &mut Vec<SketchGroup>,
    vars: &Vec<Variable>,
    pt_var_idx: &Vec<PtVarIdx>,
    circ_var_idx: &Vec<usize>,
    arc_var_idx: &Vec<usize>,
    group_var_idx: &Vec<usize>,
    sparsity: &SparsityMap,
    n_rows: usize,
    graph: &ReconstructionGraph,
) -> Vec<Vec<f64>> {
    let n = vars.len();
    if n == 0 || n > 200 {
        return Vec::new(); // Skip for very large systems.
    }

    let lin = match linearize(
        points, lines, circles, arcs, shapes, constraints, groups,
        vars, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx, sparsity, n_rows, graph, None,
    ) {
        Some(l) => l,
        None => return Vec::new(),
    };

    // Build J^T·J from weighted Jacobian.
    let wj = &lin.weighted_jacobian;
    let n_eq = wj.len();
    let mut jtj = vec![vec![0.0f64; n]; n];
    for row in 0..n_eq {
        for i in 0..n {
            if wj[row][i] == 0.0 { continue; }
            for j in 0..=i {
                jtj[i][j] += wj[row][i] * wj[row][j];
            }
        }
    }
    // Symmetrize.
    for i in 0..n {
        for j in 0..i {
            jtj[j][i] = jtj[i][j];
        }
    }

    // Jacobi eigenvalue algorithm for symmetric matrix.
    let mut a = jtj;
    let mut v = vec![vec![0.0f64; n]; n]; // Eigenvectors as columns.
    for i in 0..n { v[i][i] = 1.0; }

    for _ in 0..100 {
        // Find largest off-diagonal element.
        let mut max_off = 0.0f64;
        let mut p = 0;
        let mut q = 1;
        for i in 0..n {
            for j in (i+1)..n {
                let val = a[i][j].abs();
                if val > max_off {
                    max_off = val;
                    p = i;
                    q = j;
                }
            }
        }
        if max_off < 1e-14 { break; }

        // Compute rotation angle.
        let diff = a[q][q] - a[p][p];
        let t = if diff.abs() < 1e-30 {
            1.0f64
        } else {
            let tau = diff / (2.0 * a[p][q]);
            let sign = if tau >= 0.0 { 1.0 } else { -1.0 };
            sign / (tau.abs() + (1.0 + tau * tau).sqrt())
        };
        let c = 1.0 / (1.0 + t * t).sqrt();
        let s = t * c;

        // Apply rotation to A.
        let app = a[p][p] - t * a[p][q];
        let aqq = a[q][q] + t * a[p][q];
        a[p][p] = app;
        a[q][q] = aqq;
        a[p][q] = 0.0;
        a[q][p] = 0.0;
        for r in 0..n {
            if r == p || r == q { continue; }
            let arp = a[r][p];
            let arq = a[r][q];
            a[r][p] = c * arp - s * arq;
            a[p][r] = a[r][p];
            a[r][q] = s * arp + c * arq;
            a[q][r] = a[r][q];
        }

        // Update eigenvectors.
        for r in 0..n {
            let vrp = v[r][p];
            let vrq = v[r][q];
            v[r][p] = c * vrp - s * vrq;
            v[r][q] = s * vrp + c * vrq;
        }
    }

    // Collect eigenvalues (diagonal of a).
    let eigenvalues: Vec<f64> = (0..n).map(|i| a[i][i].max(0.0)).collect();
    let max_eig = eigenvalues.iter().copied().fold(0.0f64, f64::max);
    if max_eig < 1e-15 { return Vec::new(); }

    let threshold = 1e-6 * max_eig;
    let mut basis = Vec::new();
    for j in 0..n {
        if eigenvalues[j] < threshold {
            let eigvec: Vec<f64> = (0..n).map(|i| v[i][j]).collect();
            let norm = eigvec.iter().map(|x| x * x).sum::<f64>().sqrt();
            if norm > 1e-12 {
                basis.push(eigvec.iter().map(|x| x / norm).collect());
            }
        }
    }

    basis
}

// ─── Main LM outer loop ───────────────────────────────────────────────────────

pub fn solve_global(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    iterations: u32,
    tolerance: f64,
    restarts: u32,
    warm_start_iters: u32,
    max_scaled_step: f64,
    groups: &mut Vec<SketchGroup>,
    graph: &ReconstructionGraph,
    deadline_us: u64,
    coord_red: Option<&super::coord_reduction::CoordReduction>,
) -> f64 {
    let ref_len = compute_reference_length(points, circles, arcs, constraints);
    let scale = ref_len.max(1.0);

    let (vars, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx) = profiler::timed(
        |p, us| p.build_variables_us += us,
        || build_variables(points, circles, arcs, groups, scale, graph, coord_red),
    );

    if vars.is_empty() {
        return match eval_residuals_full(points, lines, circles, arcs, shapes, constraints) {
            Some((_, max_abs)) => max_abs,
            None => 0.0,
        };
    }

    let (sparsity, n_rows) = profiler::timed(
        |p, us| p.build_sparsity_us += us,
        || build_sparsity(
            points, lines, circles, arcs, shapes, constraints, groups,
            &vars, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx,
            graph, coord_red,
        ),
    );

    profiler::add(|p| { p.n_vars = vars.len() as u32; p.n_rows = n_rows as u32; });
    trail_push(&format!("init: vars={} rows={} ref_len={:.2}", vars.len(), n_rows, ref_len), 0.0);

    // Build coord link map for fast FD propagation (if coord_red is active).
    let link_map = coord_red.map(|cr| cr.build_link_map());
    let link_map_ref = link_map.as_ref();

    let initial_state = capture_state(points, circles, arcs, groups, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx, vars.len());
    let mut best_state = initial_state.clone();
    let mut best_error = f64::INFINITY;
    let mut nullspace_basis: Vec<Vec<f64>> = Vec::new();

    for attempt in 0..restarts {
        // Wall-clock timeout: bail out if we've exceeded the deadline.
        if deadline_us > 0 && profiler::platform::now_us() >= deadline_us {
            trail_push("timeout (restart loop)", best_error);
            break;
        }
        profiler::add(|p| p.lm_restarts += 1);

        if attempt > 0 && !nullspace_basis.is_empty() {
            seed_nullspace_restart(
                points, circles, arcs, groups, &best_state,
                &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx,
                &nullspace_basis, attempt, ref_len,
            );
        } else {
            seed_restart(
                points, circles, arcs, groups, &initial_state,
                &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx,
                attempt, ref_len,
            );
        }

        if attempt == 0 {
            let pre_gs_state = capture_state(
                points, circles, arcs, groups,
                &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx, vars.len(),
            );
            let pre_gs_error = current_max_error(points, lines, circles, arcs, shapes, constraints);
            profiler::timed(|p, us| p.gs_warmstart_us += us, || {
                projector_warm_start(points, lines, circles, arcs, shapes, constraints, groups, warm_start_iters, tolerance);
            });
            let mut gs_error = current_max_error(points, lines, circles, arcs, shapes, constraints);
            if gs_error > pre_gs_error {
                apply_state(
                    &pre_gs_state, points, circles, arcs, groups,
                    &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx,
                );
                if !graph.is_empty() {
                    super::reconstruction::reconstruct(graph, points, lines, constraints);
                }
                gs_error = pre_gs_error;
            }
            trail_push("gs-warm", gs_error);
        }
        let pass_anchor_state = capture_state(
            points, circles, arcs, groups,
            &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx, vars.len(),
        );

        let error = run_lm_pass(
            points, lines, circles, arcs, shapes, constraints, groups,
            &vars, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx,
            &sparsity, n_rows, iterations, tolerance, max_scaled_step, scale, &pass_anchor_state,
            graph, deadline_us, link_map_ref,
        );
        trail_push(&format!("lm-pass[{}]", attempt), error);

        if error < best_error {
            best_error = error;
            best_state = capture_state(points, circles, arcs, groups, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx, vars.len());
        }
        if best_error <= tolerance { break; }

        // After the first failed attempt, compute null space at the best state for smarter restarts.
        if attempt == 0 && best_error > tolerance {
            apply_state(&best_state, points, circles, arcs, groups, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx);
            nullspace_basis = compute_nullspace_basis(
                points, lines, circles, arcs, shapes, constraints, groups,
                &vars, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx,
                &sparsity, n_rows, graph,
            );
            trail_push(&format!("nullspace: {} vectors", nullspace_basis.len()), best_error);
        }
    }

    // GS escape: 3 rounds of GS warm-start + another LM pass.
    if best_error > tolerance {
        for gs_round in 0..3u32 {
            if deadline_us > 0 && profiler::platform::now_us() >= deadline_us {
                trail_push("timeout (gs escape)", best_error);
                break;
            }
            profiler::add(|p| p.gs_escape_rounds += 1);
            apply_state(&best_state, points, circles, arcs, groups, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx);
            if !graph.is_empty() { super::reconstruction::reconstruct(graph, points, lines, constraints); }
            let gs_iters = (warm_start_iters * 4).max(30);
            let pre_gs_state = capture_state(
                points, circles, arcs, groups,
                &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx, vars.len(),
            );
            let pre_gs_error = current_max_error(points, lines, circles, arcs, shapes, constraints);
            profiler::timed(|p, us| p.gs_warmstart_us += us, || {
                projector_warm_start(points, lines, circles, arcs, shapes, constraints, groups, gs_iters, tolerance);
            });
            let mut gs_error = current_max_error(points, lines, circles, arcs, shapes, constraints);
            if gs_error > pre_gs_error {
                apply_state(
                    &pre_gs_state, points, circles, arcs, groups,
                    &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx,
                );
                if !graph.is_empty() {
                    super::reconstruction::reconstruct(graph, points, lines, constraints);
                }
                gs_error = pre_gs_error;
            }
            trail_push(&format!("gs-escape[{}] ({}iters)", gs_round, gs_iters), gs_error);

            let pass_anchor_state = capture_state(
                points, circles, arcs, groups,
                &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx, vars.len(),
            );

            let error = run_lm_pass(
                points, lines, circles, arcs, shapes, constraints, groups,
                &vars, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx,
                &sparsity, n_rows, iterations, tolerance, max_scaled_step, scale, &pass_anchor_state,
                graph, deadline_us, link_map_ref,
            );
            trail_push(&format!("lm-escape[{}]", gs_round), error);

            if error < best_error {
                best_error = error;
                best_state = capture_state(points, circles, arcs, groups, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx, vars.len());
            }
            if best_error <= tolerance { break; }
        }
    }

    apply_state(&best_state, points, circles, arcs, groups, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx);
    if let Some(ref lm) = link_map { propagate_coord_links_fast(points, lm); }
    if !graph.is_empty() { super::reconstruction::reconstruct(graph, points, lines, constraints); }
    trail_push("done", best_error);
    best_error
}

fn run_lm_pass(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    groups: &mut Vec<SketchGroup>,
    vars: &Vec<Variable>,
    pt_var_idx: &Vec<PtVarIdx>,
    circ_var_idx: &Vec<usize>,
    arc_var_idx: &Vec<usize>,
    group_var_idx: &Vec<usize>,
    sparsity: &SparsityMap,
    n_rows: usize,
    iterations: u32,
    tolerance: f64,
    max_scaled_step: f64,
    scale: f64,
    anchor_state: &Vec<f64>,
    graph: &ReconstructionGraph,
    deadline_us: u64,
    link_map: Option<&super::coord_reduction::CoordLinkMap>,
) -> f64 {
    let mut lambda = 1e-3f64;
    let mut nu = 2.0f64;
    // Prior regularization disabled — it pulls toward initial geometry which
    // hurts cold-start convergence where the solver needs to move far.
    // The TS solver never had this term and converged fine.
    let prior_diag = 0.0;

    let mut lin = match profiler::timed(|p, us| { p.linearize_us += us; p.linearize_count += 1; }, || {
        linearize(
            points, lines, circles, arcs, shapes, constraints, groups,
            vars, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx, sparsity, n_rows, graph, link_map,
        )
    }) {
        Some(l) => l,
        None => return f64::INFINITY,
    };
    let mut best_pass_state = capture_state(points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx, vars.len());
    let mut best_pass_error = lin.max_abs;
    let mut best_pass_disp = scaled_state_displacement(&best_pass_state, anchor_state, scale);

    for _ in 0..iterations {
        if lin.max_abs <= tolerance { break; }
        if deadline_us > 0 && profiler::platform::now_us() >= deadline_us { break; }
        profiler::add(|p| p.lm_outer_iterations += 1);

        let state = capture_state(points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx, vars.len());
        let prior_offset: Vec<f64> = state.iter().zip(anchor_state.iter()).map(|(s, a)| s - a).collect();

        let step = match profiler::timed(|p, us| { p.lm_step_us += us; p.lm_step_count += 1; }, || {
            lm_step(
                &lin.weighted_jacobian,
                &lin.weighted_residual,
                lambda,
                Some(&prior_offset),
                prior_diag,
            )
        }) {
            Some(s) => s,
            None => break,
        };
        let mut dx = limit_step(step.dx.clone(), scale, max_scaled_step);
        let mut pred = step.predicted_reduction
            * (1.0_f64).min(max_scaled_step / scaled_step_norm(&step.dx, scale).max(max_scaled_step));

        let mut accepted = false;
        let mut local_lambda = lambda;
        let mut local_nu = nu;

        for _ in 0..12 {
            profiler::add(|p| p.lm_inner_retries += 1);

            let trial_state: Vec<f64> = state.iter().zip(&dx).map(|(s, d)| s + d).collect();
            apply_state(&trial_state, points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx);
            if let Some(cr) = link_map { propagate_coord_links_fast(points, cr); }
            if !graph.is_empty() { super::reconstruction::reconstruct(graph, points, lines, constraints); }

            let trial = match profiler::timed(|p, us| { p.linearize_us += us; p.linearize_count += 1; }, || {
                linearize(
                    points, lines, circles, arcs, shapes, constraints, groups,
                    vars, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx, sparsity, n_rows, graph, link_map,
                )
            }) {
                Some(l) => l,
                None => {
                    apply_state(&state, points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx);
                    if !graph.is_empty() { super::reconstruction::reconstruct(graph, points, lines, constraints); }
                    break;
                }
            };

            let actual = lin.weighted_cost - trial.weighted_cost;
            let rho = if pred > 0.0 { actual / pred } else { 0.0 };

            if actual > 0.0 {
                accepted = true;
                profiler::add(|p| p.lm_accepted_steps += 1);
                lambda = if rho > 0.0 {
                    let factor = 1.0 - (2.0 * rho - 1.0).powi(3);
                    local_lambda * (1.0_f64 / 3.0).max(factor)
                } else {
                    local_lambda
                };
                nu = 2.0;
                if trial.max_abs + 1e-9 < best_pass_error {
                    best_pass_error = trial.max_abs;
                    best_pass_state = trial_state.clone();
                }
                lin = trial;
                break;
            }

            apply_state(&state, points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx);
            if !graph.is_empty() { super::reconstruction::reconstruct(graph, points, lines, constraints); }
            local_lambda *= local_nu;
            local_nu *= 2.0;

            let retry = match profiler::timed(|p, us| { p.lm_step_us += us; p.lm_step_count += 1; }, || {
                lm_step(
                    &lin.weighted_jacobian,
                    &lin.weighted_residual,
                    local_lambda,
                    Some(&prior_offset),
                    prior_diag,
                )
            }) {
                Some(s) => s,
                None => break,
            };
            dx = limit_step(retry.dx.clone(), scale, max_scaled_step);
            pred = retry.predicted_reduction
                * (1.0_f64).min(max_scaled_step / scaled_step_norm(&retry.dx, scale).max(max_scaled_step));
        }

        if !accepted {
            lambda *= nu;
            nu *= 2.0;
        }
    }

    apply_state(&best_pass_state, points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx);
    if let Some(lm) = link_map { propagate_coord_links_fast(points, lm); }
    if !graph.is_empty() { super::reconstruction::reconstruct(graph, points, lines, constraints); }

    match eval_residuals_full(points, lines, circles, arcs, shapes, constraints) {
        Some((_, max_abs)) => max_abs,
        None => f64::INFINITY,
    }
}
