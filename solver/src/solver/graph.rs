//! Scalar structural graph: bipartite matching, SCC extraction, and solve DAG.
//!
//! Operates on the same scalar variable / residual-row universe as `lm.rs`.
//! The input is a bipartite adjacency list (residual rows ↔ scalar variables).
//! The output is a `SolveDag`: an ordered list of strongly-connected blocks
//! that can be solved in topological order.

// ─── Data structures ─────────────────────────────────────────────────────────

/// One scalar variable in the solve (e.g. point.x, point.y, circle.r, group.theta).
#[derive(Debug, Clone)]
pub struct ScalarVarNode {
    pub col: usize,
    pub entity_id: String,
    pub kind: ScalarVarKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScalarVarKind {
    PointX,
    PointY,
    CircleRadius,
    ArcRadius,
    GroupX,
    GroupY,
    GroupTheta,
}

/// One scalar residual row.
#[derive(Debug, Clone)]
pub struct ResidualRowNode {
    pub row: usize,
    /// Index into the constraint array (None for arc consistency rows).
    pub constraint_idx: Option<usize>,
    /// Which scalar row within the constraint (0-based).
    pub local_row: usize,
}

/// A block produced by SCC extraction on the directed dependency graph.
#[derive(Debug, Clone)]
pub struct SccBlock {
    pub id: usize,
    /// Variable column indices in this block.
    pub vars: Vec<usize>,
    /// Residual row indices in this block.
    pub rows: Vec<usize>,
}

/// The solve DAG: blocks in topological order with dependency edges.
#[derive(Debug, Clone)]
pub struct SolveDag {
    /// Blocks in topological order (upstream first).
    pub blocks: Vec<SccBlock>,
    /// Edges: (from_block_id, to_block_id) — "from" must be solved before "to".
    pub edges: Vec<(usize, usize)>,
}

// ─── Bipartite graph ─────────────────────────────────────────────────────────

/// Bipartite adjacency: row i depends on variables `row_adj[i]`.
pub struct BipartiteGraph {
    pub n_rows: usize,
    pub n_vars: usize,
    /// For each row: which variable columns it structurally depends on.
    pub row_to_vars: Vec<Vec<usize>>,
    /// For each var: which rows depend on it (inverse of row_to_vars).
    pub var_to_rows: Vec<Vec<usize>>,
}

/// Build the bipartite graph from constraint-to-variable mappings.
///
/// `constraint_var_sets[ci]` = sorted, deduped variable column indices for constraint `ci`.
/// `constraint_row_ranges[ci]` = (start_row, row_count) for constraint `ci`.
/// `arc_var_sets[ai]` = variable column indices for arc `ai`.
/// `arc_row_start` = first row index for arc consistency rows.
/// `n_vars` = total number of scalar variables.
pub fn build_bipartite_graph(
    n_vars: usize,
    constraint_var_sets: &[Vec<usize>],
    constraint_row_ranges: &[(usize, usize)],
    arc_var_sets: &[Vec<usize>],
    arc_row_start: usize,
) -> BipartiteGraph {
    let n_arcs = arc_var_sets.len();
    let total_rows = arc_row_start + n_arcs * 2;

    let mut row_to_vars: Vec<Vec<usize>> = vec![Vec::new(); total_rows];
    let mut var_to_rows: Vec<Vec<usize>> = vec![Vec::new(); n_vars];

    // Constraint residual rows.
    for (ci, var_set) in constraint_var_sets.iter().enumerate() {
        let (start, count) = constraint_row_ranges[ci];
        for row in start..start + count {
            row_to_vars[row] = var_set.clone();
            for &vi in var_set {
                var_to_rows[vi].push(row);
            }
        }
    }

    // Arc consistency rows (2 per arc).
    for (ai, var_set) in arc_var_sets.iter().enumerate() {
        let row0 = arc_row_start + ai * 2;
        let row1 = row0 + 1;
        for &row in &[row0, row1] {
            row_to_vars[row] = var_set.clone();
            for &vi in var_set {
                var_to_rows[vi].push(row);
            }
        }
    }

    // Dedup var_to_rows.
    for rows in var_to_rows.iter_mut() {
        rows.sort();
        rows.dedup();
    }

    BipartiteGraph {
        n_rows: total_rows,
        n_vars,
        row_to_vars,
        var_to_rows,
    }
}

// ─── Maximum bipartite matching (Hopcroft-Karp) ──────────────────────────────

/// Result of bipartite matching.
pub struct Matching {
    /// For each row: which variable it is matched to (None if unmatched).
    pub row_to_var: Vec<Option<usize>>,
    /// For each var: which row it is matched to (None if unmatched).
    pub var_to_row: Vec<Option<usize>>,
}

/// Hopcroft-Karp maximum bipartite matching.
/// Left side = rows, right side = vars.
pub fn hopcroft_karp(graph: &BipartiteGraph) -> Matching {
    let n_rows = graph.n_rows;
    let n_vars = graph.n_vars;
    let nil = usize::MAX;

    let mut pair_row: Vec<usize> = vec![nil; n_rows]; // row → matched var (nil if free)
    let mut pair_var: Vec<usize> = vec![nil; n_vars]; // var → matched row (nil if free)
    let mut dist: Vec<usize> = vec![0; n_rows + 1]; // BFS distance layers

    // BFS: find shortest augmenting path layers.
    let bfs = |pair_row: &[usize], pair_var: &[usize], dist: &mut [usize]| -> bool {
        let mut queue: std::collections::VecDeque<usize> = std::collections::VecDeque::new();
        for r in 0..n_rows {
            if pair_row[r] == nil {
                dist[r] = 0;
                queue.push_back(r);
            } else {
                dist[r] = usize::MAX;
            }
        }
        dist[n_rows] = usize::MAX; // sentinel for "nil" node

        let mut found = false;
        while let Some(r) = queue.pop_front() {
            if dist[r] < dist[n_rows] {
                for &v in &graph.row_to_vars[r] {
                    let next_r = pair_var[v];
                    let next_idx = if next_r == nil { n_rows } else { next_r };
                    if dist[next_idx] == usize::MAX {
                        dist[next_idx] = dist[r] + 1;
                        if next_idx == n_rows {
                            found = true;
                        } else {
                            queue.push_back(next_idx);
                        }
                    }
                }
            }
        }
        found
    };

    // DFS: find augmenting path from free row r.
    fn dfs(
        r: usize,
        graph: &BipartiteGraph,
        pair_row: &mut [usize],
        pair_var: &mut [usize],
        dist: &mut [usize],
        nil: usize,
        n_rows: usize,
    ) -> bool {
        if r == n_rows {
            return true; // reached the nil sentinel → augmenting path found
        }
        for &v in &graph.row_to_vars[r] {
            let next_r = pair_var[v];
            let next_idx = if next_r == nil { n_rows } else { next_r };
            if dist[next_idx] == dist[r] + 1 {
                if dfs(next_idx, graph, pair_row, pair_var, dist, nil, n_rows) {
                    pair_var[v] = r;
                    pair_row[r] = v;
                    return true;
                }
            }
        }
        dist[r] = usize::MAX; // remove r from layered graph
        false
    }

    while bfs(&pair_row, &pair_var, &mut dist) {
        for r in 0..n_rows {
            if pair_row[r] == nil {
                dfs(r, graph, &mut pair_row, &mut pair_var, &mut dist, nil, n_rows);
            }
        }
    }

    let row_to_var: Vec<Option<usize>> = pair_row
        .iter()
        .map(|&v| if v == nil { None } else { Some(v) })
        .collect();
    let var_to_row: Vec<Option<usize>> = pair_var
        .iter()
        .map(|&r| if r == nil { None } else { Some(r) })
        .collect();

    Matching { row_to_var, var_to_row }
}

// ─── Directed graph + SCC ────────────────────────────────────────────────────

/// Build the directed dependency graph from the matching.
///
/// Nodes are composite: we interleave row-nodes and var-nodes in a single index space.
///   node(row r) = r
///   node(var v) = n_rows + v
///
/// Edges:
///   matched edge:    row r → var v  (row r "determines" var v)
///   unmatched edge:  var v → row r  (var v "feeds into" row r)
///
/// This encodes information flow: matched rows determine their matched vars;
/// unmatched structural edges show which vars feed which other rows.
fn build_directed_graph(
    graph: &BipartiteGraph,
    matching: &Matching,
) -> (usize, Vec<Vec<usize>>) {
    let n_rows = graph.n_rows;
    let n_vars = graph.n_vars;
    let n_nodes = n_rows + n_vars;
    let mut adj: Vec<Vec<usize>> = vec![Vec::new(); n_nodes];

    for (r, vars) in graph.row_to_vars.iter().enumerate() {
        for &v in vars {
            if matching.row_to_var[r] == Some(v) {
                // Matched edge: row → var (row determines var).
                adj[r].push(n_rows + v);
            } else {
                // Unmatched structural edge: var → row (var feeds row).
                adj[n_rows + v].push(r);
            }
        }
    }

    (n_nodes, adj)
}

/// Tarjan's SCC algorithm.
fn tarjan_scc(n_nodes: usize, adj: &[Vec<usize>]) -> Vec<Vec<usize>> {
    struct State {
        index_counter: usize,
        stack: Vec<usize>,
        on_stack: Vec<bool>,
        index: Vec<Option<usize>>,
        lowlink: Vec<usize>,
        sccs: Vec<Vec<usize>>,
    }

    fn strongconnect(v: usize, adj: &[Vec<usize>], state: &mut State) {
        state.index[v] = Some(state.index_counter);
        state.lowlink[v] = state.index_counter;
        state.index_counter += 1;
        state.stack.push(v);
        state.on_stack[v] = true;

        for &w in &adj[v] {
            if state.index[w].is_none() {
                strongconnect(w, adj, state);
                state.lowlink[v] = state.lowlink[v].min(state.lowlink[w]);
            } else if state.on_stack[w] {
                state.lowlink[v] = state.lowlink[v].min(state.index[w].unwrap());
            }
        }

        if state.lowlink[v] == state.index[v].unwrap() {
            let mut scc = Vec::new();
            loop {
                let w = state.stack.pop().unwrap();
                state.on_stack[w] = false;
                scc.push(w);
                if w == v {
                    break;
                }
            }
            state.sccs.push(scc);
        }
    }

    let mut state = State {
        index_counter: 0,
        stack: Vec::new(),
        on_stack: vec![false; n_nodes],
        index: vec![None; n_nodes],
        lowlink: vec![0; n_nodes],
        sccs: Vec::new(),
    };

    for v in 0..n_nodes {
        if state.index[v].is_none() {
            strongconnect(v, adj, &mut state);
        }
    }

    state.sccs
}

// ─── Solve DAG construction ──────────────────────────────────────────────────

/// Build the solve DAG from the bipartite graph.
///
/// Returns a `SolveDag` where blocks are in topological order (upstream first).
/// Each block contains the variable columns and residual rows that form a
/// strongly-connected component in the directed dependency graph.
pub fn build_solve_dag(graph: &BipartiteGraph, matching: &Matching) -> SolveDag {
    let n_rows = graph.n_rows;

    // Build directed graph.
    let (n_nodes, adj) = build_directed_graph(graph, matching);

    // Run Tarjan SCC (returns SCCs in reverse topological order).
    let raw_sccs = tarjan_scc(n_nodes, &adj);

    // Extract variable/row indices per SCC and filter out empty blocks.
    let mut blocks: Vec<SccBlock> = Vec::new();
    // Map each node to its block id.
    let mut node_to_block: Vec<Option<usize>> = vec![None; n_nodes];

    for scc in &raw_sccs {
        let mut vars: Vec<usize> = Vec::new();
        let mut rows: Vec<usize> = Vec::new();

        for &node in scc {
            if node < n_rows {
                rows.push(node);
            } else {
                vars.push(node - n_rows);
            }
        }

        // Only keep blocks that have at least one variable or one row.
        if vars.is_empty() && rows.is_empty() {
            continue;
        }

        let block_id = blocks.len();
        for &node in scc {
            node_to_block[node] = Some(block_id);
        }

        vars.sort();
        rows.sort();

        blocks.push(SccBlock {
            id: block_id,
            vars,
            rows,
        });
    }

    // Build inter-block edges from the directed graph.
    let mut edge_set: std::collections::HashSet<(usize, usize)> = std::collections::HashSet::new();
    for (from_node, neighbors) in adj.iter().enumerate() {
        let Some(from_block) = node_to_block[from_node] else { continue };
        for &to_node in neighbors {
            let Some(to_block) = node_to_block[to_node] else { continue };
            if from_block != to_block {
                edge_set.insert((from_block, to_block));
            }
        }
    }
    let edges: Vec<(usize, usize)> = edge_set.into_iter().collect();

    // Tarjan returns SCCs in reverse topological order. We reversed nothing,
    // so blocks are currently in reverse topo order. Reverse for upstream-first.
    // But we need to remap block IDs too.
    let n_blocks = blocks.len();
    blocks.reverse();
    // Remap block IDs: old_id → new_id = n_blocks - 1 - old_id.
    for (new_id, block) in blocks.iter_mut().enumerate() {
        block.id = new_id;
    }
    let remap = |old: usize| n_blocks - 1 - old;
    let edges: Vec<(usize, usize)> = edges
        .into_iter()
        .map(|(a, b)| (remap(a), remap(b)))
        .collect();

    let mut dag = SolveDag { blocks, edges };

    // Post-process: merge "driver" blocks (vars but no rows) into their
    // first downstream block. Driver variables are under-determined by the
    // matching — they have no row of their own but structurally appear in
    // downstream blocks' constraints. Solving them separately (with 0
    // constraints) does nothing; they must be free variables in the downstream
    // block's LM solve.
    merge_driver_blocks(&mut dag);

    dag
}

/// Merge driver blocks (blocks with vars but no rows) into their first
/// downstream dependent. This gives the downstream LM solve access to the
/// driver's DOFs so it can move them to minimize its residuals.
fn merge_driver_blocks(dag: &mut SolveDag) {
    if dag.blocks.is_empty() {
        return;
    }

    // Build forward adjacency from edges.
    let n = dag.blocks.len();
    let mut successors: Vec<Vec<usize>> = vec![Vec::new(); n];
    for &(from, to) in &dag.edges {
        if from < n && to < n {
            successors[from].push(to);
        }
    }

    // Identify driver blocks and their merge targets.
    let mut merge_into: Vec<Option<usize>> = vec![None; n]; // driver_id → target_id
    for (i, block) in dag.blocks.iter().enumerate() {
        if !block.vars.is_empty() && block.rows.is_empty() {
            // Find the first downstream block with rows.
            if let Some(&target) = successors[i].iter().find(|&&s| !dag.blocks[s].rows.is_empty()) {
                merge_into[i] = Some(target);
            } else if let Some(&target) = successors[i].first() {
                // If no immediate successor has rows, merge into first successor anyway.
                merge_into[i] = Some(target);
            }
        }
    }

    // Apply merges: move vars from driver blocks into their targets.
    for driver_id in 0..n {
        if let Some(target_id) = merge_into[driver_id] {
            let driver_vars: Vec<usize> = dag.blocks[driver_id].vars.clone();
            dag.blocks[target_id].vars.extend(driver_vars);
            dag.blocks[target_id].vars.sort();
            dag.blocks[target_id].vars.dedup();
            dag.blocks[driver_id].vars.clear();
        }
    }

    // Remove now-empty blocks and rebuild edges.
    let old_blocks = std::mem::take(&mut dag.blocks);
    let mut old_to_new: Vec<Option<usize>> = vec![None; old_blocks.len()];
    let mut new_blocks: Vec<SccBlock> = Vec::new();

    for (old_id, block) in old_blocks.into_iter().enumerate() {
        if block.vars.is_empty() && block.rows.is_empty() {
            continue;
        }
        let new_id = new_blocks.len();
        old_to_new[old_id] = Some(new_id);
        new_blocks.push(SccBlock {
            id: new_id,
            vars: block.vars,
            rows: block.rows,
        });
    }

    // Remap edges.
    let mut new_edge_set: std::collections::HashSet<(usize, usize)> = std::collections::HashSet::new();
    for &(from, to) in &dag.edges {
        if let (Some(nf), Some(nt)) = (old_to_new[from], old_to_new[to]) {
            if nf != nt {
                new_edge_set.insert((nf, nt));
            }
        }
    }
    // Also add edges from merged drivers' predecessors to the merge target.
    for driver_id in 0..merge_into.len() {
        if let Some(target_id) = merge_into[driver_id] {
            if let Some(new_target) = old_to_new[target_id] {
                for &(from, to) in &dag.edges {
                    if to == driver_id {
                        if let Some(nf) = old_to_new[from] {
                            if nf != new_target {
                                new_edge_set.insert((nf, new_target));
                            }
                        }
                    }
                }
            }
        }
    }

    dag.blocks = new_blocks;
    dag.edges = new_edge_set.into_iter().collect();
}

// ─── Convenience: full pipeline ──────────────────────────────────────────────

/// Build the complete solve DAG from constraint/variable structure.
///
/// This is the main entry point for the graph decomposition layer.
pub fn decompose_to_solve_dag(
    n_vars: usize,
    constraint_var_sets: &[Vec<usize>],
    constraint_row_ranges: &[(usize, usize)],
    arc_var_sets: &[Vec<usize>],
    arc_row_start: usize,
) -> SolveDag {
    let graph = build_bipartite_graph(
        n_vars,
        constraint_var_sets,
        constraint_row_ranges,
        arc_var_sets,
        arc_row_start,
    );
    let matching = hopcroft_karp(&graph);
    build_solve_dag(&graph, &matching)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_independent_constraints_produce_two_blocks() {
        // Two constraints, each on separate variables, no shared vars.
        // Constraint 0: row 0 depends on var 0
        // Constraint 1: row 1 depends on var 1
        let dag = decompose_to_solve_dag(
            2,
            &[vec![0], vec![1]],
            &[(0, 1), (1, 1)],
            &[],
            2,
        );
        // Should produce 2 blocks (one per independent constraint).
        assert!(dag.blocks.len() >= 2, "expected >=2 blocks, got {}", dag.blocks.len());
    }

    #[test]
    fn coupled_constraints_produce_single_block() {
        // Two constraints sharing the same two variables → one coupled block.
        // Constraint 0: row 0 depends on vars 0,1
        // Constraint 1: row 1 depends on vars 0,1
        let dag = decompose_to_solve_dag(
            2,
            &[vec![0, 1], vec![0, 1]],
            &[(0, 1), (1, 1)],
            &[],
            2,
        );
        // All vars and rows should be in one block.
        let big_blocks: Vec<_> = dag.blocks.iter().filter(|b| !b.vars.is_empty()).collect();
        assert_eq!(big_blocks.len(), 1, "expected 1 coupled block, got {}", big_blocks.len());
        assert_eq!(big_blocks[0].vars.len(), 2);
        assert_eq!(big_blocks[0].rows.len(), 2);
    }

    #[test]
    fn chain_produces_ordered_blocks() {
        // Chain: var0 → constraint0 → var1 → constraint1 → var2
        // Constraint 0: row 0 depends on var 0, var 1
        // Constraint 1: row 1 depends on var 1, var 2
        // (var 0 is a "driver" if unmatched)
        let dag = decompose_to_solve_dag(
            3,
            &[vec![0, 1], vec![1, 2]],
            &[(0, 1), (1, 1)],
            &[],
            2,
        );
        // Should have multiple blocks with a topological order.
        assert!(dag.blocks.len() >= 2, "expected >=2 blocks in chain, got {}", dag.blocks.len());
    }

    #[test]
    fn empty_system() {
        let dag = decompose_to_solve_dag(0, &[], &[], &[], 0);
        assert!(dag.blocks.is_empty());
        assert!(dag.edges.is_empty());
    }

    #[test]
    fn matching_correctness() {
        // Simple 2×2 perfect matching.
        let graph = build_bipartite_graph(
            2,
            &[vec![0], vec![1]],
            &[(0, 1), (1, 1)],
            &[],
            2,
        );
        let matching = hopcroft_karp(&graph);
        assert_eq!(matching.row_to_var[0], Some(0));
        assert_eq!(matching.row_to_var[1], Some(1));
        assert_eq!(matching.var_to_row[0], Some(0));
        assert_eq!(matching.var_to_row[1], Some(1));
    }

    #[test]
    fn matching_overconstrained() {
        // 3 rows, 2 vars → one row must be unmatched.
        let graph = build_bipartite_graph(
            2,
            &[vec![0], vec![1], vec![0, 1]],
            &[(0, 1), (1, 1), (2, 1)],
            &[],
            3,
        );
        let matching = hopcroft_karp(&graph);
        let matched_rows = matching.row_to_var.iter().filter(|r| r.is_some()).count();
        assert_eq!(matched_rows, 2, "should match 2 of 3 rows");
        let matched_vars = matching.var_to_row.iter().filter(|v| v.is_some()).count();
        assert_eq!(matched_vars, 2, "both vars should be matched");
    }
}
