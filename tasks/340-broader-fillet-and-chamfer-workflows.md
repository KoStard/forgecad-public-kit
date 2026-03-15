# Broader Fillet And Chamfer Workflows
## Problem Definition
Forge has a defended tracked-edge finishing subset, but real part work quickly runs into post-rewrite edges, created edge chains, and repeated finishing workflows. Without stronger descendant ownership, finishing support stays brittle.

## Description
Extend finishing support from the initial defended edge-query subset into broader downstream part workflows while keeping the contract explicit.

Primary dependencies:

- task 300

Primary files:

- `src/forge/edgeFeatureResolution.ts`
- edge query / descendant helpers
- compile lowerers and diagnostics
- finishing regression corpus cases

## Requirements
- Support defended post-rewrite edge chains instead of only pre-rewrite tracked edges.
- Preserve enough created-face and created-edge ownership that follow-on feature queries remain meaningful after finishing in the defended subset.
- Reject unsupported merged or ambiguous edge situations explicitly with compiler diagnostics.
- Add regression parts that chain shell, holes/cuts, booleans, and finishing together.
- Keep the public feature ergonomics pleasant: developers should not need backend-specific edge names to reach a specific finished edge set.

## Status and log
- 2026-03-13: Blocked on task 300.
- 2026-03-13: Not started.
- 2026-03-15: Completed.
  - Added `buildHoleCutEdgePropagation` in `queryPropagation.ts`: uses vertical-edge/face adjacency to classify each of the four canonical vertical edges as preserved (supported) or ambiguous after `hole()` and `cutout()` rewrites.
  - Updated `buildShellTopologyRewritePropagation` to emit per-edge preserved/ambiguous entries for vertical edges not adjacent to the open face, replacing the blanket diagnostic.
  - Fillet/chamfer propagation carries surviving vertical edges through subsequent hole, cut, shell, and boolean-union chains via `buildEdgeFeatureTopologyRewritePropagation` + the existing boolean `collectEdgeSeeds` path.
  - Updated `defaultUnsupportedReasonForRewrite` fallback messages for `hole`, `cut`, and `shell` to give actionable diagnostics.
  - Added `examples/compiler-corpus/post-rewrite-edge-finish.forge.js` with four workflow sections: hole→fillet/chamfer, cut→chamfer/fillet, shell→fillet/chamfer, and hole+boolean→fillet.
  - Updated `examples/compiler-corpus/README.md` with coverage entry and guards description.
