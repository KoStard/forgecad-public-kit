---
name: forgecad-make-a-model
description: Create manufacture-realistic prototype ForgeCAD (.forge.js) models in the active CAD project. Handles file placement, invokes the forgecad skill for API guidance, and validates the result.
forgecad-public: true
---

# Make a Model

Create new ForgeCAD models in the user's active ForgeCAD project.

## Default Output Standard

Unless the user explicitly asks for a rough blockout, toy, pure visual study, mass-production release package, or specific manufacturing process, the output is a **manufacture-realistic prototype**.

That means the model should look and behave like a serious prototype someone could fabricate, buy parts for, assemble, inspect, and iterate in a real shop or product lab. It is not a casual concept sketch, not a universal 3D-printing exercise, and not a claim of certified production readiness.

- Choose processes that fit the artifact: machined, sheet-metal, tube, wood/composite, laser-cut, molded-look prototype, printed, or hybrid purchased-hardware construction as appropriate.
- Include prototype-real features: wall thickness, fastener stacks, bosses, ribs, flanges, bends, seats, bushings, gaskets, cable exits, service access, toleranced clearances, and believable purchased parts.
- Use production cues only when they help prototype realism. Do not invent expensive production tooling details, certification claims, or safety ratings unless the user asked for that level.
- If the user asks for `production-realistic`, push toward manufacturing DFM and production-intent materials. If they ask for `printable`, make the selected printed parts honest. If they ask for `visual-CAD`, keep it clearly visual rather than pretending it is build-ready.
- Checking for collisions and removing unexpected overlaps is part of the normal definition of done. The expected final collision count is zero except in rare, explicit cases such as welded, fused, overmolded, cast-in, potted, or bonded matter; those exceptions must be declared with `verify.intentionalOverlap(...)` or isolated with focused inspection so the remaining collision report is meaningful.

## File Placement

All new `.forge.js` files go under the date-based directory structure:

```
YYYY/MM/DD/file.forge.js          — single-file model
YYYY/MM/DD/folder/main.forge.js   — multi-file project entry point
YYYY/MM/DD/folder/parts/*.forge.js — standalone/importable model parts
YYYY/MM/DD/folder/lib/*.js        — pure helpers/constants only, no geometry return
```

Use today's date for the directory. Use the user's current ForgeCAD project when one is available; otherwise use a clearly named local model folder.

### Naming conventions

- Use kebab-case for file and folder names: `parametric-lego.forge.js`
- Use descriptive names that communicate what the model is
- For any multi-file project, name the runnable ForgeCAD entry point `main.forge.js`
- Put renderable/importable parts and sub-assemblies in separate `.forge.js` files when splitting is justified; each should be standalone-runnable and importable with `require('./parts/name.forge.js', params)`.
- Use plain `.js` files only for pure constants, math helpers, tables, or formatting code that does not construct and return ForgeCAD geometry.
- Do not create multiple `.forge.js` files merely for organization; split only for reusable parts, large self-contained components, or independent sub-assemblies.

## Workflow

1. Load the ForgeCAD skill — always invoke the `forgecad` skill first to get API docs and authoring guidance. Read at minimum the Core API reference. If any two parts are intended to touch or mate in the final model, read the positioning guide immediately and default to connectors + `matchTo()`.
2. Create the directory — `mkdir -p YYYY/MM/DD/[folder]` as needed.
3. Write the model — create the `.forge.js` file(s) following ForgeCAD conventions:
   - Treat the default build profile as `manufacture-realistic prototype`; choose and encode the artifact's manufacturing/process cues before adding styling detail
   - Declare `param()` / `boolParam()` for all tunable dimensions
   - If the model is split across files, use `main.forge.js` as the primary entry point, import renderable parts from neighboring `.forge.js` files, and keep only pure helpers/constants in plain `.js` modules
   - When there are multiple versions of the same object, expose the version as a choice parameter and render one selected version at a time
   - Use clear variable names
   - Build any implied internal structure as real geometry, even when it will be hidden in the final view
   - Build the complete physical artifact first: closed shells, installed covers, real part positions, and all meaningful internal structure in place
   - Make final mating geometry physically plausible: parts may touch, clear each other, or be boolean-joined, but should not unintentionally pass through each other
   - Model the physical artifact, not an educational diagram: no explanatory arrows, floating labels, section labels, legends, or text plaques unless the user explicitly requested a presentation/teaching view
   - Do not make the default returned model a cutaway, sectioned shell, permanently exploded assembly, or hidden-parts teaching view. ForgeCAD gives the user viewer and inspection tools for slicing, exploding, hiding, and looking inside after the real CAD exists.
   - Return the final geometry (single shape, array, or named objects array)
   - Treat `fillet(shape, r)` and `chamfer(shape, r)` as experimental edge treatments: Manifold can produce incorrect results and OCCT can be very slow. Prefer simpler primitive profiles, lower segment counts, targeted edge selectors, and inspection before relying on the result.
4. Validate — run `forgecad run <file>` to check for errors. For multi-file projects, always validate `main.forge.js`.
5. Verify geometry — render a multi-angle visual evidence set before final delivery: whole-model context plus agent-chosen orthographic, oblique, underside, or hidden-object views that expose the relevant components and interfaces. Choose camera directions from the model's shape and likely failure modes, not from a fixed recipe. Use those views to look for internals that are accidentally visible, parts that visibly do not fit, floating details, blocked access, missing seats, and unexpected interference. Run `forgecad run --connectivity` when the model has multiple returned objects or visible attachments, run `forgecad debug assembly --fail-on warning` when the script uses `assembly()`, run `forgecad inspect mechanical-integrity <project-or-file> --collisions` before sharing generated mechanical work, and run the targeted `forgecad inspect <evidence>` commands that match the task (see Final Acceptance Gate and Render-Verify Loop below). For multi-file projects, render and inspect `main.forge.js`. Collision findings are model work, not FYI: remove unexpected overlaps before delivery.
6. Iterate from visual and inspection feedback — treat every render and inspection bundle as model evidence, not a checkbox. Read the normal PNGs, manifest, and evidence PNGs; convert each unexpected collision, thin region, missing section detail, wrong component count, floating body, distance gap, confusing object-color result, accidentally exposed internal structure, bad fit, or visually unsupported interface into a concrete model edit; then rerun the same targeted evidence pass until the result matches the intended physical component graph.

## Manufacturing Process Is Not Assumed

Do not interpret every ForgeCAD model as a printable object.
Choose the manufacturing/process cues that fit the artifact unless the user explicitly asked for a specific process. A manufacture-realistic prototype can be CNC-machined, bent sheet, tube-and-plate, wood/composite, molded-look low-volume, printed, or hybrid; the right answer depends on the load path and operating story.

- For rideable products such as scooters, bikes, skateboards, carts, or mobility-adjacent devices, use realistic metal/composite/wood structural members, purchased wheels/bearings/axles/brakes/grips, and standard hardware unless the user asked for a printable toy/model.
- For furniture and load-bearing structures, consider wood, sheet goods, tube, metal brackets, conventional joinery, and printed parts only where they are honest secondary components.
- For enclosures, choose injection-molded, sheet-metal, CNC, thermoformed, printed, or hybrid cues based on quantity, ruggedness, serviceability, and the brief.
- For fixtures and tooling, choose machined, laser-cut, welded, printed, or hybrid construction based on load, repeatability, and shop realism.
- Use printing-specific features such as slicer clearances, support strategy, layer-oriented ribs, and heat-set inserts only when the selected process includes printed parts.

## Physical Artifact, Not Teaching Diagram

The deliverable is the object someone would build, assemble, inspect, or export. It is not an educational display model unless the user explicitly asks for one.

- Do not add explanatory text labels, arrows, callouts, legends, section-title slabs, exploded labels, coordinate axes, or "this is the motor" plaques to production geometry.
- Do not use in-model text to make a vague object understandable. If the geometry needs labels to be understood, make the geometry more physically specific instead.
- Explain part roles through named return objects, clear variable names, comments, BOM entries, docs, and inspection results.
- Product markings are allowed only when they would exist on the real artifact: serial plates, connector labels, keyboard legends, gauge ticks, warning marks, alignment marks, service arrows, scale marks, branding, or molded icons.
- Keep real markings sparse and process-appropriate. Prefer simple recessed/raised marks or icons over heavy font geometry, especially on exact/OCCT workflows.
- If a temporary review view needs annotations, use `Viewport.label()` or a separate debug/presentation mode, not final exported geometry.

## Visual Style Defaults

Unless the user explicitly asks for a vivid, playful, toy-like, brand-specific, or unusual colorway, default to a classic high-end product palette. The model should look expensive and credible in the first render, not generically colorful.

- Prefer restrained material-driven colors: warm ivory, bone, cream, charcoal, graphite, satin black, brushed aluminum, stainless steel, brass, bronze, muted burgundy, dark green, navy, smoked translucent polymer, frosted clear, and natural wood where appropriate.
- Use bright colors sparingly as small accents for controls, seals, indicators, warnings, or brand-neutral identity lines.
- Match color to material/process: anodized or powder-coated metal, molded or dyed polymer, rubber/silicone, glass/acrylic, PCB/FR4, wood grain, leather/fabric, and standard hardware should each read differently.
- Avoid one-note rainbow/neon palettes, random saturated part colors, or color groups that make a serious artifact feel like a toy unless the brief asks for that.
- If the object normally has user-facing markings, include only the markings that belong on the real artifact: keyboard legends, button labels, gauge ticks, icons, connector labels, alignment marks, service arrows, and scale markings. Do not leave expected production markings blank, but do not add explanatory labels just to teach the model.
- Use color to clarify part boundaries and serviceability without hiding the engineering stack: seams, fasteners, gaskets, inserts, ports, and purchased components should remain legible.

## Variants Should Be Parameter-Selected

If the model supports several sizes, styles, revisions, or option bundles of the same object, do not display all variants in the default scene. Add a `Param.choice` / choice parameter such as `Variant`, `Preset`, `Style`, or `Configuration`, and return only the selected variant's production geometry.

Comparison lineups are acceptable only as an explicit debug or presentation mode, not the default. Keep those modes behind a clearly named parameter such as `Show comparison lineup`, and keep collision inspection focused on one selected final assembly so unrelated variants cannot create false collision findings.

## Internal Geometry Is Part of the Model

If the requested object would have meaningful internal structure in the real artifact, model that structure too. Do not satisfy an enclosure, robot, tool, mechanism, vehicle, appliance, prop, or functional manufactured part with only an exterior shell unless the user explicitly asks for a facade or blockout.

Build hidden features as actual geometry:

- Internal cavities, wall thickness, ribs, bosses, posts, brackets, ledges, and snap/latch features
- Screw holes, inserts, bearing seats, axle paths, shaft clearances, and fastener access
- Electronics volumes, battery bays, servo/motor pockets, wire channels, cable exits, and connector clearances
- Mechanism clearances, travel envelopes, stops, guides, rails, hinges, gear spaces, and service access
- Process-specific features such as bends, tubes, sheet-metal flanges, machined bosses, cast ribs, molded draft, weld tabs, laser-cut slots, or print-oriented ribs where appropriate

Do not reveal hidden structure by permanently cutting away the production geometry. Keep the returned default model faithful to the real closed artifact, with covers installed and parts in their actual assembled positions.

When internals are hidden by the final exterior, verify them with exploration tools instead of changing the artifact: render underside or alternate camera views, use `forgecad inspect sections`, use viewer-only cut planes or explode controls, temporarily make a shell transparent, or add named ghost objects for fit checks. Those views are diagnostic/presentation modes; they must not replace the real model unless the user explicitly asked for a cutaway teaching model.

## Mechanical Assembly Contract

For mechanical models, a ForgeCAD script is not done when it merely looks assembled. Every visible piece must have a believable physical reason to be where it is: fused material, contact faces, a screw stack, a pin in a bore, a tab in a slot, a gasket on a land, a bearing in a seat, a cable in a channel, or a named intentional ghost.

- For bespoke fixed assemblies that do not match an existing `lib.*` helper, start from `examples/api/static-assembly-connectors.forge.js`: build each part in local coordinates, pick one root part, place every other touching part with `matchTo()`, and verify the mate with `verify.connectorDistance(...)`. Do not use final `translate()` calls as assembly contracts.
- If you use `assembly().addPart()`, do not treat `addFixed()`, `addRevolute()`, or `addPrismatic()` with a manual `frame: Transform.identity().translate(...)` as a physical contract. Manual joint frames are acceptable only as a temporary scaffold. Before delivery, convert mating interfaces to connectors with `connect()` / `match()` where the interfaces physically meet, or prove the manual joint with `forgecad debug assembly --fail-on warning` and documented geometry.
- A named assembly part should not contain unintentional disconnected bodies. If a "cover plate" contains floating pull tabs, loose screw heads, or a separate gasket, either boolean-join the manufactured features, model the fasteners/seals as separate named parts, or provide the receiving holes/lands that explain the separation.
- Screws are not decoration. A screw needs a clearance/counterbore in the cover, a receiving threaded hole/boss or through stack in the parent, enough material around both, and aligned axes from one shared bolt pattern.
- Handles and levers need a load path. Model the hub-to-arm connection, pivot pin/bore, thrust washers or shoulders, stops/detents where relevant, and the connected follower/contact surface. A handle tangent to a hub is a failed mechanism.
- Covers, doors, cartridges, and service panels need seats. Model ledges, gasket grooves, bosses, snap hooks, tabs, or hinge barrels, then show how the removable part is retained.
- Cables, wires, and tubes need receiving geometry. Model a gland, grommet, clamp, socket, ferrule, routed channel, or hose barb; do not let a cylinder end in open space.
- Purchased loose parts may remain separate bodies, but they should be named as purchased hardware or consumables and should sit in believable sockets, bores, races, guides, or fastener stacks.
- Encode interface intent with `verify.*`, not only comments. Use `verify.clearanceBetween("cover is seated on gasket", cover, gasket, -0.01, 0.05)` for contact/seated fits and clearance bands, `verify.minClearance(...)` or `verify.notColliding(...)` for keep-out/running gaps, and `verify.connectorDistance(...)` for connector-authored mates. Part counts and generic dimensions are useful supporting checks, but they do not prove an interface by themselves.

For ordinary removable covers, prefer `lib.boltedServiceCover(...)` before hand-placing plates, tabs, screw heads, gaskets, and holes. It creates the parent ledge, gasket, cover plate with fused pull tabs, shared bolt pattern, and installed screws as one mechanically accountable interface.

For electronics boxes, backplates, service-stack housings, and camera/monitor enclosures, prefer `lib.datumEnclosureAssembly(...)` before independently placing panels, ribs, bosses, ports, covers, and screws. It creates the tray, ledges, standoffs, ribs, service port, gasket, cover, and screws from one shared datum system.

For PCB-mounted terminal blocks, thermostat backplates, control boards, and wire-entry electronics panels, prefer `lib.pcbTerminalBlockAssembly(...)` before placing a loose green block near a board or cover. It creates the backplate, fused standoffs, PCB mounting screws, PCB pin holes, terminal pins, and seated purchased terminal block from one shared datum system.

For snap-retained covers, cartridges, small clasps, and housings, prefer `lib.snapLatchCoverAssembly(...)` before drawing decorative snap tabs. It creates latch windows, underside catch lands, fused snap hooks, barbs, and clearance checks so the cover is retained by real geometry.

For ordinary pinned handles, cam levers, release levers, and latch arms, prefer `lib.pinnedLeverAssembly(...)` before hand-placing a hub, arm, washers, and pin. It creates a fused lever body, aligned pivot bore, retained pin, thrust washers, support land, and low stop land as one mechanically accountable pivot stack.

For trunnions, side knobs, adjustable pivots, and clamp shafts, prefer `lib.retainedShaftAssembly(...)` before hand-placing rods, washers, and knobs. It creates bored support cheeks, a through shaft, thrust washers, knobs, retaining heads, and shared bore dimensions as one mechanically accountable stack.

For thumb screws, desk clamps, vise screws, capo pressure screws, and small fixture hold-downs, prefer `lib.thumbScrewClampAssembly(...)` before hand-placing a knob, screw cylinder, pressure pad, and bracket jaw. It creates the C-frame, threaded boss/bore, captive pressure pad, hand knob, and seated workpiece contact from one shared datum system.

For drawer slides, quick-release plates, and guided linear carriages, prefer `lib.capturedLinearSlide(...)` before hand-placing rails and a block. It creates a U-channel rail with return lips, end stops, a captured carriage, and explicit travel/clearance dimensions.

For pump cartridges, filter cassettes, battery cartridges, skeg cassettes, and removable slide-in modules, prefer `lib.capturedCartridgeGuideAssembly(...)` before placing a loose tray and block. It creates return lips, a rear stop, a captured cartridge flange, pull tab, insertion travel, and explicit clearance dimensions.

For molded flexible battery doors, sample covers, blister latches, and polypropylene-style service flaps, prefer `lib.livingHingeCoverAssembly(...)` before drawing two plates with a decorative hinge strip. It creates one fused molded strip with fixed leaf, thin flexible web, moving cover leaf, pull lip, snap barb, catch land, and web-thickness checks.

For doors, barn-door leaves, lids, locket leaves, and small hinged access panels, prefer `lib.knuckledHingeAssembly(...)` before hand-placing barrels and a pin. It creates alternating fused knuckles, two leaves, a shared bore, and a retained pin as one mechanically accountable hinge.

For crank links, damper rod ends, crossheads, and clevis-yoke pivots, prefer `lib.clevisPinJointAssembly(...)` before hand-placing an eyelet and pin. It creates bored clevis ears, a captured center link eye, a rear bridge, and a retained pin as one mechanically accountable load path.

For bearings, rollers, burr cartridges, spindle supports, and purchased radial bearings, prefer `lib.seatedBearingAssembly(...)` before hand-placing a ring and shaft near a block. It creates a bored housing, counterbore pocket, bearing shoulder, seated bearing, shaft, collars, and shared clearance dimensions as one mechanically accountable support.

For cables, wires, hoses, pump tubes, and panel pass-throughs, prefer `lib.cableGlandAnchorAssembly(...)` before hand-placing a loose cylinder near a wall. It creates the panel clearance hole, hollow gland body, compression nut, and routed cable/tube as one mechanically accountable pass-through.

For routed cables, wires, hoses, pump tubes, and sensor leads that run along a surface, prefer `lib.routedTubeClipAssembly(...)` before drawing a tube that floats between endpoints. It creates a base panel, saddle clip bores, clip screw holes, installed screws, and the retained tube route from one shared datum system.

For fluid hoses, pump inlets/outlets, filter ports, and lab tubing, prefer `lib.hoseBarbPortAssembly(...)` before drawing a tube that stops at a block. It creates the bored receiver, raised boss, hollow barbed fitting, installed hose, and clamp band as one accountable hose-port interface.

## Final Geometry Should Be Physically Plausible

Treat each returned part as real matter occupying space. In the final build, separate parts should not intersect unless the intersection is the actual manufacturing intent, such as a welded/fused region, an overmolded insert, or a boolean-unioned solid that is no longer a separate part.

Do not use final interpenetration as a placement shortcut. For joints and interfaces, model the contact, clearance, or connector honestly: pins in holes, shafts in bearing seats, tabs in slots, hinges with knuckle clearance, screws through clearance holes, nested parts with wall offsets, and moving parts with their travel envelope accounted for.

Temporary collisions during construction are fine when they are part of how the model is made or verified: oversized cutter solids before `difference()`, overlapping primitives before `union()`, transparent ghost parts for fit checks, or exploratory joint layouts. Those temporary bodies should be consumed, hidden, named as ghosts, or isolated with inspection filters so final collision findings stay meaningful.

If a final overlap is real manufacturing intent, document the exact visible object pair with `verify.intentionalOverlap("rubber grip is overmolded on handle core", rubberGrip, handleCore, "overmolded bonded grip")`. Use this only for welded, fused, overmolded, cast-in, potted, or bonded matter. The mechanical-integrity gate honors it only when the same visible object pair has a confirmed exact collision; unused or non-visible declarations still fail.

Before delivery on any multi-part, internal, or mechanical model, run `forgecad inspect collisions`, read the collision evidence PNGs, and check `manifest.json`. Fix unexpected overlaps; collision removal is part of the expected modeling pass, not optional polish. If a collision is intentional, declare the exact visible pair with `verify.intentionalOverlap(...)` or isolate that inspection with `--focus` / `--hide` so the remaining collision report proves the final assembly is real.

## Final Acceptance Gate

Before telling the user the model is done, prove both technical validity and visual plausibility. A model can pass `forgecad run` and still be wrong because a rail, cable, trim line, handle, or fastener is merely hovering over a curved surface. Use this gate for any model with multiple bodies, surface-mounted details, cables/strings, rails/tracks, handles, product skins, visible hardware, or hidden mating geometry.

1. State the intended physical component graph. Decide whether the final artifact should be one connected component, several intentionally separate components, or a selected assembly plus named ghosts. Then run:

   ```bash
   forgecad run model.forge.js --connectivity
   ```

   The reported component count must match the design intent. Treat unexpected islands, accidental fusion, or bbox-only "touching" that does not make physical sense as model bugs.

   If the script uses `assembly()`, also run:

   ```bash
   forgecad debug assembly model.forge.js --fail-on warning
   ```

   Fix warnings about multiple roots, manual joint contracts, disconnected bodies inside parts, unused connectors, solve warnings, and collisions before delivery. If a warning is truly intentional, rename the part or add a short code comment so a reviewer can see the physical reason.

   For generated mechanical projects or batches, also run:

   ```bash
   forgecad inspect mechanical-integrity . --collisions
   ```

   This is the shareability gate. It fails on missing `verify.*` checks, missing mechanical-interface verification, fragmented named groups, uncontracted manual assemblies, positive-volume object collisions, timeouts, and runtime failures. Do not share a generated mechanical model while this gate is red unless the user explicitly asked for a rough concept/blockout.

   The model should include at least one verification that proves a mechanical interface, not just object count. Prefer checks such as `verify.clearanceBetween("bearing is seated in pocket", bearing, housing, -0.01, 0.1)`, `verify.minClearance("carriage clears rail", carriage, rail, 0.15)`, `verify.notColliding("cover screw clears parent hole", screw, parent)`, or `verify.connectorDistance("leg connector is seated", bench, "Rail.leg_0", "Leg0.head", 0, 0.01)`.

2. Run collision evidence and read both the manifest and images:

   ```bash
   forgecad inspect collisions model.forge.js /tmp/model-collisions-inspect --camera <collision-evidence-camera> --force --size 700
   jq '.evidence.collisions | {collisionCount, collisions, warnings}' /tmp/model-collisions-inspect/manifest.json
   ```

   `collisionCount` should be zero unless an overlap is deliberately manufactured, fused, welded, overmolded, or isolated with `--focus` / `--hide`. Do not ignore the evidence PNGs; visually inspect where the findings or warnings appear.

3. Render risk-specific views, not only a hero shot. Build a small visual evidence set that answers the model's physical questions from more than one direction:

   - Render one whole-model hero/context view plus the agent-chosen orthographic or oblique views that expose likely failure modes for this specific object.
   - Use opposing, underside, interior-facing, or grazing views when they are the views most likely to catch internals accidentally showing through openings, transparent shells, thin walls, bad boolean cuts, or covers that do not actually close.
   - Render focused views for important components or subsystems with `--focus`, especially mounts, covers, hinges, cartridges, electronics, routed cables, fastener stacks, moving links, and purchased parts.
   - Render hidden-object views with `--hide` when an exterior shell, cover, fixture, or decorative layer blocks the interface being checked. This is for evidence only; do not turn the default returned model into a cutaway or exploded teaching scene.
   - For each meaningful interface, capture at least one contextual view with neighboring parts present and one isolated/focused view that makes the interface easy to inspect.

   Use these risk prompts when deciding where to look:

   - long products, rails, handles, and tools: choose views along and across the dominant length so bends, sag, and end attachments are visible
   - enclosures, shells, covers, and products with internals: choose exterior and hidden-cover views that reveal whether internal structures fit, stay hidden when they should, and leave service access
   - sockets, underside joins, stands, brackets, and handles: choose views that look directly into the mating face or underside; use `inspect sections` when hidden geometry must be checked
   - cables, strings, belts, tubes, and hoses: choose views that show both endpoints, route clearance, sag, and termination hardware
   - surface details on curved ProductSkin bodies: choose grazing and contextual views that prove details conform or are embedded as intended

4. Do a visual attachment audit. For every detail that should be connected, ask: "Where does this physically enter, seat, wrap, terminate, or fasten?" Check that view directly. Common failures to fix before delivery:

   - a flat rail or arrow bed sitting on top of a curved shell instead of being recessed, saddled, socketed, or structurally blended into the body
   - strings/cables that pass through space without terminal knots, hooks, holes, posts, ferrules, pulleys, or anchors
   - decorative brass/trim lines floating above the body instead of following a ProductSkin surface or being built as inset/raised strips with believable thickness
   - handles/grips touching only by a tangent or thin face instead of having a neck, bridge, socket, screws, or overmolded landing
   - small hardware or gems that are bbox-connected but visually read as levitating; replace with flush/inset seats or explicit brackets

5. Treat ProductSkin and surface-member limitations honestly. If `inspect collisions` reports boolean-test warnings because a sampled `Product.skin` loft has boundary edges, distinguish that from real collision findings. You may still deliver if `collisionCount` is clean, the intended connectivity is correct, and the visual attachment audit passes. Mention the residual warning briefly in the final response.

6. Final response must name the evidence: commands run, render views checked, any focus/hide filters used, component count, collision count, and any residual warnings or intentional exceptions. Do not just say "validated."

## Render-Verify Loop

You are building blind unless you render. `forgecad run` only checks that code executes — it cannot tell you a hole is in the wrong place, an internal rib is poking through a cover, or a part doesn't fit. Render from different angles chosen for the model's actual geometry and look at every result.

### How to render and inspect

```bash
# Render from multiple agent-chosen angles; do not stop at one hero view.
node dist-cli/forgecad.js render model.forge.js /tmp/preview.png \
  --camera <context-az:el> \
  --camera <failure-mode-az:el> \
  --camera <interface-az:el> \
  --size 600

# Camera format: --camera az:el (degrees). Repeatable.
# Choose camera directions that prove or disprove the physical questions in this model.
# Good evidence sets usually include a context view plus views aimed at hidden internals,
# underside joins, mating faces, routed paths, thin walls, or surface attachments.
```

Then read the PNG(s) to inspect visually. Single camera → single file. Multiple cameras → suffixed files (`_az45_el25.png`). If any angle reveals internal geometry where the outside should be closed, a cover that does not seat, a hidden part that cannot fit, or a detail that floats/intersects, edit the model and rerender the same angles.

### Focused visual evidence

Use focused and hidden-object renders to collect evidence from the parts a normal hero shot hides. The goal is to answer specific physical questions: "is the cover seated?", "does the cable enter a gland?", "are the screws aligned with bosses?", "does the bracket actually touch the frame?"

```bash
# Isolate the target subsystem from several angles.
node dist-cli/forgecad.js render model.forge.js /tmp/model-cover-stack.png \
  --focus "Cover,Screws,Gasket,Bosses" \
  --camera <subsystem-context-az:el> \
  --camera <seating-interface-az:el> \
  --camera <fastener-axis-az:el> \
  --size 700

# Hide exterior clutter to inspect the installed internals in context.
node dist-cli/forgecad.js render model.forge.js /tmp/model-internals.png \
  --hide "Outer Shell,Top Cover" \
  --camera <internal-context-az:el> \
  --camera <clearance-path-az:el> \
  --camera <underside-or-access-az:el> \
  --size 700
```

For important components, collect both:

- Context view — neighbors present, proving the part belongs in the final assembly.
- Focus view — only the relevant objects visible, making small gaps, intersections, missing seats, and floating parts easy to see.

Prefer CLI `--focus` / `--hide` filters, named views, or parameter-selected diagnostic modes over changing production geometry. Use the object names from `node dist-cli/forgecad.js run model.forge.js --quality live` when you are unsure what the filters should target.

### Structured inspection bundles

After the normal PNG render, run targeted `forgecad inspect <evidence>` commands and read both the evidence PNGs and `manifest.json`. Keep inspection bundles targeted to the current risk; for any multi-part final build, `inspect collisions` is mandatory:

```bash
forgecad inspect collisions model.forge.js /tmp/model-collisions-inspect --camera <collision-evidence-camera> --force --size 700
```

### Inspection feedback loop

Use inspections as the repair loop for the model:

1. Ask one physical question before each bundle: "what evidence would prove this model is wrong?"
2. Run the smallest evidence command that can answer it. Add `inspect image` or `inspect objects` alongside the risk evidence when you need visual context or object-color lookup.
3. Read `manifest.json` first for counts, pairs, thresholds, filters, object mappings, and warnings.
4. Read the evidence PNGs next, using `inspect image` and `inspect objects` outputs to locate findings in the real geometry when needed.
5. Convert findings into model edits:
   - `collisions`: add real receiving geometry, holes, seats, clearance, connectors, or `verify.intentionalOverlap(...)` for true fused/overmolded/bonded matter only.
   - `thickness`: change wall, rib, boss, shell, slot, or process dimensions; set material/process thresholds before accepting the result.
   - `sections`: add or repair the hidden cavity, screw path, pocket, cable route, captured part, or internal support the slice exposed.
   - `connectivity`, `floating`, and `distance`: fix disconnected islands, accidental fusion, unsupported bodies, or surprising gaps in the component graph.
   - `objects`, `depth`, `normals`, and `zebra`: fix missing objects, confusing object identity, flipped/odd surfaces, faceting, protrusions, and bad surface continuity.
6. Rerun the same targeted evidence command after the edit so the before/after evidence is comparable. Add a second evidence command only when the repaired area creates a new risk.

### Keep CLI inspection scenes small

When using CLI inspection commands, make the scene as few returned/named objects as the requirement allows. The goal is not to hide required geometry; it is to keep the evidence small enough that the agent can reason about it properly.

- Return one selected configuration, not every variant, option bundle, or debug lineup.
- Include only the parts, ghosts, and fixtures needed to prove the current risk. If a collision, clearance, thickness, or section check concerns three objects, inspect those three objects instead of the whole shop floor.
- Prefer `--focus` / `--hide` and parameter-selected diagnostic modes over adding permanent extra objects to the default scene.
- Collapse decorative or already-proven subassemblies into fewer named objects when their internal boundaries are irrelevant to the inspection. Keep separate names only where object identity matters for collisions, masks, clearances, BOM roles, or mechanical contracts.

Small inspection scenes make `manifest.json`, mask colors, collision pairs, component counts, and section images cognitively tractable. If the agent cannot hold the scene in its head, it cannot debug the model honestly.

For faster iteration, request the evidence that matches the current risk:

- `inspect collisions` — final multi-part assemblies, fixtures, enclosures, ghost fit checks, moving clearances, and any parts intended to touch without overlapping. Visually inspect this evidence; do not rely only on the count.
- `inspect thickness` — printed shells, sheet metal, molded walls, ribs, bosses, holes, snap fits, slots, brackets, and any feature where thin walls can fail. Set thresholds for the selected material/process instead of blindly accepting defaults.
- `inspect sections` — hidden internals, cavities, wire channels, pockets, screw paths, captured components, and anything a surface render cannot show.
- `inspect connectivity` — parts that should be one connected solid, parts that should remain separate, and assemblies where floating or accidentally fused bodies matter.
- `inspect objects` — object identity, missing named parts, duplicate geometry, hidden mocks, and color/name confusion.
- `inspect depth` / `inspect normals` — occlusion, orientation, flipped surfaces, odd protrusions, and form readability.
- `inspect image` — the human-readable view that keeps structured evidence grounded.

Useful manifest checks:

```bash
jq '.evidence.collisions | {collisionCount, collisions, warnings}' /tmp/model-inspect/manifest.json
jq '.evidence.thickness.objects[] | {name, minThickness, p05Thickness, criticalAreaPercent, warningAreaPercent, unresolvedAreaPercent}' /tmp/model-inspect/manifest.json
jq '.evidence.connectivity | {componentCount, edges, warnings}' /tmp/model-inspect/manifest.json
```

Treat unexpected collision findings, critical thin regions, high unresolved thickness, missing sections, or wrong component counts as model bugs. If an overlap is intentional, make that explicit in the model or isolate the inspection with `--focus` / `--hide` so the remaining findings are meaningful:

```bash
forgecad inspect collisions model.forge.js /tmp/model-fit-collisions --focus "Bracket,Screw Ghost" --camera <fit-evidence-camera> --force
forgecad inspect sections model.forge.js /tmp/model-fit-sections --focus "Bracket,Screw Ghost" --force
forgecad inspect thickness model.forge.js /tmp/model-thickness --min 1.6 --warn 2.4 --camera <thickness-evidence-camera> --force
```

### When to render

- After every feature addition (not just at the end)
- After any boolean subtraction that creates a hole/pocket
- After placing symmetric copies (to check symmetry)
- After adding the last feature (final check)

### When to inspect

- After adding hidden/internal geometry that a surface render cannot prove
- After adding or moving mating parts, ghosts, connectors, holes, pockets, or clearances
- After adding thin walls, ribs, slots, snap features, bosses, or screw holes
- Before final delivery, with the evidence that matches the remaining risks, and with thresholds appropriate to the model

### Ghost parts for fit verification

When building a part that holds/contains another object (enclosure, mount, bracket), render both together with the contained object transparent:

```js
// Ghost servo for visual fit check
const ghost = box(servoW, servoD, servoH)
  .placeReference('center', [0, 0, wallThick])
  .color('#ff4444').material({ opacity: 0.4 });

return [
  { name: 'Mount', shape: mount.color('#556B2F') },
  { name: 'Servo Ghost', shape: ghost },
];
```

This immediately reveals: does it fit? Does it collide with walls? Does the shaft clear the opening?

### Use verify for acceptance, console.log for traces

Use `verify.*` for dimensions and clearances that decide whether the model is acceptable. Use `console.log()` only for explanatory traces that help you read the run output.

```js
verify.greaterThan("wall remains around slot", (outerW - slotW) / 2, 1.6);
verify.greaterThan("hole clears flange edge", flangeW / 2 - holeX - holeDia / 2, 2.0);
console.log("wall remaining:", ((outerW - slotW) / 2).toFixed(1));
```

Output appears under "Script output:" in `forgecad run`.

### Self-inspecting shared constants

For multi-file projects with a shared constants file (e.g. `shared-dims.js`), add a summary block that prints all computed values when the file is run directly. This replaces one-off throwaway debug scripts.

```js
// At the bottom of shared-dims.js:
if (require.main === module) {
  console.log('=== SERVO ===');
  console.log('  body:', servo.bodyW, '×', servo.bodyD, '×', servo.bodyH, 'mm');
  // ... all computed dimensions, clearance checks, etc.
  console.log('✓ All validations passed.');
}
```

Run with `node shared-dims.js` to see the full dimension summary. Don't write throwaway `node -e "require(...)..."` scripts — put the inspection logic in the source file itself where it stays up to date automatically.

## ForgeCAD Quick Reference

The `forgecad` skill has full API docs.

Key primitives:

- `box(x, y, z)`, `cylinder(h, r, rTop?, segments?)`, `sphere(r)`, `torus(R, r)`
- `union()`, `difference()`, `intersection()`
- `.fillet()`, `.chamfer()` for experimental edge treatments only
- `param(name, default, opts)`, `boolParam(name, default)`
- Return `[{ name, shape, color }]` for multi-part colored models

Primitive placement convention:

- `box()` and `cylinder()` are centered in X/Y and sit on `z=0`.
- `sphere()` and `torus()` are centered in X/Y/Z.
- Use `.placeReference('center', [0, 0, 0])` when a box or cylinder should be centered around the origin.
- Do not pass `center: true` or a positional `true` to primitives; that is stale OpenSCAD-style guidance.

Key composition tools:

- Connectors + `matchTo()` for parts that should touch in the final model
- `group()` for local-coordinate subassemblies
- `attachTo()` for quick bounding-box placement
- `.translate()` / `.rotate()` for free offsets or bridging computed locations, not as the default assembly contract

## Managing Complexity: Build Bottom-Up

You cannot target a complex model directly. A chess set, a mechanical assembly, an articulated figure — if you try to write the whole thing in one pass, you will get lost in coordinate math, produce subtle geometry bugs, and waste cycles debugging a tangled script.

Instead, do what engineers do: decompose, solve the smallest piece, verify, then compose upward.

### The process

1. Decompose — Break the model into the smallest independent parts you can reason about confidently. A "gear" is not a small part — a single tooth profile is. A "house" is not small — a wall panel with a window cutout is.

2. Solve the smallest piece — Write the geometry for one part. Keep it isolated: its own variables, its own return statement. Don't think about how it connects to the rest yet.

3. Verify — Run `forgecad run` to check for errors, then `forgecad render` to actually see the shape. Read the rendered PNG. Does it match your intent? Are holes where they should be? Are walls thick enough? Fix it now while the scope is tiny. `forgecad run` passing does not mean the geometry is correct — it only means the code didn't crash.

4. Compose upward — Once a piece is verified, combine it with the next piece. Verify again. Each level of assembly should be independently checkable.

5. Repeat — Keep climbing. Each step adds one layer of complexity on top of verified foundations. If something breaks, you know it's in the new layer, not buried three levels deep.

### Why this matters

- Debugging is local. When a verified piece breaks after composition, the bug is at the seam, not inside the piece.
- You avoid coordinate chaos. Small pieces use simple local coordinates. Transforms and placements happen at composition time, one layer at a time.
- Iteration is cheap. Changing a tooth profile doesn't require re-reading 200 lines of gear assembly code.

### In practice

For a model with more than ~3 distinct geometric features, explicitly plan the decomposition before writing any geometry. Write each piece as a function or variable block, verify it, then combine. Do not skip verification steps to "save time" — it costs more time in the end.

## Scene Presentation

Always set up a proper `scene()` to make models look polished. A bare model with default lighting looks flat and unfinished.

### Minimum scene setup

Every model should have at least:

```js
scene({
  background: { top: '#1a1a2e', bottom: '#0a0a14' },
  camera: { position: [x, y, z], target: [0, 0, 0], fov: 42 },
  environment: { preset: 'studio', intensity: 0.6 },
  lights: [
    { type: 'ambient', color: '#c8cdd4', intensity: 0.15 },
    { type: 'directional', position: [80, -60, 120], target: [0, 0, 0], color: '#fff4e0', intensity: 1.8, castShadow: true },
    { type: 'directional', position: [-60, 40, 80], target: [0, 0, 0], color: '#b0c4de', intensity: 0.7 },
  ],
  ground: { visible: true, color: '#111118', height: -10, receiveShadow: true },
  postProcessing: {
    bloom: { intensity: 0.3, threshold: 0.85, radius: 0.3 },
    vignette: { darkness: 0.5, offset: 0.4 },
    toneMappingExposure: 1.3,
  },
});
```

### Named render views

For models that need repeatable review, docs, or hero renders, declare named views inside
`scene({ views })`. The canonical form wraps each camera in `{ camera: ... }`; direct camera
shorthand is accepted by the runtime, but the wrapped form is the clearest prompt/example shape.

```js
scene({
  camera: { position: [430, -540, 340], target: [0, 30, 125], fov: 38 },
  views: {
    hero: {
      camera: { position: [430, -540, 340], target: [0, 30, 125], up: [0, 0, 1], fov: 38 },
    },
    side: {
      camera: { position: [700, 0, 180], target: [0, 30, 100], up: [0, 0, 1], fov: 32 },
    },
  },
});
```

Render one later with:

```bash
forgecad render 3d model.forge.js --view hero
```

### Lighting principles

- When `lights` is set, all defaults are replaced, so always include an ambient light or the scene goes black.
- Use a 3-point setup at minimum: ambient fill + warm key light (with `castShadow: true`) + cool rim/back light for edge separation.
- Add accent point lights near focal features (e.g. a gold crown, a polished surface) for highlights.
- Use `distance` and `decay` on point lights to keep them localized.

### Adapt to the model

- Metallic/jewelry models: `studio` environment, higher `toneMappingExposure` (1.2–1.5), subtle bloom for specular highlights.
- Organic/wood/matte models: `warehouse` or `apartment` environment, lower bloom, warmer ambient.
- Mechanical/industrial models: `warehouse` environment, stronger directional lights, minimal bloom.
- Dark/dramatic models: dark gradient background, `night` environment, bloom + vignette for mood.

### Matte industrial hero-shot recipe

For mechanisms, tools, product prototypes, vehicles, and other industrial showpieces, prefer a matte studio look over glossy or atmospheric drama:

```js
scene({
  background: { top: '#c3ccd7', bottom: '#566474' },
  camera: { position: [430, -540, 340], target: [0, 30, 125], fov: 38 },
  environment: { preset: 'studio', intensity: 0.15 - 0.25, background: false },
  lights: [
    { type: 'ambient', color: '#efe7dc', intensity: 0.12 - 0.2 },
    { type: 'directional', position: [260, -320, 420], color: '#ffe2bf', intensity: 2.6 - 3.2, castShadow: true },
    { type: 'directional', position: [-260, 210, 220], color: '#d4e6fb', intensity: 0.7 - 1.0 },
    { type: 'hemisphere', skyColor: '#c7d3df', groundColor: '#495463', intensity: 0.1 - 0.2 },
  ],
  postProcessing: {
    bloom: { intensity: 0.0 - 0.06, threshold: 0.92 - 0.96, radius: 0.25 - 0.3 },
    vignette: { darkness: 0.35 - 0.45, offset: 0.3 - 0.35 },
    toneMappingExposure: 1.05 - 1.18,
  },
});
```

Use a simple plinth or stage under the model, and make it intentionally matte too:

```js
const stage = cylinder(16, 226)
  .translate(0, 0, -26)
  .color('#8b97a4')
  .material({ metalness: 0.04, roughness: 0.78 });

mock(stage, 'StudioPlinth');
```

What worked well in practice:

- Keep `environment.intensity` low. High environment fill kills shadows and makes everything look washed out.
- Let one warm directional key light do most of the shaping. Add only a weaker cool fill/rim for separation.
- Prefer roughness over fog for softness. Fog flattens the model and hides form; matte materials preserve shadow definition.
- Keep bloom extremely low for mechanical scenes. A little is fine; too much makes manufactured parts feel toy-like or overly glossy.
- If the render is close but not perfect, change `toneMappingExposure` by about `0.05` first before redoing the whole lighting rig.
- Avoid large ambient-light jumps. They brighten fast and remove contrast faster than expected.

### Ground plane

Enable `ground` with `receiveShadow: true` for models that benefit from visual grounding (furniture, vehicles, standalone objects). Skip it for floating/abstract geometry.

### Camera

- Position the camera at a 3/4 angle (not dead-on axis) for natural perspective.
- Use `fov` 35–50 for most models. Lower FOV = more telephoto/flatter, higher = more dramatic perspective.
- Set `target` to the visual center of mass, not necessarily `[0,0,0]`.

## Tips

- Make models parametric by default — dimensions should be `param()` calls, not magic numbers
- Do not assume primitives are XYZ-centered: `box()` and `cylinder()` are XY-centered but sit on `z=0`
- Use `.placeReference('center', [0, 0, 0])` for full-origin-centered boxes or cylinders
- Prefer `group()`, connectors, and `placeReference()` over manual half-height arithmetic
- Prefer `difference()` for holes/cutouts, `union()` for additive features
- Use `.color()` to distinguish parts visually
