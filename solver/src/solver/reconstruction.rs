use std::collections::{HashMap, HashSet};
use crate::types::{Constraint, Line, Point};

// ─── Reconstruction graph ────────────────────────────────────────────────────

/// A single step in the reconstruction: computes one point from known dependencies.
#[derive(Debug, Clone)]
pub enum ReconstructionStep {
    /// target = source (coincident constraint)
    Coincident {
        target_idx: usize,
        source_idx: usize,
        constraint_idx: usize,
    },
    /// target.x = anchor.x + dx, target.y = anchor.y + dy (hDist + vDist)
    Offset {
        target_idx: usize,
        anchor_x_idx: usize,
        dx: f64,
        anchor_y_idx: usize,
        dy: f64,
        constraint_indices: [usize; 2],
    },
    /// target at intersection of two distance circles from known centers.
    /// Branch chosen at execution time by evaluating remaining constraints.
    CircleCircle {
        target_idx: usize,
        c1_idx: usize,
        r1: f64,
        c2_idx: usize,
        r2: f64,
        constraint_indices: [usize; 2],
    },
    /// target at intersection of horizontal/vertical line through a known point + distance circle
    LineCircle {
        target_idx: usize,
        /// Line definition: point on line + direction
        line_point_idx: usize,
        line_dx: f64,
        line_dy: f64,
        /// Circle definition: center + radius
        circle_center_idx: usize,
        radius: f64,
        constraint_indices: Vec<usize>,
    },
    /// target.x = anchor.x + dx, target.y from distance to another known point
    HDistCircle {
        target_idx: usize,
        h_anchor_idx: usize,
        dx: f64,
        dist_anchor_idx: usize,
        dist: f64,
        constraint_indices: [usize; 2],
    },
    /// target.y = anchor.y + dy, target.x from distance to another known point
    VDistCircle {
        target_idx: usize,
        v_anchor_idx: usize,
        dy: f64,
        dist_anchor_idx: usize,
        dist: f64,
        constraint_indices: [usize; 2],
    },
}

impl ReconstructionStep {
    pub fn target_idx(&self) -> usize {
        match self {
            Self::Coincident { target_idx, .. }
            | Self::Offset { target_idx, .. }
            | Self::CircleCircle { target_idx, .. }
            | Self::LineCircle { target_idx, .. }
            | Self::HDistCircle { target_idx, .. }
            | Self::VDistCircle { target_idx, .. } => *target_idx,
        }
    }

    pub fn consumed_constraints(&self) -> Vec<usize> {
        match self {
            Self::Coincident { constraint_idx, .. } => vec![*constraint_idx],
            Self::Offset { constraint_indices, .. }
            | Self::CircleCircle { constraint_indices, .. }
            | Self::HDistCircle { constraint_indices, .. }
            | Self::VDistCircle { constraint_indices, .. } => constraint_indices.to_vec(),
            Self::LineCircle { constraint_indices, .. } => constraint_indices.clone(),
        }
    }
}

/// The reconstruction graph: an ordered sequence of steps that compute
/// determined point positions from their dependencies.
#[derive(Debug, Clone)]
pub struct ReconstructionGraph {
    pub steps: Vec<ReconstructionStep>,
    /// Point indices that are fully determined by reconstruction.
    pub determined_point_indices: HashSet<usize>,
    /// Constraint indices consumed by reconstruction (satisfied by construction).
    pub consumed_constraint_indices: HashSet<usize>,
}

impl ReconstructionGraph {
    pub fn is_empty(&self) -> bool {
        self.steps.is_empty()
    }

    /// For each reconstructed point, compute the set of point indices it
    /// transitively depends on (for sparsity mapping).
    pub fn dependency_point_indices(&self) -> HashMap<usize, Vec<usize>> {
        let mut deps: HashMap<usize, Vec<usize>> = HashMap::new();

        for step in &self.steps {
            let target = step.target_idx();
            let direct: Vec<usize> = match step {
                ReconstructionStep::Coincident { source_idx, .. } => vec![*source_idx],
                ReconstructionStep::Offset { anchor_x_idx, anchor_y_idx, .. } => vec![*anchor_x_idx, *anchor_y_idx],
                ReconstructionStep::CircleCircle { c1_idx, c2_idx, .. } => vec![*c1_idx, *c2_idx],
                ReconstructionStep::LineCircle { line_point_idx, circle_center_idx, .. } => vec![*line_point_idx, *circle_center_idx],
                ReconstructionStep::HDistCircle { h_anchor_idx, dist_anchor_idx, .. } => vec![*h_anchor_idx, *dist_anchor_idx],
                ReconstructionStep::VDistCircle { v_anchor_idx, dist_anchor_idx, .. } => vec![*v_anchor_idx, *dist_anchor_idx],
            };

            // Transitively expand: if a dependency is itself reconstructed, include its deps.
            let mut all_deps: Vec<usize> = Vec::new();
            for dep in &direct {
                if let Some(transitive) = deps.get(dep) {
                    all_deps.extend(transitive);
                } else {
                    all_deps.push(*dep);
                }
            }
            all_deps.sort();
            all_deps.dedup();
            deps.insert(target, all_deps);
        }

        deps
    }
}

// ─── Graph construction (analysis) ──────────────────────────────────────────

/// Index for fast constraint-to-point lookups.
struct ConstraintIndex<'a> {
    by_point: HashMap<&'a str, Vec<usize>>,
    line_map: HashMap<&'a str, &'a Line>,
}

/// Build the reconstruction graph by analyzing constraints and known (fixed) points.
/// This is a pure analysis pass — it does not modify any point positions.
pub fn build_reconstruction_graph(
    points: &[Point],
    lines: &[Line],
    constraints: &[Constraint],
    group_owned_point_ids: &HashSet<String>,
) -> ReconstructionGraph {
    let index = build_index(lines, constraints);
    let point_idx: HashMap<&str, usize> = points.iter().enumerate()
        .map(|(i, p)| (p.id.as_str(), i))
        .collect();

    // Known = fixed points + group-owned points (their positions are determined by group frames).
    let mut known: HashSet<usize> = HashSet::new();
    for (i, p) in points.iter().enumerate() {
        if p.fixed || group_owned_point_ids.contains(&p.id) {
            known.insert(i);
        }
    }

    let mut steps: Vec<ReconstructionStep> = Vec::new();
    let mut consumed: HashSet<usize> = HashSet::new();

    let mut progress = true;
    while progress {
        progress = false;

        for pi in 0..points.len() {
            if known.contains(&pi) {
                continue;
            }

            let point_id = points[pi].id.as_str();
            let step = try_coincident(point_id, pi, constraints, &index, &point_idx, &known)
                .or_else(|| try_offset(point_id, pi, constraints, &index, &point_idx, &known))
                .or_else(|| try_circle_circle(point_id, pi, constraints, &index, &point_idx, &known))
                .or_else(|| try_line_circle(point_id, pi, points, constraints, &index, &point_idx, &known))
                .or_else(|| try_hdist_circle(point_id, pi, constraints, &index, &point_idx, &known))
                .or_else(|| try_vdist_circle(point_id, pi, constraints, &index, &point_idx, &known));

            if let Some(step) = step {
                for ci in step.consumed_constraints() {
                    consumed.insert(ci);
                }
                known.insert(pi);
                steps.push(step);
                progress = true;
            }
        }
    }

    let determined_point_indices: HashSet<usize> = steps.iter()
        .map(|s| s.target_idx())
        .collect();

    ReconstructionGraph {
        steps,
        determined_point_indices,
        consumed_constraint_indices: consumed,
    }
}

// ─── Reconstruction execution ───────────────────────────────────────────────

/// Execute the reconstruction graph: compute all determined point positions.
/// For branch choices, evaluates remaining constraints to pick the best branch.
pub fn reconstruct(
    graph: &ReconstructionGraph,
    points: &mut [Point],
    lines: &[Line],
    constraints: &[Constraint],
) {
    for step in &graph.steps {
        match step {
            ReconstructionStep::Coincident { target_idx, source_idx, .. } => {
                points[*target_idx].x = points[*source_idx].x;
                points[*target_idx].y = points[*source_idx].y;
            }
            ReconstructionStep::Offset { target_idx, anchor_x_idx, dx, anchor_y_idx, dy, .. } => {
                points[*target_idx].x = points[*anchor_x_idx].x + dx;
                points[*target_idx].y = points[*anchor_y_idx].y + dy;
            }
            ReconstructionStep::CircleCircle {
                target_idx, c1_idx, r1, c2_idx, r2, constraint_indices,
            } => {
                let solutions = circle_circle_intersect(
                    points[*c1_idx].x, points[*c1_idx].y, *r1,
                    points[*c2_idx].x, points[*c2_idx].y, *r2,
                );
                let (x, y) = pick_best_branch(
                    &solutions, *target_idx, constraint_indices,
                    points, lines, constraints, &graph.consumed_constraint_indices,
                );
                points[*target_idx].x = x;
                points[*target_idx].y = y;
            }
            ReconstructionStep::LineCircle {
                target_idx, line_point_idx, line_dx, line_dy,
                circle_center_idx, radius, constraint_indices,
            } => {
                let solutions = line_circle_intersect(
                    points[*line_point_idx].x, points[*line_point_idx].y,
                    *line_dx, *line_dy,
                    points[*circle_center_idx].x, points[*circle_center_idx].y, *radius,
                );
                let (x, y) = pick_best_branch(
                    &solutions, *target_idx, constraint_indices,
                    points, lines, constraints, &graph.consumed_constraint_indices,
                );
                points[*target_idx].x = x;
                points[*target_idx].y = y;
            }
            ReconstructionStep::HDistCircle {
                target_idx, h_anchor_idx, dx, dist_anchor_idx, dist, constraint_indices,
            } => {
                let x = points[*h_anchor_idx].x + dx;
                let anchor = &points[*dist_anchor_idx];
                let disc = dist * dist - (x - anchor.x).powi(2);
                let solutions = if disc < -1e-9 {
                    vec![(x, anchor.y)]
                } else {
                    let root = if disc > 0.0 { disc.sqrt() } else { 0.0 };
                    vec![(x, anchor.y + root), (x, anchor.y - root)]
                };
                let (rx, ry) = pick_best_branch(
                    &solutions, *target_idx, constraint_indices,
                    points, lines, constraints, &graph.consumed_constraint_indices,
                );
                points[*target_idx].x = rx;
                points[*target_idx].y = ry;
            }
            ReconstructionStep::VDistCircle {
                target_idx, v_anchor_idx, dy, dist_anchor_idx, dist, constraint_indices,
            } => {
                let y = points[*v_anchor_idx].y + dy;
                let anchor = &points[*dist_anchor_idx];
                let disc = dist * dist - (y - anchor.y).powi(2);
                let solutions = if disc < -1e-9 {
                    vec![(anchor.x, y)]
                } else {
                    let root = if disc > 0.0 { disc.sqrt() } else { 0.0 };
                    vec![(anchor.x + root, y), (anchor.x - root, y)]
                };
                let (rx, ry) = pick_best_branch(
                    &solutions, *target_idx, constraint_indices,
                    points, lines, constraints, &graph.consumed_constraint_indices,
                );
                points[*target_idx].x = rx;
                points[*target_idx].y = ry;
            }
        }
    }
}

// ─── Branch resolution ──────────────────────────────────────────────────────

/// Pick the best branch from candidate solutions by evaluating remaining
/// (non-consumed) constraints on the target point. Falls back to closest
/// to current position if no remaining constraints discriminate.
fn pick_best_branch(
    solutions: &[(f64, f64)],
    target_idx: usize,
    step_constraint_indices: &[usize],
    points: &mut [Point],
    lines: &[Line],
    constraints: &[Constraint],
    consumed: &HashSet<usize>,
) -> (f64, f64) {
    if solutions.is_empty() {
        return (points[target_idx].x, points[target_idx].y);
    }
    if solutions.len() == 1 {
        return solutions[0];
    }

    let step_consumed: HashSet<usize> = step_constraint_indices.iter().copied().collect();

    // Find remaining constraints that involve this point and aren't consumed.
    let target_id = &points[target_idx].id;
    let remaining_constraint_indices: Vec<usize> = constraints.iter().enumerate()
        .filter(|(ci, _)| !consumed.contains(ci) && !step_consumed.contains(ci))
        .filter(|(_, c)| constraint_involves_point(c, target_id, lines))
        .map(|(ci, _)| ci)
        .collect();

    // Save original position.
    let orig_x = points[target_idx].x;
    let orig_y = points[target_idx].y;

    let mut best = solutions[0];
    let mut best_cost = f64::INFINITY;

    for &(sx, sy) in solutions {
        points[target_idx].x = sx;
        points[target_idx].y = sy;

        let cost = if remaining_constraint_indices.is_empty() {
            // No remaining constraints to discriminate — use proximity to current position.
            (sx - orig_x).hypot(sy - orig_y)
        } else {
            // Sum of squared residuals of remaining constraints.
            remaining_constraint_indices.iter()
                .map(|&ci| {
                    use crate::constraints::constraint_residual_impl;
                    let empty_circles = Vec::new();
                    let empty_arcs = Vec::new();
                    let empty_shapes = Vec::new();
                    // Convert slices to Vec refs for the API.
                    let points_vec: Vec<Point> = points.iter().cloned().collect();
                    let lines_vec: Vec<Line> = lines.iter().cloned().collect();
                    let residuals = constraint_residual_impl(
                        &constraints[ci], &points_vec, &lines_vec,
                        &empty_circles, &empty_arcs, &empty_shapes,
                    );
                    residuals.iter().map(|r| r * r).sum::<f64>()
                })
                .sum::<f64>()
        };

        if cost < best_cost {
            best_cost = cost;
            best = (sx, sy);
        }
    }

    // Restore target to best solution.
    points[target_idx].x = best.0;
    points[target_idx].y = best.1;

    // Also restore if we didn't pick a branch (shouldn't happen, but defensive).
    if !best_cost.is_finite() {
        points[target_idx].x = orig_x;
        points[target_idx].y = orig_y;
        return (orig_x, orig_y);
    }

    best
}

/// Check if a constraint references a point (directly or through a line).
fn constraint_involves_point(constraint: &Constraint, point_id: &str, lines: &[Line]) -> bool {
    let line_has_point = |line_id: &str| -> bool {
        lines.iter().any(|l| l.id == line_id && (l.a == point_id || l.b == point_id))
    };

    match constraint {
        Constraint::Coincident { a, b, .. }
        | Constraint::Distance { a, b, .. }
        | Constraint::HDistance { a, b, .. }
        | Constraint::VDistance { a, b, .. }
        | Constraint::Symmetric { a, b, .. } => a == point_id || b == point_id,

        Constraint::Horizontal { line, .. }
        | Constraint::Vertical { line, .. }
        | Constraint::Length { line, .. }
        | Constraint::AbsoluteAngle { line, .. } => line_has_point(line),

        Constraint::PointOnLine { point, line, .. } => point == point_id || line_has_point(line),
        Constraint::PointOnCircle { point, .. } => point == point_id,
        Constraint::PointLineDistance { point, line, .. } => point == point_id || line_has_point(line),

        Constraint::Parallel { a, b, .. }
        | Constraint::Perpendicular { a, b, .. }
        | Constraint::Equal { a, b, .. }
        | Constraint::Angle { a, b, .. } => line_has_point(a) || line_has_point(b),

        Constraint::Collinear { point, line, .. } => point == point_id || line_has_point(line),
        Constraint::Midpoint { point, line, .. } => point == point_id || line_has_point(line),
        Constraint::Concentric { a, b, .. } => a == point_id || b == point_id,

        Constraint::LineDistance { a, b, .. } => line_has_point(a) || line_has_point(b),

        _ => false,
    }
}

// ─── Pattern matchers ───────────────────────────────────────────────────────

fn try_coincident(
    point_id: &str,
    point_idx: usize,
    constraints: &[Constraint],
    index: &ConstraintIndex,
    point_idx_map: &HashMap<&str, usize>,
    known: &HashSet<usize>,
) -> Option<ReconstructionStep> {
    let constraint_indices = index.by_point.get(point_id)?;

    for &ci in constraint_indices {
        if let Constraint::Coincident { a, b, .. } = &constraints[ci] {
            let other = if a == point_id { b.as_str() } else if b == point_id { a.as_str() } else { continue };
            let other_idx = *point_idx_map.get(other)?;
            if !known.contains(&other_idx) { continue; }
            return Some(ReconstructionStep::Coincident {
                target_idx: point_idx,
                source_idx: other_idx,
                constraint_idx: ci,
            });
        }
    }
    None
}

fn try_offset(
    point_id: &str,
    point_idx: usize,
    constraints: &[Constraint],
    index: &ConstraintIndex,
    point_idx_map: &HashMap<&str, usize>,
    known: &HashSet<usize>,
) -> Option<ReconstructionStep> {
    let constraint_indices = index.by_point.get(point_id)?;

    let mut hdist: Option<(usize, usize, f64)> = None; // (constraint_idx, anchor_point_idx, dx)
    let mut vdist: Option<(usize, usize, f64)> = None; // (constraint_idx, anchor_point_idx, dy)

    for &ci in constraint_indices {
        match &constraints[ci] {
            Constraint::HDistance { a, b, value, .. } => {
                let (other, sign) = if a == point_id { (b.as_str(), -1.0) } else if b == point_id { (a.as_str(), 1.0) } else { continue };
                let other_idx = match point_idx_map.get(other) { Some(&i) => i, None => continue };
                if !known.contains(&other_idx) { continue; }
                hdist = Some((ci, other_idx, sign * value));
            }
            Constraint::VDistance { a, b, value, .. } => {
                let (other, sign) = if a == point_id { (b.as_str(), -1.0) } else if b == point_id { (a.as_str(), 1.0) } else { continue };
                let other_idx = match point_idx_map.get(other) { Some(&i) => i, None => continue };
                if !known.contains(&other_idx) { continue; }
                vdist = Some((ci, other_idx, sign * value));
            }
            _ => {}
        }
    }

    let (hci, haidx, dx) = hdist?;
    let (vci, vaidx, dy) = vdist?;

    Some(ReconstructionStep::Offset {
        target_idx: point_idx,
        anchor_x_idx: haidx,
        dx,
        anchor_y_idx: vaidx,
        dy,
        constraint_indices: [hci, vci],
    })
}

fn try_circle_circle(
    point_id: &str,
    point_idx: usize,
    constraints: &[Constraint],
    index: &ConstraintIndex,
    point_idx_map: &HashMap<&str, usize>,
    known: &HashSet<usize>,
) -> Option<ReconstructionStep> {
    let constraint_indices = index.by_point.get(point_id)?;

    let mut distances: Vec<(usize, usize, f64)> = Vec::new(); // (constraint_idx, center_point_idx, radius)
    for &ci in constraint_indices {
        if let Constraint::Distance { a, b, value, .. } = &constraints[ci] {
            let other = if a == point_id { b.as_str() } else if b == point_id { a.as_str() } else { continue };
            let other_idx = match point_idx_map.get(other) { Some(&i) => i, None => continue };
            if !known.contains(&other_idx) { continue; }
            distances.push((ci, other_idx, *value));
        }
    }

    if distances.len() < 2 {
        return None;
    }

    Some(ReconstructionStep::CircleCircle {
        target_idx: point_idx,
        c1_idx: distances[0].1,
        r1: distances[0].2,
        c2_idx: distances[1].1,
        r2: distances[1].2,
        constraint_indices: [distances[0].0, distances[1].0],
    })
}

fn try_line_circle(
    point_id: &str,
    point_idx: usize,
    points: &[Point],
    constraints: &[Constraint],
    index: &ConstraintIndex,
    point_idx_map: &HashMap<&str, usize>,
    known: &HashSet<usize>,
) -> Option<ReconstructionStep> {
    let constraint_indices = index.by_point.get(point_id)?;

    // Find a distance constraint to a known point.
    let mut dist_info: Option<(usize, usize, f64)> = None;
    for &ci in constraint_indices {
        if let Constraint::Distance { a, b, value, .. } = &constraints[ci] {
            let other = if a == point_id { b.as_str() } else if b == point_id { a.as_str() } else { continue };
            let other_idx = match point_idx_map.get(other) { Some(&i) => i, None => continue };
            if !known.contains(&other_idx) { continue; }
            dist_info = Some((ci, other_idx, *value));
            break;
        }
    }
    let (dist_ci, dist_center_idx, radius) = dist_info?;

    // Find a line constraint (horizontal, vertical, or pointOnLine with known endpoints).
    for &ci in constraint_indices {
        match &constraints[ci] {
            Constraint::Horizontal { line, .. } => {
                let line = index.line_map.get(line.as_str())?;
                let other_id = if line.a == point_id { line.b.as_str() } else if line.b == point_id { line.a.as_str() } else { continue };
                let other_idx = *point_idx_map.get(other_id)?;
                if !known.contains(&other_idx) { continue; }
                return Some(ReconstructionStep::LineCircle {
                    target_idx: point_idx,
                    line_point_idx: other_idx,
                    line_dx: 1.0,
                    line_dy: 0.0,
                    circle_center_idx: dist_center_idx,
                    radius,
                    constraint_indices: vec![ci, dist_ci],
                });
            }
            Constraint::Vertical { line, .. } => {
                let line = index.line_map.get(line.as_str())?;
                let other_id = if line.a == point_id { line.b.as_str() } else if line.b == point_id { line.a.as_str() } else { continue };
                let other_idx = *point_idx_map.get(other_id)?;
                if !known.contains(&other_idx) { continue; }
                return Some(ReconstructionStep::LineCircle {
                    target_idx: point_idx,
                    line_point_idx: other_idx,
                    line_dx: 0.0,
                    line_dy: 1.0,
                    circle_center_idx: dist_center_idx,
                    radius,
                    constraint_indices: vec![ci, dist_ci],
                });
            }
            Constraint::PointOnLine { point, line, .. } => {
                if point != point_id { continue; }
                let line = index.line_map.get(line.as_str())?;
                let la_idx = *point_idx_map.get(line.a.as_str())?;
                let lb_idx = *point_idx_map.get(line.b.as_str())?;
                if !known.contains(&la_idx) || !known.contains(&lb_idx) { continue; }
                let dx = points[lb_idx].x - points[la_idx].x;
                let dy = points[lb_idx].y - points[la_idx].y;
                return Some(ReconstructionStep::LineCircle {
                    target_idx: point_idx,
                    line_point_idx: la_idx,
                    line_dx: dx,
                    line_dy: dy,
                    circle_center_idx: dist_center_idx,
                    radius,
                    constraint_indices: vec![ci, dist_ci],
                });
            }
            _ => {}
        }
    }

    None
}

fn try_hdist_circle(
    point_id: &str,
    point_idx: usize,
    constraints: &[Constraint],
    index: &ConstraintIndex,
    point_idx_map: &HashMap<&str, usize>,
    known: &HashSet<usize>,
) -> Option<ReconstructionStep> {
    let constraint_indices = index.by_point.get(point_id)?;

    let mut hdist: Option<(usize, usize, f64)> = None;
    let mut dist: Option<(usize, usize, f64)> = None;

    for &ci in constraint_indices {
        match &constraints[ci] {
            Constraint::HDistance { a, b, value, .. } => {
                let (other, sign) = if a == point_id { (b.as_str(), -1.0) } else if b == point_id { (a.as_str(), 1.0) } else { continue };
                let other_idx = match point_idx_map.get(other) { Some(&i) => i, None => continue };
                if !known.contains(&other_idx) { continue; }
                hdist = Some((ci, other_idx, sign * value));
            }
            Constraint::Distance { a, b, value, .. } => {
                let other = if a == point_id { b.as_str() } else if b == point_id { a.as_str() } else { continue };
                let other_idx = match point_idx_map.get(other) { Some(&i) => i, None => continue };
                if !known.contains(&other_idx) { continue; }
                dist = Some((ci, other_idx, *value));
            }
            _ => {}
        }
    }

    let (hci, haidx, dx) = hdist?;
    let (dci, daidx, dv) = dist?;

    Some(ReconstructionStep::HDistCircle {
        target_idx: point_idx,
        h_anchor_idx: haidx,
        dx,
        dist_anchor_idx: daidx,
        dist: dv,
        constraint_indices: [hci, dci],
    })
}

fn try_vdist_circle(
    point_id: &str,
    point_idx: usize,
    constraints: &[Constraint],
    index: &ConstraintIndex,
    point_idx_map: &HashMap<&str, usize>,
    known: &HashSet<usize>,
) -> Option<ReconstructionStep> {
    let constraint_indices = index.by_point.get(point_id)?;

    let mut vdist: Option<(usize, usize, f64)> = None;
    let mut dist: Option<(usize, usize, f64)> = None;

    for &ci in constraint_indices {
        match &constraints[ci] {
            Constraint::VDistance { a, b, value, .. } => {
                let (other, sign) = if a == point_id { (b.as_str(), -1.0) } else if b == point_id { (a.as_str(), 1.0) } else { continue };
                let other_idx = match point_idx_map.get(other) { Some(&i) => i, None => continue };
                if !known.contains(&other_idx) { continue; }
                vdist = Some((ci, other_idx, sign * value));
            }
            Constraint::Distance { a, b, value, .. } => {
                let other = if a == point_id { b.as_str() } else if b == point_id { a.as_str() } else { continue };
                let other_idx = match point_idx_map.get(other) { Some(&i) => i, None => continue };
                if !known.contains(&other_idx) { continue; }
                dist = Some((ci, other_idx, *value));
            }
            _ => {}
        }
    }

    let (vci, vaidx, dy) = vdist?;
    let (dci, daidx, dv) = dist?;

    Some(ReconstructionStep::VDistCircle {
        target_idx: point_idx,
        v_anchor_idx: vaidx,
        dy,
        dist_anchor_idx: daidx,
        dist: dv,
        constraint_indices: [vci, dci],
    })
}

// ─── Geometry helpers ───────────────────────────────────────────────────────

fn circle_circle_intersect(x1: f64, y1: f64, r1: f64, x2: f64, y2: f64, r2: f64) -> Vec<(f64, f64)> {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let d = dx.hypot(dy);

    if d < 1e-12 || d > r1 + r2 + 1e-9 || d < (r1 - r2).abs() - 1e-9 {
        return vec![];
    }

    let a = (r1 * r1 - r2 * r2 + d * d) / (2.0 * d);
    let h2 = r1 * r1 - a * a;
    let h = if h2 > 0.0 { h2.sqrt() } else { 0.0 };

    let mx = x1 + a * dx / d;
    let my = y1 + a * dy / d;

    if h < 1e-12 {
        return vec![(mx, my)];
    }

    let px = -dy / d * h;
    let py = dx / d * h;
    vec![(mx + px, my + py), (mx - px, my - py)]
}

fn line_circle_intersect(px: f64, py: f64, dx: f64, dy: f64, cx: f64, cy: f64, r: f64) -> Vec<(f64, f64)> {
    let fx = px - cx;
    let fy = py - cy;
    let a = dx * dx + dy * dy;
    if a < 1e-18 {
        return vec![];
    }
    let b = 2.0 * (fx * dx + fy * dy);
    let c = fx * fx + fy * fy - r * r;
    let disc = b * b - 4.0 * a * c;

    if disc < -1e-9 {
        return vec![];
    }

    let sqrt_disc = if disc > 0.0 { disc.sqrt() } else { 0.0 };
    let t1 = (-b + sqrt_disc) / (2.0 * a);
    let t2 = (-b - sqrt_disc) / (2.0 * a);

    if (t1 - t2).abs() < 1e-12 {
        return vec![(px + t1 * dx, py + t1 * dy)];
    }

    vec![(px + t1 * dx, py + t1 * dy), (px + t2 * dx, py + t2 * dy)]
}

// ─── Constraint index (shared with analytical.rs) ───────────────────────────

fn build_index<'a>(lines: &'a [Line], constraints: &'a [Constraint]) -> ConstraintIndex<'a> {
    let line_map: HashMap<&str, &Line> = lines.iter().map(|l| (l.id.as_str(), l)).collect();
    let mut by_point: HashMap<&str, Vec<usize>> = HashMap::new();

    for (ci, constraint) in constraints.iter().enumerate() {
        for point_id in constraint_point_ids(constraint, &line_map) {
            by_point.entry(point_id).or_default().push(ci);
        }
    }

    ConstraintIndex { by_point, line_map }
}

fn constraint_point_ids<'a>(constraint: &'a Constraint, line_map: &HashMap<&'a str, &'a Line>) -> Vec<&'a str> {
    match constraint {
        Constraint::Coincident { a, b, .. }
        | Constraint::Distance { a, b, .. }
        | Constraint::HDistance { a, b, .. }
        | Constraint::VDistance { a, b, .. } => vec![a.as_str(), b.as_str()],

        Constraint::Horizontal { line, .. } | Constraint::Vertical { line, .. } => {
            line_map.get(line.as_str()).map(|l| vec![l.a.as_str(), l.b.as_str()]).unwrap_or_default()
        }

        Constraint::PointOnLine { point, line, .. } => {
            line_map.get(line.as_str())
                .map(|l| vec![point.as_str(), l.a.as_str(), l.b.as_str()])
                .unwrap_or_else(|| vec![point.as_str()])
        }

        _ => vec![],
    }
}
