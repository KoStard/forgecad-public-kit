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

// ─── Sketch groups (rigid-body DOF) ──────────────────────────────────────────

/// A point stored in a group's local coordinate frame.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalPoint {
    pub id: String,
    pub lx: f64,
    pub ly: f64,
}

/// A rigid-body group: N local points with a shared coordinate frame (x, y, θ).
/// The solver optimises over the 3 frame DOF instead of 2N point DOF.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SketchGroup {
    pub id: String,
    /// World position of the group's local origin.
    pub x: f64,
    pub y: f64,
    /// Rotation angle (radians) of the group frame.
    pub theta: f64,
    /// When true, all 3 DOF are frozen (equivalent to fixing every point).
    #[serde(default)]
    pub fixed: bool,
    /// When true, θ is frozen — only translation DOF remain.
    #[serde(default)]
    pub fixed_rotation: bool,
    /// Points in local coordinates.
    pub points: Vec<LocalPoint>,
    /// Lines connecting local points (using their global IDs).
    #[serde(default)]
    pub lines: Vec<Line>,
}

impl SketchGroup {
    /// Resolve a local point to world coordinates using the current frame.
    pub fn resolve_point(&self, lp: &LocalPoint) -> (f64, f64) {
        let (cos_t, sin_t) = (self.theta.cos(), self.theta.sin());
        (
            self.x + lp.lx * cos_t - lp.ly * sin_t,
            self.y + lp.lx * sin_t + lp.ly * cos_t,
        )
    }

    /// Number of solver DOF this group contributes.
    pub fn dof_count(&self) -> i32 {
        if self.fixed { 0 }
        else if self.fixed_rotation { 2 }
        else { 3 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupResult {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub theta: f64,
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
    #[serde(rename = "blockRotation")]
    BlockRotation { id: String, points: Vec<String>, axis: String },
    #[serde(rename = "sameDirection")]
    SameDirection { id: String, a: String, b: String },
    #[serde(rename = "oppositeDirection")]
    OppositeDirection { id: String, a: String, b: String },
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
            Constraint::BlockRotation { id, .. } => id,
            Constraint::SameDirection { id, .. } => id,
            Constraint::OppositeDirection { id, .. } => id,
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
    pub skip_redundancy_check: Option<bool>,
    /// When set, run the targeted presolve hook for this constraint before the
    /// main solve.  Used by the builder's incremental construction path so that
    /// presolve + solve is a single WASM call.
    pub presolve_constraint_id: Option<String>,
    /// When set and the first solve attempt exceeds `tolerance * 5`, the solver
    /// retries with this many restarts.  Used by `updateConstraintValue` so the
    /// warm-start-then-fallback policy is a single WASM call.
    pub fallback_restarts: Option<u32>,
    /// When true, the solver adds constraints progressively (one at a time) and
    /// runs a short LM solve after each addition, inside a single WASM call.
    /// This replicates the TS solver's incremental constrain() behavior without
    /// 54 separate WASM round-trips.
    pub progressive: Option<bool>,
}

impl Default for SolveOptions {
    fn default() -> Self {
        SolveOptions {
            iterations: Some(80),
            tolerance: Some(1e-3),
            restarts: Some(6),
            warm_start_iterations: Some(6),
            max_scaled_step: Some(2.5),
            skip_redundancy_check: Some(false),
            presolve_constraint_id: None,
            fallback_restarts: None,
            progressive: None,
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
    #[serde(default)]
    pub groups: Vec<SketchGroup>,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SolveStatus {
    Under,
    Fully,
    Over,
    OverRedundant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstraintResidual {
    pub id: String,
    pub residual: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolveTrailStep {
    pub phase: String,
    pub error: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolveMetadata {
    pub status: SolveStatus,
    pub dof: i32,
    pub constraint_residuals: Vec<ConstraintResidual>,
    pub redundant_constraint_ids: Vec<String>,
    pub conflicting_constraint_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub solve_trail: Vec<SolveTrailStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolveResult {
    pub max_error: f64,
    pub points: Vec<PointResult>,
    pub circles: Vec<CircleResult>,
    pub arcs: Vec<ArcResult>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub groups: Vec<GroupResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<SolveMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SolveExchangeKind {
    Solve,
    Presolve,
    PresolveSingle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolveExchange {
    pub kind: SolveExchangeKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub constraint_id: Option<String>,
    pub request: Problem,
    pub response: SolveResult,
}

impl Constraint {
    pub fn equation_count(&self) -> i32 {
        match self {
            Constraint::Coincident { .. } => 2,
            Constraint::Horizontal { .. } => 1,
            Constraint::Vertical { .. } => 1,
            Constraint::Parallel { .. } => 1,
            Constraint::Perpendicular { .. } => 1,
            Constraint::Tangent { .. } => 1,
            Constraint::Equal { .. } => 1,
            Constraint::Symmetric { .. } => 2,
            Constraint::Concentric { .. } => 2,
            Constraint::Collinear { .. } => 1,
            Constraint::Fixed { .. } => 0,
            Constraint::Midpoint { .. } => 2,
            Constraint::PointOnCircle { .. } => 1,
            Constraint::PointOnLine { .. } => 1,
            Constraint::Distance { .. } => 1,
            Constraint::Length { .. } => 1,
            Constraint::Angle { .. } => 1,
            Constraint::Radius { .. } => 1,
            Constraint::Diameter { .. } => 1,
            Constraint::HDistance { .. } => 1,
            Constraint::VDistance { .. } => 1,
            Constraint::LineDistance { .. } => 2,
            Constraint::AbsoluteAngle { .. } => 1,
            Constraint::EqualRadius { .. } => 1,
            Constraint::ArcLength { .. } => 1,
            Constraint::LineTangentArc { .. } => 1,
            Constraint::ShapeCentroidX { .. } => 1,
            Constraint::ShapeCentroidY { .. } => 1,
            Constraint::ShapeWidth { .. } => 1,
            Constraint::ShapeHeight { .. } => 1,
            Constraint::ShapeArea { .. } => 1,
            Constraint::ShapeEqualCentroid { .. } => 2,
            Constraint::PointLineDistance { .. } => 1,
            Constraint::Ccw { .. } => 0,
            Constraint::AngleBetween { .. } => 1,
            Constraint::BlockRotation { .. } => 0,
            Constraint::SameDirection { .. } => 1,
            Constraint::OppositeDirection { .. } => 1,
        }
    }
}
