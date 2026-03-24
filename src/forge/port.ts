import type { Mat4, Vec3 } from './transform';
import { Transform } from './transform';
import type { JointType } from './assembly/assembly';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortDef {
  origin: Vec3;
  axis: Vec3;
  up: Vec3;
  kind?: JointType;
  min?: number;
  max?: number;
}

export interface PortInput {
  origin: [number, number, number];
  axis: [number, number, number];
  up?: [number, number, number];
  kind?: JointType;
  min?: number;
  max?: number;
}

export type PortMap = Record<string, PortDef>;

// ---------------------------------------------------------------------------
// Vec3 helpers (local, minimal)
// ---------------------------------------------------------------------------

function requireFiniteVec3(v: [number, number, number], label: string): Vec3 {
  const [x, y, z] = v;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new Error(`${label} must contain finite numbers, got [${x}, ${y}, ${z}]`);
  }
  return [x, y, z];
}

function len3(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function normalize3(v: Vec3): Vec3 {
  const l = len3(v);
  if (l < 1e-10) throw new Error('Cannot normalize zero-length vector');
  return [v[0] / l, v[1] / l, v[2] / l];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function negate3(v: Vec3): Vec3 {
  return [-v[0], -v[1], -v[2]];
}

function scale3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

/**
 * Compute a stable perpendicular vector to `axis`.
 * Picks whichever of X or Z has a smaller dot with `axis`, then crosses.
 */
function perpendicularTo(axis: Vec3): Vec3 {
  const absX = Math.abs(axis[0]);
  const absZ = Math.abs(axis[2]);
  const seed: Vec3 = absX < absZ ? [1, 0, 0] : [0, 0, 1];
  return normalize3(cross3(axis, seed));
}

// ---------------------------------------------------------------------------
// Normalization / validation
// ---------------------------------------------------------------------------

export function normalizePortInput(input: PortInput): PortDef {
  const origin = requireFiniteVec3(input.origin, 'port origin');
  const rawAxis = requireFiniteVec3(input.axis, 'port axis');

  if (len3(rawAxis) < 1e-10) {
    throw new Error('Port axis must be non-zero');
  }
  const axis = normalize3(rawAxis);

  let up: Vec3;
  if (input.up != null) {
    const rawUp = requireFiniteVec3(input.up, 'port up');
    if (len3(rawUp) < 1e-10) {
      throw new Error('Port up vector must be non-zero');
    }
    // Gram-Schmidt: orthogonalize up against axis
    const proj = dot3(rawUp, axis);
    const ortho: Vec3 = [rawUp[0] - proj * axis[0], rawUp[1] - proj * axis[1], rawUp[2] - proj * axis[2]];
    if (len3(ortho) < 1e-10) {
      throw new Error('Port up vector must not be parallel to axis');
    }
    up = normalize3(ortho);
  } else {
    up = perpendicularTo(axis);
  }

  const def: PortDef = { origin, axis, up };
  if (input.kind != null) def.kind = input.kind;
  if (input.min != null) {
    if (!Number.isFinite(input.min)) throw new Error('Port min must be finite');
    def.min = input.min;
  }
  if (input.max != null) {
    if (!Number.isFinite(input.max)) throw new Error('Port max must be finite');
    def.max = input.max;
  }
  return def;
}

// ---------------------------------------------------------------------------
// Port factory
// ---------------------------------------------------------------------------

function portFactory(input: PortInput): PortDef {
  return normalizePortInput(input);
}

portFactory.revolute = (input: PortInput): PortDef => {
  return normalizePortInput({ ...input, kind: 'revolute' });
};

portFactory.prismatic = (input: PortInput): PortDef => {
  return normalizePortInput({ ...input, kind: 'prismatic' });
};

portFactory.fixed = (input: PortInput): PortDef => {
  return normalizePortInput({ ...input, kind: 'fixed' });
};

export { portFactory as port };

// ---------------------------------------------------------------------------
// PortMap helpers
// ---------------------------------------------------------------------------

export function clonePortDef(p: PortDef): PortDef {
  const out: PortDef = {
    origin: [...p.origin] as Vec3,
    axis: [...p.axis] as Vec3,
    up: [...p.up] as Vec3,
  };
  if (p.kind != null) out.kind = p.kind;
  if (p.min != null) out.min = p.min;
  if (p.max != null) out.max = p.max;
  return out;
}

export function clonePortMap(ports: PortMap): PortMap {
  const out: PortMap = {};
  for (const [name, def] of Object.entries(ports)) {
    out[name] = clonePortDef(def);
  }
  return out;
}

export function hasAnyPorts(ports: PortMap): boolean {
  return Object.keys(ports).length > 0;
}

export function normalizePortMapInput(input: Record<string, PortInput>): PortMap {
  const out: PortMap = {};
  for (const [name, portInput] of Object.entries(input)) {
    out[name] = normalizePortInput(portInput);
  }
  return out;
}

export function mergePortMaps(...maps: PortMap[]): PortMap {
  const out: PortMap = {};
  for (const m of maps) {
    for (const [name, def] of Object.entries(m)) {
      out[name] = clonePortDef(def);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transform ports
// ---------------------------------------------------------------------------

export function transformPort(port: PortDef, matrix: Mat4): PortDef {
  const tx = Transform.from(matrix);
  const newOrigin = tx.point(port.origin);
  const rawAxis = tx.vector(port.axis);
  const rawUp = tx.vector(port.up);
  const axisLen = len3(rawAxis);
  const upLen = len3(rawUp);

  const out: PortDef = {
    origin: newOrigin,
    axis: axisLen > 1e-10 ? normalize3(rawAxis) : port.axis,
    up: upLen > 1e-10 ? normalize3(rawUp) : port.up,
  };
  if (port.kind != null) out.kind = port.kind;
  if (port.min != null) out.min = port.min;
  if (port.max != null) out.max = port.max;
  return out;
}

export function transformPortMap(ports: PortMap, matrix: Mat4): PortMap {
  const out: PortMap = {};
  for (const [name, def] of Object.entries(ports)) {
    out[name] = transformPort(def, matrix);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Frame computation for connect()
// ---------------------------------------------------------------------------

/**
 * Compute the joint `frame` Transform and `axis` Vec3 that `addJoint()` needs,
 * given a parent port and child port.
 *
 * Kinematic chain at rest (motion = identity):
 *   childWorld = parentWorld * frame * childBase
 *
 * We need:
 *   frame.point(childBase.point(C.origin)) = P.origin
 *   frame.vector(childBase.vector(C.axis)) = P.axis  (or -P.axis if flip)
 *   frame.vector(childBase.vector(C.up))   = P.up
 *
 * The joint rotation axis in motionTransform operates in intermediate space
 * (post-childBase, pre-frame), so axis = normalize(childBase.vector(C.axis)).
 */
export function computeConnectFrame(
  childBase: Transform,
  childPort: PortDef,
  parentPort: PortDef,
  flip: boolean,
): { frame: Transform; axis: Vec3 } {
  // Child port vectors in intermediate space (after childBase)
  const cI = childBase.point(childPort.origin);
  const cAxis = normalize3(childBase.vector(childPort.axis));
  const cUp = normalize3(childBase.vector(childPort.up));
  const cRight = normalize3(cross3(cAxis, cUp));

  // Parent port vectors in parent-local space
  const pOrigin = parentPort.origin;
  const pAxis: Vec3 = flip ? negate3(parentPort.axis) : [...parentPort.axis] as Vec3;
  const pUp: Vec3 = [...parentPort.up] as Vec3;
  const pRight = normalize3(cross3(pAxis, pUp));

  // Rotation matrix R: maps [cRight, cUp, cAxis] -> [pRight, pUp, pAxis]
  // R = P * C^T  where C and P are 3x3 matrices with basis vectors as columns.
  // R[i][j] = pRight[i]*cRight[j] + pUp[i]*cUp[j] + pAxis[i]*cAxis[j]
  const r00 = pRight[0] * cRight[0] + pUp[0] * cUp[0] + pAxis[0] * cAxis[0];
  const r01 = pRight[0] * cRight[1] + pUp[0] * cUp[1] + pAxis[0] * cAxis[1];
  const r02 = pRight[0] * cRight[2] + pUp[0] * cUp[2] + pAxis[0] * cAxis[2];
  const r10 = pRight[1] * cRight[0] + pUp[1] * cUp[0] + pAxis[1] * cAxis[0];
  const r11 = pRight[1] * cRight[1] + pUp[1] * cUp[1] + pAxis[1] * cAxis[1];
  const r12 = pRight[1] * cRight[2] + pUp[1] * cUp[2] + pAxis[1] * cAxis[2];
  const r20 = pRight[2] * cRight[0] + pUp[2] * cUp[0] + pAxis[2] * cAxis[0];
  const r21 = pRight[2] * cRight[1] + pUp[2] * cUp[1] + pAxis[2] * cAxis[1];
  const r22 = pRight[2] * cRight[2] + pUp[2] * cUp[2] + pAxis[2] * cAxis[2];

  // Translation: t = pOrigin - R * cI
  const rcI: Vec3 = [
    r00 * cI[0] + r01 * cI[1] + r02 * cI[2],
    r10 * cI[0] + r11 * cI[1] + r12 * cI[2],
    r20 * cI[0] + r21 * cI[1] + r22 * cI[2],
  ];
  const t = sub3(pOrigin, rcI);

  // Build column-major Mat4.
  // Mat4 layout: m[col*4 + row], where point() reads as:
  //   m[0]*x + m[4]*y + m[8]*z  + m[12]*w  (row 0)
  //   m[1]*x + m[5]*y + m[9]*z  + m[13]*w  (row 1)
  //   m[2]*x + m[6]*y + m[10]*z + m[14]*w  (row 2)
  // So m[0]=R[0][0], m[4]=R[0][1], m[8]=R[0][2], m[12]=tx
  //    m[1]=R[1][0], m[5]=R[1][1], m[9]=R[1][2], m[13]=ty
  //    m[2]=R[2][0], m[6]=R[2][1], m[10]=R[2][2],m[14]=tz
  const frame = Transform.from([
    r00, r10, r20, 0,
    r01, r11, r21, 0,
    r02, r12, r22, 0,
    t[0], t[1], t[2], 1,
  ] as any);

  // Joint axis in intermediate space — the child port axis direction
  const axis = cAxis;

  return { frame, axis };
}
