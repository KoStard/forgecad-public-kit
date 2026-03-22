/**
 * Programmatic Highlight API for Debugging
 *
 * Allows users to highlight edges/surfaces/objects from their .forge.js code
 * for visual debugging. Highlighted entities render with distinctive styling
 * in the viewport.
 *
 * Usage:
 *   highlight('L0');                                    // highlight edge L0 with default color
 *   highlight('L0', { color: 'red', label: 'base' });  // custom color + label
 *   highlight('P0', { pulse: true });                   // pulsing animation
 */

export interface HighlightDef {
  /** Entity ID to highlight (edge, point, surface, circle, arc). */
  entityId: string;
  /** Override color (CSS color string). Default: '#ff00ff' (magenta). */
  color?: string;
  /** Optional label to display near the entity. */
  label?: string;
  /** When true, animate opacity between 0.5 and 1.0 for attention. */
  pulse?: boolean;
}

let collectedHighlights: HighlightDef[] = [];

export function resetHighlights(): void {
  collectedHighlights = [];
}

export function getCollectedHighlights(): HighlightDef[] {
  return collectedHighlights;
}

/**
 * Mark an entity for visual highlighting in the viewport.
 *
 * @param entityId - The ID of the entity to highlight (e.g. 'L0', 'P0', 'C0')
 * @param opts - Optional styling: color, label, pulse animation
 */
export function highlight(
  entityId: string,
  opts?: { color?: string; label?: string; pulse?: boolean },
): void {
  if (typeof entityId !== 'string' || entityId.trim().length === 0) {
    throw new Error('highlight() requires a non-empty entity ID string');
  }
  collectedHighlights.push({
    entityId: entityId.trim(),
    color: opts?.color,
    label: opts?.label,
    pulse: opts?.pulse,
  });
}
