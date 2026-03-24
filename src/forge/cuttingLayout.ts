/**
 * Sheet Cutting Layout — guillotine bin packing + PDF export.
 *
 * Packs rectangular pieces onto stock sheets using a greedy guillotine
 * algorithm (largest-area-first, best-short-side-fit heuristic).
 * Pieces may be rotated 90 degrees.
 *
 * Produces a PDF with one page per sheet showing the cutting pattern,
 * followed by a summary page.
 */

import {
  type ColorRgb,
  commandLine,
  commandRect,
  commandSetFill,
  commandSetStroke,
  commandText,
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
}

export interface CuttingLayoutResult {
  sheets: PackedSheet[];
  totalPieces: number;
  totalSheets: number;
  totalUsedArea: number;
  totalSheetArea: number;
  wastePercent: number;
}

export interface CuttingLayoutPdfResult {
  pdf: Uint8Array;
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
 */
function packMaterialGroup(pieces: ExpandedPiece[], sheetW: number, sheetH: number, material: string): PackedSheet[] {
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
    });
    sheetFreeRects.push([{ x: 0, y: 0, w: sheetW, h: sheetH }]);
    return idx;
  }

  for (const piece of sorted) {
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
        if (piece.width <= rect.w && piece.height <= rect.h) {
          const shortSide = Math.min(rect.w - piece.width, rect.h - piece.height);
          if (shortSide < bestScore) {
            bestScore = shortSide;
            bestSheetIdx = si;
            bestRectIdx = ri;
            bestRotated = false;
          }
        }

        // Try rotated 90°
        if (piece.height <= rect.w && piece.width <= rect.h) {
          const shortSide = Math.min(rect.w - piece.height, rect.h - piece.width);
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
      if (piece.width > sheetW || piece.height > sheetH) {
        if (piece.height <= sheetW && piece.width <= sheetH) {
          bestRotated = true;
        }
        // If still doesn't fit, place it anyway — the PDF will show it overflowing
      }
    }

    const freeRects = sheetFreeRects[bestSheetIdx];
    const rect = freeRects[bestRectIdx];
    const pw = bestRotated ? piece.height : piece.width;
    const ph = bestRotated ? piece.width : piece.height;

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
    const rightFullH: FreeRect = { x: rect.x + pw, y: rect.y, w: rect.w - pw, h: rect.h };
    const topPartW: FreeRect = { x: rect.x, y: rect.y + ph, w: pw, h: rect.h - ph };

    const rightPartH: FreeRect = { x: rect.x + pw, y: rect.y, w: rect.w - pw, h: ph };
    const topFullW: FreeRect = { x: rect.x, y: rect.y + ph, w: rect.w, h: rect.h - ph };

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

  return sheets;
}

export function computeCuttingLayout(entries: SheetStockDef[], sheetWidth: number, sheetHeight: number): CuttingLayoutResult {
  const expanded = expandPieces(entries);
  const groups = groupByMaterial(expanded);

  const allSheets: PackedSheet[] = [];
  for (const [material, pieces] of groups) {
    const sheets = packMaterialGroup(pieces, sheetWidth, sheetHeight, material);
    allSheets.push(...sheets);
  }

  // Re-index sheets
  allSheets.forEach((s, i) => {
    s.sheetIndex = i;
  });

  const totalUsedArea = allSheets.reduce((sum, s) => sum + s.usedArea, 0);
  const totalSheetArea = allSheets.length * sheetWidth * sheetHeight;

  return {
    sheets: allSheets,
    totalPieces: expanded.length,
    totalSheets: allSheets.length,
    totalUsedArea,
    totalSheetArea,
    wastePercent: totalSheetArea > 0 ? ((totalSheetArea - totalUsedArea) / totalSheetArea) * 100 : 0,
  };
}

// ── PDF generation ─────────────────────────────────────────────

const HEADER_HEIGHT = 44;
const DRAW_AREA_TOP = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT;
const DRAW_AREA_BOTTOM = PAGE_MARGIN + 16;
const DRAW_AREA_LEFT = PAGE_MARGIN;
const DRAW_AREA_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const DRAW_AREA_HEIGHT = DRAW_AREA_TOP - DRAW_AREA_BOTTOM;

function renderSheetPage(sheet: PackedSheet, totalSheets: number, _layout: CuttingLayoutResult): string {
  const cmd: string[] = [];

  // Header
  const wastePercent =
    sheet.sheetWidth * sheet.sheetHeight > 0
      ? ((sheet.sheetWidth * sheet.sheetHeight - sheet.usedArea) / (sheet.sheetWidth * sheet.sheetHeight)) * 100
      : 0;
  const title = `CUTTING LAYOUT — ${sheet.material.toUpperCase()}`;
  const subtitle = `Sheet ${sheet.sheetIndex + 1} of ${totalSheets} | ${sheet.sheetWidth} x ${sheet.sheetHeight} mm | ${sheet.pieces.length} pieces | ${formatNumber(wastePercent)}% waste`;

  cmd.push(commandSetFill([0.12, 0.12, 0.14]));
  cmd.push(commandText(title, PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN + 2, 15));
  cmd.push(commandSetFill([0.4, 0.4, 0.44]));
  cmd.push(commandText(subtitle, PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN - 14, 9));

  // Compute scale to fit sheet in draw area
  const scaleX = DRAW_AREA_WIDTH / sheet.sheetWidth;
  const scaleY = DRAW_AREA_HEIGHT / sheet.sheetHeight;
  const scale = Math.min(scaleX, scaleY);

  const drawW = sheet.sheetWidth * scale;
  const drawH = sheet.sheetHeight * scale;
  // Center the sheet drawing in the draw area
  const offsetX = DRAW_AREA_LEFT + (DRAW_AREA_WIDTH - drawW) / 2;
  const offsetY = DRAW_AREA_BOTTOM + (DRAW_AREA_HEIGHT - drawH) / 2;

  // Sheet outline
  cmd.push(commandSetStroke([0.4, 0.4, 0.44]));
  cmd.push('1.5 w\n');
  cmd.push(`${commandRect(offsetX, offsetY, drawW, drawH)} S\n`);

  // Draw pieces
  sheet.pieces.forEach((piece, i) => {
    const px = offsetX + piece.x * scale;
    // PDF y-axis is bottom-up, but our packing is top-down from y=0
    // So we flip: PDF_y = offsetY + drawH - (piece.y + piece.height) * scale
    const py = offsetY + drawH - (piece.y + piece.height) * scale;
    const pw = piece.width * scale;
    const ph = piece.height * scale;

    const fillColor = PIECE_FILL_COLORS[i % PIECE_FILL_COLORS.length];
    const strokeColor = PIECE_STROKE_COLORS[i % PIECE_STROKE_COLORS.length];

    // Fill
    cmd.push(commandSetFill(fillColor));
    cmd.push(`${commandRect(px, py, pw, ph)} f\n`);
    // Stroke
    cmd.push(commandSetStroke(strokeColor));
    cmd.push('0.8 w\n');
    cmd.push(`${commandRect(px, py, pw, ph)} S\n`);

    // Label: piece name + dimensions
    const dimLabel = piece.rotated
      ? `${formatNumber(piece.origWidth)} x ${formatNumber(piece.origHeight)} (R)`
      : `${formatNumber(piece.origWidth)} x ${formatNumber(piece.origHeight)}`;

    const labelFontSize = Math.max(5, Math.min(9, pw * 0.08, ph * 0.15));
    const dimFontSize = Math.max(4, Math.min(7, labelFontSize * 0.8));

    // Only draw label if piece rect is large enough
    if (pw > 18 && ph > 12) {
      const maxLabelW = pw - 4;
      const nameText = truncateToWidth(piece.description, maxLabelW, labelFontSize);

      cmd.push(commandSetFill([0.1, 0.1, 0.12]));
      cmd.push(commandText(nameText, px + 3, py + ph - labelFontSize - 2, labelFontSize));

      // Dimensions below name
      if (ph > 22) {
        cmd.push(commandSetFill([0.35, 0.35, 0.4]));
        cmd.push(commandText(dimLabel, px + 3, py + ph - labelFontSize - dimFontSize - 5, dimFontSize));
      }
    }
  });

  return cmd.join('');
}

function renderSummaryPage(layout: CuttingLayoutResult, sheetWidth: number, sheetHeight: number): string {
  const cmd: string[] = [];

  // Header
  cmd.push(commandSetFill([0.12, 0.12, 0.14]));
  cmd.push(commandText('CUTTING LAYOUT SUMMARY', PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN + 2, 15));
  cmd.push(commandSetFill([0.4, 0.4, 0.44]));
  const summarySubtitle = `${layout.totalPieces} pieces on ${layout.totalSheets} sheet${layout.totalSheets > 1 ? 's' : ''} | Stock size: ${sheetWidth} x ${sheetHeight} mm | ${formatNumber(layout.wastePercent)}% waste`;
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
  const colSheets = tableX + 260;
  const colArea = tableX + 360;
  const colWaste = tableX + 480;

  cmd.push(commandSetFill([0.22, 0.22, 0.24]));
  cmd.push(commandText('Material', colMaterial + 4, tableY, 9));
  cmd.push(commandText('Sheets', colSheets + 4, tableY, 9));
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

    cmd.push(commandText(material, colMaterial + 4, tableY, 9));
    cmd.push(commandText(String(sheets.length), colSheets + 4, tableY, 9));
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

  // Total area
  tableY -= 8;
  cmd.push(commandSetStroke([0.7, 0.7, 0.74]));
  cmd.push(commandLine([tableX, tableY + 6], [tableX + tableW, tableY + 6]));
  cmd.push(commandSetFill([0.12, 0.12, 0.14]));
  const totalAreaM2 = layout.totalUsedArea / 1_000_000;
  cmd.push(
    commandText(
      `Total: ${formatNumber(totalAreaM2)} m\u00b2 material on ${layout.totalSheets} sheet${layout.totalSheets > 1 ? 's' : ''} (${formatNumber(layout.wastePercent)}% waste)`,
      tableX + 4,
      tableY - 6,
      10,
    ),
  );

  return cmd.join('');
}

export function generateCuttingLayoutPdf(entries: SheetStockDef[], sheetWidth: number, sheetHeight: number): CuttingLayoutPdfResult {
  if (entries.length === 0) {
    throw new Error('No sheet stock entries to lay out.');
  }
  if (!Number.isFinite(sheetWidth) || sheetWidth <= 0) {
    throw new Error('Stock sheet width must be a finite number > 0');
  }
  if (!Number.isFinite(sheetHeight) || sheetHeight <= 0) {
    throw new Error('Stock sheet height must be a finite number > 0');
  }

  const layout = computeCuttingLayout(entries, sheetWidth, sheetHeight);
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
