---
skill-group: recipes
skill-order: 5
---

# Joint Design Recipes

Geometry recipes for joints that actually rotate without binding — clevis-tongue hinges, hinge chains, hard stops.

Anything that must rotate or slide gets connector frames: `origin` = pivot, `axis` = hinge line, `up` = rest twist. Always set `up` on hinges, wheels, and levers. Connector/link/mate semantics and mirrored-axis sign rules: see the assembly API reference.

## The Cavity Rule

Every joint is a **cavity** in one part plus a **tenon** in the other, and the cavity must be a real empty volume — not a gap implied by separate solids. A body that runs solid through the joint zone (e.g. a stadium cap under the clevis slot) blocks rotation even though the rest pose looks fine. End the body FLAT before the joint; extend the tines forward to the pivot; the inter-tine volume must be genuinely empty.

Diagnostic: adjacent-part collision volume > expected clearance in `forgecad run` = missing cavity (both parts have solid material at the joint position). After fixing, the collision volume should drop to ~0 (or a few mm³ of clearance overlap).

## Structural Sizing

**Yoke (connecting cantilevers).** Clevis tines at Y = ±Y_OFF are physically disconnected from a body of thickness TONG_T when Y_OFF > TONG_T/2 + clearance — the tines float and would snap under load. Always bridge with a yoke slab spanning the full clevis width, `(Y_OFF + TINE_T/2) * 2`, with a few mm of structural overlap along the joint axis, so material runs continuously from body to each tine.

**Knuckle radius.** For body height H, require `KNUCK_R >= H/2`. Smaller, and the body corners protrude past the knuckle's cylindrical envelope and sweep into the adjacent part during rotation. `KNUCK_R = H/2` makes the body cross-section a stadium that exactly fits the envelope.

## Hard Stops vs Slider Limits

Declared joint min/max are not geometry — they only constrain the viewport slider; the geometry still permits any rotation. A physical stop requires an interfering protrusion:

- **Extension stop at 0°**: a small lip on the dorsal side of the child's proximal end, sized to just touch the parent's distal dorsal corner at 0°; backbending is then blocked by contact.
- **Flexion stop at θmax**: a palmar lip, or body-on-body contact when bodies meet.

Verify: ~0 mm³ collision exactly at the limit pose (just touching), non-zero past it.

## Verification Workflow

Check the loop, not just the rest pose:

1. Build at rest; `forgecad run`; check collision volumes.
2. Overlap > clearance volume between joint neighbors → apply the cavity rule.
3. Render each part with `--focus PartName`; the clevis end must show a visible gap between tines.
4. Re-check at swept angles (30°/60°/90°) — rotation reveals collisions the rest pose hides.
5. Backbend test at -10°: blocked = hard stop exists; rotates = add a stop.
