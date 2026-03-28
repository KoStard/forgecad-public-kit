/**
 * TPMS (Triply Periodic Minimal Surface) primitive functions.
 *
 * Each function returns an approximate signed distance to the surface,
 * following standard SDF convention (negative = inside, positive = outside).
 */

const { abs, cos, sin, PI } = Math;
const TAU = 2 * PI;

export function gyroid(x: number, y: number, z: number, cellSize: number, thickness: number): number {
  const s = TAU / cellSize;
  return abs(sin(x * s) * cos(y * s) + sin(y * s) * cos(z * s) + sin(z * s) * cos(x * s)) - thickness;
}

export function schwarzP(x: number, y: number, z: number, cellSize: number, thickness: number): number {
  const s = TAU / cellSize;
  return abs(cos(x * s) + cos(y * s) + cos(z * s)) - thickness;
}

export function diamond(x: number, y: number, z: number, cellSize: number, thickness: number): number {
  const s = TAU / cellSize;
  return (
    abs(
      sin(x * s) * sin(y * s) * sin(z * s) +
        sin(x * s) * cos(y * s) * cos(z * s) +
        cos(x * s) * sin(y * s) * cos(z * s) +
        cos(x * s) * cos(y * s) * sin(z * s),
    ) - thickness
  );
}

export function lidinoid(x: number, y: number, z: number, cellSize: number, thickness: number): number {
  const s = TAU / cellSize;
  const sx2 = x * s, sy2 = y * s, sz2 = z * s;
  const val =
    sin(2 * sx2) * cos(sy2) * sin(sz2) +
    sin(2 * sy2) * cos(sz2) * sin(sx2) +
    sin(2 * sz2) * cos(sx2) * sin(sy2) -
    cos(2 * sx2) * cos(2 * sy2) -
    cos(2 * sy2) * cos(2 * sz2) -
    cos(2 * sz2) * cos(2 * sx2) +
    0.3;
  return abs(val) - thickness;
}
