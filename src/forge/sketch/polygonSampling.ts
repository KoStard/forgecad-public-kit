type Vec2 = [number, number];

export function resamplePolygon(poly: Vec2[], targetCount: number): Vec2[] {
  if (poly.length < 2) return poly;
  if (targetCount <= 0) return [];

  // Calculate cumulative distance
  const dists: number[] = [0];
  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % poly.length];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const d = Math.sqrt(dx * dx + dy * dy);
    dists.push(dists[dists.length - 1] + d);
  }

  const totalDist = dists[dists.length - 1];
  if (totalDist < 1e-12) {
    return Array.from({ length: targetCount }, () => [poly[0][0], poly[0][1]] as Vec2);
  }

  const out: Vec2[] = [];
  for (let i = 0; i < targetCount; i++) {
    const targetDist = (i / targetCount) * totalDist;
    
    // Binary search for segment
    let low = 0;
    let high = dists.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (dists[mid] <= targetDist) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    const seg = low - 1;
    const t = (targetDist - dists[seg]) / (dists[seg + 1] - dists[seg]);
    
    const p1 = poly[seg % poly.length];
    const p2 = poly[(seg + 1) % poly.length];
    out.push([
      p1[0] + (p2[0] - p1[0]) * t,
      p1[1] + (p2[1] - p1[1]) * t,
    ]);
  }

  return out;
}
