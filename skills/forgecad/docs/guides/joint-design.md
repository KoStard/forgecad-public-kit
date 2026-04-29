---
skill-group: recipes
skill-order: 5
---

# Joint Design Recipes

How to build mechanical joints — clevis-tongue hinges, ball-and-socket, dovetails — that actually rotate without binding and stop where they should.

## The Cavity Rule

Every mechanical joint has a **cavity** in one part and a **tenon** in the other. The cavity must be a real empty volume — not a gap implied by the absence of two separate solids.

If two adjacent parts in an assembly show a collision volume larger than the expected clearance volume in `forgecad run`, one part is missing its cavity. Both parts have solid material at the same joint position. This will look fine at rest pose but will block rotation and produce confusing joint behavior.

```ts
// BAD — body has a stadium cap at both ends; the "slot" between two clevis tines
// is just empty space next to a solid body cap. The next phalanx's tongue knuckle
// has nowhere to go (it intersects the previous body's cap).
const body  = stadiumBar(L);            // cap at X=0 AND X=L
const tine1 = box(...).translate(L,  Y_OFF, 0);
const tine2 = box(...).translate(L, -Y_OFF, 0);
let phalanx = union(body, tine1, tine2);

// GOOD — body ends FLAT before the joint. Tines extend forward to the pivot.
// The X = L-KNUCK_R..L+KNUCK_R volume between the tines is genuinely empty.
const body = box(L - KNUCK_R, TONG_T, H).translate((L - KNUCK_R) / 2, 0, -H / 2);
const tongueKnuckle = knuckleDisc(0, 0, TONG_T);  // proximal cap only
let phalanx = union(tongueKnuckle, body, tine1, tine2, ...tineCaps);
```

After applying the cavity rule, `forgecad run` collision volume between adjacent parts in a clevis-tongue chain should drop to **zero** (or a few mm³ of clearance overlap). If it doesn't, there's still solid material where there should be a cavity.

## Connecting Cantilevers

A clevis tine arm at Y=±Y_OFF is geometrically separate from a body at Y=±TONG_T/2. With Y_OFF > TONG_T/2 + clearance, there is a **physical gap** between them. The tines float — they would snap off as soon as load is applied.

Always add a **yoke**: a short slab spanning the full clevis width, sitting between the body's flat distal end and the tines' attachment point. The yoke fills the Y gap so material is continuous from the body through to each tine.

```ts
const yokeLen   = 3;                                  // a few mm of structural overlap
const yokeStart = L - KNUCK_R - yokeLen;
const totalY    = (Y_OFF + TINE_T / 2) * 2;           // full clevis width
const yoke = box(yokeLen, totalY, H)
  .translate(yokeStart + yokeLen / 2, 0, -H / 2);
phalanx = union(phalanx, yoke);
```

## Hard Stops vs Slider Limits

`addRevolute({ min: 0, max: 90 })` sets **slider limits** — the viewport won't let the user drag past them, but the geometry permits any rotation. There is no physical stop.

For a **geometric** hard stop (parts can't backbend past extension, or can't curl past full closure), add a small protrusion on one part that interferes with the other at the limit angle:

- **Extension stop at 0°** (typical for fingers, knees, elbows): add a small "lip" on the dorsal side of the proximal end of the child phalanx, sized so it just touches the parent's distal dorsal corner at 0°. Negative rotation (backbending) is then blocked by part-on-part contact.
- **Flexion stop at θmax**: add a similar lip on the palmar side, or rely on the body-to-body collision when bodies meet.

Verify with `forgecad run` at the limit poses — the contact pair should show ~0 mm³ collision (just touching), and rotation past the limit should report a non-zero collision volume.

## Knuckle Sizing

For a clevis-tongue joint with body height H, the tongue knuckle radius and clevis tine knuckle radius must satisfy:

```
KNUCK_R >= H / 2
```

If the knuckle radius is smaller than the body's half-height, the body's corners protrude beyond the knuckle envelope. When the joint rotates, those corners sweep through space outside the cylindrical envelope and collide with the adjacent part.

Setting `KNUCK_R = H / 2` exactly makes the body cross-section a stadium that perfectly fits the knuckle envelope.

## Verification Workflow

1. Build the joint at rest pose. Run `forgecad run`. Check collision volumes.
2. If adjacent parts in the joint show > clearance-volume of overlap → missing cavity (apply the cavity rule).
3. Render with `--focus PartName` to inspect each part in isolation. The clevis end should clearly show a gap between the tines (the cavity).
4. Render at curl angles (set joint debug params) at 30°, 60°, 90°. No new collisions should appear from rotation.
5. Render at -10° (backbend test). Either no rotation possible (geometric stop in place) or rotation occurs and you need to add a stop.
