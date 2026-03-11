type Vec2 = [number, number];
type Vec3 = [number, number, number];
type Loop2D = Vec2[];

type SignedLoop = { pts: Loop2D; area: number };

export interface LevelSetInput {
  sdf: (point: Vec3) => number;
  bounds: { min: Vec3; max: Vec3 };
  edgeLength: number;
}

interface SweepSegment {
  a: Vec3;
  t: Vec3;
  x: Vec3;
  y: Vec3;
  len: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vec3Len(v: Vec3): number {
  return Math.sqrt(vec3Dot(v, v));
}

function vec3Norm(v: Vec3): Vec3 {
  const len = vec3Len(v);
  if (len < 1e-9) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function signedArea2D(loop: Loop2D): number {
  let area = 0;
  for (let index = 0; index < loop.length; index += 1) {
    const [x1, y1] = loop[index];
    const [x2, y2] = loop[(index + 1) % loop.length];
    area += x1 * y2 - x2 * y1;
  }
  return area * 0.5;
}

function pointInLoop(point: Vec2, loop: Loop2D): boolean {
  let inside = false;
  const [px, py] = point;
  for (let index = 0, prev = loop.length - 1; index < loop.length; prev = index, index += 1) {
    const [xi, yi] = loop[index];
    const [xj, yj] = loop[prev];
    const intersects = ((yi > py) !== (yj > py))
      && (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-20) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointSegDist2D(point: Vec2, a: Vec2, b: Vec2): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const apx = point[0] - a[0];
  const apy = point[1] - a[1];
  const den = abx * abx + aby * aby;
  const t = den < 1e-12 ? 0 : clamp((apx * abx + apy * aby) / den, 0, 1);
  const qx = a[0] + abx * t;
  const qy = a[1] + aby * t;
  const dx = point[0] - qx;
  const dy = point[1] - qy;
  return Math.sqrt(dx * dx + dy * dy);
}

function loopSignedDistance(point: Vec2, loop: Loop2D): number {
  let minDist = Infinity;
  for (let index = 0; index < loop.length; index += 1) {
    const a = loop[index];
    const b = loop[(index + 1) % loop.length];
    minDist = Math.min(minDist, pointSegDist2D(point, a, b));
  }
  return pointInLoop(point, loop) ? minDist : -minDist;
}

function compilePolygonsSdf(polygons: Vec2[][]): (x: number, y: number) => number {
  const loops: SignedLoop[] = polygons
    .filter((loop) => Array.isArray(loop) && loop.length >= 3)
    .map((loop) => ({ pts: loop.map(([x, y]) => [x, y]), area: signedArea2D(loop) }));

  if (loops.length === 0) {
    return () => -1;
  }

  return (x: number, y: number): number => {
    const point: Vec2 = [x, y];
    let field = -Infinity;
    for (const loop of loops) {
      const loopField = loopSignedDistance(point, loop.pts);
      field = loop.area >= 0
        ? Math.max(field, loopField)
        : Math.min(field, -loopField);
    }
    return field;
  };
}

function makeSweepFrame(tangent: Vec3, preferredUp: Vec3): { x: Vec3; y: Vec3 } {
  let up = vec3Norm(preferredUp);
  if (Math.abs(vec3Dot(up, tangent)) > 0.95) {
    up = Math.abs(tangent[2]) < 0.95 ? [0, 0, 1] : [0, 1, 0];
  }
  let x = vec3Norm(vec3Cross(up, tangent));
  if (vec3Len(x) < 1e-8) {
    const fallback: Vec3 = Math.abs(tangent[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    x = vec3Norm(vec3Cross(fallback, tangent));
  }
  const y = vec3Norm(vec3Cross(tangent, x));
  return { x, y };
}

export function buildLoftLevelSetInput(
  profilePolygons: Vec2[][][],
  heights: number[],
  options: { edgeLength: number; boundsPadding: number },
): LevelSetInput {
  if (profilePolygons.length < 2) {
    throw new Error('loft requires at least two compileable profiles');
  }
  if (profilePolygons.length !== heights.length) {
    throw new Error('loft compile data requires heights.length === profiles.length');
  }

  const sdfs = profilePolygons.map((polygons) => compilePolygonsSdf(polygons));
  const zs = heights.map((height) => height);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygons of profilePolygons) {
    for (const loop of polygons) {
      for (const [x, y] of loop) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const zMin = zs[0];
  const zMax = zs[zs.length - 1];
  const pad = options.boundsPadding;

  return {
    sdf: ([x, y, z]) => {
      let crossField: number;
      if (z <= zMin) {
        crossField = sdfs[0](x, y);
      } else if (z >= zMax) {
        crossField = sdfs[sdfs.length - 1](x, y);
      } else {
        let segment = 0;
        while (segment + 1 < zs.length && z > zs[segment + 1]) segment += 1;
        const z0 = zs[segment];
        const z1 = zs[segment + 1];
        const t = (z - z0) / (z1 - z0);
        const f0 = sdfs[segment](x, y);
        const f1 = sdfs[segment + 1](x, y);
        crossField = f0 * (1 - t) + f1 * t;
      }

      const zCap = Math.min(z - zMin, zMax - z);
      return Math.min(crossField, zCap);
    },
    bounds: {
      min: [minX - pad, minY - pad, zMin - pad],
      max: [maxX + pad, maxY + pad, zMax + pad],
    },
    edgeLength: options.edgeLength,
  };
}

export function buildSweepLevelSetInput(
  profilePolygons: Vec2[][],
  pathPoints: Vec3[],
  options: {
    edgeLength: number;
    boundsPadding: number;
    up: Vec3;
  },
): LevelSetInput {
  if (pathPoints.length < 2) {
    throw new Error('sweep requires a path with at least two points');
  }

  const profileSdf = compilePolygonsSdf(profilePolygons);
  const segments: SweepSegment[] = [];
  for (let index = 0; index < pathPoints.length - 1; index += 1) {
    const a = pathPoints[index];
    const b = pathPoints[index + 1];
    const delta = vec3Sub(b, a);
    const len = vec3Len(delta);
    if (len < 1e-6) continue;
    const tangent = vec3Scale(delta, 1 / len);
    const frame = makeSweepFrame(tangent, options.up);
    segments.push({ a, t: tangent, x: frame.x, y: frame.y, len });
  }
  if (segments.length === 0) {
    throw new Error('sweep path has no non-zero segments');
  }

  let profileRadius = 0;
  for (const loop of profilePolygons) {
    for (const [x, y] of loop) {
      profileRadius = Math.max(profileRadius, Math.abs(x), Math.abs(y));
    }
  }

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

  const pad = Math.max(options.boundsPadding, profileRadius);

  return {
    sdf: (point) => {
      let field = -Infinity;
      for (const segment of segments) {
        const v = vec3Sub(point, segment.a);
        const w = vec3Dot(v, segment.t);
        const u = vec3Dot(v, segment.x);
        const q = vec3Dot(v, segment.y);
        const profileField = profileSdf(u, q);
        const capField = Math.min(w, segment.len - w);
        field = Math.max(field, Math.min(profileField, capField));
      }
      return field;
    },
    bounds: {
      min: [minX - pad, minY - pad, minZ - pad],
      max: [maxX + pad, maxY + pad, maxZ + pad],
    },
    edgeLength: options.edgeLength,
  };
}
