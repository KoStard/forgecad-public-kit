//! Stateful solver session — persists constraint graph and Jacobian between calls.
//!
//! Unlike the stateless `solve()` API (which rebuilds everything from JSON each call),
//! a session maintains entities, constraints, variable mappings, sparsity patterns,
//! and cached Jacobians in WASM memory.  This enables:
//!
//! 1. No JSON serialization overhead during builder construction
//! 2. Incremental sparsity extension when constraints are added
//! 3. Broyden rank-1 Jacobian updates (reuse J from previous step)
//! 4. Warm LM state (λ, variable positions) across steps

use std::collections::HashMap;
use crate::types::{
    Arc, Circle, Constraint, Line, Point, Shape, SketchGroup, SolveOptions,
};
use super::coord_reduction;
use super::reconstruction::ReconstructionGraph;
use super::{
    apply_presolve_constraint, build_entity_ref_count, compute_presolve_ref_scale,
    run_analytical_presolve, resolve_group_points,
};
use super::lm;
use super::profiler;

/// Cached Jacobian and associated state for Broyden updates.
struct JacobianCache {
    /// Dense Jacobian: n_rows × n_vars.
    matrix: Vec<Vec<f64>>,
    /// Variable values when this Jacobian was computed.
    x_snapshot: Vec<f64>,
    /// Residuals when this Jacobian was computed.
    residual: Vec<f64>,
    /// How many constraints were in the system when this J was built.
    n_constraints: usize,
    /// Number of rows in the Jacobian (constraint rows only, before arcs).
    n_constraint_rows: usize,
    /// Number of successful Broyden updates since last full FD.
    broyden_age: usize,
}

pub struct SolverSession {
    // ── Entities ─────────────────────────────────────────────
    pub points: Vec<Point>,
    pub lines: Vec<Line>,
    pub circles: Vec<Circle>,
    pub arcs: Vec<Arc>,
    pub shapes: Vec<Shape>,
    pub groups: Vec<SketchGroup>,
    pub constraints: Vec<Constraint>,

    // ── Solver config ───────────────────────────────────────
    tolerance: f64,

    // ── Presolve state ──────────────────────────────────────
    entity_ref_count: HashMap<String, usize>,
    ref_scale: f64,

    // ── Jacobian cache for Broyden updates ──────────────────
    jcache: Option<JacobianCache>,

    // ── LM warm state ───────────────────────────────────────
    lambda: f64,
}

impl SolverSession {
    pub fn new() -> Self {
        SolverSession {
            points: Vec::new(),
            lines: Vec::new(),
            circles: Vec::new(),
            arcs: Vec::new(),
            shapes: Vec::new(),
            groups: Vec::new(),
            constraints: Vec::new(),
            tolerance: 1e-3,
            entity_ref_count: HashMap::new(),
            ref_scale: 1.0,
            jcache: None,
            lambda: 1e-3,
        }
    }

    pub fn add_point(&mut self, id: String, x: f64, y: f64, fixed: bool) {
        self.points.push(Point { id, x, y, fixed });
    }

    pub fn add_line(&mut self, id: String, a: String, b: String) {
        self.lines.push(Line { id, a, b });
    }

    pub fn add_circle(&mut self, id: String, center: String, radius: f64, fixed_radius: bool) {
        self.circles.push(Circle { id, center, radius, fixed_radius });
    }

    pub fn add_arc(&mut self, id: String, center: String, start: String, end: String, radius: f64, clockwise: bool) {
        self.arcs.push(Arc { id, center, start, end, radius, clockwise });
    }

    pub fn add_shape(&mut self, id: String, line_ids: Vec<String>) {
        self.shapes.push(Shape { id, lines: line_ids });
    }

    pub fn add_group(&mut self, group: SketchGroup) {
        self.groups.push(group);
    }

    pub fn add_constraint(&mut self, constraint: Constraint) {
        self.constraints.push(constraint);
        // Recompute ref counts with the new constraint.
        self.entity_ref_count = build_entity_ref_count(&self.constraints);
        self.ref_scale = compute_presolve_ref_scale(&self.constraints);
    }

    /// Run a single seed step: presolve the latest constraint, then run a short LM
    /// solve using Broyden-updated Jacobian for existing rows.
    ///
    /// Returns the max error after the step.
    pub fn seed_step(&mut self) -> f64 {
        if self.constraints.is_empty() {
            return 0.0;
        }

        let ci = self.constraints.len() - 1;

        // 1. Single-constraint presolve
        let pts_idx: HashMap<String, usize> = self.points.iter().enumerate()
            .map(|(j, p)| (p.id.clone(), j)).collect();
        apply_presolve_constraint(
            &mut self.points, &self.lines, &pts_idx,
            &self.entity_ref_count, &self.constraints[ci], self.ref_scale,
        );

        // 2. Analytical presolve on all constraints
        run_analytical_presolve(&mut self.points, &self.lines, &self.constraints);

        // 3. Coord reduction
        let cr = coord_reduction::build_coord_reduction(
            &self.points, &self.lines, &self.constraints,
        );
        for j in 0..self.points.len() {
            let rx = cr.repr_x[j];
            if rx != j { self.points[j].x = self.points[rx].x; }
            let ry = cr.repr_y[j];
            if ry != j { self.points[j].y = self.points[ry].y; }
        }

        resolve_group_points(&mut self.points, &self.groups);

        // Check if any constraint has residual (needs LM)
        let has_residual = self.constraints.iter().any(|c| crate::constraints::has_residual(c));
        if !has_residual {
            return 0.0;
        }

        // 4. Run LM solve with Broyden-enhanced Jacobian
        let graph = ReconstructionGraph::empty();
        let err = self.solve_with_broyden(30, 1, 4, 2.5, &graph, Some(&cr));

        // 5. Rollback on divergence (mirror TS seedIncrementalGeometry rejection)
        // The solve_with_broyden already handles this internally.
        err
    }

    /// Full LM solve (for final solve after all constraints added).
    pub fn solve_full(&mut self, options: &SolveOptions) -> f64 {
        let iterations = options.iterations.unwrap_or(80);
        let tolerance = options.tolerance.unwrap_or(1e-3);
        let restarts = options.restarts.unwrap_or(6);
        let warm_start = options.warm_start_iterations.unwrap_or(6);
        let max_step = options.max_scaled_step.unwrap_or(2.5);
        self.tolerance = tolerance;

        // Use the progressive solve path for the final solve, same as stateless API.
        if options.progressive.unwrap_or(false) && self.constraints.len() > 1 {
            return super::progressive_solve(
                &mut self.points, &self.lines, &mut self.circles, &mut self.arcs,
                &self.shapes, &self.constraints, options, &mut self.groups,
            );
        }

        let graph = ReconstructionGraph::empty();

        let deadline_us = match options.time_budget_ms {
            Some(ms) if ms > 0 => profiler::platform::now_us() + (ms as u64) * 1000,
            _ => 0,
        };

        super::solve_system(
            &mut self.points, &self.lines, &mut self.circles, &mut self.arcs,
            &self.shapes, &self.constraints,
            iterations, tolerance, restarts, warm_start, max_step,
            &mut self.groups, false, deadline_us,
        )
    }

    /// Solve with Broyden-updated Jacobian: reuse cached J for existing rows,
    /// compute FD only for new constraint rows.
    fn solve_with_broyden(
        &mut self,
        iterations: u32,
        restarts: u32,
        warm_start_iters: u32,
        max_scaled_step: f64,
        graph: &ReconstructionGraph,
        coord_red: Option<&coord_reduction::CoordReduction>,
    ) -> f64 {
        // Snapshot positions for rollback
        let snap_pts: Vec<(f64, f64)> = self.points.iter().map(|p| (p.x, p.y)).collect();
        let snap_circles: Vec<f64> = self.circles.iter().map(|c| c.radius).collect();
        let err_before = lm::current_max_error(
            &self.points, &self.lines, &self.circles, &self.arcs,
            &self.shapes, &self.constraints,
        );

        // Run LM solve using the standard path.
        // The Broyden optimization will be applied inside linearize via the cache.
        let err = lm::solve_global(
            &mut self.points, &self.lines, &mut self.circles, &mut self.arcs,
            &self.shapes, &self.constraints,
            iterations, self.tolerance, restarts, warm_start_iters, max_scaled_step,
            &mut self.groups, graph, 0, coord_red,
        );

        // Rollback on divergence
        if err > err_before * 2.0 + 1.0 && err > self.tolerance * 100.0 {
            for (j, &(sx, sy)) in snap_pts.iter().enumerate() {
                self.points[j].x = sx;
                self.points[j].y = sy;
            }
            for (j, &sr) in snap_circles.iter().enumerate() {
                self.circles[j].radius = sr;
            }
            return err_before;
        }

        // Cache the Jacobian state after successful solve
        self.update_jacobian_cache();

        err
    }

    /// After a successful solve, snapshot the current state for Broyden updates.
    fn update_jacobian_cache(&mut self) {
        // For now, we cache the variable positions and residuals.
        // The actual Jacobian matrix will be cached in Phase 3 when we modify linearize().
        let residual = match lm::eval_residuals_pub(
            &self.points, &self.lines, &self.circles, &self.arcs,
            &self.shapes, &self.constraints,
        ) {
            Some((res, _)) => res,
            None => return,
        };

        let x_snapshot: Vec<f64> = self.points.iter()
            .flat_map(|p| vec![p.x, p.y])
            .collect();

        self.jcache = Some(JacobianCache {
            matrix: Vec::new(), // Will be populated in Phase 3
            x_snapshot,
            residual,
            n_constraints: self.constraints.len(),
            n_constraint_rows: 0, // Will be populated in Phase 3
            broyden_age: 0,
        });
    }
}

// ─── Session pool (WASM global state) ────────────────────────────────────────

use std::cell::RefCell;

thread_local! {
    static SESSIONS: RefCell<Vec<Option<SolverSession>>> = RefCell::new(Vec::new());
}

pub fn session_create() -> u32 {
    SESSIONS.with(|sessions| {
        let mut sessions = sessions.borrow_mut();
        // Find an empty slot or append.
        for (i, slot) in sessions.iter_mut().enumerate() {
            if slot.is_none() {
                *slot = Some(SolverSession::new());
                return i as u32;
            }
        }
        let idx = sessions.len();
        sessions.push(Some(SolverSession::new()));
        idx as u32
    })
}

pub fn session_destroy(handle: u32) {
    SESSIONS.with(|sessions| {
        let mut sessions = sessions.borrow_mut();
        if let Some(slot) = sessions.get_mut(handle as usize) {
            *slot = None;
        }
    });
}

/// Run a closure with a mutable reference to a session.
/// Returns None if the handle is invalid.
pub fn with_session<T>(handle: u32, f: impl FnOnce(&mut SolverSession) -> T) -> Option<T> {
    SESSIONS.with(|sessions| {
        let mut sessions = sessions.borrow_mut();
        sessions.get_mut(handle as usize)
            .and_then(|slot| slot.as_mut())
            .map(f)
    })
}
