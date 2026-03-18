import type { Sketch } from './core';

export interface SketchDxfOptions {
  /** DXF layer name. Default: "0" */
  layer?: string;
  /** DXF color index (1–255, AutoCAD ACI). Default: 7 (white/black) */
  colorIndex?: number;
}

/**
 * Export a 2D sketch as a DXF string (R12/AC1009 — maximally compatible).
 *
 * Each polygon loop becomes a closed LWPOLYLINE entity. The output is a
 * minimal but valid DXF file that any CAD/CAM tool can read.
 */
export function sketchToDxf(sketch: Sketch, options: SketchDxfOptions = {}): string {
  const { layer = '0', colorIndex = 7 } = options;

  const loops = sketch.toPolygons() as number[][][];

  const sections: string[] = [];

  // HEADER section — minimal, declares AC1009 (R12) format.
  sections.push(
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1009',
    '0', 'ENDSEC',
  );

  // ENTITIES section — one LWPOLYLINE per loop.
  sections.push('0', 'SECTION', '2', 'ENTITIES');

  for (const loop of loops) {
    if (loop.length < 2) continue;

    sections.push(
      '0', 'LWPOLYLINE',
      '8', layer,          // layer
      '62', String(colorIndex), // color
      '90', String(loop.length), // vertex count
      '70', '1',           // closed polyline flag
    );

    for (const [x, y] of loop) {
      sections.push(
        '10', fmtDxf(x),
        '20', fmtDxf(y),
      );
    }
  }

  sections.push('0', 'ENDSEC');

  // EOF
  sections.push('0', 'EOF');

  return sections.join('\n') + '\n';
}

function fmtDxf(n: number): string {
  return n.toFixed(6);
}
