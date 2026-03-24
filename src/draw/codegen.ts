/**
 * Code generation for the draw mode.
 * Converts a list of draw statements into a complete .forge.js file.
 */

export interface DrawnPoint {
  varName: string;
  x: number;
  y: number;
}

/** Round a coordinate to 1 decimal place for clean generated code. */
export function roundCoord(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Format a number for code output — drop trailing .0 for integers. */
function fmt(v: number): string {
  const r = roundCoord(v);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export interface DrawSessionState {
  statements: string[];
  points: DrawnPoint[];
}

/**
 * Generate a complete .forge.js file from the draw session state.
 */
export function generateSketchCode(session: DrawSessionState): string {
  const lines: string[] = [];
  lines.push('const sk = constrainedSketch();');
  lines.push('');
  for (const stmt of session.statements) {
    lines.push(stmt);
  }
  if (session.statements.length > 0) {
    lines.push('');
  }
  lines.push('return sk.solve();');
  lines.push('');
  return lines.join('\n');
}

/**
 * Generate a point statement.
 */
export function pointStatement(varName: string, x: number, y: number): string {
  return `const ${varName} = sk.point(${fmt(x)}, ${fmt(y)});`;
}

/**
 * Generate a line statement.
 */
export function lineStatement(varName: string, startVar: string, endVar: string): string {
  return `const ${varName} = sk.line(${startVar}, ${endVar});`;
}

/**
 * Generate a circle statement.
 */
export function circleStatement(varName: string, centerVar: string, radius: number): string {
  return `const ${varName} = sk.circle(${centerVar}, ${fmt(radius)});`;
}

/**
 * Generate an arc statement using arcByCenter(center, start, end).
 * Note: the builder API is `arcByCenter`, not `arc`.
 */
export function arcStatement(varName: string, centerVar: string, startVar: string, endVar: string): string {
  return `const ${varName} = sk.arcByCenter(${centerVar}, ${startVar}, ${endVar});`;
}

/**
 * Map draw-mode constraint names to actual ConstrainedSketchBuilder method names.
 * Most match 1:1, but some differ (e.g., 'fixed' → 'fix').
 */
const CONSTRAINT_API_MAP: Record<string, string> = {
  fixed: 'fix',
};

/**
 * Generate a constraint statement (no const, just the call).
 */
export function constraintStatement(type: string, ...args: (string | number)[]): string {
  const apiName = CONSTRAINT_API_MAP[type] ?? type;
  const fmtArgs = args.map((a) => (typeof a === 'number' ? fmt(a) : a)).join(', ');
  return `sk.${apiName}(${fmtArgs});`;
}
