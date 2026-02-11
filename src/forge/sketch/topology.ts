/**
 * 3D Topology Tracking
 *
 * Tracks which 2D sketch edges become which 3D faces/edges during extrusion.
 * Enables semantic references like shape.face('top'), shape.edge('bottom-left').
 *
 * This works for shapes created through extrusion of known geometry.
 * Arbitrary boolean results lose topology (mesh kernel limitation).
 */

import { Shape } from '../kernel';
import { Point2D, Rectangle2D, type RectSide } from './entities';

export type FaceName = string;
export type EdgeName = string;

export interface FaceRef {
  name: FaceName;
  /** Normal direction of the face */
  normal: [number, number, number];
  /** Center point of the face */
  center: [number, number, number];
}

export interface EdgeRef {
  name: EdgeName;
  /** Start point */
  start: [number, number, number];
  /** End point */
  end: [number, number, number];
}

export interface Topology {
  faces: Map<FaceName, FaceRef>;
  edges: Map<EdgeName, EdgeRef>;
}

/**
 * A Shape that knows its topology — which faces and edges it has by name.
 * Created by extruding known geometry (rectangles, polygons with named edges).
 */
export class TrackedShape {
  constructor(
    public readonly shape: Shape,
    public readonly topology: Topology,
    private readonly baseHeight: number,
    private readonly extrudeUp: boolean,
  ) {}

  /** Get a named face */
  face(name: FaceName): FaceRef {
    const f = this.topology.faces.get(name);
    if (!f) {
      const available = [...this.topology.faces.keys()].join(', ');
      throw new Error(`Face "${name}" not found. Available: ${available}`);
    }
    return f;
  }

  /** Get a named edge */
  edge(name: EdgeName): EdgeRef {
    const e = this.topology.edges.get(name);
    if (!e) {
      const available = [...this.topology.edges.keys()].join(', ');
      throw new Error(`Edge "${name}" not found. Available: ${available}`);
    }
    return e;
  }

  /** List all face names */
  faceNames(): FaceName[] {
    return [...this.topology.faces.keys()];
  }

  /** List all edge names */
  edgeNames(): EdgeName[] {
    return [...this.topology.edges.keys()];
  }

  // Delegate Shape methods, preserving topology with offset transforms
  translate(x: number, y: number, z: number): TrackedShape {
    const newTopo = offsetTopology(this.topology, x, y, z);
    return new TrackedShape(this.shape.translate(x, y, z), newTopo, this.baseHeight, this.extrudeUp);
  }

  /** Alias for translate — matches ideal API's moveBy */
  moveBy(x: number, y: number, z: number): TrackedShape {
    return this.translate(x, y, z);
  }

  /** Rotate around a named edge by angle in degrees */
  rotateAroundEdge(edgeName: EdgeName, angleDeg: number): TrackedShape {
    const edge = this.edge(edgeName);
    const [ox, oy, oz] = edge.start;
    const dx = edge.end[0] - ox;
    const dy = edge.end[1] - oy;
    const dz = edge.end[2] - oz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const ax = dx / len, ay = dy / len, az = dz / len;

    // Rodrigues' rotation: build 4x3 affine matrix for rotation around arbitrary axis through origin
    const rad = angleDeg * Math.PI / 180;
    const c = Math.cos(rad), s = Math.sin(rad), t = 1 - c;
    // Rotation matrix R
    const r00 = t * ax * ax + c,      r01 = t * ax * ay - s * az, r02 = t * ax * az + s * ay;
    const r10 = t * ax * ay + s * az,  r11 = t * ay * ay + c,     r12 = t * ay * az - s * ax;
    const r20 = t * ax * az - s * ay,  r21 = t * ay * az + s * ax, r22 = t * az * az + c;

    // Full transform: translate(-origin) → rotate → translate(+origin)
    // Combined into a single 4x3 matrix [R | R*(-o) + o]
    const tx = -r00 * ox - r01 * oy - r02 * oz + ox;
    const ty = -r10 * ox - r11 * oy - r12 * oz + oy;
    const tz = -r20 * ox - r21 * oy - r22 * oz + oz;

    // Manifold transform() takes 4x4 column-major
    const m: [number,number,number,number,number,number,number,number,number,number,number,number,number,number,number,number] = [
      r00, r10, r20, 0,
      r01, r11, r21, 0,
      r02, r12, r22, 0,
      tx,  ty,  tz,  1,
    ];
    const final = this.shape.transform(m);

    // Topology is invalidated after rotation
    return new TrackedShape(final, { faces: new Map(), edges: new Map() }, this.baseHeight, this.extrudeUp);
  }

  /** Rotate using Euler angles (degrees), topology is cleared */
  rotate(x: number, y: number, z: number): TrackedShape {
    return new TrackedShape(
      this.shape.rotate(x, y, z),
      { faces: new Map(), edges: new Map() },
      this.baseHeight,
      this.extrudeUp,
    );
  }

  /** Access the underlying Shape for boolean ops etc */
  toShape(): Shape {
    return this.shape;
  }

  /** Position this tracked shape relative to another using named 3D anchor points */
  attachTo(
    target: Shape | TrackedShape,
    targetAnchor: string,
    selfAnchor: string = 'center',
  ): TrackedShape {
    const targetShape = target instanceof TrackedShape ? target.toShape() : target;
    const moved = this.toShape().attachTo(targetShape, targetAnchor as any, selfAnchor as any);
    const bb1 = this.toShape().boundingBox();
    const bb2 = moved.boundingBox();
    const dx = (bb2.min as number[])[0] - (bb1.min as number[])[0];
    const dy = (bb2.min as number[])[1] - (bb1.min as number[])[1];
    const dz = (bb2.min as number[])[2] - (bb1.min as number[])[2];
    return this.translate(dx, dy, dz);
  }

  /** Boolean subtract — returns plain Shape (topology lost) */
  subtract(other: Shape | TrackedShape): Shape {
    const otherShape = other instanceof TrackedShape ? other.toShape() : other;
    return this.shape.subtract(otherShape);
  }

  /** Boolean add — returns plain Shape (topology lost) */
  add(other: Shape | TrackedShape): Shape {
    const otherShape = other instanceof TrackedShape ? other.toShape() : other;
    return this.shape.add(otherShape);
  }

  get boundingBox() {
    return this.shape.boundingBox();
  }

  get volume(): number {
    return this.shape.volume();
  }
}

function offsetTopology(topo: Topology, dx: number, dy: number, dz: number): Topology {
  const faces = new Map<FaceName, FaceRef>();
  for (const [name, face] of topo.faces) {
    faces.set(name, {
      ...face,
      center: [face.center[0] + dx, face.center[1] + dy, face.center[2] + dz],
    });
  }
  const edges = new Map<EdgeName, EdgeRef>();
  for (const [name, edge] of topo.edges) {
    edges.set(name, {
      ...edge,
      start: [edge.start[0] + dx, edge.start[1] + dy, edge.start[2] + dz],
      end: [edge.end[0] + dx, edge.end[1] + dy, edge.end[2] + dz],
    });
  }
  return { faces, edges };
}

/**
 * Build topology for an extruded rectangle.
 * Faces: top, bottom, front(bottom-side), back(top-side), left, right
 * Edges: bottom-front, bottom-back, bottom-left, bottom-right, top-front, top-back, top-left, top-right,
 *        vertical-front-left, vertical-front-right, vertical-back-left, vertical-back-right
 */
export function buildRectExtrusionTopology(
  rect: Rectangle2D,
  height: number,
  up = true,
): Topology {
  const faces = new Map<FaceName, FaceRef>();
  const edges = new Map<EdgeName, EdgeRef>();

  const [bl, br, tr, tl] = rect.vertices;
  const z0 = 0;
  const z1 = up ? height : -height;
  const zTop = Math.max(z0, z1);
  const zBot = Math.min(z0, z1);
  const cx = rect.center.x;
  const cy = rect.center.y;

  // Faces
  faces.set('top', { name: 'top', normal: [0, 0, 1], center: [cx, cy, zTop] });
  faces.set('bottom', { name: 'bottom', normal: [0, 0, -1], center: [cx, cy, zBot] });

  // Side faces named after the rectangle sides they came from
  const sideNames: [RectSide, Point2D, Point2D][] = [
    ['bottom', bl, br],
    ['right', br, tr],
    ['top', tr, tl],
    ['left', tl, bl],
  ];

  for (const [sideName, p1, p2] of sideNames) {
    const mid = p1.midpointTo(p2);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Outward normal (for CCW winding)
    const nx = dy / len;
    const ny = -dx / len;
    faces.set(`side-${sideName}`, {
      name: `side-${sideName}`,
      normal: [nx, ny, 0],
      center: [mid.x, mid.y, (zTop + zBot) / 2],
    });
  }

  // Bottom edges (at z=zBot)
  edges.set('bottom-bottom', { name: 'bottom-bottom', start: [bl.x, bl.y, zBot], end: [br.x, br.y, zBot] });
  edges.set('bottom-right', { name: 'bottom-right', start: [br.x, br.y, zBot], end: [tr.x, tr.y, zBot] });
  edges.set('bottom-top', { name: 'bottom-top', start: [tr.x, tr.y, zBot], end: [tl.x, tl.y, zBot] });
  edges.set('bottom-left', { name: 'bottom-left', start: [tl.x, tl.y, zBot], end: [bl.x, bl.y, zBot] });

  // Top edges (at z=zTop)
  edges.set('top-bottom', { name: 'top-bottom', start: [bl.x, bl.y, zTop], end: [br.x, br.y, zTop] });
  edges.set('top-right', { name: 'top-right', start: [br.x, br.y, zTop], end: [tr.x, tr.y, zTop] });
  edges.set('top-top', { name: 'top-top', start: [tr.x, tr.y, zTop], end: [tl.x, tl.y, zTop] });
  edges.set('top-left', { name: 'top-left', start: [tl.x, tl.y, zTop], end: [bl.x, bl.y, zTop] });

  // Vertical edges
  edges.set('vert-bl', { name: 'vert-bl', start: [bl.x, bl.y, zBot], end: [bl.x, bl.y, zTop] });
  edges.set('vert-br', { name: 'vert-br', start: [br.x, br.y, zBot], end: [br.x, br.y, zTop] });
  edges.set('vert-tr', { name: 'vert-tr', start: [tr.x, tr.y, zBot], end: [tr.x, tr.y, zTop] });
  edges.set('vert-tl', { name: 'vert-tl', start: [tl.x, tl.y, zBot], end: [tl.x, tl.y, zTop] });

  return { faces, edges };
}

/** Build topology for an extruded circle. Faces: top, bottom, side */
export function buildCircleExtrusionTopology(
  circ: { center: Point2D; radius: number },
  height: number,
): Topology {
  const faces = new Map<FaceName, FaceRef>();
  const edges = new Map<EdgeName, EdgeRef>();
  const cx = circ.center.x, cy = circ.center.y;
  const zBot = 0, zTop = height;

  faces.set('top', { name: 'top', normal: [0, 0, 1], center: [cx, cy, zTop] });
  faces.set('bottom', { name: 'bottom', normal: [0, 0, -1], center: [cx, cy, zBot] });
  faces.set('side', { name: 'side', normal: [1, 0, 0], center: [cx + circ.radius, cy, (zTop + zBot) / 2] });

  // Top and bottom rim edges (represented as a single named reference at 0°)
  edges.set('top-rim', { name: 'top-rim', start: [cx + circ.radius, cy, zTop], end: [cx, cy + circ.radius, zTop] });
  edges.set('bottom-rim', { name: 'bottom-rim', start: [cx + circ.radius, cy, zBot], end: [cx, cy + circ.radius, zBot] });

  return { faces, edges };
}
