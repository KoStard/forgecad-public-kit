#!/usr/bin/env node
/**
 * Transform/assembly invariants check.
 * Purpose: catch frame-composition regressions early.
 */

import assert from 'node:assert/strict';
import { assembly } from '../src/forge/assembly';
import { Transform } from '../src/forge/transform';

const EPS = 1e-6;

function approx(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) <= eps;
}

function assertVec(actual: [number, number, number], expected: [number, number, number], label: string) {
  for (let i = 0; i < 3; i++) {
    assert(
      approx(actual[i], expected[i]),
      `${label}[${i}] expected ${expected[i]}, got ${actual[i]}`,
    );
  }
}

function rotateZ(point: [number, number, number], deg: number): [number, number, number] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    point[0] * c - point[1] * s,
    point[0] * s + point[1] * c,
    point[2],
  ];
}

function testTransformMulOrder() {
  const t1 = Transform.translation(10, 0, 0);
  const t2 = Transform.rotationAxis([0, 0, 1], 90);

  const p12 = t1.mul(t2).point([1, 0, 0]);
  assertVec(p12, [0, 11, 0], 'mul order t1->t2');

  const p21 = t2.mul(t1).point([1, 0, 0]);
  assertVec(p21, [10, 1, 0], 'mul order t2->t1');
}

function testAssemblyChainAgainstAnalytic() {
  const baseYaw = 20;
  const shoulder = 35;
  const elbow = 55;
  const wristPitch = -20;

  const mountT = 8;
  const statorH = 44;
  const rotorH = 20;
  const towerH = 40;
  const shoulderPivotZ = mountT + statorH + rotorH + towerH * 0.62 - 4;
  const upperLen = 210;
  const foreReach = 220 + 70;

  const mech = assembly('TransformInvariant')
    .addFrame('Base')
    .addFrame('Yaw')
    .addFrame('Shoulder')
    .addFrame('Elbow')
    .addFrame('WristPitch')
    .addFrame('WristRoll')
    .addRevolute('BaseYaw', 'Base', 'Yaw', { axis: [0, 0, 1] })
    .addRevolute('Shoulder', 'Yaw', 'Shoulder', {
      axis: [0, -1, 0],
      frame: Transform.identity().translate(0, 0, shoulderPivotZ),
    })
    .addRevolute('Elbow', 'Shoulder', 'Elbow', {
      axis: [0, -1, 0],
      frame: Transform.identity().translate(upperLen, 0, 0),
    })
    .addRevolute('WristPitch', 'Elbow', 'WristPitch', {
      axis: [0, -1, 0],
      frame: Transform.identity().translate(foreReach, 0, 0),
    })
    .addRevolute('WristRoll', 'WristPitch', 'WristRoll', {
      axis: [1, 0, 0],
    });

  const solved = mech.solve({
    BaseYaw: baseYaw,
    Shoulder: shoulder,
    Elbow: elbow,
    WristPitch: wristPitch,
    WristRoll: 10,
  });

  const s = solved.getTransform('Shoulder').point([0, 0, 0]);
  const e = solved.getTransform('Elbow').point([0, 0, 0]);
  const w = solved.getTransform('WristRoll').point([0, 0, 0]);

  const r = (deg: number) => (deg * Math.PI) / 180;
  const pitchVec = (len: number, deg: number): [number, number, number] => [
    len * Math.cos(r(deg)),
    0,
    len * Math.sin(r(deg)),
  ];
  const add = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [
    a[0] + b[0],
    a[1] + b[1],
    a[2] + b[2],
  ];

  const shoulderLocal: [number, number, number] = [0, 0, shoulderPivotZ];
  const elbowLocal = add(shoulderLocal, pitchVec(upperLen, shoulder));
  const wristLocal = add(elbowLocal, pitchVec(foreReach, shoulder + elbow));

  const shoulderExpected = rotateZ(shoulderLocal, baseYaw);
  const elbowExpected = rotateZ(elbowLocal, baseYaw);
  const wristExpected = rotateZ(wristLocal, baseYaw);

  assertVec(s as [number, number, number], shoulderExpected, 'shoulder origin');
  assertVec(e as [number, number, number], elbowExpected, 'elbow origin');
  assertVec(w as [number, number, number], wristExpected, 'wrist origin');
}

function main() {
  testTransformMulOrder();
  testAssemblyChainAgainstAnalytic();
  console.log('✓ Transform and assembly invariants passed');
}

main();
