#!/usr/bin/env node
/**
 * Detailed profiling of the remaining slow constrain() calls.
 * Traces whether the incremental solve converges or wastes time.
 */
import { initKernel } from '../src/forge/kernel';
import { constrainedSketch, ConstrainedSketchBuilder } from '../src/forge/sketch/constraints/builder';
import { initSolverWasm } from '../src/forge/sketch/constraints/solver-wasm';
import { DEFAULT_TOLERANCE, solveConstraints } from '../src/forge/sketch/constraints/registry';
import '../src/forge/sketch/constraints/defs';

async function main() {
  await initSolverWasm();
  await initKernel();

  const origConstrain = ConstrainedSketchBuilder.prototype.constrain;
  let cIdx = 0;

  ConstrainedSketchBuilder.prototype.constrain = function (constraint: any) {
    cIdx++;
    const t0 = performance.now();
    const result = origConstrain.call(this, constraint);
    const t1 = performance.now();
    const ms = t1 - t0;
    if (ms > 2) {
      // Check if the solve actually converged
      const self = this as any;
      const def = self.buildDefinition();
      const { maxError } = solveConstraints(
        { ...def, points: def.points.map((p: any) => ({...p})), lines: def.lines.map((l: any) => ({...l})), circles: def.circles.map((c: any) => ({...c})), arcs: (def.arcs ?? []).map((a: any) => ({...a})) },
        { iterations: 1, tolerance: DEFAULT_TOLERANCE, restarts: 1, warmStartIterations: 0 },
      );
      console.log(`  #${String(cIdx).padStart(3)} ${constraint.type.padEnd(22)} ${ms.toFixed(0).padStart(5)}ms  postSolveErr=${maxError.toFixed(4)}  ${maxError <= DEFAULT_TOLERANCE ? '✓ converged' : '✗ NOT converged'}`);
    }
    return result;
  };

  console.log('Slow constraints (>2ms) with convergence check:\n');
  const sk = buildSpectrogram();
  const result = sk.solve({ iterations: 200, restarts: 12 });
  console.log(`\nFinal: maxErr=${result.constraintMeta.maxError.toFixed(4)}`);

  function buildSpectrogram() {
    const sk = constrainedSketch();
    function eqTriangle(p1: string, p2: string, p3: string) {
      const l1 = sk.line(p1, p2); const l2 = sk.line(p2, p3); const l3 = sk.line(p3, p1);
      sk.equal(l1, l2); sk.equal(l1, l3); sk.ccw(p1, p2, p3);
      return { points: [p1, p2, p3], lines: [l1, l2, l3], shape: sk.shape([l1, l2, l3]) };
    }
    function getLine(p1?: string, p2?: string) {
      if (!p1) p1 = sk.point(0, 0); if (!p2) p2 = sk.point(0, 1);
      return { points: [p1, p2], line: sk.line(p1, p2) };
    }
    function getLines(p1: string, p2: string, count: number) {
      const results: ReturnType<typeof getLine>[] = []; let nextStart = p1;
      for (let i = 0; i < count; i++) {
        const line = i === count - 1 ? getLine(nextStart, p2) : getLine(nextStart);
        nextStart = line.points[1]; results.push(line);
      }
      sk.ccw(...results.map((obj) => obj.points[0]));
      return results;
    }
    const origin = sk.point(0, 0); sk.fix(origin);
    const innerTri = eqTriangle(origin, sk.point(1, 1), sk.point(0, 5));
    const outerTri = eqTriangle(sk.point(0, 0), sk.point(1, 1), sk.point(0, 5));
    sk.length(innerTri.lines[0], 22);
    sk.lineDistance(innerTri.lines[0], outerTri.lines[0], -2);
    sk.shapeEqualCentroid(innerTri.shape, outerTri.shape);
    sk.absoluteAngle(innerTri.lines[0], 46);
    const llp = sk.point(0, 0);
    sk.pointOnLine(llp, innerTri.lines[1]);
    sk.pointLineDistance(llp, innerTri.lines[0], 8.42);
    const caseExt = getLines(outerTri.points[0], outerTri.points[2], 5);
    sk.absoluteAngle(caseExt[0].line, -90); sk.absoluteAngle(caseExt[1].line, 0);
    sk.absoluteAngle(caseExt[2].line, 90); sk.absoluteAngle(caseExt[3].line, 180);
    sk.absoluteAngle(caseExt[4].line, -90);
    const intSP = sk.point(0, 0); sk.pointOnLine(intSP, outerTri.lines[0]);
    const intEP = sk.point(0, 0); sk.pointOnLine(intEP, outerTri.lines[1]);
    const caseInt = getLines(intSP, intEP, 5);
    for (let i = 0; i < 5; i++) sk.lineDistance(caseExt[i].line, caseInt[i].line, 5);
    const openP1 = sk.point(0, 0); const attachMid = sk.point(0, 0);
    const openLines = getLines(openP1, openP1, 4);
    sk.parallel(openLines[0].line, openLines[2].line);
    sk.parallel(openLines[1].line, openLines[3].line);
    sk.length(openLines[0].line, 4);
    sk.perpendicular(openLines[0].line, openLines[1].line);
    sk.lineDistance(openLines[0].line, caseInt[2].line, 0);
    sk.lineDistance(openLines[2].line, caseExt[2].line, 0);
    sk.midpoint(attachMid, openLines[0].line);
    sk.midpoint(attachMid, caseInt[2].line);
    const camP1 = sk.point(0, 0); const camExt = getLines(camP1, camP1, 4);
    sk.pointOnLine(camExt[0].points[0], caseInt[3].line);
    sk.pointOnLine(camExt[0].points[1], caseInt[3].line);
    sk.pointOnLine(camExt[2].points[0], caseInt[1].line);
    sk.pointOnLine(camExt[2].points[1], caseInt[1].line);
    sk.perpendicular(caseInt[3].line, camExt[1].line);
    sk.perpendicular(caseInt[3].line, camExt[3].line);
    const camP2 = sk.point(0, 0); const camInt = getLines(camP2, camP2, 4);
    for (let i = 0; i < 4; i++) sk.lineDistance(camExt[i].line, camInt[i].line, 2);
    sk.lineDistance(camInt[1].line, camInt[3].line, 2);
    sk.lineDistance(camInt[3].line, caseInt[2].line, -14);
    sk.length(camExt[1].line, 38);
    const mp = sk.point(0, 0); sk.midpoint(mp, camExt[1].line);
    const lightLine = getLine(llp, mp);
    sk.length(lightLine.line, 21.5);
    sk.perpendicular(lightLine.line, camExt[1].line);
    return sk;
  }
}

main();
