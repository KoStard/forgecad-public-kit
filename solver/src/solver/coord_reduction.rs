//! Coordinate equivalence reduction.
//!
//! Scans constraints for equality relationships between point coordinates
//! (horizontal, vertical, coincident) and builds equivalence classes.
//! Points in the same class share the same coordinate value, reducing
//! the solver's variable count.
//!
//! For N points in a horizontal chain, this saves N-1 variables.
//! For a rectangle (4 h/v constraints), it saves 4 variables (8 → 4).

use std::collections::HashMap;
use crate::types::{Constraint, Line, Point};

/// Which coordinate axis is being linked.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CoordAxis {
    X,
    Y,
}

/// A coordinate identity: point index + axis.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct CoordId {
    pub point_idx: usize,
    pub axis: CoordAxis,
}

/// Union-Find over scalar coordinates (each point has 2: x and y).
struct CoordUnionFind {
    parent: Vec<usize>,
    rank: Vec<usize>,
}

impl CoordUnionFind {
    fn new(n: usize) -> Self {
        CoordUnionFind {
            parent: (0..n).collect(),
            rank: vec![0; n],
        }
    }

    fn find(&mut self, x: usize) -> usize {
        if self.parent[x] != x {
            self.parent[x] = self.find(self.parent[x]);
        }
        self.parent[x]
    }

    fn union(&mut self, a: usize, b: usize) {
        let ra = self.find(a);
        let rb = self.find(b);
        if ra == rb { return; }
        match self.rank[ra].cmp(&self.rank[rb]) {
            std::cmp::Ordering::Less => self.parent[ra] = rb,
            std::cmp::Ordering::Greater => self.parent[rb] = ra,
            std::cmp::Ordering::Equal => {
                self.parent[rb] = ra;
                self.rank[ra] += 1;
            }
        }
    }
}

/// Result of coordinate reduction analysis.
pub struct CoordReduction {
    /// For each point index: the representative point index for its X coordinate.
    /// If repr_x[i] == i, this point owns its own X variable.
    /// If repr_x[i] != i, this point's X is slaved to points[repr_x[i]].x.
    pub repr_x: Vec<usize>,
    /// For each point index: the representative point index for its Y coordinate.
    pub repr_y: Vec<usize>,
    /// Constraint indices that are now structurally satisfied and should be skipped.
    pub absorbed_constraints: Vec<usize>,
    /// Number of variables saved (each saved coord = 1 fewer solver variable).
    pub vars_saved: usize,
}

/// Reverse mapping: for each representative point, which other points are linked to it.
pub struct CoordLinkMap {
    /// x_followers[i] = list of point indices whose X is linked to point i's X.
    pub x_followers: Vec<Vec<usize>>,
    /// y_followers[i] = list of point indices whose Y is linked to point i's Y.
    pub y_followers: Vec<Vec<usize>>,
}

impl CoordReduction {
    /// Returns true if point `idx` has its X coordinate slaved to another point.
    pub fn x_is_linked(&self, idx: usize) -> bool {
        self.repr_x[idx] != idx
    }

    /// Returns true if point `idx` has its Y coordinate slaved to another point.
    pub fn y_is_linked(&self, idx: usize) -> bool {
        self.repr_y[idx] != idx
    }

    /// Build a reverse map for fast FD propagation: when the representative's
    /// coordinate changes, immediately update all followers.
    pub fn build_link_map(&self) -> CoordLinkMap {
        let n = self.repr_x.len();
        let mut x_followers: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut y_followers: Vec<Vec<usize>> = vec![Vec::new(); n];
        for i in 0..n {
            let rx = self.repr_x[i];
            if rx != i { x_followers[rx].push(i); }
            let ry = self.repr_y[i];
            if ry != i { y_followers[ry].push(i); }
        }
        CoordLinkMap { x_followers, y_followers }
    }
}

/// Analyze constraints and build coordinate equivalence classes.
///
/// Returns a `CoordReduction` describing which point coordinates are linked
/// and which constraints are absorbed (structurally satisfied).
pub fn build_coord_reduction(
    points: &[Point],
    lines: &[Line],
    constraints: &[Constraint],
) -> CoordReduction {
    let n = points.len();
    if n == 0 {
        return CoordReduction {
            repr_x: vec![],
            repr_y: vec![],
            absorbed_constraints: vec![],
            vars_saved: 0,
        };
    }

    // Build point ID → index lookup.
    let pt_idx: HashMap<&str, usize> = points.iter().enumerate()
        .map(|(i, p)| (p.id.as_str(), i))
        .collect();
    let line_map: HashMap<&str, &Line> = lines.iter()
        .map(|l| (l.id.as_str(), l))
        .collect();

    // Union-find over 2*n scalar coordinates.
    // Slot 2*i = point[i].x, slot 2*i+1 = point[i].y.
    let mut uf = CoordUnionFind::new(2 * n);
    let mut absorbed = Vec::new();

    for (ci, constraint) in constraints.iter().enumerate() {
        match constraint {
            Constraint::Horizontal { line, .. } => {
                if let Some(line) = line_map.get(line.as_str()) {
                    if let (Some(&ai), Some(&bi)) = (pt_idx.get(line.a.as_str()), pt_idx.get(line.b.as_str())) {
                        // A.y = B.y
                        let a_y = 2 * ai + 1;
                        let b_y = 2 * bi + 1;
                        if uf.find(a_y) != uf.find(b_y) {
                            uf.union(a_y, b_y);
                            absorbed.push(ci);
                        }
                        // If they're already in the same class, the constraint
                        // is redundant — but don't absorb it (let the solver
                        // report it as redundant via its normal analysis).
                    }
                }
            }
            Constraint::Vertical { line, .. } => {
                if let Some(line) = line_map.get(line.as_str()) {
                    if let (Some(&ai), Some(&bi)) = (pt_idx.get(line.a.as_str()), pt_idx.get(line.b.as_str())) {
                        // A.x = B.x
                        let a_x = 2 * ai;
                        let b_x = 2 * bi;
                        if uf.find(a_x) != uf.find(b_x) {
                            uf.union(a_x, b_x);
                            absorbed.push(ci);
                        }
                    }
                }
            }
            Constraint::Coincident { a, b, .. } => {
                if let (Some(&ai), Some(&bi)) = (pt_idx.get(a.as_str()), pt_idx.get(b.as_str())) {
                    let mut merged = false;
                    // A.x = B.x
                    if uf.find(2 * ai) != uf.find(2 * bi) {
                        uf.union(2 * ai, 2 * bi);
                        merged = true;
                    }
                    // A.y = B.y
                    if uf.find(2 * ai + 1) != uf.find(2 * bi + 1) {
                        uf.union(2 * ai + 1, 2 * bi + 1);
                        merged = true;
                    }
                    if merged {
                        absorbed.push(ci);
                    }
                }
            }
            _ => {}
        }
    }

    // Build representative mapping.
    // For each equivalence class, prefer fixed points as representatives
    // (they already have determined values).
    // Slot → representative slot.
    let mut slot_repr: Vec<usize> = (0..2 * n).collect();

    // First pass: find representatives (roots of each class).
    // Prefer fixed points as representatives.
    let mut class_best: HashMap<usize, usize> = HashMap::new();
    for i in 0..n {
        for offset in 0..2usize {
            let slot = 2 * i + offset;
            let root = uf.find(slot);
            let entry = class_best.entry(root).or_insert(slot);
            // Prefer fixed points as class representative.
            if points[i].fixed && !points[*entry / 2].fixed {
                *entry = slot;
            }
        }
    }

    // Second pass: assign representatives.
    for i in 0..n {
        for offset in 0..2usize {
            let slot = 2 * i + offset;
            let root = uf.find(slot);
            slot_repr[slot] = class_best[&root];
        }
    }

    // Convert slot representatives to point-index representatives.
    let repr_x: Vec<usize> = (0..n).map(|i| slot_repr[2 * i] / 2).collect();
    let repr_y: Vec<usize> = (0..n).map(|i| slot_repr[2 * i + 1] / 2).collect();

    let vars_saved = (0..n).map(|i| {
        let mut saved = 0usize;
        if repr_x[i] != i { saved += 1; }
        if repr_y[i] != i { saved += 1; }
        saved
    }).sum();

    CoordReduction {
        repr_x,
        repr_y,
        absorbed_constraints: absorbed,
        vars_saved,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pt(id: &str, x: f64, y: f64) -> Point {
        Point { id: id.to_string(), x, y, fixed: false }
    }

    fn line(id: &str, a: &str, b: &str) -> Line {
        Line { id: id.to_string(), a: a.to_string(), b: b.to_string() }
    }

    #[test]
    fn horizontal_links_y_coords() {
        let points = vec![pt("a", 0.0, 0.0), pt("b", 5.0, 0.0)];
        let lines = vec![line("L1", "a", "b")];
        let constraints = vec![
            Constraint::Horizontal { id: "c1".into(), line: "L1".into() },
        ];

        let red = build_coord_reduction(&points, &lines, &constraints);
        // a.y and b.y should be linked
        assert_eq!(red.repr_y[0], red.repr_y[1], "y coords should share representative");
        // a.x and b.x should be independent
        assert_eq!(red.repr_x[0], 0);
        assert_eq!(red.repr_x[1], 1);
        assert_eq!(red.vars_saved, 1);
        assert_eq!(red.absorbed_constraints, vec![0]);
    }

    #[test]
    fn rectangle_saves_4_vars() {
        let points = vec![
            pt("bl", 0.0, 0.0),
            pt("br", 10.0, 0.0),
            pt("tr", 10.0, 5.0),
            pt("tl", 0.0, 5.0),
        ];
        let lines = vec![
            line("bottom", "bl", "br"),
            line("right", "br", "tr"),
            line("top", "tr", "tl"),
            line("left", "tl", "bl"),
        ];
        let constraints = vec![
            Constraint::Horizontal { id: "h1".into(), line: "bottom".into() },
            Constraint::Horizontal { id: "h2".into(), line: "top".into() },
            Constraint::Vertical { id: "v1".into(), line: "right".into() },
            Constraint::Vertical { id: "v2".into(), line: "left".into() },
        ];

        let red = build_coord_reduction(&points, &lines, &constraints);
        assert_eq!(red.vars_saved, 4, "rectangle should save 4 variables");
        assert_eq!(red.absorbed_constraints.len(), 4, "all 4 h/v constraints absorbed");
    }
}
