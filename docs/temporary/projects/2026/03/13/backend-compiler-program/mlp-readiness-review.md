# MLP Readiness Review

Date: 2026-03-12

## Verdict

The MLP closeout is landed for the defended compiler-owned subset.

That means:

- one Forge script can preview through Manifold and export through CadQuery/OCCT for the curated supported subset
- the repo now proves that claim with corpus parts, compiler snapshots, query-propagation snapshots, and exact STEP/BREP checks
- the larger checkpoint is still not done, so this is not a license to claim broad mainstream part-design parity yet

## Review Surface

Use these together when reviewing the current MLP state:

1. `npm run test:compiler`
   - compiler snapshots, runtime-vs-lowered parity, route integrity, full corpus coverage
2. `npm run test:query-propagation`
   - focused rewrite/query semantics, defended created-face slots, explicit ambiguity and unsupported diagnostics
3. `npm run test:brep`
   - exact-plan assertions plus end-to-end STEP export through the CadQuery/OCCT lowerer
4. `examples/compiler-corpus/README.md`
   - the curated ordinary-parts map for what each part is meant to guard
5. `docs/permanent/API/internals/compiler.md` and `docs/permanent/API/output/brep-export.md`
   - the durable source of truth for the supported subset and its explicit limits

## What The Repo Now Proves

The current proof surface includes ordinary multi-feature parts that keep these families inside compiler ownership for the defended subset:

- `shell()` inside enclosure-style boolean workflows
- compiler-owned hole/cut workflows including counterbores, countersinks, and planar `upToFace` extents
- broader `projectToPlane()` replay from compatible shell/hole/cut/union sources
- broader tracked-edge fillet/chamfer on defended propagated vertical edges
- repeated mirror/pattern ownership inside later boolean chains
- `trimByPlane()` created-face reviewability inside ordinary cover workflows

The curated corpus now spans:

- enclosures
- motor-mount and fastener plates
- brackets
- edge-finished mounts
- projection-driven covers
- trimmed covers
- service covers that combine repeated bosses, richer hole/cut details, and projection replay

## What Still Blocks The Larger Checkpoint

The next checkpoint is still blocked by the same hard problems the MLP was meant to surface honestly:

- durable face and edge identity after topology-changing edits is still not solved
- hole/cut coverage is still intentionally narrow beyond today's defended circular plus planar `upToFace` subset
- projection replay still rejects broader silhouette-changing sources and non-parallel target bases
- fillet/chamfer support is still limited to defended propagated vertical-edge cases
- the exact CadQuery/OCCT path is still export-first, not a second interactive runtime backend

Short version:

- MLP: yes, for the defended subset
- full checkpoint: no, not until durable downstream identity and broader ordinary part coverage are both real
