/**
 * Exploded-view transform for assemblies.
 */

import {
  computeExplodeMotion,
  createResolvedExplodeConfig,
  type ExplodeAxis,
  type ExplodeBounds,
  type ExplodeConfigOptions,
  type ExplodeDirection,
  type ExplodeDirective,
  explodeAdd,
  explodeBoundsCenter,
  explodeLeafFanStage,
  explodeMergeBounds,
  explodeMul,
  hasExplodeOverride,
  resolveExplodeDirective,
  resolveExplodeLocalFanDirection,
} from '../assembly/explodeCore';
import { ShapeGroup } from '../group';
import { Shape } from '../kernel';
import { Sketch } from '../sketch/core';
import { TrackedShape } from '../sketch/topology';

export type { ExplodeAxis, ExplodeDirection, ExplodeDirective };

export interface ExplodeNamedItem {
  name: string;
  shape?: Shape | TrackedShape | ShapeGroup;
  sketch?: Sketch;
  color?: string;
  group?: ExplodeItem[];
  explode?: ExplodeDirective;
}

export type ExplodeItem = Shape | Sketch | TrackedShape | ShapeGroup | ExplodeNamedItem;

export interface ExplodeOptions extends ExplodeConfigOptions {}

/**
 * Deterministic exploded-view transform for arrays / named assemblies / ShapeGroup trees.
 * Returns the same structure type as input, with translated shapes/sketches.
 */
export function explode<T extends ExplodeItem[] | ShapeGroup>(items: T, options: ExplodeOptions = {}): T {
  const config = createResolvedExplodeConfig(options);
  const boundsCache = new WeakMap<object, ExplodeBounds | null>();
  const rootBounds = computeExplodeBounds(items, boundsCache);
  const rootCenter = explodeBoundsCenter(rootBounds) ?? [0, 0, 0];

  const centerForNode = (node: unknown, fallback: [number, number, number]): [number, number, number] =>
    explodeBoundsCenter(computeExplodeBounds(node, boundsCache)) ?? fallback;

  const nodeMotion = (
    node: unknown,
    path: string,
    depth: number,
    originCenter: [number, number, number],
    inheritedDirection: [number, number, number] | undefined,
    name?: string,
    local?: ExplodeDirective,
  ) => {
    const center = centerForNode(node, originCenter);
    return computeExplodeMotion({
      pathKeys: [path],
      seed: path,
      depth,
      center,
      originCenter,
      inheritedDirection,
      name,
      local,
      config,
    });
  };

  const leafMotion = (
    node: unknown,
    path: string,
    depth: number,
    originCenter: [number, number, number],
    inheritedDirection: [number, number, number] | undefined,
    name?: string,
    local?: ExplodeDirective,
  ) => {
    const directive = resolveExplodeDirective([path], name, local, config);
    if (depth > 1 && !hasExplodeOverride(directive)) {
      const center = centerForNode(node, originCenter);
      const direction = resolveExplodeLocalFanDirection(center, originCenter, inheritedDirection, path);
      return {
        direction,
        branchDirection: inheritedDirection ?? direction,
        offset: explodeMul(direction, config.amount * explodeLeafFanStage(config, depth)),
      };
    }
    return nodeMotion(node, path, depth, originCenter, inheritedDirection, name, local);
  };

  const explodeLeaf = (leaf: Shape | Sketch | TrackedShape, offset: [number, number, number]): Shape | Sketch | TrackedShape => {
    if (leaf instanceof TrackedShape) return leaf.translate(offset[0], offset[1], offset[2]);
    if (leaf instanceof Shape) return leaf.translate(offset[0], offset[1], offset[2]);
    return leaf.translate(offset[0], offset[1]);
  };

  const childPath = (parentPath: string, index: number, name?: string): string => {
    const label = name && name.trim().length > 0 ? `${index + 1}:${name}` : `${index + 1}`;
    return parentPath ? `${parentPath}/${label}` : label;
  };

  const explodeGroup = (
    grp: ShapeGroup,
    path: string,
    depth: number,
    inherited: [number, number, number],
    parentCenter: [number, number, number],
    parentDirection: [number, number, number] | undefined,
  ): ShapeGroup => {
    const groupCenter = centerForNode(grp, parentCenter);
    const motion = nodeMotion(grp, path, depth, parentCenter, parentDirection);
    const total = explodeAdd(inherited, motion.offset);
    return new ShapeGroup(
      grp.children.map((child, i) => {
        const p = childPath(path, i, grp.childName(i));
        if (child instanceof ShapeGroup) return explodeGroup(child, p, depth + 1, total, groupCenter, motion.branchDirection);
        return explodeLeaf(child, explodeAdd(total, leafMotion(child, p, depth + 1, groupCenter, motion.branchDirection).offset));
      }),
      grp.childNames,
    );
  };

  const explodeItemNode = (
    item: ExplodeItem,
    path: string,
    depth: number,
    inherited: [number, number, number],
    parentCenter: [number, number, number],
    parentDirection: [number, number, number] | undefined,
  ): ExplodeItem => {
    if (item instanceof ShapeGroup) return explodeGroup(item, path, depth, inherited, parentCenter, parentDirection);
    if (item instanceof TrackedShape || item instanceof Shape || item instanceof Sketch) {
      return explodeLeaf(item, explodeAdd(inherited, leafMotion(item, path, depth, parentCenter, parentDirection).offset));
    }
    if (!isExplodeNamedItem(item)) return item;

    const itemCenter = centerForNode(item, parentCenter);
    const motion = nodeMotion(item, path, depth, parentCenter, parentDirection, item.name, item.explode);
    const total = explodeAdd(inherited, motion.offset);
    const out: ExplodeNamedItem = { ...item };

    if (item.shape instanceof ShapeGroup) {
      out.shape = explodeGroup(item.shape, `${path}/shape`, depth + 1, total, itemCenter, motion.branchDirection);
    } else if (item.shape instanceof TrackedShape || item.shape instanceof Shape) {
      out.shape = explodeLeaf(item.shape, total) as Shape | TrackedShape;
    }

    if (item.sketch instanceof Sketch) {
      out.sketch = explodeLeaf(item.sketch, total) as Sketch;
    }

    if (Array.isArray(item.group)) {
      out.group = item.group.map((child, i) => {
        const p = childPath(`${path}/group`, i, isExplodeNamedItem(child) ? child.name : undefined);
        return explodeItemNode(child, p, depth + 1, total, itemCenter, motion.branchDirection);
      });
    }

    return out;
  };

  if (items instanceof ShapeGroup) {
    return new ShapeGroup(
      items.children.map((child, i) => {
        const p = childPath('root', i, items.childName(i));
        if (child instanceof ShapeGroup) return explodeGroup(child, p, 1, [0, 0, 0], rootCenter, undefined);
        return explodeLeaf(child, nodeMotion(child, p, 1, rootCenter, undefined).offset);
      }),
      items.childNames,
    ) as T;
  }

  return items.map((item, i) => {
    const p = childPath('root', i, isExplodeNamedItem(item) ? item.name : undefined);
    return explodeItemNode(item, p, 1, [0, 0, 0], rootCenter, undefined);
  }) as T;
}

function isExplodeNamedItem(value: unknown): value is ExplodeNamedItem {
  return !!value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string';
}

function computeExplodeBounds(node: unknown, cache: WeakMap<object, ExplodeBounds | null>): ExplodeBounds | null {
  if (!node || typeof node !== 'object') return null;
  if (cache.has(node)) return cache.get(node) ?? null;

  let bounds: ExplodeBounds | null = null;

  if (node instanceof TrackedShape) {
    bounds = shapeToBounds(node.toShape());
  } else if (node instanceof Shape) {
    bounds = shapeToBounds(node);
  } else if (node instanceof Sketch) {
    const sb = node.bounds();
    bounds = {
      min: [sb.min[0], sb.min[1], 0],
      max: [sb.max[0], sb.max[1], 0],
    };
  } else if (node instanceof ShapeGroup) {
    node.children.forEach((child) => {
      bounds = explodeMergeBounds(bounds, computeExplodeBounds(child, cache));
    });
  } else if (Array.isArray(node)) {
    node.forEach((child) => {
      bounds = explodeMergeBounds(bounds, computeExplodeBounds(child, cache));
    });
  } else if (isExplodeNamedItem(node)) {
    if (node.shape) bounds = explodeMergeBounds(bounds, computeExplodeBounds(node.shape, cache));
    if (node.sketch) bounds = explodeMergeBounds(bounds, computeExplodeBounds(node.sketch, cache));
    if (Array.isArray(node.group)) {
      node.group.forEach((child) => {
        bounds = explodeMergeBounds(bounds, computeExplodeBounds(child, cache));
      });
    }
  }

  cache.set(node, bounds);
  return bounds;
}

function shapeToBounds(shape: Shape): ExplodeBounds {
  const bb = shape.boundingBox();
  return {
    min: [bb.min[0], bb.min[1], bb.min[2]],
    max: [bb.max[0], bb.max[1], bb.max[2]],
  };
}
