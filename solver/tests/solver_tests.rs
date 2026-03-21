mod helpers;
use helpers::*;
use solver::solve_problem;
use solver::types::*;

// ═══════════════════════════════════════════════════════════════════════════════
// Parameterized groups: subgraph detection with bridged rects
// ═══════════════════════════════════════════════════════════════════════════════

/// Two rects connected by a bridge (simulating attachCentered).
/// Each rect has 4 corners + 4 edges + 1 diagonal.
/// Bridge: 2 midpoints + 1 bridge line + Midpoint constraints.
/// Detection should find 2 separate 4-point groups, solve correctly,
/// and produce valid geometry with Length constraints satisfied.
#[test]
fn two_rects_bridged_subgraph_detection() {
    // Rect A: corners at approximately (0,0)-(10,5)
    // Rect B: corners at approximately (20,0)-(30,5)
    // Bridge: mid1=midpoint(a_right), mid2=midpoint(b_left), bridge line mid1→mid2
    let result = solve_problem(
        Problem {
            points: vec![
                point("a_bl", 0.0, 0.0),
                point("a_br", 10.0, 0.0),
                point("a_tr", 10.0, 5.0),
                point("a_tl", 0.0, 5.0),
                point("a_center", 5.0, 2.5),
                point("b_bl", 20.0, 0.0),
                point("b_br", 30.0, 0.0),
                point("b_tr", 30.0, 5.0),
                point("b_tl", 20.0, 5.0),
                point("b_center", 25.0, 2.5),
                point("mid1", 10.0, 2.5),
                point("mid2", 20.0, 2.5),
            ],
            lines: vec![
                // Rect A edges
                line("a_bottom", "a_bl", "a_br"),
                line("a_right", "a_br", "a_tr"),
                line("a_top", "a_tr", "a_tl"),
                line("a_left", "a_tl", "a_bl"),
                line("a_diag", "a_bl", "a_tr"),
                // Rect B edges
                line("b_bottom", "b_bl", "b_br"),
                line("b_right", "b_br", "b_tr"),
                line("b_top", "b_tr", "b_tl"),
                line("b_left", "b_tl", "b_bl"),
                line("b_diag", "b_bl", "b_tr"),
                // Bridge
                line("bridge", "mid1", "mid2"),
            ],
            circles: vec![],
            arcs: vec![],
            shapes: vec![],
            groups: vec![],
            constraints: vec![
                // Rect A structural
                Constraint::Horizontal { id: "ah1".into(), line: "a_bottom".into() },
                Constraint::Horizontal { id: "ah2".into(), line: "a_top".into() },
                Constraint::Vertical { id: "av1".into(), line: "a_right".into() },
                Constraint::Vertical { id: "av2".into(), line: "a_left".into() },
                Constraint::Ccw { id: "accw".into(), points: vec!["a_bl".into(), "a_br".into(), "a_tr".into(), "a_tl".into()] },
                Constraint::BlockRotation { id: "abr".into(), points: vec!["a_bl".into(), "a_br".into(), "a_tr".into(), "a_tl".into()], axis: "a_bl".into() },
                Constraint::Midpoint { id: "amp".into(), point: "a_center".into(), line: "a_diag".into() },
                // Rect B structural
                Constraint::Horizontal { id: "bh1".into(), line: "b_bottom".into() },
                Constraint::Horizontal { id: "bh2".into(), line: "b_top".into() },
                Constraint::Vertical { id: "bv1".into(), line: "b_right".into() },
                Constraint::Vertical { id: "bv2".into(), line: "b_left".into() },
                Constraint::Ccw { id: "bccw".into(), points: vec!["b_bl".into(), "b_br".into(), "b_tr".into(), "b_tl".into()] },
                Constraint::BlockRotation { id: "bbr".into(), points: vec!["b_bl".into(), "b_br".into(), "b_tr".into(), "b_tl".into()], axis: "b_bl".into() },
                Constraint::Midpoint { id: "bmp".into(), point: "b_center".into(), line: "b_diag".into() },
                // Dimensional constraints
                Constraint::Length { id: "la_top".into(), line: "a_top".into(), value: 15.0 },
                Constraint::Length { id: "la_left".into(), line: "a_left".into(), value: 8.0 },
                Constraint::Length { id: "lb_top".into(), line: "b_top".into(), value: 12.0 },
                Constraint::Length { id: "lb_left".into(), line: "b_left".into(), value: 6.0 },
                // Bridge constraints
                Constraint::Midpoint { id: "bmp1".into(), point: "mid1".into(), line: "a_right".into() },
                Constraint::Midpoint { id: "bmp2".into(), point: "mid2".into(), line: "b_left".into() },
                Constraint::Horizontal { id: "bh".into(), line: "bridge".into() },
            ],
            options: None,
        },
        Some(SolveOptions {
            progressive: Some(true),
            iterations: Some(200),
            tolerance: Some(1e-4),
            time_budget_ms: Some(30000),
            ..Default::default()
        }),
    );

    // Check that the solver converged.
    assert!(result.max_error < 0.01, "two bridged rects should converge: max_error={}", result.max_error);

    // Verify rect A dimensions.
    let (a_bl_x, a_bl_y) = get_pt(&result, "a_bl");
    let (a_br_x, a_br_y) = get_pt(&result, "a_br");
    let (a_tr_x, _) = get_pt(&result, "a_tr");
    let (a_tl_x, a_tl_y) = get_pt(&result, "a_tl");
    let a_width = (a_br_x - a_bl_x).abs();
    let a_height = (a_tl_y - a_bl_y).abs();
    assert!(approx_eq(a_width, 15.0, 0.1), "rect A width should be 15, got {}", a_width);
    assert!(approx_eq(a_height, 8.0, 0.1), "rect A height should be 8, got {}", a_height);
    // H/V satisfied
    assert!(approx_eq(a_bl_y, a_br_y, 0.01), "rect A bottom should be horizontal");
    assert!(approx_eq(a_br_x, a_tr_x, 0.01), "rect A right should be vertical");
    assert!(approx_eq(a_tl_x, a_bl_x, 0.01), "rect A left should be vertical");

    // Verify rect B dimensions.
    let (b_bl_x, b_bl_y) = get_pt(&result, "b_bl");
    let (b_br_x, _) = get_pt(&result, "b_br");
    let (_, b_tl_y) = get_pt(&result, "b_tl");
    let b_width = (b_br_x - b_bl_x).abs();
    let b_height = (b_tl_y - b_bl_y).abs();
    assert!(approx_eq(b_width, 12.0, 0.1), "rect B width should be 12, got {}", b_width);
    assert!(approx_eq(b_height, 6.0, 0.1), "rect B height should be 6, got {}", b_height);

    // Verify bridge: mid1 and mid2 should be horizontally aligned.
    let (_, mid1_y) = get_pt(&result, "mid1");
    let (_, mid2_y) = get_pt(&result, "mid2");
    assert!(approx_eq(mid1_y, mid2_y, 0.1), "bridge should be horizontal: mid1.y={} mid2.y={}", mid1_y, mid2_y);

    // Verify cluster-warmup and subgraph detection fired.
    if let Some(ref m) = result.metadata {
        let trail_str: String = m.solve_trail.iter().map(|s| format!("  {}={:.4}\n", s.phase, s.error)).collect();
        eprintln!("Trail:\n{}", trail_str);
        let cluster_fired = m.solve_trail.iter().any(|s| s.phase.contains("cluster-warmup"));
        assert!(cluster_fired, "cluster-warmup should fire for bridged rects. Trail:\n{}", trail_str);
        let detection_fired = m.solve_trail.iter().any(|s| s.phase.contains("subgraph-detection"));
        assert!(detection_fired, "subgraph detection should fire for bridged rects. Trail:\n{}", trail_str);
    }
}

const TOL: f64 = 1e-3;
const TIGHT: f64 = 1e-6;

// ═══════════════════════════════════════════════════════════════════════════════
// Basic single-constraint smoke tests
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn coincident_two_free_points() {
    let result = solve_problem(
        problem(
            vec![point("a", 0.0, 0.0), point("b", 10.0, 10.0)],
            vec![],
            vec![Constraint::Coincident { id: "c1".into(), a: "a".into(), b: "b".into() }],
        ),
        None,
    );
    assert_solved(&result, TOL, "coincident");
    let (ax, ay) = get_pt(&result, "a");
    let (bx, by) = get_pt(&result, "b");
    assert!(approx_eq(ax, bx, TOL) && approx_eq(ay, by, TOL), "points not coincident: ({ax},{ay}) vs ({bx},{by})");
}

#[test]
fn coincident_one_fixed() {
    let result = solve_problem(
        problem(
            vec![fixed_point("a", 5.0, 3.0), point("b", 0.0, 0.0)],
            vec![],
            vec![Constraint::Coincident { id: "c1".into(), a: "a".into(), b: "b".into() }],
        ),
        None,
    );
    assert_solved(&result, TOL, "coincident fixed");
    let (bx, by) = get_pt(&result, "b");
    assert!(approx_eq(bx, 5.0, TOL) && approx_eq(by, 3.0, TOL));
}

#[test]
fn horizontal_constraint() {
    let result = solve_problem(
        problem(
            vec![fixed_point("a", 0.0, 0.0), point("b", 5.0, 3.0)],
            vec![line("l1", "a", "b")],
            vec![Constraint::Horizontal { id: "c1".into(), line: "l1".into() }],
        ),
        None,
    );
    assert_solved(&result, TOL, "horizontal");
    let (_, ay) = get_pt(&result, "a");
    let (_, by) = get_pt(&result, "b");
    assert!(approx_eq(ay, by, TOL), "not horizontal: ay={ay} by={by}");
}

#[test]
fn vertical_constraint() {
    let result = solve_problem(
        problem(
            vec![fixed_point("a", 0.0, 0.0), point("b", 3.0, 5.0)],
            vec![line("l1", "a", "b")],
            vec![Constraint::Vertical { id: "c1".into(), line: "l1".into() }],
        ),
        None,
    );
    assert_solved(&result, TOL, "vertical");
    let (ax, _) = get_pt(&result, "a");
    let (bx, _) = get_pt(&result, "b");
    assert!(approx_eq(ax, bx, TOL), "not vertical: ax={ax} bx={bx}");
}

#[test]
fn distance_constraint() {
    let result = solve_problem(
        problem(
            vec![fixed_point("a", 0.0, 0.0), point("b", 5.0, 0.0)],
            vec![],
            vec![Constraint::Distance { id: "c1".into(), a: "a".into(), b: "b".into(), value: 100.0 }],
        ),
        None,
    );
    assert_solved(&result, TOL, "distance");
    let (ax, ay) = get_pt(&result, "a");
    let (bx, by) = get_pt(&result, "b");
    let dist = ((bx-ax).powi(2) + (by-ay).powi(2)).sqrt();
    assert!(approx_eq(dist, 100.0, TOL), "dist={dist}");
}

#[test]
fn length_constraint() {
    let result = solve_problem(
        problem(
            vec![fixed_point("a", 0.0, 0.0), point("b", 1.0, 1.0)],
            vec![line("l1", "a", "b")],
            vec![Constraint::Length { id: "c1".into(), line: "l1".into(), value: 50.0 }],
        ),
        None,
    );
    assert_solved(&result, TOL, "length");
    let (ax, ay) = get_pt(&result, "a");
    let (bx, by) = get_pt(&result, "b");
    let len = ((bx-ax).powi(2) + (by-ay).powi(2)).sqrt();
    assert!(approx_eq(len, 50.0, TOL), "len={len}");
}

#[test]
fn hdistance_constraint() {
    let result = solve_problem(
        problem(
            vec![fixed_point("a", 0.0, 0.0), point("b", 5.0, 5.0)],
            vec![],
            vec![Constraint::HDistance { id: "c1".into(), a: "a".into(), b: "b".into(), value: 30.0 }],
        ),
        None,
    );
    assert_solved(&result, TOL, "hdistance");
    let (ax, _) = get_pt(&result, "a");
    let (bx, _) = get_pt(&result, "b");
    assert!(approx_eq(bx - ax, 30.0, TOL), "bx-ax={}", bx-ax);
}

#[test]
fn vdistance_constraint() {
    let result = solve_problem(
        problem(
            vec![fixed_point("a", 0.0, 0.0), point("b", 5.0, 5.0)],
            vec![],
            vec![Constraint::VDistance { id: "c1".into(), a: "a".into(), b: "b".into(), value: 40.0 }],
        ),
        None,
    );
    assert_solved(&result, TOL, "vdistance");
    let (_, ay) = get_pt(&result, "a");
    let (_, by) = get_pt(&result, "b");
    assert!(approx_eq(by - ay, 40.0, TOL), "by-ay={}", by-ay);
}

#[test]
fn radius_constraint() {
    let result = solve_problem(
        problem_with_circles(
            vec![point("c", 0.0, 0.0)],
            vec![],
            vec![circle("circ", "c", 5.0)],
            vec![Constraint::Radius { id: "c1".into(), circle: "circ".into(), value: 25.0 }],
        ),
        None,
    );
    assert_solved(&result, TOL, "radius");
    let r = get_circle_radius(&result, "circ");
    assert!(approx_eq(r, 25.0, TOL), "r={r}");
}

#[test]
fn diameter_constraint() {
    let result = solve_problem(
        problem_with_circles(
            vec![point("c", 0.0, 0.0)],
            vec![],
            vec![circle("circ", "c", 5.0)],
            vec![Constraint::Diameter { id: "c1".into(), circle: "circ".into(), value: 60.0 }],
        ),
        None,
    );
    assert_solved(&result, TOL, "diameter");
    let r = get_circle_radius(&result, "circ");
    assert!(approx_eq(r, 30.0, TOL), "r={r} expected 30");
}

#[test]
fn absolute_angle_horizontal() {
    let result = solve_problem(
        problem(
            vec![fixed_point("a", 0.0, 0.0), point("b", 3.0, 4.0)],
            vec![line("l1", "a", "b")],
            vec![Constraint::AbsoluteAngle { id: "c1".into(), line: "l1".into(), value: 0.0 }],
        ),
        None,
    );
    assert_solved(&result, TOL, "absolute_angle 0°");
    let (ax, ay) = get_pt(&result, "a");
    let (bx, by) = get_pt(&result, "b");
    let angle = (by - ay).atan2(bx - ax).to_degrees();
    assert!(approx_eq(angle, 0.0, 0.1), "angle={angle}°");
}

#[test]
fn absolute_angle_45deg() {
    let result = solve_problem(
        problem(
            vec![fixed_point("a", 0.0, 0.0), point("b", 10.0, 0.0)],
            vec![line("l1", "a", "b")],
            vec![Constraint::AbsoluteAngle { id: "c1".into(), line: "l1".into(), value: 45.0 }],
        ),
        Some(tight_options()),
    );
    assert_solved(&result, 1e-4, "absolute_angle 45°");
    let (ax, ay) = get_pt(&result, "a");
    let (bx, by) = get_pt(&result, "b");
    let angle = (by - ay).atan2(bx - ax).to_degrees();
    assert!(approx_eq(angle, 45.0, 0.1), "angle={angle}°");
}

#[test]
fn parallel_constraint() {
    let result = solve_problem(
        problem(
            vec![
                fixed_point("a1", 0.0, 0.0), fixed_point("a2", 10.0, 0.0),
                point("b1", 5.0, 5.0), point("b2", 15.0, 8.0),
            ],
            vec![line("la", "a1", "a2"), line("lb", "b1", "b2")],
            vec![Constraint::Parallel { id: "c1".into(), a: "la".into(), b: "lb".into() }],
        ),
        None,
    );
    assert_solved(&result, TOL, "parallel");
    let (a1x, a1y) = get_pt(&result, "a1");
    let (a2x, a2y) = get_pt(&result, "a2");
    let (b1x, b1y) = get_pt(&result, "b1");
    let (b2x, b2y) = get_pt(&result, "b2");
    let da = ((a2x-a1x).hypot(a2y-a1y)).max(1e-9);
    let db = ((b2x-b1x).hypot(b2y-b1y)).max(1e-9);
    let cross = (a2x-a1x)/da * (b2y-b1y)/db - (a2y-a1y)/da * (b2x-b1x)/db;
    assert!(approx_eq(cross, 0.0, TOL), "cross={cross}");
}

#[test]
fn perpendicular_constraint() {
    let result = solve_problem(
        problem(
            vec![
                fixed_point("a1", 0.0, 0.0), fixed_point("a2", 10.0, 0.0),
                point("b1", 5.0, 0.0), point("b2", 5.0, -8.0),
            ],
            vec![line("la", "a1", "a2"), line("lb", "b1", "b2")],
            vec![Constraint::Perpendicular { id: "c1".into(), a: "la".into(), b: "lb".into() }],
        ),
        None,
    );
    assert_solved(&result, TOL, "perpendicular");
    let (a1x, a1y) = get_pt(&result, "a1");
    let (a2x, a2y) = get_pt(&result, "a2");
    let (b1x, b1y) = get_pt(&result, "b1");
    let (b2x, b2y) = get_pt(&result, "b2");
    let da = ((a2x-a1x).hypot(a2y-a1y)).max(1e-9);
    let db = ((b2x-b1x).hypot(b2y-b1y)).max(1e-9);
    let dot = (a2x-a1x)/da * (b2x-b1x)/db + (a2y-a1y)/da * (b2y-b1y)/db;
    assert!(approx_eq(dot, 0.0, TOL), "dot={dot}");
}

#[test]
fn equal_length_constraint() {
    let result = solve_problem(
        problem(
            vec![
                fixed_point("a1", 0.0, 0.0), fixed_point("a2", 30.0, 0.0),
                point("b1", 100.0, 100.0), point("b2", 105.0, 103.0),
            ],
            vec![line("la", "a1", "a2"), line("lb", "b1", "b2")],
            vec![Constraint::Equal { id: "c1".into(), a: "la".into(), b: "lb".into() }],
        ),
        None,
    );
    assert_solved(&result, TOL, "equal");
    let (a1x, a1y) = get_pt(&result, "a1");
    let (a2x, a2y) = get_pt(&result, "a2");
    let (b1x, b1y) = get_pt(&result, "b1");
    let (b2x, b2y) = get_pt(&result, "b2");
    let len_a = ((a2x-a1x).powi(2) + (a2y-a1y).powi(2)).sqrt();
    let len_b = ((b2x-b1x).powi(2) + (b2y-b1y).powi(2)).sqrt();
    assert!(approx_eq(len_a, len_b, TOL), "len_a={len_a} len_b={len_b}");
}

#[test]
fn midpoint_constraint() {
    let result = solve_problem(
        problem(
            vec![
                fixed_point("a", 0.0, 0.0), fixed_point("b", 20.0, 0.0),
                point("m", 5.0, 5.0),
            ],
            vec![line("l1", "a", "b")],
            vec![Constraint::Midpoint { id: "c1".into(), point: "m".into(), line: "l1".into() }],
        ),
        None,
    );
    assert_solved(&result, TOL, "midpoint");
    let (ax, ay) = get_pt(&result, "a");
    let (bx, by) = get_pt(&result, "b");
    let (mx, my) = get_pt(&result, "m");
    assert!(approx_eq(mx, (ax+bx)/2.0, TOL) && approx_eq(my, (ay+by)/2.0, TOL),
        "midpoint ({mx},{my}) != expected ({},{}))", (ax+bx)/2.0, (ay+by)/2.0);
}

#[test]
fn point_on_circle() {
    let result = solve_problem(
        problem_with_circles(
            vec![fixed_point("c", 0.0, 0.0), point("p", 5.0, 0.0)],
            vec![],
            vec![circle("circ", "c", 10.0)],
            vec![
                Constraint::Radius { id: "r".into(), circle: "circ".into(), value: 10.0 },
                Constraint::PointOnCircle { id: "poc".into(), point: "p".into(), circle: "circ".into() },
            ],
        ),
        None,
    );
    assert_solved(&result, TOL, "point on circle");
    let (cx, cy) = get_pt(&result, "c");
    let (px, py) = get_pt(&result, "p");
    let dist = ((px-cx).powi(2) + (py-cy).powi(2)).sqrt();
    assert!(approx_eq(dist, 10.0, TOL), "dist={dist}");
}

#[test]
fn collinear_constraint() {
    let result = solve_problem(
        problem(
            vec![
                fixed_point("a", 0.0, 0.0), fixed_point("b", 10.0, 0.0),
                point("p", 5.0, 3.0),
            ],
            vec![line("l1", "a", "b")],
            vec![Constraint::Collinear { id: "c1".into(), point: "p".into(), line: "l1".into() }],
        ),
        None,
    );
    assert_solved(&result, TOL, "collinear");
    let (_, py) = get_pt(&result, "p");
    assert!(approx_eq(py, 0.0, TOL), "py={py}");
}

#[test]
fn concentric_circles() {
    let result = solve_problem(
        problem_with_circles(
            vec![fixed_point("c1", 0.0, 0.0), point("c2", 5.0, 5.0)],
            vec![],
            vec![circle("circ1", "c1", 10.0), circle("circ2", "c2", 15.0)],
            vec![Constraint::Concentric { id: "cc".into(), a: "circ1".into(), b: "circ2".into() }],
        ),
        None,
    );
    assert_solved(&result, TOL, "concentric");
    let (c1x, c1y) = get_pt(&result, "c1");
    let (c2x, c2y) = get_pt(&result, "c2");
    assert!(approx_eq(c1x, c2x, TOL) && approx_eq(c1y, c2y, TOL),
        "centers not coincident: ({c1x},{c1y}) vs ({c2x},{c2y})");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Multi-constraint systems — closed geometries
// ═══════════════════════════════════════════════════════════════════════════════

/// Square: 4 lines, horizontal/vertical constraints, equal lengths.
/// Expected: all sides equal, right angles everywhere.
#[test]
fn square_with_side_length() {
    // 4 points forming a near-square, then constrain to perfect square.
    let result = solve_problem(
        problem(
            vec![
                fixed_point("p0", 0.0, 0.0),
                point("p1", 10.0, 1.0),
                point("p2", 9.0, 10.0),
                point("p3", 1.0, 9.0),
            ],
            vec![
                line("l0", "p0", "p1"),
                line("l1", "p1", "p2"),
                line("l2", "p2", "p3"),
                line("l3", "p3", "p0"),
            ],
            vec![
                Constraint::Horizontal { id: "h0".into(), line: "l0".into() },
                Constraint::Vertical { id: "v1".into(), line: "l1".into() },
                Constraint::Horizontal { id: "h2".into(), line: "l2".into() },
                Constraint::Vertical { id: "v3".into(), line: "l3".into() },
                Constraint::Equal { id: "eq01".into(), a: "l0".into(), b: "l1".into() },
                Constraint::Length { id: "len".into(), line: "l0".into(), value: 20.0 },
            ],
        ),
        Some(tight_options()),
    );
    assert_solved(&result, 1e-4, "square");
    let (p0x, p0y) = get_pt(&result, "p0");
    let (p1x, p1y) = get_pt(&result, "p1");
    let (p2x, p2y) = get_pt(&result, "p2");
    let (p3x, p3y) = get_pt(&result, "p3");
    // Bottom side horizontal
    assert!(approx_eq(p0y, p1y, 1e-4), "bottom not horizontal");
    // Right side vertical
    assert!(approx_eq(p1x, p2x, 1e-4), "right not vertical");
    // All sides length 20
    let sides = [
        ((p1x-p0x).hypot(p1y-p0y)),
        ((p2x-p1x).hypot(p2y-p1y)),
        ((p3x-p2x).hypot(p3y-p2y)),
        ((p0x-p3x).hypot(p0y-p3y)),
    ];
    for (i, s) in sides.iter().enumerate() {
        assert!(approx_eq(*s, 20.0, 1e-3), "side {i} len={s}");
    }
}

/// Right triangle: three sides where the hypotenuse satisfies Pythagoras.
#[test]
fn right_triangle_pythagoras() {
    let result = solve_problem(
        problem(
            vec![
                fixed_point("o", 0.0, 0.0),
                point("a", 30.0, 0.0),
                point("b", 0.0, 40.0),
            ],
            vec![
                line("la", "o", "a"),
                line("lb", "o", "b"),
                line("lc", "a", "b"),
            ],
            vec![
                Constraint::Perpendicular { id: "perp".into(), a: "la".into(), b: "lb".into() },
                Constraint::Length { id: "len_a".into(), line: "la".into(), value: 30.0 },
                Constraint::Length { id: "len_b".into(), line: "lb".into(), value: 40.0 },
            ],
        ),
        Some(tight_options()),
    );
    assert_solved(&result, 1e-4, "right_triangle");
    let (ax, ay) = get_pt(&result, "a");
    let (bx, by) = get_pt(&result, "b");
    let hyp = ((bx-ax).powi(2) + (by-ay).powi(2)).sqrt();
    assert!(approx_eq(hyp, 50.0, 0.01), "hypotenuse={hyp} expected 50");
}

/// Equilateral triangle via equal-length and angle constraints.
#[test]
fn equilateral_triangle() {
    let result = solve_problem(
        problem(
            vec![
                fixed_point("a", 0.0, 0.0),
                point("b", 20.0, 2.0),
                point("c", 10.0, 15.0),
            ],
            vec![
                line("lab", "a", "b"),
                line("lbc", "b", "c"),
                line("lca", "c", "a"),
            ],
            vec![
                Constraint::Equal { id: "eq1".into(), a: "lab".into(), b: "lbc".into() },
                Constraint::Equal { id: "eq2".into(), a: "lbc".into(), b: "lca".into() },
                Constraint::Length { id: "len".into(), line: "lab".into(), value: 20.0 },
                Constraint::Horizontal { id: "h".into(), line: "lab".into() },
            ],
        ),
        Some(tight_options()),
    );
    assert_solved(&result, 1e-4, "equilateral_triangle");
    let (ax, _) = get_pt(&result, "a");
    let (bx, _) = get_pt(&result, "b");
    // All three sides should be ~20
    let (ax2, ay) = get_pt(&result, "a");
    let (bx2, by) = get_pt(&result, "b");
    let (cx, cy) = get_pt(&result, "c");
    let sides = [
        ((bx2-ax2).hypot(by-ay)),
        ((cx-bx2).hypot(cy-by)),
        ((ax2-cx).hypot(ay-cy)),
    ];
    for (i, s) in sides.iter().enumerate() {
        assert!(approx_eq(*s, 20.0, 0.05), "side {i} len={s}");
    }
    let _ = (ax, bx);
}

/// Circle internally tangent to line.
#[test]
fn line_circle_tangent() {
    let result = solve_problem(
        problem_with_circles(
            vec![
                fixed_point("a", 0.0, 0.0), fixed_point("b", 20.0, 0.0),
                point("c", 10.0, 5.0),
            ],
            vec![line("l1", "a", "b")],
            vec![circle("circ", "c", 3.0)],
            vec![
                Constraint::Tangent { id: "tan".into(), line: Some("l1".into()), circle: Some("circ".into()), a: None, b: None },
                Constraint::Radius { id: "r".into(), circle: "circ".into(), value: 5.0 },
            ],
        ),
        Some(tight_options()),
    );
    assert_solved(&result, 1e-4, "line_circle_tangent");
    let (cx, cy) = get_pt(&result, "c");
    let r = get_circle_radius(&result, "circ");
    // Distance from center to line y=0 should equal radius.
    assert!(approx_eq(cy.abs(), r, 0.01), "cy={cy} r={r}");
}

/// Two circles externally tangent.
#[test]
fn two_circles_tangent() {
    let result = solve_problem(
        problem_with_circles(
            vec![fixed_point("c1", 0.0, 0.0), point("c2", 20.0, 0.0)],
            vec![],
            vec![circle("circ1", "c1", 5.0), circle("circ2", "c2", 8.0)],
            vec![
                Constraint::Radius { id: "r1".into(), circle: "circ1".into(), value: 5.0 },
                Constraint::Radius { id: "r2".into(), circle: "circ2".into(), value: 8.0 },
                Constraint::Tangent { id: "tan".into(), a: Some("circ1".into()), b: Some("circ2".into()), line: None, circle: None },
            ],
        ),
        Some(tight_options()),
    );
    assert_solved(&result, 1e-4, "two_circles_tangent");
    let (c1x, c1y) = get_pt(&result, "c1");
    let (c2x, c2y) = get_pt(&result, "c2");
    let r1 = get_circle_radius(&result, "circ1");
    let r2 = get_circle_radius(&result, "circ2");
    let d = ((c2x-c1x).powi(2) + (c2y-c1y).powi(2)).sqrt();
    assert!(approx_eq(d, r1 + r2, 0.01), "d={d} r1+r2={}", r1+r2);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Fixed-point constraints
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn fixed_point_constraint() {
    let result = solve_problem(
        problem(
            vec![point("p", 5.0, 5.0)],
            vec![],
            vec![Constraint::Fixed { id: "fix".into(), point: "p".into(), x: 100.0, y: 200.0 }],
        ),
        None,
    );
    let (px, py) = get_pt(&result, "p");
    assert!(approx_eq(px, 100.0, TOL) && approx_eq(py, 200.0, TOL), "fixed: ({px},{py})");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Symmetric constraint
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn symmetric_about_vertical_axis() {
    let result = solve_problem(
        problem(
            vec![
                fixed_point("a1", 0.0, 0.0), fixed_point("a2", 0.0, 10.0), // axis = vertical line x=0
                point("p", 5.0, 3.0),     // point to reflect
                point("q", -3.0, 3.0),    // result of reflection (should end up at (-5, 3))
            ],
            vec![line("axis", "a1", "a2")],
            vec![
                Constraint::Symmetric { id: "sym".into(), a: "p".into(), b: "q".into(), axis: "axis".into() },
            ],
        ),
        Some(tight_options()),
    );
    assert_solved(&result, 1e-4, "symmetric");
    let (px, py) = get_pt(&result, "p");
    let (qx, qy) = get_pt(&result, "q");
    // q should be the reflection of p across x=0
    assert!(approx_eq(qx, -px, 0.01), "qx={qx} expected {}", -px);
    assert!(approx_eq(qy, py, 0.01), "qy={qy} expected {py}");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Angle constraints
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn angle_between_lines_90deg() {
    let result = solve_problem(
        problem(
            vec![
                fixed_point("o", 0.0, 0.0),
                fixed_point("a", 10.0, 0.0),
                point("b", 0.0, 8.0),
            ],
            vec![line("la", "o", "a"), line("lb", "o", "b")],
            vec![
                Constraint::Angle { id: "ang".into(), a: "la".into(), b: "lb".into(), value: 90.0 },
            ],
        ),
        Some(tight_options()),
    );
    assert_solved(&result, 1e-4, "angle 90°");
    let (ox, oy) = get_pt(&result, "o");
    let (ax, ay) = get_pt(&result, "a");
    let (bx, by) = get_pt(&result, "b");
    let angle_a = (ay - oy).atan2(ax - ox);
    let angle_b = (by - oy).atan2(bx - ox);
    let diff = (angle_b - angle_a).to_degrees().abs() % 360.0;
    let diff = if diff > 180.0 { 360.0 - diff } else { diff };
    assert!(approx_eq(diff, 90.0, 0.1), "angle diff={diff}°");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Arc constraints
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn arc_consistency_maintained() {
    // Create an arc and check that after solving, the arc's radius is consistent
    // with the distance from center to start/end points.
    let center = point("c", 0.0, 0.0);
    let start = point("s", 10.0, 0.0);
    let end = point("e", 0.0, 10.0);
    let a = arc("arc1", "c", "s", "e", 10.0, false);

    let problem = Problem {
        points: vec![center, start, end],
        lines: vec![],
        circles: vec![],
        arcs: vec![a],
        shapes: vec![],
        groups: vec![],
        constraints: vec![
            Constraint::Fixed { id: "fc".into(), point: "c".into(), x: 0.0, y: 0.0 },
            Constraint::Fixed { id: "fs".into(), point: "s".into(), x: 10.0, y: 0.0 },
            Constraint::Fixed { id: "fe".into(), point: "e".into(), x: 0.0, y: 10.0 },
        ],
        options: None,
    };
    let result = solve_problem(problem, None);
    // With all points fixed, arc radius should be auto-adjusted or error should be small.
    let arc_result = result.arcs.iter().find(|a| a.id == "arc1").unwrap();
    let (cx, cy) = get_pt(&result, "c");
    let (sx, sy) = get_pt(&result, "s");
    let dist_start = ((sx-cx).powi(2) + (sy-cy).powi(2)).sqrt();
    assert!(approx_eq(dist_start, 10.0, TOL), "start dist={dist_start}");
    // Radius value should be close to 10.
    assert!(approx_eq(arc_result.radius, 10.0, 0.1), "arc radius={}", arc_result.radius);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Point-on-line
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn point_on_line_interior() {
    let result = solve_problem(
        problem(
            vec![
                fixed_point("a", 0.0, 0.0), fixed_point("b", 20.0, 0.0),
                point("p", 10.0, 5.0),
            ],
            vec![line("l1", "a", "b")],
            vec![Constraint::PointOnLine { id: "pol".into(), point: "p".into(), line: "l1".into() }],
        ),
        None,
    );
    assert_solved(&result, TOL, "point_on_line");
    let (_, py) = get_pt(&result, "p");
    assert!(approx_eq(py, 0.0, TOL), "py={py}");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Equal radius
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn equal_radius_two_circles() {
    let result = solve_problem(
        problem_with_circles(
            vec![fixed_point("c1", 0.0, 0.0), point("c2", 20.0, 0.0)],
            vec![],
            vec![circle("circ1", "c1", 5.0), circle("circ2", "c2", 15.0)],
            vec![Constraint::EqualRadius { id: "eq".into(), a: "circ1".into(), b: "circ2".into() }],
        ),
        None,
    );
    assert_solved(&result, TOL, "equal_radius");
    let r1 = get_circle_radius(&result, "circ1");
    let r2 = get_circle_radius(&result, "circ2");
    assert!(approx_eq(r1, r2, TOL), "r1={r1} r2={r2}");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Boundary cases: degenerate geometry
// ═══════════════════════════════════════════════════════════════════════════════

/// Two coincident points that are already coincident → error should be 0.
#[test]
fn already_satisfied_coincident() {
    let result = solve_problem(
        problem(
            vec![point("a", 5.0, 3.0), point("b", 5.0, 3.0)],
            vec![],
            vec![Constraint::Coincident { id: "c1".into(), a: "a".into(), b: "b".into() }],
        ),
        None,
    );
    assert!(result.max_error < TOL, "already satisfied: max_error={}", result.max_error);
}

/// Both points fixed at same location.
#[test]
fn two_fixed_points_coincident() {
    let result = solve_problem(
        problem(
            vec![fixed_point("a", 5.0, 3.0), fixed_point("b", 5.0, 3.0)],
            vec![],
            vec![Constraint::Coincident { id: "c1".into(), a: "a".into(), b: "b".into() }],
        ),
        None,
    );
    assert!(result.max_error < TOL);
}

/// Conflicting constraints: distance=10 AND distance=20 between same pair.
/// The solver should converge but not fully satisfy both simultaneously.
#[test]
fn conflicting_distance_constraints() {
    let result = solve_problem(
        problem(
            vec![fixed_point("a", 0.0, 0.0), point("b", 5.0, 0.0)],
            vec![],
            vec![
                Constraint::Distance { id: "d1".into(), a: "a".into(), b: "b".into(), value: 10.0 },
                Constraint::Distance { id: "d2".into(), a: "a".into(), b: "b".into(), value: 20.0 },
            ],
        ),
        Some(SolveOptions { iterations: Some(50), tolerance: Some(1e-3), restarts: Some(3), ..Default::default() }),
    );
    // Should have non-zero error (constraints are incompatible).
    assert!(result.max_error > 0.1, "conflicting constraints should leave error>0.1, got {}", result.max_error);
}

/// Zero-length line with horizontal constraint — presolve should snap it.
#[test]
fn zero_length_line_horizontal_presolve() {
    let result = solve_problem(
        problem(
            // Start point and end point at exactly the same location.
            vec![fixed_point("a", 5.0, 5.0), point("b", 5.0, 5.0)],
            vec![line("l1", "a", "b")],
            vec![Constraint::Horizontal { id: "h".into(), line: "l1".into() }],
        ),
        None,
    );
    // After presolve snap, b should have been moved to create a non-degenerate horizontal line.
    let (ax, ay) = get_pt(&result, "a");
    let (bx, by) = get_pt(&result, "b");
    let len = ((bx-ax).powi(2) + (by-ay).powi(2)).sqrt();
    // Either the length is non-zero (snap happened) or constraint is satisfied (both on same y).
    assert!(len > 0.5 || approx_eq(ay, by, TOL), "zero-length line issue: len={len}");
}

/// Under-constrained system: one free point with no constraints.
/// Should converge trivially with max_error = 0.
#[test]
fn unconstrained_free_point() {
    let result = solve_problem(
        problem(vec![point("p", 3.0, 7.0)], vec![], vec![]),
        None,
    );
    assert!(result.max_error < TOL);
}

// ═══════════════════════════════════════════════════════════════════════════════
// JSON round-trip (lib.rs `solve` function)
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn json_roundtrip_coincident() {
    let json = r#"{
      "points": [
        {"id":"a","x":0.0,"y":0.0,"fixed":false},
        {"id":"b","x":10.0,"y":10.0,"fixed":false}
      ],
      "lines": [],
      "circles": [],
      "arcs": [],
      "shapes": [],
      "constraints": [
        {"type":"coincident","id":"c1","a":"a","b":"b"}
      ]
    }"#;
    let result_json = solver::solve(json);
    let result: SolveResult = serde_json::from_str(&result_json).unwrap();
    assert!(result.max_error < TOL, "json roundtrip max_error={}", result.max_error);
}

#[test]
fn json_roundtrip_malformed_returns_error() {
    let json = "not valid json";
    let result_json = solver::solve(json);
    let result: SolveResult = serde_json::from_str(&result_json).unwrap();
    assert_eq!(result.max_error, 1e308); // sentinel error value
}

// ═══════════════════════════════════════════════════════════════════════════════
// Regression: constraint types the TS solver handled — verify Rust matches
// ═══════════════════════════════════════════════════════════════════════════════

/// Angle between lines (unsigned).
#[test]
fn angle_between_60deg() {
    let result = solve_problem(
        problem(
            vec![
                fixed_point("o", 0.0, 0.0),
                fixed_point("a", 10.0, 0.0),
                point("b", 8.0, 5.0),
            ],
            vec![line("la", "o", "a"), line("lb", "o", "b")],
            vec![Constraint::AngleBetween { id: "ab".into(), a: "la".into(), b: "lb".into(), value: 60.0 }],
        ),
        Some(tight_options()),
    );
    assert_solved(&result, 1e-4, "angle_between 60°");
    let (ox, oy) = get_pt(&result, "o");
    let (ax, ay) = get_pt(&result, "a");
    let (bx, by) = get_pt(&result, "b");
    let da = ((ax-ox).powi(2) + (ay-oy).powi(2)).sqrt().max(1e-9);
    let db = ((bx-ox).powi(2) + (by-oy).powi(2)).sqrt().max(1e-9);
    let dot = ((ax-ox)/da * (bx-ox)/db + (ay-oy)/da * (by-oy)/db).clamp(-1.0, 1.0);
    let angle = dot.acos().to_degrees();
    assert!(approx_eq(angle, 60.0, 0.5), "angle={angle}°");
}

/// Line distance (parallel offset).
#[test]
fn line_distance_parallel_offset() {
    let result = solve_problem(
        problem(
            vec![
                fixed_point("a1", 0.0, 0.0), fixed_point("a2", 20.0, 0.0),
                point("b1", 0.0, 10.0), point("b2", 20.0, 12.0),
            ],
            vec![line("la", "a1", "a2"), line("lb", "b1", "b2")],
            vec![Constraint::LineDistance { id: "ld".into(), a: "la".into(), b: "lb".into(), value: 15.0 }],
        ),
        Some(tight_options()),
    );
    assert_solved(&result, 1e-4, "line_distance");
    // After solving, lb should be parallel to la and offset by 15.
    let (b1x, b1y) = get_pt(&result, "b1");
    let (b2x, b2y) = get_pt(&result, "b2");
    // Normal to la (horizontal) is vertical, so distance = mean y of lb.
    let mid_by = (b1y + b2y) / 2.0;
    assert!(approx_eq(mid_by, 15.0, 0.1), "offset={mid_by} expected 15");
    // Parallel check.
    let slope_b = if (b2x - b1x).abs() > 1e-9 { (b2y - b1y) / (b2x - b1x) } else { f64::INFINITY };
    assert!(approx_eq(slope_b, 0.0, 0.01), "slope={slope_b}");
}

/// PointLineDistance.
#[test]
fn point_line_distance() {
    let result = solve_problem(
        problem(
            vec![
                fixed_point("a", 0.0, 0.0), fixed_point("b", 10.0, 0.0),
                point("p", 5.0, 3.0),
            ],
            vec![line("l1", "a", "b")],
            vec![Constraint::PointLineDistance { id: "pld".into(), point: "p".into(), line: "l1".into(), value: 8.0 }],
        ),
        None,
    );
    assert_solved(&result, TOL, "point_line_distance");
    let (_, py) = get_pt(&result, "p");
    assert!(approx_eq(py, 8.0, TOL), "py={py}");
}

#[test]
fn analytical_direct_placement_with_zero_iterations() {
    let result = solve_problem(
        problem(
            vec![fixed_point("a", 10.0, 20.0), point("b", 0.0, 0.0)],
            vec![],
            vec![
                Constraint::HDistance { id: "hx".into(), a: "a".into(), b: "b".into(), value: 5.0 },
                Constraint::VDistance { id: "vy".into(), a: "a".into(), b: "b".into(), value: 7.0 },
            ],
        ),
        Some(SolveOptions {
            iterations: Some(0),
            tolerance: Some(1e-6),
            restarts: Some(1),
            warm_start_iterations: Some(0),
            ..Default::default()
        }),
    );
    assert_solved(&result, 1e-6, "analytical direct placement");
    let (bx, by) = get_pt(&result, "b");
    assert!(approx_eq(bx, 15.0, 1e-9), "bx={bx}");
    assert!(approx_eq(by, 27.0, 1e-9), "by={by}");
}

#[test]
fn ccw_and_block_rotation_keep_rectangle_upright() {
    let result = solve_problem(
        problem(
            vec![
                fixed_point("bl", 0.0, 0.0),
                point("br", -10.0, 0.0),
                point("tr", -10.0, -5.0),
                point("tl", 0.0, -5.0),
            ],
            vec![
                line("bottom", "bl", "br"),
                line("right", "br", "tr"),
                line("top", "tr", "tl"),
                line("left", "tl", "bl"),
            ],
            vec![
                Constraint::Horizontal { id: "h1".into(), line: "bottom".into() },
                Constraint::Vertical { id: "v1".into(), line: "right".into() },
                Constraint::Horizontal { id: "h2".into(), line: "top".into() },
                Constraint::Vertical { id: "v2".into(), line: "left".into() },
                Constraint::Length { id: "len-bottom".into(), line: "bottom".into(), value: 10.0 },
                Constraint::Length { id: "len-left".into(), line: "left".into(), value: 5.0 },
                Constraint::Ccw { id: "ccw".into(), points: vec!["bl".into(), "br".into(), "tr".into(), "tl".into()] },
                Constraint::BlockRotation { id: "block".into(), points: vec!["bl".into(), "br".into(), "tr".into(), "tl".into()], axis: "x".into() },
            ],
        ),
        Some(tight_options()),
    );
    assert_solved(&result, 1e-4, "ccw + blockRotation");
    let (blx, bly) = get_pt(&result, "bl");
    let (brx, bry) = get_pt(&result, "br");
    let (_trx, try_) = get_pt(&result, "tr");
    let (_tlx, tly) = get_pt(&result, "tl");
    assert!(brx > blx + 1.0, "expected bottom edge to point right: blx={blx} brx={brx}");
    assert!(try_ > bry + 1.0, "expected rectangle top above bottom: bry={bry} try={try_}");
    assert!(tly > bly + 1.0, "expected left edge to point upward: bly={bly} tly={tly}");
}

#[test]
fn solve_result_reports_metadata() {
    let result = solve_problem(
        problem(
            vec![fixed_point("a", 0.0, 0.0), point("b", 12.0, 3.0)],
            vec![],
            vec![
                Constraint::Distance { id: "d1".into(), a: "a".into(), b: "b".into(), value: 10.0 },
                Constraint::HDistance { id: "hx".into(), a: "a".into(), b: "b".into(), value: 10.0 },
                Constraint::VDistance { id: "vy".into(), a: "a".into(), b: "b".into(), value: 0.0 },
            ],
        ),
        Some(tight_options()),
    );
    let metadata = result.metadata.expect("metadata should be present");
    assert_eq!(metadata.status, SolveStatus::OverRedundant);
    assert!(metadata.dof < 0, "expected negative dof, got {}", metadata.dof);
    assert_eq!(metadata.conflicting_constraint_ids.len(), 0);
    assert_eq!(metadata.constraint_residuals.len(), 3);
    assert!(metadata.redundant_constraint_ids.len() <= metadata.constraint_residuals.len());
}

// ═══════════════════════════════════════════════════════════════════════════════
// Linear algebra tests (unit level)
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod linear_tests {
    use solver::types::*;
    use solver::solve_problem;
    use crate::helpers::*;

    /// Four coincident constraints on 4 free points — tests that the solver
    /// handles large numbers of variables without blowing up.
    #[test]
    fn many_coincident_constraints() {
        let mut points = vec![point("ref", 50.0, 50.0)];
        let mut constraints = vec![];
        for i in 1..=10 {
            let id = format!("p{i}");
            points.push(point(&id, i as f64 * 10.0, i as f64 * 3.0));
            constraints.push(Constraint::Coincident {
                id: format!("c{i}"),
                a: "ref".into(),
                b: id,
            });
        }
        let result = solve_problem(problem(points, vec![], constraints), Some(tight_options()));
        assert_solved(&result, 1e-4, "many coincident");
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Cold-start convergence tests — minimal reproducers for spectrometer regression
// These test whether the solver can converge from "garbage" initial positions
// where points are clustered near the origin at small scale (~0-5 units)
// but the solution is at a much larger scale (~20-60 units).
// ═══════════════════════════════════════════════════════════════════════════════

/// Equilateral triangle: 3 points at placeholder positions, fully constrained
/// by equal sides + fixed vertex + length + absolute angle.
/// This is the inner prism holder from the spectrometer.
#[test]
fn cold_start_equilateral_triangle() {
    // Placeholder positions (small scale, clustered) — NOT the solution.
    let problem = Problem {
        points: vec![
            point("p0", 0.0, 0.0),
            point("p1", 1.0, 1.0),
            point("p2", 0.0, 5.0),
        ],
        lines: vec![
            line("s0", "p0", "p1"),
            line("s1", "p1", "p2"),
            line("s2", "p2", "p0"),
        ],
        circles: vec![],
        arcs: vec![],
        shapes: vec![],
        groups: vec![],
        constraints: vec![
            Constraint::Ccw { id: "c-ccw".into(), points: vec!["p0".into(), "p1".into(), "p2".into()] },
            Constraint::Equal { id: "c-eq1".into(), a: "s0".into(), b: "s1".into() },
            Constraint::Equal { id: "c-eq2".into(), a: "s0".into(), b: "s2".into() },
            Constraint::Fixed { id: "c-fix".into(), point: "p0".into(), x: 0.0, y: 0.0 },
            Constraint::Length { id: "c-len".into(), line: "s0".into(), value: 22.0 },
            Constraint::AbsoluteAngle { id: "c-angle".into(), line: "s0".into(), value: 46.0 },
        ],
        options: None,
    };
    let result = solve_problem(problem, None);
    eprintln!("  equilateral triangle: max_error={:.6}, trail={:?}",
        result.max_error,
        result.metadata.as_ref().map(|m| &m.solve_trail));
    assert_solved(&result, TOL, "cold-start equilateral triangle");
}

/// Two concentric equilateral triangles with lineDistance offset.
/// This is the prism holder from the spectrometer (inner + outer triangles).
#[test]
fn cold_start_concentric_triangles() {
    let problem = Problem {
        points: vec![
            point("i0", 0.0, 0.0),
            point("i1", 1.0, 1.0),
            point("i2", 0.0, 5.0),
            point("o0", 0.0, 0.0),
            point("o1", 1.0, 1.0),
            point("o2", 0.0, 5.0),
        ],
        lines: vec![
            line("is0", "i0", "i1"),
            line("is1", "i1", "i2"),
            line("is2", "i2", "i0"),
            line("os0", "o0", "o1"),
            line("os1", "o1", "o2"),
            line("os2", "o2", "o0"),
        ],
        circles: vec![],
        arcs: vec![],
        shapes: vec![
            Shape { id: "ishape".into(), lines: vec!["is0".into(), "is1".into(), "is2".into()] },
            Shape { id: "oshape".into(), lines: vec!["os0".into(), "os1".into(), "os2".into()] },
        ],
        groups: vec![],
        constraints: vec![
            Constraint::Ccw { id: "c1".into(), points: vec!["i0".into(), "i1".into(), "i2".into()] },
            Constraint::Equal { id: "c2".into(), a: "is0".into(), b: "is1".into() },
            Constraint::Equal { id: "c3".into(), a: "is0".into(), b: "is2".into() },
            Constraint::Fixed { id: "c4".into(), point: "i0".into(), x: 0.0, y: 0.0 },
            Constraint::Ccw { id: "c5".into(), points: vec!["o0".into(), "o1".into(), "o2".into()] },
            Constraint::Equal { id: "c6".into(), a: "os0".into(), b: "os1".into() },
            Constraint::Equal { id: "c7".into(), a: "os0".into(), b: "os2".into() },
            Constraint::Length { id: "c8".into(), line: "is0".into(), value: 22.0 },
            Constraint::LineDistance { id: "c9".into(), a: "is0".into(), b: "os0".into(), value: -2.0 },
            Constraint::ShapeEqualCentroid { id: "c10".into(), a: "ishape".into(), b: "oshape".into() },
            Constraint::AbsoluteAngle { id: "c11".into(), line: "is0".into(), value: 46.0 },
        ],
        options: None,
    };
    let result = solve_problem(problem, None);
    eprintln!("  concentric triangles: max_error={:.6}, trail={:?}",
        result.max_error,
        result.metadata.as_ref().map(|m| &m.solve_trail));
    assert_solved(&result, TOL, "cold-start concentric triangles");
}

/// Case frame: 5 absolute-angle polyline segments with parallel inner offset.
/// Tests the outer case of the spectrometer.
#[test]
fn cold_start_case_frame() {
    // Start with just a simple case: 5 connected lines with absolute angles and lengths.
    // All starting at near-origin positions.
    let result = solve_problem(
        Problem {
            points: vec![
                fixed_point("p0", 0.0, 0.0),
                point("p1", 0.0, 1.0),
                point("p2", 0.0, 1.0),
                point("p3", 0.0, 1.0),
                point("p4", 0.0, 1.0),
                point("p5", 0.0, 1.0),
            ],
            lines: vec![
                line("l0", "p0", "p1"),
                line("l1", "p1", "p2"),
                line("l2", "p2", "p3"),
                line("l3", "p3", "p4"),
                line("l4", "p4", "p5"),
            ],
            circles: vec![],
            arcs: vec![],
            shapes: vec![],
            groups: vec![],
            constraints: vec![
                Constraint::AbsoluteAngle { id: "a0".into(), line: "l0".into(), value: -90.0 },
                Constraint::AbsoluteAngle { id: "a1".into(), line: "l1".into(), value: 0.0 },
                Constraint::AbsoluteAngle { id: "a2".into(), line: "l2".into(), value: 90.0 },
                Constraint::AbsoluteAngle { id: "a3".into(), line: "l3".into(), value: 180.0 },
                Constraint::AbsoluteAngle { id: "a4".into(), line: "l4".into(), value: -90.0 },
                Constraint::Length { id: "len0".into(), line: "l0".into(), value: 5.0 },
                Constraint::Length { id: "len1".into(), line: "l1".into(), value: 50.0 },
                Constraint::Length { id: "len2".into(), line: "l2".into(), value: 49.0 },
                Constraint::Length { id: "len3".into(), line: "l3".into(), value: 50.0 },
                Constraint::Length { id: "len4".into(), line: "l4".into(), value: 25.0 },
            ],
            options: None,
        },
        None,
    );
    eprintln!("  case frame: max_error={:.6}, trail={:?}",
        result.max_error,
        result.metadata.as_ref().map(|m| &m.solve_trail));
    assert_solved(&result, TOL, "cold-start case frame");
}

/// Combined: equilateral triangle + case frame attached to it.
/// This tests whether coupled subsystems can be solved cold-start.
#[test]
fn cold_start_triangle_plus_case() {
    let result = solve_problem(
        Problem {
            points: vec![
                // Inner triangle
                point("i0", 0.0, 0.0),
                point("i1", 1.0, 1.0),
                point("i2", 0.0, 5.0),
                // Outer triangle
                point("o0", 0.0, 0.0),
                point("o1", 1.0, 1.0),
                point("o2", 0.0, 5.0),
                // Case: 5-segment polyline from outer.vertex(0) to outer.vertex(2)
                // (using shared points o0 and o2 as endpoints, with 4 intermediate points)
                point("c1", 0.0, 1.0),
                point("c2", 0.0, 1.0),
                point("c3", 0.0, 1.0),
                point("c4", 0.0, 1.0),
            ],
            lines: vec![
                line("is0", "i0", "i1"),
                line("is1", "i1", "i2"),
                line("is2", "i2", "i0"),
                line("os0", "o0", "o1"),
                line("os1", "o1", "o2"),
                line("os2", "o2", "o0"),
                // Case lines: o0 → c1 → c2 → c3 → c4 → o2
                line("cl0", "o0", "c1"),
                line("cl1", "c1", "c2"),
                line("cl2", "c2", "c3"),
                line("cl3", "c3", "c4"),
                line("cl4", "c4", "o2"),
            ],
            circles: vec![],
            arcs: vec![],
            shapes: vec![
                Shape { id: "ishape".into(), lines: vec!["is0".into(), "is1".into(), "is2".into()] },
                Shape { id: "oshape".into(), lines: vec!["os0".into(), "os1".into(), "os2".into()] },
            ],
            groups: vec![],
            constraints: vec![
                // Inner triangle
                Constraint::Ccw { id: "t1".into(), points: vec!["i0".into(), "i1".into(), "i2".into()] },
                Constraint::Equal { id: "t2".into(), a: "is0".into(), b: "is1".into() },
                Constraint::Equal { id: "t3".into(), a: "is0".into(), b: "is2".into() },
                Constraint::Fixed { id: "t4".into(), point: "i0".into(), x: 0.0, y: 0.0 },
                // Outer triangle
                Constraint::Ccw { id: "t5".into(), points: vec!["o0".into(), "o1".into(), "o2".into()] },
                Constraint::Equal { id: "t6".into(), a: "os0".into(), b: "os1".into() },
                Constraint::Equal { id: "t7".into(), a: "os0".into(), b: "os2".into() },
                Constraint::Length { id: "t8".into(), line: "is0".into(), value: 22.0 },
                Constraint::LineDistance { id: "t9".into(), a: "is0".into(), b: "os0".into(), value: -2.0 },
                Constraint::ShapeEqualCentroid { id: "t10".into(), a: "ishape".into(), b: "oshape".into() },
                Constraint::AbsoluteAngle { id: "t11".into(), line: "is0".into(), value: 46.0 },
                // Case angles
                Constraint::AbsoluteAngle { id: "ca0".into(), line: "cl0".into(), value: -90.0 },
                Constraint::AbsoluteAngle { id: "ca1".into(), line: "cl1".into(), value: 0.0 },
                Constraint::AbsoluteAngle { id: "ca2".into(), line: "cl2".into(), value: 90.0 },
                Constraint::AbsoluteAngle { id: "ca3".into(), line: "cl3".into(), value: 180.0 },
                Constraint::AbsoluteAngle { id: "ca4".into(), line: "cl4".into(), value: -90.0 },
            ],
            options: None,
        },
        None,
    );
    eprintln!("  triangle+case: max_error={:.6}, dof={}, trail_len={}",
        result.max_error,
        result.metadata.as_ref().map(|m| m.dof).unwrap_or(0),
        result.metadata.as_ref().map(|m| m.solve_trail.len()).unwrap_or(0));
    for step in result.metadata.as_ref().map(|m| &m.solve_trail).unwrap_or(&vec![]) {
        eprintln!("    {} err={:.4}", step.phase, step.error);
    }
    assert_solved(&result, TOL, "cold-start triangle+case");
}

/// Triangle + case + inner case with lineDistance.
/// The inner case has no explicit angles/lengths — geometry determined by lineDistance from outer.
#[test]
fn cold_start_triangle_case_inner() {
    let result = solve_problem(
        Problem {
            points: vec![
                // Inner triangle
                point("i0", 0.0, 0.0),
                point("i1", 1.0, 1.0),
                point("i2", 0.0, 5.0),
                // Outer triangle
                point("o0", 0.0, 0.0),
                point("o1", 1.0, 1.0),
                point("o2", 0.0, 5.0),
                // Outer case: o0 → c1 → c2 → c3 → c4 → o2
                point("c1", 0.0, 1.0),
                point("c2", 0.0, 1.0),
                point("c3", 0.0, 1.0),
                point("c4", 0.0, 1.0),
                // Inner case: ic0 → ic1 → ic2 → ic3 → ic4 → ic5
                // ic0 is on outer.sides[0], ic5 is on outer.sides[1]
                point("ic0", 0.5, 0.5),
                point("ic1", 0.5, 1.0),
                point("ic2", 0.5, 1.0),
                point("ic3", 0.5, 1.0),
                point("ic4", 0.5, 1.0),
                point("ic5", 0.5, 2.0),
            ],
            lines: vec![
                line("is0", "i0", "i1"),
                line("is1", "i1", "i2"),
                line("is2", "i2", "i0"),
                line("os0", "o0", "o1"),
                line("os1", "o1", "o2"),
                line("os2", "o2", "o0"),
                // Outer case
                line("cl0", "o0", "c1"),
                line("cl1", "c1", "c2"),
                line("cl2", "c2", "c3"),
                line("cl3", "c3", "c4"),
                line("cl4", "c4", "o2"),
                // Inner case
                line("il0", "ic0", "ic1"),
                line("il1", "ic1", "ic2"),
                line("il2", "ic2", "ic3"),
                line("il3", "ic3", "ic4"),
                line("il4", "ic4", "ic5"),
            ],
            circles: vec![],
            arcs: vec![],
            shapes: vec![
                Shape { id: "ishape".into(), lines: vec!["is0".into(), "is1".into(), "is2".into()] },
                Shape { id: "oshape".into(), lines: vec!["os0".into(), "os1".into(), "os2".into()] },
            ],
            groups: vec![],
            constraints: vec![
                // Inner triangle
                Constraint::Ccw { id: "t1".into(), points: vec!["i0".into(), "i1".into(), "i2".into()] },
                Constraint::Equal { id: "t2".into(), a: "is0".into(), b: "is1".into() },
                Constraint::Equal { id: "t3".into(), a: "is0".into(), b: "is2".into() },
                Constraint::Fixed { id: "t4".into(), point: "i0".into(), x: 0.0, y: 0.0 },
                // Outer triangle
                Constraint::Ccw { id: "t5".into(), points: vec!["o0".into(), "o1".into(), "o2".into()] },
                Constraint::Equal { id: "t6".into(), a: "os0".into(), b: "os1".into() },
                Constraint::Equal { id: "t7".into(), a: "os0".into(), b: "os2".into() },
                Constraint::Length { id: "t8".into(), line: "is0".into(), value: 22.0 },
                Constraint::LineDistance { id: "t9".into(), a: "is0".into(), b: "os0".into(), value: -2.0 },
                Constraint::ShapeEqualCentroid { id: "t10".into(), a: "ishape".into(), b: "oshape".into() },
                Constraint::AbsoluteAngle { id: "t11".into(), line: "is0".into(), value: 46.0 },
                // Outer case angles
                Constraint::AbsoluteAngle { id: "ca0".into(), line: "cl0".into(), value: -90.0 },
                Constraint::AbsoluteAngle { id: "ca1".into(), line: "cl1".into(), value: 0.0 },
                Constraint::AbsoluteAngle { id: "ca2".into(), line: "cl2".into(), value: 90.0 },
                Constraint::AbsoluteAngle { id: "ca3".into(), line: "cl3".into(), value: 180.0 },
                Constraint::AbsoluteAngle { id: "ca4".into(), line: "cl4".into(), value: -90.0 },
                // Inner case ↔ outer case lineDistance
                Constraint::LineDistance { id: "ld0".into(), a: "cl0".into(), b: "il0".into(), value: 5.0 },
                Constraint::LineDistance { id: "ld1".into(), a: "cl1".into(), b: "il1".into(), value: 5.0 },
                Constraint::LineDistance { id: "ld2".into(), a: "cl2".into(), b: "il2".into(), value: 5.0 },
                Constraint::LineDistance { id: "ld3".into(), a: "cl3".into(), b: "il3".into(), value: 5.0 },
                Constraint::LineDistance { id: "ld4".into(), a: "cl4".into(), b: "il4".into(), value: 5.0 },
                // Inner case endpoints on outer triangle sides
                Constraint::PointOnLine { id: "pol0".into(), point: "ic0".into(), line: "os0".into() },
                Constraint::PointOnLine { id: "pol1".into(), point: "ic5".into(), line: "os1".into() },
                // CCW for inner case points
                Constraint::Ccw { id: "ccw_ic".into(), points: vec!["ic0".into(), "ic1".into(), "ic2".into()] },
            ],
            options: None,
        },
        None,
    );
    eprintln!("  triangle+case+inner: max_error={:.6}, dof={}",
        result.max_error,
        result.metadata.as_ref().map(|m| m.dof).unwrap_or(0));
    for step in result.metadata.as_ref().map(|m| &m.solve_trail).unwrap_or(&vec![]) {
        eprintln!("    {} err={:.4}", step.phase, step.error);
    }
    assert_solved(&result, TOL, "cold-start triangle+case+inner");
}

/// Triangle + case + inner case + back opening + outer camera.
/// This isolates whether the camera rectangle causes the convergence failure.
#[test]
fn cold_start_with_camera() {
    let result = solve_problem(
        Problem {
            points: vec![
                // Inner triangle
                point("i0", 0.0, 0.0),
                point("i1", 1.0, 1.0),
                point("i2", 0.0, 5.0),
                // Outer triangle
                point("o0", 0.0, 0.0),
                point("o1", 1.0, 1.0),
                point("o2", 0.0, 5.0),
                // Outer case: o0 → c1 → c2 → c3 → c4 → o2
                point("c1", 0.0, 1.0),
                point("c2", 0.0, 1.0),
                point("c3", 0.0, 1.0),
                point("c4", 0.0, 1.0),
                // Inner case: ic0 → ic1 → ic2 → ic3 → ic4 → ic5
                point("ic0", 0.5, 0.5),
                point("ic1", 0.5, 1.0),
                point("ic2", 0.5, 1.0),
                point("ic3", 0.5, 1.0),
                point("ic4", 0.5, 1.0),
                point("ic5", 0.5, 2.0),
                // Back opening (rectangle)
                point("bp0", 1.0, 1.0),
                point("bp1", 2.0, 1.0),
                point("bp2", 2.0, 2.0),
                point("bp3", 1.0, 2.0),
                point("attach", 1.5, 1.0), // opening midpoint
                // Outer camera
                point("oc0", 1.0, 1.0),
                point("oc1", 2.0, 1.0),
                point("oc2", 2.0, 2.0),
                point("oc3", 1.0, 2.0),
            ],
            lines: vec![
                line("is0", "i0", "i1"),
                line("is1", "i1", "i2"),
                line("is2", "i2", "i0"),
                line("os0", "o0", "o1"),
                line("os1", "o1", "o2"),
                line("os2", "o2", "o0"),
                // Outer case
                line("cl0", "o0", "c1"),
                line("cl1", "c1", "c2"),
                line("cl2", "c2", "c3"),
                line("cl3", "c3", "c4"),
                line("cl4", "c4", "o2"),
                // Inner case
                line("il0", "ic0", "ic1"),
                line("il1", "ic1", "ic2"),
                line("il2", "ic2", "ic3"),
                line("il3", "ic3", "ic4"),
                line("il4", "ic4", "ic5"),
                // Back opening
                line("bs0", "bp0", "bp1"),
                line("bs1", "bp1", "bp2"),
                line("bs2", "bp2", "bp3"),
                line("bs3", "bp3", "bp0"),
                // Outer camera
                line("ocs0", "oc0", "oc1"),
                line("ocs1", "oc1", "oc2"),
                line("ocs2", "oc2", "oc3"),
                line("ocs3", "oc3", "oc0"),
            ],
            circles: vec![],
            arcs: vec![],
            shapes: vec![
                Shape { id: "ishape".into(), lines: vec!["is0".into(), "is1".into(), "is2".into()] },
                Shape { id: "oshape".into(), lines: vec!["os0".into(), "os1".into(), "os2".into()] },
            ],
            groups: vec![],
            constraints: vec![
                // Inner triangle
                Constraint::Ccw { id: "t1".into(), points: vec!["i0".into(), "i1".into(), "i2".into()] },
                Constraint::Equal { id: "t2".into(), a: "is0".into(), b: "is1".into() },
                Constraint::Equal { id: "t3".into(), a: "is0".into(), b: "is2".into() },
                Constraint::Fixed { id: "t4".into(), point: "i0".into(), x: 0.0, y: 0.0 },
                // Outer triangle
                Constraint::Ccw { id: "t5".into(), points: vec!["o0".into(), "o1".into(), "o2".into()] },
                Constraint::Equal { id: "t6".into(), a: "os0".into(), b: "os1".into() },
                Constraint::Equal { id: "t7".into(), a: "os0".into(), b: "os2".into() },
                Constraint::Length { id: "t8".into(), line: "is0".into(), value: 22.0 },
                Constraint::LineDistance { id: "t9".into(), a: "is0".into(), b: "os0".into(), value: -2.0 },
                Constraint::ShapeEqualCentroid { id: "t10".into(), a: "ishape".into(), b: "oshape".into() },
                Constraint::AbsoluteAngle { id: "t11".into(), line: "is0".into(), value: 46.0 },
                // Outer case angles
                Constraint::AbsoluteAngle { id: "ca0".into(), line: "cl0".into(), value: -90.0 },
                Constraint::AbsoluteAngle { id: "ca1".into(), line: "cl1".into(), value: 0.0 },
                Constraint::AbsoluteAngle { id: "ca2".into(), line: "cl2".into(), value: 90.0 },
                Constraint::AbsoluteAngle { id: "ca3".into(), line: "cl3".into(), value: 180.0 },
                Constraint::AbsoluteAngle { id: "ca4".into(), line: "cl4".into(), value: -90.0 },
                // Inner case ↔ outer case lineDistance
                Constraint::LineDistance { id: "ld0".into(), a: "cl0".into(), b: "il0".into(), value: 5.0 },
                Constraint::LineDistance { id: "ld1".into(), a: "cl1".into(), b: "il1".into(), value: 5.0 },
                Constraint::LineDistance { id: "ld2".into(), a: "cl2".into(), b: "il2".into(), value: 5.0 },
                Constraint::LineDistance { id: "ld3".into(), a: "cl3".into(), b: "il3".into(), value: 5.0 },
                Constraint::LineDistance { id: "ld4".into(), a: "cl4".into(), b: "il4".into(), value: 5.0 },
                // Inner case endpoints on outer triangle sides
                Constraint::PointOnLine { id: "pol0".into(), point: "ic0".into(), line: "os0".into() },
                Constraint::PointOnLine { id: "pol1".into(), point: "ic5".into(), line: "os1".into() },
                // Back opening
                Constraint::Parallel { id: "bp0".into(), a: "bs0".into(), b: "bs2".into() },
                Constraint::Parallel { id: "bp1".into(), a: "bs1".into(), b: "bs3".into() },
                Constraint::Length { id: "blen".into(), line: "bs0".into(), value: 4.0 },
                Constraint::Perpendicular { id: "bperp".into(), a: "bs0".into(), b: "bs1".into() },
                Constraint::LineDistance { id: "bld0".into(), a: "bs0".into(), b: "il2".into(), value: 0.0 },
                Constraint::LineDistance { id: "bld1".into(), a: "bs2".into(), b: "cl2".into(), value: 0.0 },
                Constraint::Midpoint { id: "bmid0".into(), point: "attach".into(), line: "bs0".into() },
                Constraint::Midpoint { id: "bmid1".into(), point: "attach".into(), line: "il2".into() },
                // Outer camera: vertices on inner case lines
                Constraint::PointOnLine { id: "cpol0".into(), point: "oc0".into(), line: "il3".into() },
                Constraint::PointOnLine { id: "cpol1".into(), point: "oc1".into(), line: "il3".into() },
                Constraint::PointOnLine { id: "cpol2".into(), point: "oc2".into(), line: "il1".into() },
                Constraint::PointOnLine { id: "cpol3".into(), point: "oc3".into(), line: "il1".into() },
                Constraint::Perpendicular { id: "cperp0".into(), a: "il3".into(), b: "ocs1".into() },
                Constraint::Perpendicular { id: "cperp1".into(), a: "il3".into(), b: "ocs3".into() },
                Constraint::Length { id: "clen".into(), line: "ocs1".into(), value: 39.0 },
            ],
            options: None,
        },
        None,
    );
    eprintln!("  with-camera: max_error={:.6}, dof={}",
        result.max_error,
        result.metadata.as_ref().map(|m| m.dof).unwrap_or(0));
    for step in result.metadata.as_ref().map(|m| &m.solve_trail).unwrap_or(&vec![]) {
        eprintln!("    {} err={:.4}", step.phase, step.error);
    }
    assert_solved(&result, TOL, "cold-start with camera");
}

/// Minimal reproduction: rectangle with vertices on two parallel lines.
/// This is the camera-on-case-lines pattern from the spectrometer.
#[test]
fn cold_start_rect_on_parallel_lines() {
    // Two horizontal parallel lines (simulating inner case lines il1 and il3).
    // A rectangle with vertices constrained to lie on these lines.
    let result = solve_problem(
        Problem {
            points: vec![
                // Two horizontal lines (fixed endpoints to simulate known case geometry)
                fixed_point("la0", 0.0, 0.0),
                fixed_point("la1", 50.0, 0.0),
                fixed_point("lb0", 50.0, 39.0),
                fixed_point("lb1", 0.0, 39.0),
                // Rectangle vertices (start at bad positions)
                point("r0", 1.0, 1.0),
                point("r1", 2.0, 1.0),
                point("r2", 2.0, 2.0),
                point("r3", 1.0, 2.0),
            ],
            lines: vec![
                line("lineA", "la0", "la1"), // horizontal at y=0
                line("lineB", "lb0", "lb1"), // horizontal at y=40
                line("rs0", "r0", "r1"),
                line("rs1", "r1", "r2"),
                line("rs2", "r2", "r3"),
                line("rs3", "r3", "r0"),
            ],
            circles: vec![],
            arcs: vec![],
            shapes: vec![],
            groups: vec![],
            constraints: vec![
                // Rectangle vertices on the two lines
                Constraint::PointOnLine { id: "pol0".into(), point: "r0".into(), line: "lineB".into() },
                Constraint::PointOnLine { id: "pol1".into(), point: "r1".into(), line: "lineB".into() },
                Constraint::PointOnLine { id: "pol2".into(), point: "r2".into(), line: "lineA".into() },
                Constraint::PointOnLine { id: "pol3".into(), point: "r3".into(), line: "lineA".into() },
                // Perpendicular to lineB
                Constraint::Perpendicular { id: "perp0".into(), a: "lineB".into(), b: "rs1".into() },
                Constraint::Perpendicular { id: "perp1".into(), a: "lineB".into(), b: "rs3".into() },
                // Rectangle width
                Constraint::Length { id: "len".into(), line: "rs1".into(), value: 39.0 },
            ],
            options: None,
        },
        None,
    );
    eprintln!("  rect-on-lines: max_error={:.6}, dof={}",
        result.max_error,
        result.metadata.as_ref().map(|m| m.dof).unwrap_or(0));
    for step in result.metadata.as_ref().map(|m| &m.solve_trail).unwrap_or(&vec![]) {
        eprintln!("    {} err={:.4}", step.phase, step.error);
    }
    assert_solved(&result, TOL, "rect on parallel lines");
}

/// Same as above but with FREE (non-fixed) parallel lines, simulating the real spectrometer.
/// Lines determined by angle constraints + lineDistance, not fixed endpoints.
#[test]
fn cold_start_rect_on_free_lines() {
    let result = solve_problem(
        Problem {
            points: vec![
                // Two lines with free endpoints (simulating inner case)
                fixed_point("a0", 0.0, 0.0),
                point("a1", 1.0, 0.0),
                point("b0", 1.0, 1.0),
                point("b1", 0.0, 1.0),
                // Rectangle
                point("r0", 0.5, 0.5),
                point("r1", 1.5, 0.5),
                point("r2", 1.5, 1.5),
                point("r3", 0.5, 1.5),
            ],
            lines: vec![
                line("lineA", "a0", "a1"),
                line("lineB", "b0", "b1"),
                line("rs0", "r0", "r1"),
                line("rs1", "r1", "r2"),
                line("rs2", "r2", "r3"),
                line("rs3", "r3", "r0"),
            ],
            circles: vec![],
            arcs: vec![],
            shapes: vec![],
            groups: vec![],
            constraints: vec![
                // Lines are horizontal
                Constraint::AbsoluteAngle { id: "aa0".into(), line: "lineA".into(), value: 0.0 },
                Constraint::AbsoluteAngle { id: "aa1".into(), line: "lineB".into(), value: 180.0 },
                // Lines are 39 apart (matches rect height)
                Constraint::LineDistance { id: "ld".into(), a: "lineA".into(), b: "lineB".into(), value: 39.0 },
                // Line lengths
                Constraint::Length { id: "lenA".into(), line: "lineA".into(), value: 50.0 },
                Constraint::Length { id: "lenB".into(), line: "lineB".into(), value: 50.0 },
                // Rectangle on lines
                Constraint::PointOnLine { id: "pol0".into(), point: "r0".into(), line: "lineB".into() },
                Constraint::PointOnLine { id: "pol1".into(), point: "r1".into(), line: "lineB".into() },
                Constraint::PointOnLine { id: "pol2".into(), point: "r2".into(), line: "lineA".into() },
                Constraint::PointOnLine { id: "pol3".into(), point: "r3".into(), line: "lineA".into() },
                Constraint::Perpendicular { id: "perp0".into(), a: "lineB".into(), b: "rs1".into() },
                Constraint::Perpendicular { id: "perp1".into(), a: "lineB".into(), b: "rs3".into() },
                Constraint::Length { id: "rlen".into(), line: "rs1".into(), value: 39.0 },
            ],
            options: None,
        },
        None,
    );
    eprintln!("  rect-on-free-lines: max_error={:.6}, dof={}",
        result.max_error,
        result.metadata.as_ref().map(|m| m.dof).unwrap_or(0));
    for step in result.metadata.as_ref().map(|m| &m.solve_trail).unwrap_or(&vec![]) {
        eprintln!("    {} err={:.4}", step.phase, step.error);
    }
    assert_solved(&result, TOL, "rect on free lines");
}

// ═══════════════════════════════════════════════════════════════════════════════
// LM convergence basin tests — probe the solver's ability to converge from
// various distances. No presolve changes here; we're testing LM's limits.
// ═══════════════════════════════════════════════════════════════════════════════

/// Helper: build the camera-on-free-lines problem with points at a given offset
/// from the known solution. offset=0 means perfect solution, offset=10 means
/// each free point displaced by ~10 units.
fn camera_on_lines_problem(offset: f64) -> Problem {
    // Solution geometry:
    // lineA: (0,0) → (50,0)  horizontal right
    // lineB: (50,39) → (0,39)  horizontal left (angle=180)
    // Rectangle: r0=(33,39) r1=(27,39) on lineB; r2=(27,0) r3=(33,0) on lineA
    // (6 wide × 39 tall rectangle)
    let a0 = (0.0, 0.0);  // fixed
    let a1_sol = (50.0, 0.0);
    let b0_sol = (50.0, 39.0);
    let b1_sol = (0.0, 39.0);
    let r0_sol = (33.0, 39.0);
    let r1_sol = (27.0, 39.0);
    let r2_sol = (27.0, 0.0);
    let r3_sol = (33.0, 0.0);

    // Displace free points by `offset` in a deterministic pattern.
    let displace = |sol: (f64, f64), seed: f64| -> (f64, f64) {
        let angle = seed * 2.3; // deterministic but varied directions
        (sol.0 + offset * angle.cos(), sol.1 + offset * angle.sin())
    };
    let a1 = displace(a1_sol, 1.0);
    let b0 = displace(b0_sol, 2.0);
    let b1 = displace(b1_sol, 3.0);
    let r0 = displace(r0_sol, 4.0);
    let r1 = displace(r1_sol, 5.0);
    let r2 = displace(r2_sol, 6.0);
    let r3 = displace(r3_sol, 7.0);

    Problem {
        points: vec![
            fixed_point("a0", a0.0, a0.1),
            point("a1", a1.0, a1.1),
            point("b0", b0.0, b0.1),
            point("b1", b1.0, b1.1),
            point("r0", r0.0, r0.1),
            point("r1", r1.0, r1.1),
            point("r2", r2.0, r2.1),
            point("r3", r3.0, r3.1),
        ],
        lines: vec![
            line("lineA", "a0", "a1"),
            line("lineB", "b0", "b1"),
            line("rs0", "r0", "r1"),
            line("rs1", "r1", "r2"),
            line("rs2", "r2", "r3"),
            line("rs3", "r3", "r0"),
        ],
        circles: vec![],
        arcs: vec![],
        shapes: vec![],
        groups: vec![],
        constraints: vec![
            Constraint::AbsoluteAngle { id: "aa0".into(), line: "lineA".into(), value: 0.0 },
            Constraint::AbsoluteAngle { id: "aa1".into(), line: "lineB".into(), value: 180.0 },
            Constraint::LineDistance { id: "ld".into(), a: "lineA".into(), b: "lineB".into(), value: 39.0 },
            Constraint::Length { id: "lenA".into(), line: "lineA".into(), value: 50.0 },
            Constraint::Length { id: "lenB".into(), line: "lineB".into(), value: 50.0 },
            Constraint::PointOnLine { id: "pol0".into(), point: "r0".into(), line: "lineB".into() },
            Constraint::PointOnLine { id: "pol1".into(), point: "r1".into(), line: "lineB".into() },
            Constraint::PointOnLine { id: "pol2".into(), point: "r2".into(), line: "lineA".into() },
            Constraint::PointOnLine { id: "pol3".into(), point: "r3".into(), line: "lineA".into() },
            Constraint::Perpendicular { id: "perp0".into(), a: "lineB".into(), b: "rs1".into() },
            Constraint::Perpendicular { id: "perp1".into(), a: "lineB".into(), b: "rs3".into() },
            Constraint::Length { id: "rlen".into(), line: "rs1".into(), value: 39.0 },
        ],
        options: None,
    }
}

#[test]
fn lm_basin_offset_0() {
    // At the solution — should trivially converge.
    let result = solve_problem(camera_on_lines_problem(0.0), None);
    eprintln!("  offset=0: max_error={:.6}", result.max_error);
    assert_solved(&result, TOL, "LM basin offset=0");
}

#[test]
fn lm_basin_offset_1() {
    let result = solve_problem(camera_on_lines_problem(1.0), None);
    eprintln!("  offset=1: max_error={:.6}", result.max_error);
    for step in result.metadata.as_ref().map(|m| &m.solve_trail).unwrap_or(&vec![]) {
        eprintln!("    {} err={:.4}", step.phase, step.error);
    }
    assert_solved(&result, TOL, "LM basin offset=1");
}

#[test]
fn lm_basin_offset_5() {
    let result = solve_problem(camera_on_lines_problem(5.0), None);
    eprintln!("  offset=5: max_error={:.6}", result.max_error);
    for step in result.metadata.as_ref().map(|m| &m.solve_trail).unwrap_or(&vec![]) {
        eprintln!("    {} err={:.4}", step.phase, step.error);
    }
    assert_solved(&result, TOL, "LM basin offset=5");
}

#[test]
fn lm_basin_offset_10() {
    let result = solve_problem(camera_on_lines_problem(10.0), None);
    eprintln!("  offset=10: max_error={:.6}", result.max_error);
    for step in result.metadata.as_ref().map(|m| &m.solve_trail).unwrap_or(&vec![]) {
        eprintln!("    {} err={:.4}", step.phase, step.error);
    }
    assert_solved(&result, TOL, "LM basin offset=10");
}

#[test]
fn lm_basin_offset_20() {
    let result = solve_problem(camera_on_lines_problem(20.0), None);
    eprintln!("  offset=20: max_error={:.6}", result.max_error);
    for step in result.metadata.as_ref().map(|m| &m.solve_trail).unwrap_or(&vec![]) {
        eprintln!("    {} err={:.4}", step.phase, step.error);
    }
    assert_solved(&result, TOL, "LM basin offset=20");
}

#[test]
fn lm_basin_offset_40() {
    let result = solve_problem(camera_on_lines_problem(40.0), None);
    eprintln!("  offset=40: max_error={:.6}", result.max_error);
    for step in result.metadata.as_ref().map(|m| &m.solve_trail).unwrap_or(&vec![]) {
        eprintln!("    {} err={:.4}", step.phase, step.error);
    }
    assert_solved(&result, TOL, "LM basin offset=40");
}

/// Test with lines starting at wrong scale — simulating the case chain problem.
/// Lines start short (5 units) instead of 50, and close together (5 units apart
/// instead of 39). The camera must stretch to 39 while the lines must grow to 50.
#[test]
fn lm_basin_wrong_scale() {
    let result = solve_problem(
        Problem {
            points: vec![
                // Lines start short and close together
                fixed_point("a0", 0.0, 0.0),
                point("a1", 5.0, 0.0),       // should be (50, 0) — 10x too short
                point("b0", 5.0, 5.0),        // should be (50, 39) — wrong position
                point("b1", 0.0, 5.0),        // should be (0, 39) — 8x too short
                // Rectangle starts small
                point("r0", 3.0, 5.0),
                point("r1", 2.0, 5.0),
                point("r2", 2.0, 0.0),
                point("r3", 3.0, 0.0),
            ],
            lines: vec![
                line("lineA", "a0", "a1"),
                line("lineB", "b0", "b1"),
                line("rs0", "r0", "r1"),
                line("rs1", "r1", "r2"),
                line("rs2", "r2", "r3"),
                line("rs3", "r3", "r0"),
            ],
            circles: vec![],
            arcs: vec![],
            shapes: vec![],
            groups: vec![],
            constraints: vec![
                Constraint::AbsoluteAngle { id: "aa0".into(), line: "lineA".into(), value: 0.0 },
                Constraint::AbsoluteAngle { id: "aa1".into(), line: "lineB".into(), value: 180.0 },
                Constraint::LineDistance { id: "ld".into(), a: "lineA".into(), b: "lineB".into(), value: 39.0 },
                Constraint::Length { id: "lenA".into(), line: "lineA".into(), value: 50.0 },
                Constraint::Length { id: "lenB".into(), line: "lineB".into(), value: 50.0 },
                Constraint::PointOnLine { id: "pol0".into(), point: "r0".into(), line: "lineB".into() },
                Constraint::PointOnLine { id: "pol1".into(), point: "r1".into(), line: "lineB".into() },
                Constraint::PointOnLine { id: "pol2".into(), point: "r2".into(), line: "lineA".into() },
                Constraint::PointOnLine { id: "pol3".into(), point: "r3".into(), line: "lineA".into() },
                Constraint::Perpendicular { id: "perp0".into(), a: "lineB".into(), b: "rs1".into() },
                Constraint::Perpendicular { id: "perp1".into(), a: "lineB".into(), b: "rs3".into() },
                Constraint::Length { id: "rlen".into(), line: "rs1".into(), value: 39.0 },
            ],
            options: None,
        },
        None,
    );
    eprintln!("  wrong-scale: max_error={:.6}, dof={}",
        result.max_error,
        result.metadata.as_ref().map(|m| m.dof).unwrap_or(0));
    for step in result.metadata.as_ref().map(|m| &m.solve_trail).unwrap_or(&vec![]) {
        eprintln!("    {} err={:.4}", step.phase, step.error);
    }
    assert_solved(&result, TOL, "LM wrong scale");
}

/// Same as wrong_scale but WITHOUT Length constraints on the lines.
/// This simulates the spectrometer case chain where line lengths are
/// implicitly determined by the camera width.
#[test]
fn lm_basin_no_line_lengths() {
    let result = solve_problem(
        Problem {
            points: vec![
                fixed_point("a0", 0.0, 0.0),
                point("a1", 5.0, 0.0),
                point("b0", 5.0, 5.0),
                point("b1", 0.0, 5.0),
                point("r0", 3.0, 5.0),
                point("r1", 2.0, 5.0),
                point("r2", 2.0, 0.0),
                point("r3", 3.0, 0.0),
            ],
            lines: vec![
                line("lineA", "a0", "a1"),
                line("lineB", "b0", "b1"),
                line("rs0", "r0", "r1"),
                line("rs1", "r1", "r2"),
                line("rs2", "r2", "r3"),
                line("rs3", "r3", "r0"),
            ],
            circles: vec![],
            arcs: vec![],
            shapes: vec![],
            groups: vec![],
            constraints: vec![
                Constraint::AbsoluteAngle { id: "aa0".into(), line: "lineA".into(), value: 0.0 },
                Constraint::AbsoluteAngle { id: "aa1".into(), line: "lineB".into(), value: 180.0 },
                Constraint::LineDistance { id: "ld".into(), a: "lineA".into(), b: "lineB".into(), value: 39.0 },
                // NO Length constraints on lineA and lineB!
                Constraint::PointOnLine { id: "pol0".into(), point: "r0".into(), line: "lineB".into() },
                Constraint::PointOnLine { id: "pol1".into(), point: "r1".into(), line: "lineB".into() },
                Constraint::PointOnLine { id: "pol2".into(), point: "r2".into(), line: "lineA".into() },
                Constraint::PointOnLine { id: "pol3".into(), point: "r3".into(), line: "lineA".into() },
                Constraint::Perpendicular { id: "perp0".into(), a: "lineB".into(), b: "rs1".into() },
                Constraint::Perpendicular { id: "perp1".into(), a: "lineB".into(), b: "rs3".into() },
                Constraint::Length { id: "rlen".into(), line: "rs1".into(), value: 39.0 },
            ],
            options: None,
        },
        None,
    );
    eprintln!("  no-line-lengths: max_error={:.6}, dof={}",
        result.max_error,
        result.metadata.as_ref().map(|m| m.dof).unwrap_or(0));
    for step in result.metadata.as_ref().map(|m| &m.solve_trail).unwrap_or(&vec![]) {
        eprintln!("    {} err={:.4}", step.phase, step.error);
    }
    assert_solved(&result, TOL, "LM no line lengths");
}

/// The cold_start_with_camera problem but with points NEAR the correct solution.
/// This verifies the solution exists and LM can find it from nearby.
/// Solution derived from the reference spectrogram SVG.
#[test]
fn lm_camera_from_solution() {
    // Known solution (approximate, from reference SVG geometry):
    // Inner tri: i0=(0,0), i1=(15.3,15.8), i2=(-6.0,21.1)
    // Outer tri: o0=(-1.0,-3.9), o1=(19.1,16.9), o2=(-8.9,23.9)
    // Case outer: o0→c1→c2→c3→c4→o2
    //   c1=(-1.0,-5.8), c2=(32.5,-5.8), c3=(32.5,42.2), c4=(-8.9,42.2)
    // Case inner: ic0→ic1→ic2→ic3→ic4→ic5
    //   ic0=(4.0,1.3), ic1=(4.0,-0.8), ic2=(27.5,-0.8), ic3=(27.5,37.2), ic4=(-3.9,37.2), ic5=(-3.9,22.7)
    // Opening: bp0=(27.5,20.2), bp1=(27.5,16.2), bp2=(32.5,16.2), bp3=(32.5,20.2)
    // Camera outer: oc0=(27.3,37.2), oc1=(27.4,-0.8), oc2=(33.4,-0.8), oc3=(33.3,37.2)
    // (Wait, the camera in the reference is 6×39 at x≈27-33)
    // Actually from reference SVG: outer cam is lines 23-26 which is 6×39

    // Test at various offsets. Change this to probe convergence basin.
    let off = 10.0;
    let result = solve_problem(
        Problem {
            points: vec![
                point("i0", 0.0, 0.0),
                point("i1", 15.3 + off*0.3, 15.8 - off*0.2),
                point("i2", -6.0 - off*0.1, 21.1 + off*0.3),
                point("o0", -1.0 + off*0.2, -3.9 - off*0.1),
                point("o1", 19.1 - off*0.3, 16.9 + off*0.2),
                point("o2", -8.9 + off*0.1, 23.9 - off*0.3),
                // Outer case
                point("c1", -1.0 + off*0.1, -5.8 + off*0.2),
                point("c2", 32.5 - off*0.3, -5.8 - off*0.1),
                point("c3", 32.5 + off*0.2, 42.2 + off*0.1),
                point("c4", -8.9 - off*0.1, 42.2 - off*0.2),
                // Inner case
                point("ic0", 4.0 + off*0.2, 1.3 + off*0.1),
                point("ic1", 4.0 - off*0.1, -0.8 - off*0.2),
                point("ic2", 27.5 + off*0.3, -0.8 + off*0.1),
                point("ic3", 27.5 - off*0.2, 37.2 - off*0.1),
                point("ic4", -3.9 + off*0.1, 37.2 + off*0.3),
                point("ic5", -3.9 - off*0.2, 22.7 - off*0.1),
                // Opening
                point("bp0", 27.5 + off*0.1, 20.2 + off*0.2),
                point("bp1", 27.5 - off*0.2, 16.2 - off*0.1),
                point("bp2", 32.5 + off*0.1, 16.2 + off*0.3),
                point("bp3", 32.5 - off*0.1, 20.2 - off*0.2),
                point("attach", 27.5 + off*0.05, 18.2 + off*0.1),
                // Camera outer
                point("oc0", 27.3 + off*0.2, 37.2 - off*0.1),
                point("oc1", 27.4 - off*0.1, -0.8 + off*0.2),
                point("oc2", 33.4 + off*0.1, -0.8 - off*0.1),
                point("oc3", 33.3 - off*0.2, 37.2 + off*0.1),
            ],
            lines: vec![
                line("is0", "i0", "i1"),
                line("is1", "i1", "i2"),
                line("is2", "i2", "i0"),
                line("os0", "o0", "o1"),
                line("os1", "o1", "o2"),
                line("os2", "o2", "o0"),
                line("cl0", "o0", "c1"),
                line("cl1", "c1", "c2"),
                line("cl2", "c2", "c3"),
                line("cl3", "c3", "c4"),
                line("cl4", "c4", "o2"),
                line("il0", "ic0", "ic1"),
                line("il1", "ic1", "ic2"),
                line("il2", "ic2", "ic3"),
                line("il3", "ic3", "ic4"),
                line("il4", "ic4", "ic5"),
                line("bs0", "bp0", "bp1"),
                line("bs1", "bp1", "bp2"),
                line("bs2", "bp2", "bp3"),
                line("bs3", "bp3", "bp0"),
                line("ocs0", "oc0", "oc1"),
                line("ocs1", "oc1", "oc2"),
                line("ocs2", "oc2", "oc3"),
                line("ocs3", "oc3", "oc0"),
            ],
            circles: vec![],
            arcs: vec![],
            shapes: vec![
                Shape { id: "ishape".into(), lines: vec!["is0".into(), "is1".into(), "is2".into()] },
                Shape { id: "oshape".into(), lines: vec!["os0".into(), "os1".into(), "os2".into()] },
            ],
            groups: vec![],
            constraints: vec![
                // Inner triangle
                Constraint::Ccw { id: "t1".into(), points: vec!["i0".into(), "i1".into(), "i2".into()] },
                Constraint::Equal { id: "t2".into(), a: "is0".into(), b: "is1".into() },
                Constraint::Equal { id: "t3".into(), a: "is0".into(), b: "is2".into() },
                Constraint::Fixed { id: "t4".into(), point: "i0".into(), x: 0.0, y: 0.0 },
                // Outer triangle
                Constraint::Ccw { id: "t5".into(), points: vec!["o0".into(), "o1".into(), "o2".into()] },
                Constraint::Equal { id: "t6".into(), a: "os0".into(), b: "os1".into() },
                Constraint::Equal { id: "t7".into(), a: "os0".into(), b: "os2".into() },
                Constraint::Length { id: "t8".into(), line: "is0".into(), value: 22.0 },
                Constraint::LineDistance { id: "t9".into(), a: "is0".into(), b: "os0".into(), value: -2.0 },
                Constraint::ShapeEqualCentroid { id: "t10".into(), a: "ishape".into(), b: "oshape".into() },
                Constraint::AbsoluteAngle { id: "t11".into(), line: "is0".into(), value: 46.0 },
                // Case angles
                Constraint::AbsoluteAngle { id: "ca0".into(), line: "cl0".into(), value: -90.0 },
                Constraint::AbsoluteAngle { id: "ca1".into(), line: "cl1".into(), value: 0.0 },
                Constraint::AbsoluteAngle { id: "ca2".into(), line: "cl2".into(), value: 90.0 },
                Constraint::AbsoluteAngle { id: "ca3".into(), line: "cl3".into(), value: 180.0 },
                Constraint::AbsoluteAngle { id: "ca4".into(), line: "cl4".into(), value: -90.0 },
                // Inner case ↔ outer case lineDistance
                Constraint::LineDistance { id: "ld0".into(), a: "cl0".into(), b: "il0".into(), value: 5.0 },
                Constraint::LineDistance { id: "ld1".into(), a: "cl1".into(), b: "il1".into(), value: 5.0 },
                Constraint::LineDistance { id: "ld2".into(), a: "cl2".into(), b: "il2".into(), value: 5.0 },
                Constraint::LineDistance { id: "ld3".into(), a: "cl3".into(), b: "il3".into(), value: 5.0 },
                Constraint::LineDistance { id: "ld4".into(), a: "cl4".into(), b: "il4".into(), value: 5.0 },
                // Inner case endpoints on outer triangle sides
                Constraint::PointOnLine { id: "pol0".into(), point: "ic0".into(), line: "os0".into() },
                Constraint::PointOnLine { id: "pol1".into(), point: "ic5".into(), line: "os1".into() },
                // Back opening
                Constraint::Parallel { id: "bp0".into(), a: "bs0".into(), b: "bs2".into() },
                Constraint::Parallel { id: "bp1".into(), a: "bs1".into(), b: "bs3".into() },
                Constraint::Length { id: "blen".into(), line: "bs0".into(), value: 4.0 },
                Constraint::Perpendicular { id: "bperp".into(), a: "bs0".into(), b: "bs1".into() },
                Constraint::LineDistance { id: "bld0".into(), a: "bs0".into(), b: "il2".into(), value: 0.0 },
                Constraint::LineDistance { id: "bld1".into(), a: "bs2".into(), b: "cl2".into(), value: 0.0 },
                Constraint::Midpoint { id: "bmid0".into(), point: "attach".into(), line: "bs0".into() },
                Constraint::Midpoint { id: "bmid1".into(), point: "attach".into(), line: "il2".into() },
                // Camera outer
                Constraint::PointOnLine { id: "cpol0".into(), point: "oc0".into(), line: "il3".into() },
                Constraint::PointOnLine { id: "cpol1".into(), point: "oc1".into(), line: "il3".into() },
                Constraint::PointOnLine { id: "cpol2".into(), point: "oc2".into(), line: "il1".into() },
                Constraint::PointOnLine { id: "cpol3".into(), point: "oc3".into(), line: "il1".into() },
                Constraint::Perpendicular { id: "cperp0".into(), a: "il3".into(), b: "ocs1".into() },
                Constraint::Perpendicular { id: "cperp1".into(), a: "il3".into(), b: "ocs3".into() },
                Constraint::Length { id: "clen".into(), line: "ocs1".into(), value: 39.0 },
            ],
            options: None,
        },
        None,
    );
    eprintln!("  camera-from-solution(off={}): max_error={:.6}, dof={}",
        off, result.max_error,
        result.metadata.as_ref().map(|m| m.dof).unwrap_or(0));
    for step in result.metadata.as_ref().map(|m| &m.solve_trail).unwrap_or(&vec![]) {
        eprintln!("    {} err={:.4}", step.phase, step.error);
    }
    // Show per-constraint residuals at the stuck point.
    let mut diag_points: Vec<Point> = result.points.iter()
        .map(|p| Point { id: p.id.clone(), x: p.x, y: p.y, fixed: false })
        .collect();
    // Restore fixed flag for i0
    if let Some(p) = diag_points.iter_mut().find(|p| p.id == "i0") { p.fixed = true; }

    let diag_lines = vec![
        line("is0", "i0", "i1"), line("is1", "i1", "i2"), line("is2", "i2", "i0"),
        line("os0", "o0", "o1"), line("os1", "o1", "o2"), line("os2", "o2", "o0"),
        line("cl0", "o0", "c1"), line("cl1", "c1", "c2"), line("cl2", "c2", "c3"),
        line("cl3", "c3", "c4"), line("cl4", "c4", "o2"),
        line("il0", "ic0", "ic1"), line("il1", "ic1", "ic2"), line("il2", "ic2", "ic3"),
        line("il3", "ic3", "ic4"), line("il4", "ic4", "ic5"),
        line("bs0", "bp0", "bp1"), line("bs1", "bp1", "bp2"),
        line("bs2", "bp2", "bp3"), line("bs3", "bp3", "bp0"),
        line("ocs0", "oc0", "oc1"), line("ocs1", "oc1", "oc2"),
        line("ocs2", "oc2", "oc3"), line("ocs3", "oc3", "oc0"),
    ];
    let diag_shapes = vec![
        Shape { id: "ishape".into(), lines: vec!["is0".into(), "is1".into(), "is2".into()] },
        Shape { id: "oshape".into(), lines: vec!["os0".into(), "os1".into(), "os2".into()] },
    ];
    let diag_constraints: Vec<Constraint> = vec![
        Constraint::Ccw { id: "t1".into(), points: vec!["i0".into(), "i1".into(), "i2".into()] },
        Constraint::Equal { id: "t2".into(), a: "is0".into(), b: "is1".into() },
        Constraint::Equal { id: "t3".into(), a: "is0".into(), b: "is2".into() },
        Constraint::Fixed { id: "t4".into(), point: "i0".into(), x: 0.0, y: 0.0 },
        Constraint::Ccw { id: "t5".into(), points: vec!["o0".into(), "o1".into(), "o2".into()] },
        Constraint::Equal { id: "t6".into(), a: "os0".into(), b: "os1".into() },
        Constraint::Equal { id: "t7".into(), a: "os0".into(), b: "os2".into() },
        Constraint::Length { id: "t8".into(), line: "is0".into(), value: 22.0 },
        Constraint::LineDistance { id: "t9".into(), a: "is0".into(), b: "os0".into(), value: -2.0 },
        Constraint::ShapeEqualCentroid { id: "t10".into(), a: "ishape".into(), b: "oshape".into() },
        Constraint::AbsoluteAngle { id: "t11".into(), line: "is0".into(), value: 46.0 },
        Constraint::AbsoluteAngle { id: "ca0".into(), line: "cl0".into(), value: -90.0 },
        Constraint::AbsoluteAngle { id: "ca1".into(), line: "cl1".into(), value: 0.0 },
        Constraint::AbsoluteAngle { id: "ca2".into(), line: "cl2".into(), value: 90.0 },
        Constraint::AbsoluteAngle { id: "ca3".into(), line: "cl3".into(), value: 180.0 },
        Constraint::AbsoluteAngle { id: "ca4".into(), line: "cl4".into(), value: -90.0 },
        Constraint::LineDistance { id: "ld0".into(), a: "cl0".into(), b: "il0".into(), value: 5.0 },
        Constraint::LineDistance { id: "ld1".into(), a: "cl1".into(), b: "il1".into(), value: 5.0 },
        Constraint::LineDistance { id: "ld2".into(), a: "cl2".into(), b: "il2".into(), value: 5.0 },
        Constraint::LineDistance { id: "ld3".into(), a: "cl3".into(), b: "il3".into(), value: 5.0 },
        Constraint::LineDistance { id: "ld4".into(), a: "cl4".into(), b: "il4".into(), value: 5.0 },
        Constraint::PointOnLine { id: "pol0".into(), point: "ic0".into(), line: "os0".into() },
        Constraint::PointOnLine { id: "pol1".into(), point: "ic5".into(), line: "os1".into() },
        Constraint::Parallel { id: "bp0".into(), a: "bs0".into(), b: "bs2".into() },
        Constraint::Parallel { id: "bp1".into(), a: "bs1".into(), b: "bs3".into() },
        Constraint::Length { id: "blen".into(), line: "bs0".into(), value: 4.0 },
        Constraint::Perpendicular { id: "bperp".into(), a: "bs0".into(), b: "bs1".into() },
        Constraint::LineDistance { id: "bld0".into(), a: "bs0".into(), b: "il2".into(), value: 0.0 },
        Constraint::LineDistance { id: "bld1".into(), a: "bs2".into(), b: "cl2".into(), value: 0.0 },
        Constraint::Midpoint { id: "bmid0".into(), point: "attach".into(), line: "bs0".into() },
        Constraint::Midpoint { id: "bmid1".into(), point: "attach".into(), line: "il2".into() },
        Constraint::PointOnLine { id: "cpol0".into(), point: "oc0".into(), line: "il3".into() },
        Constraint::PointOnLine { id: "cpol1".into(), point: "oc1".into(), line: "il3".into() },
        Constraint::PointOnLine { id: "cpol2".into(), point: "oc2".into(), line: "il1".into() },
        Constraint::PointOnLine { id: "cpol3".into(), point: "oc3".into(), line: "il1".into() },
        Constraint::Perpendicular { id: "cperp0".into(), a: "il3".into(), b: "ocs1".into() },
        Constraint::Perpendicular { id: "cperp1".into(), a: "il3".into(), b: "ocs3".into() },
        Constraint::Length { id: "clen".into(), line: "ocs1".into(), value: 39.0 },
    ];
    let per_c = solver::constraints::per_constraint_residuals(
        &diag_points, &diag_lines, &vec![], &vec![], &diag_shapes, &diag_constraints,
    );
    eprintln!("  Per-constraint residuals (top 10):");
    let mut sorted = per_c;
    sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    for (id, err) in sorted.iter().take(10) {
        eprintln!("    {}: {:.6}", id, err);
    }
    assert_solved(&result, TOL, "LM camera from solution");
}

/// Full spectrometer from cold start — mirrors the real 06-complex-spectrogram.sketch.js
/// with all constraints including inner camera, light line, etc.
#[test]
fn cold_start_full_spectrometer() {
    // Points: all start at approximate positions (like the JS builder would place them)
    // Inner triangle: ip0=(0,0) fixed, ip1=(1,1), ip2=(0,5)
    // Outer triangle: op0=(0,0), op1=(1,1), op2=(0,5)
    // Light leaving point: llp=(0,0)
    // Outer case chain: o0=op0, oc1..oc4, o5=op2 (oc1-oc4 are new)
    // Inner case: ic_start, ic_end on outer tri sides; ic1..ic4 chain intermediates
    // Opening: att, bp0-bp3
    // Outer cam: cam0-cam3
    // Inner cam: icam0-icam3
    // Light midpoint + light line
    let problem = Problem {
            points: vec![
                // Inner triangle
                Point { id: "ip0".into(), x: 0.0, y: 0.0, fixed: true },
                point("ip1", 1.0, 1.0),
                point("ip2", 0.0, 5.0),
                // Outer triangle
                point("op0", 0.0, 0.0),
                point("op1", 1.0, 1.0),
                point("op2", 0.0, 5.0),
                // Light leaving point
                point("llp", 0.0, 0.0),
                // Outer case chain intermediates (between op0 and op2)
                point("oc1", 0.0, 1.0),
                point("oc2", 0.0, 1.0),
                point("oc3", 0.0, 1.0),
                point("oc4", 0.0, 1.0),
                // Inner case start/end
                point("ics", 0.0, 0.0),
                point("ice", 0.0, 0.0),
                // Inner case chain intermediates
                point("ic1", 0.0, 1.0),
                point("ic2", 0.0, 1.0),
                point("ic3", 0.0, 1.0),
                point("ic4", 0.0, 1.0),
                // Back opening
                point("att", 0.0, 0.0),
                point("bp0", 0.0, 0.0),
                point("bp1", 1.0, 0.0),
                point("bp2", 1.0, 1.0),
                point("bp3", 0.0, 1.0),
                // Outer camera
                point("cam0", 0.0, 0.0),
                point("cam1", 1.0, 0.0),
                point("cam2", 1.0, 1.0),
                point("cam3", 0.0, 1.0),
                // Inner camera
                point("icam0", 0.0, 0.0),
                point("icam1", 1.0, 0.0),
                point("icam2", 1.0, 1.0),
                point("icam3", 0.0, 1.0),
                // Light line midpoint
                point("lmid", 0.0, 0.0),
            ],
            lines: vec![
                // Inner triangle sides
                line("is0", "ip0", "ip1"), line("is1", "ip1", "ip2"), line("is2", "ip2", "ip0"),
                // Outer triangle sides
                line("os0", "op0", "op1"), line("os1", "op1", "op2"), line("os2", "op2", "op0"),
                // Outer case chain: op0 → oc1 → oc2 → oc3 → oc4 → op2
                line("ocl0", "op0", "oc1"), line("ocl1", "oc1", "oc2"), line("ocl2", "oc2", "oc3"),
                line("ocl3", "oc3", "oc4"), line("ocl4", "oc4", "op2"),
                // Inner case chain: ics → ic1 → ic2 → ic3 → ic4 → ice
                line("icl0", "ics", "ic1"), line("icl1", "ic1", "ic2"), line("icl2", "ic2", "ic3"),
                line("icl3", "ic3", "ic4"), line("icl4", "ic4", "ice"),
                // Back opening sides
                line("bs0", "bp0", "bp1"), line("bs1", "bp1", "bp2"),
                line("bs2", "bp2", "bp3"), line("bs3", "bp3", "bp0"),
                // Outer camera sides
                line("cs0", "cam0", "cam1"), line("cs1", "cam1", "cam2"),
                line("cs2", "cam2", "cam3"), line("cs3", "cam3", "cam0"),
                // Inner camera sides
                line("ics0", "icam0", "icam1"), line("ics1", "icam1", "icam2"),
                line("ics2", "icam2", "icam3"), line("ics3", "icam3", "icam0"),
                // Light line
                line("ll", "llp", "lmid"),
            ],
            circles: vec![],
            arcs: vec![],
            shapes: vec![
                Shape { id: "ishp".into(), lines: vec!["is0".into(), "is1".into(), "is2".into()] },
                Shape { id: "oshp".into(), lines: vec!["os0".into(), "os1".into(), "os2".into()] },
            ],
            groups: vec![],
            constraints: vec![
                // ── Inner triangle ──
                Constraint::Ccw { id: "c_ccw_inner".into(), points: vec!["ip0".into(), "ip1".into(), "ip2".into()] },
                Constraint::Equal { id: "c_eq_i01".into(), a: "is0".into(), b: "is1".into() },
                Constraint::Equal { id: "c_eq_i02".into(), a: "is0".into(), b: "is2".into() },
                Constraint::Fixed { id: "c_fix".into(), point: "ip0".into(), x: 0.0, y: 0.0 },
                // ── Outer triangle ──
                Constraint::Ccw { id: "c_ccw_outer".into(), points: vec!["op0".into(), "op1".into(), "op2".into()] },
                Constraint::Equal { id: "c_eq_o01".into(), a: "os0".into(), b: "os1".into() },
                Constraint::Equal { id: "c_eq_o02".into(), a: "os0".into(), b: "os2".into() },
                // ── Prism holder geometry ──
                Constraint::Length { id: "c_len_i0".into(), line: "is0".into(), value: 22.0 },
                Constraint::LineDistance { id: "c_ld_tri".into(), a: "is0".into(), b: "os0".into(), value: -2.0 },
                Constraint::ShapeEqualCentroid { id: "c_centroid".into(), a: "ishp".into(), b: "oshp".into() },
                Constraint::AbsoluteAngle { id: "c_ang_i0".into(), line: "is0".into(), value: 46.0 },
                // ── Light leaving point ──
                Constraint::PointOnLine { id: "c_llp_on".into(), point: "llp".into(), line: "is1".into() },
                Constraint::PointLineDistance { id: "c_llp_dist".into(), point: "llp".into(), line: "is0".into(), value: 8.42 },
                // ── Outer case chain CCW + angles ──
                Constraint::Ccw { id: "c_ccw_oc".into(), points: vec!["op0".into(), "oc1".into(), "oc2".into(), "oc3".into(), "oc4".into()] },
                Constraint::AbsoluteAngle { id: "c_ang_oc0".into(), line: "ocl0".into(), value: -90.0 },
                Constraint::AbsoluteAngle { id: "c_ang_oc1".into(), line: "ocl1".into(), value: 0.0 },
                Constraint::AbsoluteAngle { id: "c_ang_oc2".into(), line: "ocl2".into(), value: 90.0 },
                Constraint::AbsoluteAngle { id: "c_ang_oc3".into(), line: "ocl3".into(), value: 180.0 },
                Constraint::AbsoluteAngle { id: "c_ang_oc4".into(), line: "ocl4".into(), value: -90.0 },
                // ── Inner case start/end on outer triangle ──
                Constraint::PointOnLine { id: "c_ics_on".into(), point: "ics".into(), line: "os0".into() },
                Constraint::PointOnLine { id: "c_ice_on".into(), point: "ice".into(), line: "os1".into() },
                // ── Inner case chain CCW ──
                Constraint::Ccw { id: "c_ccw_ic".into(), points: vec!["ics".into(), "ic1".into(), "ic2".into(), "ic3".into(), "ic4".into()] },
                // ── LineDistance outer↔inner case ──
                Constraint::LineDistance { id: "c_ld0".into(), a: "ocl0".into(), b: "icl0".into(), value: 5.0 },
                Constraint::LineDistance { id: "c_ld1".into(), a: "ocl1".into(), b: "icl1".into(), value: 5.0 },
                Constraint::LineDistance { id: "c_ld2".into(), a: "ocl2".into(), b: "icl2".into(), value: 5.0 },
                Constraint::LineDistance { id: "c_ld3".into(), a: "ocl3".into(), b: "icl3".into(), value: 5.0 },
                Constraint::LineDistance { id: "c_ld4".into(), a: "ocl4".into(), b: "icl4".into(), value: 5.0 },
                // ── Back opening ──
                Constraint::Parallel { id: "c_bp0".into(), a: "bs0".into(), b: "bs2".into() },
                Constraint::Parallel { id: "c_bp1".into(), a: "bs1".into(), b: "bs3".into() },
                Constraint::Length { id: "c_blen".into(), line: "bs0".into(), value: 4.0 },
                Constraint::Perpendicular { id: "c_bperp".into(), a: "bs0".into(), b: "bs1".into() },
                Constraint::LineDistance { id: "c_bld0".into(), a: "bs0".into(), b: "icl2".into(), value: 0.0 },
                Constraint::LineDistance { id: "c_bld1".into(), a: "bs2".into(), b: "ocl2".into(), value: 0.0 },
                Constraint::Midpoint { id: "c_bmid0".into(), point: "att".into(), line: "bs0".into() },
                Constraint::Midpoint { id: "c_bmid1".into(), point: "att".into(), line: "icl2".into() },
                // ── Outer camera ──
                Constraint::PointOnLine { id: "c_cam0_on".into(), point: "cam0".into(), line: "icl3".into() },
                Constraint::PointOnLine { id: "c_cam1_on".into(), point: "cam1".into(), line: "icl3".into() },
                Constraint::PointOnLine { id: "c_cam2_on".into(), point: "cam2".into(), line: "icl1".into() },
                Constraint::PointOnLine { id: "c_cam3_on".into(), point: "cam3".into(), line: "icl1".into() },
                Constraint::Perpendicular { id: "c_cperp0".into(), a: "icl3".into(), b: "cs1".into() },
                Constraint::Perpendicular { id: "c_cperp1".into(), a: "icl3".into(), b: "cs3".into() },
                // ── Inner camera ──
                Constraint::LineDistance { id: "c_icld0".into(), a: "cs0".into(), b: "ics0".into(), value: 2.0 },
                Constraint::LineDistance { id: "c_icld1".into(), a: "cs1".into(), b: "ics1".into(), value: 2.0 },
                Constraint::LineDistance { id: "c_icld2".into(), a: "cs2".into(), b: "ics2".into(), value: 2.0 },
                Constraint::LineDistance { id: "c_icld3".into(), a: "cs3".into(), b: "ics3".into(), value: 2.0 },
                Constraint::LineDistance { id: "c_icw".into(), a: "ics1".into(), b: "ics3".into(), value: 2.0 },
                Constraint::LineDistance { id: "c_ic_case".into(), a: "ics3".into(), b: "icl2".into(), value: -14.0 },
                // ── Camera dimensions ──
                Constraint::Length { id: "c_clen".into(), line: "cs1".into(), value: 39.0 },
                // ── Light line ──
                Constraint::Midpoint { id: "c_lmid".into(), point: "lmid".into(), line: "cs1".into() },
                Constraint::Length { id: "c_llen".into(), line: "ll".into(), value: 21.5 },
                Constraint::Perpendicular { id: "c_lperp".into(), a: "ll".into(), b: "cs1".into() },
            ],
            options: None,
        };
    let result = solve_problem(problem.clone(), None);
    eprintln!("  full spectrometer cold start: max_error={:.6}, dof={}",
        result.max_error,
        result.metadata.as_ref().map(|m| m.dof).unwrap_or(0));
    for step in result.metadata.as_ref().map(|m| &m.solve_trail).unwrap_or(&vec![]) {
        eprintln!("    {} err={:.4}", step.phase, step.error);
    }
    let fixed_points: std::collections::HashSet<String> = problem.points.iter()
        .filter(|p| p.fixed)
        .map(|p| p.id.clone())
        .collect();
    let mut diag_points: Vec<Point> = result.points.iter()
        .map(|p| Point {
            id: p.id.clone(),
            x: p.x,
            y: p.y,
            fixed: fixed_points.contains(&p.id),
        })
        .collect();
    diag_points.sort_by(|a, b| a.id.cmp(&b.id));
    let mut per_c = solver::constraints::per_constraint_residuals(
        &diag_points,
        &problem.lines,
        &problem.circles,
        &problem.arcs,
        &problem.shapes,
        &problem.constraints,
    );
    per_c.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    eprintln!("  Per-constraint residuals (top 15):");
    for (id, err) in per_c.iter().take(15) {
        eprintln!("    {}: {:.6}", id, err);
    }
    // Note: this test may fail from cold start — it's a diagnostic to understand
    // the fully-constrained system's behavior.
    assert!(result.max_error < 1.0,
        "Full spectrometer cold start: max_error={:.6} (expected < 1.0)", result.max_error);
}

/// Sweep many starting offsets to map ALL local minima in the error landscape.
/// This is the key experiment: we need to understand the structure of the problem
/// before we can solve it.
#[test]
fn lm_local_minima_landscape() {
    let offsets = [0.0, 0.5, 1.0, 2.0, 3.0, 5.0, 7.0, 10.0, 15.0, 20.0, 30.0];

    eprintln!("\n=== Local Minima Landscape ===");
    eprintln!("{:>6} {:>10} {:>4}  trail", "offset", "max_error", "dof");

    for &off in &offsets {
        let result = solve_problem(
            Problem {
                points: vec![
                    point("i0", 0.0, 0.0),
                    point("i1", 15.3 + off*0.3, 15.8 - off*0.2),
                    point("i2", -6.0 - off*0.1, 21.1 + off*0.3),
                    point("o0", -1.0 + off*0.2, -3.9 - off*0.1),
                    point("o1", 19.1 - off*0.3, 16.9 + off*0.2),
                    point("o2", -8.9 + off*0.1, 23.9 - off*0.3),
                    point("c1", -1.0 + off*0.1, -5.8 + off*0.2),
                    point("c2", 32.5 - off*0.3, -5.8 - off*0.1),
                    point("c3", 32.5 + off*0.2, 42.2 + off*0.1),
                    point("c4", -8.9 - off*0.1, 42.2 - off*0.2),
                    point("ic0", 4.0 + off*0.2, 1.3 + off*0.1),
                    point("ic1", 4.0 - off*0.1, -0.8 - off*0.2),
                    point("ic2", 27.5 + off*0.3, -0.8 + off*0.1),
                    point("ic3", 27.5 - off*0.2, 37.2 - off*0.1),
                    point("ic4", -3.9 + off*0.1, 37.2 + off*0.3),
                    point("ic5", -3.9 - off*0.2, 22.7 - off*0.1),
                    point("bp0", 27.5 + off*0.1, 20.2 + off*0.2),
                    point("bp1", 27.5 - off*0.2, 16.2 - off*0.1),
                    point("bp2", 32.5 + off*0.1, 16.2 + off*0.3),
                    point("bp3", 32.5 - off*0.1, 20.2 - off*0.2),
                    point("attach", 27.5 + off*0.05, 18.2 + off*0.1),
                    point("oc0", 27.3 + off*0.2, 37.2 - off*0.1),
                    point("oc1", 27.4 - off*0.1, -0.8 + off*0.2),
                    point("oc2", 33.4 + off*0.1, -0.8 - off*0.1),
                    point("oc3", 33.3 - off*0.2, 37.2 + off*0.1),
                ],
                lines: vec![
                    line("is0", "i0", "i1"), line("is1", "i1", "i2"), line("is2", "i2", "i0"),
                    line("os0", "o0", "o1"), line("os1", "o1", "o2"), line("os2", "o2", "o0"),
                    line("cl0", "o0", "c1"), line("cl1", "c1", "c2"), line("cl2", "c2", "c3"),
                    line("cl3", "c3", "c4"), line("cl4", "c4", "o2"),
                    line("il0", "ic0", "ic1"), line("il1", "ic1", "ic2"), line("il2", "ic2", "ic3"),
                    line("il3", "ic3", "ic4"), line("il4", "ic4", "ic5"),
                    line("bs0", "bp0", "bp1"), line("bs1", "bp1", "bp2"),
                    line("bs2", "bp2", "bp3"), line("bs3", "bp3", "bp0"),
                    line("ocs0", "oc0", "oc1"), line("ocs1", "oc1", "oc2"),
                    line("ocs2", "oc2", "oc3"), line("ocs3", "oc3", "oc0"),
                ],
                circles: vec![],
                arcs: vec![],
                shapes: vec![
                    Shape { id: "ishape".into(), lines: vec!["is0".into(), "is1".into(), "is2".into()] },
                    Shape { id: "oshape".into(), lines: vec!["os0".into(), "os1".into(), "os2".into()] },
                ],
                groups: vec![],
                constraints: vec![
                    Constraint::Ccw { id: "t1".into(), points: vec!["i0".into(), "i1".into(), "i2".into()] },
                    Constraint::Equal { id: "t2".into(), a: "is0".into(), b: "is1".into() },
                    Constraint::Equal { id: "t3".into(), a: "is0".into(), b: "is2".into() },
                    Constraint::Fixed { id: "t4".into(), point: "i0".into(), x: 0.0, y: 0.0 },
                    Constraint::Ccw { id: "t5".into(), points: vec!["o0".into(), "o1".into(), "o2".into()] },
                    Constraint::Equal { id: "t6".into(), a: "os0".into(), b: "os1".into() },
                    Constraint::Equal { id: "t7".into(), a: "os0".into(), b: "os2".into() },
                    Constraint::Length { id: "t8".into(), line: "is0".into(), value: 22.0 },
                    Constraint::LineDistance { id: "t9".into(), a: "is0".into(), b: "os0".into(), value: -2.0 },
                    Constraint::ShapeEqualCentroid { id: "t10".into(), a: "ishape".into(), b: "oshape".into() },
                    Constraint::AbsoluteAngle { id: "t11".into(), line: "is0".into(), value: 46.0 },
                    Constraint::AbsoluteAngle { id: "ca0".into(), line: "cl0".into(), value: -90.0 },
                    Constraint::AbsoluteAngle { id: "ca1".into(), line: "cl1".into(), value: 0.0 },
                    Constraint::AbsoluteAngle { id: "ca2".into(), line: "cl2".into(), value: 90.0 },
                    Constraint::AbsoluteAngle { id: "ca3".into(), line: "cl3".into(), value: 180.0 },
                    Constraint::AbsoluteAngle { id: "ca4".into(), line: "cl4".into(), value: -90.0 },
                    Constraint::LineDistance { id: "ld0".into(), a: "cl0".into(), b: "il0".into(), value: 5.0 },
                    Constraint::LineDistance { id: "ld1".into(), a: "cl1".into(), b: "il1".into(), value: 5.0 },
                    Constraint::LineDistance { id: "ld2".into(), a: "cl2".into(), b: "il2".into(), value: 5.0 },
                    Constraint::LineDistance { id: "ld3".into(), a: "cl3".into(), b: "il3".into(), value: 5.0 },
                    Constraint::LineDistance { id: "ld4".into(), a: "cl4".into(), b: "il4".into(), value: 5.0 },
                    Constraint::PointOnLine { id: "pol0".into(), point: "ic0".into(), line: "os0".into() },
                    Constraint::PointOnLine { id: "pol1".into(), point: "ic5".into(), line: "os1".into() },
                    Constraint::Parallel { id: "bp0".into(), a: "bs0".into(), b: "bs2".into() },
                    Constraint::Parallel { id: "bp1".into(), a: "bs1".into(), b: "bs3".into() },
                    Constraint::Length { id: "blen".into(), line: "bs0".into(), value: 4.0 },
                    Constraint::Perpendicular { id: "bperp".into(), a: "bs0".into(), b: "bs1".into() },
                    Constraint::LineDistance { id: "bld0".into(), a: "bs0".into(), b: "il2".into(), value: 0.0 },
                    Constraint::LineDistance { id: "bld1".into(), a: "bs2".into(), b: "cl2".into(), value: 0.0 },
                    Constraint::Midpoint { id: "bmid0".into(), point: "attach".into(), line: "bs0".into() },
                    Constraint::Midpoint { id: "bmid1".into(), point: "attach".into(), line: "il2".into() },
                    Constraint::PointOnLine { id: "cpol0".into(), point: "oc0".into(), line: "il3".into() },
                    Constraint::PointOnLine { id: "cpol1".into(), point: "oc1".into(), line: "il3".into() },
                    Constraint::PointOnLine { id: "cpol2".into(), point: "oc2".into(), line: "il1".into() },
                    Constraint::PointOnLine { id: "cpol3".into(), point: "oc3".into(), line: "il1".into() },
                    Constraint::Perpendicular { id: "cperp0".into(), a: "il3".into(), b: "ocs1".into() },
                    Constraint::Perpendicular { id: "cperp1".into(), a: "il3".into(), b: "ocs3".into() },
                    Constraint::Length { id: "clen".into(), line: "ocs1".into(), value: 39.0 },
                ],
                options: None,
            },
            None,
        );
        let trail: Vec<String> = result.metadata.as_ref()
            .map(|m| m.solve_trail.iter().map(|s| format!("{}={:.2}", s.phase, s.error)).collect())
            .unwrap_or_default();
        let trail_summary: String = trail.iter()
            .filter(|s| s.starts_with("lm-pass") || s.starts_with("done"))
            .cloned().collect::<Vec<_>>().join(" ");
        eprintln!("{:>6.1} {:>10.6} {:>4}  {}",
            off, result.max_error,
            result.metadata.as_ref().map(|m| m.dof).unwrap_or(0),
            trail_summary);

        // At offset=10 (stuck), dump point positions so we can see what the
        // local minimum looks like geometrically.
        if off == 10.0 || off == 0.0 || off == 0.5 || off == 5.0 || off == 30.0 {
            eprintln!("  Point positions at off={}:", off);
            for p in &result.points {
                eprintln!("    {} ({:.4}, {:.4})", p.id, p.x, p.y);
            }
        }
    }
}
