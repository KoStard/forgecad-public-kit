use std::collections::HashMap;
use crate::types::{Arc, Circle, Constraint, Line, Point, Shape};

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn to_rad(deg: f64) -> f64 {
    deg * std::f64::consts::PI / 180.0
}

fn normalize_angle(angle: f64) -> f64 {
    let mut a = angle;
    while a > std::f64::consts::PI { a -= 2.0 * std::f64::consts::PI; }
    while a < -std::f64::consts::PI { a += 2.0 * std::f64::consts::PI; }
    a
}

fn angle_of_line(ax: f64, ay: f64, bx: f64, by: f64) -> f64 {
    (by - ay).atan2(bx - ax)
}

fn arc_sweep(start_angle: f64, end_angle: f64, clockwise: bool) -> f64 {
    let sweep = if clockwise {
        (start_angle - end_angle + 2.0 * std::f64::consts::PI) % (2.0 * std::f64::consts::PI)
    } else {
        (end_angle - start_angle + 2.0 * std::f64::consts::PI) % (2.0 * std::f64::consts::PI)
    };
    if sweep < 1e-9 { 2.0 * std::f64::consts::PI } else { sweep }
}

fn reflect_point_across_line(
    px: f64, py: f64,
    ax: f64, ay: f64,
    bx: f64, by: f64,
) -> (f64, f64) {
    let dx = bx - ax;
    let dy = by - ay;
    let len2 = dx * dx + dy * dy;
    if len2 < 1e-9 { return (px, py); }
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    let proj_x = ax + t * dx;
    let proj_y = ay + t * dy;
    (2.0 * proj_x - px, 2.0 * proj_y - py)
}

fn polygon_signed_area_pts(pts: &[(f64, f64)]) -> f64 {
    let n = pts.len();
    let mut area = 0.0f64;
    for i in 0..n {
        let j = (i + 1) % n;
        area += pts[i].0 * pts[j].1 - pts[j].0 * pts[i].1;
    }
    area / 2.0
}

fn traverse_shape_vertices<'a>(
    shape: &Shape,
    lines_map: &HashMap<&str, &'a Line>,
    pts_map: &HashMap<&str, &'a Point>,
) -> Vec<(f64, f64)> {
    if shape.lines.is_empty() { return vec![]; }
    // Build adjacency.
    let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();
    for lid in &shape.lines {
        if let Some(l) = lines_map.get(lid.as_str()) {
            adj.entry(l.a.as_str()).or_default().push(l.b.as_str());
            adj.entry(l.b.as_str()).or_default().push(l.a.as_str());
        }
    }
    let first_line = match lines_map.get(shape.lines[0].as_str()) {
        Some(l) => l,
        None => return vec![],
    };
    let mut result: Vec<(f64, f64)> = Vec::new();
    let mut current = first_line.a.as_str();
    let mut prev: Option<&str> = None;
    for _ in 0..shape.lines.len() {
        if let Some(pt) = pts_map.get(current) {
            result.push((pt.x, pt.y));
        }
        let neighbors = adj.get(current).map(|v| v.as_slice()).unwrap_or(&[]);
        let next = neighbors.iter().find(|&&n| Some(n) != prev).copied();
        prev = Some(current);
        match next {
            Some(n) => current = n,
            None => break,
        }
    }
    result
}

fn shape_centroid_coords(
    shape: &Shape,
    lines_map: &HashMap<&str, &Line>,
    pts_map: &HashMap<&str, &Point>,
) -> (f64, f64) {
    let verts = traverse_shape_vertices(shape, lines_map, pts_map);
    if verts.is_empty() { return (0.0, 0.0); }
    let n = verts.len() as f64;
    let cx = verts.iter().map(|(x, _)| x).sum::<f64>() / n;
    let cy = verts.iter().map(|(_, y)| y).sum::<f64>() / n;
    (cx, cy)
}

fn shape_bounding_box(
    shape: &Shape,
    lines_map: &HashMap<&str, &Line>,
    pts_map: &HashMap<&str, &Point>,
) -> (f64, f64, f64, f64) {
    let verts = traverse_shape_vertices(shape, lines_map, pts_map);
    if verts.is_empty() { return (0.0, 0.0, 0.0, 0.0); }
    let min_x = verts.iter().map(|(x, _)| *x).fold(f64::INFINITY, f64::min);
    let max_x = verts.iter().map(|(x, _)| *x).fold(f64::NEG_INFINITY, f64::max);
    let min_y = verts.iter().map(|(_, y)| *y).fold(f64::INFINITY, f64::min);
    let max_y = verts.iter().map(|(_, y)| *y).fold(f64::NEG_INFINITY, f64::max);
    (min_x, max_x, min_y, max_y)
}

// ─── Context builders ─────────────────────────────────────────────────────────

fn make_pts<'a>(points: &'a Vec<Point>) -> HashMap<&'a str, &'a Point> {
    points.iter().map(|p| (p.id.as_str(), p)).collect()
}
fn make_lines<'a>(lines: &'a Vec<Line>) -> HashMap<&'a str, &'a Line> {
    lines.iter().map(|l| (l.id.as_str(), l)).collect()
}
fn make_circles<'a>(circles: &'a Vec<Circle>) -> HashMap<&'a str, &'a Circle> {
    circles.iter().map(|c| (c.id.as_str(), c)).collect()
}
fn make_arcs<'a>(arcs: &'a Vec<Arc>) -> HashMap<&'a str, &'a Arc> {
    arcs.iter().map(|a| (a.id.as_str(), a)).collect()
}
fn make_shapes<'a>(shapes: &'a Vec<Shape>) -> HashMap<&'a str, &'a Shape> {
    shapes.iter().map(|s| (s.id.as_str(), s)).collect()
}

// ─── Residual dispatch ────────────────────────────────────────────────────────

/// Compute the residual vector for a single constraint.
pub fn constraint_residual_impl(
    c: &Constraint,
    points: &Vec<Point>,
    lines: &Vec<Line>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    shapes: &Vec<Shape>,
) -> Vec<f64> {
    let pts = make_pts(points);
    let lns = make_lines(lines);
    let circs = make_circles(circles);
    let arcs_map = make_arcs(arcs);
    let shapes_map = make_shapes(shapes);
    residual(c, &pts, &lns, &circs, &arcs_map, &shapes_map)
}

/// Check whether a constraint has an analytic residual (vs GS-only).
pub fn has_residual(c: &Constraint) -> bool {
    !matches!(
        c,
        Constraint::Fixed { .. }
            | Constraint::Ccw { .. }
            | Constraint::ShapeWidth { .. }
            | Constraint::ShapeHeight { .. }
    )
}

/// Evaluate all constraint residuals concatenated into one vector.
pub fn evaluate_residuals(
    points: &Vec<Point>,
    lines: &Vec<Line>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
) -> Vec<f64> {
    let pts = make_pts(points);
    let lns = make_lines(lines);
    let circs = make_circles(circles);
    let arcs_map = make_arcs(arcs);
    let shapes_map = make_shapes(shapes);

    let mut out = Vec::new();
    for c in constraints {
        if has_residual(c) {
            out.extend(residual(c, &pts, &lns, &circs, &arcs_map, &shapes_map));
        }
    }
    out
}

/// Returns all entity IDs (expanded to point ids) that a constraint depends on.
pub fn constraint_entity_ids(
    c: &Constraint,
    lines_map: &HashMap<&str, &Line>,
    circles_map: &HashMap<&str, &Circle>,
    arcs_map: &HashMap<&str, &Arc>,
    shapes_map: &HashMap<&str, &Shape>,
) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    macro_rules! push {
        ($s:expr) => { ids.push($s.to_string()); };
    }

    match c {
        Constraint::Coincident { a, b, .. } => { push!(a); push!(b); }
        Constraint::Horizontal { line, .. } | Constraint::Vertical { line, .. } => {
            push!(line);
            if let Some(l) = lines_map.get(line.as_str()) { push!(l.a); push!(l.b); }
        }
        Constraint::Parallel { a, b, .. } | Constraint::Perpendicular { a, b, .. } | Constraint::Equal { a, b, .. } => {
            push!(a); push!(b);
            for lid in [a, b] {
                if let Some(l) = lines_map.get(lid.as_str()) { push!(l.a); push!(l.b); }
            }
        }
        Constraint::Tangent { line, circle, a, b, .. } => {
            if let Some(lid) = line { push!(lid); if let Some(l) = lines_map.get(lid.as_str()) { push!(l.a); push!(l.b); } }
            if let Some(cid) = circle { push!(cid); if let Some(c) = circles_map.get(cid.as_str()) { push!(c.center); } }
            if let Some(aid) = a { push!(aid); if let Some(c) = circles_map.get(aid.as_str()) { push!(c.center); } }
            if let Some(bid) = b { push!(bid); if let Some(c) = circles_map.get(bid.as_str()) { push!(c.center); } }
        }
        Constraint::Symmetric { a, b, axis, .. } => {
            push!(a); push!(b); push!(axis);
            if let Some(l) = lines_map.get(axis.as_str()) { push!(l.a); push!(l.b); }
        }
        Constraint::Concentric { a, b, .. } => {
            push!(a); push!(b);
            if let Some(c) = circles_map.get(a.as_str()) { push!(c.center); }
            if let Some(c) = circles_map.get(b.as_str()) { push!(c.center); }
        }
        Constraint::Collinear { point, line, .. } => {
            push!(point); push!(line);
            if let Some(l) = lines_map.get(line.as_str()) { push!(l.a); push!(l.b); }
        }
        Constraint::Fixed { point, .. } => { push!(point); }
        Constraint::Midpoint { point, line, .. } => {
            push!(point); push!(line);
            if let Some(l) = lines_map.get(line.as_str()) { push!(l.a); push!(l.b); }
        }
        Constraint::PointOnCircle { point, circle, .. } => {
            push!(point); push!(circle);
            if let Some(c) = circles_map.get(circle.as_str()) { push!(c.center); }
        }
        Constraint::PointOnLine { point, line, .. } => {
            push!(point); push!(line);
            if let Some(l) = lines_map.get(line.as_str()) { push!(l.a); push!(l.b); }
        }
        Constraint::Distance { a, b, .. } | Constraint::HDistance { a, b, .. } | Constraint::VDistance { a, b, .. } => {
            push!(a); push!(b);
        }
        Constraint::Length { line, .. } | Constraint::AbsoluteAngle { line, .. } => {
            push!(line);
            if let Some(l) = lines_map.get(line.as_str()) { push!(l.a); push!(l.b); }
        }
        Constraint::Angle { a, b, .. } | Constraint::LineDistance { a, b, .. } | Constraint::AngleBetween { a, b, .. } => {
            push!(a); push!(b);
            for lid in [a, b] {
                if let Some(l) = lines_map.get(lid.as_str()) { push!(l.a); push!(l.b); }
            }
        }
        Constraint::Radius { circle, .. } | Constraint::Diameter { circle, .. } => {
            push!(circle);
        }
        Constraint::EqualRadius { a, b, .. } => {
            push!(a); push!(b);
        }
        Constraint::ArcLength { arc, .. } => {
            push!(arc);
            if let Some(a) = arcs_map.get(arc.as_str()) { push!(a.center); push!(a.start); push!(a.end); }
        }
        Constraint::LineTangentArc { line, arc, .. } => {
            push!(line); push!(arc);
            if let Some(l) = lines_map.get(line.as_str()) { push!(l.a); push!(l.b); }
            if let Some(a) = arcs_map.get(arc.as_str()) { push!(a.center); push!(a.start); push!(a.end); }
        }
        Constraint::ShapeCentroidX { shape, .. }
        | Constraint::ShapeCentroidY { shape, .. }
        | Constraint::ShapeWidth { shape, .. }
        | Constraint::ShapeHeight { shape, .. }
        | Constraint::ShapeArea { shape, .. } => {
            push!(shape);
            if let Some(s) = shapes_map.get(shape.as_str()) {
                for lid in &s.lines {
                    push!(lid);
                    if let Some(l) = lines_map.get(lid.as_str()) { push!(l.a); push!(l.b); }
                }
            }
        }
        Constraint::ShapeEqualCentroid { a, b, .. } => {
            for sid in [a, b] {
                push!(sid);
                if let Some(s) = shapes_map.get(sid.as_str()) {
                    for lid in &s.lines {
                        push!(lid);
                        if let Some(l) = lines_map.get(lid.as_str()) { push!(l.a); push!(l.b); }
                    }
                }
            }
        }
        Constraint::PointLineDistance { point, line, .. } => {
            push!(point); push!(line);
            if let Some(l) = lines_map.get(line.as_str()) { push!(l.a); push!(l.b); }
        }
        Constraint::Ccw { points, .. } => {
            for p in points { push!(p); }
        }
    }

    ids.sort();
    ids.dedup();
    ids
}

// ─── Core residual function ───────────────────────────────────────────────────

fn residual(
    c: &Constraint,
    pts: &HashMap<&str, &Point>,
    lns: &HashMap<&str, &Line>,
    circs: &HashMap<&str, &Circle>,
    arcs: &HashMap<&str, &Arc>,
    shapes: &HashMap<&str, &Shape>,
) -> Vec<f64> {
    match c {
        Constraint::Coincident { a, b, .. } => {
            let (Some(pa), Some(pb)) = (pts.get(a.as_str()), pts.get(b.as_str())) else { return vec![0.0, 0.0]; };
            vec![pb.x - pa.x, pb.y - pa.y]
        }

        Constraint::Horizontal { line, .. } => {
            let Some(l) = lns.get(line.as_str()) else { return vec![0.0]; };
            let (Some(pa), Some(pb)) = (pts.get(l.a.as_str()), pts.get(l.b.as_str())) else { return vec![0.0]; };
            vec![pb.y - pa.y]
        }

        Constraint::Vertical { line, .. } => {
            let Some(l) = lns.get(line.as_str()) else { return vec![0.0]; };
            let (Some(pa), Some(pb)) = (pts.get(l.a.as_str()), pts.get(l.b.as_str())) else { return vec![0.0]; };
            vec![pb.x - pa.x]
        }

        Constraint::Parallel { a, b, .. } => {
            let (Some(la), Some(lb)) = (lns.get(a.as_str()), lns.get(b.as_str())) else { return vec![0.0]; };
            let (Some(a1), Some(a2)) = (pts.get(la.a.as_str()), pts.get(la.b.as_str())) else { return vec![0.0]; };
            let (Some(b1), Some(b2)) = (pts.get(lb.a.as_str()), pts.get(lb.b.as_str())) else { return vec![0.0]; };
            let dax = a2.x - a1.x; let day = a2.y - a1.y;
            let dbx = b2.x - b1.x; let dby = b2.y - b1.y;
            let len_a = dax.hypot(day).max(1e-9);
            let len_b = dbx.hypot(dby).max(1e-9);
            // cross product of unit vectors = 0
            vec![(dax / len_a) * (dby / len_b) - (day / len_a) * (dbx / len_b)]
        }

        Constraint::Perpendicular { a, b, .. } => {
            let (Some(la), Some(lb)) = (lns.get(a.as_str()), lns.get(b.as_str())) else { return vec![0.0]; };
            let (Some(a1), Some(a2)) = (pts.get(la.a.as_str()), pts.get(la.b.as_str())) else { return vec![0.0]; };
            let (Some(b1), Some(b2)) = (pts.get(lb.a.as_str()), pts.get(lb.b.as_str())) else { return vec![0.0]; };
            let dax = a2.x - a1.x; let day = a2.y - a1.y;
            let dbx = b2.x - b1.x; let dby = b2.y - b1.y;
            let len_a = dax.hypot(day).max(1e-9);
            let len_b = dbx.hypot(dby).max(1e-9);
            // dot product of unit vectors = 0
            vec![(dax / len_a) * (dbx / len_b) + (day / len_a) * (dby / len_b)]
        }

        Constraint::Tangent { line, circle, a, b, .. } => {
            if let (Some(lid), Some(cid)) = (line, circle) {
                let (Some(l), Some(circ)) = (lns.get(lid.as_str()), circs.get(cid.as_str())) else { return vec![0.0]; };
                let (Some(la), Some(lb)) = (pts.get(l.a.as_str()), pts.get(l.b.as_str())) else { return vec![0.0]; };
                let Some(center) = pts.get(circ.center.as_str()) else { return vec![0.0]; };
                let dx = lb.x - la.x; let dy = lb.y - la.y;
                let len = dx.hypot(dy).max(1e-9);
                // signed distance from center to infinite line
                let dist = ((center.x - la.x) * (-dy) + (center.y - la.y) * dx) / len;
                vec![dist.abs() - circ.radius]
            } else if let (Some(aid), Some(bid)) = (a, b) {
                let (Some(ca), Some(cb)) = (circs.get(aid.as_str()), circs.get(bid.as_str())) else { return vec![0.0]; };
                let (Some(pa), Some(pb)) = (pts.get(ca.center.as_str()), pts.get(cb.center.as_str())) else { return vec![0.0]; };
                vec![(pb.x - pa.x).hypot(pb.y - pa.y) - (ca.radius + cb.radius)]
            } else {
                vec![0.0]
            }
        }

        Constraint::Equal { a, b, .. } => {
            let (Some(la), Some(lb)) = (lns.get(a.as_str()), lns.get(b.as_str())) else { return vec![0.0]; };
            let (Some(a1), Some(a2)) = (pts.get(la.a.as_str()), pts.get(la.b.as_str())) else { return vec![0.0]; };
            let (Some(b1), Some(b2)) = (pts.get(lb.a.as_str()), pts.get(lb.b.as_str())) else { return vec![0.0]; };
            let len_a = (a2.x - a1.x).hypot(a2.y - a1.y);
            let len_b = (b2.x - b1.x).hypot(b2.y - b1.y);
            vec![len_a - len_b]
        }

        Constraint::Symmetric { a, b, axis, .. } => {
            let Some(pa) = pts.get(a.as_str()) else { return vec![0.0, 0.0]; };
            let Some(pb) = pts.get(b.as_str()) else { return vec![0.0, 0.0]; };
            let Some(l) = lns.get(axis.as_str()) else { return vec![0.0, 0.0]; };
            let (Some(l1), Some(l2)) = (pts.get(l.a.as_str()), pts.get(l.b.as_str())) else { return vec![0.0, 0.0]; };
            let (rx, ry) = reflect_point_across_line(pa.x, pa.y, l1.x, l1.y, l2.x, l2.y);
            vec![pb.x - rx, pb.y - ry]
        }

        Constraint::Concentric { a, b, .. } => {
            let (Some(ca), Some(cb)) = (circs.get(a.as_str()), circs.get(b.as_str())) else { return vec![0.0, 0.0]; };
            let (Some(pa), Some(pb)) = (pts.get(ca.center.as_str()), pts.get(cb.center.as_str())) else { return vec![0.0, 0.0]; };
            vec![pb.x - pa.x, pb.y - pa.y]
        }

        Constraint::Collinear { point, line, .. } => {
            let Some(pt) = pts.get(point.as_str()) else { return vec![0.0]; };
            let Some(l) = lns.get(line.as_str()) else { return vec![0.0]; };
            let (Some(la), Some(lb)) = (pts.get(l.a.as_str()), pts.get(l.b.as_str())) else { return vec![0.0]; };
            let dx = lb.x - la.x; let dy = lb.y - la.y;
            let len = dx.hypot(dy).max(1e-9);
            vec![((pt.x - la.x) * dy - (pt.y - la.y) * dx) / len]
        }

        Constraint::Fixed { .. } => vec![],

        Constraint::Midpoint { point, line, .. } => {
            let Some(pt) = pts.get(point.as_str()) else { return vec![0.0, 0.0]; };
            let Some(l) = lns.get(line.as_str()) else { return vec![0.0, 0.0]; };
            let (Some(la), Some(lb)) = (pts.get(l.a.as_str()), pts.get(l.b.as_str())) else { return vec![0.0, 0.0]; };
            vec![pt.x - (la.x + lb.x) / 2.0, pt.y - (la.y + lb.y) / 2.0]
        }

        Constraint::PointOnCircle { point, circle, .. } => {
            let Some(pt) = pts.get(point.as_str()) else { return vec![0.0]; };
            let Some(c) = circs.get(circle.as_str()) else { return vec![0.0]; };
            let Some(center) = pts.get(c.center.as_str()) else { return vec![0.0]; };
            vec![(pt.x - center.x).hypot(pt.y - center.y) - c.radius]
        }

        Constraint::PointOnLine { point, line, .. } => {
            let Some(pt) = pts.get(point.as_str()) else { return vec![0.0]; };
            let Some(l) = lns.get(line.as_str()) else { return vec![0.0]; };
            let (Some(la), Some(lb)) = (pts.get(l.a.as_str()), pts.get(l.b.as_str())) else { return vec![0.0]; };
            let dx = lb.x - la.x; let dy = lb.y - la.y;
            let len2 = dx * dx + dy * dy;
            if len2 < 1e-9 { return vec![((pt.x - la.x).hypot(pt.y - la.y))]; }
            let t = ((pt.x - la.x) * dx + (pt.y - la.y) * dy) / len2;
            let len = len2.sqrt();
            if t < 0.0 {
                vec![-(pt.x - la.x).hypot(pt.y - la.y)]
            } else if t > 1.0 {
                vec![(pt.x - lb.x).hypot(pt.y - lb.y)]
            } else {
                vec![((pt.x - la.x) * dy - (pt.y - la.y) * dx) / len]
            }
        }

        Constraint::Distance { a, b, value, .. } => {
            let (Some(pa), Some(pb)) = (pts.get(a.as_str()), pts.get(b.as_str())) else { return vec![0.0]; };
            vec![(pb.x - pa.x).hypot(pb.y - pa.y) - value]
        }

        Constraint::Length { line, value, .. } => {
            let Some(l) = lns.get(line.as_str()) else { return vec![0.0]; };
            let (Some(la), Some(lb)) = (pts.get(l.a.as_str()), pts.get(l.b.as_str())) else { return vec![0.0]; };
            vec![(lb.x - la.x).hypot(lb.y - la.y) - value]
        }

        Constraint::Angle { a, b, value, .. } => {
            let (Some(la), Some(lb)) = (lns.get(a.as_str()), lns.get(b.as_str())) else { return vec![0.0]; };
            let (Some(a1), Some(a2)) = (pts.get(la.a.as_str()), pts.get(la.b.as_str())) else { return vec![0.0]; };
            let (Some(b1), Some(b2)) = (pts.get(lb.a.as_str()), pts.get(lb.b.as_str())) else { return vec![0.0]; };
            let angle_a = angle_of_line(a1.x, a1.y, a2.x, a2.y);
            let angle_b = angle_of_line(b1.x, b1.y, b2.x, b2.y);
            vec![normalize_angle(angle_b - angle_a - to_rad(*value))]
        }

        Constraint::Radius { circle, value, .. } => {
            let Some(c) = circs.get(circle.as_str()) else { return vec![0.0]; };
            vec![c.radius - value]
        }

        Constraint::Diameter { circle, value, .. } => {
            let Some(c) = circs.get(circle.as_str()) else { return vec![0.0]; };
            vec![c.radius - value / 2.0]
        }

        Constraint::HDistance { a, b, value, .. } => {
            let (Some(pa), Some(pb)) = (pts.get(a.as_str()), pts.get(b.as_str())) else { return vec![0.0]; };
            vec![pb.x - pa.x - value]
        }

        Constraint::VDistance { a, b, value, .. } => {
            let (Some(pa), Some(pb)) = (pts.get(a.as_str()), pts.get(b.as_str())) else { return vec![0.0]; };
            vec![pb.y - pa.y - value]
        }

        Constraint::LineDistance { a, b, value, .. } => {
            // Two equations: parallel + perpendicular offset = value.
            let (Some(la), Some(lb)) = (lns.get(a.as_str()), lns.get(b.as_str())) else { return vec![0.0, 0.0]; };
            let (Some(a1), Some(a2)) = (pts.get(la.a.as_str()), pts.get(la.b.as_str())) else { return vec![0.0, 0.0]; };
            let (Some(b1), Some(b2)) = (pts.get(lb.a.as_str()), pts.get(lb.b.as_str())) else { return vec![0.0, 0.0]; };
            let dax = a2.x - a1.x; let day = a2.y - a1.y;
            let dbx = b2.x - b1.x; let dby = b2.y - b1.y;
            let len_a = dax.hypot(day).max(1e-9);
            let len_b = dbx.hypot(dby).max(1e-9);
            let parallel = (dax / len_a) * (dby / len_b) - (day / len_a) * (dbx / len_b);
            // Normal to line a (left-perpendicular).
            let nx = -day / len_a; let ny = dax / len_a;
            let mid_bx = (b1.x + b2.x) / 2.0; let mid_by = (b1.y + b2.y) / 2.0;
            let mid_ax = (a1.x + a2.x) / 2.0; let mid_ay = (a1.y + a2.y) / 2.0;
            let dist = (mid_bx - mid_ax) * nx + (mid_by - mid_ay) * ny;
            vec![parallel, dist - value]
        }

        Constraint::AbsoluteAngle { line, value, .. } => {
            let Some(l) = lns.get(line.as_str()) else { return vec![0.0]; };
            let (Some(la), Some(lb)) = (pts.get(l.a.as_str()), pts.get(l.b.as_str())) else { return vec![0.0]; };
            let angle = angle_of_line(la.x, la.y, lb.x, lb.y);
            let target = to_rad(*value);
            vec![normalize_angle(angle - target)]
        }

        Constraint::EqualRadius { a, b, .. } => {
            let (Some(ca), Some(cb)) = (circs.get(a.as_str()), circs.get(b.as_str())) else { return vec![0.0]; };
            vec![cb.radius - ca.radius]
        }

        Constraint::ArcLength { arc, value, .. } => {
            let Some(a) = arcs.get(arc.as_str()) else { return vec![0.0]; };
            let Some(center) = pts.get(a.center.as_str()) else { return vec![0.0]; };
            let Some(start) = pts.get(a.start.as_str()) else { return vec![0.0]; };
            let Some(end) = pts.get(a.end.as_str()) else { return vec![0.0]; };
            let start_angle = angle_of_line(center.x, center.y, start.x, start.y);
            let end_angle = angle_of_line(center.x, center.y, end.x, end.y);
            let sweep = arc_sweep(start_angle, end_angle, a.clockwise);
            vec![a.radius * sweep - value]
        }

        Constraint::LineTangentArc { line, arc, at_start, .. } => {
            // The line direction must be perpendicular to the radius at the contact point.
            let Some(l) = lns.get(line.as_str()) else { return vec![0.0]; };
            let Some(arc_obj) = arcs.get(arc.as_str()) else { return vec![0.0]; };
            let (Some(la), Some(lb)) = (pts.get(l.a.as_str()), pts.get(l.b.as_str())) else { return vec![0.0]; };
            let contact_id = if *at_start { &arc_obj.start } else { &arc_obj.end };
            let Some(center) = pts.get(arc_obj.center.as_str()) else { return vec![0.0]; };
            let Some(contact) = pts.get(contact_id.as_str()) else { return vec![0.0]; };
            let ldx = lb.x - la.x; let ldy = lb.y - la.y;
            let rdx = contact.x - center.x; let rdy = contact.y - center.y;
            let len_l = ldx.hypot(ldy).max(1e-9);
            let len_r = rdx.hypot(rdy).max(1e-9);
            // dot product = 0 means perpendicular (tangent)
            vec![(ldx / len_l) * (rdx / len_r) + (ldy / len_l) * (rdy / len_r)]
        }

        // Shape constraints with residuals (improvement over TS solver).
        Constraint::ShapeCentroidX { shape, value, .. } => {
            let Some(s) = shapes.get(shape.as_str()) else { return vec![0.0]; };
            let pts_inner: HashMap<&str, &Point> = pts.iter().map(|(k, v)| (*k, *v)).collect();
            let lns_inner: HashMap<&str, &Line> = lns.iter().map(|(k, v)| (*k, *v)).collect();
            let (cx, _) = shape_centroid_coords(s, &lns_inner, &pts_inner);
            vec![cx - value]
        }

        Constraint::ShapeCentroidY { shape, value, .. } => {
            let Some(s) = shapes.get(shape.as_str()) else { return vec![0.0]; };
            let pts_inner: HashMap<&str, &Point> = pts.iter().map(|(k, v)| (*k, *v)).collect();
            let lns_inner: HashMap<&str, &Line> = lns.iter().map(|(k, v)| (*k, *v)).collect();
            let (_, cy) = shape_centroid_coords(s, &lns_inner, &pts_inner);
            vec![cy - value]
        }

        Constraint::ShapeWidth { .. } => vec![], // GS-only (non-differentiable at optimum)

        Constraint::ShapeHeight { .. } => vec![], // GS-only

        Constraint::ShapeArea { shape, value, .. } => {
            let Some(s) = shapes.get(shape.as_str()) else { return vec![0.0]; };
            let pts_inner: HashMap<&str, &Point> = pts.iter().map(|(k, v)| (*k, *v)).collect();
            let lns_inner: HashMap<&str, &Line> = lns.iter().map(|(k, v)| (*k, *v)).collect();
            let verts = traverse_shape_vertices(s, &lns_inner, &pts_inner);
            let area = polygon_signed_area_pts(&verts).abs();
            vec![area - value]
        }

        Constraint::ShapeEqualCentroid { a, b, .. } => {
            let (Some(sa), Some(sb)) = (shapes.get(a.as_str()), shapes.get(b.as_str())) else { return vec![0.0, 0.0]; };
            let pts_inner: HashMap<&str, &Point> = pts.iter().map(|(k, v)| (*k, *v)).collect();
            let lns_inner: HashMap<&str, &Line> = lns.iter().map(|(k, v)| (*k, *v)).collect();
            let (ax, ay) = shape_centroid_coords(sa, &lns_inner, &pts_inner);
            let (bx, by) = shape_centroid_coords(sb, &lns_inner, &pts_inner);
            vec![ax - bx, ay - by]
        }

        Constraint::PointLineDistance { point, line, value, .. } => {
            let Some(pt) = pts.get(point.as_str()) else { return vec![0.0]; };
            let Some(l) = lns.get(line.as_str()) else { return vec![0.0]; };
            let (Some(la), Some(lb)) = (pts.get(l.a.as_str()), pts.get(l.b.as_str())) else { return vec![0.0]; };
            let dx = lb.x - la.x; let dy = lb.y - la.y;
            let len = dx.hypot(dy).max(1e-9);
            let nx = -dy / len; let ny = dx / len;
            vec![(pt.x - la.x) * nx + (pt.y - la.y) * ny - value]
        }

        Constraint::Ccw { .. } => vec![], // Discrete — handled in presolve

        Constraint::AngleBetween { a, b, value, .. } => {
            let (Some(la), Some(lb)) = (lns.get(a.as_str()), lns.get(b.as_str())) else { return vec![0.0]; };
            let (Some(a1), Some(a2)) = (pts.get(la.a.as_str()), pts.get(la.b.as_str())) else { return vec![0.0]; };
            let (Some(b1), Some(b2)) = (pts.get(lb.a.as_str()), pts.get(lb.b.as_str())) else { return vec![0.0]; };
            let dax = a2.x - a1.x; let day = a2.y - a1.y;
            let dbx = b2.x - b1.x; let dby = b2.y - b1.y;
            let len_a = dax.hypot(day).max(1e-9);
            let len_b = dbx.hypot(dby).max(1e-9);
            let cross = (dax / len_a) * (dby / len_b) - (day / len_a) * (dbx / len_b);
            let dot = (dax / len_a) * (dbx / len_b) + (day / len_a) * (dby / len_b);
            let target_rad = to_rad(*value);
            // sin(theta_actual - target) = 0  →  cross·cos(t) - dot·sin(t) = 0
            vec![cross * target_rad.cos() - dot * target_rad.sin()]
        }
    }
}

// ─── GS projectors ────────────────────────────────────────────────────────────

fn pt_read(points: &Vec<Point>, idx: &HashMap<String, usize>, id: &str) -> Option<(f64, f64, bool)> {
    idx.get(id).map(|&i| (points[i].x, points[i].y, points[i].fixed))
}

fn pt_write(points: &mut Vec<Point>, idx: &HashMap<String, usize>, id: &str, x: f64, y: f64) {
    if let Some(&i) = idx.get(id) {
        if !points[i].fixed { points[i].x = x; points[i].y = y; }
    }
}

fn pt_write_force(points: &mut Vec<Point>, idx: &HashMap<String, usize>, id: &str, x: f64, y: f64) {
    if let Some(&i) = idx.get(id) {
        points[i].x = x;
        points[i].y = y;
    }
}

/// Apply a single-step Gauss-Seidel projector and return error magnitude.
pub fn apply_projector(
    c: &Constraint,
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    circles: &mut Vec<Circle>,
    arcs: &mut Vec<Arc>,
    shapes: &Vec<Shape>,
    tolerance: f64,
) -> f64 {
    // Build owned-key index maps (no borrow from the slices).
    let pts_idx: HashMap<String, usize> = points.iter().enumerate().map(|(i, p)| (p.id.clone(), i)).collect();
    let lns_map: HashMap<String, (String, String)> = lines.iter().map(|l| (l.id.clone(), (l.a.clone(), l.b.clone()))).collect();
    let circs_idx: HashMap<String, usize> = circles.iter().enumerate().map(|(i, c)| (c.id.clone(), i)).collect();
    let shapes_map: HashMap<String, Vec<String>> = shapes.iter().map(|s| (s.id.clone(), s.lines.clone())).collect();

    match c {
        Constraint::Coincident { a, b, .. } => {
            let (Some((ax, ay, af)), Some((bx, by, bf))) = (pt_read(points, &pts_idx, a), pt_read(points, &pts_idx, b)) else { return 0.0; };
            let err = (bx - ax).hypot(by - ay);
            if err <= tolerance { return err; }
            if af && bf { return err; }
            if af { pt_write(points, &pts_idx, b, ax, ay); }
            else if bf { pt_write(points, &pts_idx, a, bx, by); }
            else {
                pt_write(points, &pts_idx, a, (ax+bx)/2.0, (ay+by)/2.0);
                pt_write(points, &pts_idx, b, (ax+bx)/2.0, (ay+by)/2.0);
            }
            err
        }

        Constraint::Horizontal { line, .. } => {
            let Some((la, lb)) = lns_map.get(line.as_str()) else { return 0.0; };
            let (la, lb) = (la.clone(), lb.clone());
            let (Some((ax, ay, af)), Some((bx, by, bf))) = (pt_read(points, &pts_idx, &la), pt_read(points, &pts_idx, &lb)) else { return 0.0; };
            let err = (by - ay).abs();
            if err <= tolerance { return err; }
            let my = (ay + by) / 2.0;
            if !af { pt_write(points, &pts_idx, &la, ax, my); }
            if !bf { pt_write(points, &pts_idx, &lb, bx, my); }
            err
        }

        Constraint::Vertical { line, .. } => {
            let Some((la, lb)) = lns_map.get(line.as_str()) else { return 0.0; };
            let (la, lb) = (la.clone(), lb.clone());
            let (Some((ax, ay, af)), Some((bx, by, bf))) = (pt_read(points, &pts_idx, &la), pt_read(points, &pts_idx, &lb)) else { return 0.0; };
            let err = (bx - ax).abs();
            if err <= tolerance { return err; }
            let mx = (ax + bx) / 2.0;
            if !af { pt_write(points, &pts_idx, &la, mx, ay); }
            if !bf { pt_write(points, &pts_idx, &lb, mx, by); }
            err
        }

        Constraint::Distance { a, b, value, .. } => {
            let (Some((ax, ay, af)), Some((bx, by, bf))) = (pt_read(points, &pts_idx, a), pt_read(points, &pts_idx, b)) else { return 0.0; };
            let len = (bx - ax).hypot(by - ay).max(1e-9);
            let err = (len - value).abs();
            if err <= tolerance { return err; }
            let (dx, dy) = ((bx - ax) / len, (by - ay) / len);
            if af && bf { return err; }
            let mid = ((ax + bx) / 2.0, (ay + by) / 2.0);
            if af { pt_write(points, &pts_idx, b, ax + dx * value, ay + dy * value); }
            else if bf { pt_write(points, &pts_idx, a, bx - dx * value, by - dy * value); }
            else {
                pt_write(points, &pts_idx, a, mid.0 - dx * value / 2.0, mid.1 - dy * value / 2.0);
                pt_write(points, &pts_idx, b, mid.0 + dx * value / 2.0, mid.1 + dy * value / 2.0);
            }
            err
        }

        Constraint::HDistance { a, b, value, .. } => {
            let (Some((ax, ay, af)), Some((bx, by, bf))) = (pt_read(points, &pts_idx, a), pt_read(points, &pts_idx, b)) else { return 0.0; };
            let err = (bx - ax - value).abs();
            if err <= tolerance { return err; }
            if af { pt_write(points, &pts_idx, b, ax + value, by); }
            else if bf { pt_write(points, &pts_idx, a, bx - value, ay); }
            else {
                let mid = (ax + bx) / 2.0;
                pt_write(points, &pts_idx, a, mid - value / 2.0, ay);
                pt_write(points, &pts_idx, b, mid + value / 2.0, by);
            }
            err
        }

        Constraint::VDistance { a, b, value, .. } => {
            let (Some((ax, ay, af)), Some((bx, by, bf))) = (pt_read(points, &pts_idx, a), pt_read(points, &pts_idx, b)) else { return 0.0; };
            let err = (by - ay - value).abs();
            if err <= tolerance { return err; }
            if af { pt_write(points, &pts_idx, b, bx, ay + value); }
            else if bf { pt_write(points, &pts_idx, a, ax, by - value); }
            else {
                let mid = (ay + by) / 2.0;
                pt_write(points, &pts_idx, a, ax, mid - value / 2.0);
                pt_write(points, &pts_idx, b, bx, mid + value / 2.0);
            }
            err
        }

        Constraint::Length { line, value, .. } => {
            let Some((la, lb)) = lns_map.get(line.as_str()) else { return 0.0; };
            let (la, lb) = (la.clone(), lb.clone());
            let (Some((ax, ay, af)), Some((bx, by, bf))) = (pt_read(points, &pts_idx, &la), pt_read(points, &pts_idx, &lb)) else { return 0.0; };
            let len = (bx - ax).hypot(by - ay).max(1e-9);
            let err = (len - value).abs();
            if err <= tolerance { return err; }
            let (dx, dy) = ((bx - ax) / len, (by - ay) / len);
            let mid = ((ax + bx) / 2.0, (ay + by) / 2.0);
            if af && bf { return err; }
            if af { pt_write(points, &pts_idx, &lb, ax + dx * value, ay + dy * value); }
            else if bf { pt_write(points, &pts_idx, &la, bx - dx * value, by - dy * value); }
            else {
                pt_write(points, &pts_idx, &la, mid.0 - dx * value / 2.0, mid.1 - dy * value / 2.0);
                pt_write(points, &pts_idx, &lb, mid.0 + dx * value / 2.0, mid.1 + dy * value / 2.0);
            }
            err
        }

        Constraint::Radius { circle, value, .. } => {
            if let Some(&ci) = circs_idx.get(circle.as_str()) {
                let err = (circles[ci].radius - value).abs();
                if err > tolerance { circles[ci].radius = *value; }
                err
            } else { 0.0 }
        }

        Constraint::Diameter { circle, value, .. } => {
            if let Some(&ci) = circs_idx.get(circle.as_str()) {
                let target = value / 2.0;
                let err = (circles[ci].radius - target).abs();
                if err > tolerance { circles[ci].radius = target; }
                err
            } else { 0.0 }
        }

        Constraint::Fixed { point, x, y, .. } => {
            pt_write_force(points, &pts_idx, point, *x, *y);
            0.0
        }

        Constraint::ShapeWidth { shape, value, .. } => {
            let Some(line_ids) = shapes_map.get(shape.as_str()) else { return 0.0; };
            let line_ids = line_ids.clone();
            let lns_map2: HashMap<&str, &Line> = lines.iter().map(|l| (l.id.as_str(), l)).collect();
            let pts_ref: HashMap<&str, &Point> = points.iter().map(|p| (p.id.as_str(), p)).collect();
            // Build a temporary shape for bounding box calc.
            let tmp_shape = Shape { id: shape.clone(), lines: line_ids.clone() };
            let (min_x, max_x, _, _) = shape_bounding_box(&tmp_shape, &lns_map2, &pts_ref);
            let current = max_x - min_x;
            let err = (current - value).abs();
            if err <= tolerance { return err; }
            let ratio = if current.abs() > 1e-9 { value / current } else { 1.0 };
            let cx = (min_x + max_x) / 2.0;
            let point_ids: Vec<String> = line_ids.iter()
                .filter_map(|lid| lns_map2.get(lid.as_str()))
                .flat_map(|l| [l.a.clone(), l.b.clone()])
                .collect();
            drop(pts_ref); drop(lns_map2);
            for pid in &point_ids {
                if let Some(&i) = pts_idx.get(pid.as_str()) {
                    if !points[i].fixed {
                        let old_x = points[i].x;
                        points[i].x = cx + (old_x - cx) * ratio;
                    }
                }
            }
            err
        }

        Constraint::ShapeHeight { shape, value, .. } => {
            let Some(line_ids) = shapes_map.get(shape.as_str()) else { return 0.0; };
            let line_ids = line_ids.clone();
            let lns_map2: HashMap<&str, &Line> = lines.iter().map(|l| (l.id.as_str(), l)).collect();
            let pts_ref: HashMap<&str, &Point> = points.iter().map(|p| (p.id.as_str(), p)).collect();
            let tmp_shape = Shape { id: shape.clone(), lines: line_ids.clone() };
            let (_, _, min_y, max_y) = shape_bounding_box(&tmp_shape, &lns_map2, &pts_ref);
            let current = max_y - min_y;
            let err = (current - value).abs();
            if err <= tolerance { return err; }
            let ratio = if current.abs() > 1e-9 { value / current } else { 1.0 };
            let cy = (min_y + max_y) / 2.0;
            let point_ids: Vec<String> = line_ids.iter()
                .filter_map(|lid| lns_map2.get(lid.as_str()))
                .flat_map(|l| [l.a.clone(), l.b.clone()])
                .collect();
            drop(pts_ref); drop(lns_map2);
            for pid in &point_ids {
                if let Some(&i) = pts_idx.get(pid.as_str()) {
                    if !points[i].fixed {
                        let old_y = points[i].y;
                        points[i].y = cy + (old_y - cy) * ratio;
                    }
                }
            }
            err
        }

        // For all other constraints use residual magnitude as error proxy.
        _ => {
            let pts_ref: Vec<Point> = points.iter().cloned().collect();
            let circs_ref: Vec<Circle> = circles.iter().cloned().collect();
            let arcs_ref: Vec<Arc> = arcs.iter().cloned().collect();
            let res = constraint_residual_impl(c, &pts_ref, lines, &circs_ref, &arcs_ref, shapes);
            res.iter().copied().fold(0.0f64, |a, v| a.max(v.abs()))
        }
    }
}
