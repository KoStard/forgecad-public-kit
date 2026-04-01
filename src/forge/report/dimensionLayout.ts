/**
 * Dimension label placement — the complex layout engine for placing
 * annotation labels in projected engineering drawing views.
 */

import type { ColorRgb, Vec2 } from '../export/pdfUtils';
import { estimateTextWidth, commandLine, commandSetFill, commandSetStroke, formatNumber } from '../export/pdfUtils';
import type { DimensionDef } from '../sketch/dimensions';
import { formatLength } from '../units';
import {
  DENSE_DIM_COLOR_PALETTE,
  MIN_DIM_OFFSET_PX,
  DIM_CLEARANCE_PX,
  type Vec3,
  type Segment2,
  type Bounds2,
  type CellRect,
  type ViewFrame,
  type DimensionOffsetBasis,
  type LabelBox,
  type DimensionLabelPlan,
  type PlacedLabel,
  type LabelLegendEntry,
  type DimensionLabelLayout,
  type LegendPlacement,
  type DrawDimensionResult,
  type AutoLaneEntry,
  type DenseColorEntry,
} from './_internal';
import {
  clamp,
  cross3,
  sub3,
  dot3,
  mul3,
  norm,
  distance3,
  expandBounds2,
  boundsCenter2,
  makeLabelBox,
  overlapArea,
  expandBox,
  clampLabelCenter,
  closestPointOnBox,
  pointToBoxDistance,
  segmentToBoxDistance,
  segmentsIntersect2,
  sampleSegments,
  pointInBounds2,
  segmentIntersectsBounds2,
} from './mathUtils';

function commandTriangleFill(a: Vec2, b: Vec2, c: Vec2): string {
  return `${formatNumber(a[0])} ${formatNumber(a[1])} m ${formatNumber(b[0])} ${formatNumber(b[1])} l ${formatNumber(c[0])} ${formatNumber(c[1])} l h f\n`;
}

/** Module-level length unit for the current report generation. Set by generateReportPdf. */
export let _reportLengthUnit: import('../units').LengthUnit = 'mm';
export function setReportLengthUnit(unit: import('../units').LengthUnit): void {
  _reportLengthUnit = unit;
}

export function projectPoint(point: Vec3, center: Vec3, frame: ViewFrame): { x: number; y: number; depth: number } {
  const rel = sub3(point, center);
  return {
    x: dot3(rel, frame.right),
    y: dot3(rel, frame.up),
    depth: dot3(rel, frame.forward),
  };
}

export function makeViewFrame(view: import('./types').ReportViewId): ViewFrame {
  const cfg: Record<import('./types').ReportViewId, { label: string; camDir: Vec3; up: Vec3 }> = {
    front: { label: 'Front', camDir: [0, -1, 0], up: [0, 0, 1] },
    right: { label: 'Right', camDir: [1, 0, 0], up: [0, 0, 1] },
    top: { label: 'Top', camDir: [0, 0, 1], up: [0, 1, 0] },
    iso: { label: 'Isometric', camDir: [1, -1, 1], up: [0, 0, 1] },
  };

  const c = cfg[view];
  const forward = norm(mul3(c.camDir, -1));
  const right = norm(cross3(forward, c.up));
  const up = norm(cross3(right, forward));

  return { id: view, label: c.label, right, up, forward };
}

export function isDimensionVisibleInView(dim: DimensionDef, frame: ViewFrame, toleranceDeg: number): boolean {
  const dir = sub3(dim.to, dim.from);
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  if (len < 1e-9) return false;

  const d = [dir[0] / len, dir[1] / len, dir[2] / len] as Vec3;
  const alignRight = clamp(Math.abs(dot3(d, frame.right)), 0, 1);
  const alignUp = clamp(Math.abs(dot3(d, frame.up)), 0, 1);
  const angleRight = (Math.acos(alignRight) * 180) / Math.PI;
  const angleUp = (Math.acos(alignUp) * 180) / Math.PI;
  const minAngle = Math.min(angleRight, angleUp);
  return minAngle <= toleranceDeg;
}

export function dimensionZoomOutFactor(dimensionCount: number): number {
  if (dimensionCount <= 0) return 1;
  return 1 + Math.min(0.58, 0.3 + Math.sqrt(dimensionCount) * 0.07);
}

function projectVectorToView(v: Vec3, frame: ViewFrame): Vec2 {
  return [dot3(v, frame.right), dot3(v, frame.up)];
}

function pickDimensionOffsetBasis(dirModel: Vec3, frame: ViewFrame): DimensionOffsetBasis {
  const worldAxes: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const candidates: DimensionOffsetBasis[] = [];

  const pushCandidate = (candidate: Vec3) => {
    const len3 = Math.hypot(candidate[0], candidate[1], candidate[2]);
    if (len3 < 1e-8) return;
    const dir3: Vec3 = [candidate[0] / len3, candidate[1] / len3, candidate[2] / len3];
    const proj = projectVectorToView(dir3, frame);
    const projLen = Math.hypot(proj[0], proj[1]);
    if (projLen < 1e-6) return;
    const projDir: Vec2 = [proj[0] / projLen, proj[1] / projLen];
    candidates.push({ dir3, proj, projDir, projLen });
  };

  worldAxes.forEach((axis) => {
    const axisPerp = sub3(axis, mul3(dirModel, dot3(axis, dirModel)));
    pushCandidate(axisPerp);
  });

  if (candidates.length === 0) {
    pushCandidate(cross3(dirModel, frame.forward));
    pushCandidate(cross3(dirModel, frame.up));
    pushCandidate(cross3(dirModel, frame.right));
  }

  if (candidates.length === 0) {
    return { dir3: [0, 0, 1], proj: [0, 1], projDir: [0, 1], projLen: 1 };
  }

  candidates.sort((a, b) => b.projLen + Math.abs(b.projDir[1]) * 0.18 - (a.projLen + Math.abs(a.projDir[1]) * 0.18));
  return candidates[0];
}

function autoLaneOffsetPx(colorIndex: number, isIso: boolean): number {
  if (colorIndex <= 0) return 0;
  const step = isIso ? 7.5 : 10;
  const compressedIndex = colorIndex <= 3 ? colorIndex : 3 + (colorIndex - 3) * (isIso ? 0.45 : 0.55);
  return compressedIndex * step;
}

function intervalOverlap1D(a0: number, a1: number, b0: number, b1: number, pad: number): boolean {
  return Math.min(a1, b1) - Math.max(a0, b0) >= -pad;
}

function intervalContains1D(container0: number, container1: number, inner0: number, inner1: number, tol: number): boolean {
  return container0 <= inner0 + tol && container1 >= inner1 - tol;
}

export function hasExplicitDimensionColor(dim: DimensionDef): boolean {
  return typeof dim.color === 'string' && dim.color.trim().length > 0;
}

export function assignCrowdedDimensionColors(
  dims: DimensionDef[],
  frame: ViewFrame,
  center: Vec3,
  mapper: { map: (p: Vec2) => Vec2 },
): Map<string, ColorRgb> {
  const out = new Map<string, ColorRgb>();
  if (dims.length < 5) return out;

  const entries: DenseColorEntry[] = [];
  dims.forEach((dim) => {
    if (hasExplicitDimensionColor(dim)) return;
    const pFrom = projectPoint(dim.from, center, frame);
    const pTo = projectPoint(dim.to, center, frame);
    const p0 = mapper.map([pFrom.x, pFrom.y]);
    const p1 = mapper.map([pTo.x, pTo.y]);
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy);
    if (len < 8) return;

    let tx = dx / len;
    let ty = dy / len;
    if (tx < -1e-6 || (Math.abs(tx) <= 1e-6 && ty < 0)) {
      tx = -tx;
      ty = -ty;
    }
    const nx = -ty;
    const ny = tx;
    const t0 = p0[0] * tx + p0[1] * ty;
    const t1 = p1[0] * tx + p1[1] * ty;
    const mid: Vec2 = [(p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5];
    entries.push({
      dimId: dim.id,
      p0,
      p1,
      mid,
      tangent: [tx, ty],
      spanMin: Math.min(t0, t1),
      spanMax: Math.max(t0, t1),
      normalCoord: mid[0] * nx + mid[1] * ny,
      lenPx: len,
    });
  });

  if (entries.length < 5) return out;

  const alignThreshold = frame.id === 'iso' ? 0.952 : 0.968;
  const overlapPadPx = frame.id === 'iso' ? 10 : 12;
  const normalBandPx = frame.id === 'iso' ? 20 : 18;
  const nearMidPx = frame.id === 'iso' ? 30 : 26;

  const neighbors = new Map<number, Set<number>>();
  entries.forEach((_, idx) => neighbors.set(idx, new Set<number>()));

  for (let i = 0; i < entries.length; i += 1) {
    const a = entries[i];
    for (let j = i + 1; j < entries.length; j += 1) {
      const b = entries[j];
      const align = Math.abs(a.tangent[0] * b.tangent[0] + a.tangent[1] * b.tangent[1]);
      const overlap = intervalOverlap1D(a.spanMin, a.spanMax, b.spanMin, b.spanMax, overlapPadPx);
      const normalClose = Math.abs(a.normalCoord - b.normalCoord) <= normalBandPx;
      const midDist = Math.hypot(a.mid[0] - b.mid[0], a.mid[1] - b.mid[1]);
      const intersects = segmentsIntersect2(a.p0, a.p1, b.p0, b.p1);
      const closeParallel = align >= alignThreshold && overlap && normalClose;
      const closeCross = intersects && midDist <= nearMidPx * 2.2;
      const nearBundle = align >= 0.88 && overlap && midDist <= nearMidPx;
      if (!closeParallel && !closeCross && !nearBundle) continue;
      neighbors.get(i)?.add(j);
      neighbors.get(j)?.add(i);
    }
  }

  const crowdedIdxs = entries.map((_, idx) => idx).filter((idx) => (neighbors.get(idx)?.size ?? 0) > 0);
  if (crowdedIdxs.length < 4) return out;

  const inCrowd = new Set(crowdedIdxs);
  const components: number[][] = [];
  const seen = new Set<number>();
  crowdedIdxs.forEach((start) => {
    if (seen.has(start)) return;
    const comp: number[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const cur = queue.shift() as number;
      comp.push(cur);
      const nset = neighbors.get(cur);
      if (!nset) continue;
      nset.forEach((nei) => {
        if (!inCrowd.has(nei) || seen.has(nei)) return;
        seen.add(nei);
        queue.push(nei);
      });
    }
    if (comp.length >= 3) components.push(comp);
  });

  if (components.length === 0) return out;

  const colorByEntry = new Array(entries.length).fill(-1);
  const paletteLen = DENSE_DIM_COLOR_PALETTE.length;

  components.forEach((comp) => {
    const order = [...comp].sort((lhs, rhs) => {
      const lDeg = neighbors.get(lhs)?.size ?? 0;
      const rDeg = neighbors.get(rhs)?.size ?? 0;
      if (rDeg !== lDeg) return rDeg - lDeg;
      if (entries[lhs].lenPx !== entries[rhs].lenPx) return entries[lhs].lenPx - entries[rhs].lenPx;
      return entries[lhs].dimId.localeCompare(entries[rhs].dimId);
    });

    order.forEach((idx) => {
      const used = new Set<number>();
      neighbors.get(idx)?.forEach((nei) => {
        const c = colorByEntry[nei];
        if (c >= 0) used.add(c);
      });

      let picked = -1;
      for (let c = 0; c < paletteLen; c += 1) {
        if (!used.has(c)) {
          picked = c;
          break;
        }
      }
      if (picked < 0) {
        // If palette is exhausted in a dense cluster, pick the color with least immediate neighbor collisions.
        let bestColor = 0;
        let bestConflicts = Number.POSITIVE_INFINITY;
        for (let c = 0; c < paletteLen; c += 1) {
          let conflicts = 0;
          neighbors.get(idx)?.forEach((nei) => {
            if (colorByEntry[nei] === c) conflicts += 1;
          });
          if (conflicts < bestConflicts) {
            bestConflicts = conflicts;
            bestColor = c;
          }
        }
        picked = bestColor;
      }

      colorByEntry[idx] = picked;
      out.set(entries[idx].dimId, DENSE_DIM_COLOR_PALETTE[picked % paletteLen]);
    });
  });

  return out;
}

export function assignAutoOffsetLanes(
  dims: DimensionDef[],
  frame: ViewFrame,
  center: Vec3,
  mapper: { map: (p: Vec2) => Vec2; scale: number },
  placementCenter: Vec2,
): Map<string, number> {
  const out = new Map<string, number>();
  if (dims.length <= 1) return out;

  const centerPx = mapper.map(placementCenter);
  const laneStepPx = frame.id === 'iso' ? 7.5 : 10;
  const overlapPadPx = frame.id === 'iso' ? 8 : 10;
  const alignThreshold = frame.id === 'iso' ? 0.98 : 0.985;
  const normalBandPx = laneStepPx * 1.35;
  const angleBucketRad = frame.id === 'iso' ? Math.PI / 42 : Math.PI / 54;
  const containTolPx = frame.id === 'iso' ? 4 : 5;

  const entries: AutoLaneEntry[] = [];

  dims.forEach((dim) => {
    const autoOffset = dim.autoOffset ?? Math.abs(dim.offset - 10) < 1e-6;
    if (!autoOffset) return;

    const pFromModel = projectPoint(dim.from, center, frame);
    const pToModel = projectPoint(dim.to, center, frame);
    const p0 = mapper.map([pFromModel.x, pFromModel.y]);
    const p1 = mapper.map([pToModel.x, pToModel.y]);
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy);
    if (len < 6) return;

    let tx = dx / len;
    let ty = dy / len;
    if (tx < -1e-6 || (Math.abs(tx) <= 1e-6 && ty < 0)) {
      tx = -tx;
      ty = -ty;
    }
    const angle = Math.atan2(ty, tx);
    const nx = -ty;
    const ny = tx;
    const t0 = p0[0] * tx + p0[1] * ty;
    const t1 = p1[0] * tx + p1[1] * ty;
    const spanMin = Math.min(t0, t1);
    const spanMax = Math.max(t0, t1);
    const mid: Vec2 = [(p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5];
    const normalCoord = mid[0] * nx + mid[1] * ny;
    const requestedSign = dim.offset < 0 ? -1 : 1;
    const centerPref = (mid[0] - centerPx[0]) * nx + (mid[1] - centerPx[1]) * ny;
    const centerSign = Math.abs(centerPref) > 0.8 ? (centerPref >= 0 ? 1 : -1) : 0;
    const preferredSide = centerSign || requestedSign;

    entries.push({
      dimId: dim.id,
      angle,
      tangent: [tx, ty],
      spanMin,
      spanMax,
      normalCoord,
      preferredSide,
      lenPx: len,
    });
  });

  if (entries.length <= 1) return out;

  const familyMap = new Map<string, number[]>();
  entries.forEach((entry, idx) => {
    const bucket = Math.round(entry.angle / angleBucketRad);
    const key = `${entry.preferredSide}:${bucket}`;
    const list = familyMap.get(key) || [];
    list.push(idx);
    familyMap.set(key, list);
  });

  const laneByEntry = new Array(entries.length).fill(0);

  const assignFamilyGroup = (groupIdxs: number[]) => {
    if (groupIdxs.length <= 1) return;

    const neighbors = new Map<number, Set<number>>();
    groupIdxs.forEach((idx) => neighbors.set(idx, new Set<number>()));

    for (let i = 0; i < groupIdxs.length; i += 1) {
      const ia = groupIdxs[i];
      const a = entries[ia];
      for (let j = i + 1; j < groupIdxs.length; j += 1) {
        const ib = groupIdxs[j];
        const b = entries[ib];
        const align = Math.abs(a.tangent[0] * b.tangent[0] + a.tangent[1] * b.tangent[1]);
        if (align < alignThreshold) continue;
        if (Math.abs(a.normalCoord - b.normalCoord) > normalBandPx) continue;
        if (!intervalOverlap1D(a.spanMin, a.spanMax, b.spanMin, b.spanMax, overlapPadPx)) continue;
        neighbors.get(ia)?.add(ib);
        neighbors.get(ib)?.add(ia);
      }
    }

    const order = groupIdxs
      .map((idx) => ({
        idx,
        span: entries[idx].spanMax - entries[idx].spanMin,
        degree: neighbors.get(idx)?.size ?? 0,
      }))
      .sort((lhs, rhs) => lhs.span - rhs.span || rhs.degree - lhs.degree || lhs.idx - rhs.idx);

    order.forEach(({ idx }) => {
      const used = new Set<number>();
      const nset = neighbors.get(idx) || new Set<number>();
      nset.forEach((nei) => {
        used.add(laneByEntry[nei]);
      });
      let lane = 0;
      while (used.has(lane)) lane += 1;
      laneByEntry[idx] = lane;
    });

    let adjusted = true;
    for (let guard = 0; guard < 6 && adjusted; guard += 1) {
      adjusted = false;
      for (let i = 0; i < groupIdxs.length; i += 1) {
        const ia = groupIdxs[i];
        const a = entries[ia];
        for (let j = 0; j < groupIdxs.length; j += 1) {
          if (i === j) continue;
          const ib = groupIdxs[j];
          const b = entries[ib];
          if (!intervalContains1D(a.spanMin, a.spanMax, b.spanMin, b.spanMax, containTolPx)) continue;
          if (Math.abs(a.normalCoord - b.normalCoord) > normalBandPx) continue;
          if (laneByEntry[ia] <= laneByEntry[ib]) {
            laneByEntry[ia] = laneByEntry[ib] + 1;
            adjusted = true;
          }
        }
      }
    }
  };

  familyMap.forEach((familyIdxs) => {
    if (familyIdxs.length <= 1) return;
    const sorted = [...familyIdxs].sort((lhs, rhs) => entries[lhs].normalCoord - entries[rhs].normalCoord);
    let cluster: number[] = [];
    let lastNormal = 0;
    sorted.forEach((idx, i) => {
      const n = entries[idx].normalCoord;
      if (i === 0 || Math.abs(n - lastNormal) <= normalBandPx) {
        cluster.push(idx);
      } else {
        assignFamilyGroup(cluster);
        cluster = [idx];
      }
      lastNormal = n;
    });
    assignFamilyGroup(cluster);
  });

  entries.forEach((entry, idx) => {
    const extraPx = autoLaneOffsetPx(laneByEntry[idx], frame.id === 'iso');
    if (extraPx <= 0) return;
    out.set(entry.dimId, extraPx / Math.max(1e-6, mapper.scale));
  });

  if (out.size === 0 && entries.length > 2) {
    const order = entries.map((entry, idx) => ({ entry, idx })).sort((lhs, rhs) => lhs.entry.lenPx - rhs.entry.lenPx || lhs.idx - rhs.idx);
    order.forEach(({ entry, idx }) => {
      const extraPx = autoLaneOffsetPx(idx, frame.id === 'iso');
      if (extraPx <= 0) return;
      out.set(entry.dimId, extraPx / Math.max(1e-6, mapper.scale));
    });
  }

  return out;
}

function candidateOrderFromCenter(center: number, min: number, max: number, step: number): number[] {
  const out: number[] = [];
  const clampedCenter = clamp(center, min, max);
  out.push(clampedCenter);
  const n = Math.max(2, Math.ceil((max - min) / Math.max(1, step)));
  for (let i = 1; i <= n; i += 1) {
    const up = clampedCenter + i * step;
    const down = clampedCenter - i * step;
    if (up <= max) out.push(up);
    if (down >= min) out.push(down);
  }
  return out;
}

function buildFallbackCandidates(plan: DimensionLabelPlan, cell: CellRect): Vec2[] {
  const inset = 6;
  const minX = cell.x + inset + plan.textHalfW;
  const maxX = cell.x + cell.w - inset - plan.textHalfW;
  const minY = cell.y + inset + plan.textHalfH;
  const maxY = cell.y + cell.h - inset - plan.textHalfH;
  if (minX > maxX || minY > maxY) return [clampLabelCenter(plan.preferred, plan.textHalfW, plan.textHalfH, cell)];

  const centerX = cell.x + cell.w * 0.5;
  const centerY = cell.y + cell.h * 0.5;
  const preferRight = plan.preferred[0] >= centerX;
  const preferTop = plan.preferred[1] >= centerY;
  const xEdges = preferRight ? [maxX, minX] : [minX, maxX];
  const yEdges = preferTop ? [maxY, minY] : [minY, maxY];

  const stepY = Math.max(10, plan.textHalfH * 2 + 3);
  const stepX = Math.max(10, plan.textHalfW * 0.8 + 4);
  const yOrder = candidateOrderFromCenter(plan.anchor[1], minY, maxY, stepY);
  const xOrder = candidateOrderFromCenter(plan.anchor[0], minX, maxX, stepX);

  const out: Vec2[] = [];
  xEdges.forEach((x) => {
    yOrder.forEach((y) => out.push([x, y]));
  });
  yEdges.forEach((y) => {
    xOrder.forEach((x) => out.push([x, y]));
  });
  return out;
}

function hasHardLabelConflict(
  ownLineSegments: Segment2[],
  box: LabelBox,
  placed: PlacedLabel[],
  blockedSegments: Segment2[],
  avoidBoxes: LabelBox[],
): boolean {
  const selfSegs = new Set(ownLineSegments);
  for (const p of placed) {
    if (overlapArea(expandBox(box, 2.2), expandBox(p.box, 2.2)) > 0) return true;
  }
  for (const b of avoidBoxes) {
    if (overlapArea(box, b) > 0) return true;
  }
  for (const seg of blockedSegments) {
    if (selfSegs.has(seg)) continue;
    const dist = segmentToBoxDistance(seg, box);
    if (dist < 2.6) return true;
  }
  return false;
}

export function chooseLegendPlacement(
  legendEntries: LabelLegendEntry[],
  cell: CellRect,
  renderedLabelBoxes: LabelBox[],
  blockedSegments: Segment2[],
  avoidBoxes: LabelBox[],
): LegendPlacement | null {
  if (legendEntries.length === 0) return null;

  const fontSize = 6.2;
  const lineHeight = 7.2;
  const inset = 6;
  const width = Math.min(190, cell.w * 0.52);
  const maxRows = Math.max(3, Math.floor((cell.h * 0.34) / lineHeight));
  const shown = legendEntries.slice(0, maxRows);
  const hiddenCount = Math.max(0, legendEntries.length - shown.length);
  const rows = shown;
  const height = rows.length * lineHeight + 6 + (hiddenCount > 0 ? lineHeight : 0);

  const minX = cell.x + inset;
  const maxX = cell.x + cell.w - inset - width;
  const minY = cell.y + inset;
  const maxY = cell.y + cell.h - inset - height;
  if (maxX < minX || maxY < minY) return null;

  const midY = clamp(cell.y + (cell.h - height) * 0.5, minY, maxY);
  const midX = clamp(cell.x + (cell.w - width) * 0.5, minX, maxX);
  const candidates: Array<{ x: number; y: number }> = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: minX, y: maxY },
    { x: maxX, y: maxY },
    { x: minX, y: midY },
    { x: maxX, y: midY },
    { x: midX, y: minY },
    { x: midX, y: maxY },
  ];

  let best: { x: number; y: number; score: number } | null = null;
  for (let idx = 0; idx < candidates.length; idx += 1) {
    const c = candidates[idx];
    const box: LabelBox = {
      minX: c.x,
      minY: c.y,
      maxX: c.x + width,
      maxY: c.y + height,
    };
    const labelPenalty = renderedLabelBoxes.reduce((sum, b) => sum + overlapArea(expandBox(box, 2.2), expandBox(b, 2.2)) * 700, 0);
    const avoidPenalty = avoidBoxes.reduce((sum, b) => sum + overlapArea(box, b) * 120, 0);
    const segPenalty = blockedSegments.reduce((sum, seg) => {
      const d = segmentToBoxDistance(seg, box);
      if (d <= 0.1) return sum + 80;
      if (d < 2.8) return sum + (2.8 - d) * 22;
      return sum;
    }, 0);
    const edgePref = idx < 4 ? 0 : 4;
    const score = labelPenalty + avoidPenalty + segPenalty + edgePref;
    if (!best || score < best.score) {
      best = { x: c.x, y: c.y, score };
    }
  }

  if (!best) return null;
  return {
    x: best.x,
    y: best.y,
    w: width,
    h: height,
    fontSize,
    lineHeight,
    rows,
    hiddenCount,
  };
}

export function layoutDimensionLabels(
  plans: DimensionLabelPlan[],
  cell: CellRect,
  blockedSegments: Segment2[],
  avoidBoxes: LabelBox[] = [],
): DimensionLabelLayout {
  const placed: PlacedLabel[] = [];
  const unresolved: DimensionLabelPlan[] = [];
  const order = plans
    .map((plan, idx) => ({ plan, idx }))
    .sort((a, b) => {
      const aw = a.plan.textHalfW * 2;
      const bw = b.plan.textHalfW * 2;
      if (bw !== aw) return bw - aw;
      return a.idx - b.idx;
    });

  for (const entry of order) {
    const plan = entry.plan;
    let bestPos: Vec2 | null = null;
    let bestBox: LabelBox | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    const tested = plan.candidates.length > 0 ? plan.candidates : [plan.preferred];
    tested.forEach((candidate, ci) => {
      const pos = clampLabelCenter(candidate, plan.textHalfW, plan.textHalfH, cell);
      const box = makeLabelBox(pos, plan.textHalfW, plan.textHalfH);
      if (hasHardLabelConflict(plan.ownLineSegments, box, placed, blockedSegments, avoidBoxes)) return;

      const linePenalty = blockedSegments.reduce((sum, seg) => {
        if (plan.ownLineSegments.includes(seg)) return sum;
        const dist = segmentToBoxDistance(seg, box);
        if (dist < 3) return sum + (3 - dist) * 18;
        return sum;
      }, 0);
      const distFromPreferred = Math.hypot(pos[0] - plan.preferred[0], pos[1] - plan.preferred[1]);
      const axisBias = Math.abs((pos[0] - plan.preferred[0]) * plan.tangent[0] + (pos[1] - plan.preferred[1]) * plan.tangent[1]);
      const leaderEnd = closestPointOnBox(box, plan.anchor);
      const leaderLen = Math.hypot(leaderEnd[0] - plan.anchor[0], leaderEnd[1] - plan.anchor[1]);
      const leaderPenalty = blockedSegments.reduce((sum, seg) => {
        if (plan.ownLineSegments.includes(seg)) return sum;
        if (segmentsIntersect2(plan.anchor, leaderEnd, seg.a, seg.b)) return sum + 10;
        return sum;
      }, 0);
      const score = linePenalty + distFromPreferred * 0.9 + axisBias * 0.7 + leaderLen * 0.1 + leaderPenalty + ci * 0.03;
      if (score < bestScore) {
        bestScore = score;
        bestPos = pos;
        bestBox = box;
      }
    });

    if (bestPos && bestBox) {
      placed.push({ plan, pos: bestPos, box: bestBox, text: plan.label, fallback: false });
    } else {
      unresolved.push(plan);
    }
  }

  unresolved.forEach((plan) => {
    const fallbackCandidates = buildFallbackCandidates(plan, cell);
    let bestPos: Vec2 | null = null;
    let bestBox: LabelBox | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const textW = estimateTextWidth(plan.label, plan.fontSize);
    const textHalfW = Math.max(8, textW * 0.5 + 2);
    const textHalfH = plan.textHalfH;

    fallbackCandidates.forEach((candidate, ci) => {
      const pos = clampLabelCenter(candidate, textHalfW, textHalfH, cell);
      const box = makeLabelBox(pos, textHalfW, textHalfH);
      if (hasHardLabelConflict(plan.ownLineSegments, box, placed, blockedSegments, avoidBoxes)) return;
      const leaderEnd = closestPointOnBox(box, plan.anchor);
      const leaderLen = Math.hypot(leaderEnd[0] - plan.anchor[0], leaderEnd[1] - plan.anchor[1]);
      const leaderPenalty = blockedSegments.reduce(
        (sum, seg) => (plan.ownLineSegments.includes(seg) ? sum : segmentsIntersect2(plan.anchor, leaderEnd, seg.a, seg.b) ? sum + 5 : sum),
        0,
      );
      const score = leaderLen * 0.35 + leaderPenalty * 6 + ci * 0.1;
      if (score < bestScore) {
        bestScore = score;
        bestPos = pos;
        bestBox = box;
      }
    });

    if (!bestPos || !bestBox) {
      const fallbackPos = clampLabelCenter([cell.x + cell.w - 8 - textHalfW, cell.y + cell.h - 8 - textHalfH], textHalfW, textHalfH, cell);
      const fallbackBox = makeLabelBox(fallbackPos, textHalfW, textHalfH);
      placed.push({ plan, pos: fallbackPos, box: fallbackBox, text: plan.label, fallback: true });
    } else {
      placed.push({ plan, pos: bestPos, box: bestBox, text: plan.label, fallback: true });
    }
  });

  const legend: LabelLegendEntry[] = [];
  const denseMode = unresolved.length > Math.max(2, Math.floor(plans.length * 0.25)) || plans.length >= 10;
  const shouldIndex = denseMode || placed.some((p) => p.fallback);

  if (shouldIndex) {
    const indexed = [...placed].sort(
      (lhs, rhs) =>
        rhs.plan.anchor[1] - lhs.plan.anchor[1] || lhs.plan.anchor[0] - rhs.plan.anchor[0] || lhs.plan.dimId.localeCompare(rhs.plan.dimId),
    );
    let counter = 1;
    indexed.forEach((p) => {
      if (!denseMode && !p.fallback) return;
      p.text = `[${counter}]`;
      legend.push({
        index: counter,
        text: p.plan.label,
        color: p.plan.color,
      });
      counter += 1;
    });
  }

  return { placements: placed, legend };
}

export function drawDimension(
  dim: DimensionDef,
  frame: ViewFrame,
  mapPoint: (p: Vec2) => Vec2,
  mapScale: number,
  color: ColorRgb,
  cell: CellRect,
  fromProjected: Vec2,
  toProjected: Vec2,
  placementBounds: Bounds2 | null,
  placementCenter: Vec2,
  autoLaneNudgeModel = 0,
): DrawDimensionResult {
  const from = fromProjected;
  const to = toProjected;

  const dx = toProjected[0] - fromProjected[0];
  const dy = toProjected[1] - fromProjected[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-8) return { graphicsCmd: '', labelPlan: null, lineSegments: [] };

  const modelDirRaw = sub3(dim.to, dim.from);
  const modelLen = Math.hypot(modelDirRaw[0], modelDirRaw[1], modelDirRaw[2]);
  if (modelLen < 1e-9) return { graphicsCmd: '', labelPlan: null, lineSegments: [] };
  const modelDir: Vec3 = [modelDirRaw[0] / modelLen, modelDirRaw[1] / modelLen, modelDirRaw[2] / modelLen];
  const offsetBasis = pickDimensionOffsetBasis(modelDir, frame);

  const _ux = dx / len;
  const _uy = dy / len;
  const isIsoView = frame.id === 'iso';

  const requestedOffset = Number.isFinite(dim.offset) ? dim.offset : 0;
  const requestedSign = requestedOffset < 0 ? -1 : 1;
  const projectedModelScale = Math.max(1e-6, mapScale * offsetBasis.projLen);
  const minReadableOffset = MIN_DIM_OFFSET_PX / projectedModelScale;
  const autoLaneOffsetModel = Math.max(0, autoLaneNudgeModel / Math.max(1e-6, offsetBasis.projLen));
  const baseOffsetAbs = Math.max(Math.abs(requestedOffset), minReadableOffset) + autoLaneOffsetModel;
  const boundsForPlacement = placementBounds ? expandBounds2(placementBounds, DIM_CLEARANCE_PX / Math.max(1e-6, mapScale)) : null;
  const placementSpan = boundsForPlacement
    ? Math.max(1e-6, Math.max(boundsForPlacement.maxX - boundsForPlacement.minX, boundsForPlacement.maxY - boundsForPlacement.minY))
    : 1;
  const midProjected: Vec2 = [(fromProjected[0] + toProjected[0]) * 0.5, (fromProjected[1] + toProjected[1]) * 0.5];
  const centerPref =
    (midProjected[0] - placementCenter[0]) * offsetBasis.projDir[0] + (midProjected[1] - placementCenter[1]) * offsetBasis.projDir[1];
  const centerSign = Math.abs(centerPref) > 1e-6 ? (centerPref >= 0 ? 1 : -1) : 0;
  const candidateSides = Array.from(new Set([centerSign || requestedSign, requestedSign, -(centerSign || requestedSign)]));
  const stepOffset = Math.max(
    minReadableOffset * (isIsoView ? 0.55 : 0.8),
    (placementSpan * (isIsoView ? 0.008 : 0.015)) / Math.max(1e-6, offsetBasis.projLen),
  );
  const maxBoostSteps = isIsoView ? 5 : 12;
  const maxOffsetAbs = baseOffsetAbs + (isIsoView ? 14 : 28) / projectedModelScale;
  const fullSegmentClear = !isIsoView;

  const solveForSide = (side: number): { side: number; offsetAbs: number; intersects: boolean; outwardScore: number } => {
    let offsetAbs = baseOffsetAbs;
    let intersects = false;
    for (let i = 0; i < maxBoostSteps; i += 1) {
      const shift: Vec2 = [offsetBasis.proj[0] * side * offsetAbs, offsetBasis.proj[1] * side * offsetAbs];
      const a1: Vec2 = [from[0] + shift[0], from[1] + shift[1]];
      const b1: Vec2 = [to[0] + shift[0], to[1] + shift[1]];
      const shiftedMid: Vec2 = [midProjected[0] + shift[0], midProjected[1] + shift[1]];
      intersects = boundsForPlacement
        ? fullSegmentClear
          ? segmentIntersectsBounds2(a1, b1, boundsForPlacement)
          : pointInBounds2(shiftedMid, boundsForPlacement)
        : false;
      if (!intersects) break;
      const nextOffset = Math.min(maxOffsetAbs, offsetAbs + stepOffset);
      if (nextOffset <= offsetAbs + 1e-6) break;
      offsetAbs = nextOffset;
    }

    const shift: Vec2 = [offsetBasis.proj[0] * side * offsetAbs, offsetBasis.proj[1] * side * offsetAbs];
    const shiftedMid: Vec2 = [midProjected[0] + shift[0], midProjected[1] + shift[1]];
    const outwardDir: Vec2 = [offsetBasis.projDir[0] * side, offsetBasis.projDir[1] * side];
    const outwardScore = (shiftedMid[0] - placementCenter[0]) * outwardDir[0] + (shiftedMid[1] - placementCenter[1]) * outwardDir[1];
    return { side, offsetAbs, intersects, outwardScore };
  };

  const solved = candidateSides
    .map((side) => solveForSide(side))
    .map((entry) => {
      const inwardPenalty = entry.outwardScore < 0 ? (-entry.outwardScore / placementSpan) * 1800 : 0;
      const growthPenalty = (((entry.offsetAbs - baseOffsetAbs) * offsetBasis.projLen) / placementSpan) * 140;
      const signPenalty = entry.side === requestedSign ? 0 : 8;
      const intersectPenalty = entry.intersects ? 250000 : 0;
      return { ...entry, score: inwardPenalty + growthPenalty + signPenalty + intersectPenalty };
    })
    .sort((a, b) => a.score - b.score);

  const winner = solved[0];
  const offset = (winner?.side ?? requestedSign) * (winner?.offsetAbs ?? baseOffsetAbs);
  const winShift: Vec2 = [offsetBasis.proj[0] * offset, offsetBasis.proj[1] * offset];

  const a0: Vec2 = from;
  const b0: Vec2 = to;
  const a1: Vec2 = [from[0] + winShift[0], from[1] + winShift[1]];
  const b1: Vec2 = [to[0] + winShift[0], to[1] + winShift[1]];

  const pa0 = mapPoint(a0);
  const pb0 = mapPoint(b0);
  const pa1 = mapPoint(a1);
  const pb1 = mapPoint(b1);

  const arrowSize = clamp(len * mapScale * 0.045, 3, 7.5);
  const extGap = clamp(Math.abs(offset) * projectedModelScale * 0.1, 0.8, 2.5);
  const dmm = distance3(dim.from, dim.to);
  const baseLabel = dim.label ? `${dim.label}: ${formatLength(dmm, _reportLengthUnit, 1)}` : formatLength(dmm, _reportLengthUnit, 1);

  const cmd: string[] = [];
  cmd.push(commandSetStroke(color));
  cmd.push(commandSetFill(color));
  cmd.push('0.8 w\n');

  const extAFrom: Vec2 = [
    pa0[0] + (pa1[0] - pa0[0]) * (extGap / Math.max(1e-6, Math.hypot(pa1[0] - pa0[0], pa1[1] - pa0[1]))),
    pa0[1] + (pa1[1] - pa0[1]) * (extGap / Math.max(1e-6, Math.hypot(pa1[0] - pa0[0], pa1[1] - pa0[1]))),
  ];
  const extBFrom: Vec2 = [
    pb0[0] + (pb1[0] - pb0[0]) * (extGap / Math.max(1e-6, Math.hypot(pb1[0] - pb0[0], pb1[1] - pb0[1]))),
    pb0[1] + (pb1[1] - pb0[1]) * (extGap / Math.max(1e-6, Math.hypot(pb1[0] - pb0[0], pb1[1] - pb0[1]))),
  ];
  const lineSegments: Segment2[] = [
    { a: extAFrom, b: pa1 },
    { a: extBFrom, b: pb1 },
    { a: pa1, b: pb1 },
  ];

  cmd.push(commandLine(extAFrom, pa1));
  cmd.push(commandLine(extBFrom, pb1));
  cmd.push(commandLine(pa1, pb1));

  const uxS = (pb1[0] - pa1[0]) / Math.max(1e-6, Math.hypot(pb1[0] - pa1[0], pb1[1] - pa1[1]));
  const uyS = (pb1[1] - pa1[1]) / Math.max(1e-6, Math.hypot(pb1[0] - pa1[0], pb1[1] - pa1[1]));
  const pxS = -uyS;
  const pyS = uxS;

  const leftA: Vec2 = [pa1[0] + uxS * arrowSize + pxS * arrowSize * 0.45, pa1[1] + uyS * arrowSize + pyS * arrowSize * 0.45];
  const rightA: Vec2 = [pa1[0] + uxS * arrowSize - pxS * arrowSize * 0.45, pa1[1] + uyS * arrowSize - pyS * arrowSize * 0.45];
  const leftB: Vec2 = [pb1[0] - uxS * arrowSize + pxS * arrowSize * 0.45, pb1[1] - uyS * arrowSize + pyS * arrowSize * 0.45];
  const rightB: Vec2 = [pb1[0] - uxS * arrowSize - pxS * arrowSize * 0.45, pb1[1] - uyS * arrowSize - pyS * arrowSize * 0.45];

  cmd.push(commandTriangleFill(pa1, leftA, rightA));
  cmd.push(commandTriangleFill(pb1, leftB, rightB));

  const mid: Vec2 = [(pa1[0] + pb1[0]) * 0.5, (pa1[1] + pb1[1]) * 0.5];
  let fontSize = 8;
  const maxLabelWidth = Math.max(28, cell.w - 12);
  const maxLabelHeight = Math.max(7, cell.h - 12);
  let label = baseLabel;
  let textWidth = estimateTextWidth(label, fontSize);
  if (textWidth > maxLabelWidth) {
    fontSize = Math.max(5, fontSize * (maxLabelWidth / textWidth));
    textWidth = estimateTextWidth(label, fontSize);
  }
  if (fontSize > maxLabelHeight) {
    fontSize = maxLabelHeight;
    textWidth = estimateTextWidth(label, fontSize);
  }
  if (textWidth > maxLabelWidth) {
    const maxChars = Math.max(4, Math.floor(maxLabelWidth / Math.max(1, fontSize * 0.52)) - 1);
    if (label.length > maxChars) label = `${label.slice(0, Math.max(1, maxChars - 1))}…`;
    textWidth = estimateTextWidth(label, fontSize);
  }
  const textHalfW = Math.max(8, textWidth * 0.5 + 2);
  const textHalfH = Math.max(3.5, fontSize * 0.62);
  const base = 6;
  const lineLenPx = Math.hypot(pb1[0] - pa1[0], pb1[1] - pa1[1]);
  const tangentMax = isIsoView ? clamp(lineLenPx * 0.2, 16, 38) : clamp(lineLenPx * 0.32, 20, 72);
  const tangentMid = Math.max(isIsoView ? 12 : 16, tangentMax * 0.55);
  const normalSteps = isIsoView ? [0, 5, 10, 16, 22] : [0, 6, 12, 18, 26, 34];
  const tangentSteps = isIsoView
    ? [0, -8, 8, -14, 14, -tangentMid, tangentMid, -tangentMax, tangentMax]
    : [0, -10, 10, -18, 18, -28, 28, -tangentMid, tangentMid, -tangentMax, tangentMax];

  const candidates: Vec2[] = [];
  [1, -1].forEach((side) => {
    normalSteps.forEach((n) => {
      tangentSteps.forEach((t) => {
        candidates.push([mid[0] + pxS * side * (base + n) + uxS * t, mid[1] + pyS * side * (base + n) + uyS * t]);
      });
    });
  });

  const preferred: Vec2 = [mid[0] + pxS * base, mid[1] + pyS * base];

  return {
    graphicsCmd: cmd.join(''),
    labelPlan: {
      dimId: dim.id,
      label,
      color,
      fontSize,
      leaderMinLength: isIsoView ? 14 : 10,
      preferred,
      anchor: mid,
      tangent: [uxS, uyS],
      textHalfW,
      textHalfH,
      candidates,
      ownLineSegments: lineSegments,
    },
    lineSegments,
  };
}
