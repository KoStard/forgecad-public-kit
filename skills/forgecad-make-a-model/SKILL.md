---
name: forgecad-make-a-model
description: Create manufacture-realistic prototype ForgeCAD (.forge.js) models in the active CAD project. Handles file placement, invokes the forgecad skill for API guidance, and validates the result.
forgecad-public: true
---

# Make a Model

Create new ForgeCAD models in the user's active ForgeCAD project.

## Default Output Standard

Unless the user asks otherwise, the output is a **manufacture-realistic prototype**: a model someone could fabricate, buy parts for, assemble, inspect, and iterate in a real shop — not a concept sketch, not a universal 3D-printing exercise, not a claim of certified production readiness.

- Include prototype-real features: wall thickness, fastener stacks, bosses, ribs, flanges, seats, gaskets, cable exits, service access, toleranced clearances, believable purchased parts. No invented tooling details, certifications, or safety ratings unless asked.
- Modifiers shift the standard: `blockout` → rough massing; `production-realistic` → DFM and production-intent materials; `printable` → make the selected printed parts honest; `visual-CAD` → clearly visual, not pretending build-ready.
- Zero unexpected final collisions is part of the definition of done (see Collision Policy).

## File Placement

New `.forge.js` files go under date-based directories (today's date) in the user's current ForgeCAD project or a clearly named local folder:

```
YYYY/MM/DD/file.forge.js           — single-file model
YYYY/MM/DD/folder/main.forge.js    — multi-file entry point (always main.forge.js)
YYYY/MM/DD/folder/parts/*.forge.js — standalone/importable parts
YYYY/MM/DD/folder/lib/*.js         — pure helpers/constants, no geometry
```

- Kebab-case descriptive names (`parametric-lego.forge.js`). Each part file must run standalone and import via `require('./parts/name.forge.js', params)`.
- Plain `.js` only for constants, math, tables, formatting — never geometry.
- Split files only for reusable parts or independent sub-assemblies, never for organization.

## Workflow

1. **Load the `forgecad` skill** — read at least the Core API reference. Moving parts: also the assembly group and joint-design guide. Mating parts: the positioning guide; default to connectors + `matchTo()`.
2. `mkdir -p YYYY/MM/DD/[folder]`.
3. Moving parts: prove the rig first (Kinematics-First below).
4. Write the model — `param()`/`Param.bool()` for tunable dimensions; pick the manufacturing process before styling; build real internals; follow the contracts below.
5. Validate — `forgecad run <file>` (`main.forge.js` for multi-file).
6. Run the Final Acceptance Gate and Manufacturing Outputs checks below on `main.forge.js`.
7. Iterate — convert every render/inspect finding into a model edit and rerun the same targeted evidence until reality matches the intended component graph.

## Process, Style, and Variants

**Manufacturing process is a choice, not an assumption.** Never treat every model as printable. Pick process cues from the load path and operating story: machined, bent sheet, tube-and-plate, wood/composite, molded-look, printed, or hybrid purchased-hardware construction (rideables: metal/composite structure + purchased wheels/bearings; furniture: real joinery). Print-specific features (slicer clearances, heat-set inserts, layer-oriented ribs) only when the process includes printed parts.

**Visual style: expensive and credible, not generically colorful.** Restrained material-driven palette (ivory, charcoal, satin black, brushed aluminum, brass, muted burgundy/green/navy, smoked polymer, natural wood); match color to material/process so metal, polymer, rubber, PCB, and wood read differently. Bright color only as small accents (controls, seals, indicators). Keep seams, fasteners, gaskets, and purchased parts legible.

**Form is part of credibility.** Real products carry deliberate edge treatment — chamfered or rounded profiles where hands, seals, or tooling meet the part, draft on molded faces, consistent proportions and design language across parts. A knife-sharp box reads as a blockout, not a product. Get the rounding from profile-level geometry (rounded sketch corners, chamfered profiles) per the fillet caveat below.

**Variants are parameter-selected.** Sizes/styles/revisions go behind one choice parameter (`Variant`, `Preset`); return only the selected variant. Comparison lineups only behind an explicit debug parameter so they can never pollute collision findings.

## Physical Artifact, Not Teaching Diagram

Deliver the real closed artifact — covers installed, parts in assembled positions. The `forgecad` skill carries the no-labels/no-cutaway rule (no explanatory labels, arrows, or legends in production geometry; never a cutaway, sectioned, or exploded default); it binds here. Markings only when the real artifact has them (serial plates, gauge ticks, molded icons) — sparse, process-appropriate. Explain roles via named return objects and `verify.*`; review annotations go in `Viewport.label()` or a debug mode, never exported geometry.

**Internal geometry is part of the model.** If the real artifact has internals, model them as real geometry even when hidden: cavities, ribs, bosses, screw holes, bearing seats, electronics/battery volumes, wire channels, mechanism clearances and stops. Verify hidden structure with exploration tools — alternate views, `inspect sections`, `--hide`, transparent shells, named ghosts — never by mutilating the returned model.

## Kinematics-First for Moving Parts

For any mechanism (linkage, hinge, slider, suspension, gripper, drawer), the rig is the source of truth: build and prove the motion structure first, then attach geometry — never retrofit motion onto finished shells.

- Pick the rig shape before geometry: point-link graphs for closed-loop skeletons with distance/angle constraints; frames and connector joints when part orientation matters (API roster in the assembly docs).
- Name every degree of freedom; encode limits/defaults at rig level. Mirrored revolute axes need an explicit sign mapping — equal joint values do not automatically mirror poses.
- Attach proxy geometry only (pivot markers, bars, slider blocks, wheel discs). Run the rig at rest, mid-travel, both limits, and mirrored/coupled poses until the solver, controls, connector alignment, and `verify.*` checks all pass:

  ```bash
  forgecad run model.forge.js --joint "theta=45"
  forgecad render 3d model.forge.js /tmp/theta-45.png --joint "theta=45" --camera iso
  ```

  Use real joint names; repeat `--joint` per control. A pose that fails to solve, clamps unexpectedly, breaks a connector check, or adds a collision means the rig is not ready for final geometry.
- Only then attach manufacture-real geometry to the solved links, frames, and connectors — never via a final `rotate()` that makes one pose look assembled.
- Return the unsolved `Assembly` so Motion controls re-run the real solve. Never bake a posed `SolvedAssembly` to make one pose look right.
- Encode pose checks in-script with `verify.*`: convergence, connector origins coinciding, link lengths holding, end effectors reaching targets, running clearances positive.

## Mechanical Assembly Contract

A mechanical script is not done when it merely looks assembled. Every visible piece needs a physical reason to be where it is: fused material, contact faces, a screw stack, a pin in a bore, a tab in a slot, a gasket on a land, a bearing in a seat, a cable in a channel, or a named intentional ghost.

- Bespoke fixed assemblies: build each part in local coordinates, pick one root, place every touching part with `matchTo()`, verify each mate with `verify.connectorDistance`. Final `translate()` calls are not assembly contracts.
- Manual joint frames (`addFixed`/`addRevolute`/`addPrismatic` with a hand-built `frame:`) are scaffolding, not contracts. Before delivery, convert mating interfaces to connectors with `connect()`/`match()`, or prove the manual joint with `forgecad debug assembly --fail-on warning` and documented geometry.
- A named part must not contain unintentional disconnected bodies: boolean-join manufactured features, model fasteners/seals as separate named parts, or add the receiving holes/lands that explain the separation.
- Screws are not decoration: clearance/counterbore in the cover, receiving boss or through stack in the parent, material around both, axes aligned from one shared bolt pattern.
- Handles and levers need a load path: hub-to-arm neck, pivot pin/bore, thrust shoulders, stops/detents, and the connected follower. A handle tangent to a hub is a failed mechanism.
- Covers, doors, cartridges, service panels need seats: ledges, gasket grooves, bosses, snap hooks, tabs, or hinge barrels — plus a visible retention story.
- Cables, wires, tubes need receiving geometry: gland, grommet, clamp, socket, ferrule, routed channel, or hose barb. Never let a cylinder end in open space.
- Purchased loose parts may stay separate bodies — name them as purchased hardware/consumables and seat them in believable sockets, bores, races, or fastener stacks.
- Encode interface intent with `verify.*`, not comments: `verify.clearanceBetween` for seated fits and clearance bands, `verify.minClearance`/`verify.notColliding` for keep-out and running gaps, `verify.connectorDistance` for connector mates. Part counts and generic dimensions never prove an interface.
- No canned finished-object helpers for project-specific assemblies. Reusable vocabulary is primitives, cutters, patterns, and mechanical contracts (`lib.fastenerSet()`, `lib.boltPattern()`, real bores and pockets, connectors + `matchTo()`) — not finished backplates, brackets, or hinge leaves.

Treat `fillet()`/`chamfer()` as experimental (Manifold can be incorrect, OCCT slow); prefer profile-level rounding and inspect before relying on the result.

## Imported Parts (User-Supplied 3D Files)

When the user supplies mesh or CAD files to design around (a motor, an off-the-shelf housing, a scanned part), the import IS a component of the assembly — keep it, don't rebuild it parametrically (rebuilding is `forgecad-3d-reconstruction`, a different request).

- Wrap each import in its own part file: `Import.mesh()` for STL/OBJ/3MF, `Import.step()` for STEP (OCCT backend), normalize scale and orientation, recenter to a sane local origin, then treat it exactly like a purchased part — connectors at its real mating features, positioned by the assembly via `matchTo()`.
- Never trust units. Verify against a known dimension before mating anything: bbox via `forgecad run --details`, or `inspect section --ray` across a bore or face pair. For 3MF, account for every build item printed by `forgecad run` before flattening.
- Derive mating geometry by measurement, not eyeball: pull bore positions, diameters, and face offsets from sections, then hold them with `verify.clearanceBetween`/`verify.connectorDistance` against the import like any other body. Collision Policy applies to imports too.
- The import is a purchased/fixed line item; the manufactured deliverables are the ForgeCAD-authored parts around it. Remodel an imported feature only where a boolean against the mesh is unreliable — and say so.

## Collision Policy

Each returned part is real matter. Expected final collision count: **zero**.

- Only exceptions: welded, fused, overmolded, cast-in, potted, or bonded matter — declared with `verify.intentionalOverlap` on the exact visible object pair with the physical reason. The mechanical-integrity gate honors a declaration only when that pair has a confirmed exact collision; unused or non-visible declarations still fail.
- Never use interpenetration as a placement shortcut. Model contact honestly: pins in holes, shafts in seats, tabs in slots, hinges with knuckle clearance, nested parts with wall offsets, moving parts with travel envelopes.
- Temporary construction overlaps (oversized cutters before `difference()`, primitives before `union()`, exploratory layouts) must be consumed, hidden, named as ghosts, or isolated with `--focus`/`--hide` so final findings stay meaningful.
- Collision removal is part of the modeling pass, not optional polish.

## Final Acceptance Gate

Prove technical validity and visual plausibility before declaring done. Apply to any model with multiple bodies, surface details, cables, rails, handles, product skins, or hidden mating geometry.

1. **State the intended physical component graph** — one connected component, several intentionally separate, or a selected assembly plus named ghosts — then run `forgecad inspect physical components` and require the count to match. Unexpected islands, accidental fusion, or bbox-only "touching" are model bugs.
   - Scripts using `assembly()`: `forgecad debug assembly model.forge.js --fail-on warning`. Fix warnings (multiple roots, manual joint contracts, disconnected bodies, unused connectors, collisions); a truly intentional one gets a visible reason in code.
   - Generated mechanical work: `forgecad inspect mechanical-integrity . --collisions` is the shareability gate — it fails on missing `verify.*` interface checks, fragmented named groups, uncontracted manual assemblies, positive-volume collisions, timeouts, runtime failures. Do not share while red unless the user asked for a blockout.
   - Include at least one verification that proves a mechanical interface (clearance band, keep-out, connector mate), not just object counts.
   - Moving assemblies: incomplete until poses cover rest, mid-travel, both limits, coupled and mirrored states via `--joint` and/or in-script `solve(state)` checks, with convergence, attachment, and clearances holding at every pose.
2. **Collision evidence**: run `forgecad inspect fit interference`; read the manifest collision count AND the evidence PNGs. Zero unexpected findings per Collision Policy; visually confirm where any findings appear.
3. **Risk-specific views, not just a hero shot.** Delivery renders use the model's `scene()` rig (Scene Presentation below) — default flat lighting in a final render is a finding. One whole-model context view plus views chosen from this object's failure modes — opposing, underside, interior-facing, or grazing angles that catch internals showing through openings, covers that don't close, bad boolean cuts. Per meaningful interface: one contextual and one focused/isolated view. Risk prompts:
   - long products, rails, handles, tools: views along and across the dominant length (bends, sag, end attachments)
   - enclosures/shells with internals: exterior plus hidden-cover views (fit, concealment, service access)
   - sockets, underside joins, stands, brackets: look directly into the mating face or underside; `inspect sections` for hidden geometry
   - cables, strings, belts, tubes: both endpoints, route clearance, sag, termination hardware
   - surface details on curved ProductSkin bodies: grazing and contextual views proving details conform or embed
4. **Visual attachment audit.** For every detail that should be connected, ask "where does this physically enter, seat, wrap, terminate, or fasten?" and check that view directly. Known failures to fix before delivery:
   - a flat rail or bed sitting on a curved shell instead of being recessed, saddled, socketed, or blended in
   - strings/cables passing through space without knots, hooks, holes, posts, ferrules, pulleys, or anchors
   - trim lines floating above the body instead of following the surface or being inset/raised strips with real thickness
   - handles/grips touching only by a tangent instead of having a neck, bridge, socket, screws, or overmolded landing
   - small hardware/gems that are bbox-connected but visually levitate; give them flush/inset seats or explicit brackets
5. **ProductSkin honesty.** Boolean-test warnings from sampled-loft boundary edges are not real collisions. Deliver only if the collision count is clean, connectivity is correct, and the attachment audit passes; mention the residual warning in the final response.
6. **Name the evidence** in the final response: commands run, views checked, joint values tested, focus/hide filters, component count, collision count, residual warnings or intentional exceptions. Never just say "validated."

## Manufacturing Outputs

A manufacture-realistic model must yield a package a shop can consume, not just a clean viewport.

- Register every purchased and fabricated part with `bom()` (exact spec, quantity, purpose) so the BOM lives in the model — `forgecad export report` must reproduce it without prose supplements.
- Put `dim()` annotations on the dimensions a builder must hit: overall envelope, critical interfaces, mating bores and bolt patterns.
- Prove the process-appropriate export runs cleanly and name the output path in the final response: `export stl`/`export 3mf` for printed parts; `export step` for machined parts and CAD interchange; sheet-metal parts must unfold to a valid flat pattern (`export cutting-layout` for sheet goods). `step`, `report`, and `cutting-layout` need a Production license — if unavailable, run the free exports and name the gated commands that complete the package instead of failing.
- An export failure (non-manifold body, open shell, fused multi-part blob where one fabricated part was expected) is a model bug, not an export problem.

## Render and Inspect Cadence

**You are building blind unless you render.** `forgecad run` passing only means the code didn't crash — it cannot tell you a hole is misplaced, a rib pokes through a cover, or a part doesn't fit. Render from angles chosen for the model's actual geometry and read every PNG. For command syntax, evidence selection, and manifest reading, use the `forgecad-render-inspect` skill and the CLI docs — this skill fixes only the cadence and the gates.

Render after every feature addition, boolean cut, symmetric copy placement, and the last feature. Inspect after adding hidden geometry a surface render cannot prove, after adding or moving mating parts, ghosts, connectors, thin walls, or screw holes, and before delivery with thresholds set for the material/process.

**Keep inspection scenes small.** Return one selected configuration; include only the parts needed to prove the current risk (if a check concerns three objects, inspect those three, not the whole shop floor); prefer `--focus`/`--hide` and parameter-selected diagnostic modes over permanent extra objects; collapse proven subassemblies into fewer named objects where identity doesn't matter for collisions, masks, or contracts. If you cannot hold the scene in your head, you cannot debug it honestly.

**Ghost parts for fit checks.** When a part holds or contains another object, render both with the contained object as a compact transparent named ghost — e.g. a `box()` at the seat position with `.color('#ff4444').material({ opacity: 0.4 })`, returned as `{ name: 'Servo Ghost', shape: ghost }`.

Use `verify.*` for dimensions and clearances that decide acceptance; `console.log()` only for explanatory traces (shown under "Script output:" in `forgecad run`).

## Build Bottom-Up

You cannot target a complex model in one pass. Decompose, solve the smallest piece, verify, compose upward:

1. **Decompose** into the smallest parts you can reason about confidently. A gear is not small — a single tooth profile is.
2. **Solve one piece** in isolation: own variables, own return, no connection logic yet.
3. **Verify it**: `forgecad run`, then render and read the PNG. Fix while the scope is tiny.
4. **Compose one layer at a time**, verifying at each level so a break is always at the newest seam.

For any model with more than ~3 distinct geometric features, plan the decomposition explicitly before writing geometry.

## Scene Presentation

Always set up `scene()` — default lighting looks flat. Worked recipes (studio and matte-industrial setups, named views, plinth) live in `guides/scene-presentation.md` via the `forgecad` skill; the schema is in the viewport docs. Hard-won cliffs:

- Setting `lights` replaces ALL defaults — always include an ambient light or the scene goes black.
- Minimum rig: ambient fill + one warm key (`castShadow: true`) + weaker cool fill/rim. Keep `environment.intensity` low — environment fill kills shadows.
- Prefer roughness over fog for softness; keep bloom near zero for mechanical parts or they read toy-like.
- If a render is close, nudge `toneMappingExposure` by ~0.05 before redoing the rig; avoid big ambient jumps.
- Camera: 3/4 angle, `fov` 35–50, `target` at the visual center of mass. Ground plane with shadows for grounded objects.
- Environment by type: `studio` for metallic/jewelry, `warehouse`/`apartment` for organic/matte, `warehouse` + strong directionals for mechanical, `night` + bloom/vignette for dramatic.
