use std::collections::{HashMap, HashSet};
use crate::constraints::{constraint_jacobian_impl, evaluate_residuals};
use crate::types::{Arc, Circle, Constraint, Line, Point, Shape, SketchGroup};
use super::linear::solve_linear;
use super::resolve_group_points;

// ─── Variable abstraction ─────────────────────────────────────────────────────

/// A solver variable: index into the flat state vector, with physical scale and entity id.
pub struct Variable {
    pub entity_id: String,
    pub scale: f64,
}

/// Build the variable list and extract initial state.
fn build_variables(
    points: &Vec<Point>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    groups: &Vec<SketchGroup>,
    scale: f64,
) -> (Vec<Variable>, Vec<usize>, Vec<usize>, Vec<usize>, Vec<usize>) {
    // Returns: (vars, point_indices, circle_indices, arc_indices, group_indices)
    // point_indices[i] → variable index for points[i].x (y = +1)
    // circle_indices[i] → variable index for circles[i].radius
    // arc_indices[i] → variable index for arcs[i].radius
    // group_indices[i] → variable index for groups[i].x (y = +1, theta = +2 if not fixed_rotation)
    let mut vars: Vec<Variable> = Vec::new();
    let mut pt_var_idx = Vec::new();
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
        if p.fixed || group_owned_points.contains(&p.id) {
            pt_var_idx.push(usize::MAX);
        } else {
            pt_var_idx.push(vars.len());
            vars.push(Variable { entity_id: p.id.clone(), scale });
            vars.push(Variable { entity_id: p.id.clone(), scale });
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

    // Group frame variables.
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
        }
    }

    (vars, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx)
}

fn capture_state(
    points: &Vec<Point>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    groups: &Vec<SketchGroup>,
    pt_var_idx: &Vec<usize>,
    circ_var_idx: &Vec<usize>,
    arc_var_idx: &Vec<usize>,
    group_var_idx: &Vec<usize>,
    n_vars: usize,
) -> Vec<f64> {
    let mut state = vec![0.0f64; n_vars];
    for (i, p) in points.iter().enumerate() {
        let vi = pt_var_idx[i];
        if vi != usize::MAX {
            state[vi] = p.x;
            state[vi + 1] = p.y;
        }
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
            if !g.fixed_rotation {
                state[vi + 2] = g.theta;
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
    pt_var_idx: &Vec<usize>,
    circ_var_idx: &Vec<usize>,
    arc_var_idx: &Vec<usize>,
    group_var_idx: &Vec<usize>,
) {
    for (i, p) in points.iter_mut().enumerate() {
        let vi = pt_var_idx[i];
        if vi != usize::MAX {
            p.x = state[vi];
            p.y = state[vi + 1];
        }
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
            if !g.fixed_rotation {
                g.theta = state[vi + 2];
            }
        }
    }
    // Resolve group-owned points to world coordinates.
    resolve_group_points(points, groups);
}

// ─── Reference length ─────────────────────────────────────────────────────────

fn compute_reference_length(points: &Vec<Point>, circles: &Vec<Circle>, arcs: &Vec<Arc>) -> f64 {
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
    if xs.is_empty() {
        return 1.0;
    }
    let span_x = xs.iter().cloned().fold(f64::NEG_INFINITY, f64::max)
        - xs.iter().cloned().fold(f64::INFINITY, f64::min);
    let span_y = ys.iter().cloned().fold(f64::NEG_INFINITY, f64::max)
        - ys.iter().cloned().fold(f64::INFINITY, f64::min);
    span_x.hypot(span_y).max(1.0)
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
    pt_var_idx: &Vec<usize>,
    circ_var_idx: &Vec<usize>,
    arc_var_idx: &Vec<usize>,
    group_var_idx: &Vec<usize>,
) -> (SparsityMap, usize) {
    let n_vars = vars.len();

    // Build set of group-owned point IDs and map them to their group's variable indices.
    let mut group_point_to_group_idx: HashMap<String, usize> = HashMap::new();
    for (gi, group) in groups.iter().enumerate() {
        for lp in &group.points {
            group_point_to_group_idx.insert(lp.id.clone(), gi);
        }
    }

    // Build the set of all group variable columns.
    let mut group_var_cols: HashSet<usize> = HashSet::new();
    for (gi, g) in groups.iter().enumerate() {
        let vi = group_var_idx[gi];
        if vi != usize::MAX {
            group_var_cols.insert(vi);     // gx
            group_var_cols.insert(vi + 1); // gy
            if !g.fixed_rotation {
                group_var_cols.insert(vi + 2); // gθ
            }
        }
    }

    // Map entity_id → variable indices it contributes.
    let mut entity_to_vars: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, p) in points.iter().enumerate() {
        let vi = pt_var_idx[i];
        if vi != usize::MAX {
            // Non-group-owned, non-fixed point — maps to its own x/y variables.
            entity_to_vars.entry(p.id.clone()).or_default().extend([vi, vi + 1]);
        } else if let Some(&gi) = group_point_to_group_idx.get(&p.id) {
            // Group-owned point — maps to the group's frame variables.
            let gvi = group_var_idx[gi];
            if gvi != usize::MAX {
                let entry = entity_to_vars.entry(p.id.clone()).or_default();
                entry.push(gvi);     // gx
                entry.push(gvi + 1); // gy
                if !groups[gi].fixed_rotation {
                    entry.push(gvi + 2); // gθ
                }
            }
        }
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

    (SparsityMap { var_to_constraint_rows, var_to_arc_rows, arc_row_start, group_var_cols }, arc_row_start + arcs.len() * 2)
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
    pt_var_idx: &Vec<usize>,
    circ_var_idx: &Vec<usize>,
    arc_var_idx: &Vec<usize>,
    group_var_idx: &Vec<usize>,
    sparsity: &SparsityMap,
    n_rows: usize,
) -> Option<LinearizedSystem> {
    let (base, max_abs) = eval_residuals_full(points, lines, circles, arcs, shapes, constraints)?;
    let n_vars = vars.len();
    let n_eq = base.len();

    if n_eq != n_rows {
        return None;
    }

    let mut jacobian = vec![vec![0.0f64; n_vars]; n_eq];

    let pts_map: HashMap<String, usize> = points.iter().enumerate().map(|(i, p)| (p.id.clone(), i)).collect();
    let circs_map: HashMap<String, usize> = circles.iter().enumerate().map(|(i, c)| (c.id.clone(), i)).collect();
    let arcs_map_idx: HashMap<String, usize> = arcs.iter().enumerate().map(|(i, a)| (a.id.clone(), i)).collect();
    let mut key_to_col: HashMap<String, usize> = HashMap::new();
    for (i, point) in points.iter().enumerate() {
        let vi = pt_var_idx[i];
        if vi != usize::MAX {
            key_to_col.insert(format!("{}.x", point.id), vi);
            key_to_col.insert(format!("{}.y", point.id), vi + 1);
        }
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
    let mut row_cursor = 0usize;
    for constraint in constraints {
        let row_count = crate::constraints::constraint_residual_impl(
            constraint, points, lines, circles, arcs, shapes,
        ).len();
        if row_count == 0 {
            continue;
        }
        // Only use analytic Jacobian for non-group variables; group variables use FD.
        if let Some((_residuals, partials)) = constraint_jacobian_impl(
            constraint, points, lines, circles, arcs, shapes,
        ) {
            for (key, derivs) in partials {
                if let Some(&col) = key_to_col.get(&key) {
                    for (r, value) in derivs.iter().enumerate().take(row_count) {
                        jacobian[row_cursor + r][col] = *value;
                    }
                }
            }
            analytic_rows.insert(row_cursor, row_count);
        }
        row_cursor += row_count;
    }

    for col in 0..n_vars {
        let v = &vars[col];
        let base_val = get_var(col, points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx);
        let step = fd_step(base_val, v.scale);

        set_var(col, base_val + step, points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx);

        // If this is a group variable, resolve group points after perturbation.
        if sparsity.group_var_cols.contains(&col) {
            resolve_group_points(points, groups);
        }

        // Sparse: only evaluate affected constraints.
        for &(row_start, row_count) in &sparsity.var_to_constraint_rows[col] {
            if analytic_rows.contains_key(&row_start) && !sparsity.group_var_cols.contains(&col) {
                continue;
            }
            let ci = constraint_index_at_row(row_start, constraints, points, lines, circles, arcs, shapes);
            if let Some(ci) = ci {
                let res = crate::constraints::constraint_residual_impl(
                    &constraints[ci], points, lines, circles, arcs, shapes,
                );
                for r in 0..row_count {
                    if let (Some(pv), Some(bv)) = (res.get(r), base.get(row_start + r)) {
                        jacobian[row_start + r][col] = (pv - bv) / step;
                    }
                }
            }
        }

        // Arc consistency rows.
        for &arc_row_0 in &sparsity.var_to_arc_rows[col] {
            let ai = (arc_row_0 - sparsity.arc_row_start) / 2;
            let arc = &arcs[ai];
            let center = pts_map.get(&arc.center).map(|&i| &points[i]);
            let start = pts_map.get(&arc.start).map(|&i| &points[i]);
            let end = pts_map.get(&arc.end).map(|&i| &points[i]);
            if let (Some(center), Some(start), Some(end)) = (center, start, end) {
                let r0 = (start.x - center.x).hypot(start.y - center.y) - arc.radius;
                let r1 = (end.x - center.x).hypot(end.y - center.y) - arc.radius;
                if let Some(bv) = base.get(arc_row_0) {
                    jacobian[arc_row_0][col] = (r0 - bv) / step;
                }
                if let Some(bv) = base.get(arc_row_0 + 1) {
                    jacobian[arc_row_0 + 1][col] = (r1 - bv) / step;
                }
            }
        }

        set_var(col, base_val, points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx);

        // If this is a group variable, resolve group points after restoration.
        if sparsity.group_var_cols.contains(&col) {
            resolve_group_points(points, groups);
        }

        let _ = (&pts_map, &circs_map, &arcs_map_idx);
    }

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
    pt_var_idx: &Vec<usize>,
    circ_var_idx: &Vec<usize>,
    arc_var_idx: &Vec<usize>,
    group_var_idx: &Vec<usize>,
) -> f64 {
    for (i, p) in points.iter().enumerate() {
        let vi = pt_var_idx[i];
        if vi == col { return p.x; }
        if vi != usize::MAX && vi + 1 == col { return p.y; }
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
    pt_var_idx: &Vec<usize>,
    circ_var_idx: &Vec<usize>,
    arc_var_idx: &Vec<usize>,
    group_var_idx: &Vec<usize>,
) {
    for (i, p) in points.iter_mut().enumerate() {
        let vi = pt_var_idx[i];
        if vi == col { p.x = value; return; }
        if vi != usize::MAX && vi + 1 == col { p.y = value; return; }
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
    pt_var_idx: &Vec<usize>,
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
) -> f64 {
    let ref_len = compute_reference_length(points, circles, arcs);
    let scale = ref_len.max(1.0);

    let (vars, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx) =
        build_variables(points, circles, arcs, groups, scale);

    if vars.is_empty() {
        return match eval_residuals_full(points, lines, circles, arcs, shapes, constraints) {
            Some((_, max_abs)) => max_abs,
            None => 0.0,
        };
    }

    let (sparsity, n_rows) = build_sparsity(
        points, lines, circles, arcs, shapes, constraints, groups,
        &vars, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx,
    );

    let initial_state = capture_state(points, circles, arcs, groups, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx, vars.len());
    let mut best_state = initial_state.clone();
    let mut best_error = f64::INFINITY;

    for attempt in 0..restarts {
        seed_restart(
            points, circles, arcs, groups, &initial_state,
            &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx,
            attempt, ref_len,
        );

        if attempt == 0 {
            projector_warm_start(points, lines, circles, arcs, shapes, constraints, groups, warm_start_iters, tolerance);
        }
        let pass_anchor_state = capture_state(
            points, circles, arcs, groups,
            &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx, vars.len(),
        );

        let error = run_lm_pass(
            points, lines, circles, arcs, shapes, constraints, groups,
            &vars, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx,
            &sparsity, n_rows, iterations, tolerance, max_scaled_step, scale, &pass_anchor_state,
        );

        if error < best_error {
            best_error = error;
            best_state = capture_state(points, circles, arcs, groups, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx, vars.len());
        }
        if best_error <= tolerance { break; }
    }

    // GS escape: 3 rounds of GS warm-start + another LM pass.
    if best_error > tolerance {
        for _ in 0..3 {
            apply_state(&best_state, points, circles, arcs, groups, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx);
            let gs_iters = (warm_start_iters * 4).max(30);
            projector_warm_start(points, lines, circles, arcs, shapes, constraints, groups, gs_iters, tolerance);
            let pass_anchor_state = capture_state(
                points, circles, arcs, groups,
                &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx, vars.len(),
            );

            let error = run_lm_pass(
                points, lines, circles, arcs, shapes, constraints, groups,
                &vars, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx,
                &sparsity, n_rows, iterations, tolerance, max_scaled_step, scale, &pass_anchor_state,
            );

            if error < best_error {
                best_error = error;
                best_state = capture_state(points, circles, arcs, groups, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx, vars.len());
            }
            if best_error <= tolerance { break; }
        }
    }

    apply_state(&best_state, points, circles, arcs, groups, &pt_var_idx, &circ_var_idx, &arc_var_idx, &group_var_idx);
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
    pt_var_idx: &Vec<usize>,
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
) -> f64 {
    let mut lambda = 1e-3f64;
    let mut nu = 2.0f64;
    let prior_diag = 1e-6 / scale.max(1.0).powi(2);

    let mut lin = match linearize(
        points, lines, circles, arcs, shapes, constraints, groups,
        vars, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx, sparsity, n_rows,
    ) {
        Some(l) => l,
        None => return f64::INFINITY,
    };
    let mut best_pass_state = capture_state(points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx, vars.len());
    let mut best_pass_error = lin.max_abs;
    let mut best_pass_disp = scaled_state_displacement(&best_pass_state, anchor_state, scale);

    for _ in 0..iterations {
        if lin.max_abs <= tolerance { break; }

        let state = capture_state(points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx, vars.len());
        let prior_offset: Vec<f64> = state.iter().zip(anchor_state.iter()).map(|(s, a)| s - a).collect();

        let step = match lm_step(
            &lin.weighted_jacobian,
            &lin.weighted_residual,
            lambda,
            Some(&prior_offset),
            prior_diag,
        ) {
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
            let trial_state: Vec<f64> = state.iter().zip(&dx).map(|(s, d)| s + d).collect();
            apply_state(&trial_state, points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx);

            let trial = match linearize(
                points, lines, circles, arcs, shapes, constraints, groups,
                vars, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx, sparsity, n_rows,
            ) {
                Some(l) => l,
                None => {
                    apply_state(&state, points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx);
                    break;
                }
            };

            let actual = lin.weighted_cost - trial.weighted_cost;
            let rho = if pred > 0.0 { actual / pred } else { 0.0 };

            if actual > 0.0 {
                accepted = true;
                lambda = if rho > 0.0 {
                    let factor = 1.0 - (2.0 * rho - 1.0).powi(3);
                    local_lambda * (1.0_f64 / 3.0).max(factor)
                } else {
                    local_lambda
                };
                nu = 2.0;
                let trial_disp = scaled_state_displacement(&trial_state, anchor_state, scale);
                if trial.max_abs + 1e-9 < best_pass_error
                    || (trial.max_abs <= best_pass_error + tolerance * 0.25 && trial_disp < best_pass_disp)
                {
                    best_pass_error = trial.max_abs;
                    best_pass_disp = trial_disp;
                    best_pass_state = trial_state.clone();
                }
                lin = trial;
                break;
            }

            apply_state(&state, points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx);
            local_lambda *= local_nu;
            local_nu *= 2.0;

            let retry = match lm_step(
                &lin.weighted_jacobian,
                &lin.weighted_residual,
                local_lambda,
                Some(&prior_offset),
                prior_diag,
            ) {
                Some(s) => s,
                None => break,
            };
            dx = limit_step(retry.dx.clone(), scale, max_scaled_step);
            pred = retry.predicted_reduction
                * (1.0_f64).min(max_scaled_step / scaled_step_norm(&retry.dx, scale).max(max_scaled_step));
        }

        if !accepted { break; }
    }

    apply_state(&best_pass_state, points, circles, arcs, groups, pt_var_idx, circ_var_idx, arc_var_idx, group_var_idx);

    match eval_residuals_full(points, lines, circles, arcs, shapes, constraints) {
        Some((_, max_abs)) => max_abs,
        None => f64::INFINITY,
    }
}
