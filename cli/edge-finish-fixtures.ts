export const FILLET_EDGE_WORKFLOW_CODE = `
const base = box(72, 46, 24, true);
const pocket = roundedRect(18, 10, 2, true)
  .onFace(base, 'top', { u: 12, v: -6, selfAnchor: 'center' });
const body = filletEdge(base.toShape(), base.edge('vert-br'), 6, [-1, -1])
  .hole(base.face('top'), { diameter: 6, u: -16, v: 8, depth: 10 })
  .cutout(pocket, { depth: 5 })
  .subtract(cylinder(30, 3.5, undefined, undefined, true).translate(0, -18, 0));
return [{ name: 'Filleted Body', shape: body }];
`;

export const CHAMFER_EDGE_WORKFLOW_CODE = `
const base = box(68, 40, 22, true);
const rib = roundedRect(12, 6, 1.5, true)
  .onFace(base, 'front', { u: -10, v: 2, protrude: 0.25, selfAnchor: 'center' })
  .extrude(6);
const body = chamferEdge(base.toShape(), base.edge('vert-tl'), 4, [1, 1])
  .add(rib)
  .hole(base.face('top'), { diameter: 5, u: 14, v: -6, depth: 9 });
return [{ name: 'Chamfered Body', shape: body }];
`;
