pub mod analytical;
pub mod decompose;
pub mod linear;
pub mod lm;

use std::collections::HashMap;
use crate::constraints::{constraint_jacobian_impl, constraint_residual_impl, evaluate_residuals, has_residual};
use crate::types::{
    Arc, Circle, Constraint, ConstraintResidual, Line, Point, Shape, SketchGroup, SolveMetadata,
    SolveOptions, SolveStatus, Problem,
};
use analytical::run_analytical_presolve;
use decompose::build_solve_plan;

/// Expand group local points/lines into the main problem arrays.
/// Must be called before solving. Group points become regular points
/// with world coordinates computed from the group frame.
pub fn expand_groups(problem: &mut Problem) {
    for group in &problem.groups {
        for lp in &group.points {
            let (wx, wy) = group.resolve_point(lp);
            problem.points.push(Point {
                id: lp.id.clone(),
                x: wx,
                y: wy,
                fixed: group.fixed,
            });
        }
        for line in &group.lines {
            problem.lines.push(line.clone());
        }
    }
}

/// Update group-owned points from their group's current frame.
pub fn resolve_group_points(points: &mut Vec<Point>, groups: &Vec<SketchGroup>) {
    let pt_map: HashMap<String, usize> = points.iter().enumerate().map(|(i, p)| (p.id.clone(), i)).collect();
    for group in groups {
        for lp in &group.points {
            if let Some(&idx) = pt_map.get(&lp.id) {
                let (wx, wy) = group.resolve_point(lp);
                points[idx].x = wx;
                points[idx].y = wy;
            }
        }
    }
}

/// Mutable state for the solver — everything borrowed from the Problem.
pub struct SolverState<'a> {
    pub points: HashMap<String, &'a mut Point>,
    pub lines: HashMap<String, &'a Line>,
    pub circles: HashMap<String, &'a mut Circle>,
    pub arcs: HashMap<String, &'a mut Arc>,
    pub shapes: HashMap<String, &'a Shape>,
    pub tolerance: f64,
}

impl<'a> SolverState<'a> {
    pub fn new(
        points: &'a mut [Point],
        lines: &'a [Line],
        circles: &'a mut [Circle],
        arcs: &'a mut [Arc],
        shapes: &'a [Shape],
        tolerance: f64,
    ) -> Self {
        let points_map: HashMap<String, &'a mut Point> = points
            .iter_mut()
            .map(|p| (p.id.clone(), p))
            .collect();
        let lines_map: HashMap<String, &'a Line> = lines
            .iter()
            .map(|l| (l.id.clone(), l))
            .collect();
        let circles_map: HashMap<String, &'a mut Circle> = circles
            .iter_mut()
            .map(|c| (c.id.clone(), c))
            .collect();
        let arcs_map: HashMap<String, &'a mut Arc> = arcs
            .iter_mut()
            .map(|a| (a.id.clone(), a))
            .collect();
        let shapes_map: HashMap<String, &'a Shape> = shapes
            .iter()
            .map(|s| (s.id.clone(), s))
            .collect();

        SolverState {
            points: points_map,
            lines: lines_map,
            circles: circles_map,
            arcs: arcs_map,
            shapes: shapes_map,
            tolerance,
        }
    }
}

/// Public entry point — solve the constraint system in place.
/// Returns the max absolute residual.
pub fn solve(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    options: &SolveOptions,
    groups: &mut Vec<SketchGroup>,
) -> f64 {
    // Run targeted single-constraint presolve before the main solve when
    // the caller requests it (builder incremental path).
    if let Some(ref cid) = options.presolve_constraint_id {
        let pts: HashMap<String, usize> = points.iter().enumerate().map(|(i, p)| (p.id.clone(), i)).collect();
        let entity_ref_count = build_entity_ref_count(constraints);
        if let Some(constraint) = constraints.iter().find(|c| c.id() == cid.as_str()) {
            apply_presolve_constraint(points, lines, &pts, &entity_ref_count, constraint);
        }
    }

    let iterations = options.iterations.unwrap_or(80);
    let tolerance = options.tolerance.unwrap_or(1e-3);
    let restarts = options.restarts.unwrap_or(6);
    let warm_start_iters = options.warm_start_iterations.unwrap_or(6);
    let max_scaled_step = options.max_scaled_step.unwrap_or(2.5);

    // Snapshot initial geometry when fallback retry is requested, so we can
    // restore to original positions before the retry (matching the TS-side
    // updateConstraintValue behavior that clones from the original definition).
    let snapshot = if options.fallback_restarts.is_some() {
        Some((points.clone(), circles.clone(), arcs.clone(), groups.clone()))
    } else {
        None
    };

    let max_error = solve_system(
        points, lines, circles, arcs, shapes, constraints,
        iterations, tolerance, restarts, warm_start_iters, max_scaled_step,
        groups,
    );

    // Fallback: if the first solve exceeded tolerance * 5 and a fallback is
    // configured, restore the original geometry and retry with more restarts.
    if let (Some(fallback), Some((snap_pts, snap_circles, snap_arcs, snap_groups))) =
        (options.fallback_restarts, snapshot)
    {
        if max_error > tolerance * 5.0 {
            *points = snap_pts;
            *circles = snap_circles;
            *arcs = snap_arcs;
            *groups = snap_groups;
            let fb_restarts = fallback;
            let fb_warm = options.warm_start_iterations.unwrap_or(6);
            return solve_system(
                points, lines, circles, arcs, shapes, constraints,
                iterations, tolerance, fb_restarts, fb_warm, max_scaled_step,
                groups,
            );
        }
    }

    max_error
}

/// Inner solve dispatch — decompose into independent components when possible.
fn solve_system(
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
    if let Some(plan) = build_solve_plan(points, lines, circles, arcs, shapes, constraints) {
        // Build a set of group-owned point IDs for quick lookup.
        let group_point_ids: std::collections::HashSet<String> = groups.iter()
            .flat_map(|g| g.points.iter().map(|p| p.id.clone()))
            .collect();

        let mut max_error: f64 = 0.0;
        for component in plan {
            let mut sub_points: Vec<Point> = points
                .iter()
                .filter(|point| component.entity_ids.contains(&point.id))
                .cloned()
                .collect();
            let sub_lines: Vec<Line> = lines
                .iter()
                .filter(|line| component.entity_ids.contains(&line.id))
                .cloned()
                .collect();
            let mut sub_circles: Vec<Circle> = circles
                .iter()
                .filter(|circle| component.entity_ids.contains(&circle.id))
                .cloned()
                .collect();
            let mut sub_arcs: Vec<Arc> = arcs
                .iter()
                .filter(|arc| component.entity_ids.contains(&arc.id))
                .cloned()
                .collect();
            let sub_shapes: Vec<Shape> = shapes
                .iter()
                .filter(|shape| component.entity_ids.contains(&shape.id))
                .cloned()
                .collect();
            let sub_constraints: Vec<Constraint> = component
                .constraint_indices
                .iter()
                .map(|&index| constraints[index].clone())
                .collect();

            // Filter groups whose points are in this component.
            let mut sub_groups: Vec<SketchGroup> = groups
                .iter()
                .filter(|g| g.points.iter().any(|p| component.entity_ids.contains(&p.id)))
                .cloned()
                .collect();

            let component_error = solve_single_system(
                &mut sub_points,
                &sub_lines,
                &mut sub_circles,
                &mut sub_arcs,
                &sub_shapes,
                &sub_constraints,
                iterations,
                tolerance,
                restarts,
                warm_start_iters,
                max_scaled_step,
                &mut sub_groups,
            );
            max_error = max_error.max(component_error);

            let point_map: HashMap<&str, &Point> = sub_points.iter().map(|point| (point.id.as_str(), point)).collect();
            for point in points.iter_mut() {
                if let Some(solved) = point_map.get(point.id.as_str()) {
                    point.x = solved.x;
                    point.y = solved.y;
                }
            }

            let circle_map: HashMap<&str, &Circle> = sub_circles.iter().map(|circle| (circle.id.as_str(), circle)).collect();
            for circle in circles.iter_mut() {
                if let Some(solved) = circle_map.get(circle.id.as_str()) {
                    circle.radius = solved.radius;
                }
            }

            let arc_map: HashMap<&str, &Arc> = sub_arcs.iter().map(|arc| (arc.id.as_str(), arc)).collect();
            for arc in arcs.iter_mut() {
                if let Some(solved) = arc_map.get(arc.id.as_str()) {
                    arc.radius = solved.radius;
                }
            }

            // Read back group frame updates from sub_groups into the main groups.
            let sub_group_map: HashMap<&str, &SketchGroup> = sub_groups.iter().map(|g| (g.id.as_str(), g)).collect();
            for group in groups.iter_mut() {
                if let Some(solved) = sub_group_map.get(group.id.as_str()) {
                    group.x = solved.x;
                    group.y = solved.y;
                    group.theta = solved.theta;
                }
            }
        }
        sanitize_max_error(max_error)
    } else {
        solve_single_system(
            points,
            lines,
            circles,
            arcs,
            shapes,
            constraints,
            iterations,
            tolerance,
            restarts,
            warm_start_iters,
            max_scaled_step,
            groups,
        )
    }
}

/// Run the deterministic presolve / analytical presolve path without numerical
/// iterations. This is used by the TS builder so incremental branch selection
/// is Rust-owned as well.
pub fn presolve(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    options: &SolveOptions,
    groups: &mut Vec<SketchGroup>,
) -> f64 {
    let tolerance = options.tolerance.unwrap_or(1e-3);

    if let Some(plan) = build_solve_plan(points, lines, circles, arcs, shapes, constraints) {
        let mut max_error: f64 = 0.0;
        for component in plan {
            let mut sub_points: Vec<Point> = points
                .iter()
                .filter(|point| component.entity_ids.contains(&point.id))
                .cloned()
                .collect();
            let sub_lines: Vec<Line> = lines
                .iter()
                .filter(|line| component.entity_ids.contains(&line.id))
                .cloned()
                .collect();
            let mut sub_circles: Vec<Circle> = circles
                .iter()
                .filter(|circle| component.entity_ids.contains(&circle.id))
                .cloned()
                .collect();
            let mut sub_arcs: Vec<Arc> = arcs
                .iter()
                .filter(|arc| component.entity_ids.contains(&arc.id))
                .cloned()
                .collect();
            let sub_shapes: Vec<Shape> = shapes
                .iter()
                .filter(|shape| component.entity_ids.contains(&shape.id))
                .cloned()
                .collect();
            let sub_constraints: Vec<Constraint> = component
                .constraint_indices
                .iter()
                .map(|&index| constraints[index].clone())
                .collect();

            // Filter groups whose points are in this component.
            let mut sub_groups: Vec<SketchGroup> = groups
                .iter()
                .filter(|g| g.points.iter().any(|p| component.entity_ids.contains(&p.id)))
                .cloned()
                .collect();

            let component_error = presolve_single_system(
                &mut sub_points,
                &sub_lines,
                &mut sub_circles,
                &mut sub_arcs,
                &sub_shapes,
                &sub_constraints,
                tolerance,
                &mut sub_groups,
            );
            max_error = max_error.max(component_error);

            let point_map: HashMap<&str, &Point> =
                sub_points.iter().map(|point| (point.id.as_str(), point)).collect();
            for point in points.iter_mut() {
                if let Some(solved) = point_map.get(point.id.as_str()) {
                    point.x = solved.x;
                    point.y = solved.y;
                }
            }

            let circle_map: HashMap<&str, &Circle> =
                sub_circles.iter().map(|circle| (circle.id.as_str(), circle)).collect();
            for circle in circles.iter_mut() {
                if let Some(solved) = circle_map.get(circle.id.as_str()) {
                    circle.radius = solved.radius;
                }
            }

            let arc_map: HashMap<&str, &Arc> =
                sub_arcs.iter().map(|arc| (arc.id.as_str(), arc)).collect();
            for arc in arcs.iter_mut() {
                if let Some(solved) = arc_map.get(arc.id.as_str()) {
                    arc.radius = solved.radius;
                }
            }

            // Read back group frame updates.
            let sub_group_map: HashMap<&str, &SketchGroup> = sub_groups.iter().map(|g| (g.id.as_str(), g)).collect();
            for group in groups.iter_mut() {
                if let Some(solved) = sub_group_map.get(group.id.as_str()) {
                    group.x = solved.x;
                    group.y = solved.y;
                    group.theta = solved.theta;
                }
            }
        }
        sanitize_max_error(max_error)
    } else {
        presolve_single_system(points, lines, circles, arcs, shapes, constraints, tolerance, groups)
    }
}

fn solve_single_system(
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
    run_presolve(points, lines, circles, arcs, shapes, constraints, tolerance);
    run_analytical_presolve(points, lines, constraints);

    // Resolve group-owned points from their group frames after presolve.
    resolve_group_points(points, groups);

    let has_any_residual = constraints.iter().any(|c| crate::constraints::has_residual(c))
        || !arcs.is_empty();

    let error = if has_any_residual {
        lm::solve_global(
            points, lines, circles, arcs, shapes, constraints,
            iterations, tolerance, restarts, warm_start_iters, max_scaled_step,
            groups,
        )
    } else {
        gauss_seidel_solve(
            points, lines, circles, arcs, shapes, constraints,
            iterations, tolerance,
        )
    };

    sanitize_max_error(error)
}

fn presolve_single_system(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    tolerance: f64,
    groups: &mut Vec<SketchGroup>,
) -> f64 {
    run_presolve(points, lines, circles, arcs, shapes, constraints, tolerance);
    run_analytical_presolve(points, lines, constraints);

    // Resolve group-owned points from their group frames after presolve.
    resolve_group_points(points, groups);

    sanitize_max_error(lm::current_max_error(
        points, lines, circles, arcs, shapes, constraints,
    ))
}

fn sanitize_max_error(value: f64) -> f64 {
    if value.is_finite() { value.abs() } else { 1e308 }
}

fn run_presolve(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    _circles: &mut Vec<Circle>,
    _arcs: &mut Vec<Arc>,
    _shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    _tolerance: f64,
) {
    // Build shared lookup tables (owned String keys so there's no lifetime conflict with mutations).
    let pts: HashMap<String, usize> = points.iter().enumerate().map(|(i, p)| (p.id.clone(), i)).collect();
    let entity_ref_count = build_entity_ref_count(constraints);

    for c in constraints {
        apply_presolve_constraint(points, lines, &pts, &entity_ref_count, c);
    }
}

pub fn presolve_constraint(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    constraint_id: &str,
    groups: &mut Vec<SketchGroup>,
) -> f64 {
    let pts: HashMap<String, usize> = points.iter().enumerate().map(|(i, p)| (p.id.clone(), i)).collect();
    let entity_ref_count = build_entity_ref_count(constraints);

    if let Some(constraint) = constraints.iter().find(|constraint| constraint.id() == constraint_id) {
        apply_presolve_constraint(points, lines, &pts, &entity_ref_count, constraint);
    }

    // Resolve group-owned points after presolve.
    resolve_group_points(points, groups);

    sanitize_max_error(lm::current_max_error(
        points, lines, circles, arcs, shapes, constraints,
    ))
}

fn apply_presolve_constraint(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    pts: &HashMap<String, usize>,
    entity_ref_count: &HashMap<String, usize>,
    c: &Constraint,
) {
    let point_line_refs = |point_id: &str| -> usize {
        lines.iter().filter(|line| line.a == point_id || line.b == point_id).count()
    };

    match c {
            Constraint::Fixed { point, x, y, .. } => {
                if let Some(&i) = pts.get(point.as_str()) {
                    points[i].x = *x;
                    points[i].y = *y;
                    points[i].fixed = true;
                }
            }
            Constraint::BlockRotation { points: pt_ids, axis, .. } => {
                // Enforce first-edge direction: p0→p1 must increase along axis.
                if pt_ids.len() >= 2 {
                    if let (Some(&i0), Some(&i1)) = (pts.get(pt_ids[0].as_str()), pts.get(pt_ids[1].as_str())) {
                        let delta = if axis == "x" { points[i1].x - points[i0].x } else { points[i1].y - points[i0].y };
                        if delta < 0.0 {
                            let free_pts: Vec<usize> = pt_ids.iter()
                                .filter_map(|id| pts.get(id.as_str()).copied())
                                .filter(|&i| !points[i].fixed)
                                .collect();
                            if !free_pts.is_empty() {
                                let center: f64 = free_pts.iter()
                                    .map(|&i| if axis == "x" { points[i].x } else { points[i].y })
                                    .sum::<f64>() / free_pts.len() as f64;
                                for &i in &free_pts {
                                    if axis == "x" {
                                        points[i].x = 2.0 * center - points[i].x;
                                    } else {
                                        points[i].y = 2.0 * center - points[i].y;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Constraint::Ccw { points: pt_ids, .. } => {
                // Enforce CCW winding via reflection if needed.
                let coords: Vec<(f64, f64)> = pt_ids
                    .iter()
                    .filter_map(|id| pts.get(id.as_str()).map(|&i| (points[i].x, points[i].y)))
                    .collect();
                if coords.len() >= 3 && polygon_signed_area(&coords) < 0.0 {
                    let p0 = pt_ids.get(0).and_then(|id| pts.get(id.as_str())).copied();
                    let p1 = pt_ids.get(1).and_then(|id| pts.get(id.as_str())).copied();
                    let (Some(p0i), Some(p1i)) = (p0, p1) else { return; };
                    let ax = points[p0i].x;
                    let ay = points[p0i].y;
                    let bx = points[p1i].x;
                    let by = points[p1i].y;
                    for id in pt_ids.iter().rev() {
                        if let Some(&i) = pts.get(id.as_str()) {
                            if !points[i].fixed {
                                let (rx, ry) = reflect_point_across_line(points[i].x, points[i].y, ax, ay, bx, by);
                                points[i].x = rx;
                                points[i].y = ry;
                                break;
                            }
                        }
                    }
                }
            }
            Constraint::AbsoluteAngle { line, value, .. } => {
                if let Some(l) = lines.iter().find(|l| &l.id == line) {
                    if let (Some(&ai), Some(&bi)) = (pts.get(l.a.as_str()), pts.get(l.b.as_str())) {
                        if points[ai].fixed && points[bi].fixed {
                            return;
                        }
                        let target = value * std::f64::consts::PI / 180.0;
                        let len = ((points[bi].x - points[ai].x).powi(2)
                            + (points[bi].y - points[ai].y).powi(2))
                        .sqrt()
                        .max(1.0);
                        let cos = target.cos();
                        let sin = target.sin();
                        let a_refs = point_line_refs(l.a.as_str());
                        let b_refs = point_line_refs(l.b.as_str());
                        if points[bi].fixed || (!points[ai].fixed && b_refs > a_refs) {
                            if !points[ai].fixed {
                                points[ai].x = points[bi].x - cos * len;
                                points[ai].y = points[bi].y - sin * len;
                            }
                        } else if !points[bi].fixed {
                            points[bi].x = points[ai].x + cos * len;
                            points[bi].y = points[ai].y + sin * len;
                        }
                    }
                }
            }
            Constraint::Length { line, value, .. } => {
                if let Some(l) = lines.iter().find(|l| &l.id == line) {
                    if let (Some(&ai), Some(&bi)) = (pts.get(l.a.as_str()), pts.get(l.b.as_str())) {
                        let dx = points[bi].x - points[ai].x;
                        let dy = points[bi].y - points[ai].y;
                        let len = dx.hypot(dy);
                        if len < 1e-9 || (len - value).abs() < 1e-9 {
                            return;
                        }
                        let ux = dx / len;
                        let uy = dy / len;
                        let mx = (points[ai].x + points[bi].x) / 2.0;
                        let my = (points[ai].y + points[bi].y) / 2.0;
                        if !points[ai].fixed {
                            points[ai].x = mx - ux * value / 2.0;
                            points[ai].y = my - uy * value / 2.0;
                        }
                        if !points[bi].fixed {
                            points[bi].x = mx + ux * value / 2.0;
                            points[bi].y = my + uy * value / 2.0;
                        }
                    }
                }
            }
            Constraint::LineDistance { a, b, value, .. } => {
                let Some(line_a) = lines.iter().find(|line| &line.id == a) else { return; };
                let Some(line_b) = lines.iter().find(|line| &line.id == b) else { return; };
                let (Some(&a1i), Some(&a2i), Some(&b1i), Some(&b2i)) = (
                    pts.get(line_a.a.as_str()),
                    pts.get(line_a.b.as_str()),
                    pts.get(line_b.a.as_str()),
                    pts.get(line_b.b.as_str()),
                ) else {
                    return;
                };

                let len_a = (points[a2i].x - points[a1i].x).hypot(points[a2i].y - points[a1i].y).max(1e-9);
                let len_b = (points[b2i].x - points[b1i].x).hypot(points[b2i].y - points[b1i].y).max(1e-9);

                let dx_a = points[a2i].x - points[a1i].x;
                let dy_a = points[a2i].y - points[a1i].y;
                let nx = -dy_a / len_a;
                let ny = dx_a / len_a;
                let mid_bx = (points[b1i].x + points[b2i].x) / 2.0;
                let mid_by = (points[b1i].y + points[b2i].y) / 2.0;
                let mid_ax = (points[a1i].x + points[a2i].x) / 2.0;
                let mid_ay = (points[a1i].y + points[a2i].y) / 2.0;
                let current_dist = (mid_bx - mid_ax) * nx + (mid_by - mid_ay) * ny;
                let shift = value - current_dist;
                if shift.abs() < 0.01 {
                    return;
                }

                let all_a_fixed = points[a1i].fixed && points[a2i].fixed;
                let all_b_fixed = points[b1i].fixed && points[b2i].fixed;
                if all_a_fixed && all_b_fixed {
                    return;
                }

                let move_a = if all_a_fixed {
                    false
                } else if all_b_fixed {
                    true
                } else {
                    let refs_a = (entity_ref_count.get(line_a.id.as_str()).copied().unwrap_or(0)
                        + entity_ref_count.get(line_a.a.as_str()).copied().unwrap_or(0)
                        + entity_ref_count.get(line_a.b.as_str()).copied().unwrap_or(0)) as isize;
                    let refs_b = (entity_ref_count.get(line_b.id.as_str()).copied().unwrap_or(0)
                        + entity_ref_count.get(line_b.a.as_str()).copied().unwrap_or(0)
                        + entity_ref_count.get(line_b.b.as_str()).copied().unwrap_or(0)) as isize;
                    if refs_a < refs_b {
                        true
                    } else if refs_a > refs_b {
                        false
                    } else {
                        len_a < len_b || len_a > len_b * 2.0
                    }
                };

                if move_a {
                    if !points[a1i].fixed {
                        points[a1i].x -= nx * shift;
                        points[a1i].y -= ny * shift;
                    }
                    if !points[a2i].fixed {
                        points[a2i].x -= nx * shift;
                        points[a2i].y -= ny * shift;
                    }
                } else {
                    if !points[b1i].fixed {
                        points[b1i].x += nx * shift;
                        points[b1i].y += ny * shift;
                    }
                    if !points[b2i].fixed {
                        points[b2i].x += nx * shift;
                        points[b2i].y += ny * shift;
                    }
                }
            }
            // Horizontal/vertical: snap degenerate zero-length segments.
            Constraint::Horizontal { line, .. } | Constraint::Vertical { line, .. } => {
                if let Some(l) = lines.iter().find(|l| &l.id == line) {
                    if let (Some(&ai), Some(&bi)) = (pts.get(l.a.as_str()), pts.get(l.b.as_str())) {
                        let len = ((points[bi].x - points[ai].x).powi(2)
                            + (points[bi].y - points[ai].y).powi(2))
                        .sqrt();
                        if len < 1e-9 {
                            // Snap to a non-degenerate length-1 orientation.
                            match c {
                                Constraint::Horizontal { .. } => {
                                    if !points[bi].fixed { points[bi].x = points[ai].x + 1.0; }
                                }
                                Constraint::Vertical { .. } => {
                                    if !points[bi].fixed { points[bi].y = points[ai].y + 1.0; }
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
            _ => {}
        }
}

fn build_entity_ref_count(constraints: &Vec<Constraint>) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    let add = |id: &str, counts: &mut HashMap<String, usize>| {
        *counts.entry(id.to_string()).or_insert(0) += 1;
    };

    for constraint in constraints {
        match constraint {
            Constraint::Coincident { a, b, .. }
            | Constraint::Distance { a, b, .. }
            | Constraint::HDistance { a, b, .. }
            | Constraint::VDistance { a, b, .. }
            | Constraint::Equal { a, b, .. }
            | Constraint::Parallel { a, b, .. }
            | Constraint::Perpendicular { a, b, .. }
            | Constraint::Concentric { a, b, .. }
            | Constraint::Angle { a, b, .. }
            | Constraint::LineDistance { a, b, .. }
            | Constraint::EqualRadius { a, b, .. }
            | Constraint::ShapeEqualCentroid { a, b, .. }
            | Constraint::AngleBetween { a, b, .. }
            | Constraint::SameDirection { a, b, .. }
            | Constraint::OppositeDirection { a, b, .. } => {
                add(a, &mut counts);
                add(b, &mut counts);
            }
            Constraint::Horizontal { line, .. }
            | Constraint::Vertical { line, .. }
            | Constraint::Length { line, .. }
            | Constraint::AbsoluteAngle { line, .. } => {
                add(line, &mut counts);
            }
            Constraint::PointOnCircle { point, circle, .. } => {
                add(point, &mut counts);
                add(circle, &mut counts);
            }
            Constraint::Radius { circle, .. } | Constraint::Diameter { circle, .. } => {
                add(circle, &mut counts);
            }
            Constraint::Symmetric { a, b, axis, .. } => {
                add(a, &mut counts);
                add(b, &mut counts);
                add(axis, &mut counts);
            }
            Constraint::Collinear { point, line, .. } => {
                add(point, &mut counts);
                add(line, &mut counts);
            }
            Constraint::Fixed { point, .. } => {
                add(point, &mut counts);
            }
            Constraint::PointOnLine { point, line, .. }
            | Constraint::Midpoint { point, line, .. }
            | Constraint::PointLineDistance { point, line, .. } => {
                add(point, &mut counts);
                add(line, &mut counts);
            }
            Constraint::Tangent { line, circle, a, b, .. } => {
                if let Some(line) = line {
                    add(line, &mut counts);
                }
                if let Some(circle) = circle {
                    add(circle, &mut counts);
                }
                if let Some(a) = a {
                    add(a, &mut counts);
                }
                if let Some(b) = b {
                    add(b, &mut counts);
                }
            }
            Constraint::ArcLength { arc, .. } => {
                add(arc, &mut counts);
            }
            Constraint::LineTangentArc { line, arc, .. } => {
                add(line, &mut counts);
                add(arc, &mut counts);
            }
            Constraint::ShapeCentroidX { shape, .. }
            | Constraint::ShapeCentroidY { shape, .. }
            | Constraint::ShapeWidth { shape, .. }
            | Constraint::ShapeHeight { shape, .. }
            | Constraint::ShapeArea { shape, .. } => {
                add(shape, &mut counts);
            }
            Constraint::Ccw { points, .. } | Constraint::BlockRotation { points, .. } => {
                for point in points {
                    add(point, &mut counts);
                }
            }
        }
    }

    counts
}

fn polygon_signed_area(pts: &[(f64, f64)]) -> f64 {
    let n = pts.len();
    let mut area = 0.0;
    for i in 0..n {
        let j = (i + 1) % n;
        area += pts[i].0 * pts[j].1 - pts[j].0 * pts[i].1;
    }
    area / 2.0
}

fn reflect_point_across_line(
    px: f64,
    py: f64,
    ax: f64,
    ay: f64,
    bx: f64,
    by: f64,
) -> (f64, f64) {
    let dx = bx - ax;
    let dy = by - ay;
    let len2 = dx * dx + dy * dy;
    if len2 < 1e-12 {
        return (px, py);
    }
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    let proj_x = ax + t * dx;
    let proj_y = ay + t * dy;
    (2.0 * proj_x - px, 2.0 * proj_y - py)
}

/// Gauss-Seidel fallback for constraints without residual models.
fn gauss_seidel_solve(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    iterations: u32,
    tolerance: f64,
) -> f64 {
    let gs_iters = (iterations * 5).max(200);
    let mut max_error = 0.0f64;

    for _ in 0..gs_iters {
        max_error = 0.0;
        for c in constraints {
            let err = crate::constraints::apply_projector(
                c, points, lines, circles, arcs, shapes, tolerance,
            );
            max_error = max_error.max(err);
        }
        if max_error <= tolerance {
            break;
        }
    }

    max_error
}

/// Evaluate max-abs residual for the current state (used by tests).
pub fn eval_max_error(
    points: &Vec<Point>,
    lines: &Vec<Line>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
) -> f64 {
    let res = evaluate_residuals(points, lines, circles, arcs, shapes, constraints);
    res.iter().copied().fold(0.0f64, |a, v| a.max(v.abs()))
}

pub fn analyze_solution(
    points: &Vec<Point>,
    lines: &Vec<Line>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    max_error: f64,
    options: &SolveOptions,
    groups: &Vec<SketchGroup>,
) -> SolveMetadata {
    let tolerance = options.tolerance.unwrap_or(1e-3);
    let dof = compute_dof(points, circles, arcs, groups, constraints);
    let status = compute_status(dof, max_error, tolerance);
    let constraint_residuals = constraints
        .iter()
        .map(|constraint| ConstraintResidual {
            id: constraint.id().to_string(),
            residual: constraint_residual_impl(constraint, points, lines, circles, arcs, shapes)
                .into_iter()
                .fold(0.0f64, |acc, value| acc.max(value.abs())),
        })
        .collect();
    let conflicting_constraint_ids = if !max_error.is_finite() || max_error > tolerance * 5.0 {
        constraints.iter().map(|constraint| constraint.id().to_string()).collect()
    } else {
        Vec::new()
    };
    let redundant_constraint_ids = if dof < 0
        && max_error.is_finite()
        && max_error <= tolerance * 5.0
        && !options.skip_redundancy_check.unwrap_or(false)
    {
        find_redundant_constraints(points, lines, circles, arcs, shapes, constraints, (-dof) as usize, groups)
    } else {
        Vec::new()
    };

    SolveMetadata {
        status,
        dof,
        constraint_residuals,
        redundant_constraint_ids,
        conflicting_constraint_ids,
    }
}

fn compute_dof(
    points: &Vec<Point>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    groups: &Vec<SketchGroup>,
    constraints: &Vec<Constraint>,
) -> i32 {
    // Build set of group-owned point IDs
    let group_point_ids: std::collections::HashSet<&str> = groups.iter()
        .flat_map(|g| g.points.iter().map(|p| p.id.as_str()))
        .collect();

    // Free point vars: exclude group-owned points and fixed points
    let free_point_vars = points.iter()
        .filter(|p| !p.fixed && !group_point_ids.contains(p.id.as_str()))
        .count() as i32 * 2;

    // Group vars
    let group_vars: i32 = groups.iter().map(|g| g.dof_count()).sum();

    let free_vars = free_point_vars + group_vars
        + circles.iter().filter(|c| !c.fixed_radius).count() as i32
        + arcs.len() as i32 * (1 - 2);

    let constraint_eqs: i32 = constraints.iter().map(|c| c.equation_count()).sum();
    free_vars - constraint_eqs
}

fn compute_status(dof: i32, max_error: f64, tolerance: f64) -> SolveStatus {
    if !max_error.is_finite() || max_error > tolerance * 5.0 {
        SolveStatus::Over
    } else if dof > 0 {
        SolveStatus::Under
    } else if dof < 0 {
        SolveStatus::OverRedundant
    } else {
        SolveStatus::Fully
    }
}

#[derive(Clone)]
enum VariableRef {
    PointX(usize),
    PointY(usize),
    CircleRadius(usize),
    ArcRadius(usize),
    GroupX(usize),
    GroupY(usize),
    GroupTheta(usize),
}

#[derive(Clone)]
struct VariableInfo {
    entity_id: String,
    key: String,
    scale: f64,
    reference: VariableRef,
}

impl VariableInfo {
    fn get(&self, points: &Vec<Point>, circles: &Vec<Circle>, arcs: &Vec<Arc>, groups: &Vec<SketchGroup>) -> f64 {
        match self.reference {
            VariableRef::PointX(index) => points[index].x,
            VariableRef::PointY(index) => points[index].y,
            VariableRef::CircleRadius(index) => circles[index].radius,
            VariableRef::ArcRadius(index) => arcs[index].radius,
            VariableRef::GroupX(index) => groups[index].x,
            VariableRef::GroupY(index) => groups[index].y,
            VariableRef::GroupTheta(index) => groups[index].theta,
        }
    }

    fn set(&self, points: &mut Vec<Point>, circles: &mut Vec<Circle>, arcs: &mut Vec<Arc>, groups: &mut Vec<SketchGroup>, value: f64) {
        match self.reference {
            VariableRef::PointX(index) => points[index].x = value,
            VariableRef::PointY(index) => points[index].y = value,
            VariableRef::CircleRadius(index) => circles[index].radius = value.max(1e-9),
            VariableRef::ArcRadius(index) => arcs[index].radius = value.max(1e-9),
            VariableRef::GroupX(index) => groups[index].x = value,
            VariableRef::GroupY(index) => groups[index].y = value,
            VariableRef::GroupTheta(index) => groups[index].theta = value,
        }
    }
}

fn build_analysis_variables(
    points: &Vec<Point>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    groups: &Vec<SketchGroup>,
) -> Vec<VariableInfo> {
    let scale = compute_reference_length(points, circles, arcs).max(1.0);
    let mut variables = Vec::new();

    // Build set of group-owned point IDs to skip them as individual variables.
    let group_point_ids: std::collections::HashSet<&str> = groups.iter()
        .flat_map(|g| g.points.iter().map(|p| p.id.as_str()))
        .collect();

    for (index, point) in points.iter().enumerate() {
        if point.fixed {
            continue;
        }
        // Skip group-owned points — their positions are derived from the group frame.
        if group_point_ids.contains(point.id.as_str()) {
            continue;
        }
        variables.push(VariableInfo {
            entity_id: point.id.clone(),
            key: format!("{}.x", point.id),
            scale,
            reference: VariableRef::PointX(index),
        });
        variables.push(VariableInfo {
            entity_id: point.id.clone(),
            key: format!("{}.y", point.id),
            scale,
            reference: VariableRef::PointY(index),
        });
    }

    for (index, circle) in circles.iter().enumerate() {
        if circle.fixed_radius {
            continue;
        }
        variables.push(VariableInfo {
            entity_id: circle.id.clone(),
            key: format!("{}.r", circle.id),
            scale,
            reference: VariableRef::CircleRadius(index),
        });
    }

    for (index, arc) in arcs.iter().enumerate() {
        variables.push(VariableInfo {
            entity_id: arc.id.clone(),
            key: format!("{}.r", arc.id),
            scale,
            reference: VariableRef::ArcRadius(index),
        });
    }

    // Add group frame variables.
    for (index, group) in groups.iter().enumerate() {
        if group.fixed {
            continue;
        }
        variables.push(VariableInfo {
            entity_id: group.id.clone(),
            key: format!("{}.gx", group.id),
            scale,
            reference: VariableRef::GroupX(index),
        });
        variables.push(VariableInfo {
            entity_id: group.id.clone(),
            key: format!("{}.gy", group.id),
            scale,
            reference: VariableRef::GroupY(index),
        });
        if !group.fixed_rotation {
            variables.push(VariableInfo {
                entity_id: group.id.clone(),
                key: format!("{}.gtheta", group.id),
                scale: 1.0, // angular variable, unit scale
                reference: VariableRef::GroupTheta(index),
            });
        }
    }

    variables
}

fn compute_reference_length(points: &Vec<Point>, circles: &Vec<Circle>, arcs: &Vec<Arc>) -> f64 {
    let mut xs: Vec<f64> = Vec::new();
    let mut ys: Vec<f64> = Vec::new();

    for point in points {
        xs.push(point.x);
        ys.push(point.y);
    }

    for circle in circles {
        xs.push(circle.radius);
        xs.push(-circle.radius);
        ys.push(circle.radius);
        ys.push(-circle.radius);
    }

    for arc in arcs {
        xs.push(arc.radius);
        xs.push(-arc.radius);
        ys.push(arc.radius);
        ys.push(-arc.radius);
    }

    if xs.is_empty() || ys.is_empty() {
        return 1.0;
    }

    let span_x = xs.iter().copied().fold(f64::NEG_INFINITY, f64::max)
        - xs.iter().copied().fold(f64::INFINITY, f64::min);
    let span_y = ys.iter().copied().fold(f64::NEG_INFINITY, f64::max)
        - ys.iter().copied().fold(f64::INFINITY, f64::min);
    span_x.hypot(span_y).max(1.0)
}

fn find_redundant_constraints(
    points: &Vec<Point>,
    lines: &Vec<Line>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    target_removals: usize,
    groups: &Vec<SketchGroup>,
) -> Vec<String> {
    let mut work_points = points.clone();
    let mut work_circles = circles.clone();
    let mut work_arcs = arcs.clone();
    let mut work_groups = groups.clone();
    let variables = build_analysis_variables(points, circles, arcs, groups);
    if variables.is_empty() {
        return Vec::new();
    }

    let key_to_col: HashMap<String, usize> = variables
        .iter()
        .enumerate()
        .map(|(index, variable)| (variable.key.clone(), index))
        .collect();
    let n_vars = variables.len();
    let mut jacobian_rows: Vec<Vec<f64>> = Vec::new();
    let mut row_to_constraint_id: Vec<String> = Vec::new();

    for constraint in constraints {
        if !has_residual(constraint) {
            continue;
        }

        if let Some((residuals, partials)) =
            constraint_jacobian_impl(constraint, &work_points, lines, &work_circles, &work_arcs, shapes)
        {
            for row_index in 0..residuals.len() {
                let mut row = vec![0.0; n_vars];
                for (key, derivs) in &partials {
                    if let Some(&col) = key_to_col.get(key) {
                        row[col] = derivs[row_index];
                    }
                }
                jacobian_rows.push(row);
                row_to_constraint_id.push(constraint.id().to_string());
            }
            continue;
        }

        let base_residuals =
            constraint_residual_impl(constraint, &work_points, lines, &work_circles, &work_arcs, shapes);
        for residual_index in 0..base_residuals.len() {
            let mut row = vec![0.0; n_vars];
            for (var_index, variable) in variables.iter().enumerate() {
                let original = variable.get(&work_points, &work_circles, &work_arcs, &work_groups);
                let step = 1e-6 * original.abs().max(1.0).max(variable.scale);
                variable.set(&mut work_points, &mut work_circles, &mut work_arcs, &mut work_groups, original + step);
                // If this is a group variable, resolve group-owned points so residuals see updated positions.
                match variable.reference {
                    VariableRef::GroupX(_) | VariableRef::GroupY(_) | VariableRef::GroupTheta(_) => {
                        resolve_group_points(&mut work_points, &work_groups);
                    }
                    _ => {}
                }
                let perturbed =
                    constraint_residual_impl(constraint, &work_points, lines, &work_circles, &work_arcs, shapes);
                row[var_index] = (perturbed[residual_index] - base_residuals[residual_index]) / step;
                variable.set(&mut work_points, &mut work_circles, &mut work_arcs, &mut work_groups, original);
                // Restore group-owned points after resetting group variable.
                match variable.reference {
                    VariableRef::GroupX(_) | VariableRef::GroupY(_) | VariableRef::GroupTheta(_) => {
                        resolve_group_points(&mut work_points, &work_groups);
                    }
                    _ => {}
                }
            }
            jacobian_rows.push(row);
            row_to_constraint_id.push(constraint.id().to_string());
        }
    }

    let m = jacobian_rows.len();
    if m == 0 {
        return Vec::new();
    }

    let n = n_vars;
    let mut cols = jacobian_rows.clone();
    let mut pivot_order: Vec<usize> = (0..m).collect();
    let rank = m.min(n);
    let mut detected_rank = rank;
    let mut col_norms_sq: Vec<f64> = cols
        .iter()
        .map(|col| col.iter().map(|value| value * value).sum())
        .collect();

    for k in 0..rank {
        let mut max_norm = col_norms_sq[k];
        let mut max_index = k;
        for j in (k + 1)..m {
            if col_norms_sq[j] > max_norm {
                max_norm = col_norms_sq[j];
                max_index = j;
            }
        }

        if max_norm < 1e-12 {
            detected_rank = k;
            break;
        }

        if max_index != k {
            cols.swap(k, max_index);
            pivot_order.swap(k, max_index);
            col_norms_sq.swap(k, max_index);
        }

        let col = cols[k].clone();
        let sigma: f64 = col.iter().skip(k).map(|value| value * value).sum();
        let norm = sigma.sqrt();
        if norm < 1e-14 {
            detected_rank = k;
            break;
        }

        let sign = if col[k] >= 0.0 { 1.0 } else { -1.0 };
        let u0 = col[k] + sign * norm;
        let mut v = vec![0.0; n];
        v[k] = 1.0;
        for i in (k + 1)..n {
            v[i] = col[i] / u0;
        }
        let tau = sign * u0 / norm;

        for j in k..m {
            let mut dot = 0.0;
            for i in k..n {
                dot += v[i] * cols[j][i];
            }
            dot *= tau;
            for i in k..n {
                cols[j][i] -= dot * v[i];
            }
        }

        for j in (k + 1)..m {
            col_norms_sq[j] = 0.0;
            for i in (k + 1)..n {
                col_norms_sq[j] += cols[j][i] * cols[j][i];
            }
        }
    }

    let mut redundant_eq_indices = std::collections::HashSet::new();
    for index in detected_rank..m {
        redundant_eq_indices.insert(pivot_order[index]);
    }

    let mut by_constraint: HashMap<String, (usize, usize)> = HashMap::new();
    for (index, constraint_id) in row_to_constraint_id.iter().enumerate() {
        let entry = by_constraint.entry(constraint_id.clone()).or_insert((0, 0));
        entry.1 += 1;
        if redundant_eq_indices.contains(&index) {
            entry.0 += 1;
        }
    }

    let mut redundant = Vec::new();
    for constraint in constraints {
        if redundant.len() >= target_removals {
            break;
        }
        if let Some((redundant_count, total_count)) = by_constraint.get(constraint.id()) {
            if *total_count > 0 && redundant_count == total_count {
                redundant.push(constraint.id().to_string());
            }
        }
    }

    redundant
}
