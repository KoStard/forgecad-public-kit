#!/usr/bin/env node
/**
 * OCCT lowerer invariants.
 *
 * Constructs ShapeCompilePlan / ProfileCompilePlan objects by hand, lowers them
 * through the OCCT backend, and asserts geometric properties (volume, bounding
 * box) against values derived from geometry formulas — NOT from running the code.
 * If a test fails, the code has a bug.
 */
import assert from 'node:assert/strict';
import { init, runScript } from '../src/forge/headless';
import { lowerShapeCompilePlanToOCCT, lowerShapeCompilePlanToOCCTBackend, OCCTUnsupportedError } from '../src/forge/backends/occt';
import { wrapOCCTShapeBackend } from '../src/forge/backends/occt/shapeBackend';
import type { ProfileCompilePlan, ShapeCompilePlan } from '../src/forge/compilePlan';
import type { ShapeBackend } from '../src/forge/shapeBackend';

/* ── Helpers ──────────────────────────────────────────────────────────── */

function approx(a: number, b: number, eps = 1e-2): boolean {
  return Math.abs(a - b) <= eps;
}

function expectClose(actual: number, expected: number, label: string, eps = 1e-2): void {
  if (!approx(actual, expected, eps)) {
    throw new Error(
      `${label}: expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)}, eps ${eps})`,
    );
  }
}

function expectBBox(
  backend: ShapeBackend,
  expectedMin: [number, number, number],
  expectedMax: [number, number, number],
  label: string,
  eps = 0.1,
): void {
  const bb = backend.boundingBox();
  for (let i = 0; i < 3; i++) {
    const axis = ['x', 'y', 'z'][i];
    if (!approx(bb.min[i], expectedMin[i], eps)) {
      throw new Error(
        `${label} bbox min.${axis}: expected ${expectedMin[i]}, got ${bb.min[i]} (delta ${Math.abs(bb.min[i] - expectedMin[i])})`,
      );
    }
    if (!approx(bb.max[i], expectedMax[i], eps)) {
      throw new Error(
        `${label} bbox max.${axis}: expected ${expectedMax[i]}, got ${bb.max[i]} (delta ${Math.abs(bb.max[i] - expectedMax[i])})`,
      );
    }
  }
}

function lower(plan: ShapeCompilePlan): ShapeBackend {
  return wrapOCCTShapeBackend(lowerShapeCompilePlanToOCCT(plan));
}

/* ── Plan factory helpers ─────────────────────────────────────────────── */

function rectProfile(w: number, h: number, center = false): ProfileCompilePlan {
  return { kind: 'rect', width: w, height: h, center, transforms: [] };
}

function circleProfile(r: number): ProfileCompilePlan {
  return { kind: 'circle', radius: r, transforms: [] };
}

function polygonProfile(pts: [number, number][]): ProfileCompilePlan {
  return { kind: 'polygon', points: pts, transforms: [] };
}

function roundedRectProfile(w: number, h: number, r: number, center = false): ProfileCompilePlan {
  return { kind: 'roundedRect', width: w, height: h, radius: r, center, transforms: [] };
}

function boxPlan(x: number, y: number, z: number, center = false): ShapeCompilePlan {
  return { kind: 'box', x, y, z, center };
}

function cylinderPlan(h: number, r: number, center = false, radiusTop?: number): ShapeCompilePlan {
  return { kind: 'cylinder', height: h, radius: r, center, ...(radiusTop !== undefined ? { radiusTop } : {}) };
}

function spherePlan(r: number): ShapeCompilePlan {
  return { kind: 'sphere', radius: r };
}

function extrudePlan(profile: ProfileCompilePlan, height: number, center = false): ShapeCompilePlan {
  return { kind: 'extrude', profile, height, center };
}

/* ── Group 1: Profiles ────────────────────────────────────────────────── */

function testRectCorner(): void {
  const b = lower(extrudePlan(rectProfile(10, 20), 1));
  expectClose(b.volume(), 200, 'rect corner volume');
  expectBBox(b, [0, 0, 0], [10, 20, 1], 'rect corner');
}

function testRectCentered(): void {
  const b = lower(extrudePlan(rectProfile(10, 20, true), 1));
  expectClose(b.volume(), 200, 'rect centered volume');
  expectBBox(b, [-5, -10, 0], [5, 10, 1], 'rect centered');
}

function testRoundedRect(): void {
  // Area = w*h - (4 - pi) * r^2 = 200 - (4 - pi)*4 = 200 - 4*(4-pi)
  const expectedArea = 200 - 4 * (4 - Math.PI);
  const b = lower(extrudePlan(roundedRectProfile(10, 20, 2, true), 1));
  expectClose(b.volume(), expectedArea, 'roundedRect volume', 1e-1);
  expectBBox(b, [-5, -10, 0], [5, 10, 1], 'roundedRect');
}

function testRoundedRectZeroRadius(): void {
  const b = lower(extrudePlan(roundedRectProfile(10, 20, 0, true), 1));
  expectClose(b.volume(), 200, 'roundedRect r=0 volume');
  expectBBox(b, [-5, -10, 0], [5, 10, 1], 'roundedRect r=0');
}

function testCircle(): void {
  const expectedArea = Math.PI * 25;
  const b = lower(extrudePlan(circleProfile(5), 1));
  expectClose(b.volume(), expectedArea, 'circle volume');
  expectBBox(b, [-5, -5, 0], [5, 5, 1], 'circle');
}

function testPolygonTriangle(): void {
  // Right triangle: base=10, height=6 => area = 0.5 * 10 * 6 = 30
  const b = lower(extrudePlan(polygonProfile([[0, 0], [10, 0], [0, 6]]), 1));
  expectClose(b.volume(), 30, 'polygon triangle volume');
  expectBBox(b, [0, 0, 0], [10, 6, 1], 'polygon triangle');
}

function testPolygonDegenerateEdges(): void {
  // Pentagon with two duplicate consecutive vertices — degenerate edges should be skipped
  // Effective triangle: (0,0), (10,0), (0,6). Area = 30
  const b = lower(extrudePlan(polygonProfile([[0, 0], [10, 0], [10, 0], [0, 6], [0, 6]]), 1));
  expectClose(b.volume(), 30, 'polygon degenerate edges volume');
}

function testProfileBooleanUnion(): void {
  // Two non-overlapping 5x5 rects: one at origin, one translated by (10,0)
  const profile: ProfileCompilePlan = {
    kind: 'boolean',
    op: 'union',
    profiles: [
      rectProfile(5, 5),
      { kind: 'rect', width: 5, height: 5, center: false, transforms: [{ kind: 'translate', x: 10, y: 0 }] },
    ],
    transforms: [],
  };
  const b = lower(extrudePlan(profile, 1));
  expectClose(b.volume(), 50, 'boolean union volume');
  expectBBox(b, [0, 0, 0], [15, 5, 1], 'boolean union');
}

function testProfileBooleanDifference(): void {
  // 10x10 rect minus 2x2 rect translated to (4,4) => area = 100 - 4 = 96
  const profile: ProfileCompilePlan = {
    kind: 'boolean',
    op: 'difference',
    profiles: [
      rectProfile(10, 10),
      { kind: 'rect', width: 2, height: 2, center: false, transforms: [{ kind: 'translate', x: 4, y: 4 }] },
    ],
    transforms: [],
  };
  const b = lower(extrudePlan(profile, 1));
  expectClose(b.volume(), 96, 'boolean difference volume', 1e-1);
  expectBBox(b, [0, 0, 0], [10, 10, 1], 'boolean difference');
}

function testProfileBooleanIntersection(): void {
  // Two 10x10 rects: one at origin, one translated by (5,0)
  // Intersection: [5,0]->[10,10] => area = 5*10 = 50
  const profile: ProfileCompilePlan = {
    kind: 'boolean',
    op: 'intersection',
    profiles: [
      rectProfile(10, 10),
      { kind: 'rect', width: 10, height: 10, center: false, transforms: [{ kind: 'translate', x: 5, y: 0 }] },
    ],
    transforms: [],
  };
  const b = lower(extrudePlan(profile, 1));
  expectClose(b.volume(), 50, 'boolean intersection volume', 1e-1);
  expectBBox(b, [5, 0, 0], [10, 10, 1], 'boolean intersection');
}

function testProfileBooleanSinglePassthrough(): void {
  // Single rect passed through boolean union should equal just the rect
  const profile: ProfileCompilePlan = {
    kind: 'boolean',
    op: 'union',
    profiles: [rectProfile(10, 20)],
    transforms: [],
  };
  const b = lower(extrudePlan(profile, 1));
  expectClose(b.volume(), 200, 'boolean single passthrough volume');
  expectBBox(b, [0, 0, 0], [10, 20, 1], 'boolean single passthrough');
}

function testProfileOffsetPositive(): void {
  // Circle r=5, offset delta=2 => effective r=7 => area = pi*49
  const profile: ProfileCompilePlan = {
    kind: 'offset',
    base: circleProfile(5),
    delta: 2,
    join: 'Round',
    transforms: [],
  };
  const expectedArea = Math.PI * 49;
  const b = lower(extrudePlan(profile, 1));
  expectClose(b.volume(), expectedArea, 'offset positive volume', 1e-1);
  expectBBox(b, [-7, -7, 0], [7, 7, 1], 'offset positive');
}

function testProfileTranslate(): void {
  // Rect 10x20 translated by (5,3)
  const profile: ProfileCompilePlan = {
    kind: 'rect',
    width: 10,
    height: 20,
    center: false,
    transforms: [{ kind: 'translate', x: 5, y: 3 }],
  };
  const b = lower(extrudePlan(profile, 1));
  expectClose(b.volume(), 200, 'translate volume');
  expectBBox(b, [5, 3, 0], [15, 23, 1], 'translate');
}

function testProfileRotate90(): void {
  // Rect 10x20 (corner mode, spans [0,0]->[10,20]) rotated 90 degrees
  // After 90deg CCW rotation: [0,0]->[10,20] maps to [-20,0]->[0,10]
  const profile: ProfileCompilePlan = {
    kind: 'rect',
    width: 10,
    height: 20,
    center: false,
    transforms: [{ kind: 'rotate', degrees: 90 }],
  };
  const b = lower(extrudePlan(profile, 1));
  expectClose(b.volume(), 200, 'rotate90 volume');
  expectBBox(b, [-20, 0, 0], [0, 10, 1], 'rotate90');
}

function testProfileMirror(): void {
  // Rect [0,0]->[10,20] mirrored across Y axis (normalX=1, normalY=0)
  // bbox: [-10,0,0]->[0,20,1]
  const profile: ProfileCompilePlan = {
    kind: 'rect',
    width: 10,
    height: 20,
    center: false,
    transforms: [{ kind: 'mirror', normalX: 1, normalY: 0 }],
  };
  const b = lower(extrudePlan(profile, 1));
  expectClose(b.volume(), 200, 'profile mirror volume');
  expectBBox(b, [-10, 0, 0], [0, 20, 1], 'profile mirror');
}

function testProfileScale(): void {
  // Rect 10x20 scaled by (2, 0.5) => 20x10 => area = 200
  const profile: ProfileCompilePlan = {
    kind: 'rect',
    width: 10,
    height: 20,
    center: false,
    transforms: [{ kind: 'scale', x: 2, y: 0.5 }],
  };
  const b = lower(extrudePlan(profile, 1));
  expectClose(b.volume(), 200, 'profile scale volume');
  expectBBox(b, [0, 0, 0], [20, 10, 1], 'profile scale');
}

function testProfileHullThrows(): void {
  const profile: ProfileCompilePlan = {
    kind: 'hull',
    profiles: [rectProfile(5, 5)],
    transforms: [],
  };
  assert.throws(
    () => lower(extrudePlan(profile, 1)),
    (err: any) => err instanceof OCCTUnsupportedError,
    'profile hull should throw OCCTUnsupportedError',
  );
}

function testProfileProjectThrows(): void {
  const profile: ProfileCompilePlan = {
    kind: 'project',
    base: boxPlan(10, 10, 10),
    transforms: [],
  };
  assert.throws(
    () => lower(extrudePlan(profile, 1)),
    (err: any) => err instanceof OCCTUnsupportedError,
    'profile project should throw OCCTUnsupportedError',
  );
}

/* ── Group 2: Primitives ──────────────────────────────────────────────── */

function testBoxCorner(): void {
  const b = lower(boxPlan(10, 20, 30));
  expectClose(b.volume(), 6000, 'box corner volume');
  expectBBox(b, [0, 0, 0], [10, 20, 30], 'box corner');
}

function testBoxCentered(): void {
  const b = lower(boxPlan(10, 20, 30, true));
  expectClose(b.volume(), 6000, 'box centered volume');
  expectBBox(b, [-5, -10, -15], [5, 10, 15], 'box centered');
}

function testCylinder(): void {
  const expectedVolume = Math.PI * 25 * 20;
  const b = lower(cylinderPlan(20, 5));
  expectClose(b.volume(), expectedVolume, 'cylinder volume');
  expectBBox(b, [-5, -5, 0], [5, 5, 20], 'cylinder');
}

function testCylinderCentered(): void {
  const expectedVolume = Math.PI * 25 * 20;
  const b = lower(cylinderPlan(20, 5, true));
  expectClose(b.volume(), expectedVolume, 'cylinder centered volume');
  expectBBox(b, [-5, -5, -10], [5, 5, 10], 'cylinder centered');
}

function testConeFrustum(): void {
  // V = (pi*h/3) * (r1^2 + r2^2 + r1*r2)
  // = (pi*20/3) * (25 + 4 + 10) = (pi*20/3) * 39 = pi * 260
  const expectedVolume = Math.PI * 260;
  const b = lower(cylinderPlan(20, 5, false, 2));
  expectClose(b.volume(), expectedVolume, 'cone/frustum volume', 1e-1);
  expectBBox(b, [-5, -5, 0], [5, 5, 20], 'cone/frustum');
}

function testSphere(): void {
  // V = 4/3 * pi * r^3 = 4/3 * pi * 125
  const expectedVolume = (4 / 3) * Math.PI * 125;
  const b = lower(spherePlan(5));
  expectClose(b.volume(), expectedVolume, 'sphere volume');
  expectBBox(b, [-5, -5, -5], [5, 5, 5], 'sphere');
}

/* ── Group 3: Features ──────────────────────────────────────────────── */

function testExtrudeSimpleRect(): void {
  const b = lower(extrudePlan(rectProfile(10, 20), 5));
  expectClose(b.volume(), 1000, 'extrude simple rect volume');
  expectBBox(b, [0, 0, 0], [10, 20, 5], 'extrude simple rect');
}

function testExtrudeCentered(): void {
  const b = lower(extrudePlan(rectProfile(10, 20, true), 5, true));
  expectClose(b.volume(), 1000, 'extrude centered volume');
  expectBBox(b, [-5, -10, -2.5], [5, 10, 2.5], 'extrude centered');
}

function testExtrudeScaleTop(): void {
  // Square frustum: A1=100(10x10), A2=25(5x5), V = h/3*(A1+A2+sqrt(A1*A2))
  // V = 10/3*(100+25+sqrt(2500)) = 10/3*(100+25+50) = 10/3*175 ≈ 583.33
  const expectedVolume = (10 / 3) * (100 + 25 + Math.sqrt(100 * 25));
  const plan: ShapeCompilePlan = {
    kind: 'extrude',
    profile: rectProfile(10, 10, true),
    height: 10,
    center: false,
    scaleTop: [0.5, 0.5],
  };
  const b = lower(plan);
  expectClose(b.volume(), expectedVolume, 'extrude scaleTop volume', 1);
}

function testRevolve360(): void {
  // Rect from x=5..10, y=0..2 in 2D.
  // After 90° rotation around X: profile sits at r=5..10, z=0..2.
  // Full revolve around Z: V = pi*(R^2-r^2)*h = pi*(100-25)*2 = 150*pi
  const expectedVolume = 150 * Math.PI;
  const plan: ShapeCompilePlan = {
    kind: 'revolve',
    profile: {
      kind: 'rect',
      width: 5,
      height: 2,
      center: false,
      transforms: [{ kind: 'translate', x: 5, y: 0 }],
    },
    degrees: 360,
  };
  const b = lower(plan);
  expectClose(b.volume(), expectedVolume, 'revolve 360 volume', 1);
}

function testRevolve180(): void {
  // Half of full revolve: 75*pi
  const expectedVolume = 75 * Math.PI;
  const plan: ShapeCompilePlan = {
    kind: 'revolve',
    profile: {
      kind: 'rect',
      width: 5,
      height: 2,
      center: false,
      transforms: [{ kind: 'translate', x: 5, y: 0 }],
    },
    degrees: 180,
  };
  const b = lower(plan);
  expectClose(b.volume(), expectedVolume, 'revolve 180 volume', 1);
}

function testLoftSameSize(): void {
  // Two identical 10x10 centered rects at heights 0 and 20 => box 10x10x20 = 2000
  const plan: ShapeCompilePlan = {
    kind: 'loft',
    profiles: [rectProfile(10, 10, true), rectProfile(10, 10, true)],
    heights: [0, 20],
    edgeLength: 1,
    boundsPadding: 1,
  };
  const b = lower(plan);
  expectClose(b.volume(), 2000, 'loft same-size volume', 1);
  expectBBox(b, [-5, -5, 0], [5, 5, 20], 'loft same-size', 0.5);
}

function testLoftTapered(): void {
  // 10x10 base tapering to 5x5 top over 20 units: volume between 500 and 2000
  const plan: ShapeCompilePlan = {
    kind: 'loft',
    profiles: [rectProfile(10, 10, true), rectProfile(5, 5, true)],
    heights: [0, 20],
    edgeLength: 1,
    boundsPadding: 1,
  };
  const b = lower(plan);
  const vol = b.volume();
  assert.ok(vol > 500, `loft tapered volume too small: ${vol}`);
  assert.ok(vol < 2000, `loft tapered volume too large: ${vol}`);
}

function testSweepStraight(): void {
  // Sweep 4x4 rect along a straight Z line of length 20 => 4*4*20 = 320
  const plan: ShapeCompilePlan = {
    kind: 'sweep',
    profile: rectProfile(4, 4, true),
    path: { kind: 'polyline', points: [[0, 0, 0], [0, 0, 20]] },
    edgeLength: 1,
    boundsPadding: 1,
    up: [0, 1, 0],
  };
  const b = lower(plan);
  expectClose(b.volume(), 320, 'sweep straight volume', 5);
  expectBBox(b, [-2, -2, 0], [2, 2, 20], 'sweep straight', 0.5);
}

function testSweepLShaped(): void {
  // Sweep 2x2 rect along L-shaped path — just check valid shape
  const plan: ShapeCompilePlan = {
    kind: 'sweep',
    profile: rectProfile(2, 2, true),
    path: { kind: 'polyline', points: [[0, 0, 0], [10, 0, 0], [10, 10, 0]] },
    edgeLength: 1,
    boundsPadding: 1,
    up: [0, 0, 1],
  };
  const b = lower(plan);
  const vol = b.volume();
  assert.ok(vol > 0, `sweep L-shaped volume should be positive: ${vol}`);
}

/* ── Group 4: Booleans ──────────────────────────────────────────────── */

function testBooleanUnionNonOverlapping(): void {
  const plan: ShapeCompilePlan = {
    kind: 'boolean',
    op: 'union',
    shapes: [
      boxPlan(5, 5, 5),
      { kind: 'transform', base: boxPlan(5, 5, 5), steps: [{ kind: 'translate', x: 10, y: 0, z: 0 }] },
    ],
  };
  const b = lower(plan);
  expectClose(b.volume(), 250, 'boolean union non-overlapping volume');
  expectBBox(b, [0, 0, 0], [15, 5, 5], 'boolean union non-overlapping');
}

function testBooleanUnionOverlapping(): void {
  // Two 10x10x10 boxes, second translated by (5,0,0). Overlap = 5*10*10 = 500.
  // Union volume = 2000 - 500 = 1500
  const plan: ShapeCompilePlan = {
    kind: 'boolean',
    op: 'union',
    shapes: [
      boxPlan(10, 10, 10),
      { kind: 'transform', base: boxPlan(10, 10, 10), steps: [{ kind: 'translate', x: 5, y: 0, z: 0 }] },
    ],
  };
  const b = lower(plan);
  expectClose(b.volume(), 1500, 'boolean union overlapping volume');
}

function testBooleanDifference(): void {
  // box(10,10,10) minus box(4,4,4) translated to (3,3,3) (fully inside)
  // Volume = 1000 - 64 = 936
  const plan: ShapeCompilePlan = {
    kind: 'boolean',
    op: 'difference',
    shapes: [
      boxPlan(10, 10, 10),
      { kind: 'transform', base: boxPlan(4, 4, 4), steps: [{ kind: 'translate', x: 3, y: 3, z: 3 }] },
    ],
  };
  const b = lower(plan);
  expectClose(b.volume(), 936, 'boolean difference volume');
}

function testBooleanIntersection(): void {
  // Two 10x10x10 boxes, second translated by (5,5,0). Overlap = 5*5*10 = 250
  const plan: ShapeCompilePlan = {
    kind: 'boolean',
    op: 'intersection',
    shapes: [
      boxPlan(10, 10, 10),
      { kind: 'transform', base: boxPlan(10, 10, 10), steps: [{ kind: 'translate', x: 5, y: 5, z: 0 }] },
    ],
  };
  const b = lower(plan);
  expectClose(b.volume(), 250, 'boolean intersection volume');
}

function testBooleanMultiUnion(): void {
  // Union of 3 non-overlapping 5x5x5 boxes
  const plan: ShapeCompilePlan = {
    kind: 'boolean',
    op: 'union',
    shapes: [
      boxPlan(5, 5, 5),
      { kind: 'transform', base: boxPlan(5, 5, 5), steps: [{ kind: 'translate', x: 10, y: 0, z: 0 }] },
      { kind: 'transform', base: boxPlan(5, 5, 5), steps: [{ kind: 'translate', x: 20, y: 0, z: 0 }] },
    ],
  };
  const b = lower(plan);
  expectClose(b.volume(), 375, 'boolean multi-union volume');
}

function testBooleanMultiDifference(): void {
  // box(10,10,10) minus two 2x2x2 boxes at (2,2,2) and (6,6,6) (both fully inside)
  // Volume = 1000 - 8 - 8 = 984
  const plan: ShapeCompilePlan = {
    kind: 'boolean',
    op: 'difference',
    shapes: [
      boxPlan(10, 10, 10),
      { kind: 'transform', base: boxPlan(2, 2, 2), steps: [{ kind: 'translate', x: 2, y: 2, z: 2 }] },
      { kind: 'transform', base: boxPlan(2, 2, 2), steps: [{ kind: 'translate', x: 6, y: 6, z: 6 }] },
    ],
  };
  const b = lower(plan);
  expectClose(b.volume(), 984, 'boolean multi-difference volume');
}

function testBooleanMultiIntersection(): void {
  // Three 10x10x10 boxes: one at origin, one at (5,0,0), one at (0,5,0)
  // Intersection of first two: [5,0,0]->[10,10,10] (vol=500)
  // Intersection with third: [5,5,0]->[10,10,10] (vol=250)
  const plan: ShapeCompilePlan = {
    kind: 'boolean',
    op: 'intersection',
    shapes: [
      boxPlan(10, 10, 10),
      { kind: 'transform', base: boxPlan(10, 10, 10), steps: [{ kind: 'translate', x: 5, y: 0, z: 0 }] },
      { kind: 'transform', base: boxPlan(10, 10, 10), steps: [{ kind: 'translate', x: 0, y: 5, z: 0 }] },
    ],
  };
  const b = lower(plan);
  expectClose(b.volume(), 250, 'boolean multi-intersection volume');
}

function testBooleanSinglePassthrough(): void {
  const plan: ShapeCompilePlan = {
    kind: 'boolean',
    op: 'union',
    shapes: [boxPlan(10, 10, 10)],
  };
  const b = lower(plan);
  expectClose(b.volume(), 1000, 'boolean single passthrough volume');
}

function testBooleanEmptyThrows(): void {
  const plan: ShapeCompilePlan = {
    kind: 'boolean',
    op: 'union',
    shapes: [],
  };
  assert.throws(() => lower(plan), 'boolean empty should throw');
}

/* ── Group 5: Transforms ────────────────────────────────────────────── */

function testTransformTranslate(): void {
  const plan: ShapeCompilePlan = {
    kind: 'transform',
    base: boxPlan(10, 20, 30),
    steps: [{ kind: 'translate', x: 5, y: 10, z: 15 }],
  };
  const b = lower(plan);
  expectClose(b.volume(), 6000, 'transform translate volume');
  expectBBox(b, [5, 10, 15], [15, 30, 45], 'transform translate');
}

function testTransformRotateZ90(): void {
  // Box [0,0,0]->[10,20,30] rotated 90° around Z.
  // Point (x,y) → (-y,x): (0,0)→(0,0), (10,0)→(0,10), (0,20)→(-20,0), (10,20)→(-20,10)
  // bbox: [-20,0,0]->[0,10,30]
  const plan: ShapeCompilePlan = {
    kind: 'transform',
    base: boxPlan(10, 20, 30),
    steps: [{ kind: 'rotate', xDeg: 0, yDeg: 0, zDeg: 90 }],
  };
  const b = lower(plan);
  expectClose(b.volume(), 6000, 'transform rotateZ90 volume');
  expectBBox(b, [-20, 0, 0], [0, 10, 30], 'transform rotateZ90');
}

function testTransformScaleUniform(): void {
  const plan: ShapeCompilePlan = {
    kind: 'transform',
    base: boxPlan(10, 20, 30),
    steps: [{ kind: 'scale', x: 2, y: 2, z: 2 }],
  };
  const b = lower(plan);
  expectClose(b.volume(), 48000, 'transform scale uniform volume');
  expectBBox(b, [0, 0, 0], [20, 40, 60], 'transform scale uniform');
}

function testTransformScaleNonUniform(): void {
  const plan: ShapeCompilePlan = {
    kind: 'transform',
    base: boxPlan(10, 20, 30),
    steps: [{ kind: 'scale', x: 1, y: 2, z: 3 }],
  };
  const b = lower(plan);
  expectClose(b.volume(), 36000, 'transform scale non-uniform volume');
  expectBBox(b, [0, 0, 0], [10, 40, 90], 'transform scale non-uniform');
}

function testTransformMirror(): void {
  // Mirror box [0,0,0]->[10,20,30] across YZ plane (normalX=1)
  // bbox: [-10,0,0]->[0,20,30]
  const plan: ShapeCompilePlan = {
    kind: 'transform',
    base: boxPlan(10, 20, 30),
    steps: [{ kind: 'mirror', normalX: 1, normalY: 0, normalZ: 0 }],
  };
  const b = lower(plan);
  expectClose(b.volume(), 6000, 'transform mirror volume');
  expectBBox(b, [-10, 0, 0], [0, 20, 30], 'transform mirror');
}

function testTransformRotateAround(): void {
  // Rotate box around Z axis at pivot (5,10,0) by 90°.
  // Volume should be unchanged.
  const plan: ShapeCompilePlan = {
    kind: 'transform',
    base: boxPlan(10, 20, 30),
    steps: [{ kind: 'rotateAround', axisX: 0, axisY: 0, axisZ: 1, degrees: 90, pivotX: 5, pivotY: 10, pivotZ: 0 }],
  };
  const b = lower(plan);
  expectClose(b.volume(), 6000, 'transform rotateAround volume');
  const bb = b.boundingBox();
  assert.ok(bb.max[0] - bb.min[0] > 0, 'rotateAround shape has width');
  assert.ok(bb.max[2] - bb.min[2] > 0, 'rotateAround shape has depth');
}

function testTransformChained(): void {
  // Box [0,0,0]->[10,20,30], translate(10,0,0) => [10,0,0]->[20,20,30],
  // then rotate Z 90° => [-20,10,0]->[0,20,30]
  const plan: ShapeCompilePlan = {
    kind: 'transform',
    base: boxPlan(10, 20, 30),
    steps: [
      { kind: 'translate', x: 10, y: 0, z: 0 },
      { kind: 'rotate', xDeg: 0, yDeg: 0, zDeg: 90 },
    ],
  };
  const b = lower(plan);
  expectClose(b.volume(), 6000, 'transform chained volume');
  expectBBox(b, [-20, 10, 0], [0, 20, 30], 'transform chained');
}

function testTransformWorkplanePlacement(): void {
  // Identity matrix — shape should be unchanged
  const identity: number[] = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
  const plan: ShapeCompilePlan = {
    kind: 'transform',
    base: boxPlan(10, 20, 30),
    steps: [{ kind: 'workplanePlacement', matrix: identity as any, placement: {} as any }],
  };
  const b = lower(plan);
  expectClose(b.volume(), 6000, 'workplanePlacement identity volume');
  expectBBox(b, [0, 0, 0], [10, 20, 30], 'workplanePlacement identity');
}

function testTransformWorkplanePlacementTranslate(): void {
  // Translation matrix: move by (5, 10, 15)
  const mat: number[] = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    5, 10, 15, 1,
  ];
  const plan: ShapeCompilePlan = {
    kind: 'transform',
    base: boxPlan(10, 20, 30),
    steps: [{ kind: 'workplanePlacement', matrix: mat as any, placement: {} as any }],
  };
  const b = lower(plan);
  expectClose(b.volume(), 6000, 'workplanePlacement translate volume');
  expectBBox(b, [5, 10, 15], [15, 30, 45], 'workplanePlacement translate');
}

/* ── Group 6: Edge Features (via runScript) ──────────────────────────── */

function testFilletOnBox(): void {
  const code = `
    const base = rectangle(-10, -10, 20, 20).extrude(10);
    const result = filletEdge(base.toShape(), base.edge('vert-br'), 2, [-1, -1]);
    return [{ name: 'result', shape: result }];
  `;
  const result = runScript(code, 'test.forge.js', { 'test.forge.js': code });
  assert.equal(result.error, null, `runScript error: ${result.error}`);
  assert(result.objects.length >= 1, 'expected at least 1 object');
  const shape = result.objects[0].shape!;
  const vol = shape.volume();
  assert(vol > 0 && vol < 4000, `fillet volume should be less than box: got ${vol}`);
}

function testChamferOnBox(): void {
  const code = `
    const base = rectangle(-10, -10, 20, 20).extrude(10);
    const result = chamferEdge(base.toShape(), base.edge('vert-br'), 2, [-1, -1]);
    return [{ name: 'result', shape: result }];
  `;
  const result = runScript(code, 'test.forge.js', { 'test.forge.js': code });
  assert.equal(result.error, null, `runScript error: ${result.error}`);
  assert(result.objects.length >= 1, 'expected at least 1 object');
  const shape = result.objects[0].shape!;
  const vol = shape.volume();
  assert(vol > 0 && vol < 4000, `chamfer volume should be less than box: got ${vol}`);
}

/* ── Group 7: Cutting ────────────────────────────────────────────────── */

function testTrimByPlaneHalf(): void {
  // box(10,10,10) trimmed at z=5 => volume ≈ 500
  const plan: ShapeCompilePlan = {
    kind: 'trimByPlane',
    base: boxPlan(10, 10, 10),
    normalX: 0,
    normalY: 0,
    normalZ: 1,
    originOffset: 5,
  };
  const b = lower(plan);
  expectClose(b.volume(), 500, 'trimByPlane half volume', 1);
}

function testTrimByPlaneWithOffset(): void {
  // box(10,10,10) trimmed at z=2 keeps z=2..10 => volume ≈ 800
  const plan: ShapeCompilePlan = {
    kind: 'trimByPlane',
    base: boxPlan(10, 10, 10),
    normalX: 0,
    normalY: 0,
    normalZ: 1,
    originOffset: 2,
  };
  const b = lower(plan);
  expectClose(b.volume(), 800, 'trimByPlane offset volume', 1);
}

function testTrimByPlaneOutside(): void {
  // box(10,10,10) trimmed at z=-5 (plane below shape) => volume ≈ 1000 (unchanged)
  const plan: ShapeCompilePlan = {
    kind: 'trimByPlane',
    base: boxPlan(10, 10, 10),
    normalX: 0,
    normalY: 0,
    normalZ: 1,
    originOffset: -5,
  };
  const b = lower(plan);
  expectClose(b.volume(), 1000, 'trimByPlane outside volume', 1);
}

/* ── Group 8: Errors ─────────────────────────────────────────────────── */

function testHullThrowsOCCTUnsupported(): void {
  const plan: ShapeCompilePlan = {
    kind: 'hull',
    shapes: [],
    points: [[0, 0, 0]],
    queryPropagation: undefined,
  };
  assert.throws(
    () => lowerShapeCompilePlanToOCCT(plan),
    (err: any) => err instanceof OCCTUnsupportedError,
    'hull should throw OCCTUnsupportedError',
  );
}

function testOpaqueThrows(): void {
  const plan: ShapeCompilePlan = {
    kind: 'opaque',
    backend: { volume: () => 0 } as any,
  };
  assert.throws(
    () => lowerShapeCompilePlanToOCCT(plan),
    'opaque should throw',
  );
}

function testEmptyBooleanThrows(): void {
  const plan: ShapeCompilePlan = {
    kind: 'boolean',
    op: 'union',
    shapes: [],
  };
  assert.throws(
    () => lowerShapeCompilePlanToOCCT(plan),
    (err: any) => err instanceof Error && /empty boolean/i.test(err.message),
    'empty boolean should throw',
  );
}

function testLoftTooFewProfilesThrows(): void {
  const plan: ShapeCompilePlan = {
    kind: 'loft',
    profiles: [rectProfile(10, 10)],
    heights: [0],
    edgeLength: 1,
    boundsPadding: 1,
  };
  assert.throws(
    () => lower(plan),
    (err: any) => err instanceof Error,
    'loft with <2 profiles should throw',
  );
}

function testSweepTooFewPointsThrows(): void {
  const plan: ShapeCompilePlan = {
    kind: 'sweep',
    profile: rectProfile(4, 4),
    path: { kind: 'polyline', points: [[0, 0, 0]] },
    edgeLength: 1,
    boundsPadding: 1,
    up: [0, 1, 0],
  };
  assert.throws(
    () => lower(plan),
    (err: any) => err instanceof Error,
    'sweep with <2 path points should throw',
  );
}

/* ── Group 9: Caching ────────────────────────────────────────────────── */

function testCacheHit(): void {
  const plan: ShapeCompilePlan = boxPlan(7, 8, 9);
  const a = lowerShapeCompilePlanToOCCT(plan);
  const b = lowerShapeCompilePlanToOCCT(plan);
  assert.strictEqual(a, b, 'second call should return cached OCCT shape');
}

function testQueryOwnerPassthrough(): void {
  const plan: ShapeCompilePlan = {
    kind: 'queryOwner',
    owner: { id: 'test', operation: 'test' },
    base: boxPlan(5, 5, 5),
  };
  const b = lower(plan);
  expectClose(b.volume(), 125, 'queryOwner passthrough volume');
}

/* ── Group 10: Delegated plans (via runScript) ───────────────────────── */

function testShellViaScript(): void {
  const code = `
    const b = box(20, 20, 10);
    return [{ name: 'result', shape: b.shell(2, ['top']) }];
  `;
  const result = runScript(code, 'test.forge.js', { 'test.forge.js': code });
  assert.equal(result.error, null, `runScript error: ${result.error}`);
  assert(result.objects.length >= 1, 'expected at least 1 shell object');
  const shape = result.objects[0].shape!;
  const vol = shape.volume();
  // Shell removes interior material, so volume < solid box (4000) but > 0
  assert(vol > 0 && vol < 4000, `shell should remove material: got vol=${vol}`);
}

function testHoleViaScript(): void {
  const code = `
    const b = box(20, 20, 10);
    return [{ name: 'result', shape: b.hole('top', { diameter: 6 }) }];
  `;
  const result = runScript(code, 'test.forge.js', { 'test.forge.js': code });
  assert.equal(result.error, null, `runScript error: ${result.error}`);
  assert(result.objects.length >= 1, 'expected at least 1 hole object');
  const shape = result.objects[0].shape!;
  const vol = shape.volume();
  // Hole removes a cylinder: V_box - pi*r^2*h = 4000 - pi*9*10 ≈ 3717
  const expected = 4000 - Math.PI * 9 * 10;
  expectClose(vol, expected, 'hole volume', 5);
}

function testLowerToBackend(): void {
  const plan = boxPlan(10, 20, 30);
  const backend = lowerShapeCompilePlanToOCCTBackend(plan);
  expectClose(backend.volume(), 6000, 'backend volume');
}

/* ── Runner ───────────────────────────────────────────────────────────── */

export async function runCheckOcctLowerCli(): Promise<void> {
  await init();

  // Group 1: Profiles
  testRectCorner();
  testRectCentered();
  testRoundedRect();
  testRoundedRectZeroRadius();
  testCircle();
  testPolygonTriangle();
  testProfileBooleanUnion();
  testProfileBooleanDifference();
  testProfileBooleanIntersection();
  testProfileBooleanSinglePassthrough();
  testProfileOffsetPositive();
  testProfileTranslate();
  testProfileRotate90();
  testProfileMirror();
  testProfileScale();
  testPolygonDegenerateEdges();
  testProfileHullThrows();
  testProfileProjectThrows();

  // Group 2: Primitives
  testBoxCorner();
  testBoxCentered();
  testCylinder();
  testCylinderCentered();
  testConeFrustum();
  testSphere();

  // Group 3: Features
  testExtrudeSimpleRect();
  testExtrudeCentered();
  testExtrudeScaleTop();
  testRevolve360();
  testRevolve180();
  testLoftSameSize();
  testLoftTapered();
  testSweepStraight();
  testSweepLShaped();

  // Group 4: Booleans
  testBooleanUnionNonOverlapping();
  testBooleanUnionOverlapping();
  testBooleanDifference();
  testBooleanIntersection();
  testBooleanMultiUnion();
  testBooleanMultiDifference();
  testBooleanMultiIntersection();
  testBooleanSinglePassthrough();
  testBooleanEmptyThrows();

  // Group 5: Transforms
  testTransformTranslate();
  testTransformRotateZ90();
  testTransformScaleUniform();
  testTransformScaleNonUniform();
  testTransformMirror();
  testTransformRotateAround();
  testTransformChained();
  testTransformWorkplanePlacement();
  testTransformWorkplanePlacementTranslate();

  // Group 6: Edge Features
  testFilletOnBox();
  testChamferOnBox();

  // Group 7: Cutting
  testTrimByPlaneHalf();
  testTrimByPlaneWithOffset();
  testTrimByPlaneOutside();

  // Group 8: Errors
  testHullThrowsOCCTUnsupported();
  testOpaqueThrows();
  testEmptyBooleanThrows();
  testLoftTooFewProfilesThrows();
  testSweepTooFewPointsThrows();

  // Group 9: Caching
  testCacheHit();
  testQueryOwnerPassthrough();

  // Group 10: Delegated plans
  testShellViaScript();
  testHoleViaScript();
  testLowerToBackend();

  console.log('✓ OCCT lowerer invariants passed');
}
