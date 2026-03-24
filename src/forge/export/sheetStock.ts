/**
 * Sheet Stock declarations
 *
 * Script-side declarations for rectangular pieces that need to be cut
 * from sheet material (e.g. plywood, MDF, acrylic).
 *
 * Usage:
 *   sheetStock(464, 350, 'Base Bottom Panel', { material: '5.5mm plywood' });
 *   sheetStock(464, 90, 'Base Front Panel', { material: '5.5mm plywood', quantity: 2 });
 */

export interface SheetStockDef {
  id: string;
  /** Piece width in mm. */
  width: number;
  /** Piece height in mm. */
  height: number;
  /** Human-readable piece name. */
  description: string;
  /** Material grouping key. Pieces are packed per-material. */
  material: string;
  /** How many identical pieces. */
  quantity: number;
}

export interface SheetStockOpts {
  /**
   * Material label for grouping, e.g. "5.5mm plywood".
   * Default: "sheet stock"
   */
  material?: string;
  /**
   * Number of identical pieces needed.
   * Default: 1
   */
  quantity?: number;
}

let collectedSheetStock: SheetStockDef[] = [];
let sheetStockCounter = 0;

export function resetSheetStock(): void {
  collectedSheetStock = [];
  sheetStockCounter = 0;
}

export function getCollectedSheetStock(): SheetStockDef[] {
  return collectedSheetStock;
}

function normalizeMaterial(material: string | undefined): string {
  if (typeof material !== 'string') return 'sheet stock';
  const value = material.trim();
  return value.length > 0 ? value : 'sheet stock';
}

/**
 * Declare a rectangular piece to be cut from sheet stock.
 *
 * @param width  piece width in mm (must be finite and > 0)
 * @param height piece height in mm (must be finite and > 0)
 * @param description human-readable piece name
 * @param opts optional material grouping key and quantity
 */
export function sheetStock(width: number, height: number, description: string, opts?: SheetStockOpts): void {
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
    throw new Error('sheetStock(width, height, description): width must be a finite number > 0');
  }
  if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) {
    throw new Error('sheetStock(width, height, description): height must be a finite number > 0');
  }
  if (typeof description !== 'string' || description.trim().length === 0) {
    throw new Error('sheetStock(width, height, description): description must be a non-empty string');
  }

  const quantity = opts?.quantity ?? 1;
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 1) {
    throw new Error('sheetStock(): opts.quantity must be a finite number >= 1');
  }

  sheetStockCounter += 1;
  collectedSheetStock.push({
    id: `sheet-${sheetStockCounter}`,
    width,
    height,
    description: description.trim(),
    material: normalizeMaterial(opts?.material),
    quantity: Math.round(quantity),
  });
}
