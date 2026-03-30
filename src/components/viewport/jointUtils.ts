import type { JointViewDef } from '@forge/index';
import * as THREE from 'three';
import { WORLD_UP } from './types';

export const resolveVisualArcAngleDeg = (valueDeg: number, visualLimitDeg: number): number => {
  if (!Number.isFinite(valueDeg)) return 0;
  const limit = THREE.MathUtils.clamp(visualLimitDeg, 0, 360);
  if (limit <= 1e-8) return 0;

  // Preserve exact one-turn visuals; wrap only when value goes beyond +/-360.
  if (Math.abs(valueDeg) <= 360) {
    return THREE.MathUtils.clamp(valueDeg, -limit, limit);
  }

  const wrapped = valueDeg % 360;
  return THREE.MathUtils.clamp(wrapped, -limit, limit);
};

export const resolveArcReferenceDirection = (axisWorld: THREE.Vector3): THREE.Vector3 => {
  const candidates = [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)];
  for (const candidate of candidates) {
    const projected = candidate.clone().addScaledVector(axisWorld, -candidate.dot(axisWorld));
    if (projected.lengthSq() > 1e-8) return projected.normalize();
  }

  const fallback = new THREE.Vector3(1, 0, 0).cross(axisWorld);
  if (fallback.lengthSq() <= 1e-8) fallback.set(0, 1, 0).cross(axisWorld);
  if (fallback.lengthSq() <= 1e-8) fallback.set(0, 0, 1);
  return fallback.normalize();
};

export interface SegmentMeshTransform {
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
}

export const resolveSegmentMeshTransform = (start: THREE.Vector3, end: THREE.Vector3): SegmentMeshTransform | null => {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length <= 1e-6) return null;
  direction.multiplyScalar(1 / length);
  return {
    midpoint: start.clone().add(end).multiplyScalar(0.5),
    quaternion: new THREE.Quaternion().setFromUnitVectors(WORLD_UP, direction),
    length,
  };
};

export const buildRevoluteMatrix = (axisWorld: THREE.Vector3, pivotWorld: THREE.Vector3, angleDeg: number): THREE.Matrix4 => {
  const rotation = new THREE.Matrix4().makeRotationAxis(axisWorld, THREE.MathUtils.degToRad(angleDeg));
  const toPivot = new THREE.Matrix4().makeTranslation(pivotWorld.x, pivotWorld.y, pivotWorld.z);
  const fromPivot = new THREE.Matrix4().makeTranslation(-pivotWorld.x, -pivotWorld.y, -pivotWorld.z);
  return toPivot.multiply(rotation).multiply(fromPivot);
};

export const resolveJointRange = (type: 'revolute' | 'prismatic', min?: number, max?: number): { min: number; max: number } => ({
  min: min ?? (type === 'prismatic' ? -100 : 0),
  max: max ?? (type === 'prismatic' ? 100 : 360),
});

export const computeJointNodeMatrices = (joints: JointViewDef[], jointValues: Record<string, number>): Map<string, THREE.Matrix4> => {
  const byChild = new Map<string, JointViewDef>();
  joints.forEach((joint) => {
    byChild.set(joint.child, joint);
  });

  const cache = new Map<string, THREE.Matrix4>();
  const resolving = new Set<string>();

  const solveNodeMatrix = (nodeName: string): THREE.Matrix4 => {
    const cached = cache.get(nodeName);
    if (cached) return cached.clone();
    if (resolving.has(nodeName)) return new THREE.Matrix4();
    resolving.add(nodeName);

    const joint = byChild.get(nodeName);
    if (!joint) {
      const identity = new THREE.Matrix4();
      cache.set(nodeName, identity);
      resolving.delete(nodeName);
      return identity.clone();
    }

    let parentMatrix = new THREE.Matrix4();
    if (joint.parent) {
      parentMatrix = solveNodeMatrix(joint.parent);
    }

    const axis = new THREE.Vector3(joint.axis[0], joint.axis[1], joint.axis[2]).normalize();
    const axisWorld = axis.clone().transformDirection(parentMatrix);
    if (axisWorld.lengthSq() <= 1e-8) axisWorld.copy(axis);
    axisWorld.normalize();

    const raw = jointValues[joint.name] ?? joint.defaultValue;
    const value = Number.isFinite(raw) ? raw : joint.defaultValue;
    let motion = new THREE.Matrix4();
    if (joint.type === 'prismatic') {
      motion.makeTranslation(axisWorld.x * value, axisWorld.y * value, axisWorld.z * value);
    } else {
      const pivotWorld = new THREE.Vector3(joint.pivot[0], joint.pivot[1], joint.pivot[2]).applyMatrix4(parentMatrix);
      motion = buildRevoluteMatrix(axisWorld, pivotWorld, value);
    }

    const solved = motion.multiply(parentMatrix);
    cache.set(nodeName, solved.clone());
    resolving.delete(nodeName);
    return solved;
  };

  joints.forEach((joint) => {
    solveNodeMatrix(joint.child);
  });

  return cache;
};
