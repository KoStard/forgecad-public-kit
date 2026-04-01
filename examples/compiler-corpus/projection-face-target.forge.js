// Guard part: projection onto a defended descendant face after shell/hole/cut operations.
//
// Demonstrates face-to-plane projection: projectToPlane(shape, { face: shape.face(name) })
// keeps compiler-owned replay provenance even when the target plane is a descendant region,
// not a hardcoded coordinate plane.

const body = roundedRect(90, 56, 6, true).extrude(22).shell(3, { openFaces: ['top'] });

// Project the shelled body onto its own inner-bottom face.
// This is "face-to-plane" projection: the target plane is a defended descendant region,
// not a coordinate plane. The compiler preserves projection provenance (targetFaceQuery)
// so later downstream features can explain which surface they originated from.
const innerBottom = body.face('inner-bottom');
const projected = projectToPlane(body, { face: innerBottom });

// Downstream gasket ring: inset 4 mm from the projected silhouette, placed on inner-bottom.
const ring = projected.offset(-4).onFace(innerBottom, { protrude: 0.1 }).extrude(2);

// Mount pad: boss placed on the inner-bottom, driven by outer face reference.
const mountPad = roundedRect(16, 10, 2, true)
  .onFace(innerBottom, { u: -24, v: 0, protrude: 0.1, selfAnchor: 'center' })
  .extrude(3);

return [{ name: 'Projection Face Target', shape: union(body, ring, mountPad) }];
