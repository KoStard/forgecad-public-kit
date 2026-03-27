import { describe, test, expect, beforeAll } from 'vitest';
import {
  arcCenter, sampleArc, tangentArcGeom, sampleBezier,
  adaptiveArcSegments, sampleCatmullRomSegment, path, stroke,
} from '../src/forge/sketch';
import { initKernel } from '../src/forge/kernel';

// ── Pure geometry tests (no kernel needed) ────────────────────────────────────

describe('arcCenter', () => {
  test('quarter-circle CCW: center at expected position', () => {
    const r = 10;
    const [cx, cy] = arcCenter(0, 0, r, r, r, false);
    expect(cx).toBeCloseTo(0, 5);
    expect(cy).toBeCloseTo(r, 5);
  });

  test('quarter-circle CW: center at expected position', () => {
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
    const [cx, cy] = arcCenter(0, 0, 20, 0, 5, false);
    const r = Math.hypot(-cx, -cy);
    expect(r).toBeGreaterThan(9.9);
    expect(r).toBeCloseTo(Math.hypot(20 - cx, -cy), 5);
  });

  test('vertical arc: center on correct side', () => {
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
    const [cx, cy] = arcCenter(0, 0, r, r, r, false);
    const pts = sampleArc(0, 0, r, r, cx, cy, false, 32);
    const [lx, ly] = pts[pts.length - 1];
    expect(lx).toBeCloseTo(r, 4);
    expect(ly).toBeCloseTo(r, 4);
  });

  test('returns exactly segments points', () => {
    const [cx, cy] = arcCenter(0, 0, 10, 0, 7, false);
    const pts = sampleArc(0, 0, 10, 0, cx, cy, false, 24);
    expect(pts.length).toBe(24);
  });

  test('CCW arc sweeps counter-clockwise', () => {
    const r = 10;
    const [cx, cy] = arcCenter(r, 0, 0, r, r, false);
    const pts = sampleArc(r, 0, 0, r, cx, cy, false, 4);
    expect(pts[0][1]).toBeGreaterThan(0);
    expect(pts[pts.length - 1][0]).toBeCloseTo(0, 3);
    expect(pts[pts.length - 1][1]).toBeCloseTo(r, 3);
  });

  test('CW arc sweeps clockwise', () => {
    const r = 10;
    const [cx, cy] = arcCenter(0, r, r, 0, r, true);
    const pts = sampleArc(0, r, r, 0, cx, cy, true, 4);
    expect(pts[pts.length - 1][0]).toBeCloseTo(r, 3);
    expect(pts[pts.length - 1][1]).toBeCloseTo(0, 3);
  });

  test('chained arcs: S-curve — points all lie on their circles', () => {
    const r = 10;
    const [c1x, c1y] = arcCenter(0, 0, r, r, r, false);
    const arc1 = sampleArc(0, 0, r, r, c1x, c1y, false, 8);
    for (const [x, y] of arc1) expect(Math.hypot(x - c1x, y - c1y)).toBeCloseTo(r, 4);

    const [c2x, c2y] = arcCenter(r, r, 0, 2 * r, r, true);
    const arc2 = sampleArc(r, r, 0, 2 * r, c2x, c2y, true, 8);
    for (const [x, y] of arc2) expect(Math.hypot(x - c2x, y - c2y)).toBeCloseTo(r, 4);
  });
});

// ── Adaptive tessellation ────────────────────────────────────────────────────

describe('adaptiveArcSegments', () => {
  test('small radius → more segments per radian', () => {
    const small = adaptiveArcSegments(1, Math.PI / 2);
    const big = adaptiveArcSegments(100, Math.PI / 2);
    // Small radius needs proportionally more segments
    expect(small).toBeGreaterThanOrEqual(4);
    expect(big).toBeGreaterThan(small);
  });

  test('larger sweep → more segments', () => {
    const quarter = adaptiveArcSegments(10, Math.PI / 2);
    const full = adaptiveArcSegments(10, 2 * Math.PI);
    expect(full).toBeGreaterThan(quarter);
  });

  test('returns at least 4 segments', () => {
    expect(adaptiveArcSegments(1000, 0.01)).toBeGreaterThanOrEqual(4);
  });

  test('returns at most 256 segments', () => {
    expect(adaptiveArcSegments(0.001, 2 * Math.PI)).toBeLessThanOrEqual(256);
  });
});

// ── sampleBezier ─────────────────────────────────────────────────────────────

describe('sampleBezier', () => {
  test('endpoints are correct', () => {
    const pts = sampleBezier(0, 0, 5, 10, 15, 10, 20, 0, 20);
    expect(pts[pts.length - 1][0]).toBeCloseTo(20, 4);
    expect(pts[pts.length - 1][1]).toBeCloseTo(0, 4);
  });

  test('straight-line bezier produces collinear points', () => {
    // Control points on the line from (0,0) to (10,0)
    const pts = sampleBezier(0, 0, 3, 0, 7, 0, 10, 0, 10);
    for (const [, y] of pts) expect(Math.abs(y)).toBeLessThan(1e-6);
  });

  test('symmetric bezier has peak in the middle range', () => {
    const pts = sampleBezier(0, 0, 5, 10, 15, 10, 20, 0);
    // All points should have 0 <= x <= 20 and y >= 0
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(-0.01);
      expect(x).toBeLessThanOrEqual(20.01);
      expect(y).toBeGreaterThanOrEqual(-0.01);
    }
    // Peak y should be around x=10
    const peak = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
    expect(peak[0]).toBeGreaterThan(5);
    expect(peak[0]).toBeLessThan(15);
    expect(peak[1]).toBeGreaterThan(5);
  });
});

// ── sampleCatmullRomSegment ──────────────────────────────────────────────────

describe('sampleCatmullRomSegment', () => {
  test('first and last points match input endpoints', () => {
    const pts: [number, number][] = [[0, 0], [5, 5], [10, 0]];
    const sampled = sampleCatmullRomSegment(pts, 0.5, 8);
    expect(sampled[0][0]).toBeCloseTo(0, 3);
    expect(sampled[0][1]).toBeCloseTo(0, 3);
    expect(sampled[sampled.length - 1][0]).toBeCloseTo(10, 3);
    expect(sampled[sampled.length - 1][1]).toBeCloseTo(0, 3);
  });

  test('tension 1 produces near-linear interpolation', () => {
    const pts: [number, number][] = [[0, 0], [10, 0]];
    const sampled = sampleCatmullRomSegment(pts, 1.0, 4);
    for (const [, y] of sampled) expect(Math.abs(y)).toBeLessThan(0.1);
  });

  test('tension 0 produces rounder curves', () => {
    const pts: [number, number][] = [[0, 0], [5, 5], [10, 0]];
    const round = sampleCatmullRomSegment(pts, 0, 8);
    const linear = sampleCatmullRomSegment(pts, 1, 8);
    // With tension=0, the midpoint should deviate more from the straight path
    const roundMid = round[Math.floor(round.length / 2)];
    const linearMid = linear[Math.floor(linear.length / 2)];
    expect(roundMid[1]).toBeGreaterThanOrEqual(linearMid[1] - 0.5);
  });
});

// ── tangentArcGeom ───────────────────────────────────────────────────────────

describe('tangentArcGeom', () => {
  test('center is on perpendicular to tangent at start', () => {
    const { cx, cy, clockwise } = tangentArcGeom(0, 0, 1, 0, 0, 10);
    expect(cx).toBeCloseTo(0, 5);
    expect(cy).toBeGreaterThan(0);
    expect(clockwise).toBe(false);
  });

  test('center is equidistant from start and end', () => {
    const { cx, cy } = tangentArcGeom(0, 0, 1, 0, 5, 5);
    expect(Math.hypot(cx, cy)).toBeCloseTo(Math.hypot(cx - 5, cy - 5), 5);
  });

  test('clockwise flag: end to the right → CW', () => {
    const { clockwise } = tangentArcGeom(0, 0, 0, 1, 5, 0);
    expect(clockwise).toBe(true);
  });

  test('throws when collinear', () => {
    expect(() => tangentArcGeom(0, 0, 1, 0, 5, 0)).toThrow('tangentArcTo');
  });

  test('center–start perpendicular to tangent', () => {
    const tx = Math.cos(Math.PI / 4);
    const ty = Math.sin(Math.PI / 4);
    const { cx, cy } = tangentArcGeom(0, 0, tx, ty, 10, 0);
    const dot = (-cx) * tx + (-cy) * ty;
    expect(dot).toBeCloseTo(0, 5);
  });
});

// ── Integration tests (need kernel) ──────────────────────────────────────────

beforeAll(async () => {
  await initKernel();
});

describe('path() — line-only (regression)', () => {
  test('square: 10×10 = 100 volume', () => {
    const sk = path().moveTo(0, 0).lineTo(10, 0).lineTo(10, 10).lineTo(0, 10).close();
    expect(sk.extrude(1).volume).toBeCloseTo(100, 0);
  });

  test('lineH and lineV', () => {
    const sk = path().moveTo(0, 0).lineH(5).lineV(3).lineTo(0, 3).close();
    expect(sk.extrude(1).volume).toBeCloseTo(15, 0);
  });

  test('stroke produces solid', () => {
    const sk = path().moveTo(0, 0).lineTo(20, 0).stroke(4);
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });
});

describe('path() — arcTo', () => {
  test('quarter-circle sector area', () => {
    const r = 20;
    const sk = path().moveTo(0, 0).lineTo(r, 0).arcTo(0, r, r, false).close();
    const vol = sk.extrude(1).volume;
    const expected = (Math.PI * r * r) / 4;
    expect(vol).toBeCloseTo(expected, -1);
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.003);
  });

  test('full circle via two arcs', () => {
    const r = 15;
    const sk = path().moveTo(-r, 0).arcTo(r, 0, r, false).arcTo(-r, 0, r, false).close();
    const vol = sk.extrude(1).volume;
    const expected = Math.PI * r * r;
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.005);
  });

  test('S-curve: valid closed shape', () => {
    const r = 10;
    const sk = path().moveTo(0, 0).arcTo(r, r, r, false).arcTo(0, 2 * r, r, true).lineTo(0, 0).close();
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });

  test('arc + stroke', () => {
    const sk = path().moveTo(0, 0).arcTo(20, 20, 20, false).stroke(4);
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });
});

describe('path() — tangentArcTo', () => {
  test('S-curve via tangentArcTo', () => {
    const sk = path()
      .moveTo(0, 10).lineTo(10, 10)
      .tangentArcTo(20, 20).tangentArcTo(30, 10)
      .lineTo(30, 0).lineTo(0, 0).close();
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });

  test('four-arc loop has positive volume', () => {
    const r = 10;
    const sk = path().moveTo(r, 0)
      .tangentArcTo(0, r).tangentArcTo(-r, 0).tangentArcTo(0, -r).tangentArcTo(r, 0)
      .close();
    expect(sk.extrude(1).volume).toBeGreaterThan(r * r * 0.3);
  });
});

describe('path() — smoothCapTo', () => {
  test('slot cap: volume > rectangle', () => {
    const L = 40, W = 20;
    const sk = path().moveTo(0, 0).lineTo(L, 0).smoothCapTo(L, W, 3, 14).lineTo(0, W).close();
    expect(sk.extrude(1).volume).toBeGreaterThan(L * W);
  });

  test('throws when capRadius too small', () => {
    expect(() => {
      path().moveTo(0, 0).lineTo(50, 0).smoothCapTo(50, 50, 5, 1).close();
    }).toThrow('capRadius');
  });
});

// ── New feature: relative moves ──────────────────────────────────────────────

describe('path() — relative moves', () => {
  test('lineBy matches lineTo', () => {
    const a = path().moveTo(5, 5).lineTo(15, 5).lineTo(15, 15).lineTo(5, 15).close();
    const b = path().moveTo(5, 5).lineBy(10, 0).lineBy(0, 10).lineBy(-10, 0).close();
    expect(a.extrude(1).volume).toBeCloseTo(b.extrude(1).volume, 0);
  });

  test('arcBy matches arcTo', () => {
    const a = path().moveTo(0, 0).arcTo(10, 10, 10, false).lineTo(0, 10).close();
    const b = path().moveTo(0, 0).arcBy(10, 10, 10, false).lineTo(0, 10).close();
    expect(a.extrude(1).volume).toBeCloseTo(b.extrude(1).volume, 0);
  });

  test('bezierBy matches bezierTo', () => {
    const a = path().moveTo(0, 0).bezierTo(5, 10, 15, 10, 20, 0).lineTo(20, -5).lineTo(0, -5).close();
    const b = path().moveTo(0, 0).bezierBy(5, 10, 15, 10, 20, 0).lineTo(20, -5).lineTo(0, -5).close();
    expect(a.extrude(1).volume).toBeCloseTo(b.extrude(1).volume, 0);
  });
});

// ── New feature: bezierTo ────────────────────────────────────────────────────

describe('path() — bezierTo', () => {
  test('bezier arch: positive area', () => {
    const sk = path()
      .moveTo(0, 0)
      .bezierTo(5, 15, 15, 15, 20, 0)
      .close();
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });

  test('bezier S-shape with lines closes cleanly', () => {
    const sk = path()
      .moveTo(0, 0)
      .bezierTo(10, 20, 20, -10, 30, 10)
      .lineTo(30, 0)
      .close();
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });

  test('bezier stroke produces solid', () => {
    const sk = path()
      .moveTo(0, 0)
      .bezierTo(5, 10, 15, 10, 20, 0)
      .stroke(3);
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });
});

// ── New feature: tangentBezierTo ─────────────────────────────────────────────

describe('path() — tangentBezierTo', () => {
  test('G1-continuous bezier after line', () => {
    const sk = path()
      .moveTo(0, 0).lineTo(10, 0)
      .tangentBezierTo(15, 10, 20, 0)
      .lineTo(20, -5).lineTo(0, -5)
      .close();
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });

  test('custom weight changes shape', () => {
    const a = path().moveTo(0, 0).lineTo(10, 0)
      .tangentBezierTo(15, 10, 20, 0, 2).lineTo(20, -5).lineTo(0, -5).close();
    const b = path().moveTo(0, 0).lineTo(10, 0)
      .tangentBezierTo(15, 10, 20, 0, 8).lineTo(20, -5).lineTo(0, -5).close();
    // Different weights = different volumes
    const va = a.extrude(1).volume;
    const vb = b.extrude(1).volume;
    expect(va).toBeGreaterThan(0);
    expect(vb).toBeGreaterThan(0);
    expect(Math.abs(va - vb)).toBeGreaterThan(0.1);
  });
});

// ── New feature: smoothThrough (spline) ──────────────────────────────────────

describe('path() — smoothThrough', () => {
  test('spline through waypoints produces closed shape', () => {
    const sk = path()
      .moveTo(0, 0)
      .smoothThrough([[10, 5], [20, 0]])
      .lineTo(20, -5).lineTo(0, -5)
      .close();
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });

  test('spline with many waypoints', () => {
    const sk = path()
      .moveTo(0, 0)
      .smoothThrough([[5, 3], [10, -1], [15, 4], [20, 0]])
      .lineTo(20, -5).lineTo(0, -5)
      .close();
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });

  test('spline tension affects curvature', () => {
    const a = path().moveTo(0, 0).smoothThrough([[10, 10], [20, 0]], 0)
      .lineTo(20, -5).lineTo(0, -5).close();
    const b = path().moveTo(0, 0).smoothThrough([[10, 10], [20, 0]], 1)
      .lineTo(20, -5).lineTo(0, -5).close();
    const va = a.extrude(1).volume;
    const vb = b.extrude(1).volume;
    expect(va).toBeGreaterThan(0);
    expect(vb).toBeGreaterThan(0);
    // Tension 0 = rounder, tension 1 = more linear → different areas
    expect(Math.abs(va - vb)).toBeGreaterThan(0.01);
  });

  test('throws with zero waypoints', () => {
    expect(() => path().moveTo(0, 0).smoothThrough([])).toThrow();
  });
});

// ── New feature: fillet ──────────────────────────────────────────────────────

describe('path() — fillet', () => {
  test('filleted square has less area than square, more than inscribed circle', () => {
    const sk = path()
      .moveTo(0, 0).lineTo(10, 0).lineTo(10, 10).fillet(2)
      .lineTo(0, 10).close();
    const vol = sk.extrude(1).volume;
    // Fillet removes a small triangle and adds an arc — net area slightly less than 100
    expect(vol).toBeLessThan(100);
    expect(vol).toBeGreaterThan(90);
  });

  test('fillet with large radius rounds the corner significantly', () => {
    const sk = path()
      .moveTo(0, 0).lineTo(20, 0).lineTo(20, 20).fillet(5)
      .lineTo(0, 20).close();
    const vol = sk.extrude(1).volume;
    expect(vol).toBeLessThan(400);
    expect(vol).toBeGreaterThan(350);
  });

  test('fillet throws with no segments', () => {
    expect(() => path().moveTo(0, 0).fillet(1)).toThrow();
  });
});

// ── New feature: chamfer ─────────────────────────────────────────────────────

describe('path() — chamfer', () => {
  test('chamfered corner removes triangle', () => {
    const sk = path()
      .moveTo(0, 0).lineTo(10, 0).lineTo(10, 10).chamfer(2)
      .lineTo(0, 10).close();
    const vol = sk.extrude(1).volume;
    // Chamfer cuts a right triangle (2×2/2 = 2) from the 100 area
    expect(vol).toBeLessThan(100);
    expect(vol).toBeGreaterThan(95);
  });

  test('chamfer throws with no segments', () => {
    expect(() => path().moveTo(0, 0).chamfer(1)).toThrow();
  });
});

// ── New feature: mirror ──────────────────────────────────────────────────────

describe('path() — mirror', () => {
  test('mirror x: symmetric profile has double area', () => {
    // Build right half of a triangle, mirror to get full
    const half = path().moveTo(0, 0).lineTo(10, 0).lineTo(10, 5);
    const sk = half.mirror('x').close();
    const vol = sk.extrude(1).volume;
    expect(vol).toBeGreaterThan(0);
  });

  test('mirror y: symmetric left-right', () => {
    const half = path().moveTo(0, 0).lineTo(0, 10).lineTo(5, 10);
    const sk = half.mirror('y').close();
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });

  test('mirror with arcs produces valid geometry', () => {
    const sk = path()
      .moveTo(0, 0).lineTo(10, 0).arcTo(10, 5, 5, false)
      .mirror('x')
      .close();
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });

  test('mirror custom axis', () => {
    // Mirror across 45° diagonal
    const sk = path().moveTo(0, 0).lineTo(5, 0).lineTo(5, 5).mirror([1, 1]).close();
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });
});

// ── New feature: compound paths (holes) ──────────────────────────────────────

describe('path() — compound paths (holes)', () => {
  test('square with square hole: area = outer - inner', () => {
    const sk = path()
      .moveTo(0, 0).lineTo(20, 0).lineTo(20, 20).lineTo(0, 20) // outer
      .moveTo(5, 5).lineTo(15, 5).lineTo(15, 15).lineTo(5, 15) // hole
      .close();
    const vol = sk.extrude(1).volume;
    const expected = 20 * 20 - 10 * 10; // 300
    expect(vol).toBeCloseTo(expected, 0);
  });

  test('circle with hole', () => {
    const R = 15;
    const r = 5;
    const sk = path()
      .moveTo(-R, 0).arcTo(R, 0, R, false).arcTo(-R, 0, R, false) // outer circle
      .moveTo(-r, 0).arcTo(r, 0, r, false).arcTo(-r, 0, r, false) // inner circle (hole)
      .close();
    const vol = sk.extrude(1).volume;
    const expected = Math.PI * (R * R - r * r);
    expect(Math.abs(vol - expected) / expected).toBeLessThan(0.02);
  });
});

// ── New feature: closeOffset ─────────────────────────────────────────────────

describe('path() — closeOffset', () => {
  test('positive offset expands the shape', () => {
    const base = path().moveTo(0, 0).lineTo(10, 0).lineTo(10, 10).lineTo(0, 10).close();
    const expanded = path().moveTo(0, 0).lineTo(10, 0).lineTo(10, 10).lineTo(0, 10).closeOffset(1, 'Square');
    expect(expanded.extrude(1).volume).toBeGreaterThan(base.extrude(1).volume);
  });

  test('negative offset shrinks the shape', () => {
    const base = path().moveTo(0, 0).lineTo(10, 0).lineTo(10, 10).lineTo(0, 10).close();
    const shrunk = path().moveTo(0, 0).lineTo(10, 0).lineTo(10, 10).lineTo(0, 10).closeOffset(-1, 'Square');
    expect(shrunk.extrude(1).volume).toBeLessThan(base.extrude(1).volume);
  });
});

// ── Top-level stroke() function ──────────────────────────────────────────────

describe('stroke() function', () => {
  test('produces solid from points array', () => {
    const sk = stroke([[0, 0], [10, 0], [10, 10]], 2);
    expect(sk.extrude(1).volume).toBeGreaterThan(0);
  });
});
