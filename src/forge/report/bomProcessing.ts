/**
 * BOM row collection and pagination.
 */

import type { BomDef } from '../bom';
import {
  BOM_TABLE_ROW_HEIGHT,
  BOM_TABLE_HEADER_HEIGHT,
  BOM_TABLE_BOTTOM_PAD,
  BOM_MAX_ROWS_PER_PAGE,
  type BomReportRow,
} from './_internal';
import { PAGE_HEIGHT, PAGE_MARGIN } from '../export/pdfUtils';
import { HEADER_HEIGHT } from './_internal';

function normalizeBomUnit(unit: string | undefined): string {
  const value = typeof unit === 'string' ? unit.trim() : '';
  return value.length > 0 ? value : 'pieces';
}

function normalizeBomDescription(description: string | undefined): string {
  const value = typeof description === 'string' ? description.trim() : '';
  return value.length > 0 ? value : 'Unspecified item';
}

function normalizeBomKey(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const key = value.trim();
  return key.length > 0 ? key : undefined;
}

export function collectBomRows(entries: BomDef[]): BomReportRow[] {
  const byKey = new Map<string, BomReportRow>();
  for (const entry of entries) {
    const qty = Number(entry.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const description = normalizeBomDescription(entry.description);
    const unit = normalizeBomUnit(entry.unit);
    const normalizedKey = normalizeBomKey(entry.key);
    const key = normalizedKey ?? `${description.toLowerCase()}|${unit.toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += qty;
      continue;
    }
    byKey.set(key, {
      key,
      description,
      unit,
      quantity: qty,
    });
  }
  return Array.from(byKey.values());
}

export function splitBomRowsIntoPages(rows: BomReportRow[]): BomReportRow[][] {
  if (rows.length === 0) return [];

  const maxRowsByGeometry = Math.max(
    1,
    Math.floor((PAGE_HEIGHT - PAGE_MARGIN * 2 - HEADER_HEIGHT - BOM_TABLE_BOTTOM_PAD * 2 - BOM_TABLE_HEADER_HEIGHT) / BOM_TABLE_ROW_HEIGHT),
  );
  const perPage = Math.max(1, Math.min(BOM_MAX_ROWS_PER_PAGE, maxRowsByGeometry));
  const out: BomReportRow[][] = [];
  for (let i = 0; i < rows.length; i += perPage) {
    out.push(rows.slice(i, i + perPage));
  }
  return out;
}
