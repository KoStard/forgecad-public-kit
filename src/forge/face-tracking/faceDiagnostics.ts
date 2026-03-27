import type { FaceRef } from '../sketch/topology';
import type { FaceQuery } from './faceQuery';

/** Format a FaceQuery object for display in error messages */
export function formatFaceQuery(query: FaceQuery): string {
  const parts: string[] = [];
  if (query.normal) parts.push(`normal: [${query.normal.join(', ')}]`);
  if (query.nearest) parts.push(`nearest: [${query.nearest.join(', ')}]`);
  if (query.at) parts.push(`at: [${query.at.join(', ')}]`);
  if (query.pick) parts.push(`pick: '${query.pick}'`);
  if (query.area) {
    const areaParts: string[] = [];
    if (query.area.min != null) areaParts.push(`min: ${query.area.min}`);
    if (query.area.max != null) areaParts.push(`max: ${query.area.max}`);
    parts.push(`area: { ${areaParts.join(', ')} }`);
  }
  if (query.planar != null) parts.push(`planar: ${query.planar}`);
  return `{ ${parts.join(', ')} }`;
}

/** Build an error message when a face query finds no matches */
export function explainNoFaceQueryMatch(query: FaceQuery, allFaces: FaceRef[]): string {
  // Show the query, then list what faces DO exist on the shape
  const lines: string[] = [];
  lines.push(`Face query ${formatFaceQuery(query)} matched no faces.`);

  if (allFaces.length === 0) {
    lines.push('The shape has no detectable planar faces.');
  } else {
    lines.push(`\nFaces on this shape (${allFaces.length}):`);
    for (const f of allFaces.slice(0, 10)) {
      // cap at 10 to avoid huge errors
      const n = `[${f.normal.map((v) => v.toFixed(3)).join(', ')}]`;
      const c = `[${f.center.map((v) => v.toFixed(1)).join(', ')}]`;
      lines.push(`  - normal ${n}, center ${c}`);
    }
    if (allFaces.length > 10) {
      lines.push(`  ... and ${allFaces.length - 10} more`);
    }

    // If query had a normal filter, suggest which faces are closest to that normal
    if (query.normal) {
      const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const sorted = [...allFaces]
        .map((f) => ({ face: f, sim: dot(f.normal, query.normal!) }))
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 3);
      if (sorted.length > 0 && sorted[0].sim < 0.9998) {
        lines.push(`\nNearest normals to query:`);
        for (const { face, sim } of sorted) {
          const angle = Math.acos(Math.min(1, Math.abs(sim))) * (180 / Math.PI);
          const n = `[${face.normal.map((v) => v.toFixed(3)).join(', ')}]`;
          lines.push(`  - normal ${n} (${angle.toFixed(1)}° off), center [${face.center.map((v) => v.toFixed(1)).join(', ')}]`);
        }
      }
    }
  }

  return lines.join('\n');
}
