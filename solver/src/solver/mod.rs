pub mod decompose;
pub mod linear;
pub mod lm;

use std::collections::HashMap;
use crate::constraints::evaluate_residuals;
use crate::types::{Arc, Circle, Constraint, Line, Point, Shape, SolveOptions};

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
) -> f64 {
    let iterations = options.iterations.unwrap_or(80);
    let tolerance = options.tolerance.unwrap_or(1e-3);
    let restarts = options.restarts.unwrap_or(6);
    let warm_start_iters = options.warm_start_iterations.unwrap_or(6);
    let max_scaled_step = options.max_scaled_step.unwrap_or(2.5);

    // Presolve pass: pin fixed points, snap angles.
    run_presolve(points, lines, circles, arcs, shapes, constraints, tolerance);

    // Check if every constraint has a residual model.
    let has_full_model = constraints.iter().all(|c| {
        crate::constraints::has_residual(c)
    });

    if has_full_model {
        lm::solve_global(
            points, lines, circles, arcs, shapes, constraints,
            iterations, tolerance, restarts, warm_start_iters, max_scaled_step,
        )
    } else {
        gauss_seidel_solve(
            points, lines, circles, arcs, shapes, constraints,
            iterations, tolerance,
        )
    }
}

fn run_presolve(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    tolerance: f64,
) {
    // Build shared lookup tables (owned String keys so there's no lifetime conflict with mutations).
    let pts: HashMap<String, usize> = points.iter().enumerate().map(|(i, p)| (p.id.clone(), i)).collect();
    for c in constraints {
        match c {
            Constraint::Fixed { point, x, y, .. } => {
                if let Some(&i) = pts.get(point.as_str()) {
                    points[i].x = *x;
                    points[i].y = *y;
                    points[i].fixed = true;
                }
            }
            Constraint::Ccw { points: pt_ids, .. } => {
                // Enforce CCW winding via reflection if needed.
                let coords: Vec<(f64, f64)> = pt_ids
                    .iter()
                    .filter_map(|id| pts.get(id.as_str()).map(|&i| (points[i].x, points[i].y)))
                    .collect();
                if coords.len() >= 3 && polygon_signed_area(&coords) < 0.0 {
                    // Reverse order by reflecting across the centroid x-axis.
                    let cx = coords.iter().map(|(x, _)| x).sum::<f64>() / coords.len() as f64;
                    for id in pt_ids {
                        if let Some(&i) = pts.get(id.as_str()) {
                            if !points[i].fixed {
                                points[i].x = 2.0 * cx - points[i].x;
                            }
                        }
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
    let _ = (circles, arcs, shapes, tolerance);
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
