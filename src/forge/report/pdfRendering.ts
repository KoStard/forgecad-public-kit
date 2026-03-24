/**
 * PDF rendering: renderViewCell, renderBomPage, buildPages.
 */

import type { ColorRgb, Vec2 } from '../export/pdfUtils';
import {
  commandLine,
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
} from '../export/pdfUtils';
import type { RunResult } from '../runner';
import type { DimensionDef } from '../sketch/dimensions';
import type { BomDef } from '../bom';
import type { ReportOptions, ReportGenerationResult } from './types';
import { DEFAULT_VIEWS, MAX_LABEL_GEOMETRY_SEGMENTS, normalizeToleranceDeg } from './_internal';
import { collectReportObjects } from './geometryCollection';
import {
  HEADER_HEIGHT,
  CELL_GAP,
  CELL_PADDING,
  BOM_TABLE_ROW_HEIGHT,
  BOM_TABLE_HEADER_HEIGHT,
  BOM_TABLE_BOTTOM_PAD,
  type Vec3,
  type Bounds2,
  type CellRect,
  type ViewFrame,
  type ReportObject,
  type ProjectedEdge,
  type LabelBox,
  type DimensionLabelPlan,
  type Segment2,
  type StandardPageSpec,
  type BomPageSpec,
  type PageSpec,
  type RenderViewCellOptions,
} from './_internal';
import {
  bboxCenter,
  mergeBounds3,
  bboxCorners,
  dot3,
  scaleBounds2,
  boundsCenter2,
  makeLabelBox,
  sampleSegments,
  closestPointOnBox,
} from './mathUtils';
import {
  projectPoint,
  makeViewFrame,
  isDimensionVisibleInView,
  dimensionZoomOutFactor,
  assignAutoOffsetLanes,
  assignCrowdedDimensionColors,
  drawDimension,
  layoutDimensionLabels,
  chooseLegendPlacement,
  hasExplicitDimensionColor,
  setReportLengthUnit,
} from './dimensionLayout';
import { hexToRgb01 } from './geometryCollection';
import { collectBomRows, splitBomRowsIntoPages } from './bomProcessing';
import { buildDimensionOwnership, collectComponentPageGroups } from './geometryCollection';

function projectedBounds(center: Vec3, frame: ViewFrame, objects: ReportObject[], dimensions: DimensionDef[]): Bounds2 {
  const bounds: Bounds2 = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  const include = (p: Vec3) => {
    const pr = projectPoint(p, center, frame);
    bounds.minX = Math.min(bounds.minX, pr.x);
    bounds.minY = Math.min(bounds.minY, pr.y);
    bounds.maxX = Math.max(bounds.maxX, pr.x);
    bounds.maxY = Math.max(bounds.maxY, pr.y);
  };

  objects.forEach((obj) => {
    bboxCorners(obj.bbox).forEach(include);
  });

  dimensions.forEach((d) => {
    include(d.from);
    include(d.to);
  });

  if (!Number.isFinite(bounds.minX)) {
    return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  }

  if (Math.abs(bounds.maxX - bounds.minX) < 1e-6) {
    bounds.minX -= 1;
    bounds.maxX += 1;
  }
  if (Math.abs(bounds.maxY - bounds.minY) < 1e-6) {
    bounds.minY -= 1;
    bounds.maxY += 1;
  }

  return bounds;
}
function makeCellMapper(bounds: Bounds2, cell: CellRect): { map: (p: Vec2) => Vec2; scale: number } {
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const scale = Math.min((cell.w - CELL_PADDING * 2) / spanX, (cell.h - CELL_PADDING * 2) / spanY);
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cy = (bounds.minY + bounds.maxY) * 0.5;
  const ox = cell.x + cell.w * 0.5;
  const oy = cell.y + cell.h * 0.5;

  return {
    map: ([x, y]) => [ox + (x - cx) * scale, oy + (y - cy) * scale],
    scale,
  };
}

function commandTriangleFill(a: Vec2, b: Vec2, c: Vec2): string {
  return `${formatNumber(a[0])} ${formatNumber(a[1])} m ${formatNumber(b[0])} ${formatNumber(b[1])} l ${formatNumber(c[0])} ${formatNumber(c[1])} l h f\n`;
}

function buildGridCells(viewCount: number): CellRect[] {
  const cols = viewCount === 1 ? 1 : 2;
  const rows = Math.ceil(viewCount / cols);
  const contentWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const contentHeight = PAGE_HEIGHT - PAGE_MARGIN * 2 - HEADER_HEIGHT;
  const totalGapX = CELL_GAP * Math.max(0, cols - 1);
  const totalGapY = CELL_GAP * Math.max(0, rows - 1);
  const cellW = (contentWidth - totalGapX) / cols;
  const cellH = (contentHeight - totalGapY) / rows;

  const topY = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT;

  const out: CellRect[] = [];
  for (let i = 0; i < viewCount; i += 1) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = PAGE_MARGIN + col * (cellW + CELL_GAP);
    const y = topY - (row + 1) * cellH - row * CELL_GAP;
    out.push({ x, y, w: cellW, h: cellH });
  }
  return out;
}

function _makeMapperForRect(bounds: Bounds2, rect: CellRect, padding = CELL_PADDING): { map: (p: Vec2) => Vec2; scale: number } {
  const spanX = Math.max(1e-6, bounds.maxX - bounds.minX);
  const spanY = Math.max(1e-6, bounds.maxY - bounds.minY);
  const scale = Math.min((rect.w - padding * 2) / spanX, (rect.h - padding * 2) / spanY);
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cy = (bounds.minY + bounds.maxY) * 0.5;
  const ox = rect.x + rect.w * 0.5;
  const oy = rect.y + rect.h * 0.5;
  return {
    map: ([x, y]) => [ox + (x - cx) * scale, oy + (y - cy) * scale],
    scale,
  };
}
function collectProjectedEdges(frame: ViewFrame, center: Vec3, objects: ReportObject[]): ProjectedEdge[] {
  const out: ProjectedEdge[] = [];
  objects.forEach((obj) => {
    obj.edges.forEach((edge) => {
      const a = projectPoint(edge.a, center, frame);
      const b = projectPoint(edge.b, center, frame);
      const modelA: Vec2 = [a.x, a.y];
      const modelB: Vec2 = [b.x, b.y];
      out.push({
        modelA,
        modelB,
        mid: [(modelA[0] + modelB[0]) * 0.5, (modelA[1] + modelB[1]) * 0.5],
        lenModel: Math.hypot(modelB[0] - modelA[0], modelB[1] - modelA[1]),
      });
    });
  });
  return out;
}

function projectedObjectBounds(object: ReportObject, center: Vec3, frame: ViewFrame): Bounds2 {
  const bounds: Bounds2 = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  bboxCorners(object.bbox).forEach((corner) => {
    const p = projectPoint(corner, center, frame);
    bounds.minX = Math.min(bounds.minX, p.x);
    bounds.minY = Math.min(bounds.minY, p.y);
    bounds.maxX = Math.max(bounds.maxX, p.x);
    bounds.maxY = Math.max(bounds.maxY, p.y);
  });
  if (!Number.isFinite(bounds.minX)) {
    return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  }
  return bounds;
}

function mapBoundsToLabelBox(bounds: Bounds2, mapPoint: (p: Vec2) => Vec2): LabelBox {
  const p0 = mapPoint([bounds.minX, bounds.minY]);
  const p1 = mapPoint([bounds.maxX, bounds.maxY]);
  return {
    minX: Math.min(p0[0], p1[0]),
    minY: Math.min(p0[1], p1[1]),
    maxX: Math.max(p0[0], p1[0]),
    maxY: Math.max(p0[1], p1[1]),
  };
}

function renderViewCell(
  cell: CellRect,
  frame: ViewFrame,
  center: Vec3,
  objects: ReportObject[],
  dimensions: DimensionDef[],
  dimDirectionToleranceDeg: number,
  options: RenderViewCellOptions = {},
): string {
  const viewDims = dimensions.filter((d) => isDimensionVisibleInView(d, frame, dimDirectionToleranceDeg));
  const baseBounds = projectedBounds(center, frame, objects, viewDims);
  const objectBounds = projectedBounds(center, frame, objects, []);
  const placementBounds = objectBounds;
  const placementCenter = boundsCenter2(placementBounds);
  const zoomOut = dimensionZoomOutFactor(viewDims.length);
  const bounds = scaleBounds2(baseBounds, zoomOut);
  const mapper = makeCellMapper(bounds, cell);

  const cmd: string[] = [];

  cmd.push('q\n');
  cmd.push(`${formatNumber(cell.x)} ${formatNumber(cell.y)} ${formatNumber(cell.w)} ${formatNumber(cell.h)} re W n\n`);

  type TriDraw = {
    a: Vec2;
    b: Vec2;
    c: Vec2;
    depth: number;
    color: ColorRgb;
    opacity: number;
  };

  const triangles: TriDraw[] = [];

  objects.forEach((obj) => {
    obj.triangles.forEach((tri) => {
      if (dot3(tri.normal, frame.forward) >= 0) return;
      const pa = projectPoint(tri.a, center, frame);
      const pb = projectPoint(tri.b, center, frame);
      const pc = projectPoint(tri.c, center, frame);
      const a = mapper.map([pa.x, pa.y]);
      const b = mapper.map([pb.x, pb.y]);
      const c = mapper.map([pc.x, pc.y]);
      triangles.push({
        a,
        b,
        c,
        depth: (pa.depth + pb.depth + pc.depth) / 3,
        color: obj.color,
        opacity: obj.opacity,
      });
    });
  });

  triangles.sort((lhs, rhs) => rhs.depth - lhs.depth);

  cmd.push('q\n');
  cmd.push('/GSfill gs\n');
  triangles.forEach((tri) => {
    cmd.push(commandSetFill(tri.color));
    cmd.push(commandTriangleFill(tri.a, tri.b, tri.c));
  });
  cmd.push('Q\n');

  const projectedEdges = collectProjectedEdges(frame, center, objects);
  const geometryLabelSegments = sampleSegments(
    projectedEdges.map((edge) => ({ a: mapper.map(edge.modelA), b: mapper.map(edge.modelB) })),
    MAX_LABEL_GEOMETRY_SEGMENTS,
  );
  const geometryAvoidBoxes = objects.map((obj) => mapBoundsToLabelBox(projectedObjectBounds(obj, center, frame), mapper.map));

  cmd.push(commandSetStroke([0.1, 0.1, 0.12]));
  cmd.push('0.45 w\n');
  projectedEdges.forEach((edge) => {
    cmd.push(commandLine(mapper.map(edge.modelA), mapper.map(edge.modelB)));
  });

  const labelPlans: DimensionLabelPlan[] = [];
  const blockedLabelSegments: Segment2[] = [...geometryLabelSegments];
  const autoLaneNudges = assignAutoOffsetLanes(viewDims, frame, center, mapper, placementCenter);
  const crowdedColorOverrides = assignCrowdedDimensionColors(viewDims, frame, center, mapper);
  viewDims.forEach((dim) => {
    const pFrom = projectPoint(dim.from, center, frame);
    const pTo = projectPoint(dim.to, center, frame);
    const dimColor = hasExplicitDimensionColor(dim) ? hexToRgb01(dim.color) : crowdedColorOverrides.get(dim.id) || hexToRgb01('#2b2b2b');
    const result = drawDimension(
      dim,
      frame,
      mapper.map,
      mapper.scale,
      dimColor,
      cell,
      [pFrom.x, pFrom.y],
      [pTo.x, pTo.y],
      placementBounds,
      placementCenter,
      autoLaneNudges.get(dim.id) ?? 0,
    );
    cmd.push(result.graphicsCmd);
    if (result.labelPlan) labelPlans.push(result.labelPlan);
    blockedLabelSegments.push(...result.lineSegments);
  });

  const labelLayout = layoutDimensionLabels(labelPlans, cell, blockedLabelSegments, geometryAvoidBoxes);
  const placedLabels = labelLayout.placements;
  const renderedLabelBoxes: LabelBox[] = [];
  placedLabels.forEach(({ plan, pos, text, fallback }) => {
    const leaderStart = plan.anchor;
    const textW = estimateTextWidth(text, plan.fontSize);
    const textHalfW = Math.max(8, textW * 0.5 + 2);
    const leftEdge = cell.x + 4;
    const rightEdge = cell.x + cell.w - 4;
    let textX = pos[0] - textW * 0.5 + 1.5; // centered baseline by default
    if (textX + textW > rightEdge) textX = rightEdge - textW; // right-aligned near right edge
    if (textX < leftEdge) textX = leftEdge; // left-aligned near left edge
    const renderedCenter: Vec2 = [textX + textW * 0.5 - 1.5, pos[1]];
    const renderedBox = makeLabelBox(renderedCenter, textHalfW, plan.textHalfH);
    renderedLabelBoxes.push(renderedBox);
    const leaderEnd = closestPointOnBox(renderedBox, leaderStart);
    const leaderDist = Math.hypot(leaderEnd[0] - leaderStart[0], leaderEnd[1] - leaderStart[1]);
    cmd.push(commandSetStroke(plan.color));
    cmd.push(commandSetFill(plan.color));
    if (leaderDist > plan.leaderMinLength) {
      cmd.push(fallback ? '0.45 w\n' : '0.35 w\n');
      cmd.push(commandLine(leaderStart, leaderEnd));
    }
    cmd.push(commandText(text, textX, pos[1] - 3, plan.fontSize));
  });

  const legendPlacement = chooseLegendPlacement(labelLayout.legend, cell, renderedLabelBoxes, blockedLabelSegments, geometryAvoidBoxes);
  if (legendPlacement) {
    const rows =
      legendPlacement.hiddenCount > 0
        ? [...legendPlacement.rows, { index: 0, text: `+${legendPlacement.hiddenCount} more`, color: [0.45, 0.45, 0.48] as ColorRgb }]
        : legendPlacement.rows;
    cmd.push(commandSetStroke([0.42, 0.42, 0.46]));
    cmd.push('0.35 w\n');
    cmd.push(
      `${formatNumber(legendPlacement.x)} ${formatNumber(legendPlacement.y)} ${formatNumber(legendPlacement.w)} ${formatNumber(legendPlacement.h)} re S\n`,
    );

    rows.forEach((row, i) => {
      const y = legendPlacement.y + legendPlacement.h - 3 - (i + 1) * legendPlacement.lineHeight;
      const prefix = row.index > 0 ? `[${row.index}] ` : '';
      const text = truncateToWidth(`${prefix}${row.text}`, legendPlacement.w - 8, legendPlacement.fontSize);
      cmd.push(commandSetFill(row.color));
      cmd.push(commandText(text, legendPlacement.x + 4, y, legendPlacement.fontSize));
    });
  }

  cmd.push('Q\n');

  if (options.drawFrame !== false) {
    cmd.push(commandSetStroke([0.72, 0.72, 0.76]));
    cmd.push('0.7 w\n');
    cmd.push(`${formatNumber(cell.x)} ${formatNumber(cell.y)} ${formatNumber(cell.w)} ${formatNumber(cell.h)} re S\n`);
    cmd.push(commandSetFill([0.2, 0.2, 0.22]));
    cmd.push(commandText(frame.label, cell.x + 6, cell.y + cell.h - 16, 10));
  }

  return cmd.join('');
}

function renderBomPage(page: BomPageSpec): string {
  const cmd: string[] = [];

  const tableX = PAGE_MARGIN;
  const tableW = PAGE_WIDTH - PAGE_MARGIN * 2;
  const tableTop = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT - BOM_TABLE_BOTTOM_PAD;
  const tableBottom = PAGE_MARGIN + BOM_TABLE_BOTTOM_PAD;
  const tableH = Math.max(40, tableTop - tableBottom);

  const indexW = 34;
  const qtyW = 92;
  const unitW = 74;
  const descW = Math.max(120, tableW - indexW - qtyW - unitW);

  const xIndex = tableX;
  const xDesc = xIndex + indexW;
  const xQty = xDesc + descW;
  const xUnit = xQty + qtyW;

  const headerTop = tableTop;
  const headerBottom = headerTop - BOM_TABLE_HEADER_HEIGHT;

  cmd.push(commandSetStroke([0.7, 0.7, 0.74]));
  cmd.push('0.8 w\n');
  cmd.push(`${formatNumber(tableX)} ${formatNumber(tableBottom)} ${formatNumber(tableW)} ${formatNumber(tableH)} re S\n`);
  cmd.push(commandLine([tableX, headerBottom], [tableX + tableW, headerBottom]));
  cmd.push(commandLine([xDesc, tableBottom], [xDesc, tableTop]));
  cmd.push(commandLine([xQty, tableBottom], [xQty, tableTop]));
  cmd.push(commandLine([xUnit, tableBottom], [xUnit, tableTop]));

  cmd.push(commandSetFill([0.22, 0.22, 0.24]));
  cmd.push(commandText('#', xIndex + 6, headerBottom + 6, 9));
  cmd.push(commandText('Item', xDesc + 6, headerBottom + 6, 9));
  cmd.push(commandText('Quantity', xQty + 6, headerBottom + 6, 9));
  cmd.push(commandText('Unit', xUnit + 6, headerBottom + 6, 9));

  page.rows.forEach((row, i) => {
    const rowTop = headerBottom - i * BOM_TABLE_ROW_HEIGHT;
    const rowBottom = rowTop - BOM_TABLE_ROW_HEIGHT;
    if (rowBottom < tableBottom) return;

    cmd.push(commandSetStroke([0.86, 0.86, 0.88]));
    cmd.push('0.45 w\n');
    cmd.push(commandLine([tableX, rowBottom], [tableX + tableW, rowBottom]));

    const textY = rowBottom + 5;
    const indexText = String(page.rowOffset + i + 1);
    const descText = truncateToWidth(row.description, descW - 12, 9);
    const qtyText = formatNumber(row.quantity);
    const qtyX = xUnit - 6 - estimateTextWidth(qtyText, 9);

    cmd.push(commandSetFill([0.14, 0.14, 0.16]));
    cmd.push(commandText(indexText, xIndex + 6, textY, 9));
    cmd.push(commandText(descText, xDesc + 6, textY, 9));
    cmd.push(commandText(qtyText, qtyX, textY, 9));
    cmd.push(commandText(row.unit, xUnit + 6, textY, 9));
  });

  if (page.pageCount > 1) {
    cmd.push(commandSetFill([0.42, 0.42, 0.45]));
    cmd.push(commandText(`Page ${page.pageIndex}/${page.pageCount}`, PAGE_WIDTH - PAGE_MARGIN - 66, PAGE_MARGIN - 2, 8));
  }

  return cmd.join('');
}

function buildPageContent(page: PageSpec, views: ViewFrame[], dimDirectionToleranceDeg: number): string {
  const cmd: string[] = [];

  cmd.push(commandSetFill([0.12, 0.12, 0.14]));
  cmd.push(commandText(page.title, PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN + 2, 15));
  cmd.push(commandSetFill([0.4, 0.4, 0.44]));
  cmd.push(commandText(page.subtitle, PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN - 14, 9));

  if (page.kind === 'bom') {
    cmd.push(renderBomPage(page));
    return cmd.join('');
  }

  const merged = mergeBounds3(page.objects.map((o) => o.bbox));
  const center = merged ? bboxCenter(merged) : ([0, 0, 0] as Vec3);

  const cells = buildGridCells(views.length);
  views.forEach((view, i) => {
    const cell = cells[i];
    if (!cell) return;
    cmd.push(renderViewCell(cell, view, center, page.objects, page.dimensions, dimDirectionToleranceDeg));
  });

  return cmd.join('');
}

function buildPages(
  objects: ReportObject[],
  dimensions: DimensionDef[],
  bomEntries: BomDef[],
  views: ViewFrame[],
  title: string,
  includeDisassembled: boolean,
  _dimDirectionToleranceDeg: number,
): PageSpec[] {
  const pages: PageSpec[] = [];
  const basePages: StandardPageSpec[] = [];
  const bomRows = collectBomRows(bomEntries);
  const bomChunks = splitBomRowsIntoPages(bomRows);
  const generated = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const ownership = buildDimensionOwnership(dimensions, objects);
  const componentGroups = collectComponentPageGroups(objects, ownership);

  if (bomRows.length > 0) {
    let rowOffset = 0;
    bomChunks.forEach((rows, pageIndex) => {
      pages.push({
        kind: 'bom',
        title: `${title.toUpperCase()} | BILL OF MATERIALS`,
        subtitle: `${bomRows.length} unique items | Summed from ${bomEntries.length} bom() entries`,
        rows,
        rowOffset,
        pageIndex: pageIndex + 1,
        pageCount: bomChunks.length,
      });
      rowOffset += rows.length;
    });
  }

  basePages.push({
    kind: 'standard',
    title: 'ASSEMBLY OVERVIEW',
    subtitle: `${objects.length} components | ${componentGroups.length} unique item pages | ${ownership.combined.length} shared dimensions | ${generated} UTC`,
    objects,
    dimensions: ownership.combined,
  });

  if (includeDisassembled) {
    componentGroups.forEach((group) => {
      const obj = group.representative;
      const subtitleParts = [obj.groupName ? `Group ${obj.groupName}` : '', `${group.dimensions.length} component dimensions`].filter(
        Boolean,
      );
      if (group.instanceCount > 1) {
        subtitleParts.push(`${group.instanceCount} identical instances merged`);
      }
      basePages.push({
        kind: 'standard',
        title: `COMPONENT: ${obj.name}`,
        subtitle: subtitleParts.join(' | '),
        objects: [obj],
        dimensions: group.dimensions,
      });
    });
  }

  if (views.length === 0) {
    throw new Error('Report requires at least one view');
  }

  basePages.forEach((base) => {
    pages.push(base);
  });

  return pages;
}

export function generateReportPdf(result: RunResult, options: ReportOptions = {}): ReportGenerationResult {
  setReportLengthUnit(options.lengthUnit ?? 'mm');

  const views = (options.views && options.views.length > 0 ? options.views : DEFAULT_VIEWS).map(makeViewFrame);

  const reportObjects = collectReportObjects(result.objects, options.objectVisuals);
  if (reportObjects.length === 0) {
    throw new Error('No 3D objects available for report export.');
  }

  const dimensions = result.dimensions || [];
  const bomEntries = result.bom || [];
  const title = (options.title || 'ForgeCAD Report').trim() || 'ForgeCAD Report';
  const includeDisassembled = options.includeDisassembled !== false;
  const dimDirectionToleranceDeg = normalizeToleranceDeg(options.dimensionDirectionToleranceDeg);

  const pages = buildPages(reportObjects, dimensions, bomEntries, views, title, includeDisassembled, dimDirectionToleranceDeg);

  const pdf = new PdfBuilder();

  const fontId = pdf.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const gsFillId = pdf.addObject('<< /Type /ExtGState /CA 0.28 /ca 0.28 >>');
  const resourcesId = pdf.addObject(`<< /Font << /F1 ${fontId} 0 R >> /ExtGState << /GSfill ${gsFillId} 0 R >> >>`);

  const pagesId = 3 + pages.length * 2 + 1;
  const pageIds: number[] = [];

  pages.forEach((page) => {
    const content = buildPageContent(page, views, dimDirectionToleranceDeg);
    const contentId = pdf.addStreamObject('', content);
    const pageId = pdf.addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources ${resourcesId} 0 R /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  });

  const kids = pageIds.map((id) => `${id} 0 R`).join(' ');
  const actualPagesId = pdf.addObject(`<< /Type /Pages /Kids [${kids}] /Count ${pageIds.length} >>`);
  if (actualPagesId !== pagesId) {
    throw new Error('Internal report PDF generation error (page tree mismatch).');
  }

  const catalogId = pdf.addObject(`<< /Type /Catalog /Pages ${actualPagesId} 0 R >>`);

  return {
    pdf: pdf.build(catalogId),
    pageCount: pages.length,
    componentCount: reportObjects.length,
    viewCount: views.length,
    bomItemCount: collectBomRows(bomEntries).length,
  };
}
