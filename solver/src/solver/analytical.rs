use std::collections::HashMap;

use crate::types::{Constraint, Line, Point};

#[derive(Clone, Copy)]
struct KnownPoint {
    x: f64,
    y: f64,
}

struct ConstructionStep {
    x: f64,
    y: f64,
}

struct ConstraintIndex<'a> {
    by_point: HashMap<&'a str, Vec<usize>>,
    line_map: HashMap<&'a str, &'a Line>,
}

pub fn run_analytical_presolve(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    constraints: &Vec<Constraint>,
) {
    let index = build_index(lines, constraints);

    let mut known: HashMap<String, KnownPoint> = HashMap::new();
    for point in points.iter() {
        if point.fixed {
            known.insert(point.id.clone(), KnownPoint { x: point.x, y: point.y });
        }
    }

    let mut progress = true;
    while progress {
        progress = false;

        for point_index in 0..points.len() {
            let point_id = points[point_index].id.clone();
            if known.contains_key(point_id.as_str()) {
                continue;
            }

            let step = try_coincident_propagation(point_id.as_str(), points, constraints, &index, &known)
                .or_else(|| try_direct_placement(point_id.as_str(), points, constraints, &index, &known));

            if let Some(step) = step {
                points[point_index].x = step.x;
                points[point_index].y = step.y;
                points[point_index].fixed = true;
                known.insert(point_id, KnownPoint { x: step.x, y: step.y });
                progress = true;
            }
        }
    }
}

fn build_index<'a>(
    lines: &'a Vec<Line>,
    constraints: &'a Vec<Constraint>,
) -> ConstraintIndex<'a> {
    let line_map: HashMap<&str, &Line> = lines.iter().map(|line| (line.id.as_str(), line)).collect();
    let mut by_point: HashMap<&str, Vec<usize>> = HashMap::new();

    for (constraint_index, constraint) in constraints.iter().enumerate() {
        for point_id in constraint_point_ids(constraint, &line_map) {
            by_point.entry(point_id).or_default().push(constraint_index);
        }
    }

    ConstraintIndex { by_point, line_map }
}

fn constraint_point_ids<'a>(
    constraint: &'a Constraint,
    line_map: &HashMap<&'a str, &'a Line>,
) -> Vec<&'a str> {
    match constraint {
        Constraint::Coincident { a, b, .. }
        | Constraint::Distance { a, b, .. }
        | Constraint::HDistance { a, b, .. }
        | Constraint::VDistance { a, b, .. } => vec![a.as_str(), b.as_str()],

        Constraint::Horizontal { line, .. } | Constraint::Vertical { line, .. } => {
            line_map
                .get(line.as_str())
                .map(|line| vec![line.a.as_str(), line.b.as_str()])
                .unwrap_or_default()
        }

        Constraint::PointOnLine { point, line, .. } => {
            line_map
                .get(line.as_str())
                .map(|line| vec![point.as_str(), line.a.as_str(), line.b.as_str()])
                .unwrap_or_else(|| vec![point.as_str()])
        }

        _ => vec![],
    }
}

fn try_direct_placement(
    point_id: &str,
    _points: &Vec<Point>,
    constraints: &Vec<Constraint>,
    index: &ConstraintIndex,
    known: &HashMap<String, KnownPoint>,
) -> Option<ConstructionStep> {
    let constraint_indices = index.by_point.get(point_id)?;

    let mut resolved_x = None;
    let mut resolved_y = None;

    for &constraint_index in constraint_indices {
        match &constraints[constraint_index] {
            Constraint::HDistance { a, b, value, .. } => {
                let (other, sign) = if a == point_id { (b.as_str(), -1.0) } else if b == point_id { (a.as_str(), 1.0) } else { continue };
                let Some(known_other) = known.get(other) else { continue; };
                resolved_x = Some(known_other.x + sign * value);
            }
            Constraint::VDistance { a, b, value, .. } => {
                let (other, sign) = if a == point_id { (b.as_str(), -1.0) } else if b == point_id { (a.as_str(), 1.0) } else { continue };
                let Some(known_other) = known.get(other) else { continue; };
                resolved_y = Some(known_other.y + sign * value);
            }
            _ => {}
        }
    }

    Some(ConstructionStep {
        x: resolved_x?,
        y: resolved_y?,
    })
}

fn try_coincident_propagation(
    point_id: &str,
    _points: &Vec<Point>,
    constraints: &Vec<Constraint>,
    index: &ConstraintIndex,
    known: &HashMap<String, KnownPoint>,
) -> Option<ConstructionStep> {
    let constraint_indices = index.by_point.get(point_id)?;

    for &constraint_index in constraint_indices {
        if let Constraint::Coincident { a, b, .. } = &constraints[constraint_index] {
            let other = if a == point_id { b.as_str() } else if b == point_id { a.as_str() } else { continue };
            let Some(known_other) = known.get(other) else { continue; };
            return Some(ConstructionStep { x: known_other.x, y: known_other.y });
        }
    }

    None
}

fn try_circle_circle_intersection(
    point_id: &str,
    points: &Vec<Point>,
    constraints: &Vec<Constraint>,
    index: &ConstraintIndex,
    known: &HashMap<String, KnownPoint>,
) -> Option<ConstructionStep> {
    let constraint_indices = index.by_point.get(point_id)?;
    let point = points.iter().find(|point| point.id == point_id)?;

    let mut distances: Vec<(KnownPoint, f64)> = Vec::new();
    for &constraint_index in constraint_indices {
        if let Constraint::Distance { a, b, value, .. } = &constraints[constraint_index] {
            let other = if a == point_id { b.as_str() } else if b == point_id { a.as_str() } else { continue };
            let Some(known_other) = known.get(other) else { continue; };
            distances.push((*known_other, *value));
        }
    }

    if distances.len() < 2 {
        return None;
    }

    let solutions = circle_circle_intersect(
        distances[0].0.x,
        distances[0].0.y,
        distances[0].1,
        distances[1].0.x,
        distances[1].0.y,
        distances[1].1,
    );
    let (x, y) = pick_closest(&solutions, point.x, point.y)?;
    Some(ConstructionStep { x, y })
}

fn try_line_circle_intersection(
    point_id: &str,
    points: &Vec<Point>,
    constraints: &Vec<Constraint>,
    index: &ConstraintIndex,
    known: &HashMap<String, KnownPoint>,
) -> Option<ConstructionStep> {
    let constraint_indices = index.by_point.get(point_id)?;
    let point = points.iter().find(|point| point.id == point_id)?;

    let mut distance_anchor = None;
    for &constraint_index in constraint_indices {
        if let Constraint::Distance { a, b, value, .. } = &constraints[constraint_index] {
            let other = if a == point_id { b.as_str() } else if b == point_id { a.as_str() } else { continue };
            let Some(known_other) = known.get(other) else { continue; };
            distance_anchor = Some((*known_other, *value));
            break;
        }
    }

    let (dist_known, dist_value) = distance_anchor?;

    for &constraint_index in constraint_indices {
        match &constraints[constraint_index] {
            Constraint::Horizontal { line, .. } => {
                let line = index.line_map.get(line.as_str())?;
                let other_point_id = if line.a == point_id { line.b.as_str() } else if line.b == point_id { line.a.as_str() } else { continue };
                let Some(other_known) = known.get(other_point_id) else { continue; };
                let solutions = line_circle_intersect(0.0, other_known.y, 1.0, 0.0, dist_known.x, dist_known.y, dist_value);
                let (x, y) = pick_closest(&solutions, point.x, point.y)?;
                return Some(ConstructionStep { x, y });
            }
            Constraint::Vertical { line, .. } => {
                let line = index.line_map.get(line.as_str())?;
                let other_point_id = if line.a == point_id { line.b.as_str() } else if line.b == point_id { line.a.as_str() } else { continue };
                let Some(other_known) = known.get(other_point_id) else { continue; };
                let solutions = line_circle_intersect(other_known.x, 0.0, 0.0, 1.0, dist_known.x, dist_known.y, dist_value);
                let (x, y) = pick_closest(&solutions, point.x, point.y)?;
                return Some(ConstructionStep { x, y });
            }
            Constraint::PointOnLine { point: on_line_point, line, .. } => {
                if on_line_point != point_id {
                    continue;
                }
                let line = index.line_map.get(line.as_str())?;
                let Some(la) = known.get(line.a.as_str()) else { continue; };
                let Some(lb) = known.get(line.b.as_str()) else { continue; };
                let solutions = line_circle_intersect(
                    la.x,
                    la.y,
                    lb.x - la.x,
                    lb.y - la.y,
                    dist_known.x,
                    dist_known.y,
                    dist_value,
                );
                let (x, y) = pick_closest(&solutions, point.x, point.y)?;
                return Some(ConstructionStep { x, y });
            }
            _ => {}
        }
    }

    None
}

fn try_hdistance_plus_distance(
    point_id: &str,
    points: &Vec<Point>,
    constraints: &Vec<Constraint>,
    index: &ConstraintIndex,
    known: &HashMap<String, KnownPoint>,
) -> Option<ConstructionStep> {
    let constraint_indices = index.by_point.get(point_id)?;
    let point = points.iter().find(|point| point.id == point_id)?;

    let mut resolved_x = None;
    let mut dist_anchor = None;

    for &constraint_index in constraint_indices {
        match &constraints[constraint_index] {
            Constraint::HDistance { a, b, value, .. } => {
                let (other, sign) = if a == point_id { (b.as_str(), -1.0) } else if b == point_id { (a.as_str(), 1.0) } else { continue };
                let Some(known_other) = known.get(other) else { continue; };
                resolved_x = Some(known_other.x + sign * value);
            }
            Constraint::Distance { a, b, value, .. } => {
                let other = if a == point_id { b.as_str() } else if b == point_id { a.as_str() } else { continue };
                let Some(known_other) = known.get(other) else { continue; };
                dist_anchor = Some((*known_other, *value));
            }
            _ => {}
        }
    }

    let x = resolved_x?;
    let (anchor, dist_value) = dist_anchor?;
    let disc = dist_value * dist_value - (x - anchor.x).powi(2);
    if disc < -1e-9 {
        return None;
    }
    let root = if disc > 0.0 { disc.sqrt() } else { 0.0 };
    let solutions = vec![(x, anchor.y + root), (x, anchor.y - root)];
    let (x, y) = pick_closest(&solutions, point.x, point.y)?;
    Some(ConstructionStep { x, y })
}

fn try_vdistance_plus_distance(
    point_id: &str,
    points: &Vec<Point>,
    constraints: &Vec<Constraint>,
    index: &ConstraintIndex,
    known: &HashMap<String, KnownPoint>,
) -> Option<ConstructionStep> {
    let constraint_indices = index.by_point.get(point_id)?;
    let point = points.iter().find(|point| point.id == point_id)?;

    let mut resolved_y = None;
    let mut dist_anchor = None;

    for &constraint_index in constraint_indices {
        match &constraints[constraint_index] {
            Constraint::VDistance { a, b, value, .. } => {
                let (other, sign) = if a == point_id { (b.as_str(), -1.0) } else if b == point_id { (a.as_str(), 1.0) } else { continue };
                let Some(known_other) = known.get(other) else { continue; };
                resolved_y = Some(known_other.y + sign * value);
            }
            Constraint::Distance { a, b, value, .. } => {
                let other = if a == point_id { b.as_str() } else if b == point_id { a.as_str() } else { continue };
                let Some(known_other) = known.get(other) else { continue; };
                dist_anchor = Some((*known_other, *value));
            }
            _ => {}
        }
    }

    let y = resolved_y?;
    let (anchor, dist_value) = dist_anchor?;
    let disc = dist_value * dist_value - (y - anchor.y).powi(2);
    if disc < -1e-9 {
        return None;
    }
    let root = if disc > 0.0 { disc.sqrt() } else { 0.0 };
    let solutions = vec![(anchor.x + root, y), (anchor.x - root, y)];
    let (x, y) = pick_closest(&solutions, point.x, point.y)?;
    Some(ConstructionStep { x, y })
}

fn circle_circle_intersect(
    x1: f64,
    y1: f64,
    r1: f64,
    x2: f64,
    y2: f64,
    r2: f64,
) -> Vec<(f64, f64)> {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let d = dx.hypot(dy);

    if d < 1e-12 || d > r1 + r2 + 1e-9 || d < (r1 - r2).abs() - 1e-9 {
        return vec![];
    }

    let a = (r1 * r1 - r2 * r2 + d * d) / (2.0 * d);
    let h2 = r1 * r1 - a * a;
    let h = if h2 > 0.0 { h2.sqrt() } else { 0.0 };

    let mx = x1 + a * dx / d;
    let my = y1 + a * dy / d;

    if h < 1e-12 {
        return vec![(mx, my)];
    }

    let px = -dy / d * h;
    let py = dx / d * h;
    vec![(mx + px, my + py), (mx - px, my - py)]
}

fn line_circle_intersect(
    px: f64,
    py: f64,
    dx: f64,
    dy: f64,
    cx: f64,
    cy: f64,
    r: f64,
) -> Vec<(f64, f64)> {
    let fx = px - cx;
    let fy = py - cy;
    let a = dx * dx + dy * dy;
    if a < 1e-18 {
        return vec![];
    }
    let b = 2.0 * (fx * dx + fy * dy);
    let c = fx * fx + fy * fy - r * r;
    let disc = b * b - 4.0 * a * c;

    if disc < -1e-9 {
        return vec![];
    }

    let sqrt_disc = if disc > 0.0 { disc.sqrt() } else { 0.0 };
    let t1 = (-b + sqrt_disc) / (2.0 * a);
    let t2 = (-b - sqrt_disc) / (2.0 * a);

    if (t1 - t2).abs() < 1e-12 {
        return vec![(px + t1 * dx, py + t1 * dy)];
    }

    vec![(px + t1 * dx, py + t1 * dy), (px + t2 * dx, py + t2 * dy)]
}

fn pick_closest(
    solutions: &[(f64, f64)],
    ref_x: f64,
    ref_y: f64,
) -> Option<(f64, f64)> {
    let mut iter = solutions.iter().copied();
    let mut best = iter.next()?;
    let mut best_dist = (best.0 - ref_x).hypot(best.1 - ref_y);

    for candidate in iter {
        let dist = (candidate.0 - ref_x).hypot(candidate.1 - ref_y);
        if dist < best_dist {
            best_dist = dist;
            best = candidate;
        }
    }

    Some(best)
}
