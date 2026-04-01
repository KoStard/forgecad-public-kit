use std::collections::{HashMap, HashSet};

use crate::constraints::constraint_entity_ids;
use crate::types::{Arc, Circle, Constraint, Line, Point, Shape};

/// Union-Find for partitioning constraint graphs into independent components.
pub struct UnionFind {
    parent: Vec<usize>,
    rank: Vec<usize>,
}

impl UnionFind {
    pub fn new(n: usize) -> Self {
        UnionFind {
            parent: (0..n).collect(),
            rank: vec![0; n],
        }
    }

    pub fn find(&mut self, x: usize) -> usize {
        if self.parent[x] != x {
            self.parent[x] = self.find(self.parent[x]); // path compression
        }
        self.parent[x]
    }

    pub fn union(&mut self, x: usize, y: usize) {
        let rx = self.find(x);
        let ry = self.find(y);
        if rx == ry {
            return;
        }
        match self.rank[rx].cmp(&self.rank[ry]) {
            std::cmp::Ordering::Less => self.parent[rx] = ry,
            std::cmp::Ordering::Greater => self.parent[ry] = rx,
            std::cmp::Ordering::Equal => {
                self.parent[ry] = rx;
                self.rank[rx] += 1;
            }
        }
    }

    pub fn component_of(&mut self, x: usize) -> usize {
        self.find(x)
    }
}

pub struct ComponentPlan {
    pub entity_ids: HashSet<String>,
    pub constraint_indices: Vec<usize>,
    pub anchor_count: usize,
    pub free_dof: usize,
}

pub fn build_solve_plan(
    points: &Vec<Point>,
    lines: &Vec<Line>,
    circles: &Vec<Circle>,
    arcs: &Vec<Arc>,
    shapes: &Vec<Shape>,
    constraints: &Vec<Constraint>,
) -> Option<Vec<ComponentPlan>> {
    if constraints.len() <= 1 {
        return None;
    }

    let mut all_ids: Vec<String> = Vec::new();
    let mut id_to_index: HashMap<String, usize> = HashMap::new();
    let mut register = |id: &str| {
        if !id_to_index.contains_key(id) {
            let index = all_ids.len();
            all_ids.push(id.to_string());
            id_to_index.insert(id.to_string(), index);
        }
    };

    for point in points {
        register(&point.id);
    }
    for line in lines {
        register(&line.id);
    }
    for circle in circles {
        register(&circle.id);
    }
    for arc in arcs {
        register(&arc.id);
    }
    for shape in shapes {
        register(&shape.id);
    }

    if all_ids.len() <= 1 {
        return None;
    }

    let mut uf = UnionFind::new(all_ids.len());
    let union_ids = |a: &str, b: &str, uf: &mut UnionFind| {
        let (Some(&ia), Some(&ib)) = (id_to_index.get(a), id_to_index.get(b)) else {
            return;
        };
        uf.union(ia, ib);
    };

    for line in lines {
        union_ids(&line.id, &line.a, &mut uf);
        union_ids(&line.id, &line.b, &mut uf);
    }
    for circle in circles {
        union_ids(&circle.id, &circle.center, &mut uf);
    }
    for arc in arcs {
        union_ids(&arc.id, &arc.center, &mut uf);
        union_ids(&arc.id, &arc.start, &mut uf);
        union_ids(&arc.id, &arc.end, &mut uf);
    }
    for shape in shapes {
        for line_id in &shape.lines {
            union_ids(&shape.id, line_id, &mut uf);
        }
    }

    let lines_map: HashMap<&str, &Line> = lines.iter().map(|line| (line.id.as_str(), line)).collect();
    let circles_map: HashMap<&str, &Circle> = circles.iter().map(|circle| (circle.id.as_str(), circle)).collect();
    let arcs_map: HashMap<&str, &Arc> = arcs.iter().map(|arc| (arc.id.as_str(), arc)).collect();
    let shapes_map: HashMap<&str, &Shape> = shapes.iter().map(|shape| (shape.id.as_str(), shape)).collect();

    let mut constraint_entity_refs: Vec<Vec<String>> = Vec::with_capacity(constraints.len());
    for constraint in constraints {
        let entity_ids = constraint_entity_ids(
            constraint,
            &lines_map,
            &circles_map,
            &arcs_map,
            &shapes_map,
        );
        for entity_id in entity_ids.windows(2) {
            union_ids(&entity_id[0], &entity_id[1], &mut uf);
        }
        constraint_entity_refs.push(entity_ids);
    }

    let mut components: HashMap<usize, HashSet<String>> = HashMap::new();
    for entity_id in &all_ids {
        let Some(&index) = id_to_index.get(entity_id) else {
            continue;
        };
        let root = uf.find(index);
        components.entry(root).or_default().insert(entity_id.clone());
    }

    if components.len() <= 1 {
        return None;
    }

    let mut plans: Vec<ComponentPlan> = components
        .into_values()
        .filter_map(|entity_ids| {
            let constraint_indices: Vec<usize> = constraint_entity_refs
                .iter()
                .enumerate()
                .filter_map(|(constraint_index, entity_refs)| {
                    let first = entity_refs.first()?;
                    entity_ids.contains(first).then_some(constraint_index)
                })
                .collect();

            if constraint_indices.is_empty() {
                return None;
            }

            let anchor_count = points
                .iter()
                .filter(|point| point.fixed && entity_ids.contains(&point.id))
                .count();
            let free_dof = points
                .iter()
                .filter(|point| !point.fixed && entity_ids.contains(&point.id))
                .count()
                * 2
                + circles
                    .iter()
                    .filter(|circle| !circle.fixed_radius && entity_ids.contains(&circle.id))
                    .count()
                + arcs.iter().filter(|arc| entity_ids.contains(&arc.id)).count();

            Some(ComponentPlan {
                entity_ids,
                constraint_indices,
                anchor_count,
                free_dof,
            })
        })
        .collect();

    plans.sort_by(|a, b| {
        b.anchor_count
            .cmp(&a.anchor_count)
            .then_with(|| a.free_dof.cmp(&b.free_dof))
    });

    Some(plans)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_union_find() {
        let mut uf = UnionFind::new(5);
        uf.union(0, 1);
        uf.union(2, 3);
        assert_eq!(uf.find(0), uf.find(1));
        assert_eq!(uf.find(2), uf.find(3));
        assert_ne!(uf.find(0), uf.find(2));
        assert_ne!(uf.find(0), uf.find(4));
    }

    #[test]
    fn transitive_union() {
        let mut uf = UnionFind::new(4);
        uf.union(0, 1);
        uf.union(1, 2);
        uf.union(2, 3);
        assert_eq!(uf.find(0), uf.find(3));
    }

    #[test]
    fn path_compression_single_root() {
        let mut uf = UnionFind::new(6);
        for i in 0..5 {
            uf.union(i, i + 1);
        }
        let root = uf.find(0);
        for i in 0..6 {
            assert_eq!(uf.find(i), root);
        }
    }
}
