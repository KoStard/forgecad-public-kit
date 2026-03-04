#!/usr/bin/env node
/**
 * Transform/assembly invariants check.
 * Purpose: catch frame-composition regressions early.
 */

import assert from 'node:assert/strict';
import { assembly } from '../src/forge/assembly';
import { box, initKernel } from '../src/forge/kernel';
import { group } from '../src/forge/group';
import { Transform } from '../src/forge/transform';
import { resolveJointViewValues, type JointViewCouplingDef, type JointViewDef } from '../src/forge/jointsView';

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

function testShapeGroupRotateAroundSugar() {
  const hingeY = 18;
  const lid = group(
    box(60, 40, 4, true).translate(0, 0, 2),
    box(18, 8, 2, true).translate(0, 10, 5),
  );

  const aroundSugar = lid
    .translate(0, 0, 1.5)
    .rotateAround([1, 0, 0], 35, [0, hingeY, 0])
    .boundingBox();

  const aroundTransform = lid
    .translate(0, 0, 1.5)
    .transform(Transform.rotationAxis([1, 0, 0], 35, [0, hingeY, 0]))
    .boundingBox();

  assertVec(aroundSugar.min, aroundTransform.min, 'group.rotateAround min');
  assertVec(aroundSugar.max, aroundTransform.max, 'group.rotateAround max');
}

function testShapeGroupPointAlongSugar() {
  const g = group(
    box(30, 12, 8, true).translate(0, 0, 2),
    box(10, 6, 4, true).translate(0, 10, 6),
  );

  const bySugar = g.pointAlong([1, 0, 0]).boundingBox();
  const byTransform = g.transform(Transform.rotationAxis([0, 1, 0], 90)).boundingBox();

  assertVec(bySugar.min, byTransform.min, 'group.pointAlong min');
  assertVec(bySugar.max, byTransform.max, 'group.pointAlong max');
}

function testAssemblyJointCouplings() {
  const mech = assembly('CoupledJointsInvariant')
    .addFrame('Base')
    .addFrame('A')
    .addFrame('B')
    .addFrame('C')
    .addRevolute('A', 'Base', 'A', { axis: [0, 0, 1] })
    .addRevolute('B', 'A', 'B', { axis: [0, 0, 1], min: -30, max: 30 })
    .addRevolute('C', 'B', 'C', { axis: [0, 0, 1] })
    .addJointCoupling('B', { terms: [{ joint: 'A', ratio: 2 }], offset: 10 })
    .addJointCoupling('C', { terms: [{ joint: 'A', ratio: -1 }, { joint: 'B', ratio: 0.5 }], offset: 5 });

  const solved = mech.solve({ A: 20, B: 999 });
  const state = solved.getJointState();

  assert(approx(state.A ?? Number.NaN, 20), `Expected A=20, got ${state.A}`);
  assert(approx(state.B ?? Number.NaN, 30), `Expected B=30 after clamp, got ${state.B}`);
  assert(approx(state.C ?? Number.NaN, 0), `Expected C=0 from coupled joints, got ${state.C}`);

  const warnings = solved.warnings().join('\n');
  assert(
    warnings.includes('Joint "B" state override ignored because it is coupled'),
    `Expected ignored-override warning for B, got:\n${warnings}`,
  );
}

function testAssemblyGearCouplings() {
  const mech = assembly('GearCouplingsInvariant')
    .addFrame('Base')
    .addFrame('DriverPart')
    .addFrame('DrivenPart')
    .addFrame('FollowerPart')
    .addRevolute('Driver', 'Base', 'DriverPart', { axis: [0, 0, 1] })
    .addRevolute('Driven', 'Base', 'DrivenPart', { axis: [0, 0, 1], min: -20, max: 20 })
    .addRevolute('Follower', 'Base', 'FollowerPart', { axis: [0, 0, 1] })
    .addGearCoupling('Driven', 'Driver', { driverTeeth: 14, drivenTeeth: 28 })
    .addGearCoupling('Follower', 'Driven', { pair: { jointRatio: -2 }, offset: 5 });

  const solved = mech.solve({ Driver: 30, Driven: 999, Follower: 999 });
  const state = solved.getJointState();

  assert(approx(state.Driver ?? Number.NaN, 30), `Expected Driver=30, got ${state.Driver}`);
  assert(approx(state.Driven ?? Number.NaN, -15), `Expected Driven=-15 from teeth ratio, got ${state.Driven}`);
  assert(approx(state.Follower ?? Number.NaN, 35), `Expected Follower=35 from pair ratio, got ${state.Follower}`);

  const warnings = solved.warnings().join('\n');
  assert(
    warnings.includes('Joint "Driven" state override ignored because it is coupled'),
    `Expected ignored-override warning for Driven, got:\n${warnings}`,
  );
  assert(
    warnings.includes('Joint "Follower" state override ignored because it is coupled'),
    `Expected ignored-override warning for Follower, got:\n${warnings}`,
  );

  const internal = assembly('InternalMeshSignInvariant')
    .addFrame('Base')
    .addFrame('A')
    .addFrame('B')
    .addRevolute('A', 'Base', 'A', { axis: [0, 0, 1] })
    .addRevolute('B', 'Base', 'B', { axis: [0, 0, 1] })
    .addGearCoupling('B', 'A', { driverTeeth: 20, drivenTeeth: 40, mesh: 'internal' });

  const internalState = internal.solve({ A: 12 }).getJointState();
  assert(approx(internalState.B ?? Number.NaN, 6), `Expected internal mesh B=6, got ${internalState.B}`);

  const bevel = assembly('BevelMeshSignInvariant')
    .addFrame('Base')
    .addFrame('A')
    .addFrame('B')
    .addRevolute('A', 'Base', 'A', { axis: [0, 0, 1] })
    .addRevolute('B', 'Base', 'B', { axis: [1, 0, 0] })
    .addGearCoupling('B', 'A', { driverTeeth: 24, drivenTeeth: 48, mesh: 'bevel' });

  const bevelState = bevel.solve({ A: 12 }).getJointState();
  assert(approx(bevelState.B ?? Number.NaN, -6), `Expected bevel mesh B=-6, got ${bevelState.B}`);

  const face = assembly('FaceMeshSignInvariant')
    .addFrame('Base')
    .addFrame('A')
    .addFrame('B')
    .addRevolute('A', 'Base', 'A', { axis: [0, 0, 1] })
    .addRevolute('B', 'Base', 'B', { axis: [1, 0, 0] })
    .addGearCoupling('B', 'A', { driverTeeth: 24, drivenTeeth: 48, mesh: 'face' });

  const faceState = face.solve({ A: 12 }).getJointState();
  assert(approx(faceState.B ?? Number.NaN, -6), `Expected face mesh B=-6, got ${faceState.B}`);
}

function testRuntimeJointCouplingResolution() {
  const joints: JointViewDef[] = [
    {
      name: 'Steer',
      child: 'Turret',
      parent: 'Base',
      type: 'revolute',
      axis: [0, 0, 1],
      pivot: [0, 0, 0],
      min: -180,
      max: 180,
      defaultValue: 0,
      unit: '°',
    },
    {
      name: 'Drive',
      child: 'Wheel',
      parent: 'Turret',
      type: 'revolute',
      axis: [1, 0, 0],
      pivot: [0, 0, -40],
      min: -1440,
      max: 1440,
      defaultValue: 0,
      unit: '°',
    },
    {
      name: 'Top Gear',
      child: 'Top Input',
      parent: 'Base',
      type: 'revolute',
      axis: [0, 0, 1],
      pivot: [0, 0, 0],
      min: -720,
      max: 720,
      defaultValue: 0,
      unit: '°',
    },
    {
      name: 'Motor',
      child: 'Motor 1',
      parent: 'Base',
      type: 'revolute',
      axis: [0, 0, 1],
      pivot: [0, 36, 0],
      min: -200,
      max: 200,
      defaultValue: 0,
      unit: '°',
    },
  ];

  const couplings: JointViewCouplingDef[] = [
    {
      joint: 'Top Gear',
      terms: [
        { joint: 'Steer', ratio: 1 },
        { joint: 'Drive', ratio: 20 / 14 },
      ],
      offset: 0,
    },
    {
      joint: 'Motor',
      terms: [{ joint: 'Top Gear', ratio: -2 }],
      offset: 0,
    },
  ];

  const values = resolveJointViewValues(joints, couplings, {
    Steer: 30,
    Drive: 70,
    'Top Gear': 999,
    Motor: 999,
  });

  assert(approx(values.Steer, 30), `Expected Steer=30, got ${values.Steer}`);
  assert(approx(values.Drive, 70), `Expected Drive=70, got ${values.Drive}`);
  assert(approx(values['Top Gear'], 130), `Expected Top Gear=130, got ${values['Top Gear']}`);
  assert(approx(values.Motor, -200), `Expected Motor=-200 after clamp, got ${values.Motor}`);
}

async function main() {
  await initKernel();
  testTransformMulOrder();
  testAssemblyChainAgainstAnalytic();
  testShapeGroupRotateAroundSugar();
  testShapeGroupPointAlongSugar();
  testAssemblyJointCouplings();
  testAssemblyGearCouplings();
  testRuntimeJointCouplingResolution();
  console.log('✓ Transform and assembly invariants passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
