#!/usr/bin/env node
/**
 * Transform/assembly invariants check.
 * Purpose: catch frame-composition regressions early.
 */

import assert from 'node:assert/strict';
import { assembly } from '../src/forge/assembly';
import { box, initKernel } from '../src/forge/kernel';
import { group } from '../src/forge/group';
import { bevelGear } from '../src/forge/library';
import { resolveJointAnimation } from '../src/forge/jointAnimation';
import { runScript } from '../src/forge/runner';
import { Transform } from '../src/forge/transform';
import {
  resolveJointViewValues,
  type JointViewAnimationDef,
  type JointViewCouplingDef,
  type JointViewDef,
} from '../src/forge/jointsView';

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

function testShapeRotateAroundTo() {
  const arm = box(80, 8, 8, true)
    .translate(40, 0, 0)
    .withReferences({ points: { tip: [80, 0, 0] } });

  const expectedXY = 80 / Math.sqrt(2);

  const planeAligned = arm.rotateAroundTo([0, 0, 1], [0, 0, 0], 'tip', [30, 30, 24]);
  assertVec(
    planeAligned.referencePoint('tip'),
    [expectedXY, expectedXY, 0],
    'shape.rotateAroundTo plane tip',
  );

  const lineAligned = arm.rotateAroundTo([0, 0, 1], [0, 0, 0], 'tip', [30, 30, 0], { mode: 'line' });
  assertVec(
    lineAligned.referencePoint('tip'),
    [expectedXY, expectedXY, 0],
    'shape.rotateAroundTo line tip',
  );

  assert.throws(
    () => arm.rotateAroundTo([0, 0, 1], [0, 0, 0], 'tip', [30, 30, 10], { mode: 'line' }),
    /cannot reach the target line|axial offset/,
  );
}

function testShapeGroupRotateAroundToSugar() {
  const g = group(
    box(30, 12, 8, true).translate(20, 0, 2),
    box(10, 6, 4, true).translate(40, 0, 6),
  );

  const bySugar = g.rotateAroundTo([0, 0, 1], [0, 0, 0], [40, 0, 6], [30, 30, 20]).boundingBox();
  const byTransform = g.transform(
    Transform.rotateAroundTo([0, 0, 1], [0, 0, 0], [40, 0, 6], [30, 30, 20]),
  ).boundingBox();

  assertVec(bySugar.min, byTransform.min, 'group.rotateAroundTo min');
  assertVec(bySugar.max, byTransform.max, 'group.rotateAroundTo max');
}

function testAssemblyNamedGroupLabels() {
  const script = `
    const housing = group(
      { name: "Body", shape: box(80, 60, 20).color("#6e7b88") },
      { name: "Lid", shape: box(80, 60, 4).translate(0, 0, 20).color("#c9d2db") },
      {
        name: "Hardware",
        group: [
          { name: "Left Screw", shape: cylinder(24, 2).translate(12, 12, 0) },
          { name: "Right Screw", shape: cylinder(24, 2).translate(68, 12, 0) },
        ],
      },
    );

    const mech = assembly("Named Group Labels")
      .addPart("Base Assembly", housing);

    return mech.solve();
  `;

  const result = runScript(script, 'named-group-labels.forge.js', {
    'named-group-labels.forge.js': script,
  });

  assert.equal(result.error, null, `Expected named group script to run, got ${result.error}`);
  assert.deepEqual(
    result.objects.map((obj) => obj.name),
    [
      'Base Assembly.Body',
      'Base Assembly.Lid',
      'Base Assembly.Hardware.Left Screw',
      'Base Assembly.Hardware.Right Screw',
    ],
  );
  assert(
    result.objects.every((obj) => obj.groupName === 'Base Assembly'),
    `Expected flattened objects to retain groupName Base Assembly, got ${JSON.stringify(result.objects.map((obj) => obj.groupName))}`,
  );
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
  // Default is now unclamped: Motor = -2 * 130 = -260
  assert(approx(values.Motor, -260), `Expected Motor=-260 (unclamped), got ${values.Motor}`);

  // Explicit clamp: true still respects min/max
  const clamped = resolveJointViewValues(joints, couplings, {
    Steer: 30, Drive: 70, 'Top Gear': 999, Motor: 999,
  }, { clamp: true });
  assert(approx(clamped.Motor, -200), `Expected Motor=-200 after clamp, got ${clamped.Motor}`);
}

function testContinuousRuntimeJointAnimation() {
  const joints: JointViewDef[] = [
    {
      name: 'Input Drive',
      child: 'Input Drive',
      type: 'revolute',
      axis: [0, 0, 1],
      pivot: [0, 0, 0],
      min: -1440,
      max: 1440,
      defaultValue: 0,
      unit: '°',
    },
  ];

  const clip: JointViewAnimationDef = {
    name: 'Continuous Spin',
    duration: 4.6,
    loop: true,
    continuous: true,
    keyframes: [
      { at: 0, values: { 'Input Drive': 0 } },
      { at: 1, values: { 'Input Drive': 720 } },
    ],
  };

  const firstCycle = resolveJointAnimation(clip, 0.25);
  const secondCycle = resolveJointAnimation(clip, 1.25);
  const thirdCycle = resolveJointAnimation(clip, 2.5);

  assert(approx(firstCycle['Input Drive'], 180), `Expected first-cycle drive=180, got ${firstCycle['Input Drive']}`);
  assert(approx(secondCycle['Input Drive'], 900), `Expected second-cycle drive=900, got ${secondCycle['Input Drive']}`);
  assert(approx(thirdCycle['Input Drive'], 1800), `Expected third-cycle drive=1800, got ${thirdCycle['Input Drive']}`);

  // Default is now unclamped; explicit clamp: true still works
  const defaultResolved = resolveJointViewValues(joints, [], thirdCycle);
  const clamped = resolveJointViewValues(joints, [], thirdCycle, { clamp: true });
  const unclamped = resolveJointViewValues(joints, [], thirdCycle, { clamp: false });

  assert(approx(defaultResolved['Input Drive'], 1800), `Expected default (unclamped) drive=1800, got ${defaultResolved['Input Drive']}`);
  assert(approx(clamped['Input Drive'], 1440), `Expected clamped drive=1440, got ${clamped['Input Drive']}`);
  assert(approx(unclamped['Input Drive'], 1800), `Expected unclamped drive=1800, got ${unclamped['Input Drive']}`);
}

function testBevelGearTopSectionCircularity() {
  const gear = bevelGear({
    module: 2,
    teeth: 24,
    faceWidth: 10,
    pitchAngleDeg: 45,
  });

  const bb = gear.boundingBox();
  const topSlice = gear.slice(bb.max[2] - 1e-4).bounds();
  const spanX = topSlice.max[0] - topSlice.min[0];
  const spanY = topSlice.max[1] - topSlice.min[1];

  assert(spanX > EPS && spanY > EPS, `Expected non-degenerate top slice, got spanX=${spanX}, spanY=${spanY}`);
  const aspect = spanY / spanX;
  assert(
    aspect > 0.85 && aspect < 1.15,
    `Expected near-circular top slice, got spanX=${spanX}, spanY=${spanY}, aspect=${aspect}`,
  );
}

export async function runCheckTransformsCli(): Promise<void> {
  await initKernel();
  testTransformMulOrder();
  testAssemblyChainAgainstAnalytic();
  testShapeGroupRotateAroundSugar();
  testShapeGroupPointAlongSugar();
  testShapeRotateAroundTo();
  testShapeGroupRotateAroundToSugar();
  testAssemblyNamedGroupLabels();
  testAssemblyJointCouplings();
  testAssemblyGearCouplings();
  testRuntimeJointCouplingResolution();
  testContinuousRuntimeJointAnimation();
  testBevelGearTopSectionCircularity();
  console.log('✓ Transform and assembly invariants passed');
}
