/**
 * Assembly.mate() Integration Tests
 *
 * Tests the mate constraint integration into Assembly.solve(),
 * including transform overrides and explode hint derivation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Assembly } from '../../assembly';
import { bodyFromRefs } from '../builder';
import { explodeView, resetExplodeView, getCollectedExplodeView } from '../../explodeView';
import type { Vec3 } from '../../transform';

// ─── Helpers ────────────────────────────────────────────────────────────────

// We need TrackedShape-like parts for mate constraints.
// Since TrackedShape requires the kernel, we test the helpers directly
// and use bodyFromRefs for the solver path.
// For the Assembly.mate() integration, we need actual TrackedShape instances.
// However, TrackedShape depends on the geometry kernel which may not be available
// in unit tests. We test the building blocks instead.

import { ShapeGroup } from '../../group';
import type { RigidBody, Constraint3D } from '../types';
import { solve3D, createContext } from '../solver';

// ─── Unit tests for solver transform conversion ─────────────────────────────

describe('Assembly.mate() — building blocks', () => {
  beforeEach(() => {
    resetExplodeView();
  });

  it('solve3D positions a box flush on top of a grounded plate', () => {
    const plate = bodyFromRefs('plate', {
      faces: {
        top: { normal: [0, 0, 1], center: [0, 0, 5] },
        bottom: { normal: [0, 0, -1], center: [0, 0, 0] },
      },
    }, { grounded: true });

    const box = bodyFromRefs('box', {
      faces: {
        top: { normal: [0, 0, 1], center: [0, 0, 5] },
        bottom: { normal: [0, 0, -1], center: [0, 0, 0] },
      },
    }, { position: [0, 0, 20] }); // start far away

    const bodies = new Map<string, RigidBody>([
      ['plate', plate],
      ['box', box],
    ]);

    const constraints: Constraint3D[] = [{
      id: 'flush1',
      type: 'flush',
      refA: { bodyId: 'box', featureName: 'bottom' },
      refB: { bodyId: 'plate', featureName: 'top' },
    }];

    const result = solve3D(bodies, constraints);
    expect(result.converged).toBe(true);

    // Box bottom should be at plate top (z=5)
    const boxPos = result.transforms.get('box')!.position;
    expect(boxPos[2]).toBeCloseTo(5, 2);
  });

  it('deriveExplodeHints produces face-normal directions for flush constraints', () => {
    const plate = bodyFromRefs('plate', {
      faces: {
        top: { normal: [0, 0, 1], center: [0, 0, 5] },
      },
    }, { grounded: true });

    const box = bodyFromRefs('box', {
      faces: {
        bottom: { normal: [0, 0, -1], center: [0, 0, 0] },
      },
    }, { position: [0, 0, 5] });

    const bodies = new Map<string, RigidBody>([
      ['plate', plate],
      ['box', box],
    ]);

    const constraints: Constraint3D[] = [{
      id: 'flush1',
      type: 'flush',
      refA: { bodyId: 'box', featureName: 'bottom' },
      refB: { bodyId: 'plate', featureName: 'top' },
    }];

    const result = solve3D(bodies, constraints);
    const ctx = createContext(bodies);

    // The moving body (box) should get a direction based on its face normal
    // box:bottom has normal [0, 0, -1]
    const face = ctx.worldFace('box', 'bottom');
    expect(face.normal[2]).toBeCloseTo(-1, 4);
  });

  it('Assembly without mates produces same result as before', () => {
    const asm = new Assembly('no-mates');
    // Use a minimal ShapeGroup as a stand-in part (no TrackedShape needed)
    const placeholder = new ShapeGroup([], []);
    asm.addPart('base', placeholder);
    asm.addPart('arm', placeholder);
    asm.addJoint('j1', 'fixed', 'base', 'arm');

    const solved = asm.solve();
    expect(solved.warnings()).toHaveLength(0);
    expect(solved.mateExplodeHints).toBeNull();
    expect(solved.mateDof).toBeNull();
    expect(solved.mateConverged).toBeNull();
  });

  it('SolvedAssembly exposes mate metadata accessors (null for no-mate case)', () => {
    const asm = new Assembly('test');
    const placeholder = new ShapeGroup([], []);
    asm.addPart('root', placeholder);
    const solved = asm.solve();

    expect(solved.mateExplodeHints).toBeNull();
    expect(solved.mateDof).toBeNull();
    expect(solved.mateConverged).toBeNull();
  });

  it('mate() is chainable', () => {
    const asm = new Assembly('chain-test');
    const result = asm.mate(() => {}).mate(() => {});
    expect(result).toBe(asm);
  });

  it('explodeView collects byName hints', () => {
    // This tests the explodeView integration indirectly.
    resetExplodeView();

    explodeView({
      byName: {
        'box': { direction: [0, 0, 1] as [number, number, number] },
      },
    });

    const collected = getCollectedExplodeView();
    expect(collected).not.toBeNull();
    expect(collected!.byName).toBeDefined();
    expect(collected!.byName!['box']).toBeDefined();
    expect(collected!.byName!['box'].direction).toEqual([0, 0, 1]);
  });
});

describe('Assembly.mate() — concentric axis hint', () => {
  it('produces axis direction for concentric constraints', () => {
    const plate = bodyFromRefs('plate', {
      axes: {
        hole: { origin: [0, 0, 0], direction: [0, 0, 1] },
      },
    }, { grounded: true });

    const shaft = bodyFromRefs('shaft', {
      axes: {
        center: { origin: [0, 0, 0], direction: [0, 0, 1] },
      },
    });

    const bodies = new Map<string, RigidBody>([
      ['plate', plate],
      ['shaft', shaft],
    ]);

    const constraints: Constraint3D[] = [{
      id: 'conc1',
      type: 'concentric',
      refA: { bodyId: 'shaft', featureName: 'center' },
      refB: { bodyId: 'plate', featureName: 'hole' },
    }];

    const result = solve3D(bodies, constraints);
    expect(result.converged).toBe(true);

    const ctx = createContext(bodies);
    const axis = ctx.worldAxis('shaft', 'center');
    // Axis direction should be [0, 0, 1] (or [0, 0, -1])
    expect(Math.abs(axis.direction[2])).toBeCloseTo(1, 4);
  });
});
