use solver::types::*;

pub fn point(id: &str, x: f64, y: f64) -> Point {
    Point { id: id.to_string(), x, y, fixed: false }
}

pub fn fixed_point(id: &str, x: f64, y: f64) -> Point {
    Point { id: id.to_string(), x, y, fixed: true }
}

pub fn line(id: &str, a: &str, b: &str) -> Line {
    Line { id: id.to_string(), a: a.to_string(), b: b.to_string() }
}

pub fn circle(id: &str, center: &str, radius: f64) -> Circle {
    Circle { id: id.to_string(), center: center.to_string(), radius, fixed_radius: false }
}

pub fn arc(id: &str, center: &str, start: &str, end: &str, radius: f64, clockwise: bool) -> Arc {
    Arc { id: id.to_string(), center: center.to_string(), start: start.to_string(), end: end.to_string(), radius, clockwise }
}

pub fn shape(id: &str, lines: &[&str]) -> Shape {
    Shape { id: id.to_string(), lines: lines.iter().map(|s| s.to_string()).collect() }
}

/// Build a minimal problem with just points, lines, and constraints.
pub fn problem(
    points: Vec<Point>,
    lines: Vec<Line>,
    constraints: Vec<Constraint>,
) -> Problem {
    Problem {
        points,
        lines,
        circles: vec![],
        arcs: vec![],
        shapes: vec![],
        groups: vec![],
        constraints,
        options: None,
    }
}

pub fn problem_with_circles(
    points: Vec<Point>,
    lines: Vec<Line>,
    circles: Vec<Circle>,
    constraints: Vec<Constraint>,
) -> Problem {
    Problem {
        points,
        lines,
        circles,
        arcs: vec![],
        shapes: vec![],
        groups: vec![],
        constraints,
        options: None,
    }
}

pub fn problem_with_arcs(
    points: Vec<Point>,
    lines: Vec<Line>,
    circles: Vec<Circle>,
    arcs: Vec<Arc>,
    constraints: Vec<Constraint>,
) -> Problem {
    Problem {
        points,
        lines,
        circles,
        arcs,
        shapes: vec![],
        groups: vec![],
        constraints,
        options: None,
    }
}

pub fn tight_options() -> SolveOptions {
    SolveOptions {
        iterations: Some(200),
        tolerance: Some(1e-6),
        restarts: Some(8),
        warm_start_iterations: Some(10),
        ..Default::default()
    }
}

pub fn default_options() -> SolveOptions {
    SolveOptions::default()
}

/// Assert max_error is below tolerance with a descriptive panic message.
pub fn assert_solved(result: &SolveResult, tolerance: f64, label: &str) {
    assert!(
        result.max_error <= tolerance,
        "{}: max_error={:.2e} > tolerance={:.2e}",
        label, result.max_error, tolerance
    );
}

/// Find a point by id in the result.
pub fn get_pt(result: &SolveResult, id: &str) -> (f64, f64) {
    result.points.iter()
        .find(|p| p.id == id)
        .map(|p| (p.x, p.y))
        .unwrap_or_else(|| panic!("point {} not found in result", id))
}

pub fn get_circle_radius(result: &SolveResult, id: &str) -> f64 {
    result.circles.iter()
        .find(|c| c.id == id)
        .map(|c| c.radius)
        .unwrap_or_else(|| panic!("circle {} not found in result", id))
}

pub fn approx_eq(a: f64, b: f64, eps: f64) -> bool {
    (a - b).abs() < eps
}
