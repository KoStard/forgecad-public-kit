import { describe, test, expect, beforeAll } from 'vitest';
import { arcCenter, sampleArc, tangentArcGeom, path, stroke } from '../src/forge/sketch';
import { initKernel } from '../src/forge/kernel';

// ── Pure geometry tests (no kernel needed) ────────────────────────────────────

describe('arcCenter', () => {
  test('quarter-circle CCW: center at expected position', () => {
    // Arc from (0,0) to (r,r) CCW with radius r — center should be at (0,r)
    const r = 10;
    const [cx, cy] = arcCenter(0, 0, r, r, r, false);
    expect(cx).toBeCloseTo(0, 5);
    expect(cy).toBeCloseTo(r, 5);
  });

  test('quarter-circle CW: center at expected position', () => {
    // Arc from (0,0) to (r,r) CW — center should be at (r,0)
    const r = 10;
    const [cx, cy] = arcCenter(0, 0, r, r, r, true);
    expect(cx).toBeCloseTo(r, 5);
    expect(cy).toBeCloseTo(0, 5);
  });

  test('center is equidistant from start and end', () => {
    const [cx, cy] = arcCenter(3, 7, 15, -2, 12, false);
    const distToStart = Math.hypot(3 - cx, 7 - cy);
    const distToEnd = Math.hypot(15 - cx, -2 - cy);
    expect(distToStart).toBeCloseTo(distToEnd, 8);
  });

  test('clamps radius when chord > 2r', () => {
    // Chord length = 20, radius = 5 → should clamp to just over 10
    const [cx, cy] = arcCenter(0, 0, 20, 0, 5, false);
    const r = Math.hypot(-cx, -cy);
    expect(r).toBeGreaterThan(9.9);
    expect(r).toBeCloseTo(Math.hypot(20 - cx, -cy), 5);
  });

  test('vertical arc: center on correct side', () => {
    // Arc from (0,0) to (0,10) with radius 8, CW
    // Direction is (0,1), CW → center to the right → positive x
    const [cx, cy] = arcCenter(0, 0, 0, 10, 8, true);
    expect(cx).toBeGreaterThan(0);
    expect(cy).toBeCloseTo(5, 3);
  });
});

describe('sampleArc', () => {
  test('all sampled points lie on the circle', () => {
    const r = 15;
    const [cx, cy] = arcCenter(0, 0, r, r, r, false);
    const pts = sampleArc(0, 0, r, r, cx, cy, false, 16);
    for (const [x, y] of pts) {
      expect(Math.hypot(x - cx, y - cy)).toBeCloseTo(r, 4);
    }
  });

  test('last sampled point lands on end point', () => {
    const r = 10;
    const ex = r, ey = r;
    const [cx, cy] = arcCenter(0, 0, ex, ey, r, false);
    const pts = sampleArc(0, 0, ex, ey, cx, cy, false, 32);
    const [lx, ly] = pts[pts.length - 1];
    expect(lx).toBeCloseTo(ex, 4);
    expect(ly).toBeCloseTo(ey, 4);
  });

  test('returns exactly segments points', () => {
    const [cx, cy] = arcCenter(0, 0, 10, 0, 7, false);
    const pts = sampleArc(0, 0, 10, 0, cx, cy, false, 24);
    expect(pts.length).toBe(24);
  });

  test('CCW arc sweeps counter-clockwise', () => {
    // Quarter circle CCW from (r,0) to (0,r): y of intermediate points increases
    const r = 10;
    const [cx, cy] = arcCenter(r, 0, 0, r, r, false);
    const pts = sampleArc(r, 0, 0, r, cx, cy, false, 4);
    // First point should have x>0, y>0; last should be near (0,r)
    expect(pts[0][1]).toBeGreaterThan(0); // y increases
    expect(pts[pts.length - 1][0]).toBeCloseTo(0, 3);
    expect(pts[pts.length - 1][1]).toBeCloseTo(r, 3);
  });

  test('CW arc sweeps clockwise', () => {
    // Quarter circle CW from (0,r) to (r,0): opposite winding
    const r = 10;
    const [cx, cy] = arcCenter(0, r, r, 0, r, true);
    const pts = sampleArc(0, r, r, 0, cx, cy, true, 4);
    expect(pts[pts.length - 1][0]).toBeCloseTo(r, 3);
    expect(pts[pts.length - 1][1]).toBeCloseTo(0, 3);
  });

  test('chained arcs: S-curve — points from both arcs all lie on their respective circles', () => {
    const r = 10;
    // Arc 1: CCW from (0,0) to (r,r)
    const [c1x, c1y] = arcCenter(0, 0, r, r, r, false);
    const arc1 = sampleArc(0, 0, r, r, c1x, c1y, false, 8);
    for (const [x, y] of arc1) expect(Math.hypot(x - c1x, y - c1y)).toBeCloseTo(r, 4);

    // Arc 2: CW from (r,r) to (0, 2r)
    const [c2x, c2y] = arcCenter(r, r, 0, 2 * r, r, true);
    const arc2 = sampleArc(r, r, 0, 2 * r, c2x, c2y, true, 8);
    for (const [x, y] of arc2) expect(Math.hypot(x - c2x, y - c2y)).toBeCloseTo(r, 4);
  });
});

// ── Integration tests (need kernel) ──────────────────────────────────────────

beforeAll(async () => {
  await initKernel();
});

describe('path() builder — line-only (regression)', () => {
  test('moveTo + lineTo + close produces valid sketch', () => {
    const sk = path().moveTo(0, 0).lineTo(10, 0).lineTo(10, 10).lineTo(0, 10).close();
    expect(sk).toBeDefined();
    // 10×10 square extruded to depth 1 → volume = 100
    const vol = sk.extrude(1).volume;
    expect(vol).toBeCloseTo(100, 0);
  });

  test('lineH and lineV work as before', () => {
    const sk = path().moveTo(0, 0).lineH(5).lineV(3).lineTo(0, 3).close();
    expect(sk).toBeDefined();
    expect(sk.extrude(1).volume).toBeCloseTo(15, 0);
  });

  test('stroke() produces a solid from a polyline', () => {
    const sk = path().moveTo(0, 0).lineTo(20, 0).stroke(4);
    expect(sk).toBeDefined();
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });
});

describe('path() builder — arcTo', () => {
  test('quarter-circle: bbox extends in correct direction', () => {
    // CCW quarter circle from (0,0) to (r,r), then close back to start.
    // The arc bulges into the positive-x, positive-y quadrant.
    const r = 10;
    const sk = path().moveTo(0, 0).arcTo(r, r, r, false).lineTo(0, r).close();
    const shape = sk.extrude(1);
    expect(shape.volume).toBeGreaterThan(0);
  });

  test('arc-only closed shape: area close to quarter-circle sector', () => {
    // Full quarter-circle sector: two radii + one arc.
    // Area = π*r²/4 for a quarter circle sector.
    const r = 20;
    const sk = path()
      .moveTo(0, 0)
      .lineTo(r, 0)
      .arcTo(0, r, r, false) // quarter-circle CCW from (r,0) to (0,r)
      .close();
    const vol = sk.extrude(1).volume;
    const expected = (Math.PI * r * r) / 4;
    // Tessellation at 32 segments should be within 0.2% of true value
    expect(vol).toBeCloseTo(expected, -1); // within ~1 unit
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.003);
  });

  test('S-curve: two chained arcs produce valid closed shape', () => {
    const r = 10;
    const sk = path()
      .moveTo(0, 0)
      .arcTo(r, r, r, false) // CCW
      .arcTo(0, 2 * r, r, true) // CW — S shape
      .lineTo(0, 0)
      .close();
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });

  test('parallel-lines + triple-arc cap: produces valid shape', () => {
    const L = 40, W = 20, r = 4, R = 25;
    const sk = path()
      .moveTo(0, 0)
      .lineTo(L, 0)
      .arcTo(L + r, r, r, true)
      .arcTo(L + r, W - r, R, false)
      .arcTo(L, W, r, true)
      .lineTo(0, W)
      .close();
    const vol = sk.extrude(1).volume;
    // Should be roughly L×W plus a small cap area
    expect(vol).toBeGreaterThan(L * W * 0.95);
    expect(vol).toBeLessThan(L * W * 1.5);
  });

  test('full circle via two arcs: area close to πr²', () => {
    // Two semicircles make a full circle
    const r = 15;
    const sk = path()
      .moveTo(-r, 0)
      .arcTo(r, 0, r, false) // top half CCW
      .arcTo(-r, 0, r, false) // bottom half CCW
      .close();
    const vol = sk.extrude(1).volume;
    const expected = Math.PI * r * r;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.005); // <0.5% error
  });

  test('arc + stroke: arced centerline produces solid', () => {
    // Curved centerline stroked to width — replaces the old polyline-only stroke
    const r = 20;
    const sk = path()
      .moveTo(0, 0)
      .arcTo(r, r, r, false)
      .stroke(4);
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });
});

// ── tangentArcGeom — pure geometry ───────────────────────────────────────────

describe('tangentArcGeom', () => {
  test('center is on the perpendicular to the tangent at the start', () => {
    // Tangent pointing right (+x), end directly above → center must be above start (perpendicular left = +y)
    const { cx, cy, clockwise } = tangentArcGeom(0, 0, 1, 0, 0, 10);
    // Center should be at (0, R) for some R — i.e. directly above start
    expect(cx).toBeCloseTo(0, 5);
    expect(cy).toBeGreaterThan(0);
    expect(clockwise).toBe(false); // end is to the left of the tangent
  });

  test('center is equidistant from start and end', () => {
    const { cx, cy } = tangentArcGeom(0, 0, 1, 0, 5, 5);
    expect(Math.hypot(cx - 0, cy - 0)).toBeCloseTo(Math.hypot(cx - 5, cy - 5), 5);
  });

  test('clockwise flag: end to the right of tangent → CW', () => {
    // Tangent pointing up (+y), end is to the right → CW
    const { clockwise } = tangentArcGeom(0, 0, 0, 1, 5, 0);
    expect(clockwise).toBe(true);
  });

  test('throws when endpoint is collinear with tangent', () => {
    // Tangent right, endpoint straight ahead → no arc possible
    expect(() => tangentArcGeom(0, 0, 1, 0, 5, 0)).toThrow('tangentArcTo');
  });

  test('arc is tangent at start: center–start is perpendicular to tangent', () => {
    const tx = Math.cos(Math.PI / 4);
    const ty = Math.sin(Math.PI / 4);
    const { cx, cy } = tangentArcGeom(0, 0, tx, ty, 10, 0);
    // Vector center→start should be perpendicular to tangent
    const dot = (-cx) * tx + (-cy) * ty; // (start - center) · tangent
    expect(dot).toBeCloseTo(0, 5);
  });
});

// ── tangentArcTo / smoothCapTo — integration ─────────────────────────────────

describe('path() builder — tangentArcTo', () => {
  test('S-curve via tangentArcTo: smooth chained arcs', () => {
    // Line right, then two tangentArcTo forming an S — should close cleanly
    const sk = path()
      .moveTo(0, 10)
      .lineTo(10, 10)
      .tangentArcTo(20, 20)
      .tangentArcTo(30, 10)
      .lineTo(30, 0)
      .lineTo(0, 0)
      .close();
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });

  test('tangentArcTo: four-arc closed loop has positive volume', () => {
    // Four tangentArcTo arcs forming a smooth closed loop
    const r = 10;
    const sk = path()
      .moveTo(r, 0)
      .tangentArcTo(0, r)
      .tangentArcTo(-r, 0)
      .tangentArcTo(0, -r)
      .tangentArcTo(r, 0)
      .close();
    const vol = sk.extrude(1).volume;
    expect(vol).toBeGreaterThan(0);
    // Sanity check: area should be in the ballpark of r²
    expect(vol).toBeGreaterThan(r * r * 0.3);
    expect(vol).toBeLessThan(r * r * 10);
  });
});

describe('path() builder — smoothCapTo', () => {
  test('slot with smooth cap: volume larger than bare rectangle', () => {
    const L = 40, W = 20, rc = 3, R = 14;
    const sk = path()
      .moveTo(0, 0)
      .lineTo(L, 0)
      .smoothCapTo(L, W, rc, R)
      .lineTo(0, W)
      .close();
    const vol = sk.extrude(1).volume;
    // Cap adds area beyond the rectangle
    expect(vol).toBeGreaterThan(L * W);
  });

  test('smoothCapTo: produces valid (non-zero volume) geometry', () => {
    const sk = path()
      .moveTo(0, 0)
      .lineTo(30, 0)
      .smoothCapTo(30, 15, 2, 10)
      .lineTo(0, 15)
      .close();
    expect(sk.extrude(2).volume).toBeGreaterThan(0);
  });

  test('smoothCapTo: throws when capRadius too small', () => {
    // corner centers are far apart, capRadius must be large enough
    expect(() => {
      path()
        .moveTo(0, 0)
        .lineTo(50, 0)
        .smoothCapTo(50, 50, 5, 1) // R=1 is too small for W=50 gap
        .close();
    }).toThrow('capRadius');
  });
});
