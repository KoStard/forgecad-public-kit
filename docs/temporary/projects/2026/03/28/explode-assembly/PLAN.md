# Explode Assembly — Realistic Disassembly

## Goal

Transform explode from "parts float apart radially" into **realistic disassembly animation** — bolts unscrew along their axis, hinged covers swing open, subassemblies slide apart in sequence. When done, the explode slider + auto-animation should produce video-worthy disassembly visualizations.

## Workstreams

### WS1: Joint-Aware Explode Directions
**Deliverable**: Parts separate along their joint axis instead of radially from bounding box center.
**Dependencies**: none
**Status**: not started

When an assembly has joints, auto-inject `explodeView({ byName })` directives using joint axis data from `solve()`. Revolute joints → separation along hinge axis. Prismatic → along slide axis.

Tasks:
- [ ] In `Assembly.solve()`, after kinematic DFS, derive explode direction from each joint's world-space axis
- [ ] Auto-inject `explodeView({ byName })` with joint-derived directions (like mate hints already do)
- [ ] Verify with robot arm example — parts should separate along their rotation axes

### WS2: Topological Staging
**Deliverable**: Leaf parts (outermost) explode first/most; root parts stay anchored.
**Dependencies**: none
**Status**: not started

Current staging uses `1/depth` which makes depth-1 parts move most. For disassembly, we want the reverse — leaves move most, roots stay put. Plus the assembly joint tree defines the real hierarchy.

Tasks:
- [ ] Add `autoStaging` option to `ExplodeViewOptions` that derives per-part stages from joint tree depth
- [ ] Leaves get stage=1.0, progressively smaller toward root; root gets stage=0 (anchored)
- [ ] Auto-enable when assembly has joints and no explicit stages are set

### WS3: Fastener Heuristics
**Deliverable**: Parts named bolt/screw/nut/washer auto-get axis-lock and early separation.
**Dependencies**: WS1
**Status**: not started

Tasks:
- [ ] Detect fastener parts by name pattern (bolt, screw, nut, washer, pin, rivet — case insensitive)
- [ ] Auto axis-lock fasteners to their joint axis direction
- [ ] Give fasteners higher stage multiplier so they "come out first"

### WS4: Auto Disassembly Animation
**Deliverable**: Assembly auto-generates a `jointsView` animation clip that sequences disassembly steps.
**Dependencies**: WS1, WS2
**Status**: not started

This is the wow feature. Instead of just a slider pushing parts apart, generate a **timeline animation** where parts detach in sequence — bolts first, then covers, then subassemblies.

Tasks:
- [ ] Add `toDisassemblyAnimation()` method to Assembly (or option on `toJointsView`)
- [ ] Compute reverse topological order of joint tree
- [ ] Generate keyframes: each part gets a time window where it separates
- [ ] Use "explode joints" — synthetic prismatic joints along the explode direction for each part
- [ ] Wire into existing `jointsView` animation system
- [ ] Verify animation plays in viewport with scrubber

### WS5: Rotation During Explode
**Deliverable**: Revolute joints swing open during disassembly; fasteners rotate while withdrawing.
**Dependencies**: WS4
**Status**: not started

Tasks:
- [ ] For revolute joints: during disassembly, rotate part to max angle before separating
- [ ] For fastener-like parts: add helical motion (rotate while translating = unscrewing)
- [ ] Combine rotation keyframes with translation keyframes in the animation clip

### WS6: Demo Model
**Deliverable**: A showcase assembly model that demonstrates all features for video recording.
**Dependencies**: WS1-WS5
**Status**: not started

Tasks:
- [ ] Build a multi-part assembly with hinges, bolts, sliding parts, and subassemblies
- [ ] Verify explode slider produces realistic disassembly
- [ ] Verify animation clip plays a cinematic disassembly sequence

## Dependency Map

```
WS1 (joint directions) ──┬──→ WS3 (fastener heuristics)
                          │
WS2 (topo staging) ──────┼──→ WS4 (disassembly animation)
                          │
                          └──→ WS5 (rotation during explode)
                                │
WS1-WS5 ─────────────────────→ WS6 (demo model)
```

## Progress Tracker

| Workstream | Status | Milestone | Notes |
|------------|--------|-----------|-------|
| WS1: Joint directions | done | Auto-injected in solve() | Joint axis → explode direction |
| WS2: Topo staging | done | Merged with WS1 | Depth-based stage = childDepth/maxDepth |
| WS3: Fastener heuristics | done | Merged with WS1 | Pattern match → stage 1.2 + axis lock |
| WS4: Disassembly animation | done | toDisassemblyView() | Reverse topo order keyframes |
| WS5: Rotation during explode | done | Merged with WS4 | Swing + unscrew in animation |
| WS6: Demo model | done | assembly-disassembly.forge.js | Enclosure with lid, drawer, bolts, motor |

## Decision Log

| # | Decision | Why | Impact |
|---|----------|-----|--------|
| D1 | Implement via `explodeView` auto-injection rather than changing explode core | Keeps the explode core simple; assembly-specific logic stays in assembly.ts | WS1-WS3 are pure data injection |
| D2 | Use synthetic "explode joints" for disassembly animation | Reuses existing jointsView animation infrastructure entirely | WS4 avoids a new animation system |
| D3 | Build on `toJointsView()` rather than a separate system | The animation playback, scrubber, timeline — all exist already | WS4-WS5 are mostly keyframe generation |
| D4 | No synthetic separation joints — use explode for translation, joints for rotation | Viewer's `byChild` map allows only one joint per child. Two systems compose naturally via matrix multiply | Simpler, more correct approach |

## Files Modified

| File | Workstream | Purpose |
|------|------------|---------|
| `src/forge/assembly/assembly.ts` | WS1-WS5 | Joint-derived explode hints, disassembly animation |
| `src/forge/assembly/explodeCore.ts` | WS2 | Topo staging support |
| `src/forge/assembly/explodeView.ts` | WS2 | Auto staging option |
| `examples/api/explode-disassembly.forge.js` | WS6 | Demo model |
