mod constraints;
mod solver;
pub mod types;

use wasm_bindgen::prelude::*;
use types::{ArcResult, CircleResult, PointResult, Problem, SolveOptions, SolveResult};

/// Set up the panic hook once on WASM init so panics surface in the browser console.
#[wasm_bindgen(start)]
pub fn start() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// Solve a constraint system from JSON.
///
/// `problem_json` must be a JSON-serialized [`Problem`].
/// Returns a JSON-serialized [`SolveResult`] with updated coordinates and max error.
///
/// On parse errors returns `{"max_error":1e308,"points":[],"circles":[],"arcs":[]}`.
#[wasm_bindgen]
pub fn solve(problem_json: &str) -> String {
    match solve_inner(problem_json) {
        Ok(result) => serde_json::to_string(&result).unwrap_or_default(),
        Err(_) => r#"{"max_error":1e308,"points":[],"circles":[],"arcs":[]}"#.to_string(),
    }
}

fn solve_inner(problem_json: &str) -> Result<SolveResult, serde_json::Error> {
    let mut problem: Problem = serde_json::from_str(problem_json)?;
    let options = problem.options.clone().unwrap_or_default();
    let max_error = solver::solve(
        &mut problem.points,
        &problem.lines,
        &mut problem.circles,
        &mut problem.arcs,
        &problem.shapes,
        &problem.constraints,
        &options,
    );
    Ok(build_result(max_error, &problem))
}

fn build_result(max_error: f64, problem: &Problem) -> SolveResult {
    SolveResult {
        max_error,
        points: problem
            .points
            .iter()
            .map(|p| PointResult { id: p.id.clone(), x: p.x, y: p.y })
            .collect(),
        circles: problem
            .circles
            .iter()
            .map(|c| CircleResult { id: c.id.clone(), radius: c.radius })
            .collect(),
        arcs: problem
            .arcs
            .iter()
            .map(|a| ArcResult { id: a.id.clone(), radius: a.radius })
            .collect(),
    }
}

/// Native Rust entry point (used in tests — no WASM overhead).
pub fn solve_problem(mut problem: Problem, options: Option<SolveOptions>) -> SolveResult {
    let opts = options.unwrap_or_default();
    let max_error = solver::solve(
        &mut problem.points,
        &problem.lines,
        &mut problem.circles,
        &mut problem.arcs,
        &problem.shapes,
        &problem.constraints,
        &opts,
    );
    build_result(max_error, &problem)
}
