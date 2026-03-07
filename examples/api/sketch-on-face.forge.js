// Sketch on face — place 2D profiles onto canonical or tracked planar faces,
// then extrude along that face normal.

const body = box(140, 70, 44, true).color('#d5dbe3');

const frontBadge = roundedRect(30, 12, 2.5, true)
  .subtract(circle2d(2.5).translate(-8, 0))
  .subtract(circle2d(2.5).translate(8, 0))
  .onFace(body, 'front', { v: 10, protrude: 0.05 })
  .extrude(2.4)
  .color('#1d2733');

const topVent = union2d(
  rect(56, 6, true),
  rect(56, 6, true).translate(0, 10),
  rect(56, 6, true).translate(0, -10),
)
  .onFace(body, 'top', { v: 8, protrude: 0.05 })
  .extrude(1.5)
  .color('#55697e');

const sidePort = roundedRect(22, 10, 3, true)
  .onFace(body, 'right', { u: -8, v: 0, protrude: 0.05 })
  .extrude(3)
  .color('#20262e');

const trackedPanel = Rectangle2D.from3Points(
  point(-34, -18),
  point(30, -6),
  point(18, 26),
)
  .extrude(18)
  .translate(0, 92, 0)
  .color('#c4ccd6');

const trackedSideBadge = roundedRect(22, 8, 2, true)
  .onFace(trackedPanel, 'side-right', { v: -2, protrude: 0.05 })
  .extrude(1.4)
  .color('#27313c');

const trackedTopCap = circle2d(5)
  .onFace(trackedPanel.face('top'), { u: 12, protrude: 0.05 })
  .extrude(1.2)
  .color('#5a6c7c');

cutPlane('Center X', [1, 0, 0], 0);

return [
  { name: 'Body', shape: body },
  { name: 'Front Badge', shape: frontBadge },
  { name: 'Top Vent', shape: topVent },
  { name: 'Side Port', shape: sidePort },
  { name: 'Tracked Panel', shape: trackedPanel },
  { name: 'Tracked Side Badge', shape: trackedSideBadge },
  { name: 'Tracked Top Cap', shape: trackedTopCap },
];
