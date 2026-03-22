/**
 * ForgeCAD Verification API
 *
 * Non-fatal geometry assertions defined inside .forge.js scripts.
 * Failed checks become warnings in the UI — the model still renders.
 *
 * Usage:
 *   verify.notColliding("gear clearance", gearA, gearB);
 *   verify.parallel("mounting faces", plateTop.face("top"), bracketTop.face("top"));
 *   verify.centersCoincide("shaft alignment", shaftA, shaftB, 0.01);
 *   verify.volumeApprox("bracket volume", bracket, 5430, 50);
 *   verify.that("custom rule", () => someValue > 0, "someValue must be positive");
 */

export type VerificationStatus = 'pass' | 'fail';

export interface VerificationResult {
  id: string;
  label: string;
  status: VerificationStatus;
  message: string;
  /** 1-based source line number, if captured from the call stack */
  line?: number;
  /** Human-readable expected value for display */
  expected?: string;
  /** Human-readable actual value for display */
  actual?: string;
}

// ---------------------------------------------------------------------------
// Module-level collector (same pattern as bom.ts / cutPlane.ts)
// ---------------------------------------------------------------------------

let _collected: VerificationResult[] = [];
let _counter = 0;

export function resetVerifications(): void {
  _collected = [];
  _counter = 0;
}

export function getCollectedVerifications(): VerificationResult[] {
  return _collected.slice();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function nextId(): string {
  _counter += 1;
  return `verify-${_counter}`;
}

/**
 * Extract the 1-based source line from an Error stack trace.
 * Works with the TypeScript source-map offset baked into the runner's
 * `//# sourceURL=<fileName>` annotation.
 *
 * The runner wraps script code in a `new Function(...)` with a 3-line preamble
 * (the function signature), so generated line N in the eval'd function
 * corresponds to source line N-3.  We add +1 because the runner's own
 * `compileScript` also prepends a declaration line when transpiling TS.
 * Empirically the right correction is -2.
 *
 * Because this is heuristic, we wrap in try/catch and fall back to undefined.
 */
function captureSourceLine(): number | undefined {
  try {
    const stack = new Error().stack;
    if (!stack) return undefined;

    // Lines look like:
    //   at Object.<anonymous> (myFile.forge.js:14:5)
    //   at eval (myFile.forge.js:14:5)
    //   at <anonymous>:14:5
    const lines = stack.split('\n');

    // Walk the stack from the top; the first frame that references a
    // `.forge.js` or `.sketch.js` user file is the caller.
    for (const line of lines) {
      const match = line.match(/\(([^)]+\.(?:forge|sketch)\.js):(\d+):\d+\)/u)
        ?? line.match(/at ([^:]+\.(?:forge|sketch)\.js):(\d+):\d+/u)
        ?? line.match(/<anonymous>:(\d+):\d+/u);

      if (!match) continue;

      const rawLine = parseInt(match[match.length === 3 ? 2 : 1], 10);
      if (!Number.isFinite(rawLine) || rawLine < 1) continue;

      // The Function() wrapper in runner.ts adds a small preamble before
      // the user's transpiled code.  We subtract 2 to compensate.
      return Math.max(1, rawLine - 2);
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function push(result: VerificationResult): void {
  _collected.push(result);
}

function roundNum(n: number, digits = 4): string {
  return Number.isFinite(n) ? n.toFixed(digits).replace(/\.?0+$/, '') : String(n);
}

// ---------------------------------------------------------------------------
// Shape/face helper types (duck-typed so we don't import the geometry kernel
// here — this module is shared with the worker context)
// ---------------------------------------------------------------------------

interface ShapeLike {
  boundingBox(): { min: number[]; max: number[] };
  isEmpty(): boolean;
  volume(): number;
  surfaceArea(): number;
}

/**
 * Compute minGap between two ShapeLike objects via their Manifold backends.
 * minGap is a Manifold-specific operation not in the backend-agnostic Shape API.
 */
function computeMinGap(a: ShapeLike, b: ShapeLike, searchLength: number): number {
  const { getShapeRuntimeBackend } = require('./kernel') as typeof import('./kernel');
  const { isManifoldCapableBackend, requireManifoldShapeBackend } = require('./backends/manifold/shapeBackend') as typeof import('./backends/manifold/shapeBackend');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const backendA = getShapeRuntimeBackend(a as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const backendB = getShapeRuntimeBackend(b as any);
  if (!isManifoldCapableBackend(backendA)) {
    throw new Error('notColliding/minClearance require Manifold-backed shapes');
  }
  const manifoldA = backendA.requireManifold('verification.minGap');
  const manifoldB = requireManifoldShapeBackend(backendB, 'verification.minGap');
  return manifoldA.minGap(manifoldB, searchLength);
}

interface FaceRefLike {
  normal: [number, number, number];
  center: [number, number, number];
}

function vec3Dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vec3Len(v: [number, number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function bboxCenter(bbox: { min: number[]; max: number[] }): [number, number, number] {
  return [
    (bbox.min[0] + bbox.max[0]) / 2,
    (bbox.min[1] + bbox.max[1]) / 2,
    (bbox.min[2] + bbox.max[2]) / 2,
  ];
}

function dist3(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function formatVec3(v: [number, number, number]): string {
  return `(${roundNum(v[0], 3)}, ${roundNum(v[1], 3)}, ${roundNum(v[2], 3)})`;
}

// ---------------------------------------------------------------------------
// Public verify object
// ---------------------------------------------------------------------------

export const verify = {
  /**
   * Custom predicate check.
   *
   * @param label  Short name shown in the panel ("gear clearance")
   * @param check  Function that returns true (pass) or false (fail)
   * @param message  Optional extra context shown on failure
   */
  that(label: string, check: () => boolean, message?: string): void {
    const line = captureSourceLine();
    let passed: boolean;
    try {
      passed = check();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      push({ id: nextId(), label, status: 'fail', message: `Check threw: ${errMsg}`, line });
      return;
    }
    if (passed) {
      push({ id: nextId(), label, status: 'pass', message: message ?? 'OK' });
    } else {
      push({ id: nextId(), label, status: 'fail', message: message ?? 'Condition was false', line });
    }
  },

  /**
   * Check that two numbers are approximately equal (within tolerance).
   */
  equal(label: string, actual: number, expected: number, tolerance = 0, message?: string): void {
    const line = captureSourceLine();
    const diff = Math.abs(actual - expected);
    const passed = diff <= Math.abs(tolerance);
    push({
      id: nextId(),
      label,
      status: passed ? 'pass' : 'fail',
      message: passed
        ? `${roundNum(actual)} ≈ ${roundNum(expected)}`
        : (message ?? `Expected ${roundNum(expected)} ± ${roundNum(tolerance)}, got ${roundNum(actual)}`),
      line: passed ? undefined : line,
      expected: roundNum(expected),
      actual: roundNum(actual),
    });
  },

  /**
   * Check that two numbers are NOT equal (differ by more than tolerance).
   */
  notEqual(label: string, actual: number, unexpected: number, tolerance = 0, message?: string): void {
    const line = captureSourceLine();
    const diff = Math.abs(actual - unexpected);
    const passed = diff > Math.abs(tolerance);
    push({
      id: nextId(),
      label,
      status: passed ? 'pass' : 'fail',
      message: passed
        ? `${roundNum(actual)} ≠ ${roundNum(unexpected)}`
        : (message ?? `Expected value to differ from ${roundNum(unexpected)}, but got ${roundNum(actual)}`),
      line: passed ? undefined : line,
    });
  },

  /** Check that actual > min. */
  greaterThan(label: string, actual: number, min: number, message?: string): void {
    const line = captureSourceLine();
    const passed = actual > min;
    push({
      id: nextId(),
      label,
      status: passed ? 'pass' : 'fail',
      message: passed
        ? `${roundNum(actual)} > ${roundNum(min)}`
        : (message ?? `Expected > ${roundNum(min)}, got ${roundNum(actual)}`),
      line: passed ? undefined : line,
      expected: `> ${roundNum(min)}`,
      actual: roundNum(actual),
    });
  },

  /** Check that actual < max. */
  lessThan(label: string, actual: number, max: number, message?: string): void {
    const line = captureSourceLine();
    const passed = actual < max;
    push({
      id: nextId(),
      label,
      status: passed ? 'pass' : 'fail',
      message: passed
        ? `${roundNum(actual)} < ${roundNum(max)}`
        : (message ?? `Expected < ${roundNum(max)}, got ${roundNum(actual)}`),
      line: passed ? undefined : line,
      expected: `< ${roundNum(max)}`,
      actual: roundNum(actual),
    });
  },

  /** Check that min <= actual <= max. */
  inRange(label: string, actual: number, min: number, max: number, message?: string): void {
    const line = captureSourceLine();
    const passed = actual >= min && actual <= max;
    push({
      id: nextId(),
      label,
      status: passed ? 'pass' : 'fail',
      message: passed
        ? `${roundNum(actual)} in [${roundNum(min)}, ${roundNum(max)}]`
        : (message ?? `Expected in [${roundNum(min)}, ${roundNum(max)}], got ${roundNum(actual)}`),
      line: passed ? undefined : line,
      expected: `[${roundNum(min)}, ${roundNum(max)}]`,
      actual: roundNum(actual),
    });
  },

  /**
   * Check that the bounding-box centers of two shapes coincide within tolerance (mm).
   */
  centersCoincide(label: string, a: ShapeLike, b: ShapeLike, tolerance = 0.01): void {
    const line = captureSourceLine();
    try {
      const ca = bboxCenter(a.boundingBox());
      const cb = bboxCenter(b.boundingBox());
      const d = dist3(ca, cb);
      const passed = d <= tolerance;
      push({
        id: nextId(),
        label,
        status: passed ? 'pass' : 'fail',
        message: passed
          ? `Centers coincide (distance ${roundNum(d, 3)} mm)`
          : `Centers are ${roundNum(d, 3)} mm apart (tolerance ${roundNum(tolerance, 3)} mm)`,
        line: passed ? undefined : line,
        expected: `≤ ${roundNum(tolerance, 3)} mm`,
        actual: `${roundNum(d, 3)} mm`,
      });
    } catch (e: unknown) {
      push({ id: nextId(), label, status: 'fail', message: `Error: ${e instanceof Error ? e.message : String(e)}`, line });
    }
  },

  /**
   * Check that two shapes do not collide (minGap > 0).
   *
   * @param searchLength  Search radius for minGap (mm, default 1.0)
   */
  notColliding(label: string, a: ShapeLike, b: ShapeLike, searchLength = 1.0): void {
    const line = captureSourceLine();
    try {
      const gap = computeMinGap(a, b, searchLength);
      const passed = gap > 0;
      push({
        id: nextId(),
        label,
        status: passed ? 'pass' : 'fail',
        message: passed
          ? `No collision (min gap ${roundNum(gap, 3)} mm)`
          : `Shapes are colliding (min gap ${roundNum(gap, 3)} mm ≤ 0)`,
        line: passed ? undefined : line,
        expected: '> 0 mm',
        actual: `${roundNum(gap, 3)} mm`,
      });
    } catch (e: unknown) {
      push({ id: nextId(), label, status: 'fail', message: `Error: ${e instanceof Error ? e.message : String(e)}`, line });
    }
  },

  /**
   * Check that a minimum clearance gap exists between two shapes.
   */
  minClearance(label: string, a: ShapeLike, b: ShapeLike, minGap: number, searchLength = 10.0): void {
    const line = captureSourceLine();
    try {
      const gap = computeMinGap(a, b, searchLength);
      const passed = gap >= minGap;
      push({
        id: nextId(),
        label,
        status: passed ? 'pass' : 'fail',
        message: passed
          ? `Gap ${roundNum(gap, 3)} mm ≥ ${roundNum(minGap, 3)} mm`
          : `Gap ${roundNum(gap, 3)} mm < required ${roundNum(minGap, 3)} mm`,
        line: passed ? undefined : line,
        expected: `≥ ${roundNum(minGap, 3)} mm`,
        actual: `${roundNum(gap, 3)} mm`,
      });
    } catch (e: unknown) {
      push({ id: nextId(), label, status: 'fail', message: `Error: ${e instanceof Error ? e.message : String(e)}`, line });
    }
  },

  /**
   * Check that two face normals are parallel (within toleranceDeg degrees).
   */
  parallel(label: string, faceA: FaceRefLike, faceB: FaceRefLike, toleranceDeg = 1.0): void {
    const line = captureSourceLine();
    try {
      const na = faceA.normal as [number, number, number];
      const nb = faceB.normal as [number, number, number];
      const dot = vec3Dot(na, nb);
      const lenA = vec3Len(na);
      const lenB = vec3Len(nb);
      if (lenA < 1e-9 || lenB < 1e-9) {
        push({ id: nextId(), label, status: 'fail', message: 'One or both faces have zero-length normals', line });
        return;
      }
      // cos(angle) = |dot| / (|a| * |b|), parallel means cos(angle) ≈ 1
      const cosAngle = Math.abs(dot) / (lenA * lenB);
      const angleDeg = (Math.acos(Math.min(1, cosAngle)) * 180) / Math.PI;
      const passed = angleDeg <= toleranceDeg;
      push({
        id: nextId(),
        label,
        status: passed ? 'pass' : 'fail',
        message: passed
          ? `Parallel (angle ${roundNum(angleDeg, 2)}°)`
          : `Not parallel: ${roundNum(angleDeg, 2)}° apart (tolerance ${roundNum(toleranceDeg, 1)}°)`,
        line: passed ? undefined : line,
        expected: `≤ ${roundNum(toleranceDeg, 1)}°`,
        actual: `${roundNum(angleDeg, 2)}°`,
      });
    } catch (e: unknown) {
      push({ id: nextId(), label, status: 'fail', message: `Error: ${e instanceof Error ? e.message : String(e)}`, line });
    }
  },

  /**
   * Check that two face normals are perpendicular (within toleranceDeg degrees).
   */
  perpendicular(label: string, faceA: FaceRefLike, faceB: FaceRefLike, toleranceDeg = 1.0): void {
    const line = captureSourceLine();
    try {
      const na = faceA.normal as [number, number, number];
      const nb = faceB.normal as [number, number, number];
      const dot = vec3Dot(na, nb);
      const lenA = vec3Len(na);
      const lenB = vec3Len(nb);
      if (lenA < 1e-9 || lenB < 1e-9) {
        push({ id: nextId(), label, status: 'fail', message: 'One or both faces have zero-length normals', line });
        return;
      }
      // perpendicular means |cos(angle)| ≈ 0
      const cosAngle = Math.abs(dot) / (lenA * lenB);
      const angleDeg = 90 - (Math.acos(Math.min(1, cosAngle)) * 180) / Math.PI;
      const passed = Math.abs(angleDeg) <= toleranceDeg;
      push({
        id: nextId(),
        label,
        status: passed ? 'pass' : 'fail',
        message: passed
          ? `Perpendicular (deviation ${roundNum(Math.abs(angleDeg), 2)}°)`
          : `Not perpendicular: ${roundNum(Math.abs(angleDeg), 2)}° off 90° (tolerance ${roundNum(toleranceDeg, 1)}°)`,
        line: passed ? undefined : line,
        expected: `deviation ≤ ${roundNum(toleranceDeg, 1)}°`,
        actual: `${roundNum(Math.abs(angleDeg), 2)}°`,
      });
    } catch (e: unknown) {
      push({ id: nextId(), label, status: 'fail', message: `Error: ${e instanceof Error ? e.message : String(e)}`, line });
    }
  },

  /**
   * Check that a face is coplanar with (same plane as) another face,
   * meaning they are parallel AND their centers lie on the same plane.
   */
  coplanar(label: string, faceA: FaceRefLike, faceB: FaceRefLike, toleranceDeg = 1.0, toleranceMm = 0.1): void {
    const line = captureSourceLine();
    try {
      const na = faceA.normal as [number, number, number];
      const nb = faceB.normal as [number, number, number];
      const lenA = vec3Len(na);
      const lenB = vec3Len(nb);
      if (lenA < 1e-9 || lenB < 1e-9) {
        push({ id: nextId(), label, status: 'fail', message: 'One or both faces have zero-length normals', line });
        return;
      }
      const cosAngle = Math.abs(vec3Dot(na, nb)) / (lenA * lenB);
      const angleDeg = (Math.acos(Math.min(1, cosAngle)) * 180) / Math.PI;
      if (angleDeg > toleranceDeg) {
        push({
          id: nextId(), label, status: 'fail',
          message: `Not coplanar: normals are ${roundNum(angleDeg, 2)}° apart`,
          line, expected: `angle ≤ ${toleranceDeg}°`, actual: `${roundNum(angleDeg, 2)}°`,
        });
        return;
      }
      // Check offset: project centerB onto the plane defined by centerA + normalA
      const ca = faceA.center as [number, number, number];
      const cb = faceB.center as [number, number, number];
      const diff: [number, number, number] = [cb[0] - ca[0], cb[1] - ca[1], cb[2] - ca[2]];
      const offset = Math.abs(vec3Dot(diff, na)) / lenA;
      const passed = offset <= toleranceMm;
      push({
        id: nextId(),
        label,
        status: passed ? 'pass' : 'fail',
        message: passed
          ? `Coplanar (offset ${roundNum(offset, 3)} mm)`
          : `Faces are parallel but offset by ${roundNum(offset, 3)} mm (tolerance ${roundNum(toleranceMm, 3)} mm)`,
        line: passed ? undefined : line,
        expected: `offset ≤ ${roundNum(toleranceMm, 3)} mm`,
        actual: `${roundNum(offset, 3)} mm`,
      });
    } catch (e: unknown) {
      push({ id: nextId(), label, status: 'fail', message: `Error: ${e instanceof Error ? e.message : String(e)}`, line });
    }
  },

  /**
   * Check that a face center lies at a specific position (within toleranceMm).
   */
  faceAt(label: string, face: FaceRefLike, expectedPos: [number, number, number], toleranceMm = 0.1): void {
    const line = captureSourceLine();
    try {
      const center = face.center as [number, number, number];
      const d = dist3(center, expectedPos);
      const passed = d <= toleranceMm;
      push({
        id: nextId(),
        label,
        status: passed ? 'pass' : 'fail',
        message: passed
          ? `Face center ${formatVec3(center)} ≈ ${formatVec3(expectedPos)}`
          : `Face center ${formatVec3(center)} is ${roundNum(d, 3)} mm from expected ${formatVec3(expectedPos)}`,
        line: passed ? undefined : line,
        expected: formatVec3(expectedPos),
        actual: formatVec3(center),
      });
    } catch (e: unknown) {
      push({ id: nextId(), label, status: 'fail', message: `Error: ${e instanceof Error ? e.message : String(e)}`, line });
    }
  },

  /**
   * Check that two face normals point in the same direction (not antiparallel).
   * Stricter than parallel — both |angle| AND sign must match.
   */
  sameDirection(label: string, faceA: FaceRefLike, faceB: FaceRefLike, toleranceDeg = 1.0): void {
    const line = captureSourceLine();
    try {
      const na = faceA.normal as [number, number, number];
      const nb = faceB.normal as [number, number, number];
      const dot = vec3Dot(na, nb);
      const lenA = vec3Len(na);
      const lenB = vec3Len(nb);
      if (lenA < 1e-9 || lenB < 1e-9) {
        push({ id: nextId(), label, status: 'fail', message: 'One or both faces have zero-length normals', line });
        return;
      }
      // Only passes when dot > 0 (same half-space) AND angle ≤ tolerance
      if (dot <= 0) {
        push({ id: nextId(), label, status: 'fail', message: 'Face normals point in opposite directions', line });
        return;
      }
      const cosAngle = dot / (lenA * lenB);
      const angleDeg = (Math.acos(Math.min(1, cosAngle)) * 180) / Math.PI;
      const passed = angleDeg <= toleranceDeg;
      push({
        id: nextId(),
        label,
        status: passed ? 'pass' : 'fail',
        message: passed
          ? `Same direction (angle ${roundNum(angleDeg, 2)}°)`
          : `Not same direction: ${roundNum(angleDeg, 2)}° apart`,
        line: passed ? undefined : line,
        expected: `≤ ${roundNum(toleranceDeg, 1)}°`,
        actual: `${roundNum(angleDeg, 2)}°`,
      });
    } catch (e: unknown) {
      push({ id: nextId(), label, status: 'fail', message: `Error: ${e instanceof Error ? e.message : String(e)}`, line });
    }
  },

  /**
   * Check that a shape is empty.
   */
  isEmpty(label: string, shape: ShapeLike, message?: string): void {
    const line = captureSourceLine();
    try {
      const empty = shape.isEmpty();
      push({
        id: nextId(),
        label,
        status: empty ? 'pass' : 'fail',
        message: empty ? (message ?? 'Shape is empty as expected') : (message ?? 'Expected empty shape but it has geometry'),
        line: empty ? undefined : line,
      });
    } catch (e: unknown) {
      push({ id: nextId(), label, status: 'fail', message: `Error: ${e instanceof Error ? e.message : String(e)}`, line });
    }
  },

  /**
   * Check that a shape is NOT empty.
   */
  notEmpty(label: string, shape: ShapeLike, message?: string): void {
    const line = captureSourceLine();
    try {
      const empty = shape.isEmpty();
      push({
        id: nextId(),
        label,
        status: !empty ? 'pass' : 'fail',
        message: !empty ? (message ?? 'Shape has geometry') : (message ?? 'Expected non-empty shape but it is empty'),
        line: !empty ? undefined : line,
      });
    } catch (e: unknown) {
      push({ id: nextId(), label, status: 'fail', message: `Error: ${e instanceof Error ? e.message : String(e)}`, line });
    }
  },

  /**
   * Check that a shape's volume is approximately equal to expected (mm³).
   *
   * @param expected  Expected volume in mm³
   * @param tolerance  Absolute tolerance in mm³ (default 1.0)
   */
  volumeApprox(label: string, shape: ShapeLike, expected: number, tolerance = 1.0): void {
    const line = captureSourceLine();
    try {
      const actual = shape.volume();
      const diff = Math.abs(actual - expected);
      const passed = diff <= Math.abs(tolerance);
      push({
        id: nextId(),
        label,
        status: passed ? 'pass' : 'fail',
        message: passed
          ? `Volume ${roundNum(actual, 2)} mm³ ≈ ${roundNum(expected, 2)} mm³`
          : `Volume ${roundNum(actual, 2)} mm³ ≠ expected ${roundNum(expected, 2)} ± ${roundNum(tolerance, 2)} mm³`,
        line: passed ? undefined : line,
        expected: `${roundNum(expected, 2)} ± ${roundNum(tolerance, 2)} mm³`,
        actual: `${roundNum(actual, 2)} mm³`,
      });
    } catch (e: unknown) {
      push({ id: nextId(), label, status: 'fail', message: `Error: ${e instanceof Error ? e.message : String(e)}`, line });
    }
  },

  /**
   * Check that a shape's surface area is approximately equal to expected (mm²).
   *
   * @param expected  Expected surface area in mm²
   * @param tolerance  Absolute tolerance in mm² (default 1.0)
   */
  areaApprox(label: string, shape: ShapeLike, expected: number, tolerance = 1.0): void {
    const line = captureSourceLine();
    try {
      const actual = shape.surfaceArea();
      const diff = Math.abs(actual - expected);
      const passed = diff <= Math.abs(tolerance);
      push({
        id: nextId(),
        label,
        status: passed ? 'pass' : 'fail',
        message: passed
          ? `Surface area ${roundNum(actual, 2)} mm² ≈ ${roundNum(expected, 2)} mm²`
          : `Surface area ${roundNum(actual, 2)} mm² ≠ expected ${roundNum(expected, 2)} ± ${roundNum(tolerance, 2)} mm²`,
        line: passed ? undefined : line,
        expected: `${roundNum(expected, 2)} ± ${roundNum(tolerance, 2)} mm²`,
        actual: `${roundNum(actual, 2)} mm²`,
      });
    } catch (e: unknown) {
      push({ id: nextId(), label, status: 'fail', message: `Error: ${e instanceof Error ? e.message : String(e)}`, line });
    }
  },

  /**
   * Check that a shape's bounding box has approximately the given size.
   *
   * @param expectedSize  [sizeX, sizeY, sizeZ] in mm
   * @param tolerance  Per-axis tolerance in mm (default 0.1)
   */
  boundingBoxSize(
    label: string,
    shape: ShapeLike,
    expectedSize: [number, number, number],
    tolerance = 0.1,
  ): void {
    const line = captureSourceLine();
    try {
      const bb = shape.boundingBox();
      const actual: [number, number, number] = [
        bb.max[0] - bb.min[0],
        bb.max[1] - bb.min[1],
        bb.max[2] - bb.min[2],
      ];
      const diffs = actual.map((v, i) => Math.abs(v - expectedSize[i]));
      const passed = diffs.every((d) => d <= Math.abs(tolerance));
      const fmtActual = `(${actual.map((v) => roundNum(v, 2)).join(', ')}) mm`;
      const fmtExpected = `(${expectedSize.map((v) => roundNum(v, 2)).join(', ')}) ± ${roundNum(tolerance, 2)} mm`;
      push({
        id: nextId(),
        label,
        status: passed ? 'pass' : 'fail',
        message: passed
          ? `Bounding box size ${fmtActual} ≈ expected`
          : `Bounding box size ${fmtActual} ≠ expected ${fmtExpected}`,
        line: passed ? undefined : line,
        expected: fmtExpected,
        actual: fmtActual,
      });
    } catch (e: unknown) {
      push({ id: nextId(), label, status: 'fail', message: `Error: ${e instanceof Error ? e.message : String(e)}`, line });
    }
  },
};
