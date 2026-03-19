mod helpers;
use helpers::*;
use solver::solve_problem;
use solver::types::*;

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

    let result = solve_problem(
        Problem {
            points: vec![center, start, end],
            lines: vec![],
            circles: vec![],
            arcs: vec![a],
            shapes: vec![],
            constraints: vec![
                Constraint::Fixed { id: "fc".into(), point: "c".into(), x: 0.0, y: 0.0 },
                Constraint::Fixed { id: "fs".into(), point: "s".into(), x: 10.0, y: 0.0 },
                Constraint::Fixed { id: "fe".into(), point: "e".into(), x: 0.0, y: 10.0 },
            ],
            options: None,
        },
        None,
    );
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
            max_scaled_step: Some(2.5),
            skip_redundancy_check: Some(false),
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
