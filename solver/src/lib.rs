pub mod constraints;
mod solver;
pub mod types;

use wasm_bindgen::prelude::*;
use types::{
    ArcResult, CircleResult, GroupResult, PointResult, Problem, SolveExchange, SolveExchangeKind,
    SolveOptions, SolveResult,
};

/// Set up the panic hook once on WASM init so panics surface in the browser console.
#[wasm_bindgen(start)]
pub fn start() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// Return the profiling data from the last solve call as JSON.
#[wasm_bindgen]
pub fn get_last_profile() -> String {
    let p = solver::profiler::snapshot();
    solver::profiler::to_json(&p)
}

/// Solve a constraint system from JSON.
#[wasm_bindgen]
pub fn solve(problem_json: &str) -> String {
    match solve_inner(problem_json) {
        Ok(result) => serde_json::to_string(&result).unwrap_or_default(),
        Err(_) => r#"{"max_error":1e308,"points":[],"circles":[],"arcs":[]}"#.to_string(),
    }
}

/// Run only the deterministic presolve stages and return the updated geometry.
#[wasm_bindgen]
pub fn presolve(problem_json: &str) -> String {
    match presolve_inner(problem_json) {
        Ok(result) => serde_json::to_string(&result).unwrap_or_default(),
        Err(_) => r#"{"max_error":1e308,"points":[],"circles":[],"arcs":[]}"#.to_string(),
    }
}

/// Run the targeted presolve hook for one constraint and return the updated geometry.
#[wasm_bindgen]
pub fn presolve_single(problem_json: &str, constraint_id: &str) -> String {
    match presolve_single_inner(problem_json, constraint_id) {
        Ok(result) => serde_json::to_string(&result).unwrap_or_default(),
        Err(_) => r#"{"max_error":1e308,"points":[],"circles":[],"arcs":[]}"#.to_string(),
    }
}

fn solve_inner(problem_json: &str) -> Result<SolveResult, serde_json::Error> {
    solver::profiler::reset();

    let mut problem: Problem = solver::profiler::timed(
        |p, us| p.deserialize_us = us,
        || serde_json::from_str(problem_json),
    )?;

    solver::profiler::timed(
        |p, us| p.expand_groups_us = us,
        || solver::expand_groups(&mut problem),
    );

    solver::profiler::add(|p| {
        p.n_constraints = problem.constraints.len() as u32;
        p.n_points = problem.points.len() as u32;
    });

    let options = problem.options.clone().unwrap_or_default();
    let max_error = solver::solve(
        &mut problem.points, &problem.lines, &mut problem.circles, &mut problem.arcs,
        &problem.shapes, &problem.constraints, &options, &mut problem.groups,
    );

    // Strip auto-detected groups before analysis — DOF calculation should
    // use the original constraint/point structure, not the internal optimization.
    problem.groups.retain(|g| !g.auto_detected);

    let metadata = solver::profiler::timed(
        |p, us| p.analyze_solution_us = us,
        || solver::analyze_solution(
            &problem.points, &problem.lines, &problem.circles, &problem.arcs,
            &problem.shapes, &problem.constraints, max_error, &options, &problem.groups,
        ),
    );

    Ok(build_result(max_error, &problem, Some(metadata)))
}

fn presolve_inner(problem_json: &str) -> Result<SolveResult, serde_json::Error> {
    let mut problem: Problem = serde_json::from_str(problem_json)?;
    solver::expand_groups(&mut problem);
    let options = problem.options.clone().unwrap_or_default();
    let max_error = solver::presolve(
        &mut problem.points, &problem.lines, &mut problem.circles, &mut problem.arcs,
        &problem.shapes, &problem.constraints, &options, &mut problem.groups,
    );
    Ok(build_result(max_error, &problem, None))
}

fn presolve_single_inner(problem_json: &str, constraint_id: &str) -> Result<SolveResult, serde_json::Error> {
    let mut problem: Problem = serde_json::from_str(problem_json)?;
    solver::expand_groups(&mut problem);
    let max_error = solver::presolve_constraint(
        &mut problem.points, &problem.lines, &problem.circles, &problem.arcs,
        &problem.shapes, &problem.constraints, constraint_id, &mut problem.groups,
    );
    Ok(build_result(max_error, &problem, None))
}

fn build_result(
    max_error: f64,
    problem: &Problem,
    metadata: Option<types::SolveMetadata>,
) -> SolveResult {
    SolveResult {
        max_error: if max_error.is_finite() { max_error.abs() } else { 1e308 },
        points: problem.points.iter()
            .map(|p| PointResult { id: p.id.clone(), x: p.x, y: p.y })
            .collect(),
        circles: problem.circles.iter()
            .map(|c| CircleResult { id: c.id.clone(), radius: c.radius })
            .collect(),
        arcs: problem.arcs.iter()
            .map(|a| ArcResult { id: a.id.clone(), radius: a.radius })
            .collect(),
        groups: problem.groups.iter()
            .filter(|g| !g.auto_detected)
            .map(|g| GroupResult { id: g.id.clone(), x: g.x, y: g.y, theta: g.theta })
            .collect(),
        metadata,
    }
}

fn solve_problem_with_embedded_options(mut problem: Problem) -> SolveResult {
    solver::expand_groups(&mut problem);
    let options = problem.options.clone().unwrap_or_default();
    let max_error = solver::solve(
        &mut problem.points, &problem.lines, &mut problem.circles, &mut problem.arcs,
        &problem.shapes, &problem.constraints, &options, &mut problem.groups,
    );
    let metadata = solver::analyze_solution(
        &problem.points, &problem.lines, &problem.circles, &problem.arcs,
        &problem.shapes, &problem.constraints, max_error, &options, &problem.groups,
    );
    build_result(max_error, &problem, Some(metadata))
}

fn presolve_problem_with_embedded_options(mut problem: Problem) -> SolveResult {
    solver::expand_groups(&mut problem);
    let options = problem.options.clone().unwrap_or_default();
    let max_error = solver::presolve(
        &mut problem.points, &problem.lines, &mut problem.circles, &mut problem.arcs,
        &problem.shapes, &problem.constraints, &options, &mut problem.groups,
    );
    build_result(max_error, &problem, None)
}

fn presolve_single_problem(problem: Problem, constraint_id: &str) -> SolveResult {
    let mut problem = problem;
    solver::expand_groups(&mut problem);
    let max_error = solver::presolve_constraint(
        &mut problem.points, &problem.lines, &problem.circles, &problem.arcs,
        &problem.shapes, &problem.constraints, constraint_id, &mut problem.groups,
    );
    build_result(max_error, &problem, None)
}

/// Native Rust entry point (used in tests — no WASM overhead).
pub fn solve_problem(mut problem: Problem, options: Option<SolveOptions>) -> SolveResult {
    solver::expand_groups(&mut problem);
    let opts = options.unwrap_or_default();
    let max_error = solver::solve(
        &mut problem.points, &problem.lines, &mut problem.circles, &mut problem.arcs,
        &problem.shapes, &problem.constraints, &opts, &mut problem.groups,
    );
    let metadata = solver::analyze_solution(
        &problem.points, &problem.lines, &problem.circles, &problem.arcs,
        &problem.shapes, &problem.constraints, max_error, &opts, &problem.groups,
    );
    build_result(max_error, &problem, Some(metadata))
}

pub fn replay_solve_exchange(exchange: SolveExchange) -> SolveResult {
    match exchange.kind {
        SolveExchangeKind::Solve => solve_problem_with_embedded_options(exchange.request),
        SolveExchangeKind::Presolve => presolve_problem_with_embedded_options(exchange.request),
        SolveExchangeKind::PresolveSingle => presolve_single_problem(
            exchange.request,
            exchange.constraint_id.as_deref().unwrap_or(""),
        ),
    }
}

pub fn replay_solve_exchange_json(exchange_json: &str) -> Result<SolveResult, serde_json::Error> {
    let exchange: SolveExchange = serde_json::from_str(exchange_json)?;
    Ok(replay_solve_exchange(exchange))
}

// ─── Stateful Solver Session API ─────────────────────────────────────────────

/// Create a new solver session. Returns an opaque handle (u32).
#[wasm_bindgen]
pub fn session_create() -> u32 {
    solver::session::session_create()
}

/// Destroy a solver session and free its memory.
#[wasm_bindgen]
pub fn session_destroy(handle: u32) {
    solver::session::session_destroy(handle);
}

/// Add a point to the session.
#[wasm_bindgen]
pub fn session_add_point(handle: u32, id: &str, x: f64, y: f64, fixed: bool) {
    solver::session::with_session(handle, |s| {
        s.add_point(id.to_string(), x, y, fixed);
    });
}

/// Add a line to the session.
#[wasm_bindgen]
pub fn session_add_line(handle: u32, id: &str, a: &str, b: &str) {
    solver::session::with_session(handle, |s| {
        s.add_line(id.to_string(), a.to_string(), b.to_string());
    });
}

/// Add a circle to the session.
#[wasm_bindgen]
pub fn session_add_circle(handle: u32, id: &str, center: &str, radius: f64, fixed_radius: bool) {
    solver::session::with_session(handle, |s| {
        s.add_circle(id.to_string(), center.to_string(), radius, fixed_radius);
    });
}

/// Add an arc to the session.
#[wasm_bindgen]
pub fn session_add_arc(handle: u32, id: &str, center: &str, start: &str, end: &str, radius: f64, clockwise: bool) {
    solver::session::with_session(handle, |s| {
        s.add_arc(id.to_string(), center.to_string(), start.to_string(), end.to_string(), radius, clockwise);
    });
}

/// Add a shape to the session.
#[wasm_bindgen]
pub fn session_add_shape(handle: u32, id: &str, line_ids_json: &str) {
    if let Ok(line_ids) = serde_json::from_str::<Vec<String>>(line_ids_json) {
        solver::session::with_session(handle, |s| {
            s.add_shape(id.to_string(), line_ids);
        });
    }
}

/// Add a constraint to the session and optionally run a seed step.
/// constraint_json is a single serialized Constraint.
/// If seed is true, runs a mini-solve after adding.
/// Returns the max error after the step (or -1 on error).
#[wasm_bindgen]
pub fn session_add_constraint(handle: u32, constraint_json: &str, seed: bool) -> f64 {
    match serde_json::from_str::<types::Constraint>(constraint_json) {
        Ok(constraint) => {
            solver::session::with_session(handle, |s| {
                s.add_constraint(constraint);
                if seed {
                    s.seed_step()
                } else {
                    0.0
                }
            }).unwrap_or(-1.0)
        }
        Err(_) => -1.0,
    }
}

/// Add a group to the session.
#[wasm_bindgen]
pub fn session_add_group(handle: u32, group_json: &str) {
    if let Ok(group) = serde_json::from_str::<types::SketchGroup>(group_json) {
        solver::session::with_session(handle, |s| {
            s.add_group(group);
        });
    }
}

/// Run the full solver on the session's current state.
/// Returns the solve result as JSON (same format as the stateless solve()).
#[wasm_bindgen]
pub fn session_solve(handle: u32, options_json: &str) -> String {
    let options: SolveOptions = serde_json::from_str(options_json).unwrap_or_default();

    solver::profiler::reset();

    let max_error = solver::session::with_session(handle, |s| {
        s.solve_full(&options)
    }).unwrap_or(1e308);

    // Build result from session state.
    let result = solver::session::with_session(handle, |s| {
        SolveResult {
            max_error: if max_error.is_finite() { max_error.abs() } else { 1e308 },
            points: s.points.iter()
                .map(|p| PointResult { id: p.id.clone(), x: p.x, y: p.y })
                .collect(),
            circles: s.circles.iter()
                .map(|c| CircleResult { id: c.id.clone(), radius: c.radius })
                .collect(),
            arcs: s.arcs.iter()
                .map(|a| ArcResult { id: a.id.clone(), radius: a.radius })
                .collect(),
            groups: s.groups.iter()
                .filter(|g| !g.auto_detected)
                .map(|g| GroupResult { id: g.id.clone(), x: g.x, y: g.y, theta: g.theta })
                .collect(),
            metadata: None,
        }
    });

    match result {
        Some(r) => serde_json::to_string(&r).unwrap_or_default(),
        None => r#"{"max_error":1e308,"points":[],"circles":[],"arcs":[]}"#.to_string(),
    }
}

/// Get the current positions of all points in the session as JSON.
/// Lightweight alternative to session_solve for reading state after seed steps.
#[wasm_bindgen]
pub fn session_get_points(handle: u32) -> String {
    let result = solver::session::with_session(handle, |s| {
        let points: Vec<PointResult> = s.points.iter()
            .map(|p| PointResult { id: p.id.clone(), x: p.x, y: p.y })
            .collect();
        serde_json::to_string(&points).unwrap_or_default()
    });
    result.unwrap_or_else(|| "[]".to_string())
}
