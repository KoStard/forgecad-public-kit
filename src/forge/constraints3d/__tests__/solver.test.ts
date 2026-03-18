/**
 * 3D Constraint Solver Tests
 *
 * Tests the solver using the ecosystem-integrated API:
 * - bodyFromRefs() for test geometry
 * - MateBuilder for constraints
 * - solve3D() for solving
 * - constrain3d() for the simple two-body case
 */

import { describe, it, expect } from 'vitest';
import type { Vec3 } from '../../transform';
import type { RigidBody } from '../types';
import { solve3D } from '../solver';
import { bodyFromRefs, MateBuilder, constrain3d } from '../builder';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeBoxBody(id: string, w: number, h: number, d: number, opts?: { grounded?: boolean; position?: Vec3 }): RigidBody {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  return bodyFromRefs(id, {
    faces: {
      top: { normal: [0, 0, 1], center: [0, 0, hd] },
      bottom: { normal: [0, 0, -1], center: [0, 0, -hd] },
      front: { normal: [0, -1, 0], center: [0, -hh, 0] },
      back: { normal: [0, 1, 0], center: [0, hh, 0] },
      left: { normal: [-1, 0, 0], center: [-hw, 0, 0] },
      right: { normal: [1, 0, 0], center: [hw, 0, 0] },
    },
    axes: {
      vertical: { origin: [0, 0, 0], direction: [0, 0, 1] },
    },
    points: {
      center: { position: [0, 0, 0] },
      'top-center': { position: [0, 0, hd] },
      'bottom-center': { position: [0, 0, -hd] },
    },
  }, opts);
}

function makeCylinderBody(id: string, radius: number, height: number, opts?: { grounded?: boolean; position?: Vec3 }): RigidBody {
  const hh = height / 2;
  return bodyFromRefs(id, {
    faces: {
      top: { normal: [0, 0, 1], center: [0, 0, hh] },
      bottom: { normal: [0, 0, -1], center: [0, 0, -hh] },
    },
    axes: {
      center: { origin: [0, 0, 0], direction: [0, 0, 1] },
    },
    points: {
      center: { position: [0, 0, 0] },
      'top-center': { position: [0, 0, hh] },
      'bottom-center': { position: [0, 0, -hh] },
    },
  }, opts);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('3D Constraint Solver', () => {
  describe('no-op cases', () => {
    it('identity rotation at [0,0,0]', () => {
      const body = makeBoxBody('a', 10, 10, 10, { grounded: true });
      const result = solve3D(new Map([['a', body]]), []);
      expect(result.maxError).toBe(0);
      expect(result.converged).toBe(true);
    });
  });

  describe('flush constraint', () => {
    it('places box B on top of grounded box A', () => {
      const result = constrain3d(
        { id: 'plate', body: makeBoxBody('plate', 100, 100, 10, { grounded: true }) },
        { id: 'block', body: makeBoxBody('block', 50, 50, 6, { position: [10, 10, 10] }) },
        m => m.flush('block:bottom', 'plate:top'),
      );

      expect(result.converged).toBe(true);
      expect(result.maxError).toBeLessThan(1e-3);
      expect(result.dof).toBe(3); // 6 - 3 = 3 (can slide + rotate around Z)

      // block bottom face (body-local z=-3) should be at plate top (z=5)
      const t = result.transforms.get('block')!;
      expect(t.position[2] - 3).toBeCloseTo(5, 1);
    });

    it('flush with X-axis faces', () => {
      const result = constrain3d(
        { id: 'wall', body: bodyFromRefs('wall', {
          faces: { right: { normal: [1, 0, 0], center: [5, 0, 0] } },
        }, { grounded: true }) },
        { id: 'shelf', body: bodyFromRefs('shelf', {
          faces: { left: { normal: [-1, 0, 0], center: [-4, 0, 0] } },
        }, { position: [20, 0, 0] }) },
        m => m.flush('shelf:left', 'wall:right'),
      );

      expect(result.converged).toBe(true);
      const t = result.transforms.get('shelf')!;
      expect(t.position[0] - 4).toBeCloseTo(5, 1);
    });
  });

  describe('concentric constraint', () => {
    it('aligns cylinder axis with box vertical axis', () => {
      const result = constrain3d(
        { id: 'base', body: bodyFromRefs('base', {
          axes: { vertical: { origin: [0, 0, 0], direction: [0, 0, 1] } },
        }, { grounded: true }) },
        { id: 'cyl', body: bodyFromRefs('cyl', {
          axes: { center: { origin: [0, 0, 0], direction: [0, 0, 1] } },
        }, { position: [15, 20, 5] }) },
        m => m.concentric('cyl:center', 'base:vertical'),
      );

      expect(result.converged).toBe(true);
      expect(result.dof).toBe(2); // 6 - 4 = 2

      const t = result.transforms.get('cyl')!;
      expect(t.position[0]).toBeCloseTo(0, 1);
      expect(t.position[1]).toBeCloseTo(0, 1);
    });
  });

  describe('combined constraints', () => {
    it('flush + concentric fully constrains a bolt on a plate', () => {
      const plate = bodyFromRefs('plate', {
        faces: { top: { normal: [0, 0, 1], center: [0, 0, 5] } },
        axes: { hole: { origin: [0, 0, 0], direction: [0, 0, 1] } },
      }, { grounded: true });

      const bolt = bodyFromRefs('bolt', {
        faces: { bottom: { normal: [0, 0, -1], center: [0, 0, -10] } },
        axes: { center: { origin: [0, 0, 0], direction: [0, 0, 1] } },
      }, { position: [30, 30, 30] });

      const bodies = new Map([['plate', plate], ['bolt', bolt]]);
      const mb = new MateBuilder();
      mb.flush('bolt:bottom', 'plate:top');
      mb.concentric('bolt:center', 'plate:hole');

      const result = solve3D(bodies, mb.constraints);
      expect(result.converged).toBe(true);

      const t = result.transforms.get('bolt')!;
      expect(t.position[0]).toBeCloseTo(0, 1);
      expect(t.position[1]).toBeCloseTo(0, 1);
      expect(t.position[2] - 10).toBeCloseTo(5, 1);
    });

    it('parallel + pointOnFace gives constrained sliding', () => {
      const result = constrain3d(
        { id: 'rail', body: bodyFromRefs('rail', {
          faces: { top: { normal: [0, 0, 1], center: [0, 0, 0] } },
        }, { grounded: true }) },
        { id: 'slider', body: bodyFromRefs('slider', {
          faces: { bottom: { normal: [0, 0, -1], center: [0, 0, -2] } },
          points: { contact: { position: [0, 0, -2] } },
        }, { position: [5, 5, 10] }) },
        m => {
          m.parallel('slider:bottom', 'rail:top');
          m.pointOnFace('slider:contact', 'rail:top');
        },
      );

      expect(result.converged).toBe(true);
      expect(result.dof).toBe(3); // 6 - 2 - 1 = 3
    });
  });

  describe('faceDistance constraint', () => {
    it('maintains gap between parallel faces', () => {
      const result = constrain3d(
        { id: 'base', body: bodyFromRefs('base', {
          faces: { top: { normal: [0, 0, 1], center: [0, 0, 0] } },
        }, { grounded: true }) },
        { id: 'hover', body: bodyFromRefs('hover', {
          faces: { bottom: { normal: [0, 0, -1], center: [0, 0, -5] } },
        }, { position: [0, 0, 50] }) },
        m => m.faceDistance('hover:bottom', 'base:top', 10),
      );

      expect(result.converged).toBe(true);
      const t = result.transforms.get('hover')!;
      expect(t.position[2] - 5).toBeCloseTo(10, 1);
    });
  });

  describe('angle constraint', () => {
    it('sets dihedral angle between faces', () => {
      const result = constrain3d(
        { id: 'base', body: bodyFromRefs('base', {
          faces: { top: { normal: [0, 0, 1], center: [0, 0, 0] } },
        }, { grounded: true }) },
        { id: 'angled', body: bodyFromRefs('angled', {
          faces: { front: { normal: [0, -1, 0], center: [0, -5, 0] } },
        }) },
        m => m.angle('base:top', 'angled:front', 90),
      );

      expect(result.converged).toBe(true);
      expect(result.dof).toBe(5); // 6 - 1 = 5
    });
  });

  describe('DOF tracking', () => {
    it('reports correct DOF via MateBuilder', () => {
      const mb = new MateBuilder();
      expect(mb.totalEquations).toBe(0);

      mb.flush('a:top', 'b:bottom');
      expect(mb.totalEquations).toBe(3);

      mb.concentric('a:axis', 'b:axis');
      expect(mb.totalEquations).toBe(7);
    });
  });

  describe('multi-body assembly', () => {
    it('three bodies in a stack', () => {
      const base = makeBoxBody('base', 100, 100, 10, { grounded: true });
      const mid = makeBoxBody('mid', 80, 80, 8, { position: [5, 5, 30] });
      const top = makeBoxBody('top', 60, 60, 6, { position: [10, 10, 60] });

      const bodies = new Map([['base', base], ['mid', mid], ['top', top]]);
      const mb = new MateBuilder();
      mb.flush('mid:bottom', 'base:top');
      mb.flush('top:bottom', 'mid:top');

      const result = solve3D(bodies, mb.constraints);
      expect(result.converged).toBe(true);

      // base top at z=5, mid is 8mm tall (center at z=5+4=9), mid top at z=5+8=13
      // top bottom at z=13, top is 6mm tall (center at z=13+3=16)
      const tMid = result.transforms.get('mid')!;
      const tTop = result.transforms.get('top')!;
      expect(tMid.position[2]).toBeCloseTo(9, 1); // base top (5) + mid half-height (4)
      expect(tTop.position[2]).toBeCloseTo(16, 1); // mid top (13) + top half-height (3)
    });
  });
});
