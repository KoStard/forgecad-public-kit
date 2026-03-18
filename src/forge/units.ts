/**
 * ForgeCAD Unit System
 *
 * Internal representation is always millimeters (mm).
 * This module provides conversion and formatting for display in the user's preferred unit.
 */

export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';

/** Conversion factors: multiply mm by this to get the target unit. */
const MM_TO: Record<LengthUnit, number> = {
  mm: 1,
  cm: 0.1,
  m: 0.001,
  in: 1 / 25.4,
  ft: 1 / 304.8,
};

/** Convert a value from mm to the target unit. */
export function convertFromMm(mm: number, unit: LengthUnit): number {
  return mm * MM_TO[unit];
}

/** Convert a value from the target unit back to mm. */
export function convertToMm(value: number, unit: LengthUnit): number {
  return value / MM_TO[unit];
}

/** Default decimal places per unit (sensible defaults — mm needs fewer decimals than meters). */
const DEFAULT_DECIMALS: Record<LengthUnit, number> = {
  mm: 2,
  cm: 3,
  m: 4,
  in: 4,
  ft: 4,
};

/** Format a length value (given in mm) for display. */
export function formatLength(mm: number, unit: LengthUnit, decimals?: number): string {
  const converted = convertFromMm(mm, unit);
  const d = decimals ?? DEFAULT_DECIMALS[unit];
  return `${converted.toFixed(d)} ${unit}`;
}

/** Format an area value (given in mm²) for display. */
export function formatArea(mm2: number, unit: LengthUnit, decimals?: number): string {
  const factor = MM_TO[unit];
  const converted = mm2 * factor * factor;
  const d = decimals ?? DEFAULT_DECIMALS[unit];
  return `${converted.toFixed(d)} ${areaLabel(unit)}`;
}

/** Format a volume value (given in mm³) for display. */
export function formatVolume(mm3: number, unit: LengthUnit, decimals?: number): string {
  const factor = MM_TO[unit];
  const converted = mm3 * factor * factor * factor;
  const d = decimals ?? DEFAULT_DECIMALS[unit];
  return `${converted.toFixed(d)} ${volumeLabel(unit)}`;
}

/** Format a coordinate tuple (in mm) for display. */
export function formatCoord(mmValues: number[], unit: LengthUnit, decimals?: number): string {
  const d = decimals ?? DEFAULT_DECIMALS[unit];
  const parts = mmValues.map((v) => convertFromMm(v, unit).toFixed(d));
  return `(${parts.join(', ')}) ${unit}`;
}

/** Unit label for lengths. */
export function unitLabel(unit: LengthUnit): string {
  return unit;
}

/** Unit label for areas. */
export function areaLabel(unit: LengthUnit): string {
  return `${unit}²`;
}

/** Unit label for volumes. */
export function volumeLabel(unit: LengthUnit): string {
  return `${unit}³`;
}

/** Human-readable name for each unit. */
export const UNIT_NAMES: Record<LengthUnit, string> = {
  mm: 'Millimeters',
  cm: 'Centimeters',
  m: 'Meters',
  in: 'Inches',
  ft: 'Feet',
};

/** All supported length units in display order. */
export const LENGTH_UNITS: LengthUnit[] = ['mm', 'cm', 'm', 'in', 'ft'];
