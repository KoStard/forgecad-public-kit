/**
 * Bill of Materials (BOM) annotations
 *
 * Script-side declarations for real-world build items that cannot be inferred
 * from pure CAD geometry.
 *
 * Usage:
 *   bom(1200, 'iron tube with dimensions 20 x 20', { unit: 'mm' });
 *   bom(8, 'M4 bolt, 16 mm length', { unit: 'pieces' });
 *   bom(4, 'rubber foot', { key: 'foot-rubber' }); // explicit grouping key
 */

export interface BomDef {
  id: string;
  quantity: number;
  unit: string;
  description: string;
  /**
   * Optional grouping key.
   * If omitted, report aggregation uses normalized description + unit.
   */
  key?: string;
}

export interface BomOpts {
  /**
   * Quantity unit label, e.g. "mm", "pieces", "kg".
   * Default: "pieces"
   */
  unit?: string;
  /**
   * Optional explicit grouping key used during report aggregation.
   */
  key?: string;
}

let collectedBom: BomDef[] = [];
let bomCounter = 0;

export function resetBom(): void {
  collectedBom = [];
  bomCounter = 0;
}

export function getCollectedBom(): BomDef[] {
  return collectedBom;
}

function normalizeUnit(unit: string | undefined): string {
  const value = typeof unit === 'string' ? unit.trim() : '';
  return value.length > 0 ? value : 'pieces';
}

function normalizeKey(key: string | undefined): string | undefined {
  if (typeof key !== 'string') return undefined;
  const value = key.trim();
  return value.length > 0 ? value : undefined;
}

/**
 * Add a bill-of-materials entry.
 *
 * @param quantity numeric quantity (e.g. 1200)
 * @param description human-readable item text (e.g. "iron tube with dimensions 20 x 20")
 * @param opts optional unit and explicit grouping key
 */
export function bom(quantity: number, description: string, opts?: BomOpts): void {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
    throw new Error('bom(quantity, description): quantity must be a finite number');
  }
  if (quantity < 0) {
    throw new Error('bom(quantity, description): quantity must be >= 0');
  }
  if (quantity === 0) return;

  if (typeof description !== 'string' || description.trim().length === 0) {
    throw new Error('bom(quantity, description): description must be a non-empty string');
  }

  bomCounter += 1;
  collectedBom.push({
    id: `bom-${bomCounter}`,
    quantity,
    unit: normalizeUnit(opts?.unit),
    description: description.trim(),
    key: normalizeKey(opts?.key),
  });
}
