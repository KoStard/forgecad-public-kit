use std::collections::{HashMap, HashSet};

use crate::types::{Constraint, Line, Point, Shape};

#[derive(Clone, Copy)]
struct LineGeom {
    point: (f64, f64),
    dir: (f64, f64),
}

pub(crate) fn run_constructive_presolve(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    _shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
) {
    construct_point_on_line_distance(points, lines, constraints);
    construct_offset_line_distance_components(points, lines, constraints);
    construct_support_spanned_lines(points, lines, constraints);
}

fn construct_point_on_line_distance(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    constraints: &Vec<Constraint>,
) {
    let pts: HashMap<String, usize> = points
        .iter()
        .enumerate()
        .map(|(i, p)| (p.id.clone(), i))
        .collect();
    let line_map: HashMap<String, &Line> = lines.iter().map(|line| (line.id.clone(), line)).collect();

    let mut point_on_line: HashMap<String, String> = HashMap::new();
    let mut point_line_distance: HashMap<String, (String, f64)> = HashMap::new();

    for constraint in constraints {
        match constraint {
            Constraint::PointOnLine { point, line, .. } => {
                point_on_line.insert(point.clone(), line.clone());
            }
            Constraint::PointLineDistance { point, line, value, .. } => {
                point_line_distance.insert(point.clone(), (line.clone(), *value));
            }
            _ => {}
        }
    }

    for (point_id, on_line_id) in point_on_line {
        let Some((ref_line_id, value)) = point_line_distance.get(point_id.as_str()) else {
            continue;
        };
        let Some(&point_index) = pts.get(point_id.as_str()) else {
            continue;
        };
        if points[point_index].fixed {
            continue;
        }
        let (Some(on_line), Some(ref_line)) = (
            line_map.get(on_line_id.as_str()),
            line_map.get(ref_line_id.as_str()),
        ) else {
            continue;
        };
        let (Some(on_geom), Some(ref_geom)) = (
            line_geom(points, &pts, on_line),
            line_geom(points, &pts, ref_line),
        ) else {
            continue;
        };

        let offset_ref = offset_line(ref_geom, *value);
        if let Some(target) = intersect_lines(on_geom, offset_ref) {
            points[point_index].x = target.0;
            points[point_index].y = target.1;
        }
    }
}

fn construct_offset_line_distance_components(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    constraints: &Vec<Constraint>,
) {
    let pts: HashMap<String, usize> = points
        .iter()
        .enumerate()
        .map(|(i, p)| (p.id.clone(), i))
        .collect();
    let line_map: HashMap<String, &Line> = lines.iter().map(|line| (line.id.clone(), line)).collect();

    let mut offset_specs: HashMap<String, (String, f64)> = HashMap::new();
    let mut point_on_line: HashMap<String, String> = HashMap::new();
    let mut visited: HashSet<String> = HashSet::new();

    for constraint in constraints {
        match constraint {
            Constraint::LineDistance { a, b, value, .. } => {
                offset_specs.insert(b.clone(), (a.clone(), *value));
            }
            Constraint::PointOnLine { point, line, .. } => {
                point_on_line.insert(point.clone(), line.clone());
            }
            _ => {}
        }
    }

    for target_line_id in offset_specs.keys().cloned().collect::<Vec<_>>() {
        if visited.contains(target_line_id.as_str()) {
            continue;
        }

        let component = collect_offset_component(target_line_id.as_str(), &offset_specs, &line_map);
        for line_id in &component {
            visited.insert(line_id.clone());
        }

        if component.len() < 2 {
            continue;
        }

        let point_degree = component_point_degree(&component, &line_map);
        let endpoints: Vec<String> = point_degree
            .iter()
            .filter_map(|(point_id, degree)| (*degree == 1).then_some(point_id.clone()))
            .collect();

        if endpoints.is_empty() {
            construct_closed_offset_cycle(
                &component,
                points,
                &pts,
                &line_map,
                &offset_specs,
            );
        } else if endpoints.len() == 2 {
            construct_open_offset_chain(
                &component,
                endpoints,
                points,
                &pts,
                &line_map,
                &offset_specs,
                &point_on_line,
            );
        }
    }
}

fn construct_support_spanned_lines(
    points: &mut Vec<Point>,
    lines: &Vec<Line>,
    constraints: &Vec<Constraint>,
) {
    let pts: HashMap<String, usize> = points
        .iter()
        .enumerate()
        .map(|(i, p)| (p.id.clone(), i))
        .collect();
    let line_map: HashMap<String, &Line> = lines.iter().map(|line| (line.id.clone(), line)).collect();

    let mut point_on_line: HashMap<String, String> = HashMap::new();
    let mut perpendicular_pairs: Vec<(String, String)> = Vec::new();
    let mut line_lengths: HashMap<String, f64> = HashMap::new();

    for constraint in constraints {
        match constraint {
            Constraint::PointOnLine { point, line, .. } => {
                point_on_line.insert(point.clone(), line.clone());
            }
            Constraint::Perpendicular { a, b, .. } => {
                perpendicular_pairs.push((a.clone(), b.clone()));
            }
            Constraint::Length { line, value, .. } => {
                line_lengths.insert(line.clone(), *value);
            }
            _ => {}
        }
    }

    let are_perpendicular = |a: &str, b: &str| -> bool {
        perpendicular_pairs
            .iter()
            .any(|(x, y)| (x == a && y == b) || (x == b && y == a))
    };

    for (side_line_id, _length) in line_lengths {
        let Some(side_line) = line_map.get(side_line_id.as_str()) else {
            continue;
        };
        let (Some(support_a_id), Some(support_b_id)) = (
            point_on_line.get(side_line.a.as_str()),
            point_on_line.get(side_line.b.as_str()),
        ) else {
            continue;
        };
        if support_a_id == support_b_id {
            continue;
        }
        let Some(base_support_id) = [support_a_id.as_str(), support_b_id.as_str()]
            .into_iter()
            .find(|support_id| are_perpendicular(side_line_id.as_str(), support_id))
        else {
            continue;
        };
        let other_support_id = if base_support_id == support_a_id {
            support_b_id.as_str()
        } else {
            support_a_id.as_str()
        };

        let (Some(base_support), Some(other_support)) = (
            line_map.get(base_support_id),
            line_map.get(other_support_id),
        ) else {
            continue;
        };
        let (Some(base_geom), Some(other_geom)) = (
            line_geom(points, &pts, base_support),
            line_geom(points, &pts, other_support),
        ) else {
            continue;
        };

        let (Some(&ai), Some(&bi)) = (
            pts.get(side_line.a.as_str()),
            pts.get(side_line.b.as_str()),
        ) else {
            continue;
        };

        let current_a = (points[ai].x, points[ai].y);
        let current_b = (points[bi].x, points[bi].y);
        let target_a = project_to_line(if support_a_id.as_str() == base_support_id { current_a } else { current_b }, base_geom);
        let normal = (-base_geom.dir.1, base_geom.dir.0);
        let Some(target_b) = intersect_lines(
            LineGeom { point: target_a, dir: normal },
            other_geom,
        ) else {
            continue;
        };

        let moved_a = if support_a_id.as_str() == base_support_id {
            target_a
        } else {
            target_b
        };
        let moved_b = if support_a_id.as_str() == base_support_id {
            target_b
        } else {
            target_a
        };

        if !points[ai].fixed {
            points[ai].x = moved_a.0;
            points[ai].y = moved_a.1;
        }
        if !points[bi].fixed {
            points[bi].x = moved_b.0;
            points[bi].y = moved_b.1;
        }
    }
}

fn collect_offset_component(
    start: &str,
    offset_specs: &HashMap<String, (String, f64)>,
    line_map: &HashMap<String, &Line>,
) -> Vec<String> {
    let mut stack = vec![start.to_string()];
    let mut seen: HashSet<String> = HashSet::new();
    let mut ordered = Vec::new();

    while let Some(line_id) = stack.pop() {
        if !seen.insert(line_id.clone()) {
            continue;
        }
        ordered.push(line_id.clone());
        let Some(line) = line_map.get(line_id.as_str()) else {
            continue;
        };
        for neighbor_id in offset_specs.keys() {
            if seen.contains(neighbor_id.as_str()) || neighbor_id == &line_id {
                continue;
            }
            let Some(neighbor) = line_map.get(neighbor_id.as_str()) else {
                continue;
            };
            if lines_share_point(line, neighbor) {
                stack.push(neighbor_id.clone());
            }
        }
    }

    ordered
}

fn component_point_degree(
    component: &[String],
    line_map: &HashMap<String, &Line>,
) -> HashMap<String, usize> {
    let mut degree = HashMap::new();
    for line_id in component {
        let Some(line) = line_map.get(line_id.as_str()) else {
            continue;
        };
        *degree.entry(line.a.clone()).or_insert(0) += 1;
        *degree.entry(line.b.clone()).or_insert(0) += 1;
    }
    degree
}

fn construct_open_offset_chain(
    component: &[String],
    endpoints: Vec<String>,
    points: &mut Vec<Point>,
    pts: &HashMap<String, usize>,
    line_map: &HashMap<String, &Line>,
    offset_specs: &HashMap<String, (String, f64)>,
    point_on_line: &HashMap<String, String>,
) {
    let Some((ordered_lines, ordered_points)) =
        order_open_chain(component, endpoints, line_map)
    else {
        return;
    };

    let mut targets: HashMap<String, (f64, f64)> = HashMap::new();

    if let Some(first_point_id) = ordered_points.first() {
        if let Some(target) = endpoint_target(
            first_point_id.as_str(),
            ordered_lines[0].as_str(),
            points,
            pts,
            line_map,
            offset_specs,
            point_on_line,
        ) {
            targets.insert(first_point_id.clone(), target);
        }
    }

    if let Some(last_point_id) = ordered_points.last() {
        if let Some(target) = endpoint_target(
            last_point_id.as_str(),
            ordered_lines.last().unwrap().as_str(),
            points,
            pts,
            line_map,
            offset_specs,
            point_on_line,
        ) {
            targets.insert(last_point_id.clone(), target);
        }
    }

    for (point_id, (line_a_id, line_b_id)) in ordered_points
        .iter()
        .skip(1)
        .take(ordered_points.len().saturating_sub(2))
        .zip(ordered_lines.iter().zip(ordered_lines.iter().skip(1)))
    {
        let Some(target) = shared_offset_intersection(
            line_a_id.as_str(),
            line_b_id.as_str(),
            points,
            pts,
            line_map,
            offset_specs,
        ) else {
            continue;
        };
        targets.insert(point_id.clone(), target);
    }

    apply_point_targets(points, pts, targets);
}

fn construct_closed_offset_cycle(
    component: &[String],
    points: &mut Vec<Point>,
    pts: &HashMap<String, usize>,
    line_map: &HashMap<String, &Line>,
    offset_specs: &HashMap<String, (String, f64)>,
) {
    let Some((ordered_lines, ordered_points)) = order_closed_cycle(component, line_map) else {
        return;
    };

    let mut targets = HashMap::new();
    for i in 0..ordered_points.len() {
        let prev_line = if i == 0 {
            ordered_lines.last().unwrap()
        } else {
            &ordered_lines[i - 1]
        };
        let next_line = &ordered_lines[i];
        let Some(target) = shared_offset_intersection(
            prev_line.as_str(),
            next_line.as_str(),
            points,
            pts,
            line_map,
            offset_specs,
        ) else {
            continue;
        };
        targets.insert(ordered_points[i].clone(), target);
    }

    apply_point_targets(points, pts, targets);
}

fn order_open_chain(
    component: &[String],
    endpoints: Vec<String>,
    line_map: &HashMap<String, &Line>,
) -> Option<(Vec<String>, Vec<String>)> {
    let start_point = endpoints.first()?.clone();
    let end_point = endpoints.get(1)?.clone();

    let mut unused: HashSet<String> = component.iter().cloned().collect();
    let mut ordered_lines = Vec::new();
    let mut ordered_points = vec![start_point.clone()];
    let mut current_point = start_point;

    while !unused.is_empty() {
        let next_line_id = unused.iter().find_map(|line_id| {
            let line = line_map.get(line_id.as_str())?;
            ((line.a == current_point) || (line.b == current_point)).then_some(line_id.clone())
        })?;
        unused.remove(next_line_id.as_str());
        let line = line_map.get(next_line_id.as_str())?;
        let next_point = if line.a == current_point {
            line.b.clone()
        } else {
            line.a.clone()
        };
        ordered_lines.push(next_line_id);
        ordered_points.push(next_point.clone());
        current_point = next_point;
    }

    (ordered_points.last()? == &end_point).then_some((ordered_lines, ordered_points))
}

fn order_closed_cycle(
    component: &[String],
    line_map: &HashMap<String, &Line>,
) -> Option<(Vec<String>, Vec<String>)> {
    let first_line_id = component.first()?.clone();
    let first_line = line_map.get(first_line_id.as_str())?;

    let mut unused: HashSet<String> = component.iter().cloned().collect();
    unused.remove(first_line_id.as_str());

    let mut ordered_lines = vec![first_line_id];
    let mut ordered_points = vec![first_line.a.clone()];
    let mut current_point = first_line.b.clone();

    while !unused.is_empty() {
        ordered_points.push(current_point.clone());
        let next_line_id = unused.iter().find_map(|line_id| {
            let line = line_map.get(line_id.as_str())?;
            ((line.a == current_point) || (line.b == current_point)).then_some(line_id.clone())
        })?;
        unused.remove(next_line_id.as_str());
        let line = line_map.get(next_line_id.as_str())?;
        current_point = if line.a == current_point {
            line.b.clone()
        } else {
            line.a.clone()
        };
        ordered_lines.push(next_line_id);
    }

    (current_point == ordered_points[0]).then_some((ordered_lines, ordered_points))
}

fn endpoint_target(
    point_id: &str,
    target_line_id: &str,
    points: &Vec<Point>,
    pts: &HashMap<String, usize>,
    line_map: &HashMap<String, &Line>,
    offset_specs: &HashMap<String, (String, f64)>,
    point_on_line: &HashMap<String, String>,
) -> Option<(f64, f64)> {
    let (ref_line_id, dist) = offset_specs.get(target_line_id)?;
    let ref_line = line_map.get(ref_line_id.as_str())?;
    let offset_geom = offset_line(line_geom(points, pts, ref_line)?, *dist);

    if let Some(support_line_id) = point_on_line.get(point_id) {
        let support_line = line_map.get(support_line_id.as_str())?;
        let support_geom = line_geom(points, pts, support_line)?;
        intersect_lines(offset_geom, support_geom)
    } else {
        let &point_index = pts.get(point_id)?;
        Some(project_to_line((points[point_index].x, points[point_index].y), offset_geom))
    }
}

fn shared_offset_intersection(
    line_a_id: &str,
    line_b_id: &str,
    points: &Vec<Point>,
    pts: &HashMap<String, usize>,
    line_map: &HashMap<String, &Line>,
    offset_specs: &HashMap<String, (String, f64)>,
) -> Option<(f64, f64)> {
    let (ref_a_id, dist_a) = offset_specs.get(line_a_id)?;
    let (ref_b_id, dist_b) = offset_specs.get(line_b_id)?;
    let ref_a = line_map.get(ref_a_id.as_str())?;
    let ref_b = line_map.get(ref_b_id.as_str())?;
    let geom_a = offset_line(line_geom(points, pts, ref_a)?, *dist_a);
    let geom_b = offset_line(line_geom(points, pts, ref_b)?, *dist_b);
    intersect_lines(geom_a, geom_b)
}

fn apply_point_targets(
    points: &mut Vec<Point>,
    pts: &HashMap<String, usize>,
    targets: HashMap<String, (f64, f64)>,
) {
    for (point_id, target) in targets {
        let Some(&point_index) = pts.get(point_id.as_str()) else {
            continue;
        };
        if points[point_index].fixed {
            continue;
        }
        points[point_index].x = target.0;
        points[point_index].y = target.1;
    }
}

fn line_geom(points: &Vec<Point>, pts: &HashMap<String, usize>, line: &Line) -> Option<LineGeom> {
    let (&ai, &bi) = (pts.get(line.a.as_str())?, pts.get(line.b.as_str())?);
    let ax = points[ai].x;
    let ay = points[ai].y;
    let bx = points[bi].x;
    let by = points[bi].y;
    let dx = bx - ax;
    let dy = by - ay;
    let len = dx.hypot(dy);
    if len < 1e-9 {
        None
    } else {
        Some(LineGeom {
            point: (ax, ay),
            dir: (dx / len, dy / len),
        })
    }
}

fn offset_line(line: LineGeom, distance: f64) -> LineGeom {
    let normal = (-line.dir.1, line.dir.0);
    LineGeom {
        point: (
            line.point.0 + normal.0 * distance,
            line.point.1 + normal.1 * distance,
        ),
        dir: line.dir,
    }
}

fn intersect_lines(a: LineGeom, b: LineGeom) -> Option<(f64, f64)> {
    let den = a.dir.0 * b.dir.1 - a.dir.1 * b.dir.0;
    if den.abs() < 1e-9 {
        return None;
    }
    let dx = b.point.0 - a.point.0;
    let dy = b.point.1 - a.point.1;
    let t = (dx * b.dir.1 - dy * b.dir.0) / den;
    Some((a.point.0 + a.dir.0 * t, a.point.1 + a.dir.1 * t))
}

fn project_to_line(point: (f64, f64), line: LineGeom) -> (f64, f64) {
    let t = (point.0 - line.point.0) * line.dir.0 + (point.1 - line.point.1) * line.dir.1;
    (line.point.0 + line.dir.0 * t, line.point.1 + line.dir.1 * t)
}

fn lines_share_point(a: &Line, b: &Line) -> bool {
    a.a == b.a || a.a == b.b || a.b == b.a || a.b == b.b
}
