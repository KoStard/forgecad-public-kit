const base = box(84, 54, 24, true);

const pocket = roundedRect(20, 10, 2, true)
  .onFace(base, 'top', { u: 12, v: -8, selfAnchor: 'center' });

const gusset = roundedRect(14, 8, 1.5, true)
  .onFace(base, 'front', { u: -14, v: 2, protrude: 0.25, selfAnchor: 'center' })
  .extrude(8);

const body = filletEdge(base.toShape(), base.edge('vert-br'), 6, [-1, -1])
  .add(gusset)
  .hole(base.face('top'), { diameter: 6, u: -18, v: 10, depth: 9 })
  .cutout(pocket, { depth: 5 })
  .subtract(cylinder(28, 4, undefined, undefined, true).translate(0, -20, 0));

return [{ name: 'Edge Finished Mount', shape: body }];
