---
name: forgecad-verify-mujoco
description: Verify a ForgeCAD MJCF export in MuJoCo with dynamics, contacts, controls, joint travel, and rendered evidence before calling it simulation-ready.
forgecad-public: true
---

# Verify MuJoCo

Use this when `forgecad export mjcf ...` is part of the deliverable. A model is not sim-ready just because `forgecad check simready` passes or the MJCF file loads: it must be loaded in MuJoCo, stepped under gravity, driven with the intended controls, contact pairs inspected, and rendered from useful views.

Routing: geometry-only visual inspection -> `forgecad-inspect-model`; model authoring/API questions -> `forgecad`; building a new model -> `forgecad-build-model`.

## Definition Of Done

1. **Export from the exact source file.**
   ```bash
   rm -rf /tmp/forgecad-mjcf && mkdir -p /tmp/forgecad-mjcf
   forgecad export mjcf path/to/model.forge.js --output /tmp/forgecad-mjcf
   ```
2. **Load the generated scene in MuJoCo.** Use `scene.xml`, not only the model XML, so the floor/camera/package context is included.
3. **Check the root behavior.** If the model has a free root, it needs real support/contact geometry or an explicit fixed-root export path. Do not hide a floor failure by turning the whole shell into a giant bounding box that blocks moving internals.
4. **Check initial poses numerically.** For mechanisms, compute the expected body/link axes from the design source and compare them to MuJoCo `xmat`/`xpos`. Joint `ref`/default and connector frames can disagree with visual intuition.
5. **Keep meaningful collisions.** Do not mark moving functional parts `Sim.collider.none(...)` just to make motion pass. If full visual mesh contact is unstable, use a physically defensible simplified collider or proxy and state what physical surface it represents.
6. **Run the intended control with numeric acceptance criteria.** Define the expected signed post-settle joint travel before running the test: e.g. "this drive should rotate the drum -0.04 to -0.06 cycles, then stop near zero velocity" or "this wheel should move at least +1 cycle and keep spinning". Use cycles for revolute/indexing mechanisms when that is easier to reason about, and radians for direct MuJoCo qpos checks. A controller that only jitters, moves the wrong direction, overshoots through a stop, or eventually jams after skipping the intended state is a failure even when the process exits 0.
7. **Inspect contact pairs.** Contact names should match the physical story: floor/support, card/card, wheel/ground, stop/follower, etc. Contacts against a filled-in AABB, hidden fixture, or unrelated side plate usually indicate bad collider selection.
8. **Render evidence.** Save initial, settled, and driven frames from views that actually show the moving parts. If the model orientation is not obvious, generate a labeled camera preview grid first, inspect it, then rerun with the azimuth/elevation that shows the functional face. Do not report GIFs/frames before visually confirming they are not from the back, underside, or an occluded side.

## Helper Script

This skill ships a MuJoCo smoke verifier:

```bash
uv run --python 3.11 --with mujoco --with pillow \
  python <this-skill-dir>/scripts/mujoco_verify.py /tmp/forgecad-mjcf \
  --settle-seconds 2 \
  --seconds 8 \
  --actuator drum_velocity=-0.75 \
  --watch-joint drum_joint \
  --expect-drive-cycles drum_joint=-0.06:-0.03 \
  --expect-final-qvel drum_joint=-0.02:0.02 \
  --render-dir /tmp/forgecad-mjcf/verify \
  --camera-preview-grid
```

Use `--actuator name=value` more than once for multi-actuator models. Use `--expect-drive-cycles joint=min:max` to assert signed final-minus-settled revolute travel in cycles/turns. Use `--expect-drive-delta joint=min:max` when you want raw MuJoCo qpos units instead. Use `--expect-final-qvel joint=min:max` to assert terminal velocity when the mechanism should stop or continue at a bounded speed. The script prints JSON with root drift, initial-to-final joint delta, post-settle drive delta, derived cycle counts, final velocities, expectation ranges, and top contact pairs, then writes PNG frames if `--render-dir` is supplied.

Prefer explicit travel envelopes over loose "it moved" checks:

- Stops/latches: assert a signed drive cycle or delta range and a near-zero final velocity range.
- Continuous drives: assert the signed drive cycle/delta is large enough over the run and final velocity remains in the expected direction/range.
- Indexing mechanisms: assert the expected cycle step size, not just eventual stall. If the mechanism reaches a stop only after skipping several indices, treat that as failure.
- Gravity-settling mechanisms: evaluate functional travel with post-settle drive delta, not initial-to-final delta.

When rendered orientation matters, start with `--camera-preview-grid`, open `camera_preview_grid.png`, pick the azimuth that shows the mechanism face or contact interface, then rerun with `--camera-azimuth <deg>` and any needed `--camera-lookat`, `--camera-distance`, or `--camera-elevation` adjustment. For mechanism evidence, prefer front/front-quarter views for user-facing GIFs and add a side/contact view only when it explains a collision better.

## Contact Debugging Rules

- In MuJoCo UI, enable contact visualization with `Rendering` -> `Contact points` and `Contact forces`; use the right-side perturb/visualization panels if available in your build.
- If rotation is blocked, list contacts during the stall and sort by repeated pairs. The blocker is usually the pair that appears every step while the driven joint velocity trends to zero.
- If a body falls through the floor, inspect the exported geoms. Visual geoms have `contype="0" conaffinity="0"` and cannot support anything; collision geoms are usually group 3.
- Bounding boxes are fast but dangerous for hollow frames, windows, handles, and side plates. They collide as the filled AABB, not the visible object.
- Mesh collision on complex moving parts can be too exact or solver-hostile. Prefer simple physical proxies for contact-critical moving bodies, such as a slab for a flap card or cylinders for rolling contact, but keep them colliding.

## Reporting

Report the exact export command, the MuJoCo command/script, key numeric results, the most important contact pairs, and the rendered image paths. Say what was not verified. Never say "sim-ready" when only `forgecad run`, `forgecad check simready`, or a successful export was executed.
