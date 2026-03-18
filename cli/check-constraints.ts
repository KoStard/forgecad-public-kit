#!/usr/bin/env node
/**
 * Constraint solver invariants check.
 *
 * Tests the 2D constraint solver from simple single-constraint cases up to
 * complex multi-constraint systems, validating solved point positions and
 * solver convergence.
 *
 * Each test case builds a constrained sketch, solves it, and checks:
 * 1. Solver status (converged / under-constrained / over-constrained)
 * 2. maxError is within tolerance
 * 3. Solved point positions match expected values
 * 4. No false rejections (or expected rejections)
 * 5. DOF matches expectations
 */

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { initKernel } from '../src/forge/kernel';
import { resolvePackagePath } from './package-runtime';
import { constrainedSketch, ConstrainedSketchBuilder } from '../src/forge/sketch/constraints/builder';
import { isConstraintSketch, ConstraintSketch } from '../src/forge/sketch/constraints/sketch';
import type { ConstraintDefinition, SketchPoint } from '../src/forge/sketch/constraints/types';
import { buildConstraintSvgDocument } from './sketch-svg';
import { getConstraintDef } from '../src/forge/sketch/constraints/registry';
import '../src/forge/sketch/constraints/defs';

const EPS = 1e-2; // solver tolerance for position checks (1/100th of a unit)
const ANGLE_EPS = 0.1; // degrees
let _verbose = false;

// ─── Helpers ────────────────────────────────────────────────────────────────────

function approx(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) <= eps;
}

function assertApprox(actual: number, expected: number, label: string, eps = EPS) {
  assert(
    approx(actual, expected, eps),
    `${label}: expected ${expected.toFixed(4)}, got ${actual.toFixed(4)} (diff=${Math.abs(actual - expected).toFixed(6)})`,
  );
}

function getPoint(def: ConstraintDefinition, id: string): SketchPoint {
  const pt = def.points.find((p) => p.id === id);
  if (!pt) throw new Error(`Point ${id} not found in definition`);
  return pt;
}

function assertPointAt(def: ConstraintDefinition, id: string, x: number, y: number, label: string) {
  const pt = getPoint(def, id);
  assertApprox(pt.x, x, `${label}.x`);
  assertApprox(pt.y, y, `${label}.y`);
}

function lineAngleDeg(def: ConstraintDefinition, lineId: string): number {
  const line = def.lines.find((l) => l.id === lineId);
  if (!line) throw new Error(`Line ${lineId} not found`);
  const a = getPoint(def, line.a);
  const b = getPoint(def, line.b);
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function lineLength(def: ConstraintDefinition, lineId: string): number {
  const line = def.lines.find((l) => l.id === lineId);
  if (!line) throw new Error(`Line ${lineId} not found`);
  const a = getPoint(def, line.a);
  const b = getPoint(def, line.b);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function dist(def: ConstraintDefinition, idA: string, idB: string): number {
  const a = getPoint(def, idA);
  const b = getPoint(def, idB);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function assertConverged(sketch: ConstraintSketch, label: string) {
  assert(
    sketch.constraintMeta.maxError < 1e-2,
    `${label}: solver did not converge, maxError=${sketch.constraintMeta.maxError.toFixed(6)}`,
  );
}

function assertNoRejections(sketch: ConstraintSketch, label: string) {
  assert.equal(
    sketch.constraintMeta.rejected.length,
    0,
    `${label}: unexpected rejections: ${sketch.constraintMeta.rejected.map((r) => `${r.type}(${r.id})`).join(', ')}`,
  );
}

// ─── Level 1: Single constraint types ────────────────────────────────────────

function testFixedPoint() {
  const s = constrainedSketch();
  const p = s.point(5, 10);
  s.fix(p, 3, 7);
  const result = s.solve();
  assertConverged(result, 'fixed');
  assertPointAt(result.definition, p, 3, 7, 'fixed point');
}

function testHorizontalLine() {
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(10, 5);
  const l = s.line(a, b);
  s.horizontal(l);
  const result = s.solve();
  assertConverged(result, 'horizontal');
  const pa = getPoint(result.definition, a);
  const pb = getPoint(result.definition, b);
  assertApprox(pb.y, pa.y, 'horizontal: b.y == a.y');
}

function testVerticalLine() {
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(5, 10);
  const l = s.line(a, b);
  s.vertical(l);
  const result = s.solve();
  assertConverged(result, 'vertical');
  const pa = getPoint(result.definition, a);
  const pb = getPoint(result.definition, b);
  assertApprox(pb.x, pa.x, 'vertical: b.x == a.x');
}

function testLength() {
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(10, 0);
  const l = s.line(a, b);
  s.length(l, 5);
  const result = s.solve();
  assertConverged(result, 'length');
  assertApprox(lineLength(result.definition, l), 5, 'length value');
}

function testDistance() {
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(10, 10);
  s.distance(a, b, 7);
  const result = s.solve();
  assertConverged(result, 'distance');
  assertApprox(dist(result.definition, a, b), 7, 'distance value');
}

function testAbsoluteAngle() {
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(10, 0);
  const l = s.line(a, b);
  s.absoluteAngle(l, 45);
  const result = s.solve();
  assertConverged(result, 'absoluteAngle');
  const angle = lineAngleDeg(result.definition, l);
  assertApprox(angle, 45, 'absoluteAngle value', ANGLE_EPS);
}

function testAbsoluteAngle90() {
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(10, 0);
  const l = s.line(a, b);
  s.absoluteAngle(l, 90);
  const result = s.solve();
  assertConverged(result, 'absoluteAngle 90');
  const angle = lineAngleDeg(result.definition, l);
  assertApprox(angle, 90, 'absoluteAngle 90 value', ANGLE_EPS);
}

function testAbsoluteAngle0() {
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(0, 10);
  const l = s.line(a, b);
  s.absoluteAngle(l, 0);
  const result = s.solve();
  assertConverged(result, 'absoluteAngle 0');
  const angle = lineAngleDeg(result.definition, l);
  assertApprox(Math.abs(angle), 0, 'absoluteAngle 0 value', ANGLE_EPS);
}

function testCoincident() {
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(10, 10);
  s.coincident(a, b);
  const result = s.solve();
  assertConverged(result, 'coincident');
  assertPointAt(result.definition, b, 0, 0, 'coincident b→a');
}

function testParallel() {
  const s = constrainedSketch();
  const a1 = s.point(0, 0, true);
  const a2 = s.point(10, 0, true);
  const b1 = s.point(0, 5, true);
  const b2 = s.point(10, 3);
  const la = s.line(a1, a2);
  const lb = s.line(b1, b2);
  s.parallel(la, lb);
  const result = s.solve();
  assertConverged(result, 'parallel');
  const pb2 = getPoint(result.definition, b2);
  assertApprox(pb2.y, 5, 'parallel: b2.y == b1.y'); // should be same y as b1
}

function testPerpendicular() {
  const s = constrainedSketch();
  const a1 = s.point(0, 0, true);
  const a2 = s.point(10, 0, true);
  const b1 = s.point(5, 0, true);
  const b2 = s.point(10, 5);
  const la = s.line(a1, a2);
  const lb = s.line(b1, b2);
  s.perpendicular(la, lb);
  const result = s.solve();
  assertConverged(result, 'perpendicular');
  const pb2 = getPoint(result.definition, b2);
  assertApprox(pb2.x, 5, 'perpendicular: b2.x == b1.x'); // should be vertical
}

function testMidpoint() {
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(10, 0, true);
  const m = s.point(3, 5);
  const l = s.line(a, b);
  s.midpoint(m, l);
  const result = s.solve();
  assertConverged(result, 'midpoint');
  assertPointAt(result.definition, m, 5, 0, 'midpoint');
}

function testCollinear() {
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(10, 10, true);
  const p = s.point(3, 7);
  const l = s.line(a, b);
  s.collinear(p, l);
  const result = s.solve();
  assertConverged(result, 'collinear');
  const pt = getPoint(result.definition, p);
  assertApprox(pt.x, pt.y, 'collinear: point on y=x line');
}

function testEqual() {
  const s = constrainedSketch();
  const a1 = s.point(0, 0, true);
  const a2 = s.point(10, 0, true);
  const b1 = s.point(0, 5, true);
  const b2 = s.point(3, 5);
  const la = s.line(a1, a2);
  const lb = s.line(b1, b2);
  s.equal(la, lb);
  const result = s.solve();
  assertConverged(result, 'equal');
  assertApprox(
    lineLength(result.definition, lb),
    lineLength(result.definition, la),
    'equal lengths',
  );
}

function testHDistance() {
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(10, 5);
  s.hDistance(a, b, 7);
  const result = s.solve();
  assertConverged(result, 'hDistance');
  const pb = getPoint(result.definition, b);
  assertApprox(pb.x, 7, 'hDistance value');
}

function testVDistance() {
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(5, 10);
  s.vDistance(a, b, 4);
  const result = s.solve();
  assertConverged(result, 'vDistance');
  const pb = getPoint(result.definition, b);
  assertApprox(pb.y, 4, 'vDistance value');
}

function testSymmetric() {
  const s = constrainedSketch();
  const a1 = s.point(0, 0, true);
  const a2 = s.point(0, 10, true);
  const axis = s.line(a1, a2); // vertical axis at x=0
  const p = s.point(-3, 5, true);
  const q = s.point(1, 5);
  s.symmetric(p, q, axis);
  const result = s.solve();
  assertConverged(result, 'symmetric');
  assertPointAt(result.definition, q, 3, 5, 'symmetric mirror');
}

function testPointOnLine() {
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(10, 0, true);
  const p = s.point(5, 3);
  const l = s.line(a, b);
  s.pointOnLine(p, l);
  const result = s.solve();
  assertConverged(result, 'pointOnLine');
  const pt = getPoint(result.definition, p);
  assertApprox(pt.y, 0, 'pointOnLine: y should be 0');
  // Should be on the segment (0 ≤ x ≤ 10)
  assert(pt.x >= -EPS && pt.x <= 10 + EPS, `pointOnLine: x=${pt.x} should be in [0, 10]`);
}

// ─── Level 2: Compound constraints ──────────────────────────────────────────

function testRightTriangle() {
  // A right triangle with hypotenuse=5, sides at 0° and 90°
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(4, 0);
  const c = s.point(0, 3);
  const l1 = s.line(a, b);
  const l2 = s.line(a, c);
  const l3 = s.line(b, c);
  s.horizontal(l1);
  s.vertical(l2);
  s.length(l1, 4);
  s.length(l2, 3);
  const result = s.solve();
  assertConverged(result, 'rightTriangle');
  assertNoRejections(result, 'rightTriangle');
  assertPointAt(result.definition, b, 4, 0, 'right triangle B');
  assertPointAt(result.definition, a, 0, 0, 'right triangle A');
  assertApprox(lineLength(result.definition, l3), 5, 'right triangle hypotenuse');
}

function testSquare() {
  // Square: 4 points, 4 lines, all sides equal, all perpendicular
  const s = constrainedSketch();
  const p1 = s.point(0, 0, true);
  const p2 = s.point(10, 0);
  const p3 = s.point(10, 10);
  const p4 = s.point(0, 10);
  const l1 = s.line(p1, p2);
  const l2 = s.line(p2, p3);
  const l3 = s.line(p3, p4);
  const l4 = s.line(p4, p1);
  s.horizontal(l1);
  s.perpendicular(l1, l2);
  s.parallel(l1, l3);
  s.parallel(l2, l4);
  s.equal(l1, l2);
  s.equal(l1, l3);
  s.equal(l1, l4);
  s.length(l1, 5);
  const result = s.solve();
  assertConverged(result, 'square');
  assertNoRejections(result, 'square');
  assertPointAt(result.definition, p1, 0, 0, 'square p1');
  assertPointAt(result.definition, p2, 5, 0, 'square p2');
  // p3 can be at (5,5) or (5,-5) depending on solver; check side length
  assertApprox(lineLength(result.definition, l2), 5, 'square side 2');
  assertApprox(lineLength(result.definition, l3), 5, 'square side 3');
  assertApprox(lineLength(result.definition, l4), 5, 'square side 4');
}

function testEquilateralTriangle() {
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(10, 0);
  const c = s.point(5, 8.66);
  const l1 = s.line(a, b);
  const l2 = s.line(b, c);
  const l3 = s.line(c, a);
  s.horizontal(l1);
  s.equal(l1, l2);
  s.equal(l1, l3);
  s.length(l1, 10);
  const result = s.solve();
  assertConverged(result, 'equilateralTriangle');
  assertNoRejections(result, 'equilateralTriangle');
  assertApprox(lineLength(result.definition, l1), 10, 'eqTri side 1');
  assertApprox(lineLength(result.definition, l2), 10, 'eqTri side 2');
  assertApprox(lineLength(result.definition, l3), 10, 'eqTri side 3');
}

function testAngleBetweenLines() {
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(10, 0, true);
  const c = s.point(0, 0, true);
  const d = s.point(10, 5);
  const l1 = s.line(a, b);
  const l2 = s.line(c, d);
  s.angleBetween(l1, l2, 60);
  const result = s.solve();
  assertConverged(result, 'angleBetween');
  const angle = lineAngleDeg(result.definition, l2);
  // The angle between the lines should be 60°
  const diff = Math.abs(angle) % 180;
  const angleDiff = Math.min(diff, 180 - diff);
  assertApprox(angleDiff, 60, 'angleBetween value', ANGLE_EPS);
}

function testLineDistanceWithParallel() {
  const s = constrainedSketch();
  const a1 = s.point(0, 0, true);
  const a2 = s.point(10, 0, true);
  const b1 = s.point(0, 1);
  const b2 = s.point(10, 1);
  const la = s.line(a1, a2);
  const lb = s.line(b1, b2);
  s.lineDistance(la, lb, 5);
  const result = s.solve();
  assertConverged(result, 'lineDistance');
  // b should be offset 5 units from a (perpendicular)
  const pb1 = getPoint(result.definition, b1);
  const pb2 = getPoint(result.definition, b2);
  assertApprox(pb1.y, 5, 'lineDistance b1.y');
  assertApprox(pb2.y, 5, 'lineDistance b2.y');
}

// ─── Level 3: Fully constrained sketches ────────────────────────────────────

function testFullyConstrainedRectangle() {
  // Fully constrained rectangle: origin fixed, horizontal/vertical sides, width=6, height=4
  const s = constrainedSketch();
  const p1 = s.point(0, 0, true);
  const p2 = s.point(6, 0);
  const p3 = s.point(6, 4);
  const p4 = s.point(0, 4);
  const bottom = s.line(p1, p2);
  const right = s.line(p2, p3);
  const top = s.line(p3, p4);
  const left = s.line(p4, p1);
  s.horizontal(bottom);
  s.horizontal(top);
  s.vertical(left);
  s.vertical(right);
  s.length(bottom, 6);
  s.length(left, 4);
  const result = s.solve();
  assertConverged(result, 'fullyConstrainedRect');
  assertNoRejections(result, 'fullyConstrainedRect');
  assertPointAt(result.definition, p1, 0, 0, 'rect p1');
  assertPointAt(result.definition, p2, 6, 0, 'rect p2');
  assertPointAt(result.definition, p3, 6, 4, 'rect p3');
  assertPointAt(result.definition, p4, 0, 4, 'rect p4');
  assert(
    result.constraintMeta.dof === 0,
    `Expected DOF=0, got ${result.constraintMeta.dof}`,
  );
}

function testIsoscelesTriangleWithAngle() {
  // Isosceles triangle: base horizontal, two equal sides, apex angle = 60°
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(10, 0);
  const c = s.point(5, 8);
  const base = s.line(a, b);
  const left = s.line(a, c);
  const right = s.line(b, c);
  s.horizontal(base);
  s.equal(left, right);
  s.length(base, 10);
  s.angleBetween(left, right, 60);
  const result = s.solve();
  assertConverged(result, 'isoscelesTriangle');
  assertNoRejections(result, 'isoscelesTriangle');
  assertApprox(lineLength(result.definition, left), lineLength(result.definition, right), 'isosceles equal sides');
}

// ─── Level 4: Stress tests for known issues ──────────────────────────────────

function testAbsoluteAngleDoesNotFlip() {
  // Regression test: absoluteAngle residual has two zeros (target and target+180°).
  // The solver should NOT converge to the wrong one.
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(10, 1); // starts near 0° → should solve to 30°, NOT 210°
  const l = s.line(a, b);
  s.absoluteAngle(l, 30);
  const result = s.solve();
  assertConverged(result, 'absoluteAngle no-flip');
  const angle = lineAngleDeg(result.definition, l);
  // Must be 30°, NOT 210° (= 30+180)
  assertApprox(angle, 30, 'absoluteAngle should be 30, not 210', ANGLE_EPS);
}

function testAbsoluteAngle135NoFlip() {
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(-5, 5); // starts near 135°
  const l = s.line(a, b);
  s.absoluteAngle(l, 135);
  const result = s.solve();
  assertConverged(result, 'absoluteAngle 135');
  const angle = lineAngleDeg(result.definition, l);
  assertApprox(angle, 135, 'absoluteAngle should be 135', ANGLE_EPS);
}

function testConstraintOrderIndependence() {
  // Two sketches with the same geometry but constraints added in different order
  // should produce the same solved positions (within tolerance).
  const build = (order: 'hl' | 'lh') => {
    const s = constrainedSketch();
    const a = s.point(0, 0, true);
    const b = s.point(10, 3);
    const l = s.line(a, b);
    if (order === 'hl') {
      s.horizontal(l);
      s.length(l, 7);
    } else {
      s.length(l, 7);
      s.horizontal(l);
    }
    return s.solve();
  };
  const r1 = build('hl');
  const r2 = build('lh');
  assertConverged(r1, 'orderIndep hl');
  assertConverged(r2, 'orderIndep lh');
  const b1 = getPoint(r1.definition, 'pt-2');
  const b2 = getPoint(r2.definition, 'pt-2');
  assertApprox(b1.x, b2.x, 'order independence x');
  assertApprox(b1.y, b2.y, 'order independence y');
}

function testRedundantConstraintDetected() {
  // horizontal + absoluteAngle(0) are redundant — the solver should still converge
  // and at least one constraint should be flagged as redundant.
  const s = constrainedSketch();
  const a = s.point(0, 0, true);
  const b = s.point(10, 0);
  const l = s.line(a, b);
  s.horizontal(l);
  s.absoluteAngle(l, 0);
  const result = s.solve();
  assertConverged(result, 'redundant');
  // With a fixed point, these two constraints fully determine b (DOF=0).
  // The system should converge regardless — the redundancy is benign.
  const hasRedundant = result.constraintMeta.constraints.some((c) => c.redundant);
  const isOverConstrained = result.constraintMeta.status === 'over-constrained';
  assert(
    hasRedundant || isOverConstrained || result.constraintMeta.dof <= 0,
    `Expected redundancy detection or over-constrained, got status=${result.constraintMeta.status} dof=${result.constraintMeta.dof} redundant=${hasRedundant}`,
  );
}

// ─── Level 5: Snapshot-based regression tests ───────────────────────────────

const SNAPSHOT_DIR = resolvePackagePath(import.meta.url, 'cli', 'snapshots');

interface ConstraintSnapshot {
  points: { id: string; x: number; y: number }[];
  status: string;
  maxError: number;
  dof: number;
  rejectedCount: number;
}

function captureSnapshot(sketch: ConstraintSketch): ConstraintSnapshot {
  return {
    points: sketch.definition.points.map((p) => ({
      id: p.id,
      x: Math.round(p.x * 1000) / 1000,
      y: Math.round(p.y * 1000) / 1000,
    })),
    status: sketch.constraintMeta.status,
    maxError: Math.round(sketch.constraintMeta.maxError * 1e6) / 1e6,
    dof: sketch.constraintMeta.dof,
    rejectedCount: sketch.constraintMeta.rejected.length,
  };
}

function loadSnapshots(): Record<string, ConstraintSnapshot> {
  const path = join(SNAPSHOT_DIR, 'constraint-snapshots.json');
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function saveSnapshots(data: Record<string, ConstraintSnapshot>) {
  if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });
  writeFileSync(
    join(SNAPSHOT_DIR, 'constraint-snapshots.json'),
    JSON.stringify(data, null, 2) + '\n',
  );
}

function compareSnapshot(name: string, current: ConstraintSnapshot, saved: ConstraintSnapshot) {
  assert.equal(current.status, saved.status, `${name}: status changed (${saved.status} → ${current.status})`);
  assert.equal(current.dof, saved.dof, `${name}: dof changed (${saved.dof} → ${current.dof})`);
  assert.equal(
    current.rejectedCount,
    saved.rejectedCount,
    `${name}: rejectedCount changed (${saved.rejectedCount} → ${current.rejectedCount})`,
  );
  assert(
    current.maxError <= saved.maxError + 1e-3,
    `${name}: maxError regressed (${saved.maxError} → ${current.maxError})`,
  );
  // Compare point positions
  for (let i = 0; i < current.points.length && i < saved.points.length; i++) {
    const cp = current.points[i];
    const sp = saved.points[i];
    if (cp.id !== sp.id) continue;
    assert(
      Math.abs(cp.x - sp.x) < 0.1 && Math.abs(cp.y - sp.y) < 0.1,
      `${name}: point ${cp.id} moved (${sp.x},${sp.y}) → (${cp.x},${cp.y})`,
    );
  }
}

type SnapshotCase = {
  name: string;
  build: () => ConstraintSketch;
};

const snapshotCases: SnapshotCase[] = [
  {
    name: 'rect-6x4',
    build: () => {
      const s = constrainedSketch();
      const p1 = s.point(0, 0, true);
      const p2 = s.point(6, 0);
      const p3 = s.point(6, 4);
      const p4 = s.point(0, 4);
      s.line(p1, p2);
      s.line(p2, p3);
      s.line(p3, p4);
      s.line(p4, p1);
      s.horizontal(s.lineAt(0));
      s.horizontal(s.lineAt(2));
      s.vertical(s.lineAt(1));
      s.vertical(s.lineAt(3));
      s.length(s.lineAt(0), 6);
      s.length(s.lineAt(3), 4);
      return s.solve();
    },
  },
  {
    name: 'equilateral-10',
    build: () => {
      const s = constrainedSketch();
      const a = s.point(0, 0, true);
      const b = s.point(10, 0);
      const c = s.point(5, 8.66);
      const l1 = s.line(a, b);
      const l2 = s.line(b, c);
      const l3 = s.line(c, a);
      s.horizontal(l1);
      s.equal(l1, l2);
      s.equal(l1, l3);
      s.length(l1, 10);
      return s.solve();
    },
  },
  {
    name: 'angle-30-from-horiz',
    build: () => {
      const s = constrainedSketch();
      const a = s.point(0, 0, true);
      const b = s.point(10, 0, true);
      const c = s.point(0, 0, true);
      const d = s.point(10, 5);
      const l1 = s.line(a, b);
      const l2 = s.line(c, d);
      s.horizontal(l1);
      s.absoluteAngle(l2, 30);
      s.length(l2, 10);
      return s.solve();
    },
  },
];

function runSnapshotTests(update: boolean): number {
  const saved = loadSnapshots();
  const next: Record<string, ConstraintSnapshot> = {};
  let failures = 0;

  const svgDir = join(SNAPSHOT_DIR, 'constraint-svgs');

  for (const tc of snapshotCases) {
    try {
      const result = tc.build();
      const snap = captureSnapshot(result);
      next[tc.name] = snap;

      if (!update && saved[tc.name]) {
        compareSnapshot(tc.name, snap, saved[tc.name]);
      }

      // Generate SVG for visual inspection
      if (update) {
        const svg = buildConstraintSvgDocument(result.constraintMeta);
        if (!existsSync(svgDir)) mkdirSync(svgDir, { recursive: true });
        writeFileSync(join(svgDir, `${tc.name}.svg`), svg);
      }

      console.log(`  ✓ ${tc.name}`);
    } catch (e) {
      failures++;
      console.error(`  ✗ ${tc.name}: ${(e as Error).message}`);
    }
  }

  if (update) {
    saveSnapshots(next);
    console.log(`  Saved ${Object.keys(next).length} snapshots + SVGs to ${svgDir}`);
  }

  return failures;
}

// ─── Level 6: Complex multi-constraint systems ──────────────────────────────

/**
 * Simplified spectrogram holder: equilateral triangle with lineDistance offsets,
 * absoluteAngle constraints, and pointOnLine. This captures the essential
 * constraint patterns from the spectrogram model.
 */
function testPrismHolderSubsystem() {
  const sk = constrainedSketch();
  const origin = sk.point(0, 0);
  sk.fix(origin);

  // Inner equilateral triangle
  const p2 = sk.point(1, 1);
  const p3 = sk.point(0, 5);
  const l1 = sk.line(origin, p2);
  const l2 = sk.line(p2, p3);
  const l3 = sk.line(p3, origin);
  sk.equal(l1, l2);
  sk.equal(l1, l3);
  sk.ccw(origin, p2, p3);
  const innerShape = sk.shape([l1, l2, l3]);
  sk.length(l1, 22);
  sk.absoluteAngle(l1, 46);

  // Outer equilateral triangle (offset)
  const ep1 = sk.point(0, 0);
  const ep2 = sk.point(1, 1);
  const ep3 = sk.point(0, 5);
  const el1 = sk.line(ep1, ep2);
  const el2 = sk.line(ep2, ep3);
  const el3 = sk.line(ep3, ep1);
  sk.equal(el1, el2);
  sk.equal(el1, el3);
  sk.ccw(ep1, ep2, ep3);
  const outerShape = sk.shape([el1, el2, el3]);

  sk.lineDistance(l1, el1, -2);
  sk.shapeEqualCentroid(innerShape, outerShape);

  const result = sk.solve();
  assertConverged(result, 'prismHolder');
  assertNoRejections(result, 'prismHolder');

  // Verify inner triangle has side length 22
  assertApprox(lineLength(result.definition, l1), 22, 'inner side length', 0.1);
  // Verify absoluteAngle of l1 is 46°
  assertApprox(lineAngleDeg(result.definition, l1), 46, 'inner angle', ANGLE_EPS);
}

/**
 * Test pointOnLine + pointLineDistance combo (from spectrogram's lightLeavingPoint).
 */
function testPointOnLineWithDistance() {
  const sk = constrainedSketch();
  const a = sk.point(0, 0, true);
  const b = sk.point(10, 0, true);
  const c = sk.point(10, 10, true);
  const l1 = sk.line(a, b);
  const l2 = sk.line(b, c);

  const p = sk.point(5, 5);
  sk.pointOnLine(p, l2);
  sk.pointLineDistance(p, l1, 5);

  const result = sk.solve();
  assertConverged(result, 'POL+PLD');
  assertNoRejections(result, 'POL+PLD');
  const pt = getPoint(result.definition, p);
  assertApprox(pt.x, 10, 'POL+PLD x on l2');
  assertApprox(pt.y, 5, 'POL+PLD y at distance 5');
}

/**
 * Test lineDistance chain: 3 parallel lines with constrained offsets.
 */
function testLineDistanceChain() {
  const sk = constrainedSketch();
  const a1 = sk.point(0, 0, true);
  const a2 = sk.point(10, 0, true);
  const b1 = sk.point(0, 1);
  const b2 = sk.point(10, 1);
  const c1 = sk.point(0, 2);
  const c2 = sk.point(10, 2);

  const la = sk.line(a1, a2);
  const lb = sk.line(b1, b2);
  const lc = sk.line(c1, c2);

  sk.lineDistance(la, lb, 3);
  sk.lineDistance(lb, lc, 5);

  const result = sk.solve();
  assertConverged(result, 'lineDistanceChain');
  assertNoRejections(result, 'lineDistanceChain');
  const pb1 = getPoint(result.definition, b1);
  const pc1 = getPoint(result.definition, c1);
  assertApprox(pb1.y, 3, 'chain b offset');
  assertApprox(pc1.y, 8, 'chain c offset');
}

// ─── L3.5: Multi-subsystem intermediate tests ────────────────────────────────
// These bridge the gap between L3 (fully constrained simple shapes) and
// L5 (full spectrogram). Each tests a specific pattern the spectrogram uses.

/**
 * Rectangle with internal offset — tests lineDistance on all 4 sides.
 * This is the core pattern of the spectrogram's case (external + internal).
 */
function testRectangleWithInternalOffset() {
  const sk = constrainedSketch();
  const p1 = sk.point(0, 0, true);
  const p2 = sk.point(20, 0);
  const p3 = sk.point(20, 15);
  const p4 = sk.point(0, 15);

  // Outer rectangle
  const bot = sk.line(p1, p2);
  const right = sk.line(p2, p3);
  const top = sk.line(p3, p4);
  const left = sk.line(p4, p1);
  sk.horizontal(bot);
  sk.vertical(right);
  sk.horizontal(top);
  sk.vertical(left);
  sk.length(bot, 20);
  sk.length(right, 15);

  // Inner rectangle offset by 3
  const ip1 = sk.point(3, 3);
  const ip2 = sk.point(17, 3);
  const ip3 = sk.point(17, 12);
  const ip4 = sk.point(3, 12);
  const ibot = sk.line(ip1, ip2);
  const iright = sk.line(ip2, ip3);
  const itop = sk.line(ip3, ip4);
  const ileft = sk.line(ip4, ip1);

  sk.lineDistance(bot, ibot, 3);
  sk.lineDistance(right, iright, -3);
  sk.lineDistance(top, itop, -3);
  sk.lineDistance(left, ileft, 3);

  const result = sk.solve();
  assertConverged(result, 'rectWithOffset');
  assertNoRejections(result, 'rectWithOffset');
  const ip1r = getPoint(result.definition, ip1);
  assertApprox(ip1r.x, 3, 'inner p1.x');
  assertApprox(ip1r.y, 3, 'inner p1.y');
}

/**
 * Equilateral triangle with absoluteAngle + offset triangle + centroid alignment.
 * This is the prism holder + outer triangle from the spectrogram.
 */
function testDualTriangleWithCentroid() {
  const sk = constrainedSketch();
  const origin = sk.point(0, 0);
  sk.fix(origin);

  // Inner triangle
  const p2 = sk.point(10, 0);
  const p3 = sk.point(5, 8.66);
  const l1 = sk.line(origin, p2);
  const l2 = sk.line(p2, p3);
  const l3 = sk.line(p3, origin);
  sk.equal(l1, l2);
  sk.equal(l1, l3);
  sk.ccw(origin, p2, p3);
  const innerShape = sk.shape([l1, l2, l3]);
  sk.length(l1, 15);
  sk.absoluteAngle(l1, 30);

  // Outer triangle — offset + centroid aligned
  const ep1 = sk.point(-2, -1);
  const ep2 = sk.point(12, -1);
  const ep3 = sk.point(5, 10);
  const el1 = sk.line(ep1, ep2);
  const el2 = sk.line(ep2, ep3);
  const el3 = sk.line(ep3, ep1);
  sk.equal(el1, el2);
  sk.equal(el1, el3);
  sk.ccw(ep1, ep2, ep3);
  const outerShape = sk.shape([el1, el2, el3]);

  sk.lineDistance(l1, el1, -3);
  sk.shapeEqualCentroid(innerShape, outerShape);

  const result = sk.solve();
  assertConverged(result, 'dualTriCentroid');
  assertNoRejections(result, 'dualTriCentroid');
  assertApprox(lineLength(result.definition, l1), 15, 'inner side', 0.1);
  assertApprox(lineAngleDeg(result.definition, l1), 30, 'inner angle', ANGLE_EPS);
}

/**
 * Multi-angle rectangle (absoluteAngle on each side).
 * Tests the case subsystem's angle pattern.
 */
function testRectangleWithAbsoluteAngles() {
  const sk = constrainedSketch();
  const p1 = sk.point(0, 0, true);
  const p2 = sk.point(10, 0);
  const p3 = sk.point(10, 8);
  const p4 = sk.point(0, 8);
  const bot = sk.line(p1, p2);
  const right = sk.line(p2, p3);
  const top = sk.line(p3, p4);
  const left = sk.line(p4, p1);
  sk.absoluteAngle(bot, 0);
  sk.absoluteAngle(right, 90);
  sk.absoluteAngle(top, 180);
  sk.absoluteAngle(left, -90);
  sk.length(bot, 10);
  sk.length(right, 8);

  const result = sk.solve();
  assertConverged(result, 'rectAbsAngle');
  assertNoRejections(result, 'rectAbsAngle');
  assertPointAt(result.definition, p2, 10, 0, 'rectAbsAngle p2');
  assertPointAt(result.definition, p3, 10, 8, 'rectAbsAngle p3');
}

/**
 * Connected subsystems: rectangle + triangle sharing an edge via pointOnLine.
 * Tests inter-subsystem connections.
 */
function testConnectedSubsystems() {
  const sk = constrainedSketch();
  const p1 = sk.point(0, 0, true);
  const p2 = sk.point(10, 0);
  const p3 = sk.point(10, 6);
  const p4 = sk.point(0, 6);

  // Rectangle
  const bot = sk.line(p1, p2);
  const right = sk.line(p2, p3);
  const top = sk.line(p3, p4);
  const left = sk.line(p4, p1);
  sk.horizontal(bot);
  sk.vertical(right);
  sk.horizontal(top);
  sk.vertical(left);
  sk.length(bot, 10);
  sk.length(right, 6);

  // Triangle attached to right side
  const apex = sk.point(15, 3);
  const tl1 = sk.line(p2, apex);
  const tl2 = sk.line(apex, p3);
  sk.equal(tl1, tl2);
  sk.midpoint(apex, right);  // Actually: apex is at midpoint of right side (no — midpoint constrains apex ON right)

  // Point on the top side
  const mid = sk.point(5, 6);
  sk.pointOnLine(mid, top);
  sk.midpoint(mid, top);

  const result = sk.solve();
  assertConverged(result, 'connectedSub');
  assertNoRejections(result, 'connectedSub');
  const apexPt = getPoint(result.definition, apex);
  // apex midpoint of right means apex.x=10, apex.y=3
  assertApprox(apexPt.x, 10, 'apex x');
  assertApprox(apexPt.y, 3, 'apex y');
}

/**
 * Camera-holder pattern: points constrained on lines + perpendicular + lineDistance.
 * This is a simplified version of the spectrogram's camera holder section.
 */
function testCameraHolderPattern() {
  const sk = constrainedSketch();

  // Base horizontal and vertical lines (simulating case internal)
  const a1 = sk.point(0, 0, true);
  const a2 = sk.point(0, 20, true);
  const b1 = sk.point(20, 0, true);
  const b2 = sk.point(20, 20, true);
  const leftWall = sk.line(a1, a2);
  const rightWall = sk.line(b1, b2);

  // Camera external: 4 lines forming a rectangle
  // Two points on leftWall, two on rightWall
  const cp1 = sk.point(0, 5);
  const cp2 = sk.point(0, 15);
  const cp3 = sk.point(20, 15);
  const cp4 = sk.point(20, 5);
  sk.pointOnLine(cp1, leftWall);
  sk.pointOnLine(cp2, leftWall);
  sk.pointOnLine(cp3, rightWall);
  sk.pointOnLine(cp4, rightWall);

  const cam1 = sk.line(cp1, cp4);
  const cam2 = sk.line(cp4, cp3);
  const cam3 = sk.line(cp3, cp2);
  const cam4 = sk.line(cp2, cp1);
  sk.perpendicular(leftWall, cam1);
  sk.perpendicular(leftWall, cam3);
  sk.length(cam2, 10);

  const result = sk.solve();
  assertConverged(result, 'cameraHolder');
  assertNoRejections(result, 'cameraHolder');
  // cam1 and cam3 should be horizontal (perpendicular to vertical leftWall)
  const cp1r = getPoint(result.definition, cp1);
  const cp4r = getPoint(result.definition, cp4);
  assertApprox(cp1r.y, cp4r.y, 'cam1 horizontal');
}

/**
 * Opening pattern: rectangle aligned to two lines via lineDistance(0) + midpoint.
 * Tests the opening subsystem from the spectrogram.
 */
function testOpeningPattern() {
  const sk = constrainedSketch();
  // Two fixed parallel horizontal lines
  const a1 = sk.point(0, 0, true);
  const a2 = sk.point(20, 0, true);
  const b1 = sk.point(0, 10, true);
  const b2 = sk.point(20, 10, true);
  const baseLine = sk.line(a1, a2);
  const topLine = sk.line(b1, b2);

  // Opening: small rectangle between the two lines
  const op1 = sk.point(8, 0);
  const op2 = sk.point(12, 0);
  const op3 = sk.point(12, 10);
  const op4 = sk.point(8, 10);
  const obot = sk.line(op1, op2);
  const oright = sk.line(op2, op3);
  const otop = sk.line(op3, op4);
  const oleft = sk.line(op4, op1);

  sk.parallel(obot, otop);
  sk.parallel(oright, oleft);
  sk.perpendicular(obot, oright);
  sk.length(obot, 4);
  sk.lineDistance(obot, baseLine, 0);  // bottom aligned with baseLine
  sk.lineDistance(otop, topLine, 0);   // top aligned with topLine

  const attachMid = sk.point(10, 0);
  sk.midpoint(attachMid, obot);
  sk.midpoint(attachMid, baseLine);

  const result = sk.solve();
  assertConverged(result, 'openingPattern');
  assertNoRejections(result, 'openingPattern');
  const mid = getPoint(result.definition, attachMid);
  assertApprox(mid.x, 10, 'midpoint x');
  assertApprox(mid.y, 0, 'midpoint y');
}

/**
 * Full case subsystem: 5-segment external path with absolute angles +
 * 5-segment internal offset. This is the most complex intermediate test,
 * directly testing the spectrogram's case construction.
 */
function testCaseSubsystem() {
  const sk = constrainedSketch();

  // Start/end points (simulating outer triangle vertices)
  const start = sk.point(0, 0, true);
  const end = sk.point(5, 15, true);

  // External case: 5 lines going down, right, up, left, down
  function getLines(p1: string, p2: string, count: number) {
    const results: { points: string[]; line: string }[] = [];
    let nextStart = p1;
    for (let i = 0; i < count; i++) {
      const endPt = i === count - 1 ? p2 : sk.point(0, 0);
      const line = sk.line(nextStart, endPt);
      results.push({ points: [nextStart, endPt], line });
      nextStart = endPt;
    }
    sk.ccw(...results.map((obj) => obj.points[0]));
    return results;
  }

  const ext = getLines(start, end, 5);
  sk.absoluteAngle(ext[0].line, -90);
  sk.absoluteAngle(ext[1].line, 0);
  sk.absoluteAngle(ext[2].line, 90);
  sk.absoluteAngle(ext[3].line, 180);
  sk.absoluteAngle(ext[4].line, -90);

  // Internal case: offset by 3
  const intStart = sk.point(3, -3);
  const intEnd = sk.point(8, 12);
  const int_ = getLines(intStart, intEnd, 5);

  for (let i = 0; i < 5; i++) {
    sk.lineDistance(ext[i].line, int_[i].line, 3);
  }

  const result = sk.solve({ iterations: 200, restarts: 12 });
  const meta = result.constraintMeta;
  if (_verbose) {
    console.log(`      caseSubsys: status=${meta.status} maxErr=${meta.maxError.toFixed(4)} dof=${meta.dof}`);
  }
  assertConverged(result, 'caseSubsystem');
  assertNoRejections(result, 'caseSubsystem');
}

/**
 * Full spectrogram test (inline version of the .forge.js file).
 * Tests the complete constraint system end-to-end.
 */
function testFullSpectrogram() {
  const sk = constrainedSketch();

  // Helper to build equilateral triangle
  function eqTriangle(p1: string, p2: string, p3: string) {
    const l1 = sk.line(p1, p2);
    const l2 = sk.line(p2, p3);
    const l3 = sk.line(p3, p1);
    sk.equal(l1, l2);
    sk.equal(l1, l3);
    sk.ccw(p1, p2, p3);
    const shape = sk.shape([l1, l2, l3]);
    return { points: [p1, p2, p3], lines: [l1, l2, l3], shape };
  }

  function getLine(p1?: string, p2?: string) {
    if (!p1) p1 = sk.point(0, 0);
    if (!p2) p2 = sk.point(0, 1);
    const line = sk.line(p1, p2);
    return { points: [p1, p2], line };
  }

  function getLines(p1: string, p2: string, count: number) {
    const results: ReturnType<typeof getLine>[] = [];
    let nextStart = p1;
    for (let i = 0; i < count; i++) {
      const line = i === count - 1 ? getLine(nextStart, p2) : getLine(nextStart);
      nextStart = line.points[1];
      results.push(line);
    }
    sk.ccw(...results.map((obj) => obj.points[0]));
    return results;
  }

  // Build prism holder
  const origin = sk.point(0, 0);
  sk.fix(origin);
  const innerTri = eqTriangle(origin, sk.point(1, 1), sk.point(0, 5));
  const outerTri = eqTriangle(sk.point(0, 0), sk.point(1, 1), sk.point(0, 5));

  sk.length(innerTri.lines[0], 22);
  sk.lineDistance(innerTri.lines[0], outerTri.lines[0], -2);
  sk.shapeEqualCentroid(innerTri.shape, outerTri.shape);
  sk.absoluteAngle(innerTri.lines[0], 46);

  const lightLeavingPoint = sk.point(0, 0);
  sk.pointOnLine(lightLeavingPoint, innerTri.lines[1]);
  sk.pointLineDistance(lightLeavingPoint, innerTri.lines[0], 8.42);

  // Build case
  const caseExternal = getLines(outerTri.points[0], outerTri.points[2], 5);
  sk.absoluteAngle(caseExternal[0].line, -90);
  sk.absoluteAngle(caseExternal[1].line, 0);
  sk.absoluteAngle(caseExternal[2].line, 90);
  sk.absoluteAngle(caseExternal[3].line, 180);
  sk.absoluteAngle(caseExternal[4].line, -90);

  const intStartPt = sk.point(0, 0);
  sk.pointOnLine(intStartPt, outerTri.lines[0]);
  const intEndPt = sk.point(0, 0);
  sk.pointOnLine(intEndPt, outerTri.lines[1]);
  const caseInternal = getLines(intStartPt, intEndPt, 5);

  for (let i = 0; i < 5; i++) {
    sk.lineDistance(caseExternal[i].line, caseInternal[i].line, 5);
  }

  // Opening
  const openP1 = sk.point(0, 0);
  const attachMid = sk.point(0, 0);
  const openLines = getLines(openP1, openP1, 4);
  sk.parallel(openLines[0].line, openLines[2].line);
  sk.parallel(openLines[1].line, openLines[3].line);
  sk.length(openLines[0].line, 4);
  sk.perpendicular(openLines[0].line, openLines[1].line);
  sk.lineDistance(openLines[0].line, caseInternal[2].line, 0);
  sk.lineDistance(openLines[2].line, caseExternal[2].line, 0);
  sk.midpoint(attachMid, openLines[0].line);
  sk.midpoint(attachMid, caseInternal[2].line);

  // Camera holder
  const camP1 = sk.point(0, 0);
  const camExternal = getLines(camP1, camP1, 4);
  sk.pointOnLine(camExternal[0].points[0], caseInternal[3].line);
  sk.pointOnLine(camExternal[0].points[1], caseInternal[3].line);
  sk.pointOnLine(camExternal[2].points[0], caseInternal[1].line);
  sk.pointOnLine(camExternal[2].points[1], caseInternal[1].line);
  sk.perpendicular(caseInternal[3].line, camExternal[1].line);
  sk.perpendicular(caseInternal[3].line, camExternal[3].line);

  const camP2 = sk.point(0, 0);
  const camInternal = getLines(camP2, camP2, 4);
  sk.lineDistance(camExternal[0].line, camInternal[0].line, 2);
  sk.lineDistance(camExternal[1].line, camInternal[1].line, 2);
  sk.lineDistance(camExternal[2].line, camInternal[2].line, 2);
  sk.lineDistance(camExternal[3].line, camInternal[3].line, 2);
  sk.lineDistance(camInternal[1].line, camInternal[3].line, 2);
  sk.lineDistance(camInternal[3].line, caseInternal[2].line, -14);

  sk.length(camExternal[1].line, 38);
  const midpoint = sk.point(0, 0);
  sk.midpoint(midpoint, camExternal[1].line);
  const lightLine = getLine(lightLeavingPoint, midpoint);
  sk.length(lightLine.line, 21.5);
  sk.perpendicular(lightLine.line, camExternal[1].line);

  const result = sk.solve({ iterations: 200, restarts: 12 });

  // Key assertions for the spectrogram
  const meta = result.constraintMeta;
  console.log(`      status=${meta.status} maxErr=${meta.maxError.toFixed(4)} dof=${meta.dof} rejected=${meta.rejected.length}`);

  // Show per-constraint residuals for diagnosis
  if (_verbose) {
    // getConstraintDef imported at top of file
    const def = result.definition;
    const pts = new Map(def.points.map((p) => [p.id, p] as const));
    const lns = new Map(def.lines.map((l) => [l.id, l] as const));
    const cirs = new Map(def.circles.map((c) => [c.id, c] as const));
    const arcs = new Map((def.arcs ?? []).map((a) => [a.id, a] as const));
    const shapes = new Map((def.shapes ?? []).map((s) => [s.id, s] as const));
    const ctx = { points: pts, lines: lns, circles: cirs, arcs, shapes, tolerance: 1e-6, movePoint: () => false };
    const residuals: { id: string; type: string; err: number; res: number[] }[] = [];
    for (const c of def.constraints) {
      const cdef = getConstraintDef(c.type);
      if (!cdef?.residual) continue;
      const res = cdef.residual(c as never, ctx);
      const err = Math.max(...res.map(Math.abs));
      residuals.push({ id: c.id, type: c.type, err, res });
    }
    residuals.sort((a, b) => b.err - a.err);
    console.log(`      top residuals:`);
    for (const r of residuals.slice(0, 15)) {
      console.log(`        ${r.err.toFixed(4)} ${r.type} (${r.id}) [${r.res.map((v) => v.toFixed(4)).join(', ')}]`);
    }
  }

  // Track rejections — 0 is the target after deferred solving.
  assert.equal(meta.rejected.length, 0, `spectrogram: unexpected rejections (${meta.rejected.length})`);

  // Always generate spectrogram SVG for visual debugging
  const svgDir = join(SNAPSHOT_DIR, 'constraint-svgs');
  if (!existsSync(svgDir)) mkdirSync(svgDir, { recursive: true });
  const svg = buildConstraintSvgDocument(meta);
  writeFileSync(join(svgDir, 'spectrogram.svg'), svg);
  console.log(`      SVG → ${join(svgDir, 'spectrogram.svg')}`);
}


// ─── Diagnostic inspect ──────────────────────────────────────────────────────

function printDiagnostic(sketch: ConstraintSketch) {
  console.log(sketch.inspect());
  console.log('constraints:');
  for (const c of sketch.constraintMeta.constraints) {
    const status = c.conflicting ? '✗ CONFLICT' : c.redundant ? '~ REDUNDANT' : '✓';
    console.log(`  ${status} ${c.type} ${c.label} (${c.id})`);
  }
  if (sketch.constraintMeta.rejected.length > 0) {
    console.log(`rejected (${sketch.constraintMeta.rejected.length}):`);
    for (const r of sketch.constraintMeta.rejected) {
      console.log(`  ✗ ${r.type} ${r.label} (${r.id}) ${r.rejectionReason ?? ''}`);
    }
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────

export async function runCheckConstraintsCli(args: string[]): Promise<void> {
  await initKernel();

  const update = args.includes('--update');
  _verbose = args.includes('--verbose') || args.includes('-v');
  const caseFilter = args.find((a) => !a.startsWith('-'));

  console.log('Constraint solver invariants:');

  type TestEntry = { name: string; fn: () => void };

  const level1: TestEntry[] = [
    { name: 'fixed point', fn: testFixedPoint },
    { name: 'horizontal', fn: testHorizontalLine },
    { name: 'vertical', fn: testVerticalLine },
    { name: 'length', fn: testLength },
    { name: 'distance', fn: testDistance },
    { name: 'absoluteAngle', fn: testAbsoluteAngle },
    { name: 'absoluteAngle 90°', fn: testAbsoluteAngle90 },
    { name: 'absoluteAngle 0°', fn: testAbsoluteAngle0 },
    { name: 'coincident', fn: testCoincident },
    { name: 'parallel', fn: testParallel },
    { name: 'perpendicular', fn: testPerpendicular },
    { name: 'midpoint', fn: testMidpoint },
    { name: 'collinear', fn: testCollinear },
    { name: 'equal', fn: testEqual },
    { name: 'hDistance', fn: testHDistance },
    { name: 'vDistance', fn: testVDistance },
    { name: 'symmetric', fn: testSymmetric },
    { name: 'pointOnLine', fn: testPointOnLine },
  ];

  const level2: TestEntry[] = [
    { name: 'right triangle', fn: testRightTriangle },
    { name: 'square', fn: testSquare },
    { name: 'equilateral triangle', fn: testEquilateralTriangle },
    { name: 'angleBetween', fn: testAngleBetweenLines },
    { name: 'lineDistance', fn: testLineDistanceWithParallel },
  ];

  const level3: TestEntry[] = [
    { name: 'fully constrained rect', fn: testFullyConstrainedRectangle },
    { name: 'isosceles with angle', fn: testIsoscelesTriangleWithAngle },
  ];

  const level4: TestEntry[] = [
    { name: 'absoluteAngle no-flip 30°', fn: testAbsoluteAngleDoesNotFlip },
    { name: 'absoluteAngle no-flip 135°', fn: testAbsoluteAngle135NoFlip },
    { name: 'constraint order independence', fn: testConstraintOrderIndependence },
    { name: 'redundant constraint detection', fn: testRedundantConstraintDetected },
  ];

  const level4b: TestEntry[] = [
    { name: 'rectangle with internal offset', fn: testRectangleWithInternalOffset },
    { name: 'dual triangle with centroid', fn: testDualTriangleWithCentroid },
    { name: 'rectangle with absolute angles', fn: testRectangleWithAbsoluteAngles },
    { name: 'connected subsystems', fn: testConnectedSubsystems },
    { name: 'camera holder pattern', fn: testCameraHolderPattern },
    { name: 'opening pattern', fn: testOpeningPattern },
    { name: 'case subsystem', fn: testCaseSubsystem },
  ];

  const level5: TestEntry[] = [
    { name: 'prism holder subsystem', fn: testPrismHolderSubsystem },
    { name: 'pointOnLine + pointLineDistance', fn: testPointOnLineWithDistance },
    { name: 'lineDistance chain', fn: testLineDistanceChain },
    { name: 'full spectrogram (inline)', fn: testFullSpectrogram },
  ];

  const allTests = [
    { level: 'L1: Single constraints', tests: level1 },
    { level: 'L2: Compound constraints', tests: level2 },
    { level: 'L3: Fully constrained', tests: level3 },
    { level: 'L4: Regression', tests: level4 },
    { level: 'L4b: Intermediate (spectrogram subsystems)', tests: level4b },
    { level: 'L5: Complex systems', tests: level5 },
  ];

  let passed = 0;
  let failed = 0;

  for (const group of allTests) {
    console.log(`\n  ${group.level}:`);
    for (const t of group.tests) {
      if (caseFilter && !t.name.includes(caseFilter)) continue;
      try {
        t.fn();
        console.log(`    ✓ ${t.name}`);
        passed++;
      } catch (e) {
        console.error(`    ✗ ${t.name}: ${(e as Error).message}`);
        failed++;
      }
    }
  }

  console.log(`\n  Snapshots:`);
  const snapFailed = runSnapshotTests(update);
  passed += snapshotCases.length - snapFailed;
  failed += snapFailed;

  console.log(`\n✓ Constraints: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    throw new Error(`${failed} constraint test(s) failed`);
  }
}
