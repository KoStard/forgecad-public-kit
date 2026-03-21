import { describe, test, expect, beforeAll } from 'vitest';
import { initKernel, Shape, getWasm } from '../src/forge/kernel';
import { extractEdgeSegments } from '../src/forge/meshEdgeExtraction';
import { selectEdge, selectEdges, coalesceEdges } from '../src/forge/edgeQuery';
import { filletEdgeSegment, chamferEdgeSegment } from '../src/forge/edgeSegmentFeatures';

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
    const box = makeBox(20, 20, 20);
    const edge = selectEdge(box, {
      parallel: [0, 0, 1],
      near: [0, 0, 10],
    });
    const result = filletEdgeSegment(box, edge, 2);
    expect(result).toBeInstanceOf(Shape);
    // The boolean fillet approach (cut corner box + union full cylinder) adds
    // material where the cylinder extends beyond adjacent faces on convex edges.
    // Net area change per cross-section = (π-1)×r² (cylinder area minus corner area).
    // This is a known limitation shared with the existing filletEdge() runtime.
    const expectedChange = (Math.PI - 1) * 4 * 20; // ≈ 171
    expect(Math.abs(result.volume() - (box.volume() + expectedChange))).toBeLessThan(20);
  });

  test('chamfers a box edge without error', () => {
    const box = makeBox(20, 20, 20);
    const edge = selectEdge(box, {
      parallel: [0, 0, 1],
      near: [0, 0, 10],
    });
    const result = chamferEdgeSegment(box, edge, 2);
    expect(result).toBeInstanceOf(Shape);
    expect(result.volume()).toBeLessThan(box.volume());
  });

  test('fillets on a boolean result', () => {
    const wasm = getWasm();
    const a = wasm.Manifold.cube([20, 20, 20], false);
    const b = wasm.Manifold.cube([10, 10, 30], false).translate(5, 5, -5);
    const m = wasm.Manifold.union([a, b]);
    const shape = new Shape(m);

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
