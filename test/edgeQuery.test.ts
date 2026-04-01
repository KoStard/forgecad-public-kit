import { describe, test, expect, beforeAll } from 'vitest';
import { initKernel, Shape, getWasm, box as kernelBox, cylinder as kernelCylinder } from '../src/forge/kernel';
import { extractEdgeSegments } from '../src/forge/mesh/meshEdgeExtraction';
import { selectEdge, selectEdges, coalesceEdges } from '../src/forge/query/edgeQuery';
import { filletEdgeSegment, chamferEdgeSegment } from '../src/forge/edge-features/edgeSegmentFeatures';

beforeAll(async () => {
  await initKernel();
});

function makeBox(x: number, y: number, z: number, center = false): Shape {
  const wasm = getWasm();
  const m = wasm.Manifold.cube([x, y, z], center);
  return new Shape(m);
}

function makeCylinder(h: number, r: number, segments = 32): Shape {
  const wasm = getWasm();
  const m = wasm.Manifold.cylinder(h, r, r, segments, false);
  return new Shape(m);
}

describe('meshEdgeExtraction', () => {
  test('extracts 12 edges from a box', () => {
    const box = makeBox(10, 10, 10);
    const mesh = box.getMesh();
    const edges = extractEdgeSegments({
      numProp: mesh.numProp,
      numTri: mesh.numTri,
      triVerts: mesh.triVerts,
      vertProperties: mesh.vertProperties,
      mergeFromVert: mesh.mergeFromVert,
      mergeToVert: mesh.mergeToVert,
    });
    expect(edges.length).toBe(12);
    // All edges of a box are 90° convex
    for (const e of edges) {
      expect(e.dihedralAngle).toBeCloseTo(90, 0);
      expect(e.convex).toBe(true);
      expect(e.length).toBeCloseTo(10, 1);
    }
  });

  test('box edges have correct start/end positions', () => {
    const box = makeBox(10, 20, 30);
    const mesh = box.getMesh();
    const edges = extractEdgeSegments({
      numProp: mesh.numProp,
      numTri: mesh.numTri,
      triVerts: mesh.triVerts,
      vertProperties: mesh.vertProperties,
      mergeFromVert: mesh.mergeFromVert,
      mergeToVert: mesh.mergeToVert,
    });
    // All edges should be of length 10, 20, or 30
    const lengths = edges.map(e => Math.round(e.length));
    expect(lengths.sort()).toEqual([10, 10, 10, 10, 20, 20, 20, 20, 30, 30, 30, 30]);
  });
});

describe('edgeQuery', () => {
  test('selectEdges returns all box edges', () => {
    const box = makeBox(10, 10, 10);
    const edges = selectEdges(box);
    expect(edges.length).toBe(12);
  });

  test('selectEdge with near: finds closest edge', () => {
    const box = makeBox(10, 20, 30);
    // Bottom-front edge at y=0, z=0 runs along x from 0 to 10
    const edge = selectEdge(box, { near: [5, 0, 0] });
    expect(edge.midpoint[1]).toBeCloseTo(0, 0);
    expect(edge.midpoint[2]).toBeCloseTo(0, 0);
  });

  test('selectEdges with parallel filter', () => {
    const box = makeBox(10, 20, 30);
    // Only edges parallel to Z axis (length 30)
    const zEdges = selectEdges(box, { parallel: [0, 0, 1] });
    expect(zEdges.length).toBe(4);
    for (const e of zEdges) {
      expect(e.length).toBeCloseTo(30, 1);
    }
  });

  test('selectEdges with convex filter', () => {
    const box = makeBox(10, 10, 10);
    const convex = selectEdges(box, { convex: true });
    expect(convex.length).toBe(12); // All box edges are convex
  });

  test('selectEdges with minAngle/maxAngle', () => {
    const box = makeBox(10, 10, 10);
    const edges = selectEdges(box, { minAngle: 80, maxAngle: 100 });
    expect(edges.length).toBe(12); // All 90°
  });

  test('selectEdges with atZ', () => {
    const box = makeBox(10, 10, 10);
    // Bottom edges at z=0
    const bottom = selectEdges(box, { atZ: 0, tolerance: 0.1 });
    expect(bottom.length).toBe(4);
    // Top edges at z=10
    const top = selectEdges(box, { atZ: 10, tolerance: 0.1 });
    expect(top.length).toBe(4);
  });

  test('selectEdge throws when no match', () => {
    const box = makeBox(10, 10, 10);
    expect(() => selectEdge(box, { minAngle: 180 })).toThrow('no edges match');
  });
});

describe('coalesceEdges', () => {
  test('collinear segments merge into one', () => {
    const cyl = makeCylinder(20, 5, 8); // Octagonal cylinder
    const edges = selectEdges(cyl, { parallel: [0, 0, 1] });
    // Should have multiple segments per vertical "edge" due to tessellation
    const coalesced = coalesceEdges(edges);
    // After coalescing, should have 8 vertical edges (one per octagon side)
    expect(coalesced.length).toBe(8);
    for (const e of coalesced) {
      expect(e.length).toBeCloseTo(20, 1);
    }
  });
});

describe('filletEdgeSegment', () => {
  test('fillets a box edge without error', () => {
    const b = kernelBox(20, 20, 20);
    const edge = selectEdge(b, {
      parallel: [0, 0, 1],
      near: [0, 0, 10],
    });
    const boxVol = b.volume();
    const result = filletEdgeSegment(b, edge, 2);
    expect(result).toBeInstanceOf(Shape);
    // Crescent approach removes sharp corner, keeps arc surface.
    // Net loss per cross-section = r² - πr²/4 = (1 - π/4)×r² ≈ 0.215×r²
    const expectedLoss = (1 - Math.PI / 4) * 4 * 20; // ≈ 17.2
    expect(result.volume()).toBeLessThan(boxVol);
    expect(result.volume()).toBeGreaterThan(boxVol - expectedLoss - 5);
  });

  test('chamfers a box edge without error', () => {
    const b = kernelBox(20, 20, 20);
    const edge = selectEdge(b, {
      parallel: [0, 0, 1],
      near: [0, 0, 10],
    });
    const result = chamferEdgeSegment(b, edge, 2);
    expect(result).toBeInstanceOf(Shape);
    expect(result.volume()).toBeLessThan(b.volume());
  });

  test('fillets on a boolean result', () => {
    const a = kernelBox(20, 20, 20);
    const b = kernelBox(10, 10, 30).translate(5, 5, -5);
    const shape = a.add(b);

    const edges = selectEdges(shape, { parallel: [0, 0, 1] });
    expect(edges.length).toBeGreaterThan(4); // More than a plain box due to boolean

    const edge = selectEdge(shape, {
      parallel: [0, 0, 1],
      near: [0, 0, 10],
      convex: true,
    });
    const result = filletEdgeSegment(shape, edge, 1);
    expect(result).toBeInstanceOf(Shape);
  });

  test('fillets a non-90° edge (triangular prism)', () => {
    // Build an equilateral triangular prism: 60° dihedral angles
    const side = 20;
    const h = side * Math.sqrt(3) / 2; // height of equilateral triangle
    const prismLength = 30;
    const prism = kernelCylinder(prismLength, side / Math.sqrt(3), undefined, 3);

    // Select a vertical edge (along Z) — should have ~60° dihedral angle
    const edges = selectEdges(prism, { parallel: [0, 0, 1] });
    expect(edges.length).toBe(3);
    for (const e of edges) {
      // Equilateral triangle prism edges have 60° dihedral angle
      expect(e.dihedralAngle).toBeCloseTo(60, 0);
      expect(e.length).toBeCloseTo(prismLength, 1);
    }

    // Fillet one edge
    const edge = selectEdge(prism, { parallel: [0, 0, 1], near: [side / Math.sqrt(3), 0, 15] });
    const prismVol = prism.volume();
    const r = 2;
    const result = filletEdgeSegment(prism, edge, r);
    expect(result).toBeInstanceOf(Shape);
    expect(result.volume()).toBeLessThan(prismVol);
    // For a 60° dihedral angle (α = π/3):
    //   Kite area   = r² / tan(α/2)      (quadrilateral: origin, tangentA, center, tangentB)
    //   Arc sector  = r² × (π - α) / 2   (120° arc sector)
    //   Crescent/length = kite - arc ≈ 2.74 × (for r=1)
    const alpha = 60 * Math.PI / 180;
    const expectedLoss = (1 / Math.tan(alpha / 2) - (Math.PI - alpha) / 2) * r * r * prismLength;
    expect(result.volume()).toBeGreaterThan(prismVol - expectedLoss - 10);
  });

  test('fillets obtuse angle edge (hexagonal prism)', () => {
    // Regular hexagon prism: 120° dihedral angles at each edge
    const outerR = 15;
    const prismLength = 25;
    const hex = kernelCylinder(prismLength, outerR, undefined, 6);

    // Vertical edges should have 120° dihedral
    const edges = selectEdges(hex, { parallel: [0, 0, 1] });
    expect(edges.length).toBe(6);
    for (const e of edges) {
      expect(e.dihedralAngle).toBeCloseTo(120, 0);
    }

    // Fillet one edge
    const edge = selectEdge(hex, { parallel: [0, 0, 1], near: [outerR, 0, 12] });
    const hexVol = hex.volume();
    const result = filletEdgeSegment(hex, edge, 2);
    expect(result).toBeInstanceOf(Shape);
    expect(result.volume()).toBeLessThan(hexVol);
    expect(result.volume()).toBeGreaterThan(hexVol * 0.95);
  });

  test('chamfers a non-90° edge', () => {
    // Equilateral triangular prism via kernel cylinder with 3 segments
    const side = 20;
    const prism = kernelCylinder(30, side / Math.sqrt(3), undefined, 3);

    const edge = selectEdge(prism, { parallel: [0, 0, 1], near: [side / Math.sqrt(3), 0, 15] });
    const result = chamferEdgeSegment(prism, edge, 2);
    expect(result).toBeInstanceOf(Shape);
    expect(result.volume()).toBeLessThan(prism.volume());
  });

  test('rejects zero-length edge', () => {
    const box = makeBox(10, 10, 10);
    const fakeEdge = {
      index: 0, start: [0, 0, 0] as [number, number, number],
      end: [0, 0, 0] as [number, number, number],
      midpoint: [0, 0, 0] as [number, number, number],
      direction: [0, 0, 1] as [number, number, number],
      length: 0, dihedralAngle: 90, convex: true,
      normalA: [1, 0, 0] as [number, number, number],
      normalB: [0, 1, 0] as [number, number, number],
      boundary: false,
    };
    expect(() => filletEdgeSegment(box, fakeEdge, 1)).toThrow('too short');
  });
});
