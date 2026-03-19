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
