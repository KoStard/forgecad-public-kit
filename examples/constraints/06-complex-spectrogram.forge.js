const width = param('width', 39);

/** Create an open polyline of `count` segments from startPoint to endPoint. */
function polyline(sk, startPoint, endPoint, count) {
  const points = [startPoint];
  const lines = [];
  for (let i = 0; i < count; i++) {
    const end = i === count - 1 ? endPoint : sk.point(0, 1);
    lines.push(sk.line(points[i], end));
    points.push(end);
  }
  sk.ccw(...points.slice(0, -1));
  return { points, lines };
}

function openRect(sk, points = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
  const vertices = points.map(([x, y]) => sk.point(x, y));
  const sides = [
    sk.line(vertices[0], vertices[1]),
    sk.line(vertices[1], vertices[2]),
    sk.line(vertices[2], vertices[3]),
    sk.line(vertices[3], vertices[0]),
  ];
  const shape = sk.shape(sides);
  sk.addLoop(vertices);
  return {
    vertices,
    sides,
    shape,
    vertex(index) {
      return vertices[((index % 4) + 4) % 4];
    },
    side(index) {
      return sides[((index % 4) + 4) % 4];
    },
  };
}

function mustRef(map, id, label) {
  const ref = map.get(id);
  if (!ref) {
    throw new Error(`Missing ${label}: ${id}`);
  }
  return ref;
}

function buildPrismHolder() {
  const sk = constrainedSketch();

  const inner = sk.addPolygon({ points: [[0, 0], [1, 1], [0, 5]], addLoop: false });
  sk.equal(inner.sides[0], inner.sides[1]);
  sk.equal(inner.sides[0], inner.sides[2]);
  sk.fix(inner.vertex(0));

  const outer = sk.addPolygon({ points: [[0, 0], [1, 1], [0, 5]], addLoop: false });
  sk.equal(outer.sides[0], outer.sides[1]);
  sk.equal(outer.sides[0], outer.sides[2]);

  sk.length(inner.sides[0], 22);
  sk.lineDistance(inner.sides[0], outer.sides[0], -2);
  sk.shapeEqualCentroid(inner.shape, outer.shape);
  sk.absoluteAngle(inner.sides[0], 46);

  const lightLeavingPoint = sk.point(0, 0);
  sk.pointOnLine(lightLeavingPoint, inner.sides[1]);
  sk.pointLineDistance(lightLeavingPoint, inner.sides[0], 8.42);

  return {
    sketch: sk.solve(),
    inner,
    outer,
    lightLeavingPoint,
  };
}

function buildCaseAndCamera(prismHolder) {
  const sk = constrainedSketch();
  const refs = sk.referenceAllFrom(prismHolder.sketch);

  const outerStart = mustRef(refs.points, prismHolder.outer.vertex(0), 'outer start');
  const outerEnd = mustRef(refs.points, prismHolder.outer.vertex(2), 'outer end');
  const outerSide0 = mustRef(refs.lines, prismHolder.outer.sides[0], 'outer side 0');
  const outerSide1 = mustRef(refs.lines, prismHolder.outer.sides[1], 'outer side 1');
  const lightLeavingPoint = mustRef(refs.points, prismHolder.lightLeavingPoint, 'light point');

  const outerChain = polyline(sk, outerStart, outerEnd, 5);
  sk.absoluteAngle(outerChain.lines[0], -90);
  sk.absoluteAngle(outerChain.lines[1], 0);
  sk.absoluteAngle(outerChain.lines[2], 90);
  sk.absoluteAngle(outerChain.lines[3], 180);
  sk.absoluteAngle(outerChain.lines[4], -90);

  const innerStart = sk.point(0, 0);
  sk.pointOnLine(innerStart, outerSide0);
  const innerEnd = sk.point(0, 0);
  sk.pointOnLine(innerEnd, outerSide1);
  const innerChain = polyline(sk, innerStart, innerEnd, 5);

  for (let i = 0; i < 5; i++) {
    sk.lineDistance(outerChain.lines[i], innerChain.lines[i], 5);
  }

  const attachMidpoint = sk.point(0, 0);
  const opening = openRect(sk);
  sk.parallel(opening.sides[0], opening.sides[2]);
  sk.parallel(opening.sides[1], opening.sides[3]);
  sk.length(opening.sides[0], 4);
  sk.perpendicular(opening.sides[0], opening.sides[1]);
  sk.lineDistance(opening.sides[0], innerChain.lines[2], 0);
  sk.lineDistance(opening.sides[2], outerChain.lines[2], 0);
  sk.midpoint(attachMidpoint, opening.sides[0]);
  sk.midpoint(attachMidpoint, innerChain.lines[2]);

  const outerCam = openRect(sk);
  sk.pointOnLine(outerCam.vertex(0), innerChain.lines[3]);
  sk.pointOnLine(outerCam.vertex(1), innerChain.lines[3]);
  sk.pointOnLine(outerCam.vertex(2), innerChain.lines[1]);
  sk.pointOnLine(outerCam.vertex(3), innerChain.lines[1]);
  sk.perpendicular(innerChain.lines[3], outerCam.sides[1]);
  sk.perpendicular(innerChain.lines[3], outerCam.sides[3]);

  const innerCam = openRect(sk);
  sk.lineDistance(outerCam.sides[0], innerCam.sides[0], 2);
  sk.lineDistance(outerCam.sides[1], innerCam.sides[1], 2);
  sk.lineDistance(outerCam.sides[2], innerCam.sides[2], 2);
  sk.lineDistance(outerCam.sides[3], innerCam.sides[3], 2);
  sk.lineDistance(innerCam.sides[1], innerCam.sides[3], 2);
  sk.lineDistance(innerCam.sides[3], innerChain.lines[2], -14);

  sk.length(outerCam.sides[1], width);

  const midpoint = sk.point(0, 0);
  sk.midpoint(midpoint, outerCam.sides[1]);
  const lightLine = sk.line(lightLeavingPoint, midpoint);
  sk.length(lightLine, 21.5);
  sk.perpendicular(lightLine, outerCam.sides[1]);

  return {
    sketch: sk.solve(),
  };
}

const prismHolder = buildPrismHolder();
const spectrometerBody = buildCaseAndCamera(prismHolder);

return [
  { name: '1 - Prism Holder', sketch: prismHolder.sketch },
  { name: '2 - Spectrometer Body', sketch: spectrometerBody.sketch },
];
