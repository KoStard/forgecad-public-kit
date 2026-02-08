#!/usr/bin/env node
/**
 * ForgeCAD CLI Test Runner
 * 
 * Usage: node cli-test.mjs <script.js> [output.stl]
 * 
 * Executes a ForgeCAD script and optionally exports to STL.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import Manifold WASM
import Module from 'manifold-3d';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node cli-test.mjs <script.js> [output.stl]');
    process.exit(1);
  }

  const scriptPath = resolve(args[0]);
  const outputPath = args[1] ? resolve(args[1]) : null;

  console.log('🔧 Initializing Manifold kernel...');
  const wasm = await Module();
  wasm.setup();
  wasm.setMinCircularAngle(2);
  wasm.setMinCircularEdgeLength(0.5);

  // Build ForgeCAD API
  const api = buildForgeAPI(wasm);

  console.log(`📜 Loading script: ${scriptPath}`);
  const code = readFileSync(scriptPath, 'utf-8');

  console.log('⚙️  Executing script...');
  const t0 = performance.now();
  
  try {
    const result = executeScript(code, api);
    const t1 = performance.now();
    
    console.log(`✅ Execution successful (${(t1 - t0).toFixed(2)}ms)`);
    
    if (result.params.length > 0) {
      console.log('\n📊 Parameters:');
      result.params.forEach(p => {
        console.log(`  - ${p.name}: ${p.value} ${p.unit || ''}`);
      });
    }

    if (result.shape) {
      const vol = result.shape.volume();
      const sa = result.shape.surfaceArea();
      console.log('\n📐 Geometry:');
      console.log(`  - Volume: ${vol.toFixed(2)} mm³`);
      console.log(`  - Surface Area: ${sa.toFixed(2)} mm²`);
      
      if (outputPath) {
        console.log(`\n💾 Exporting to: ${outputPath}`);
        const mesh = result.shape.manifold.getMesh();
        const stl = mesh.toSTL();
        writeFileSync(outputPath, stl);
        console.log('✅ Export complete');
      }
    } else if (result.sketch) {
      console.log('\n📐 2D Sketch:');
      console.log(`  - Area: ${result.sketch.area().toFixed(2)} mm²`);
      console.log('  ⚠️  Auto-extruding to 10mm for export');
      
      const shape = result.sketch.extrude(10);
      
      if (outputPath) {
        console.log(`\n💾 Exporting to: ${outputPath}`);
        const mesh = shape.manifold.getMesh();
        const stl = mesh.toSTL();
        writeFileSync(outputPath, stl);
        console.log('✅ Export complete');
      }
    } else {
      console.error('❌ Script did not return a Shape or Sketch');
      process.exit(1);
    }
    
  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
    console.error(e.stack);
    process.exit(1);
  }
}

function buildForgeAPI(wasm) {
  // Shape class
  class Shape {
    constructor(manifold) {
      this.manifold = manifold;
    }
    translate(x, y, z) { return new Shape(this.manifold.translate(x, y, z)); }
    rotate(x, y, z) { return new Shape(this.manifold.rotate(x, y, z)); }
    scale(v) { return new Shape(this.manifold.scale(v)); }
    mirror(n) { return new Shape(this.manifold.mirror(n)); }
    add(other) { return new Shape(this.manifold.add(other.manifold)); }
    subtract(other) { return new Shape(this.manifold.subtract(other.manifold)); }
    intersect(other) { return new Shape(this.manifold.intersect(other.manifold)); }
    volume() { 
      return this.manifold.volume();
    }
    surfaceArea() {
      return this.manifold.surfaceArea();
    }
    boundingBox() {
      return this.manifold.boundingBox();
    }
  }

  // Sketch class
  class Sketch {
    constructor(contours) {
      this.contours = contours;
    }
    translate(x, y = 0) { return new Sketch(this.contours.translate(x, y)); }
    rotate(deg) { return new Sketch(this.contours.rotate(deg)); }
    scale(v) { return new Sketch(this.contours.scale(Array.isArray(v) ? v : [v, v])); }
    mirror(n) { return new Sketch(this.contours.mirror(n)); }
    add(other) { return new Sketch(this.contours.add(other.contours)); }
    subtract(other) { return new Sketch(this.contours.subtract(other.contours)); }
    intersect(other) { return new Sketch(this.contours.intersect(other.contours)); }
    hull() { return new Sketch(this.contours.hull()); }
    offset(delta, join = 'Round') { return new Sketch(this.contours.offset(delta, join)); }
    extrude(h, opts = {}) {
      const m = this.contours.extrude(h, opts.divisions || 0, opts.twist || 0, opts.scaleTop);
      return new Shape(m);
    }
    revolve(deg = 360, seg) { return new Shape(this.contours.revolve(seg, deg)); }
    area() { return this.contours.area(); }
  }

  // Primitives
  const box = (x, y, z, center = false) => {
    const m = wasm.Manifold.cube([x, y, z], center);
    return new Shape(m);
  };

  const cylinder = (h, r, r2, seg, center = false) => {
    const m = wasm.Manifold.cylinder(h, r, r2 || r, seg || 0, center);
    return new Shape(m);
  };

  const sphere = (r, seg) => {
    const m = wasm.Manifold.sphere(r, seg || 0);
    return new Shape(m);
  };

  // Booleans
  const union = (...shapes) => {
    const ms = shapes.map(s => s.manifold);
    return new Shape(wasm.Manifold.union(ms));
  };

  const difference = (...shapes) => {
    const ms = shapes.map(s => s.manifold);
    return new Shape(wasm.Manifold.difference(ms));
  };

  const intersection = (...shapes) => {
    const ms = shapes.map(s => s.manifold);
    return new Shape(wasm.Manifold.intersection(ms));
  };

  // 2D Primitives
  const rect = (w, h, center = false) => {
    const c = wasm.CrossSection.square([w, h], center);
    return new Sketch(c);
  };

  const circle2d = (r, seg) => {
    const c = wasm.CrossSection.circle(r, seg || 0);
    return new Sketch(c);
  };

  const polygon = (pts) => {
    const c = wasm.CrossSection.ofPolygons([pts]);
    return new Sketch(c);
  };

  const ngon = (n, r) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return polygon(pts);
  };

  const roundedRect = (w, h, r, center = false) => {
    return rect(w, h, center).offset(-r, 'Round').offset(r, 'Round');
  };

  const ellipse = (rx, ry, seg) => {
    return circle2d(1, seg).scale([rx, ry]);
  };

  const slot = (len, w) => {
    const r = w / 2;
    return union2d(
      rect(len - w, w, true),
      circle2d(r).translate(-(len - w) / 2, 0),
      circle2d(r).translate((len - w) / 2, 0)
    );
  };

  const star = (n, ro, ri) => {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? ro : ri;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return polygon(pts);
  };

  // 2D Booleans
  const union2d = (...sketches) => {
    const cs = sketches.map(s => s.contours);
    return new Sketch(wasm.CrossSection.union(cs));
  };

  const difference2d = (...sketches) => {
    const cs = sketches.map(s => s.contours);
    return new Sketch(wasm.CrossSection.difference(cs));
  };

  const intersection2d = (...sketches) => {
    const cs = sketches.map(s => s.contours);
    return new Sketch(wasm.CrossSection.intersection(cs));
  };

  const hull2d = (...sketches) => {
    const cs = sketches.map(s => s.contours);
    return new Sketch(wasm.CrossSection.hull(cs));
  };

  // Parameters (CLI mode - just return defaults)
  const params = {};
  const param = (name, def, opts = {}) => {
    if (!(name in params)) {
      params[name] = def;
      console.log(`  📌 ${name} = ${def} ${opts.unit || ''}`);
    }
    return params[name];
  };

  return {
    Shape, Sketch,
    box, cylinder, sphere,
    union, difference, intersection,
    rect, circle2d, roundedRect, polygon, ngon, ellipse, slot, star,
    union2d, difference2d, intersection2d, hull2d,
    param,
    params: () => Object.entries(params).map(([name, value]) => ({ name, value }))
  };
}

function executeScript(code, api) {
  const fn = new Function(
    'box', 'cylinder', 'sphere',
    'union', 'difference', 'intersection',
    'rect', 'circle2d', 'roundedRect', 'polygon', 'ngon', 'ellipse', 'slot', 'star',
    'union2d', 'difference2d', 'intersection2d', 'hull2d',
    'param', 'Shape', 'Sketch',
    `"use strict";\n${code}`
  );

  const result = fn(
    api.box, api.cylinder, api.sphere,
    api.union, api.difference, api.intersection,
    api.rect, api.circle2d, api.roundedRect, api.polygon, api.ngon, api.ellipse, api.slot, api.star,
    api.union2d, api.difference2d, api.intersection2d, api.hull2d,
    api.param, api.Shape, api.Sketch
  );

  return {
    shape: result instanceof api.Shape ? result : null,
    sketch: result instanceof api.Sketch ? result : null,
    params: api.params()
  };
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
