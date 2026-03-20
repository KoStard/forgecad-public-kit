//! Per-solve profiling infrastructure.
//!
//! Uses thread-local storage to accumulate timing data during a solve.
//! Call `reset()` before a solve, instrument phases with `timed()`,
//! then read back with `snapshot()`.
//!
//! Timing uses `performance.now()` in WASM and `std::time::Instant` natively.

use std::cell::RefCell;

// ─── Platform-abstracted high-resolution timer ───────────────────────────────

#[cfg(target_arch = "wasm32")]
pub mod platform {
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen]
    extern "C" {
        #[wasm_bindgen(js_namespace = performance)]
        fn now() -> f64;
    }

    /// Returns current time in microseconds (monotonic within a page).
    #[inline]
    pub fn now_us() -> u64 {
        (now() * 1000.0) as u64
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub mod platform {
    use std::time::Instant;
    use std::cell::Cell;

    thread_local! {
        static EPOCH: Cell<Option<Instant>> = Cell::new(None);
    }

    #[inline]
    pub fn now_us() -> u64 {
        EPOCH.with(|e| {
            let epoch = match e.get() {
                Some(t) => t,
                None => { let t = Instant::now(); e.set(Some(t)); t }
            };
            epoch.elapsed().as_micros() as u64
        })
    }
}

// ─── Profile data ────────────────────────────────────────────────────────────

/// Accumulated timing data for a single solve call.
#[derive(Default, Clone)]
pub struct SolverProfile {
    // ── Top-level phases ────────────────────────────────────────────────────
    pub deserialize_us: u64,
    pub expand_groups_us: u64,
    pub presolve_us: u64,
    pub analytical_presolve_us: u64,
    pub build_variables_us: u64,
    pub build_sparsity_us: u64,
    pub gs_warmstart_us: u64,
    pub lm_total_us: u64,
    pub reconstruction_graph_us: u64,
    pub dag_decompose_us: u64,
    pub analyze_solution_us: u64,
    pub serialize_us: u64,
    pub progressive_total_us: u64,

    // ── LM internals ────────────────────────────────────────────────────────
    pub linearize_count: u32,
    pub linearize_us: u64,
    pub linearize_residual_us: u64,
    pub linearize_analytic_us: u64,
    pub linearize_fd_us: u64,
    pub lm_step_count: u32,
    pub lm_step_us: u64,
    pub state_capture_count: u32,
    pub state_capture_us: u64,
    pub state_apply_count: u32,
    pub state_apply_us: u64,

    // ── Iteration counts ────────────────────────────────────────────────────
    pub lm_outer_iterations: u32,
    pub lm_inner_retries: u32,
    pub lm_accepted_steps: u32,
    pub lm_restarts: u32,
    pub gs_escape_rounds: u32,
    pub progressive_steps: u32,

    // ── Problem size ────────────────────────────────────────────────────────
    pub n_vars: u32,
    pub n_rows: u32,
    pub n_constraints: u32,
    pub n_points: u32,
}

thread_local! {
    static PROFILE: RefCell<SolverProfile> = RefCell::new(SolverProfile::default());
}

pub fn reset() {
    PROFILE.with(|p| *p.borrow_mut() = SolverProfile::default());
}

pub fn snapshot() -> SolverProfile {
    PROFILE.with(|p| p.borrow().clone())
}

/// Add to profile fields (non-timed).
pub fn add(f: impl FnOnce(&mut SolverProfile)) {
    PROFILE.with(|p| f(&mut p.borrow_mut()));
}

/// Time a block and add the elapsed microseconds to a field.
/// Returns the block's return value.
pub fn timed<T>(mut acc: impl FnMut(&mut SolverProfile, u64), body: impl FnOnce() -> T) -> T {
    let t0 = platform::now_us();
    let result = body();
    let elapsed = platform::now_us() - t0;
    PROFILE.with(|p| acc(&mut p.borrow_mut(), elapsed));
    result
}

/// Serialize the profile as a JSON string for the WASM boundary.
pub fn to_json(p: &SolverProfile) -> String {
    format!(
        concat!(
            "{{",
            "\"deserialize_us\":{},",
            "\"expand_groups_us\":{},",
            "\"presolve_us\":{},",
            "\"analytical_presolve_us\":{},",
            "\"build_variables_us\":{},",
            "\"build_sparsity_us\":{},",
            "\"gs_warmstart_us\":{},",
            "\"lm_total_us\":{},",
            "\"reconstruction_graph_us\":{},",
            "\"dag_decompose_us\":{},",
            "\"analyze_solution_us\":{},",
            "\"serialize_us\":{},",
            "\"progressive_total_us\":{},",
            "\"linearize_count\":{},",
            "\"linearize_us\":{},",
            "\"linearize_residual_us\":{},",
            "\"linearize_analytic_us\":{},",
            "\"linearize_fd_us\":{},",
            "\"lm_step_count\":{},",
            "\"lm_step_us\":{},",
            "\"state_capture_count\":{},",
            "\"state_capture_us\":{},",
            "\"state_apply_count\":{},",
            "\"state_apply_us\":{},",
            "\"lm_outer_iterations\":{},",
            "\"lm_inner_retries\":{},",
            "\"lm_accepted_steps\":{},",
            "\"lm_restarts\":{},",
            "\"gs_escape_rounds\":{},",
            "\"progressive_steps\":{},",
            "\"n_vars\":{},",
            "\"n_rows\":{},",
            "\"n_constraints\":{},",
            "\"n_points\":{}",
            "}}"
        ),
        p.deserialize_us,
        p.expand_groups_us,
        p.presolve_us,
        p.analytical_presolve_us,
        p.build_variables_us,
        p.build_sparsity_us,
        p.gs_warmstart_us,
        p.lm_total_us,
        p.reconstruction_graph_us,
        p.dag_decompose_us,
        p.analyze_solution_us,
        p.serialize_us,
        p.progressive_total_us,
        p.linearize_count,
        p.linearize_us,
        p.linearize_residual_us,
        p.linearize_analytic_us,
        p.linearize_fd_us,
        p.lm_step_count,
        p.lm_step_us,
        p.state_capture_count,
        p.state_capture_us,
        p.state_apply_count,
        p.state_apply_us,
        p.lm_outer_iterations,
        p.lm_inner_retries,
        p.lm_accepted_steps,
        p.lm_restarts,
        p.gs_escape_rounds,
        p.progressive_steps,
        p.n_vars,
        p.n_rows,
        p.n_constraints,
        p.n_points,
    )
}
