use std::collections::HashMap;
use std::fmt::Write;
use std::fs;
use std::path::PathBuf;

use solver::{replay_solve_exchange, solve_problem};
use solver::types::{
    Circle, Constraint, Line, Point, Problem, Shape, SolveExchange, SolveOptions, SolveResult,
};

pub struct RectIds {
    pub points: [String; 4],
    pub lines: [String; 4],
    pub shape: String,
}

pub struct TestSketch {
    problem: Problem,
}

pub struct SolvedSketch {
    problem: Problem,
    result: SolveResult,
}

impl TestSketch {
    pub fn new() -> Self {
        Self {
            problem: Problem {
                points: Vec::new(),
                lines: Vec::new(),
                circles: Vec::new(),
                arcs: Vec::new(),
                beziers: Vec::new(),
                shapes: Vec::new(),
                groups: Vec::new(),
                constraints: Vec::new(),
                options: None,
            },
        }
    }

    pub fn point(&mut self, id: &str, x: f64, y: f64) -> String {
        self.problem.points.push(Point {
            id: id.to_string(),
            x,
            y,
            fixed: false,
        });
        id.to_string()
    }

    pub fn fixed_point(&mut self, id: &str, x: f64, y: f64) -> String {
        self.problem.points.push(Point {
            id: id.to_string(),
            x,
            y,
            fixed: true,
        });
        id.to_string()
    }

    pub fn line(&mut self, id: &str, a: &str, b: &str) -> String {
        self.problem.lines.push(Line {
            id: id.to_string(),
            a: a.to_string(),
            b: b.to_string(),
        });
        id.to_string()
    }

    pub fn rect(&mut self, prefix: &str, x: f64, y: f64, width: f64, height: f64) -> RectIds {
        let p0 = format!("{prefix}-p0");
        let p1 = format!("{prefix}-p1");
        let p2 = format!("{prefix}-p2");
        let p3 = format!("{prefix}-p3");
        self.point(&p0, x, y);
        self.point(&p1, x + width, y);
        self.point(&p2, x + width, y + height);
        self.point(&p3, x, y + height);

        let l0 = format!("{prefix}-l0");
        let l1 = format!("{prefix}-l1");
        let l2 = format!("{prefix}-l2");
        let l3 = format!("{prefix}-l3");
        self.line(&l0, &p0, &p1);
        self.line(&l1, &p1, &p2);
        self.line(&l2, &p2, &p3);
        self.line(&l3, &p3, &p0);

        let shape = format!("{prefix}-shape");
        self.problem.shapes.push(Shape {
            id: shape.clone(),
            lines: vec![l0.clone(), l1.clone(), l2.clone(), l3.clone()],
        });

        RectIds {
            points: [p0, p1, p2, p3],
            lines: [l0, l1, l2, l3],
            shape,
        }
    }

    pub fn horizontal(&mut self, id: &str, line: &str) {
        self.problem.constraints.push(Constraint::Horizontal {
            id: id.to_string(),
            line: line.to_string(),
        });
    }

    pub fn vertical(&mut self, id: &str, line: &str) {
        self.problem.constraints.push(Constraint::Vertical {
            id: id.to_string(),
            line: line.to_string(),
        });
    }

    pub fn length(&mut self, id: &str, line: &str, value: f64) {
        self.problem.constraints.push(Constraint::Length {
            id: id.to_string(),
            line: line.to_string(),
            value,
        });
    }

    pub fn fix(&mut self, id: &str, point: &str, x: f64, y: f64) {
        self.problem.constraints.push(Constraint::Fixed {
            id: id.to_string(),
            point: point.to_string(),
            x,
            y,
        });
    }

    pub fn ccw(&mut self, id: &str, points: &[&str]) {
        self.problem.constraints.push(Constraint::Ccw {
            id: id.to_string(),
            points: points.iter().map(|point| point.to_string()).collect(),
        });
    }

    pub fn block_rotation(&mut self, id: &str, points: &[&str], axis: &str) {
        self.problem.constraints.push(Constraint::BlockRotation {
            id: id.to_string(),
            points: points.iter().map(|point| point.to_string()).collect(),
            axis: axis.to_string(),
        });
    }

    pub fn solve(self, options: Option<SolveOptions>) -> SolvedSketch {
        let result = solve_problem(self.problem.clone(), options);
        SolvedSketch {
            problem: self.problem,
            result,
        }
    }
}

impl SolvedSketch {
    pub fn max_error(&self) -> f64 {
        self.result.max_error
    }

    pub fn point(&self, id: &str) -> (f64, f64) {
        self.result
            .points
            .iter()
            .find(|point| point.id == id)
            .map(|point| (point.x, point.y))
            .unwrap_or_else(|| panic!("point {id} not found"))
    }

    pub fn assert_solved(&self, tolerance: f64) {
        assert!(
            self.result.max_error <= tolerance,
            "expected max_error <= {tolerance:.3e}, got {:.3e}",
            self.result.max_error,
        );
    }

    pub fn render_svg(&self) -> String {
        let point_map: HashMap<&str, (f64, f64)> = self
            .result
            .points
            .iter()
            .map(|point| (point.id.as_str(), (point.x, point.y)))
            .collect();
        let circle_map: HashMap<&str, f64> = self
            .result
            .circles
            .iter()
            .map(|circle| (circle.id.as_str(), circle.radius))
            .collect();

        let mut min_x = f64::INFINITY;
        let mut min_y = f64::INFINITY;
        let mut max_x = f64::NEG_INFINITY;
        let mut max_y = f64::NEG_INFINITY;

        for (x, y) in point_map.values() {
            min_x = min_x.min(*x);
            min_y = min_y.min(*y);
            max_x = max_x.max(*x);
            max_y = max_y.max(*y);
        }

        for circle in &self.problem.circles {
            if let Some((cx, cy)) = point_map.get(circle.center.as_str()) {
                let radius = circle_map
                    .get(circle.id.as_str())
                    .copied()
                    .unwrap_or(circle.radius);
                min_x = min_x.min(cx - radius);
                min_y = min_y.min(cy - radius);
                max_x = max_x.max(cx + radius);
                max_y = max_y.max(cy + radius);
            }
        }

        if !min_x.is_finite() {
            min_x = 0.0;
            min_y = 0.0;
            max_x = 100.0;
            max_y = 100.0;
        }

        let padding = 12.0;
        let view_x = min_x - padding;
        let view_y = min_y - padding;
        let view_w = (max_x - min_x).max(1.0) + padding * 2.0;
        let view_h = (max_y - min_y).max(1.0) + padding * 2.0;
        let flip_y = |y: f64| min_y + max_y - y;

        let mut svg = String::new();
        writeln!(
            svg,
            "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"{} {} {} {}\" width=\"{}\" height=\"{}\">",
            fmt(view_x),
            fmt(view_y),
            fmt(view_w),
            fmt(view_h),
            fmt(view_w),
            fmt(view_h),
        )
        .unwrap();
        writeln!(
            svg,
            "  <rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" fill=\"#fffdf7\" stroke=\"#d7d0c4\" stroke-width=\"0.8\"/>",
            fmt(view_x),
            fmt(view_y),
            fmt(view_w),
            fmt(view_h),
        )
        .unwrap();

        for line in &self.problem.lines {
            let (ax, ay) = point_map
                .get(line.a.as_str())
                .copied()
                .unwrap_or_else(|| panic!("missing point {}", line.a));
            let (bx, by) = point_map
                .get(line.b.as_str())
                .copied()
                .unwrap_or_else(|| panic!("missing point {}", line.b));
            writeln!(
                svg,
                "  <line id=\"{}\" x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"#1f2933\" stroke-width=\"2\" stroke-linecap=\"round\"/>",
                line.id,
                fmt(ax),
                fmt(flip_y(ay)),
                fmt(bx),
                fmt(flip_y(by)),
            )
            .unwrap();
        }

        for circle in &self.problem.circles {
            if let Some((cx, cy)) = point_map.get(circle.center.as_str()) {
                let radius = circle_map
                    .get(circle.id.as_str())
                    .copied()
                    .unwrap_or(circle.radius);
                writeln!(
                    svg,
                    "  <circle id=\"{}\" cx=\"{}\" cy=\"{}\" r=\"{}\" fill=\"none\" stroke=\"#1f2933\" stroke-width=\"2\"/>",
                    circle.id,
                    fmt(*cx),
                    fmt(flip_y(*cy)),
                    fmt(radius),
                )
                .unwrap();
            }
        }

        for point in &self.result.points {
            writeln!(
                svg,
                "  <circle id=\"{}\" cx=\"{}\" cy=\"{}\" r=\"2.5\" fill=\"#c2410c\"/>",
                point.id,
                fmt(point.x),
                fmt(flip_y(point.y)),
            )
            .unwrap();
        }

        writeln!(svg, "</svg>").unwrap();
        svg
    }
}

pub fn solve_captured_exchange_json(json: &str) -> SolvedSketch {
    let exchange: SolveExchange =
        serde_json::from_str(json).unwrap_or_else(|err| panic!("invalid captured exchange JSON: {err}"));
    let result = replay_solve_exchange(exchange.clone());
    SolvedSketch {
        problem: exchange.request,
        result,
    }
}

pub fn assert_svg_snapshot(name: &str, actual: &str) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let snapshot_path = root.join("tests").join("snapshots").join(format!("{name}.svg"));
    let actual_path = root
        .join("target")
        .join("test-snapshots")
        .join(format!("{name}.actual.svg"));

    let expected = match fs::read_to_string(&snapshot_path) {
        Ok(expected) => expected,
        Err(err) => {
            write_actual_snapshot(&actual_path, actual);
            panic!(
                "missing snapshot {} ({err}); wrote actual SVG to {}",
                snapshot_path.display(),
                actual_path.display(),
            );
        }
    };

    if normalize_newlines(&expected) != normalize_newlines(actual) {
        write_actual_snapshot(&actual_path, actual);
        panic!(
            "snapshot mismatch for {name}; wrote actual SVG to {}",
            actual_path.display(),
        );
    }
}

fn write_actual_snapshot(path: &PathBuf, actual: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, actual).unwrap();
}

fn normalize_newlines(input: &str) -> String {
    input.replace("\r\n", "\n")
}

fn fmt(value: f64) -> String {
    let rounded = (value * 1000.0).round() / 1000.0;
    if rounded.fract().abs() < 1e-9 {
        format!("{rounded:.0}")
    } else {
        format!("{rounded:.3}")
    }
}

#[allow(dead_code)]
fn _assert_circle_type(_: &Circle) {}
