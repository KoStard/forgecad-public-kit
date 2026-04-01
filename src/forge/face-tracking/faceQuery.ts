/**
 * FaceQuery — declarative face selector types and canonical name resolution.
 *
 * Downstream workstreams use `FaceSelector` to identify faces either by a
 * string name (compile-plan name or canonical direction) or by a structured
 * `FaceQuery` object that matches by geometry.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FaceQuery {
  /** Filter by face normal direction (cosine similarity > 0.9998) */
  normal?: [number, number, number];
  /** Pick face whose centroid is nearest to this point (XY or XYZ) */
  nearest?: [number, number] | [number, number, number];
  /** Pick face containing/nearest to this world point */
  at?: [number, number, number];
  /** Disambiguation when multiple faces match */
  pick?: 'largest' | 'smallest' | 'max-x' | 'max-y' | 'max-z' | 'min-x' | 'min-y' | 'min-z';
  /** Filter by area range (mm²) */
  area?: { min?: number; max?: number };
  /** Only match planar faces (default: true) */
  planar?: boolean;
}

export type FaceSelector = string | FaceQuery;

// ─── Canonical name map ───────────────────────────────────────────────────────

const CANONICAL_QUERIES: Record<string, FaceQuery> = {
  back: { normal: [0, 1, 0], pick: 'max-y' },
  bottom: { normal: [0, 0, -1], pick: 'min-z' },
  front: { normal: [0, -1, 0], pick: 'min-y' },
  left: { normal: [-1, 0, 0], pick: 'min-x' },
  right: { normal: [1, 0, 0], pick: 'max-x' },
  top: { normal: [0, 0, 1], pick: 'max-z' },
};

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Converts a canonical face name to a `FaceQuery`, or returns `null` when the
 * name is not a canonical direction (i.e. it is a compile-plan label).
 */
export function canonicalQuery(name: string): FaceQuery | null {
  return CANONICAL_QUERIES[name] ?? null;
}

/**
 * Normalises a `FaceSelector` into its two possible lookup channels:
 *
 * - `compilePlanName` — the string label to look up in the compile plan's face
 *   registry (present for all string selectors, canonical or not).
 * - `query` — a structured geometry query (present for canonical strings and
 *   explicit `FaceQuery` objects; `null` for non-canonical string selectors).
 */
export function normalizeFaceSelector(selector: FaceSelector): {
  compilePlanName: string | null;
  query: FaceQuery | null;
} {
  if (typeof selector === 'string') {
    return { compilePlanName: selector, query: canonicalQuery(selector) };
  }
  return { compilePlanName: null, query: selector };
}
