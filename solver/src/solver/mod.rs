pub mod analytical;
pub mod coord_reduction;
pub mod decompose;
pub mod graph;
pub mod linear;
pub mod lm;
pub mod profiler;
pub mod reconstruction;
pub mod session;
pub mod subgraph_detection;

use std::collections::{HashMap, HashSet};
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
    lm::trail_reset();

    // Progressive mode: add constraints one at a time with short LM solves,
    // replicating the TS solver's incremental constrain() behavior in a single
    // WASM call. This keeps geometry warm throughout the build.
    if options.progressive.unwrap_or(false) && constraints.len() > 1 {
        return progressive_solve(points, lines, circles, arcs, shapes, constraints, options, groups);
    }

    // Run targeted single-constraint presolve before the main solve when
    // the caller requests it (builder incremental path).
    if let Some(ref cid) = options.presolve_constraint_id {
        let pts: HashMap<String, usize> = points.iter().enumerate().map(|(i, p)| (p.id.clone(), i)).collect();
        let entity_ref_count = build_entity_ref_count(constraints);
        let ref_scale = compute_presolve_ref_scale(constraints);
        if let Some(constraint) = constraints.iter().find(|c| c.id() == cid.as_str()) {
            apply_presolve_constraint(points, lines, &pts, &entity_ref_count, constraint, ref_scale);
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

    let incremental = options.presolve_constraint_id.is_some();

    // Compute wall-clock deadline for the entire solve.
    let deadline_us = match options.time_budget_ms {
        Some(ms) if ms > 0 => profiler::platform::now_us() + (ms as u64) * 1000,
        _ => 0, // 0 = no limit
    };

    let max_error = solve_system(
        points, lines, circles, arcs, shapes, constraints,
        iterations, tolerance, restarts, warm_start_iters, max_scaled_step,
        groups, incremental, deadline_us,
    );

    // Fallback: if the first solve exceeded tolerance * 5 and a fallback is
    // configured, restore the original geometry and retry with more restarts.
    if let (Some(fallback), Some((snap_pts, snap_circles, snap_arcs, snap_groups))) =
        (options.fallback_restarts, snapshot)
    {
        if max_error > tolerance * 5.0 {
            if deadline_us > 0 && profiler::platform::now_us() >= deadline_us {
                return max_error; // no time for fallback
            }
            *points = snap_pts;
            *circles = snap_circles;
            *arcs = snap_arcs;
            *groups = snap_groups;
            let fb_restarts = fallback;
            let fb_warm = options.warm_start_iterations.unwrap_or(6);
            return solve_system(
                points, lines, circles, arcs, shapes, constraints,
                iterations, tolerance, fb_restarts, fb_warm, max_scaled_step,
                groups, false, deadline_us,
            );
        }
    }

    max_error
}

/// Progressive solve: add constraints one at a time with short LM solves.
/// This replicates the TS solver's incremental constrain() behavior but in a
/// single Rust call, avoiding N WASM round-trips.
///
/// When multiple line-connected clusters are detected (e.g., multi-rect layouts),
/// uses bottom-up decomposition: solve clusters independently, create groups to
/// freeze internal geometry, then progressively warm-up only bridge constraints.
///
/// Falls back to legacy progressive warm-up for single-cluster problems (e.g.,
/// spectrometer) where decomposition isn't profitable.
pub(crate) fn progressive_solve(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    options: &SolveOptions,
    groups: &mut Vec<SketchGroup>,
) -> f64 {
    let t0_prog = profiler::platform::now_us();

    // Compute a wall-clock deadline for the entire solve (progressive + final).
    let deadline_us = match options.time_budget_ms {
        Some(ms) if ms > 0 => t0_prog + (ms as u64) * 1000,
        _ => 0, // 0 = no limit
    };
    // Progressive phase gets at most 60% of the total budget (rest for final solve).
    let progressive_deadline_us = if deadline_us > 0 {
        t0_prog + ((deadline_us - t0_prog) * 60 / 100)
    } else {
        0
    };

    let tolerance = options.tolerance.unwrap_or(1e-3);
    let entity_ref_count = build_entity_ref_count(constraints);
    let ref_scale = compute_presolve_ref_scale(constraints);

    // Spread overlapping shapes apart before progressive warm-up.
    spread_overlapping_shapes(points, lines, constraints, ref_scale);

    // Try bottom-up decomposition: classify constraints into clusters + bridges.
    let classification = subgraph_detection::classify_constraints(
        points, lines, shapes, constraints, groups,
    );

    lm::trail_push(&format!("classify: {} clusters (sizes: {:?}), {} bridges, {} total comps (top: {:?})",
        classification.clusters.len(),
        classification.clusters.iter().map(|(pts, _)| pts.len()).collect::<Vec<_>>(),
        classification.bridge_indices.len(),
        classification.total_components,
        &classification.component_sizes[..classification.component_sizes.len().min(10)],
    ), 0.0);

    if classification.clusters.len() >= 2 {
        // Bottom-up path: solve clusters independently, then bridge progressively.
        bottom_up_progressive(
            points, lines, circles, arcs, shapes, constraints, options,
            groups, &classification, tolerance, &entity_ref_count, ref_scale,
            progressive_deadline_us, deadline_us,
        )
    } else {
        // Legacy path: progressive warm-up one constraint at a time.
        legacy_progressive_warmup(
            points, lines, circles, arcs, shapes, constraints,
            groups, tolerance, &entity_ref_count, ref_scale,
            progressive_deadline_us, deadline_us,
        )
    }
}

/// Legacy progressive warm-up: add constraints one by one with short LM solves.
/// Used when decomposition isn't profitable (single cluster or spectrometer-like).
fn legacy_progressive_warmup(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    groups: &mut Vec<SketchGroup>,
    tolerance: f64,
    entity_ref_count: &HashMap<String, usize>,
    ref_scale: f64,
    progressive_deadline_us: u64,
    deadline_us: u64,
) -> f64 {
    let t0_prog = profiler::platform::now_us();

    let recon_graph = reconstruction::ReconstructionGraph::empty();
    let mut progressive_timed_out = false;
    for i in 0..constraints.len() {
        if progressive_deadline_us > 0 && profiler::platform::now_us() >= progressive_deadline_us {
            lm::trail_push(&format!("progressive-timeout at step {}/{}", i, constraints.len()), 0.0);
            progressive_timed_out = true;
            break;
        }

        let sub = constraints[..=i].to_vec();

        let pts_idx: HashMap<String, usize> = points.iter().enumerate().map(|(j, p)| (p.id.clone(), j)).collect();
        apply_presolve_constraint(points, lines, &pts_idx, entity_ref_count, &constraints[i], ref_scale);
        run_analytical_presolve(points, lines, &sub);

        let cr = coord_reduction::build_coord_reduction(points, lines, &sub);
        for j in 0..points.len() {
            let rx = cr.repr_x[j];
            if rx != j { points[j].x = points[rx].x; }
            let ry = cr.repr_y[j];
            if ry != j { points[j].y = points[ry].y; }
        }

        resolve_group_points(points, groups);

        let has_residual = sub.iter().any(|c| crate::constraints::has_residual(c));
        if !has_residual { continue; }

        let step_deadline = if progressive_deadline_us > 0 {
            let now = profiler::platform::now_us();
            let remaining = progressive_deadline_us.saturating_sub(now);
            let per_step = remaining.min(500_000);
            now + per_step
        } else {
            0
        };

        // Snapshot positions before LM so we can roll back on divergence.
        let snap_pts: Vec<(f64, f64)> = points.iter().map(|p| (p.x, p.y)).collect();
        let snap_circles: Vec<f64> = circles.iter().map(|c| c.radius).collect();
        let err_before = lm::current_max_error(points, lines, circles, arcs, shapes, &sub);

        lm::solve_global(
            points, lines, circles, arcs, shapes, &sub,
            30, tolerance, 1, 4, 2.5,
            groups, &recon_graph, step_deadline, None,
        );
        profiler::add(|p| p.progressive_steps += 1);

        // Reject: if LM made error significantly worse, restore pre-step positions.
        // This mirrors the TS seedIncrementalGeometry rejection: only accept if the
        // solve improved things or didn't make them much worse.
        let err_after = lm::current_max_error(points, lines, circles, arcs, shapes, &sub);
        if err_after > err_before * 2.0 + 1.0 && err_after > tolerance * 100.0 {
            for (j, &(sx, sy)) in snap_pts.iter().enumerate() {
                points[j].x = sx;
                points[j].y = sy;
            }
            for (j, &sr) in snap_circles.iter().enumerate() {
                circles[j].radius = sr;
            }
        }
    }

    let progressive_error = lm::current_max_error(points, lines, circles, arcs, shapes, constraints);
    lm::trail_push(
        if progressive_timed_out { "progressive-warmup (partial)" } else { "progressive-warmup" },
        progressive_error,
    );

    profiler::add(|p| p.progressive_total_us += profiler::platform::now_us() - t0_prog);

    // Final solve from the warmed geometry.
    let iterations = 80;
    let restarts = 6;
    let warm_start_iters = 6;
    let max_scaled_step = 2.5;

    solve_single_system(
        points, lines, circles, arcs, shapes, constraints,
        iterations, tolerance, restarts, warm_start_iters, max_scaled_step,
        groups, false, deadline_us,
    )
}

/// Bottom-up decomposition: solve clusters independently, create groups, then
/// progressively warm-up only bridge constraints on the reduced variable set.
fn bottom_up_progressive(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    options: &SolveOptions,
    groups: &mut Vec<SketchGroup>,
    classification: &subgraph_detection::ConstraintClassification,
    tolerance: f64,
    entity_ref_count: &HashMap<String, usize>,
    ref_scale: f64,
    progressive_deadline_us: u64,
    deadline_us: u64,
) -> f64 {
    let t0_prog = profiler::platform::now_us();
    let n_clusters = classification.clusters.len();
    profiler::add(|p| p.bottom_up_clusters = n_clusters as u32);
    lm::trail_push(&format!("bottom-up: {} clusters, {} bridges",
        n_clusters, classification.bridge_indices.len()), 0.0);

    let recon_graph = reconstruction::ReconstructionGraph::empty();

    // ── Phase 1: Solve each cluster independently ────────────────────────────
    let t1 = profiler::platform::now_us();
    for (cluster_idx, (_, constraint_indices)) in classification.clusters.iter().enumerate() {
        let cluster_constraints: Vec<Constraint> = constraint_indices.iter()
            .map(|&ci| constraints[ci].clone())
            .collect();

        if cluster_constraints.is_empty() { continue; }

        // Presolve + analytical for this cluster's constraints.
        let pts_idx: HashMap<String, usize> = points.iter().enumerate()
            .map(|(j, p)| (p.id.clone(), j))
            .collect();
        for c in &cluster_constraints {
            apply_presolve_constraint(points, lines, &pts_idx, entity_ref_count, c, ref_scale);
        }
        run_analytical_presolve(points, lines, &cluster_constraints);

        let cr = coord_reduction::build_coord_reduction(points, lines, &cluster_constraints);
        for j in 0..points.len() {
            let rx = cr.repr_x[j];
            if rx != j { points[j].x = points[rx].x; }
            let ry = cr.repr_y[j];
            if ry != j { points[j].y = points[ry].y; }
        }

        let has_residual = cluster_constraints.iter().any(|c| crate::constraints::has_residual(c));
        if !has_residual { continue; }

        // Short LM solve for this cluster. The sparsity map ensures only
        // cluster-relevant variables get nonzero gradients.
        lm::solve_global(
            points, lines, circles, arcs, shapes, &cluster_constraints,
            30, tolerance, 1, 4, 2.5,
            groups, &recon_graph, 0, None,
        );

        let cluster_err = lm::current_max_error(points, lines, circles, arcs, shapes, &cluster_constraints);
        lm::trail_push(&format!("bottom-up-internal[{}]", cluster_idx), cluster_err);
    }
    profiler::add(|p| p.bottom_up_internal_us += profiler::platform::now_us() - t1);

    // ── Phase 2: Create groups from pre-solved geometry ──────────────────────
    // Run coord_reduction on ALL constraints to get proper equivalence classes,
    // then detect_subgraphs to create parameterized groups.
    let cr = coord_reduction::build_coord_reduction(points, lines, constraints);
    for j in 0..points.len() {
        let rx = cr.repr_x[j];
        if rx != j { points[j].x = points[rx].x; }
        let ry = cr.repr_y[j];
        if ry != j { points[j].y = points[ry].y; }
    }

    let detection = subgraph_detection::detect_subgraphs(
        points, lines, constraints, groups, &cr,
    );
    let absorbed_constraints = detection.absorbed_constraint_indices;

    if !detection.new_groups.is_empty() {
        let n_new = detection.new_groups.len();
        let n_absorbed = absorbed_constraints.len();
        groups.extend(detection.new_groups);
        resolve_group_points(points, groups);
        lm::trail_push(
            &format!("bottom-up-groups: {} groups, {} absorbed", n_new, n_absorbed),
            lm::current_max_error(points, lines, circles, arcs, shapes, constraints),
        );
    }

    // ── Phase 3: Progressive warm-up on bridge constraints only ──────────────
    // Non-absorbed constraints = bridges + any dimension constraints on groups.
    let t3 = profiler::platform::now_us();
    let bridge_constraints: Vec<Constraint> = constraints.iter().enumerate()
        .filter(|(i, _)| !absorbed_constraints.contains(i))
        .map(|(_, c)| c.clone())
        .collect();

    lm::trail_push(&format!("bottom-up-bridge-warmup: {} constraints", bridge_constraints.len()), 0.0);

    let mut progressive_timed_out = false;
    for i in 0..bridge_constraints.len() {
        if progressive_deadline_us > 0 && profiler::platform::now_us() >= progressive_deadline_us {
            lm::trail_push(&format!("progressive-timeout at bridge step {}/{}", i, bridge_constraints.len()), 0.0);
            progressive_timed_out = true;
            break;
        }

        let sub = bridge_constraints[..=i].to_vec();

        let pts_idx: HashMap<String, usize> = points.iter().enumerate()
            .map(|(j, p)| (p.id.clone(), j))
            .collect();
        apply_presolve_constraint(points, lines, &pts_idx, entity_ref_count, &bridge_constraints[i], ref_scale);
        run_analytical_presolve(points, lines, &sub);

        let cr = coord_reduction::build_coord_reduction(points, lines, &sub);
        for j in 0..points.len() {
            let rx = cr.repr_x[j];
            if rx != j { points[j].x = points[rx].x; }
            let ry = cr.repr_y[j];
            if ry != j { points[j].y = points[ry].y; }
        }

        resolve_group_points(points, groups);

        let has_residual = sub.iter().any(|c| crate::constraints::has_residual(c));
        if !has_residual { continue; }

        let step_deadline = if progressive_deadline_us > 0 {
            let now = profiler::platform::now_us();
            let remaining = progressive_deadline_us.saturating_sub(now);
            let per_step = remaining.min(500_000);
            now + per_step
        } else {
            0
        };

        // Snapshot positions before LM so we can roll back on divergence.
        let snap_pts: Vec<(f64, f64)> = points.iter().map(|p| (p.x, p.y)).collect();
        let snap_circles: Vec<f64> = circles.iter().map(|c| c.radius).collect();
        let err_before = lm::current_max_error(points, lines, circles, arcs, shapes, &sub);

        lm::solve_global(
            points, lines, circles, arcs, shapes, &sub,
            30, tolerance, 1, 4, 2.5,
            groups, &recon_graph, step_deadline, None,
        );
        profiler::add(|p| p.progressive_steps += 1);

        // Reject: if LM made error significantly worse, restore pre-step positions.
        let err_after = lm::current_max_error(points, lines, circles, arcs, shapes, &sub);
        if err_after > err_before * 2.0 + 1.0 && err_after > tolerance * 100.0 {
            for (j, &(sx, sy)) in snap_pts.iter().enumerate() {
                points[j].x = sx;
                points[j].y = sy;
            }
            for (j, &sr) in snap_circles.iter().enumerate() {
                circles[j].radius = sr;
            }
        }
    }

    let bridge_error = lm::current_max_error(points, lines, circles, arcs, shapes, constraints);
    lm::trail_push(
        if progressive_timed_out { "bottom-up-bridge-warmup (partial)" } else { "bottom-up-bridge-warmup" },
        bridge_error,
    );
    profiler::add(|p| p.bottom_up_bridge_us += profiler::platform::now_us() - t3);
    profiler::add(|p| p.progressive_total_us += profiler::platform::now_us() - t0_prog);

    // ── Phase 4: Final solve (unchanged) ─────────────────────────────────────
    let iterations = options.iterations.unwrap_or(80);
    let restarts = options.restarts.unwrap_or(6);
    let warm_start_iters = options.warm_start_iterations.unwrap_or(6);
    let max_scaled_step = options.max_scaled_step.unwrap_or(2.5);

    solve_single_system(
        points, lines, circles, arcs, shapes, constraints,
        iterations, tolerance, restarts, warm_start_iters, max_scaled_step,
        groups, false, deadline_us,
    )
}

/// Inner solve dispatch — decompose into independent components when possible.
pub(crate) fn solve_system(
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
    incremental: bool,
    deadline_us: u64,
) -> f64 {
    if let Some(plan) = build_solve_plan(points, lines, circles, arcs, shapes, constraints) {
        // Build a set of group-owned point IDs for quick lookup.
        let _group_point_ids: std::collections::HashSet<String> = groups.iter()
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
                incremental,
                deadline_us,
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
            incremental,
            deadline_us,
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
    incremental: bool,
    deadline_us: u64,
) -> f64 {
    profiler::timed(
        |p, us| p.presolve_us += us,
        || run_presolve(points, lines, circles, arcs, shapes, constraints, tolerance),
    );
    let presolve_error = lm::current_max_error(points, lines, circles, arcs, shapes, constraints);
    lm::trail_push("presolve", presolve_error);

    profiler::timed(
        |p, us| p.analytical_presolve_us += us,
        || run_analytical_presolve(points, lines, constraints),
    );

    // Coordinate equivalence reduction: only for non-incremental (final) solves.
    // For seeds/progressive steps, the overhead outweighs the benefit.
    let coord_red = if !incremental {
        let cr = coord_reduction::build_coord_reduction(points, lines, constraints);
        if cr.vars_saved > 0 {
            // Propagate representative coordinate values to linked points.
            for i in 0..points.len() {
                let rx = cr.repr_x[i];
                if rx != i { points[i].x = points[rx].x; }
                let ry = cr.repr_y[i];
                if ry != i { points[i].y = points[ry].y; }
            }
            lm::trail_push(
                &format!("coord-reduction: {} vars saved", cr.vars_saved),
                lm::current_max_error(points, lines, circles, arcs, shapes, constraints),
            );
        }
        cr
    } else {
        coord_reduction::CoordReduction {
            repr_x: vec![], repr_y: vec![],
            absorbed_constraints: vec![], vars_saved: 0,
        }
    };

    // Subgraph detection: collapse rigid/semi-rigid components into parameterized groups.
    // Only for non-incremental (final) solves.
    let mut absorbed_constraints: std::collections::HashSet<usize> = std::collections::HashSet::new();
    if !incremental && coord_red.vars_saved > 0 {
        let detection = subgraph_detection::detect_subgraphs(
            points, lines, constraints, groups, &coord_red,
        );
        if !detection.new_groups.is_empty() {
            let n_new = detection.new_groups.len();
            let n_absorbed = detection.absorbed_constraint_indices.len();
            absorbed_constraints = detection.absorbed_constraint_indices;
            groups.extend(detection.new_groups);
            resolve_group_points(points, groups);
            let n_group_points: usize = groups.iter().filter(|g| g.auto_detected).map(|g| g.points.len()).sum();
            let n_group_params: usize = groups.iter().filter(|g| g.auto_detected).map(|g| g.params.len()).sum();
            let frame_vars: usize = groups.iter().filter(|g| g.auto_detected).map(|g| if g.fixed_rotation { 2 } else { 3 }).sum();
            let vars_before = n_group_points * 2;
            let vars_after = frame_vars + n_group_params;
            lm::trail_push(
                &format!("subgraph-detection: {} groups, {} absorbed, {} pts → {} vars (was {})",
                    n_new, n_absorbed, n_group_points, vars_after, vars_before),
                lm::current_max_error(points, lines, circles, arcs, shapes, constraints),
            );
        }
    }

    // Build filtered constraint list excluding absorbed constraints.
    // Absorbed constraints are internal to parameterized groups — they're
    // structurally satisfied by the group parameterization.
    let filtered_constraints: Vec<Constraint>;
    let effective_constraints: &Vec<Constraint> = if absorbed_constraints.is_empty() {
        constraints
    } else {
        filtered_constraints = constraints.iter().enumerate()
            .filter(|(i, _)| !absorbed_constraints.contains(i))
            .map(|(_, c)| c.clone())
            .collect();
        &filtered_constraints
    };

    // For incremental calls (progressive warm-up or builder warm-seeding),
    // skip the heavy reconstruction graph and DAG analysis but still run LM.
    let recon_graph = if incremental {
        reconstruction::ReconstructionGraph::empty()
    } else {
        profiler::timed(|p, us| p.reconstruction_graph_us += us, || {
            let group_owned_ids: std::collections::HashSet<String> = groups.iter()
                .flat_map(|g| g.points.iter().map(|p| p.id.clone()))
                .collect();
            let graph = reconstruction::build_reconstruction_graph(
                points, lines, effective_constraints, &group_owned_ids,
            );
            if !graph.is_empty() {
                reconstruction::reconstruct(&graph, points, lines, effective_constraints);
            }
            graph
        })
    };

    resolve_group_points(points, groups);

    let has_any_residual = effective_constraints.iter().any(|c| crate::constraints::has_residual(c))
        || !arcs.is_empty();

    if !has_any_residual {
        return sanitize_max_error(gauss_seidel_solve(
            points, lines, circles, arcs, shapes, effective_constraints,
            iterations, tolerance,
        ));
    }

    if !incremental {
        // ── Graph decomposition: extract structural info and build solve DAG ──
        profiler::timed(|p, us| p.dag_decompose_us += us, || {
            let info = lm::extract_structural_info(
                points, lines, circles, arcs, shapes, effective_constraints, groups, &recon_graph,
            );

            if info.n_vars > 0 {
                let dag = graph::decompose_to_solve_dag(
                    info.n_vars,
                    &info.constraint_var_sets,
                    &info.constraint_row_ranges,
                    &info.arc_var_sets,
                    info.arc_row_start,
                );

                let nontrivial_blocks = dag.blocks.iter().filter(|b| !b.vars.is_empty()).count();
                lm::trail_push(
                    &format!("dag: {} blocks ({} with vars)", dag.blocks.len(), nontrivial_blocks),
                    presolve_error,
                );
            }
        });
    }

    // When subgraph detection created groups, disable coord_reduction for LM.
    // Coord_reduction might link a non-group point's coordinate to a group-owned
    // point's coordinate. Since group-owned points have no variables, this would
    // silently eliminate the non-group point's coordinate from the solver.
    let has_auto_groups = groups.iter().any(|g| g.auto_detected);
    let cr_ref = if coord_red.vars_saved > 0 && !has_auto_groups {
        Some(&coord_red)
    } else {
        None
    };
    let final_error = profiler::timed(
        |p, us| p.lm_total_us += us,
        || lm::solve_global(
            points, lines, circles, arcs, shapes, effective_constraints,
            iterations, tolerance, restarts, warm_start_iters, max_scaled_step,
            groups,
            &recon_graph,
            deadline_us,
            cr_ref,
        ),
    );
    sanitize_max_error(final_error)
}

/// Progressive sub-solve (experimental, currently unused).
/// Builds the constraint graph, computes dependency layers,
/// and runs small LM passes on growing subsets.
#[allow(dead_code)]
fn progressive_sub_solve(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    groups: &mut Vec<SketchGroup>,
    tolerance: f64,
    graph: &reconstruction::ReconstructionGraph,
) {
    if constraints.len() < 4 { return; } // too small to benefit

    // Build point-DOF map: which point IDs does each constraint touch?
    let lines_map: HashMap<&str, &Line> = lines.iter().map(|l| (l.id.as_str(), l)).collect();
    let circles_map: HashMap<&str, &Circle> = circles.iter().map(|c| (c.id.as_str(), c)).collect();
    let arcs_map: HashMap<&str, &Arc> = arcs.iter().map(|a| (a.id.as_str(), a)).collect();
    let shapes_map: HashMap<&str, &Shape> = shapes.iter().map(|s| (s.id.as_str(), s)).collect();

    let point_ids: HashSet<String> = points.iter().map(|p| p.id.clone()).collect();

    // For each constraint, collect the point IDs it involves.
    let constraint_points: Vec<HashSet<String>> = constraints.iter().map(|c| {
        let entity_ids = crate::constraints::constraint_entity_ids(c, &lines_map, &circles_map, &arcs_map, &shapes_map);
        entity_ids.into_iter().filter(|id| point_ids.contains(id)).collect()
    }).collect();

    // Start with fixed points as "solved".
    let mut solved_points: HashSet<String> = points.iter()
        .filter(|p| p.fixed)
        .map(|p| p.id.clone())
        .collect();

    let mut used_constraints: Vec<bool> = vec![false; constraints.len()];

    // Greedily add constraint layers. Each layer adds the constraints that
    // introduce the fewest new points, preferring constraints whose points are
    // mostly already solved. Limit to at most 4 new DOFs (2 new points) per layer
    // to keep LM subsystems small.
    for layer in 0..20 {
        // Score each unused constraint: (new_point_count, total_points)
        // Lower new_point_count = higher priority (more anchored).
        let mut candidates: Vec<(usize, usize, usize)> = Vec::new(); // (index, new_count, total)
        for (i, c_points) in constraint_points.iter().enumerate() {
            if used_constraints[i] || c_points.is_empty() { continue; }
            let new_count = c_points.iter().filter(|p| !solved_points.contains(*p)).count();
            let total = c_points.len();
            let solved_count = total - new_count;
            // Must have at least 1 solved point to be a candidate (anchored).
            if solved_count > 0 {
                candidates.push((i, new_count, total));
            }
        }

        if candidates.is_empty() {
            // Try unanchored constraints (all-new points).
            for (i, c_points) in constraint_points.iter().enumerate() {
                if used_constraints[i] || c_points.is_empty() { continue; }
                candidates.push((i, c_points.len(), c_points.len()));
            }
        }

        if candidates.is_empty() { break; }

        // Sort by new_count (ascending) then total (ascending).
        candidates.sort_by(|a, b| a.1.cmp(&b.1).then(a.2.cmp(&b.2)));

        // Add constraints greedily, tracking new points introduced.
        // First pass: add constraints that introduce ≤4 new points.
        let mut layer_indices: Vec<usize> = Vec::new();
        let mut layer_new_points: HashSet<String> = HashSet::new();
        let max_new_points = 4;

        for (i, _new_count, _total) in &candidates {
            let new_pts: Vec<&String> = constraint_points[*i].iter()
                .filter(|p| !solved_points.contains(*p) && !layer_new_points.contains(*p))
                .collect();
            if layer_new_points.len() + new_pts.len() <= max_new_points || layer_indices.is_empty() {
                layer_indices.push(*i);
                for p in new_pts {
                    layer_new_points.insert(p.clone());
                }
            }
        }

        // Second pass: add any remaining unused constraints that ONLY involve
        // points already in this layer (no additional new points). This ensures
        // that shape constraints (parallel, perpendicular, length) on newly-introduced
        // points are solved together with position constraints, not deferred.
        let layer_all_points: HashSet<String> = used_constraints.iter()
            .enumerate()
            .filter(|(_, &used)| used)
            .flat_map(|(i, _)| constraint_points[i].iter().cloned())
            .chain(layer_new_points.iter().cloned())
            .chain(solved_points.iter().cloned())
            .collect();

        for (i, c_points) in constraint_points.iter().enumerate() {
            if used_constraints[i] || layer_indices.contains(&i) || c_points.is_empty() { continue; }
            if c_points.iter().all(|p| layer_all_points.contains(p)) {
                layer_indices.push(i);
            }
        }

        // Collect all constraints for this sub-solve (all previously used + new layer).
        // Log which constraints are new in this layer.
        let new_ids: Vec<String> = layer_indices.iter()
            .map(|&i| constraints[i].id().to_string())
            .collect();
        lm::trail_push(&format!("layer[{}] adding: {}", layer, new_ids.join(",")), 0.0);

        for &i in &layer_indices {
            used_constraints[i] = true;
        }
        let sub_constraints: Vec<Constraint> = used_constraints.iter()
            .enumerate()
            .filter(|(_, &used)| used)
            .map(|(i, _)| constraints[i].clone())
            .collect();

        // Collect all points involved in the sub-constraints.
        let sub_point_ids: HashSet<String> = used_constraints.iter()
            .enumerate()
            .filter(|(_, &used)| used)
            .flat_map(|(i, _)| constraint_points[i].iter().cloned())
            .collect();

        // Check current error on just the sub-constraints.
        let sub_error = lm::current_max_error(points, lines, circles, arcs, shapes, &sub_constraints);
        if sub_error <= tolerance {
            // Already solved — mark all points as solved and continue.
            solved_points.extend(sub_point_ids);
            continue;
        }

        // Compute "active" points: new points + their direct constraint neighbors.
        // Points not in this active set are temporarily fixed.
        let mut active_points: HashSet<String> = layer_new_points.clone();
        // Add all points that share a NEW constraint with a new point.
        for &ci in &layer_indices {
            // If this constraint involves any new point, all its points are active.
            if constraint_points[ci].iter().any(|p| layer_new_points.contains(p)) {
                for p in &constraint_points[ci] {
                    active_points.insert(p.clone());
                }
            }
        }

        let mut saved_fixed: Vec<(usize, bool)> = Vec::new();
        for (i, p) in points.iter_mut().enumerate() {
            if !p.fixed && !active_points.contains(&p.id) {
                saved_fixed.push((i, p.fixed));
                p.fixed = true;
            }
        }

        // Run LM on the sub-constraints. Use more restarts for larger layers
        // since they're more likely to have local minima.
        let new_pt_count = layer_new_points.len();
        let sub_iters = if new_pt_count > 3 { 60 } else { 40 };
        let sub_restarts = if new_pt_count > 3 { 6 } else { 3 };
        let warm_iters = 4;
        let max_step = 2.5;

        let err = lm::solve_global(
            points, lines, circles, arcs, shapes, &sub_constraints,
            sub_iters, tolerance, sub_restarts, warm_iters, max_step,
            groups, graph, 0, None,
        );
        lm::trail_push(&format!("sub-layer[{}] ({} constraints, {} pts)", layer, sub_constraints.len(), sub_point_ids.len()), err);

        // Restore fixed flags.
        for (i, was_fixed) in saved_fixed {
            points[i].fixed = was_fixed;
        }

        // Mark all points in this sub-solve as solved.
        solved_points.extend(sub_point_ids);

        if err <= tolerance {
            // Sub-solve converged — keep going to add more layers.
        }
        // Even if sub-solve didn't converge perfectly, the positions are
        // better than cold-start for the next layer.
    }
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

/// Compute the characteristic scale of the problem from constraint dimension values.
/// Traverse a shape's lines to collect unique vertex IDs in order.
fn shape_vertex_ids(shape: &Shape, lines_map: &HashMap<&str, &Line>) -> Vec<String> {
    if shape.lines.is_empty() { return vec![]; }
    let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();
    for lid in &shape.lines {
        if let Some(l) = lines_map.get(lid.as_str()) {
            adj.entry(l.a.as_str()).or_default().push(l.b.as_str());
            adj.entry(l.b.as_str()).or_default().push(l.a.as_str());
        }
    }
    if adj.is_empty() { return vec![]; }
    let start = *adj.keys().next().unwrap();
    let mut result = vec![start.to_string()];
    let mut prev: Option<&str> = None;
    let mut current = start;
    loop {
        let neighbors = match adj.get(current) { Some(n) => n, None => break };
        let next = neighbors.iter().find(|&&n| Some(n) != prev).copied();
        prev = Some(current);
        match next {
            Some(n) => {
                if n == start { break; }
                result.push(n.to_string());
                current = n;
            }
            None => break,
        }
    }
    result
}

pub(crate) fn compute_presolve_ref_scale(constraints: &Vec<Constraint>) -> f64 {
    let mut max_val: f64 = 1.0;
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
            _ => 0.0,
        };
        if v > max_val { max_val = v; }
    }
    max_val
}

/// Polyline chain closure: find connected chains of lines with known directions
/// (AbsoluteAngle), where both terminal points are "anchored" (fixed or shared with
/// other subsystems). Compute segment lengths via pseudo-inverse to satisfy the
/// closure condition: Σ Lᵢ·dᵢ = endpoint_B - endpoint_A.
fn propagate_chain_closure(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    constraints: &Vec<Constraint>,
) {
    let pts: HashMap<String, usize> = points.iter().enumerate().map(|(i, p)| (p.id.clone(), i)).collect();

    // Collect lines that have AbsoluteAngle constraints.
    let mut angle_lines: HashMap<String, f64> = HashMap::new();
    for c in constraints {
        if let Constraint::AbsoluteAngle { line, value, .. } = c {
            angle_lines.insert(line.clone(), *value);
        }
    }
    // Collect lines that have explicit Length constraints (don't override their lengths).
    let mut length_lines: HashSet<String> = HashSet::new();
    for c in constraints {
        if let Constraint::Length { line, .. } = c {
            length_lines.insert(line.clone());
        }
    }

    if angle_lines.is_empty() { return; }

    // Build point-to-line adjacency for angle-constrained lines only.
    let mut point_to_lines: HashMap<&str, Vec<&Line>> = HashMap::new();
    for l in lines {
        if angle_lines.contains_key(&l.id) {
            point_to_lines.entry(l.a.as_str()).or_default().push(l);
            point_to_lines.entry(l.b.as_str()).or_default().push(l);
        }
    }

    // Count how many angle-constrained lines touch each point.
    // Terminal points of a chain are those with exactly 1 angle-constrained line.
    let mut terminals: Vec<&str> = Vec::new();
    for (&pt, ll) in &point_to_lines {
        if ll.len() == 1 {
            terminals.push(pt);
        }
    }

    // For each terminal, trace the chain.
    let mut visited_lines: HashSet<String> = HashSet::new();
    for &start_pt in &terminals {
        // Find the single angle-constrained line at this terminal.
        let start_lines = match point_to_lines.get(start_pt) {
            Some(ll) => ll,
            None => continue,
        };
        let first_line = match start_lines.iter().find(|l| !visited_lines.contains(&l.id)) {
            Some(l) => *l,
            None => continue,
        };

        // Trace the chain: follow connected angle-constrained lines.
        let mut chain: Vec<(&Line, &str, &str)> = Vec::new(); // (line, from_pt, to_pt)
        let mut current_pt = start_pt;
        let mut current_line = first_line;
        loop {
            if visited_lines.contains(&current_line.id) { break; }
            visited_lines.insert(current_line.id.clone());

            let (from, to) = if current_line.a.as_str() == current_pt {
                (current_line.a.as_str(), current_line.b.as_str())
            } else {
                (current_line.b.as_str(), current_line.a.as_str())
            };
            chain.push((current_line, from, to));
            current_pt = to;

            // Find the next line at current_pt (the other angle-constrained line).
            let next_lines = match point_to_lines.get(current_pt) {
                Some(ll) => ll,
                None => break,
            };
            let next = next_lines.iter().find(|l| !visited_lines.contains(&l.id));
            match next {
                Some(l) => current_line = *l,
                None => break, // reached terminal or dead end
            }
        }

        if chain.len() < 2 { continue; } // need at least 2 segments for closure to matter

        // Check that both terminals have known positions.
        let start_idx = match pts.get(chain[0].1) { Some(&i) => i, None => continue };
        let end_idx = match pts.get(chain.last().unwrap().2) { Some(&i) => i, None => continue };

        // Compute target displacement.
        let dx = points[end_idx].x - points[start_idx].x;
        let dy = points[end_idx].y - points[start_idx].y;

        // Build direction matrix D (2×N) and current lengths.
        let n = chain.len();
        let mut dirs: Vec<(f64, f64)> = Vec::with_capacity(n);
        let mut current_lens: Vec<f64> = Vec::with_capacity(n);
        let mut has_length: Vec<bool> = Vec::with_capacity(n);

        for (line, from, to) in &chain {
            let angle_deg = angle_lines[&line.id];
            let angle_rad = angle_deg * std::f64::consts::PI / 180.0;
            // Direction from `from` to `to`. If the line is defined A→B but we traverse B→A,
            // the angle constraint is for A→B. We need to check if we're going the "right" way.
            let (d_x, d_y) = if line.a.as_str() == *from {
                (angle_rad.cos(), angle_rad.sin())
            } else {
                (-angle_rad.cos(), -angle_rad.sin())
            };
            dirs.push((d_x, d_y));

            let fi = pts[*from];
            let ti = pts[*to];
            let len = (points[ti].x - points[fi].x).hypot(points[ti].y - points[fi].y);
            current_lens.push(len);
            has_length.push(length_lines.contains(&line.id));
        }

        // Compute D·D^T (2×2 matrix).
        let mut ddt = [[0.0f64; 2]; 2];
        for i in 0..n {
            if has_length[i] { continue; } // Fixed-length segments don't participate
            let (dx_i, dy_i) = dirs[i];
            ddt[0][0] += dx_i * dx_i;
            ddt[0][1] += dx_i * dy_i;
            ddt[1][0] += dy_i * dx_i;
            ddt[1][1] += dy_i * dy_i;
        }

        // Invert the 2×2 matrix.
        let det = ddt[0][0] * ddt[1][1] - ddt[0][1] * ddt[1][0];
        if det.abs() < 1e-12 { continue; } // degenerate (all segments in same direction)

        // Current displacement with current lengths.
        let mut cur_dx = 0.0f64;
        let mut cur_dy = 0.0f64;
        for i in 0..n {
            cur_dx += current_lens[i] * dirs[i].0;
            cur_dy += current_lens[i] * dirs[i].1;
        }

        // Residual: how much we need to adjust.
        let res_x = dx - cur_dx;
        let res_y = dy - cur_dy;

        // Solve: inv(D·D^T) · residual
        let inv_det = 1.0 / det;
        let sol_x = inv_det * (ddt[1][1] * res_x - ddt[0][1] * res_y);
        let sol_y = inv_det * (-ddt[1][0] * res_x + ddt[0][0] * res_y);

        // Update lengths: Lᵢ += dᵢ^T · sol (pseudo-inverse step)
        let mut new_lens: Vec<f64> = current_lens.clone();
        for i in 0..n {
            if has_length[i] { continue; }
            let delta = dirs[i].0 * sol_x + dirs[i].1 * sol_y;
            new_lens[i] += delta;
            if new_lens[i] < 0.5 { new_lens[i] = 0.5; } // minimum positive length
        }

        // Apply: position intermediate points along the chain.
        let mut cx = points[start_idx].x;
        let mut cy = points[start_idx].y;
        for i in 0..n {
            cx += new_lens[i] * dirs[i].0;
            cy += new_lens[i] * dirs[i].1;
            // Set the "to" point (intermediate or final).
            let to_idx = pts[chain[i].2];
            if !points[to_idx].fixed && i < n - 1 {
                // Only set intermediate points, not the final terminal.
                points[to_idx].x = cx;
                points[to_idx].y = cy;
            }
        }
    }
}

/// Midpoint-bridged opening placement:
/// detect the spectrometer slit pattern where a short line is centered on the
/// midpoint of one support line and bridged perpendicularly to a second support
/// line. This removes the persistent back-opening ambiguity before LM.
fn propagate_midpoint_bridged_opening(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    constraints: &Vec<Constraint>,
) {
    let pts: HashMap<String, usize> = points.iter().enumerate().map(|(i, p)| (p.id.clone(), i)).collect();
    let line_map: HashMap<String, &Line> = lines.iter().map(|line| (line.id.clone(), line)).collect();

    let mut line_lengths: HashMap<String, f64> = HashMap::new();
    let mut midpoint_lines_by_point: HashMap<String, Vec<String>> = HashMap::new();
    let mut zero_line_distances: Vec<(String, String)> = Vec::new();
    let mut parallel_pairs: Vec<(String, String)> = Vec::new();

    for c in constraints {
        match c {
            Constraint::Length { line, value, .. } => {
                line_lengths.insert(line.clone(), *value);
            }
            Constraint::Midpoint { point, line, .. } => {
                midpoint_lines_by_point.entry(point.clone()).or_default().push(line.clone());
            }
            Constraint::LineDistance { a, b, value, .. } if value.abs() < 1e-9 => {
                zero_line_distances.push((a.clone(), b.clone()));
            }
            Constraint::Parallel { a, b, .. } => {
                parallel_pairs.push((a.clone(), b.clone()));
            }
            _ => {}
        }
    }

    let is_zero_distance_pair = |a: &str, b: &str| -> bool {
        zero_line_distances.iter().any(|(x, y)| (x == a && y == b) || (x == b && y == a))
    };

    let zero_distance_partners = |line_id: &str| -> Vec<String> {
        zero_line_distances.iter()
            .filter_map(|(a, b)| {
                if a == line_id {
                    Some(b.clone())
                } else if b == line_id {
                    Some(a.clone())
                } else {
                    None
                }
            })
            .collect()
    };

    let normalize = |v: (f64, f64)| -> Option<(f64, f64)> {
        let len = v.0.hypot(v.1);
        if len < 1e-9 {
            None
        } else {
            Some((v.0 / len, v.1 / len))
        }
    };

    let line_intersection = |p0: (f64, f64), d0: (f64, f64), a0: (f64, f64), a1: (f64, f64)| -> Option<(f64, f64)> {
        let d1 = (a1.0 - a0.0, a1.1 - a0.1);
        let den = d0.0 * d1.1 - d0.1 * d1.0;
        if den.abs() < 1e-9 {
            return None;
        }
        let t = ((a0.0 - p0.0) * d1.1 - (a0.1 - p0.1) * d1.0) / den;
        Some((p0.0 + d0.0 * t, p0.1 + d0.1 * t))
    };

    let choose_assignment = |ia: usize, ib: usize, p0: (f64, f64), p1: (f64, f64), points: &Vec<Point>| -> ((f64, f64), (f64, f64)) {
        let same = (points[ia].x - p0.0).powi(2)
            + (points[ia].y - p0.1).powi(2)
            + (points[ib].x - p1.0).powi(2)
            + (points[ib].y - p1.1).powi(2);
        let swapped = (points[ia].x - p1.0).powi(2)
            + (points[ia].y - p1.1).powi(2)
            + (points[ib].x - p0.0).powi(2)
            + (points[ib].y - p0.1).powi(2);
        if swapped < same {
            (p1, p0)
        } else {
            (p0, p1)
        }
    };

    for (attach_point, midpoint_lines) in midpoint_lines_by_point {
        for opening_line_id in midpoint_lines.iter() {
            let Some(opening_len) = line_lengths.get(opening_line_id.as_str()).copied() else { continue };
            let Some(support0_id) = midpoint_lines.iter()
                .find(|candidate| candidate.as_str() != opening_line_id.as_str() && is_zero_distance_pair(opening_line_id, candidate))
                .cloned()
            else {
                continue;
            };

            let Some(opposite_line_id) = parallel_pairs.iter().find_map(|(a, b)| {
                if a == opening_line_id {
                    Some(b.clone())
                } else if b == opening_line_id {
                    Some(a.clone())
                } else {
                    None
                }
            }) else {
                continue;
            };

            let Some(support1_id) = zero_distance_partners(opposite_line_id.as_str()).into_iter()
                .find(|candidate| candidate != &support0_id)
            else {
                continue;
            };

            let (Some(opening_line), Some(opposite_line), Some(support0), Some(support1)) = (
                line_map.get(opening_line_id.as_str()),
                line_map.get(opposite_line_id.as_str()),
                line_map.get(support0_id.as_str()),
                line_map.get(support1_id.as_str()),
            ) else {
                continue;
            };

            let (Some(&open_ai), Some(&open_bi), Some(&opp_ai), Some(&opp_bi), Some(&support0_ai), Some(&support0_bi), Some(&support1_ai), Some(&support1_bi)) = (
                pts.get(opening_line.a.as_str()),
                pts.get(opening_line.b.as_str()),
                pts.get(opposite_line.a.as_str()),
                pts.get(opposite_line.b.as_str()),
                pts.get(support0.a.as_str()),
                pts.get(support0.b.as_str()),
                pts.get(support1.a.as_str()),
                pts.get(support1.b.as_str()),
            ) else {
                continue;
            };

            let support0_vec = (
                points[support0_bi].x - points[support0_ai].x,
                points[support0_bi].y - points[support0_ai].y,
            );
            let support1_vec = (
                points[support1_bi].x - points[support1_ai].x,
                points[support1_bi].y - points[support1_ai].y,
            );
            let Some(dir0) = normalize(support0_vec) else { continue };
            let Some(mut dir1) = normalize(support1_vec) else { continue };
            if dir0.0 * dir1.0 + dir0.1 * dir1.1 < 0.0 {
                dir1 = (-dir1.0, -dir1.1);
            }

            let mut dir = normalize((dir0.0 + dir1.0, dir0.1 + dir1.1)).unwrap_or(dir0);
            let current_open = (
                points[open_bi].x - points[open_ai].x,
                points[open_bi].y - points[open_ai].y,
            );
            if current_open.0 * dir.0 + current_open.1 * dir.1 < 0.0 {
                dir = (-dir.0, -dir.1);
            }

            let attach_target = (
                (points[support0_ai].x + points[support0_bi].x) * 0.5,
                (points[support0_ai].y + points[support0_bi].y) * 0.5,
            );
            let open_p0 = (
                attach_target.0 - dir.0 * opening_len * 0.5,
                attach_target.1 - dir.1 * opening_len * 0.5,
            );
            let open_p1 = (
                attach_target.0 + dir.0 * opening_len * 0.5,
                attach_target.1 + dir.1 * opening_len * 0.5,
            );

            let mut normal = (-dir.1, dir.0);
            let support_mid_delta = (
                (points[support1_ai].x + points[support1_bi].x) * 0.5 - attach_target.0,
                (points[support1_ai].y + points[support1_bi].y) * 0.5 - attach_target.1,
            );
            if support_mid_delta.0 * normal.0 + support_mid_delta.1 * normal.1 < 0.0 {
                normal = (-normal.0, -normal.1);
            }

            let Some(opp_p0) = line_intersection(
                open_p0,
                normal,
                (points[support1_ai].x, points[support1_ai].y),
                (points[support1_bi].x, points[support1_bi].y),
            ) else {
                continue;
            };
            let Some(opp_p1) = line_intersection(
                open_p1,
                normal,
                (points[support1_ai].x, points[support1_ai].y),
                (points[support1_bi].x, points[support1_bi].y),
            ) else {
                continue;
            };

            let opposite_len = (opp_p1.0 - opp_p0.0).hypot(opp_p1.1 - opp_p0.1);
            if opposite_len < 1e-9 || (opposite_len - opening_len).abs() > opening_len.max(1.0) * 0.35 {
                continue;
            }

            let (open_a_target, open_b_target) = choose_assignment(open_ai, open_bi, open_p0, open_p1, points);
            let (opp_a_target, opp_b_target) = choose_assignment(opp_ai, opp_bi, opp_p0, opp_p1, points);

            if let Some(&attach_i) = pts.get(attach_point.as_str()) {
                if !points[attach_i].fixed {
                    points[attach_i].x = attach_target.0;
                    points[attach_i].y = attach_target.1;
                }
            }

            if !points[open_ai].fixed {
                points[open_ai].x = open_a_target.0;
                points[open_ai].y = open_a_target.1;
            }
            if !points[open_bi].fixed {
                points[open_bi].x = open_b_target.0;
                points[open_bi].y = open_b_target.1;
            }
            if !points[opp_ai].fixed {
                points[opp_ai].x = opp_a_target.0;
                points[opp_ai].y = opp_a_target.1;
            }
            if !points[opp_bi].fixed {
                points[opp_bi].x = opp_b_target.0;
                points[opp_bi].y = opp_b_target.1;
            }

            if cfg!(test) {
                eprintln!(
                    "presolve opening: attach={} base={} support0={} opposite={} support1={}",
                    attach_point, opening_line_id, support0_id, opposite_line_id, support1_id
                );
            }
        }
    }
}

/// Light-locked camera placement:
/// detect a line whose midpoint is tied to a light ray of known length and
/// perpendicularity, and whose endpoints are constrained onto two support lines.
/// This is the remaining hard pattern in the spectrometer: it fixes the camera
/// slide DOF before LM sees the coupled inner-camera offsets.
fn propagate_light_locked_camera(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    constraints: &Vec<Constraint>,
) {
    let pts: HashMap<String, usize> = points.iter().enumerate().map(|(i, p)| (p.id.clone(), i)).collect();
    let line_map: HashMap<String, &Line> = lines.iter().map(|line| (line.id.clone(), line)).collect();

    let mut line_lengths: HashMap<String, f64> = HashMap::new();
    let mut midpoints: Vec<(String, String)> = Vec::new(); // (midpoint point id, side line id)
    let mut perpendicular_pairs: Vec<(String, String)> = Vec::new();
    let mut point_on_line: HashMap<String, String> = HashMap::new();

    for c in constraints {
        match c {
            Constraint::Length { line, value, .. } => {
                line_lengths.insert(line.clone(), *value);
            }
            Constraint::Midpoint { point, line, .. } => {
                midpoints.push((point.clone(), line.clone()));
            }
            Constraint::Perpendicular { a, b, .. } => {
                perpendicular_pairs.push((a.clone(), b.clone()));
            }
            Constraint::PointOnLine { point, line, .. } => {
                point_on_line.insert(point.clone(), line.clone());
            }
            _ => {}
        }
    }

    let are_perpendicular = |a: &str, b: &str| -> bool {
        perpendicular_pairs.iter().any(|(x, y)| (x == a && y == b) || (x == b && y == a))
    };

    let line_intersection = |p0: (f64, f64), d0: (f64, f64), a0: (f64, f64), a1: (f64, f64)| -> Option<(f64, f64)> {
        let d1 = (a1.0 - a0.0, a1.1 - a0.1);
        let den = d0.0 * d1.1 - d0.1 * d1.0;
        if den.abs() < 1e-9 {
            return None;
        }
        let t = ((a0.0 - p0.0) * d1.1 - (a0.1 - p0.1) * d1.0) / den;
        Some((p0.0 + d0.0 * t, p0.1 + d0.1 * t))
    };

    for (mid_point, side_line_id) in midpoints {
        let Some(side_line) = line_map.get(side_line_id.as_str()) else { continue };
        let Some(side_len) = line_lengths.get(side_line_id.as_str()).copied() else { continue };

        let Some(light_line) = lines.iter().find(|line| {
            (line.a == mid_point || line.b == mid_point)
                && line_lengths.contains_key(line.id.as_str())
                && are_perpendicular(line.id.as_str(), side_line_id.as_str())
        }) else {
            continue;
        };
        let Some(light_len) = line_lengths.get(light_line.id.as_str()).copied() else { continue };

        let side_a_support = point_on_line.get(side_line.a.as_str()).cloned();
        let side_b_support = point_on_line.get(side_line.b.as_str()).cloned();
        let (Some(support_a_id), Some(support_b_id)) = (side_a_support, side_b_support) else { continue };
        let (Some(support_a), Some(support_b)) = (
            line_map.get(support_a_id.as_str()),
            line_map.get(support_b_id.as_str()),
        ) else {
            continue;
        };

        let (Some(&mid_i), Some(&side_a_i), Some(&side_b_i)) = (
            pts.get(mid_point.as_str()),
            pts.get(side_line.a.as_str()),
            pts.get(side_line.b.as_str()),
        ) else {
            continue;
        };

        let anchor_id = if light_line.a == mid_point {
            light_line.b.as_str()
        } else {
            light_line.a.as_str()
        };
        let Some(&anchor_i) = pts.get(anchor_id) else { continue };

        let (Some(&sa0), Some(&sa1), Some(&sb0), Some(&sb1)) = (
            pts.get(support_a.a.as_str()),
            pts.get(support_a.b.as_str()),
            pts.get(support_b.a.as_str()),
            pts.get(support_b.b.as_str()),
        ) else {
            continue;
        };

        let ta = (
            points[sa1].x - points[sa0].x,
            points[sa1].y - points[sa0].y,
        );
        let tb = (
            points[sb1].x - points[sb0].x,
            points[sb1].y - points[sb0].y,
        );
        let ta_len = ta.0.hypot(ta.1);
        let tb_len = tb.0.hypot(tb.1);
        if ta_len < 1e-9 || tb_len < 1e-9 {
            continue;
        }

        let mut tangent = (
            ta.0 / ta_len + tb.0 / tb_len,
            ta.1 / ta_len + tb.1 / tb_len,
        );
        let tangent_len = tangent.0.hypot(tangent.1);
        if tangent_len < 1e-9 {
            tangent = (ta.0 / ta_len, ta.1 / ta_len);
        } else {
            tangent = (tangent.0 / tangent_len, tangent.1 / tangent_len);
        }

        let mut normal = (-tangent.1, tangent.0);
        let current_side = (
            points[side_b_i].x - points[side_a_i].x,
            points[side_b_i].y - points[side_a_i].y,
        );
        if current_side.0 * normal.0 + current_side.1 * normal.1 < 0.0 {
            normal = (-normal.0, -normal.1);
        }

        let current_mid_vec = (
            points[mid_i].x - points[anchor_i].x,
            points[mid_i].y - points[anchor_i].y,
        );
        let sign = if current_mid_vec.0 * tangent.0 + current_mid_vec.1 * tangent.1 >= 0.0 {
            1.0
        } else {
            -1.0
        };
        let target_mid = (
            points[anchor_i].x + tangent.0 * light_len * sign,
            points[anchor_i].y + tangent.1 * light_len * sign,
        );

        let Some(new_a) = line_intersection(
            target_mid,
            normal,
            (points[sa0].x, points[sa0].y),
            (points[sa1].x, points[sa1].y),
        ) else {
            continue;
        };
        let Some(new_b) = line_intersection(
            target_mid,
            normal,
            (points[sb0].x, points[sb0].y),
            (points[sb1].x, points[sb1].y),
        ) else {
            continue;
        };

        let actual_side_len = (new_b.0 - new_a.0).hypot(new_b.1 - new_a.1);
        if actual_side_len < 1e-9 {
            continue;
        }

        // Only apply if the supporting lines are already roughly compatible with
        // the camera side length. Otherwise this presolve would fight the case
        // geometry instead of helping it.
        if (actual_side_len - side_len).abs() > side_len.max(1.0) * 0.15 {
            continue;
        }

        if !points[side_a_i].fixed {
            points[side_a_i].x = new_a.0;
            points[side_a_i].y = new_a.1;
        }
        if !points[side_b_i].fixed {
            points[side_b_i].x = new_b.0;
            points[side_b_i].y = new_b.1;
        }

        if !points[mid_i].fixed {
            points[mid_i].x = (new_a.0 + new_b.0) * 0.5;
            points[mid_i].y = (new_a.1 + new_b.1) * 0.5;
        }

        if cfg!(test) {
            eprintln!(
                "presolve light-camera: mid={} side={} light={} supports=({}, {})",
                mid_point, side_line_id, light_line.id, support_a_id, support_b_id
            );
        }
    }
}

/// Detect overlapping shapes (connected components via lines) and spread them
/// apart deterministically. This gives the solver distinct initial positions
/// for shapes that would otherwise all start at the same default location.
///
/// Uses union-find over line connectivity to identify shapes, computes each
/// shape's centroid, and if many shapes are clustered in a small region,
/// spreads them in a grid with deterministic jitter based on component index.
fn spread_overlapping_shapes(
    points: &mut Vec<Point>,
    lines: &[Line],
    constraints: &[Constraint],
    ref_scale: f64,
) {
    if points.is_empty() || ref_scale < 1e-6 { return; }

    let n = points.len();
    let pt_idx: HashMap<String, usize> = points.iter().enumerate()
        .map(|(i, p)| (p.id.clone(), i))
        .collect();

    // Build line endpoint lookup for constraint processing.
    let line_map: HashMap<&str, &Line> = lines.iter()
        .map(|l| (l.id.as_str(), l))
        .collect();

    // Union-find over points via line connectivity AND structural constraints.
    let mut parent: Vec<usize> = (0..n).collect();
    let mut rank: Vec<usize> = vec![0; n];

    fn uf_find(parent: &mut Vec<usize>, x: usize) -> usize {
        if parent[x] != x {
            parent[x] = uf_find(parent, parent[x]);
        }
        parent[x]
    }
    fn uf_union(parent: &mut Vec<usize>, rank: &mut Vec<usize>, a: usize, b: usize) {
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
        if let (Some(&ai), Some(&bi)) = (pt_idx.get(&line.a), pt_idx.get(&line.b)) {
            uf_union(&mut parent, &mut rank, ai, bi);
        }
    }

    // Connect via structural constraints (Coincident, PointOnLine, Midpoint).
    // These create physical connections between points that should be treated
    // as part of the same shape for spreading purposes.
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

    // Group non-fixed points by connected component.
    let mut components: HashMap<usize, Vec<usize>> = HashMap::new();
    for i in 0..n {
        if !points[i].fixed {
            let root = uf_find(&mut parent, i);
            components.entry(root).or_default().push(i);
        }
    }

    // Compute centroid and bounding box of each component (shape).
    // Only consider components with ≥3 points (actual shapes, not lone bridges).
    struct ShapeInfo {
        root: usize,
        cx: f64,
        cy: f64,
        bbox_size: f64,
        members: Vec<usize>,
    }
    let mut shape_list: Vec<ShapeInfo> = Vec::new();
    for (root, members) in &components {
        if members.len() < 3 { continue; }
        let cx = members.iter().map(|&i| points[i].x).sum::<f64>() / members.len() as f64;
        let cy = members.iter().map(|&i| points[i].y).sum::<f64>() / members.len() as f64;
        let min_x = members.iter().map(|&i| points[i].x).fold(f64::INFINITY, f64::min);
        let max_x = members.iter().map(|&i| points[i].x).fold(f64::NEG_INFINITY, f64::max);
        let min_y = members.iter().map(|&i| points[i].y).fold(f64::INFINITY, f64::min);
        let max_y = members.iter().map(|&i| points[i].y).fold(f64::NEG_INFINITY, f64::max);
        let bbox_size = (max_x - min_x).max(max_y - min_y);
        shape_list.push(ShapeInfo { root: *root, cx, cy, bbox_size, members: members.clone() });
    }

    // Only spread when there are many overlapping shapes (≥4).
    // A few overlapping shapes (2-3) are handled fine by the solver.
    // The problem arises with many (16+) shapes at the same position.
    if shape_list.len() < 4 { return; }

    // Sort by root index for deterministic ordering.
    shape_list.sort_by_key(|s| s.root);

    // Compute average shape bounding box for spacing.
    let avg_bbox = shape_list.iter().map(|s| s.bbox_size).sum::<f64>() / shape_list.len() as f64;
    // Use 2× average bbox as spacing — enough to separate shapes without being excessive.
    // At minimum, use ref_scale * 0.1 so shapes still move apart when all have zero bbox.
    let spacing = (avg_bbox * 2.0).max(ref_scale * 0.1);

    // Compute global centroid and check if shapes are clustered.
    let gcx = shape_list.iter().map(|s| s.cx).sum::<f64>() / shape_list.len() as f64;
    let gcy = shape_list.iter().map(|s| s.cy).sum::<f64>() / shape_list.len() as f64;
    let max_dist = shape_list.iter()
        .map(|s| ((s.cx - gcx).powi(2) + (s.cy - gcy).powi(2)).sqrt())
        .fold(0.0f64, f64::max);

    // If shapes are already spread out, skip. Compare to expected grid extent.
    let n_shapes = shape_list.len();
    let cols = (n_shapes as f64).sqrt().ceil() as usize;
    let rows = (n_shapes + cols - 1) / cols;
    let expected_extent = spacing * (cols.max(rows) as f64) / 2.0;
    if max_dist > expected_extent * 0.3 { return; }

    for (k, shape) in shape_list.iter().enumerate() {
        let row = k / cols;
        let col = k % cols;

        // Grid position centered on global centroid.
        let grid_x = gcx + (col as f64 - (cols as f64 - 1.0) / 2.0) * spacing;
        let grid_y = gcy + (row as f64 - (rows as f64 - 1.0) / 2.0) * spacing;

        // Deterministic jitter based on component root index to break grid symmetry.
        // Uses a simple multiplicative hash (Knuth's golden ratio hash).
        let hash = shape.root.wrapping_mul(2654435761);
        let jx = ((hash >> 16) & 0xFF) as f64 / 255.0 - 0.5; // [-0.5, 0.5]
        let jy = ((hash >> 8) & 0xFF) as f64 / 255.0 - 0.5;
        let jitter_scale = spacing * 0.15;

        let new_cx = grid_x + jx * jitter_scale;
        let new_cy = grid_y + jy * jitter_scale;
        let dx = new_cx - shape.cx;
        let dy = new_cy - shape.cy;

        // Translate entire component as a unit (preserves internal geometry).
        for &i in &shape.members {
            points[i].x += dx;
            points[i].y += dy;
        }
    }

    lm::trail_push(
        &format!("spread: {} shapes spread in {}×{} grid", n_shapes, cols, rows),
        0.0,
    );
}

fn run_presolve(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    _circles: &mut Vec<Circle>,
    _arcs: &mut Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
    _tolerance: f64,
) {
    let ref_scale = compute_presolve_ref_scale(constraints);

    // Spread overlapping shapes apart before constraint-based presolve.
    // This gives each shape a distinct initial position so that distance/angle
    // presolve can compute meaningful normals and directions.
    spread_overlapping_shapes(points, lines, constraints, ref_scale);

    // Stage 1: Establish base geometry (Fixed, CCW, AbsoluteAngle, Length, BlockRotation).
    // These set positions, orientations, and scales that derived constraints depend on.
    // Stage 2: Scale/position-related (Equal, LineDistance, PointLineDistance, Distance).
    // Stage 3: Derived geometric constraints (PointOnLine, Perpendicular, Parallel, Midpoint).
    // Run 2 full cycles so later stages benefit from earlier stage updates.
    for _cycle in 0..2 {
        let entity_ref_count = build_entity_ref_count(constraints);
        // Stage 1: base geometry
        for _pass in 0..2 {
            let pts: HashMap<String, usize> = points.iter().enumerate().map(|(i, p)| (p.id.clone(), i)).collect();
            for c in constraints {
                match c {
                    Constraint::Fixed { .. }
                    | Constraint::Ccw { .. }
                    | Constraint::AbsoluteAngle { .. }
                    | Constraint::Length { .. }
                    | Constraint::BlockRotation { .. }
                    | Constraint::Horizontal { .. }
                    | Constraint::Vertical { .. } => {
                        apply_presolve_constraint(points, lines, &pts, &entity_ref_count, c, ref_scale);
                    }
                    _ => {}
                }
            }
        }
        // Close open angle-driven chains once their endpoint geometry is roughly in place.
        propagate_chain_closure(points, lines, constraints);
        // Stage 2: scale and distance
        {
            let pts: HashMap<String, usize> = points.iter().enumerate().map(|(i, p)| (p.id.clone(), i)).collect();
            for c in constraints {
                match c {
                    Constraint::Equal { .. }
                    | Constraint::LineDistance { .. }
                    | Constraint::PointLineDistance { .. }
                    | Constraint::Distance { .. }
                    | Constraint::HDistance { .. }
                    | Constraint::VDistance { .. } => {
                        apply_presolve_constraint(points, lines, &pts, &entity_ref_count, c, ref_scale);
                    }
                    _ => {}
                }
            }
        }
        // Stage 3: derived geometry
        {
            let pts: HashMap<String, usize> = points.iter().enumerate().map(|(i, p)| (p.id.clone(), i)).collect();
            for c in constraints {
                match c {
                    Constraint::PointOnLine { .. }
                    | Constraint::Perpendicular { .. }
                    | Constraint::Parallel { .. }
                    | Constraint::Midpoint { .. } => {
                        apply_presolve_constraint(points, lines, &pts, &entity_ref_count, c, ref_scale);
                    }
                    _ => {}
                }
            }
        }
        propagate_midpoint_bridged_opening(points, lines, constraints);
        propagate_light_locked_camera(points, lines, constraints);
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

    let ref_scale = compute_presolve_ref_scale(constraints);
    if let Some(constraint) = constraints.iter().find(|constraint| constraint.id() == constraint_id) {
        apply_presolve_constraint(points, lines, &pts, &entity_ref_count, constraint, ref_scale);
    }

    // Resolve group-owned points after presolve.
    resolve_group_points(points, groups);

    sanitize_max_error(lm::current_max_error(
        points, lines, circles, arcs, shapes, constraints,
    ))
}

pub(crate) fn apply_presolve_constraint(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    pts: &HashMap<String, usize>,
    entity_ref_count: &HashMap<String, usize>,
    c: &Constraint,
    ref_scale: f64,
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
                        .max(ref_scale * 0.5);
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
                        if (len - value).abs() < 1e-9 {
                            return;
                        }
                        // When points are coincident, use x-axis as default direction.
                        let (ux, uy) = if len < 1e-9 { (1.0, 0.0) } else { (dx / len, dy / len) };
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

                let len_a = (points[a2i].x - points[a1i].x).hypot(points[a2i].y - points[a1i].y);
                let len_b = (points[b2i].x - points[b1i].x).hypot(points[b2i].y - points[b1i].y);
                let dx_a = points[a2i].x - points[a1i].x;
                let dy_a = points[a2i].y - points[a1i].y;
                // When reference line has zero length, use y-axis as default normal.
                let (nx, ny) = if len_a < 1e-9 { (0.0, 1.0) } else { (-dy_a / len_a, dx_a / len_a) };
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
                // After shifting, scale the moved line toward the reference line's
                // length when grossly undersized. This helps lines at default scale
                // (e.g., outer triangle sides at ~5 units, should be ~25).
                let (ref_len_val, moved_i1, moved_i2) = if move_a {
                    (len_b, a1i, a2i)
                } else {
                    (len_a, b1i, b2i)
                };
                let moved_len = (points[moved_i2].x - points[moved_i1].x)
                    .hypot(points[moved_i2].y - points[moved_i1].y);
                if ref_len_val > 1e-9 && moved_len > 1e-9 && moved_len < ref_len_val * 0.5 {
                    let ratio = ref_len_val / moved_len;
                    let mx = (points[moved_i1].x + points[moved_i2].x) * 0.5;
                    let my = (points[moved_i1].y + points[moved_i2].y) * 0.5;
                    if !points[moved_i1].fixed {
                        points[moved_i1].x = mx + (points[moved_i1].x - mx) * ratio;
                        points[moved_i1].y = my + (points[moved_i1].y - my) * ratio;
                    }
                    if !points[moved_i2].fixed {
                        points[moved_i2].x = mx + (points[moved_i2].x - mx) * ratio;
                        points[moved_i2].y = my + (points[moved_i2].y - my) * ratio;
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
            // Equal: scale the shorter line to match the longer one, preserving direction.
            Constraint::Equal { a, b, .. } => {
                let la = lines.iter().find(|l| &l.id == a);
                let lb = lines.iter().find(|l| &l.id == b);
                if let (Some(la), Some(lb)) = (la, lb) {
                    if let (Some(&a1i), Some(&a2i), Some(&b1i), Some(&b2i)) = (
                        pts.get(la.a.as_str()), pts.get(la.b.as_str()),
                        pts.get(lb.a.as_str()), pts.get(lb.b.as_str()),
                    ) {
                        let len_a = (points[a2i].x - points[a1i].x).hypot(points[a2i].y - points[a1i].y);
                        let len_b = (points[b2i].x - points[b1i].x).hypot(points[b2i].y - points[b1i].y);
                        if len_a < 1e-12 || len_b < 1e-12 { return; }
                        // Scale the shorter line to match the longer one.
                        if len_a > len_b {
                            let ratio = len_a / len_b;
                            let mx = (points[b1i].x + points[b2i].x) * 0.5;
                            let my = (points[b1i].y + points[b2i].y) * 0.5;
                            if !points[b1i].fixed {
                                points[b1i].x = mx + (points[b1i].x - mx) * ratio;
                                points[b1i].y = my + (points[b1i].y - my) * ratio;
                            }
                            if !points[b2i].fixed {
                                points[b2i].x = mx + (points[b2i].x - mx) * ratio;
                                points[b2i].y = my + (points[b2i].y - my) * ratio;
                            }
                        } else if len_b > len_a {
                            let ratio = len_b / len_a;
                            let mx = (points[a1i].x + points[a2i].x) * 0.5;
                            let my = (points[a1i].y + points[a2i].y) * 0.5;
                            if !points[a1i].fixed {
                                points[a1i].x = mx + (points[a1i].x - mx) * ratio;
                                points[a1i].y = my + (points[a1i].y - my) * ratio;
                            }
                            if !points[a2i].fixed {
                                points[a2i].x = mx + (points[a2i].x - mx) * ratio;
                                points[a2i].y = my + (points[a2i].y - my) * ratio;
                            }
                        }
                    }
                }
            }
            // PointOnLine: project the point onto the line.
            Constraint::PointOnLine { point, line, .. } => {
                if let Some(l) = lines.iter().find(|l| &l.id == line) {
                    if let (Some(&pi), Some(&ai), Some(&bi)) = (
                        pts.get(point.as_str()), pts.get(l.a.as_str()), pts.get(l.b.as_str()),
                    ) {
                        if points[pi].fixed { return; }
                        let dx = points[bi].x - points[ai].x;
                        let dy = points[bi].y - points[ai].y;
                        let len2 = dx * dx + dy * dy;
                        if len2 < 1e-24 { return; }
                        let t = ((points[pi].x - points[ai].x) * dx
                            + (points[pi].y - points[ai].y) * dy) / len2;
                        points[pi].x = points[ai].x + t * dx;
                        points[pi].y = points[ai].y + t * dy;
                    }
                }
            }
            // Perpendicular: rotate the shorter line to be perpendicular to the longer one.
            Constraint::Perpendicular { a, b, .. } => {
                let la = lines.iter().find(|l| &l.id == a);
                let lb = lines.iter().find(|l| &l.id == b);
                if let (Some(la), Some(lb)) = (la, lb) {
                    if let (Some(&a1i), Some(&a2i), Some(&b1i), Some(&b2i)) = (
                        pts.get(la.a.as_str()), pts.get(la.b.as_str()),
                        pts.get(lb.a.as_str()), pts.get(lb.b.as_str()),
                    ) {
                        let dax = points[a2i].x - points[a1i].x;
                        let day = points[a2i].y - points[a1i].y;
                        let len_a = dax.hypot(day);
                        let dbx = points[b2i].x - points[b1i].x;
                        let dby = points[b2i].y - points[b1i].y;
                        let len_b = dbx.hypot(dby);
                        if len_a < 1e-12 || len_b < 1e-12 { return; }
                        // Rotate the shorter line to be perpendicular to the longer.
                        // Perpendicular direction of a: (-day, dax)/len_a
                        if len_b <= len_a {
                            // Rotate b to be perp to a, preserving b's length and start point.
                            let perp_x = -day / len_a;
                            let perp_y = dax / len_a;
                            // Choose sign that's closest to current b direction.
                            let dot = dbx * perp_x + dby * perp_y;
                            let sign = if dot >= 0.0 { 1.0 } else { -1.0 };
                            if !points[b2i].fixed {
                                points[b2i].x = points[b1i].x + sign * perp_x * len_b;
                                points[b2i].y = points[b1i].y + sign * perp_y * len_b;
                            }
                        } else {
                            let perp_x = -dby / len_b;
                            let perp_y = dbx / len_b;
                            let dot = dax * perp_x + day * perp_y;
                            let sign = if dot >= 0.0 { 1.0 } else { -1.0 };
                            if !points[a2i].fixed {
                                points[a2i].x = points[a1i].x + sign * perp_x * len_a;
                                points[a2i].y = points[a1i].y + sign * perp_y * len_a;
                            }
                        }
                    }
                }
            }
            // Parallel: rotate the shorter line to be parallel to the longer one.
            Constraint::Parallel { a, b, .. } => {
                let la = lines.iter().find(|l| &l.id == a);
                let lb = lines.iter().find(|l| &l.id == b);
                if let (Some(la), Some(lb)) = (la, lb) {
                    if let (Some(&a1i), Some(&a2i), Some(&b1i), Some(&b2i)) = (
                        pts.get(la.a.as_str()), pts.get(la.b.as_str()),
                        pts.get(lb.a.as_str()), pts.get(lb.b.as_str()),
                    ) {
                        let dax = points[a2i].x - points[a1i].x;
                        let day = points[a2i].y - points[a1i].y;
                        let len_a = dax.hypot(day);
                        let dbx = points[b2i].x - points[b1i].x;
                        let dby = points[b2i].y - points[b1i].y;
                        let len_b = dbx.hypot(dby);
                        if len_a < 1e-12 || len_b < 1e-12 { return; }
                        // Rotate the shorter line to be parallel to the longer.
                        if len_b <= len_a {
                            let dir_x = dax / len_a;
                            let dir_y = day / len_a;
                            let dot = dbx * dir_x + dby * dir_y;
                            let sign = if dot >= 0.0 { 1.0 } else { -1.0 };
                            if !points[b2i].fixed {
                                points[b2i].x = points[b1i].x + sign * dir_x * len_b;
                                points[b2i].y = points[b1i].y + sign * dir_y * len_b;
                            }
                        } else {
                            let dir_x = dbx / len_b;
                            let dir_y = dby / len_b;
                            let dot = dax * dir_x + day * dir_y;
                            let sign = if dot >= 0.0 { 1.0 } else { -1.0 };
                            if !points[a2i].fixed {
                                points[a2i].x = points[a1i].x + sign * dir_x * len_a;
                                points[a2i].y = points[a1i].y + sign * dir_y * len_a;
                            }
                        }
                    }
                }
            }
            // Midpoint: move the point to the midpoint of the line.
            Constraint::Midpoint { point, line, .. } => {
                if let Some(l) = lines.iter().find(|l| &l.id == line) {
                    if let (Some(&pi), Some(&ai), Some(&bi)) = (
                        pts.get(point.as_str()), pts.get(l.a.as_str()), pts.get(l.b.as_str()),
                    ) {
                        if points[pi].fixed { return; }
                        points[pi].x = (points[ai].x + points[bi].x) * 0.5;
                        points[pi].y = (points[ai].y + points[bi].y) * 0.5;
                    }
                }
            }
            _ => {}
        }
}

pub(crate) fn build_entity_ref_count(constraints: &Vec<Constraint>) -> HashMap<String, usize> {
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

    let solve_trail = lm::trail_take();
    // Only report timed_out if the solver actually failed to converge.
    // The progressive phase may time out but the final solve still succeeds.
    let timed_out = max_error > tolerance
        && solve_trail.iter().any(|s| s.phase.contains("timeout"));

    SolveMetadata {
        status,
        dof,
        constraint_residuals,
        redundant_constraint_ids,
        conflicting_constraint_ids,
        solve_trail,
        timed_out,
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
