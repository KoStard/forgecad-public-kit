import type { DimensionDef } from './sketch/dimensions';

type Vec3 = [number, number, number];

export interface DimensionOwnerObject {
  id: string;
  name: string;
  bbox: {
    min: Vec3;
    max: Vec3;
  };
}

function pointInBounds(point: Vec3, bounds: DimensionOwnerObject['bbox'], tolerance: number): boolean {
  return (
    point[0] >= bounds.min[0] - tolerance &&
    point[0] <= bounds.max[0] + tolerance &&
    point[1] >= bounds.min[1] - tolerance &&
    point[1] <= bounds.max[1] + tolerance &&
    point[2] >= bounds.min[2] - tolerance &&
    point[2] <= bounds.max[2] + tolerance
  );
}

function pushLookup(map: Map<string, string[]>, key: string, id: string): void {
  const trimmed = key.trim();
  if (!trimmed) return;
  const list = map.get(trimmed) || [];
  list.push(id);
  map.set(trimmed, list);
}

function buildNameLookup(objects: DimensionOwnerObject[]): {
  byExact: Map<string, string[]>;
  bySuffix: Map<string, string[]>;
} {
  const byExact = new Map<string, string[]>();
  const bySuffix = new Map<string, string[]>();

  objects.forEach((obj) => {
    pushLookup(byExact, obj.name, obj.id);
    for (let dot = obj.name.indexOf('.'); dot >= 0; dot = obj.name.indexOf('.', dot + 1)) {
      pushLookup(bySuffix, obj.name.slice(dot + 1), obj.id);
    }
  });

  return { byExact, bySuffix };
}

function resolveExplicitOwnerIds(names: string[], lookup: ReturnType<typeof buildNameLookup>): string[] {
  const ids = new Set<string>();

  names.forEach((name) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const exact = lookup.byExact.get(trimmed) || [];
    if (exact.length === 1) {
      ids.add(exact[0]);
      return;
    }
    if (exact.length > 1) {
      return;
    }

    const suffix = lookup.bySuffix.get(trimmed) || [];
    if (suffix.length === 1) {
      ids.add(suffix[0]);
    }
  });

  return Array.from(ids);
}

export function mapDimensionsToOwnerIds(dimensions: DimensionDef[], objects: DimensionOwnerObject[]): Map<string, string[]> {
  const lookup = buildNameLookup(objects);
  const out = new Map<string, string[]>();

  for (const dim of dimensions) {
    const explicitNames = dim.components ?? [];
    if (explicitNames.length > 0) {
      out.set(dim.id, resolveExplicitOwnerIds(explicitNames, lookup));
      continue;
    }

    const tolerance = 1e-3;
    const candidates = objects
      .filter((obj) => pointInBounds(dim.from, obj.bbox, tolerance) && pointInBounds(dim.to, obj.bbox, tolerance))
      .map((obj) => obj.id);

    out.set(dim.id, candidates.length === 1 ? candidates : []);
  }

  return out;
}
