use serde::{Deserialize, Serialize};

// ─── Geometric entities ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Point {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub fixed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Line {
    pub id: String,
    pub a: String,
    pub b: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Circle {
    pub id: String,
    pub center: String,
    pub radius: f64,
    pub fixed_radius: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Arc {
    pub id: String,
    pub center: String,
    pub start: String,
    pub end: String,
    pub radius: f64,
    pub clockwise: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Shape {
    pub id: String,
    pub lines: Vec<String>,
}

// ─── Constraint payload ───────────────────────────────────────────────────────

/// All constraint types with their data, discriminated by `kind`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Constraint {
    Coincident { id: String, a: String, b: String },
    Horizontal { id: String, line: String },
    Vertical { id: String, line: String },
    Parallel { id: String, a: String, b: String },
    Perpendicular { id: String, a: String, b: String },
    #[serde(rename = "tangent")]
    Tangent {
        id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        line: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        circle: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        a: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        b: Option<String>,
    },
    Equal { id: String, a: String, b: String },
    Symmetric { id: String, a: String, b: String, axis: String },
    Concentric { id: String, a: String, b: String },
    Collinear { id: String, point: String, line: String },
    Fixed { id: String, point: String, x: f64, y: f64 },
    Midpoint { id: String, point: String, line: String },
    PointOnCircle { id: String, point: String, circle: String },
    PointOnLine { id: String, point: String, line: String },
    Distance { id: String, a: String, b: String, value: f64 },
    Length { id: String, line: String, value: f64 },
    Angle { id: String, a: String, b: String, value: f64 },
    Radius { id: String, circle: String, value: f64 },
    Diameter { id: String, circle: String, value: f64 },
    #[serde(rename = "hDistance")]
    HDistance { id: String, a: String, b: String, value: f64 },
    #[serde(rename = "vDistance")]
    VDistance { id: String, a: String, b: String, value: f64 },
    LineDistance { id: String, a: String, b: String, value: f64 },
    AbsoluteAngle { id: String, line: String, value: f64 },
    EqualRadius { id: String, a: String, b: String },
    ArcLength { id: String, arc: String, value: f64 },
    LineTangentArc { id: String, line: String, arc: String, at_start: bool },
    ShapeCentroidX { id: String, shape: String, value: f64 },
    ShapeCentroidY { id: String, shape: String, value: f64 },
    ShapeWidth { id: String, shape: String, value: f64 },
    ShapeHeight { id: String, shape: String, value: f64 },
    ShapeArea { id: String, shape: String, value: f64 },
    ShapeEqualCentroid { id: String, a: String, b: String },
    PointLineDistance { id: String, point: String, line: String, value: f64 },
    #[serde(rename = "ccw")]
    Ccw { id: String, points: Vec<String> },
    AngleBetween { id: String, a: String, b: String, value: f64 },
}

impl Constraint {
    pub fn id(&self) -> &str {
        match self {
            Constraint::Coincident { id, .. } => id,
            Constraint::Horizontal { id, .. } => id,
            Constraint::Vertical { id, .. } => id,
            Constraint::Parallel { id, .. } => id,
            Constraint::Perpendicular { id, .. } => id,
            Constraint::Tangent { id, .. } => id,
            Constraint::Equal { id, .. } => id,
            Constraint::Symmetric { id, .. } => id,
            Constraint::Concentric { id, .. } => id,
            Constraint::Collinear { id, .. } => id,
            Constraint::Fixed { id, .. } => id,
            Constraint::Midpoint { id, .. } => id,
            Constraint::PointOnCircle { id, .. } => id,
            Constraint::PointOnLine { id, .. } => id,
            Constraint::Distance { id, .. } => id,
            Constraint::Length { id, .. } => id,
            Constraint::Angle { id, .. } => id,
            Constraint::Radius { id, .. } => id,
            Constraint::Diameter { id, .. } => id,
            Constraint::HDistance { id, .. } => id,
            Constraint::VDistance { id, .. } => id,
            Constraint::LineDistance { id, .. } => id,
            Constraint::AbsoluteAngle { id, .. } => id,
            Constraint::EqualRadius { id, .. } => id,
            Constraint::ArcLength { id, .. } => id,
            Constraint::LineTangentArc { id, .. } => id,
            Constraint::ShapeCentroidX { id, .. } => id,
            Constraint::ShapeCentroidY { id, .. } => id,
            Constraint::ShapeWidth { id, .. } => id,
            Constraint::ShapeHeight { id, .. } => id,
            Constraint::ShapeArea { id, .. } => id,
            Constraint::ShapeEqualCentroid { id, .. } => id,
            Constraint::PointLineDistance { id, .. } => id,
            Constraint::Ccw { id, .. } => id,
            Constraint::AngleBetween { id, .. } => id,
        }
    }
}

// ─── Problem / Result ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolveOptions {
    pub iterations: Option<u32>,
    pub tolerance: Option<f64>,
    pub restarts: Option<u32>,
    pub warm_start_iterations: Option<u32>,
    pub max_scaled_step: Option<f64>,
}

impl Default for SolveOptions {
    fn default() -> Self {
        SolveOptions {
            iterations: Some(80),
            tolerance: Some(1e-3),
            restarts: Some(6),
            warm_start_iterations: Some(6),
            max_scaled_step: Some(2.5),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Problem {
    pub points: Vec<Point>,
    pub lines: Vec<Line>,
    pub circles: Vec<Circle>,
    pub arcs: Vec<Arc>,
    pub shapes: Vec<Shape>,
    pub constraints: Vec<Constraint>,
    #[serde(default)]
    pub options: Option<SolveOptions>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PointResult {
    pub id: String,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircleResult {
    pub id: String,
    pub radius: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArcResult {
    pub id: String,
    pub radius: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolveResult {
    pub max_error: f64,
    pub points: Vec<PointResult>,
    pub circles: Vec<CircleResult>,
    pub arcs: Vec<ArcResult>,
}
