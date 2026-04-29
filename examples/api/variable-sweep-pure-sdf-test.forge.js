// Pure-SDF reference for the variableSweep taper test.
// If this renders with clean sidewalls while variable-sweep-test.forge.js does not,
// the artifact is in variableSweep()'s spine field construction rather than the
// shared SDF meshing pipeline.

const controlPoints = [
  [0, 0, 0],
  [20, 0, 10],
  [40, 10, 20],
  [60, 10, 30],
];

const spine = spline3d(controlPoints, { tension: 0.4 });
const pathPoints = spine.sample(160);

const cumulativeLengths = [0];
for (let index = 1; index < pathPoints.length; index += 1) {
  const [ax, ay, az] = pathPoints[index - 1];
  const [bx, by, bz] = pathPoints[index];
  cumulativeLengths.push(
    cumulativeLengths[cumulativeLengths.length - 1] + Math.hypot(bx - ax, by - ay, bz - az),
  );
}
const totalLength = cumulativeLengths[cumulativeLengths.length - 1];

const smallRadius = 3;
const largeRadius = 8;
const maxRadius = largeRadius;
const pad = maxRadius + 4;

let minX = Infinity;
let minY = Infinity;
let minZ = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
let maxZ = -Infinity;
for (const [x, y, z] of pathPoints) {
  minX = Math.min(minX, x);
  minY = Math.min(minY, y);
  minZ = Math.min(minZ, z);
  maxX = Math.max(maxX, x);
  maxY = Math.max(maxY, y);
  maxZ = Math.max(maxZ, z);
}

const pureSweepSdf = (x, y, z, pts, arc, totalLength, smallRadius, largeRadius) => {
    function clamp(v, lo, hi) {
      return Math.max(lo, Math.min(hi, v));
    }

    function catmullScalar(p0, p1, p2, p3, t0, t1, t2, t3, t) {
      const dt = Math.max(t2 - t1, 1e-9);
      const local = clamp((t - t1) / dt, 0, 1);
      const tt = local * local;
      const ttt = tt * local;
      const m1 = (p2 - p0) / Math.max(t2 - t0, 1e-9);
      const m2 = (p3 - p1) / Math.max(t3 - t1, 1e-9);
      const h00 = 2 * ttt - 3 * tt + 1;
      const h10 = ttt - 2 * tt + local;
      const h01 = -2 * ttt + 3 * tt;
      const h11 = ttt - tt;
      return h00 * p1 + h10 * dt * m1 + h01 * p2 + h11 * dt * m2;
    }

    function radiusAt(t) {
      const tc = clamp(t, 0, 1);
      if (tc <= 0) return smallRadius;
      if (tc >= 1) return smallRadius;
      if (tc <= 0.5) return catmullScalar(smallRadius, smallRadius, largeRadius, smallRadius, -0.5, 0, 0.5, 1, tc);
      return catmullScalar(smallRadius, largeRadius, smallRadius, smallRadius, 0, 0.5, 1, 1.5, tc);
    }

    let bestDist2 = Infinity;
    let bestIndex = 0;
    let bestSegmentT = 0;
    let bestPoint = pts[0];

    for (let index = 0; index < pts.length - 1; index += 1) {
      const a = pts[index];
      const b = pts[index + 1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dz = b[2] - a[2];
      const len2 = dx * dx + dy * dy + dz * dz;
      if (len2 < 1e-12) continue;

      const px = x - a[0];
      const py = y - a[1];
      const pz = z - a[2];
      const segT = clamp((px * dx + py * dy + pz * dz) / len2, 0, 1);
      const qx = a[0] + dx * segT;
      const qy = a[1] + dy * segT;
      const qz = a[2] + dz * segT;
      const rx = x - qx;
      const ry = y - qy;
      const rz = z - qz;
      const dist2 = rx * rx + ry * ry + rz * rz;

      if (dist2 < bestDist2) {
        bestDist2 = dist2;
        bestIndex = index;
        bestSegmentT = segT;
        bestPoint = [qx, qy, qz];
      }
    }

    const radiusT = (arc[bestIndex] + (arc[bestIndex + 1] - arc[bestIndex]) * bestSegmentT) / Math.max(totalLength, 1e-9);
    let sdfValue = Math.sqrt(bestDist2) - radiusAt(radiusT);

    if (bestIndex === 0 && bestSegmentT <= 1e-6) {
      const a = pts[0];
      const b = pts[1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dz = b[2] - a[2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len > 1e-9) {
        const tx = dx / len;
        const ty = dy / len;
        const tz = dz / len;
        const startCap = -((x - a[0]) * tx + (y - a[1]) * ty + (z - a[2]) * tz);
        sdfValue = Math.max(sdfValue, startCap);
      }
    } else if (bestIndex === pts.length - 2 && bestSegmentT >= 1 - 1e-6) {
      const a = pts[pts.length - 2];
      const b = pts[pts.length - 1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dz = b[2] - a[2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len > 1e-9) {
        const tx = dx / len;
        const ty = dy / len;
        const tz = dz / len;
        const endCap = (x - b[0]) * tx + (y - b[1]) * ty + (z - b[2]) * tz;
        sdfValue = Math.max(sdfValue, endCap);
      }
    }

    return sdfValue;
  };

const tapered = sdf.fromFunction(
  pureSweepSdf,
  {
    bounds: {
      min: [minX - pad, minY - pad, minZ - pad],
      max: [maxX + pad, maxY + pad, maxZ + pad],
    },
    constants: {
      pts: pathPoints,
      arc: cumulativeLengths,
      totalLength,
      smallRadius,
      largeRadius,
    },
  },
).toShape({ edgeLength: 0.8 });

return tapered.color('#8899aa');
