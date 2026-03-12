export type SketchFace3D = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export interface ShapeQueryOwner {
  id: string;
  operation: string;
}

export type FaceQueryRef =
  | { kind: 'canonical-face'; face: SketchFace3D; owner?: ShapeQueryOwner }
  | { kind: 'tracked-face'; faceName: string; owner?: ShapeQueryOwner }
  | { kind: 'face-ref'; faceName?: string; owner?: ShapeQueryOwner };

export type EdgeQuerySelector = 'edge' | 'start' | 'end' | 'midpoint';

export type EdgeQueryRef =
  | { kind: 'tracked-edge'; edgeName: string; selector: EdgeQuerySelector; owner?: ShapeQueryOwner }
  | { kind: 'edge-ref'; edgeName?: string; selector: EdgeQuerySelector; owner?: ShapeQueryOwner };

export function cloneShapeQueryOwner(owner: ShapeQueryOwner | undefined): ShapeQueryOwner | undefined {
  if (!owner) return undefined;
  return {
    id: owner.id,
    operation: owner.operation,
  };
}

export function shapeQueryOwnersEqual(
  a: ShapeQueryOwner | undefined,
  b: ShapeQueryOwner | undefined,
): boolean {
  if (a == null || b == null) return a == null && b == null;
  return a.id === b.id && a.operation === b.operation;
}

export function cloneFaceQueryRef(ref: FaceQueryRef | undefined): FaceQueryRef | undefined {
  if (!ref) return undefined;
  switch (ref.kind) {
    case 'canonical-face':
      return { kind: 'canonical-face', face: ref.face, owner: cloneShapeQueryOwner(ref.owner) };
    case 'tracked-face':
      return { kind: 'tracked-face', faceName: ref.faceName, owner: cloneShapeQueryOwner(ref.owner) };
    case 'face-ref':
      return { kind: 'face-ref', faceName: ref.faceName, owner: cloneShapeQueryOwner(ref.owner) };
  }
}

export function cloneEdgeQueryRef(ref: EdgeQueryRef | undefined): EdgeQueryRef | undefined {
  if (!ref) return undefined;
  switch (ref.kind) {
    case 'tracked-edge':
      return {
        kind: 'tracked-edge',
        edgeName: ref.edgeName,
        selector: ref.selector,
        owner: cloneShapeQueryOwner(ref.owner),
      };
    case 'edge-ref':
      return {
        kind: 'edge-ref',
        edgeName: ref.edgeName,
        selector: ref.selector,
        owner: cloneShapeQueryOwner(ref.owner),
      };
  }
}

export function faceQueryRefsEqual(
  a: FaceQueryRef | undefined,
  b: FaceQueryRef | undefined,
): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'canonical-face':
      return b.kind === 'canonical-face'
        && a.face === b.face
        && shapeQueryOwnersEqual(a.owner, b.owner);
    case 'tracked-face':
      return b.kind === 'tracked-face'
        && a.faceName === b.faceName
        && shapeQueryOwnersEqual(a.owner, b.owner);
    case 'face-ref':
      return b.kind === 'face-ref'
        && a.faceName === b.faceName
        && shapeQueryOwnersEqual(a.owner, b.owner);
  }
}

export function edgeQueryRefsEqual(
  a: EdgeQueryRef | undefined,
  b: EdgeQueryRef | undefined,
): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'tracked-edge':
      return b.kind === 'tracked-edge'
        && a.edgeName === b.edgeName
        && a.selector === b.selector
        && shapeQueryOwnersEqual(a.owner, b.owner);
    case 'edge-ref':
      return b.kind === 'edge-ref'
        && a.edgeName === b.edgeName
        && a.selector === b.selector
        && shapeQueryOwnersEqual(a.owner, b.owner);
  }
}

export function describeFaceQueryRef(ref: FaceQueryRef | undefined | null): string {
  if (!ref) return 'none';
  const owner = ref.owner ? ` @${ref.owner.operation}:${ref.owner.id}` : '';
  switch (ref.kind) {
    case 'canonical-face':
      return `canonical-face(${ref.face})${owner}`;
    case 'tracked-face':
      return `tracked-face(${ref.faceName})${owner}`;
    case 'face-ref':
      return `face-ref(${ref.faceName ?? 'unnamed'})${owner}`;
  }
}

export function describeEdgeQueryRef(ref: EdgeQueryRef | undefined | null): string {
  if (!ref) return 'none';
  const owner = ref.owner ? ` @${ref.owner.operation}:${ref.owner.id}` : '';
  const selector = `#${ref.selector}`;
  switch (ref.kind) {
    case 'tracked-edge':
      return `tracked-edge(${ref.edgeName}${selector})${owner}`;
    case 'edge-ref':
      return `edge-ref(${ref.edgeName ?? 'unnamed'}${selector})${owner}`;
  }
}
