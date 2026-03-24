import {
  computeExplodeMotion,
  createResolvedExplodeConfig,
  type ExplodeBounds,
  explodeAdd,
  explodeBoundsCenter,
  explodeLeafFanStage,
  explodeMergeBounds,
  explodeMul,
  hasExplodeOverride,
  resolveExplodeDirective,
  resolveExplodeLocalFanDirection,
} from '@forge/explodeCore';
import type { ExplodeViewOptions, SceneObject } from '@forge/index';
import { getSketchWorldMatrix } from '@forge/sketch/placement3d';
import * as THREE from 'three';

export interface ExplodeTreeNode {
  key: string;
  label: string;
  path: string[];
  objectIds: string[];
  children: ExplodeTreeNode[];
  bounds: ExplodeBounds | null;
}

export interface MutableExplodeTreeNode {
  key: string;
  label: string;
  path: string[];
  objectIds: string[];
  bounds: ExplodeBounds | null;
  children: MutableExplodeTreeNode[];
  childrenByLabel: Map<string, MutableExplodeTreeNode>;
}

export const cleanExplodeTreeSegments = (segments: string[] | undefined): string[] =>
  (segments ?? []).map((segment) => segment.trim()).filter((segment) => segment.length > 0);

export const getExplodeTreePath = (object: SceneObject): string[] => {
  const explicitTreePath = cleanExplodeTreeSegments(object.treePath);
  if (explicitTreePath.length > 0) return explicitTreePath;

  const name = object.name.trim() || object.id;
  const groupName = object.groupName?.trim();
  if (!groupName) return [name];

  const groupPath = groupName
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const prefixedLeaf = `${groupName}.`;
  if (name.startsWith(prefixedLeaf)) {
    const leafName = name.slice(prefixedLeaf.length).trim();
    return [...groupPath, leafName || name];
  }
  return [...groupPath, name];
};

export const resolveSceneObjectBounds = (object: SceneObject): ExplodeBounds | null => {
  if (object.shape) {
    try {
      const bb = object.shape.boundingBox();
      return {
        min: [bb.min[0], bb.min[1], bb.min[2]],
        max: [bb.max[0], bb.max[1], bb.max[2]],
      };
    } catch {
      return null;
    }
  }

  if (object.sketch) {
    try {
      const bb = object.sketch.bounds();
      const matrix = new THREE.Matrix4().fromArray(getSketchWorldMatrix(object.sketch));
      const corners = [
        new THREE.Vector3(bb.min[0], bb.min[1], 0),
        new THREE.Vector3(bb.min[0], bb.max[1], 0),
        new THREE.Vector3(bb.max[0], bb.min[1], 0),
        new THREE.Vector3(bb.max[0], bb.max[1], 0),
      ].map((corner) => corner.applyMatrix4(matrix));
      const min = [...corners[0].toArray()] as [number, number, number];
      const max = [...corners[0].toArray()] as [number, number, number];
      corners.slice(1).forEach((corner) => {
        min[0] = Math.min(min[0], corner.x);
        min[1] = Math.min(min[1], corner.y);
        min[2] = Math.min(min[2], corner.z);
        max[0] = Math.max(max[0], corner.x);
        max[1] = Math.max(max[1], corner.y);
        max[2] = Math.max(max[2], corner.z);
      });
      return { min, max };
    } catch {
      return null;
    }
  }

  return null;
};

export const createMutableExplodeTreeNode = (path: string[]): MutableExplodeTreeNode => ({
  key: path.join('/') || 'root',
  label: path[path.length - 1] ?? 'root',
  path,
  objectIds: [],
  bounds: null,
  children: [],
  childrenByLabel: new Map(),
});

export const finalizeExplodeTree = (node: MutableExplodeTreeNode): ExplodeTreeNode => {
  const children = node.children.map((child) => finalizeExplodeTree(child));
  let bounds = node.bounds;
  children.forEach((child) => {
    bounds = explodeMergeBounds(bounds, child.bounds);
  });
  return {
    key: node.key,
    label: node.label,
    path: node.path,
    objectIds: [...node.objectIds],
    children,
    bounds,
  };
};

export const buildExplodeTree = (objects: SceneObject[]): ExplodeTreeNode => {
  const root = createMutableExplodeTreeNode([]);

  objects.forEach((object) => {
    const path = getExplodeTreePath(object);
    let node = root;
    path.forEach((segment, index) => {
      let child = node.childrenByLabel.get(segment);
      if (!child) {
        child = createMutableExplodeTreeNode([...node.path, segment]);
        node.childrenByLabel.set(segment, child);
        node.children.push(child);
      }
      node = child;
      if (index === path.length - 1) {
        node.objectIds.push(object.id);
        node.bounds = explodeMergeBounds(node.bounds, resolveSceneObjectBounds(object));
      }
    });
  });

  return finalizeExplodeTree(root);
};

export const computeExplodeTreeOffsets = (
  root: ExplodeTreeNode,
  explodeAmount: number,
  explodeConfig: ExplodeViewOptions | null,
): Record<string, [number, number, number]> => {
  if (explodeAmount <= 1e-8) return {};
  const config = createResolvedExplodeConfig({
    amount: explodeAmount * (explodeConfig?.amountScale ?? 1),
    stages: explodeConfig?.stages,
    mode: explodeConfig?.mode,
    axisLock: explodeConfig?.axisLock,
    byName: explodeConfig?.byName,
    byPath: explodeConfig?.byPath,
  });
  if (Math.abs(config.amount) <= 1e-8) return {};

  const rootCenter = explodeBoundsCenter(root.bounds) ?? [0, 0, 0];
  const offsets: Record<string, [number, number, number]> = {};

  const walk = (
    node: ExplodeTreeNode,
    depth: number,
    inherited: [number, number, number],
    parentCenter: [number, number, number],
    parentDirection: [number, number, number] | undefined,
  ) => {
    const center = explodeBoundsCenter(node.bounds) ?? parentCenter;
    const directive = resolveExplodeDirective([node.path.join('/')], node.label, undefined, config);
    const motion =
      depth > 1 && node.children.length === 0 && !hasExplodeOverride(directive)
        ? (() => {
            const direction = resolveExplodeLocalFanDirection(center, parentCenter, parentDirection, node.key);
            return {
              direction,
              branchDirection: parentDirection ?? direction,
              offset: explodeMul(direction, config.amount * explodeLeafFanStage(config, depth)),
            };
          })()
        : computeExplodeMotion({
            pathKeys: [node.path.join('/')],
            seed: node.key,
            depth,
            center,
            originCenter: parentCenter,
            inheritedDirection: parentDirection,
            name: node.label,
            config,
          });
    const total = explodeAdd(inherited, motion.offset);
    node.objectIds.forEach((objectId) => {
      offsets[objectId] = total;
    });
    node.children.forEach((child) => walk(child, depth + 1, total, center, motion.branchDirection));
  };

  root.children.forEach((child) => walk(child, 1, [0, 0, 0], rootCenter, undefined));
  return offsets;
};
