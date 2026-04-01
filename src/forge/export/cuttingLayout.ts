/**
 * Sheet Cutting Layout — guillotine bin packing + PDF export.
 *
 * Packs rectangular pieces onto stock sheets using a greedy guillotine
 * algorithm (largest-area-first, best-short-side-fit heuristic).
 * Pieces may be rotated 90 degrees. Supports cutting clearance (kerf).
 *
 * Produces a PDF with one page per sheet showing the cutting pattern
 * with ruler marks and piece legend, followed by a summary page.
 */

import {
  type ColorRgb,
  commandLine,
  commandRect,
  commandSetFill,
  commandSetStroke,
  commandText,
  estimateTextWidth,
  formatNumber,
  PAGE_HEIGHT,
  PAGE_MARGIN,
  PAGE_WIDTH,
  PdfBuilder,
  truncateToWidth,
} from './pdfUtils';
import type { SheetStockDef } from './sheetStock';

// ── Types ──────────────────────────────────────────────────────

interface ExpandedPiece {
  index: number;
  description: string;
  material: string;
  width: number;
  height: number;
}

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PackedPiece {
  description: string;
  material: string;
  /** Width as placed (may differ from original if rotated). */
  width: number;
  /** Height as placed. */
  height: number;
  /** Original width before placement. */
  origWidth: number;
  /** Original height before placement. */
  origHeight: number;
  x: number;
  y: number;
  rotated: boolean;
}

export interface PackedSheet {
  sheetIndex: number;
  material: string;
  pieces: PackedPiece[];
  sheetWidth: number;
  sheetHeight: number;
  usedArea: number;
  /** Ordered guillotine cuts to separate all pieces on this sheet. */
  cuts: GuillotineCut[];
}

/** A single end-to-end guillotine cut on a sheet. */
export interface GuillotineCut {
  /** 1-based sequence number. */
  step: number;
  /** 'V' = vertical cut (splits left/right), 'H' = horizontal cut (splits top/bottom). */
  direction: 'V' | 'H';
  /** Cut line start X (mm from sheet origin). */
  x1: number;
  /** Cut line start Y (mm from sheet origin). */
  y1: number;
  /** Cut line end X (mm from sheet origin). */
  x2: number;
  /** Cut line end Y (mm from sheet origin). */
  y2: number;
  /** Cut length in mm. */
  lengthMm: number;
}

export interface CuttingLayoutResult {
  sheets: PackedSheet[];
  totalPieces: number;
  totalSheets: number;
  totalUsedArea: number;
  totalSheetArea: number;
  wastePercent: number;
  kerf: number;
  /** Total length of all cuts across all sheets (mm). */
  totalCutLength: number;
}

export interface CuttingLayoutPdfResult {
  pdf: Uint8Array<ArrayBuffer>;
  pageCount: number;
  layout: CuttingLayoutResult;
}

// ── Piece colors (rotating palette) ────────────────────────────

const PIECE_FILL_COLORS: ColorRgb[] = [
  [0.85, 0.92, 0.98], // light blue
  [0.88, 0.95, 0.88], // light green
  [0.98, 0.92, 0.82], // light amber
  [0.93, 0.87, 0.96], // light violet
  [0.98, 0.88, 0.88], // light red
  [0.85, 0.96, 0.94], // light teal
  [0.96, 0.9, 0.82], // light orange
  [0.9, 0.9, 0.96], // light indigo
];

const PIECE_STROKE_COLORS: ColorRgb[] = [
  [0.3, 0.55, 0.78],
  [0.3, 0.65, 0.35],
  [0.78, 0.6, 0.25],
  [0.58, 0.38, 0.72],
  [0.78, 0.35, 0.35],
  [0.25, 0.65, 0.58],
  [0.72, 0.5, 0.25],
  [0.45, 0.45, 0.72],
];

// ── Guillotine bin packing ─────────────────────────────────────

function expandPieces(entries: SheetStockDef[]): ExpandedPiece[] {
  const out: ExpandedPiece[] = [];
  let index = 0;
  for (const entry of entries) {
    const qty = Math.max(1, Math.round(entry.quantity));
    for (let i = 0; i < qty; i++) {
      out.push({
        index: index++,
        description: entry.description,
        material: entry.material,
        width: entry.width,
        height: entry.height,
      });
    }
  }
  return out;
}

function groupByMaterial(pieces: ExpandedPiece[]): Map<string, ExpandedPiece[]> {
  const groups = new Map<string, ExpandedPiece[]>();
  for (const p of pieces) {
    let group = groups.get(p.material);
    if (!group) {
      group = [];
      groups.set(p.material, group);
    }
    group.push(p);
  }
  return groups;
}

/**
 * Guillotine bin packing for a single material group.
 * Sorts by area descending, uses best-short-side-fit heuristic.
 * Each piece slot is inflated by `kerf` on right and bottom to account
 * for saw blade material removal.
 */
function packMaterialGroup(pieces: ExpandedPiece[], sheetW: number, sheetH: number, material: string, kerf: number): PackedSheet[] {
  // Sort largest-area-first
  const sorted = [...pieces].sort((a, b) => b.width * b.height - a.width * a.height);

  const sheets: PackedSheet[] = [];
  const sheetFreeRects: FreeRect[][] = [];

  function createSheet(): number {
    const idx = sheets.length;
    sheets.push({
      sheetIndex: idx,
      material,
      pieces: [],
      sheetWidth: sheetW,
      sheetHeight: sheetH,
      usedArea: 0,
      cuts: [],
    });
    sheetFreeRects.push([{ x: 0, y: 0, w: sheetW, h: sheetH }]);
    return idx;
  }

  for (const piece of sorted) {
    // Effective dimensions include kerf clearance
    const effW = piece.width + kerf;
    const effH = piece.height + kerf;
    let bestScore = Infinity;
    let bestSheetIdx = -1;
    let bestRectIdx = -1;
    let bestRotated = false;

    // Try to fit in existing sheets
    for (let si = 0; si < sheets.length; si++) {
      const freeRects = sheetFreeRects[si];
      for (let ri = 0; ri < freeRects.length; ri++) {
        const rect = freeRects[ri];

        // Try original orientation
        if (effW <= rect.w && effH <= rect.h) {
          const shortSide = Math.min(rect.w - effW, rect.h - effH);
          if (shortSide < bestScore) {
            bestScore = shortSide;
            bestSheetIdx = si;
            bestRectIdx = ri;
            bestRotated = false;
          }
        }

        // Try rotated 90°
        if (effH <= rect.w && effW <= rect.h) {
          const shortSide = Math.min(rect.w - effH, rect.h - effW);
          if (shortSide < bestScore) {
            bestScore = shortSide;
            bestSheetIdx = si;
            bestRectIdx = ri;
            bestRotated = true;
          }
        }
      }
    }

    // No fit — create new sheet
    if (bestSheetIdx === -1) {
      bestSheetIdx = createSheet();
      bestRectIdx = 0;
      bestRotated = false;

      // Check if it fits at all (try rotated too)
      if (effW > sheetW || effH > sheetH) {
        if (effH <= sheetW && effW <= sheetH) {
          bestRotated = true;
        }
        // If still doesn't fit, place it anyway — the PDF will show it overflowing
      }
    }

    const freeRects = sheetFreeRects[bestSheetIdx];
    const rect = freeRects[bestRectIdx];
    const pw = bestRotated ? piece.height : piece.width;
    const ph = bestRotated ? piece.width : piece.height;
    // Slot includes kerf clearance on right and bottom
    const slotW = pw + kerf;
    const slotH = ph + kerf;

    // Place piece
    sheets[bestSheetIdx].pieces.push({
      description: piece.description,
      material: piece.material,
      width: pw,
      height: ph,
      origWidth: piece.width,
      origHeight: piece.height,
      x: rect.x,
      y: rect.y,
      rotated: bestRotated,
    });
    sheets[bestSheetIdx].usedArea += pw * ph;

    // Guillotine split: choose axis that maximizes larger remainder area
    const rightFullH: FreeRect = { x: rect.x + slotW, y: rect.y, w: rect.w - slotW, h: rect.h };
    const topPartW: FreeRect = { x: rect.x, y: rect.y + slotH, w: slotW, h: rect.h - slotH };

    const rightPartH: FreeRect = { x: rect.x + slotW, y: rect.y, w: rect.w - slotW, h: slotH };
    const topFullW: FreeRect = { x: rect.x, y: rect.y + slotH, w: rect.w, h: rect.h - slotH };

    // Remove used rect
    freeRects.splice(bestRectIdx, 1);

    // Choose split: maximize area of larger remainder
    const splitA = Math.max(rightFullH.w * rightFullH.h, topPartW.w * topPartW.h);
    const splitB = Math.max(rightPartH.w * rightPartH.h, topFullW.w * topFullW.h);

    if (splitA >= splitB) {
      if (rightFullH.w > 0 && rightFullH.h > 0) freeRects.push(rightFullH);
      if (topPartW.w > 0 && topPartW.h > 0) freeRects.push(topPartW);
    } else {
      if (rightPartH.w > 0 && rightPartH.h > 0) freeRects.push(rightPartH);
      if (topFullW.w > 0 && topFullW.h > 0) freeRects.push(topFullW);
    }
  }

  // Compute depth-first cut sequence from placed pieces
  for (const sheet of sheets) {
    sheet.cuts = computeSheetCutSequence(sheet);
  }

  return sheets;
}

// ── Depth-first cut sequence from placed pieces ─────────────────

/**
 * Reconstruct the guillotine cut sequence from placed piece positions.
 * Uses recursive decomposition: at each level, find a valid edge-to-edge
 * cut that divides the pieces into two groups, then recurse depth-first
 * (smaller group first for a natural "peel off" ordering).
 */
function computeSheetCutSequence(sheet: PackedSheet): GuillotineCut[] {
  const result: Omit<GuillotineCut, 'step'>[] = [];

  function decompose(rx: number, ry: number, rw: number, rh: number, pieces: PackedPiece[]): void {
    if (pieces.length <= 1) return; // 0-1 pieces need no cuts

    // Collect candidate cut positions from piece boundaries within the region
    const EPS = 0.01;
    const bestCut = findBestCut(rx, ry, rw, rh, pieces, EPS);
    if (!bestCut) return; // shouldn't happen for guillotine-packed pieces

    const { axis, pos, groupA, groupB } = bestCut;

    if (axis === 'V') {
      // Vertical cut at x = pos, spanning full region height
      result.push({ direction: 'V', x1: pos, y1: ry, x2: pos, y2: ry + rh, lengthMm: rh });
      // Depth-first: smaller group first (the side with fewer pieces)
      const leftPieces = groupA;
      const rightPieces = groupB;
      if (leftPieces.length <= rightPieces.length) {
        decompose(rx, ry, pos - rx, rh, leftPieces);
        decompose(pos, ry, rx + rw - pos, rh, rightPieces);
      } else {
        decompose(pos, ry, rx + rw - pos, rh, rightPieces);
        decompose(rx, ry, pos - rx, rh, leftPieces);
      }
    } else {
      // Horizontal cut at y = pos, spanning full region width
      result.push({ direction: 'H', x1: rx, y1: pos, x2: rx + rw, y2: pos, lengthMm: rw });
      const topPieces = groupA;
      const bottomPieces = groupB;
      if (topPieces.length <= bottomPieces.length) {
        decompose(rx, ry, rw, pos - ry, topPieces);
        decompose(rx, pos, rw, ry + rh - pos, bottomPieces);
      } else {
        decompose(rx, pos, rw, ry + rh - pos, bottomPieces);
        decompose(rx, ry, rw, pos - ry, topPieces);
      }
    }
  }

  decompose(0, 0, sheet.sheetWidth, sheet.sheetHeight, sheet.pieces);
  return result.map((c, i) => ({ ...c, step: i + 1 }));
}

/**
 * Find the best guillotine cut within a region. Tries all piece-boundary
 * positions on both axes. A valid cut must not intersect any piece interior.
 * Prefers shorter cuts (less material to cut through).
 */
function findBestCut(
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  pieces: PackedPiece[],
  eps: number,
): { axis: 'V' | 'H'; pos: number; groupA: PackedPiece[]; groupB: PackedPiece[] } | null {
  let best: { axis: 'V' | 'H'; pos: number; groupA: PackedPiece[]; groupB: PackedPiece[]; length: number } | null = null;

  // Collect candidate X positions (piece left and right edges)
  const xCandidates = new Set<number>();
  const yCandidates = new Set<number>();
  for (const p of pieces) {
    if (p.x > rx + eps) xCandidates.add(p.x);
    const pr = p.x + p.width;
    if (pr < rx + rw - eps) xCandidates.add(pr);
    if (p.y > ry + eps) yCandidates.add(p.y);
    const pb = p.y + p.height;
    if (pb < ry + rh - eps) yCandidates.add(pb);
  }

  // Try vertical cuts
  for (const xPos of xCandidates) {
    // Check no piece straddles this x position
    let valid = true;
    const left: PackedPiece[] = [];
    const right: PackedPiece[] = [];
    for (const p of pieces) {
      const pLeft = p.x;
      const pRight = p.x + p.width;
      if (pLeft < xPos - eps && pRight > xPos + eps) {
        valid = false;
        break;
      }
      if (pRight <= xPos + eps) left.push(p);
      else right.push(p);
    }
    if (valid && left.length > 0 && right.length > 0) {
      const length = rh; // vertical cut spans full region height
      if (!best || length < best.length) {
        best = { axis: 'V', pos: xPos, groupA: left, groupB: right, length };
      }
    }
  }

  // Try horizontal cuts
  for (const yPos of yCandidates) {
    let valid = true;
    const top: PackedPiece[] = [];
    const bottom: PackedPiece[] = [];
    for (const p of pieces) {
      const pTop = p.y;
      const pBottom = p.y + p.height;
      if (pTop < yPos - eps && pBottom > yPos + eps) {
        valid = false;
        break;
      }
      if (pBottom <= yPos + eps) top.push(p);
      else bottom.push(p);
    }
    if (valid && top.length > 0 && bottom.length > 0) {
      const length = rw; // horizontal cut spans full region width
      if (!best || length < best.length) {
        best = { axis: 'H', pos: yPos, groupA: top, groupB: bottom, length };
      }
    }
  }

  return best;
}

export function computeCuttingLayout(
  entries: SheetStockDef[],
  sheetWidth: number,
  sheetHeight: number,
  kerf: number = 0,
): CuttingLayoutResult {
  const expanded = expandPieces(entries);
  const groups = groupByMaterial(expanded);

  const allSheets: PackedSheet[] = [];
  for (const [material, pieces] of groups) {
    const sheets = packMaterialGroup(pieces, sheetWidth, sheetHeight, material, kerf);
    allSheets.push(...sheets);
  }

  // Re-index sheets
  allSheets.forEach((s, i) => {
    s.sheetIndex = i;
  });

  const totalUsedArea = allSheets.reduce((sum, s) => sum + s.usedArea, 0);
  const totalSheetArea = allSheets.length * sheetWidth * sheetHeight;
  const totalCutLength = allSheets.reduce((sum, s) => sum + s.cuts.reduce((cs, c) => cs + c.lengthMm, 0), 0);

  return {
    sheets: allSheets,
    totalPieces: expanded.length,
    totalSheets: allSheets.length,
    totalUsedArea,
    totalSheetArea,
    wastePercent: totalSheetArea > 0 ? ((totalSheetArea - totalUsedArea) / totalSheetArea) * 100 : 0,
    kerf,
    totalCutLength,
  };
}

// ── CLI text output ─────────────────────────────────────────────

/**
 * Format the cut sequence for all sheets as a human-readable text table.
 * Suitable for CLI output.
 */
export function formatCutSequence(layout: CuttingLayoutResult): string {
  const lines: string[] = [];

  for (const sheet of layout.sheets) {
    lines.push(
      `\n  Sheet ${sheet.sheetIndex + 1} — ${sheet.material} (${sheet.sheetWidth} x ${sheet.sheetHeight} mm, ${sheet.pieces.length} pieces)`,
    );

    if (sheet.cuts.length === 0) {
      lines.push('    (no cuts needed — single piece fills sheet)');
      continue;
    }

    // Header
    lines.push('    Step  Dir  From               To                 Length');
    lines.push('    ────  ───  ─────────────────  ─────────────────  ──────');

    for (const cut of sheet.cuts) {
      const dir = cut.direction === 'V' ? 'V  ' : 'H  ';
      const from = `(${fmt(cut.x1)}, ${fmt(cut.y1)})`.padEnd(17);
      const to = `(${fmt(cut.x2)}, ${fmt(cut.y2)})`.padEnd(17);
      const len = `${fmt(cut.lengthMm)} mm`;
      lines.push(`    ${String(cut.step).padStart(4)}  ${dir}  ${from}  ${to}  ${len}`);
    }

    const sheetCutLen = sheet.cuts.reduce((s, c) => s + c.lengthMm, 0);
    lines.push(`    Total: ${fmt(sheetCutLen)} mm in ${sheet.cuts.length} cuts`);
  }

  lines.push(`\n  All sheets: ${fmt(layout.totalCutLength)} mm total cut length`);
  return lines.join('\n');
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// ── PDF generation ─────────────────────────────────────────────

/** Color gradient for cut step labels: blue (early) → red (late). */
function cutStepColor(t: number): ColorRgb {
  // Blue → teal → red
  const r = Math.min(1, t * 2);
  const g = t < 0.5 ? t * 1.2 : (1 - t) * 1.2;
  const b = Math.max(0, 1 - t * 2);
  return [r * 0.7 + 0.1, g * 0.5 + 0.1, b * 0.7 + 0.1];
}

/** Emit a PDF circle path (4 Bezier arcs, not stroked/filled — caller adds operator). */
function pdfCircle(cx: number, cy: number, r: number): string {
  // Approximate circle with 4 cubic Bezier curves (kappa = 0.5522847498)
  const k = 0.5522847498 * r;
  return (
    [
      `${cx - r} ${cy} m`,
      `${cx - r} ${cy + k} ${cx - k} ${cy + r} ${cx} ${cy + r} c`,
      `${cx + k} ${cy + r} ${cx + r} ${cy + k} ${cx + r} ${cy} c`,
      `${cx + r} ${cy - k} ${cx + k} ${cy - r} ${cx} ${cy - r} c`,
      `${cx - k} ${cy - r} ${cx - r} ${cy - k} ${cx - r} ${cy} c`,
    ].join('\n') + '\n'
  );
}

const HEADER_HEIGHT = 44;
const DRAW_AREA_TOP = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT;
const DRAW_AREA_BOTTOM = PAGE_MARGIN + 16;
const DRAW_AREA_LEFT = PAGE_MARGIN;
const DRAW_AREA_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const DRAW_AREA_HEIGHT = DRAW_AREA_TOP - DRAW_AREA_BOTTOM;

// Space reserved for ruler marks outside the sheet rectangle
const RULER_BOTTOM = 24;
const RULER_LEFT = 34;

// Rendered-size thresholds (PDF points) below which a piece is "small"
const SMALL_W_THRESH = 30;
const SMALL_H_THRESH = 18;

function renderSheetPage(sheet: PackedSheet, totalSheets: number, layout: CuttingLayoutResult): string {
  const cmd: string[] = [];
  const kerf = layout.kerf;

  // ── Header ──
  const sheetArea = sheet.sheetWidth * sheet.sheetHeight;
  const wastePercent = sheetArea > 0 ? ((sheetArea - sheet.usedArea) / sheetArea) * 100 : 0;
  const title = `CUTTING LAYOUT — ${sheet.material.toUpperCase()}`;
  const sheetCutLen = sheet.cuts.reduce((s, c) => s + c.lengthMm, 0);
  let subtitle = `Sheet ${sheet.sheetIndex + 1} of ${totalSheets} | ${sheet.sheetWidth} x ${sheet.sheetHeight} mm | ${sheet.pieces.length} pieces | ${sheet.cuts.length} cuts (${formatNumber(sheetCutLen)} mm) | ${formatNumber(wastePercent)}% waste`;
  if (kerf > 0) subtitle += ` | Kerf: ${formatNumber(kerf)} mm`;

  cmd.push(commandSetFill([0.12, 0.12, 0.14]));
  cmd.push(commandText(title, PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN + 2, 15));
  cmd.push(commandSetFill([0.4, 0.4, 0.44]));
  cmd.push(commandText(subtitle, PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN - 14, 9));

  // ── Identify small pieces (need numbered-legend treatment) ──
  // Use a preliminary scale (before reserving legend space) to classify sizes
  const prelAvailW = DRAW_AREA_WIDTH - RULER_LEFT;
  const prelAvailH = DRAW_AREA_HEIGHT - RULER_BOTTOM;
  const prelScale = Math.min(prelAvailW / sheet.sheetWidth, prelAvailH / sheet.sheetHeight);

  interface SmallEntry {
    num: number;
    piece: PackedPiece;
  }
  const smallPieces: SmallEntry[] = [];
  const pieceNum: (number | null)[] = [];
  let numCounter = 0;

  for (let i = 0; i < sheet.pieces.length; i++) {
    const p = sheet.pieces[i];
    if (p.width * prelScale < SMALL_W_THRESH || p.height * prelScale < SMALL_H_THRESH) {
      numCounter++;
      pieceNum.push(numCounter);
      smallPieces.push({ num: numCounter, piece: p });
    } else {
      pieceNum.push(null);
    }
  }

  // Reserve space for legend at the bottom
  const LEGEND_ROW_H = 10;
  const LEGEND_COLS = 2;
  const legendRows = Math.ceil(smallPieces.length / LEGEND_COLS);
  const legendH = smallPieces.length > 0 ? 14 + legendRows * LEGEND_ROW_H + 4 : 0;

  // ── Final scale and positioning ──
  const finalAvailH = DRAW_AREA_HEIGHT - RULER_BOTTOM - legendH;
  const scaleX = prelAvailW / sheet.sheetWidth;
  const scaleY = finalAvailH / sheet.sheetHeight;
  const scale = Math.min(scaleX, scaleY);

  const drawW = sheet.sheetWidth * scale;
  const drawH = sheet.sheetHeight * scale;

  // Sheet left-edge leaves room for y-ruler; center horizontally in remaining space
  const sheetLeft = DRAW_AREA_LEFT + RULER_LEFT + (prelAvailW - drawW) / 2;
  const sheetBottom = DRAW_AREA_BOTTOM + legendH + RULER_BOTTOM + (finalAvailH - drawH) / 2;

  // ── Collect cut positions for ruler marks ──
  const xPositions = new Set<number>();
  const yPositions = new Set<number>();
  for (const p of sheet.pieces) {
    if (p.x > 0.5) xPositions.add(p.x);
    const pr = p.x + p.width;
    if (pr < sheet.sheetWidth - 0.5) xPositions.add(pr);
    if (p.y > 0.5) yPositions.add(p.y);
    const pb = p.y + p.height;
    if (pb < sheet.sheetHeight - 0.5) yPositions.add(pb);
  }
  const sortedX = [...xPositions].sort((a, b) => a - b);
  const sortedY = [...yPositions].sort((a, b) => a - b);

  // ── Sheet outline ──
  cmd.push(commandSetStroke([0.4, 0.4, 0.44]));
  cmd.push('1.5 w\n');
  cmd.push(`${commandRect(sheetLeft, sheetBottom, drawW, drawH)} S\n`);

  // ── Draw pieces ──
  sheet.pieces.forEach((piece, i) => {
    const px = sheetLeft + piece.x * scale;
    // PDF y-axis is bottom-up, packing is top-down from y=0
    const py = sheetBottom + drawH - (piece.y + piece.height) * scale;
    const pw = piece.width * scale;
    const ph = piece.height * scale;

    const fillColor = PIECE_FILL_COLORS[i % PIECE_FILL_COLORS.length];
    const strokeColor = PIECE_STROKE_COLORS[i % PIECE_STROKE_COLORS.length];

    // Fill + stroke
    cmd.push(commandSetFill(fillColor));
    cmd.push(`${commandRect(px, py, pw, ph)} f\n`);
    cmd.push(commandSetStroke(strokeColor));
    cmd.push('0.8 w\n');
    cmd.push(`${commandRect(px, py, pw, ph)} S\n`);

    const num = pieceNum[i];
    if (num !== null) {
      // Small piece — show number only, details go in legend
      const fontSize = Math.max(5, Math.min(8, pw * 0.4, ph * 0.5));
      const numStr = String(num);
      const numW = estimateTextWidth(numStr, fontSize);
      cmd.push(commandSetFill([0.1, 0.1, 0.12]));
      cmd.push(commandText(numStr, px + (pw - numW) / 2, py + (ph - fontSize) / 2, fontSize));
    } else {
      // Large piece — show name + dimensions inline
      const dimLabel = piece.rotated
        ? `${formatNumber(piece.origWidth)} x ${formatNumber(piece.origHeight)} (R)`
        : `${formatNumber(piece.origWidth)} x ${formatNumber(piece.origHeight)}`;

      const labelFontSize = Math.max(5, Math.min(9, pw * 0.08, ph * 0.15));
      const dimFontSize = Math.max(4, Math.min(7, labelFontSize * 0.8));

      if (pw > 18 && ph > 12) {
        const maxLabelW = pw - 4;
        const nameText = truncateToWidth(piece.description, maxLabelW, labelFontSize);

        cmd.push(commandSetFill([0.1, 0.1, 0.12]));
        cmd.push(commandText(nameText, px + 3, py + ph - labelFontSize - 2, labelFontSize));

        if (ph > 22) {
          cmd.push(commandSetFill([0.35, 0.35, 0.4]));
          cmd.push(commandText(dimLabel, px + 3, py + ph - labelFontSize - dimFontSize - 5, dimFontSize));
        }
      }
    }
  });

  // ── Numbered cut sequence lines (drawn on top of pieces) ──
  const CUT_NUM_FONT = 7;
  const CUT_CIRCLE_R = 6;
  if (sheet.cuts.length > 0) {
    for (const cut of sheet.cuts) {
      // Convert mm coordinates to PDF coordinates
      const px1 = sheetLeft + cut.x1 * scale;
      const py1 = sheetBottom + drawH - cut.y1 * scale;
      const px2 = sheetLeft + cut.x2 * scale;
      const py2 = sheetBottom + drawH - cut.y2 * scale;

      // Cut line — dashed, colored by step order
      const hue = (cut.step - 1) / Math.max(1, sheet.cuts.length - 1); // 0..1
      const cutColor: ColorRgb = cutStepColor(hue);
      cmd.push(commandSetStroke(cutColor));
      cmd.push('[4 2] 0 d\n');
      cmd.push('0.6 w\n');
      cmd.push(commandLine([px1, py1], [px2, py2]));
      cmd.push('[] 0 d\n');

      // Step number label at midpoint of the cut line
      const mx = (px1 + px2) / 2;
      const my = (py1 + py2) / 2;
      const numStr = String(cut.step);
      const numW = estimateTextWidth(numStr, CUT_NUM_FONT);

      // White circle background for readability
      cmd.push(commandSetFill([1, 1, 1]));
      cmd.push(commandSetStroke(cutColor));
      cmd.push('0.5 w\n');
      cmd.push(pdfCircle(mx, my, CUT_CIRCLE_R));
      cmd.push('B\n'); // fill + stroke

      // Step number text
      cmd.push(commandSetFill(cutColor));
      cmd.push(commandText(numStr, mx - numW / 2, my - CUT_NUM_FONT * 0.35, CUT_NUM_FONT));
    }
  }

  // ── Ruler marks ──
  // Greedy label placement: each label is pushed to the nearest non-overlapping
  // slot so closely-spaced marks (e.g. kerf pairs) never overlap.
  const rulerFontSize = 6;
  const tickLen = 6;
  const labelH = rulerFontSize + 1; // vertical space each label occupies

  cmd.push(commandSetStroke([0.45, 0.45, 0.5]));
  cmd.push('0.5 w\n');

  // X-axis along bottom edge — labels stack downward when crowded
  {
    // Each placed label occupies [centerX - halfW, centerX + halfW] horizontally.
    // When two labels would overlap horizontally, push the later one to a lower row.
    const ROW_STEP = labelH + 1;
    const MAX_ROWS = 3;
    // Track the rightmost x extent placed at each row
    const rowRightEdge: number[] = new Array(MAX_ROWS).fill(-Infinity);

    for (let i = 0; i < sortedX.length; i++) {
      const xMm = sortedX[i];
      const xPdf = sheetLeft + xMm * scale;

      cmd.push(commandLine([xPdf, sheetBottom], [xPdf, sheetBottom - tickLen]));

      const label = formatNumber(xMm);
      const labelW = estimateTextWidth(label, rulerFontSize);
      const leftEdge = xPdf - labelW / 2;
      const rightEdge = xPdf + labelW / 2 + 3; // 3pt gap between labels

      // Find the first row where this label fits without overlap
      let row = 0;
      for (let r = 0; r < MAX_ROWS; r++) {
        if (leftEdge >= rowRightEdge[r]) {
          row = r;
          break;
        }
        row = r + 1;
      }
      if (row >= MAX_ROWS) row = MAX_ROWS - 1; // clamp

      rowRightEdge[row] = rightEdge;
      const labelY = sheetBottom - tickLen - 2 - row * ROW_STEP;

      // Leader line from tick to staggered label
      if (row > 0) {
        cmd.push(commandSetStroke([0.7, 0.7, 0.74]));
        cmd.push('0.3 w\n');
        cmd.push(commandLine([xPdf, sheetBottom - tickLen], [xPdf, labelY + labelH]));
        cmd.push(commandSetStroke([0.45, 0.45, 0.5]));
        cmd.push('0.5 w\n');
      }

      cmd.push(commandSetFill([0.3, 0.3, 0.35]));
      cmd.push(commandText(label, xPdf - labelW / 2, labelY, rulerFontSize));
    }
  }

  // Y-axis along left edge — labels push further left when crowded
  {
    const COL_STEP = 18; // horizontal offset per stagger column
    const MAX_COLS = 2;
    const rowBottomEdge: number[] = new Array(MAX_COLS).fill(Infinity);

    for (let i = 0; i < sortedY.length; i++) {
      const yMm = sortedY[i];
      const yPdf = sheetBottom + drawH - yMm * scale;

      cmd.push(commandSetStroke([0.45, 0.45, 0.5]));
      cmd.push('0.5 w\n');
      cmd.push(commandLine([sheetLeft, yPdf], [sheetLeft - tickLen, yPdf]));

      const label = formatNumber(yMm);
      const labelW = estimateTextWidth(label, rulerFontSize);
      const topEdge = yPdf + labelH / 2 + 1;
      const bottomEdge = yPdf - labelH / 2 - 1;

      // Find first column where this label doesn't overlap vertically
      let col = 0;
      for (let c = 0; c < MAX_COLS; c++) {
        if (topEdge <= rowBottomEdge[c]) {
          col = c;
          break;
        }
        col = c + 1;
      }
      if (col >= MAX_COLS) col = MAX_COLS - 1;

      rowBottomEdge[col] = bottomEdge;
      const labelX = sheetLeft - tickLen - 2 - labelW - col * COL_STEP;

      // Leader line
      if (col > 0) {
        cmd.push(commandSetStroke([0.7, 0.7, 0.74]));
        cmd.push('0.3 w\n');
        cmd.push(commandLine([sheetLeft - tickLen, yPdf], [labelX + labelW + 1, yPdf]));
        cmd.push(commandSetStroke([0.45, 0.45, 0.5]));
        cmd.push('0.5 w\n');
      }

      cmd.push(commandSetFill([0.3, 0.3, 0.35]));
      cmd.push(commandText(label, labelX, yPdf - rulerFontSize * 0.35, rulerFontSize));
    }
  }

  // ── Legend for numbered small pieces ──
  if (smallPieces.length > 0) {
    const legendTop = DRAW_AREA_BOTTOM + legendH - 4;
    cmd.push(commandSetFill([0.3, 0.3, 0.35]));
    cmd.push(commandText('Legend:', PAGE_MARGIN, legendTop, 8));

    const colWidth = (PAGE_WIDTH - PAGE_MARGIN * 2) / LEGEND_COLS;
    for (let i = 0; i < smallPieces.length; i++) {
      const { num, piece } = smallPieces[i];
      const col = i % LEGEND_COLS;
      const row = Math.floor(i / LEGEND_COLS);
      const lx = PAGE_MARGIN + col * colWidth;
      const ly = legendTop - 12 - row * LEGEND_ROW_H;

      if (ly < PAGE_MARGIN) break; // off page

      const dimStr = piece.rotated
        ? `${formatNumber(piece.origWidth)} x ${formatNumber(piece.origHeight)} (R)`
        : `${formatNumber(piece.origWidth)} x ${formatNumber(piece.origHeight)}`;
      const legendText = `${num}: ${piece.description} (${dimStr})`;

      cmd.push(commandSetFill([0.2, 0.2, 0.24]));
      cmd.push(commandText(truncateToWidth(legendText, colWidth - 10, 7), lx, ly, 7));
    }
  }

  return cmd.join('');
}

function renderSummaryPage(layout: CuttingLayoutResult, sheetWidth: number, sheetHeight: number): string {
  const cmd: string[] = [];

  // Header
  cmd.push(commandSetFill([0.12, 0.12, 0.14]));
  cmd.push(commandText('CUTTING LAYOUT SUMMARY', PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN + 2, 15));
  cmd.push(commandSetFill([0.4, 0.4, 0.44]));
  const sheetAreaM2 = formatNumber((sheetWidth * sheetHeight) / 1_000_000);
  let summarySubtitle = `${layout.totalPieces} pieces on ${layout.totalSheets} sheet${layout.totalSheets > 1 ? 's' : ''} | Stock: ${sheetWidth} x ${sheetHeight} mm (${sheetAreaM2} m\\262/sheet) | ${formatNumber(layout.wastePercent)}% waste`;
  if (layout.kerf > 0) summarySubtitle += ` | Kerf: ${formatNumber(layout.kerf)} mm`;
  cmd.push(commandText(summarySubtitle, PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN - 14, 9));

  // Sheet summary table
  const tableX = PAGE_MARGIN;
  const tableW = PAGE_WIDTH - PAGE_MARGIN * 2;
  let tableY = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT - 10;

  cmd.push(commandSetFill([0.12, 0.12, 0.14]));
  cmd.push(commandText('Sheets by Material', tableX, tableY, 11));
  tableY -= 18;

  // Table header
  const colMaterial = tableX;
  const colSheets = tableX + 220;
  const colCuts = tableX + 300;
  const colArea = tableX + 400;
  const colWaste = tableX + 540;

  cmd.push(commandSetFill([0.22, 0.22, 0.24]));
  cmd.push(commandText('Material', colMaterial + 4, tableY, 9));
  cmd.push(commandText('Sheets', colSheets + 4, tableY, 9));
  cmd.push(commandText('Cuts (length)', colCuts + 4, tableY, 9));
  cmd.push(commandText('Used Area (mm\u00b2)', colArea + 4, tableY, 9));
  cmd.push(commandText('Waste %', colWaste + 4, tableY, 9));
  tableY -= 4;
  cmd.push(commandSetStroke([0.7, 0.7, 0.74]));
  cmd.push('0.6 w\n');
  cmd.push(commandLine([tableX, tableY], [tableX + tableW, tableY]));
  tableY -= 14;

  // Group sheets by material
  const byMaterial = new Map<string, PackedSheet[]>();
  for (const s of layout.sheets) {
    let arr = byMaterial.get(s.material);
    if (!arr) {
      arr = [];
      byMaterial.set(s.material, arr);
    }
    arr.push(s);
  }

  cmd.push(commandSetFill([0.14, 0.14, 0.16]));
  for (const [material, sheets] of byMaterial) {
    const usedArea = sheets.reduce((s, sh) => s + sh.usedArea, 0);
    const totalArea = sheets.length * sheetWidth * sheetHeight;
    const waste = totalArea > 0 ? ((totalArea - usedArea) / totalArea) * 100 : 0;
    const matCuts = sheets.reduce((s, sh) => s + sh.cuts.length, 0);
    const matCutLen = sheets.reduce((s, sh) => s + sh.cuts.reduce((cs, c) => cs + c.lengthMm, 0), 0);

    cmd.push(commandText(material, colMaterial + 4, tableY, 9));
    cmd.push(commandText(String(sheets.length), colSheets + 4, tableY, 9));
    cmd.push(commandText(`${matCuts} (${formatNumber(matCutLen)} mm)`, colCuts + 4, tableY, 9));
    cmd.push(commandText(formatNumber(usedArea), colArea + 4, tableY, 9));
    cmd.push(commandText(`${formatNumber(waste)}%`, colWaste + 4, tableY, 9));
    tableY -= 16;
  }

  // Piece list
  tableY -= 10;
  cmd.push(commandSetFill([0.12, 0.12, 0.14]));
  cmd.push(commandText('Piece List', tableX, tableY, 11));
  tableY -= 18;

  const pColIdx = tableX;
  const pColName = tableX + 30;
  const pColDims = tableX + 320;
  const pColMat = tableX + 440;
  const pColQty = tableX + 620;

  cmd.push(commandSetFill([0.22, 0.22, 0.24]));
  cmd.push(commandText('#', pColIdx + 4, tableY, 9));
  cmd.push(commandText('Description', pColName + 4, tableY, 9));
  cmd.push(commandText('Dimensions', pColDims + 4, tableY, 9));
  cmd.push(commandText('Material', pColMat + 4, tableY, 9));
  cmd.push(commandText('Qty', pColQty + 4, tableY, 9));
  tableY -= 4;
  cmd.push(commandSetStroke([0.7, 0.7, 0.74]));
  cmd.push(commandLine([tableX, tableY], [tableX + tableW, tableY]));
  tableY -= 14;

  // Collect unique piece descriptions with quantities
  const pieceMap = new Map<string, { desc: string; w: number; h: number; material: string; qty: number }>();
  for (const sheet of layout.sheets) {
    for (const piece of sheet.pieces) {
      const key = `${piece.description}|${piece.origWidth}x${piece.origHeight}|${piece.material}`;
      const existing = pieceMap.get(key);
      if (existing) {
        existing.qty += 1;
      } else {
        pieceMap.set(key, {
          desc: piece.description,
          w: piece.origWidth,
          h: piece.origHeight,
          material: piece.material,
          qty: 1,
        });
      }
    }
  }

  cmd.push(commandSetFill([0.14, 0.14, 0.16]));
  let rowIdx = 0;
  for (const info of pieceMap.values()) {
    if (tableY < PAGE_MARGIN + 10) break; // stop if running off page
    rowIdx++;
    cmd.push(commandText(String(rowIdx), pColIdx + 4, tableY, 9));
    cmd.push(commandText(truncateToWidth(info.desc, 280, 9), pColName + 4, tableY, 9));
    cmd.push(commandText(`${formatNumber(info.w)} x ${formatNumber(info.h)} mm`, pColDims + 4, tableY, 9));
    cmd.push(commandText(truncateToWidth(info.material, 170, 9), pColMat + 4, tableY, 9));
    cmd.push(commandText(String(info.qty), pColQty + 4, tableY, 9));
    tableY -= 15;
  }

  // Totals
  tableY -= 8;
  cmd.push(commandSetStroke([0.7, 0.7, 0.74]));
  cmd.push(commandLine([tableX, tableY + 6], [tableX + tableW, tableY + 6]));
  cmd.push(commandSetFill([0.12, 0.12, 0.14]));
  const totalAreaM2 = layout.totalUsedArea / 1_000_000;
  const totalStockM2 = layout.totalSheetArea / 1_000_000;
  const totalCuts = layout.sheets.reduce((s, sh) => s + sh.cuts.length, 0);
  cmd.push(
    commandText(
      `Total: ${formatNumber(totalAreaM2)} m\\262 material on ${layout.totalSheets} sheet${layout.totalSheets > 1 ? 's' : ''} (${formatNumber(totalStockM2)} m\\262 stock, ${formatNumber(layout.wastePercent)}% waste)`,
      tableX + 4,
      tableY - 6,
      10,
    ),
  );
  cmd.push(
    commandText(`Cuts: ${totalCuts} total (${formatNumber(layout.totalCutLength)} mm total cut length)`, tableX + 4, tableY - 20, 10),
  );

  return cmd.join('');
}

export function generateCuttingLayoutPdf(
  entries: SheetStockDef[],
  sheetWidth: number,
  sheetHeight: number,
  kerf: number = 0,
): CuttingLayoutPdfResult {
  if (entries.length === 0) {
    throw new Error('No sheet stock entries to lay out.');
  }
  if (!Number.isFinite(sheetWidth) || sheetWidth <= 0) {
    throw new Error('Stock sheet width must be a finite number > 0');
  }
  if (!Number.isFinite(sheetHeight) || sheetHeight <= 0) {
    throw new Error('Stock sheet height must be a finite number > 0');
  }
  if (!Number.isFinite(kerf) || kerf < 0) {
    throw new Error('Kerf must be a finite number >= 0');
  }

  const layout = computeCuttingLayout(entries, sheetWidth, sheetHeight, kerf);
  const pdf = new PdfBuilder();

  const fontId = pdf.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const resourcesId = pdf.addObject(`<< /Font << /F1 ${fontId} 0 R >> >>`);

  // Reserve pages object id: fonts(1) + resources(1) + (content + page) * pageCount + pages(1)
  const pageCount = layout.sheets.length + 1; // sheets + summary
  const pagesId = 2 + pageCount * 2 + 1;
  const pageIds: number[] = [];

  // Sheet pages
  for (const sheet of layout.sheets) {
    const content = renderSheetPage(sheet, layout.totalSheets, layout);
    const contentId = pdf.addStreamObject('', content);
    const pageId = pdf.addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources ${resourcesId} 0 R /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }

  // Summary page
  {
    const content = renderSummaryPage(layout, sheetWidth, sheetHeight);
    const contentId = pdf.addStreamObject('', content);
    const pageId = pdf.addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources ${resourcesId} 0 R /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }

  const kids = pageIds.map((id) => `${id} 0 R`).join(' ');
  const actualPagesId = pdf.addObject(`<< /Type /Pages /Kids [${kids}] /Count ${pageIds.length} >>`);
  if (actualPagesId !== pagesId) {
    throw new Error('Internal cutting layout PDF generation error (page tree mismatch).');
  }

  const catalogId = pdf.addObject(`<< /Type /Catalog /Pages ${actualPagesId} 0 R >>`);

  return {
    pdf: pdf.build(catalogId),
    pageCount: pageIds.length,
    layout,
  };
}
