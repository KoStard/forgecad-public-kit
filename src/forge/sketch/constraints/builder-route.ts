/**
 * High-level route() method for ConstrainedSketchBuilder.
 * Expands a sequence of geometric elements (lines, circles, fillets, tangent arcs)
 * into constrained sketch entities with proper tangency/coincident constraints.
 *
 * Augments the prototype via side-effect import from index.ts.
 */
import type { ArcId, CircleId, LineId, PointId } from './types';
import { ConstrainedSketchBuilder } from './builder';

// ── Route step types ────────────────────────────────────────────────────────

/** A construction line defined by axis and offset. */
export interface RouteLine {
  /** 'x' for vertical line at x=offset, 'y' for horizontal line at y=offset */
  axis: 'x' | 'y';
  offset: number;
}

/** A construction circle for routing. */
export interface RouteCircle {
  center: [number, number];
  radius: number;
}

/** Reference to a named or existing line/circle in the sketch. */
export interface RouteRef {
  ref: LineId | CircleId;
}

/** Tangent entry onto a construction circle. */
export interface RouteTangent {
  tangent: RouteCircle | CircleId;
}

/** Fillet arc connecting two adjacent route segments. */
export interface RouteFillet {
  fillet: number;
}

/** Free tangent arc (solver finds center). */
export interface RouteTangentArc {
  tangentArc: number; // radius
}

/** A point to route through. */
export interface RoutePoint {
  point: [number, number];
}

/** Clip a line to a specific coordinate. */
export interface RouteUntil {
  line: RouteLine | LineId;
  until: number; // The coordinate value to clip to (y for vertical, x for horizontal)
}

export type RouteStep =
  | RouteLine
  | RouteCircle
  | RouteTangent
  | RouteFillet
  | RouteTangentArc
  | RoutePoint
  | RouteUntil;

// ── Type guards ─────────────────────────────────────────────────────────────

function isRouteLine(s: RouteStep): s is RouteLine {
  return 'axis' in s && 'offset' in s;
}

function isRouteCircle(s: RouteStep): s is RouteCircle {
  return 'center' in s && 'radius' in s;
}

function isRouteTangent(s: RouteStep): s is RouteTangent {
  return 'tangent' in s;
}

function isRouteFillet(s: RouteStep): s is RouteFillet {
  return 'fillet' in s;
}

function isRouteTangentArc(s: RouteStep): s is RouteTangentArc {
  return 'tangentArc' in s;
}

function isRoutePoint(s: RouteStep): s is RoutePoint {
  return 'point' in s;
}

function isRouteUntil(s: RouteStep): s is RouteUntil {
  return 'line' in s && 'until' in s;
}

// ── Internal types for the routing algorithm ─────────────────────────────────

/**
 * A resolved segment in the route: either a line segment or an arc.
 * These are the "bones" that the router connects with fillets/tangent arcs.
 */
type ResolvedSegment =
  | { kind: 'lineSeg'; lineId: LineId; startPt: PointId; endPt: PointId }
  | {
      kind: 'circleArc';
      circleId: CircleId;
      center: [number, number];
      radius: number;
      entryPt: PointId;
      exitPt: PointId;
      arcId: ArcId;
    };

// ── Declare the method on the builder ────────────────────────────────────────

declare module './builder' {
  interface ConstrainedSketchBuilder {
    /**
     * Route a profile through a sequence of geometric elements.
     * The solver computes all tangent points and intersections automatically.
     *
     * Steps can include:
     * - `{ point: [x, y] }` — route through a point
     * - `{ axis: 'x'|'y', offset: n }` — follow a construction line
     * - `{ line: {...}, until: n }` — follow a line clipped to a coordinate
     * - `{ tangent: { center, radius } }` — tangent arc onto a construction circle
     * - `{ fillet: radius }` — fillet between adjacent elements
     * - `{ tangentArc: radius }` — free tangent arc (solver finds center)
     *
     * Returns `this` for chaining. Call `.solve()` after to get the Sketch.
     */
    route(steps: RouteStep[]): this;
  }
}

const proto = ConstrainedSketchBuilder.prototype as any;

/**
 * Estimate a reasonable initial position for a tangent point on a circle,
 * given the "from" direction (previous element's approximate position).
 */
function estimateTangentPoint(
  cx: number,
  cy: number,
  r: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): [number, number] {
  // Place the tangent point on the circle between the "from" and "to" directions
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;
  const dx = midX - cx;
  const dy = midY - cy;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9) {
    // Fall back: place on the side facing "from"
    const fdx = fromX - cx;
    const fdy = fromY - cy;
    const fd = Math.hypot(fdx, fdy);
    if (fd < 1e-9) return [cx + r, cy];
    return [cx + (fdx / fd) * r, cy + (fdy / fd) * r];
  }
  return [cx + (dx / d) * r, cy + (dy / d) * r];
}

/**
 * Estimate a fillet arc center position between two points.
 */
function estimateFilletCenter(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  filletR: number,
): [number, number] {
  // Place center perpendicular to the midpoint, offset inward
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9) return [mx + filletR, my];
  // Perpendicular direction (left of segment)
  const px = -dy / d;
  const py = dx / d;
  // Offset by sqrt(r² - (d/2)²) or just r if segment is short
  const halfD = d / 2;
  const h = filletR > halfD ? Math.sqrt(filletR * filletR - halfD * halfD) : filletR * 0.5;
  return [mx + px * h, my + py * h];
}

proto.route = function (this: any, steps: RouteStep[]): any {
  if (steps.length < 2) throw new Error('route(): need at least 2 steps');

  // ─── Phase 1: Classify steps into "structural" and "connectors" ───────
  // Structural: points, lines, line-until, circles/tangent circles
  // Connectors: fillets, tangent arcs (inserted between structural elements)

  // We'll build the profile incrementally. The approach:
  // 1. Walk through steps, creating points/entities for each structural element
  // 2. For connectors (fillet, tangentArc), create intermediate arc entities with
  //    tangency constraints to neighboring elements
  // 3. Wire everything with coincident constraints at junctions
  // 4. Register the profile loop

  const segments: Array<{
    kind: 'line' | 'arc';
    id: LineId | ArcId;
    startPt: PointId;
    endPt: PointId;
  }> = [];

  let cursorPt: PointId | null = null;
  let cursorX = 0;
  let cursorY = 0;
  // Track the last line created for lineTangentArc constraints
  let lastLineId: LineId | null = null;
  // Track the last arc created for arcTangentArc constraints
  let lastArcId: ArcId | null = null;

  const getCursorPos = (): [number, number] => {
    if (cursorPt) {
      const p = this.getPoint(cursorPt);
      if (p) return [p.x, p.y];
    }
    return [cursorX, cursorY];
  };

  // Helper: look ahead to find the next structural element's approximate position
  const peekNextStructuralPos = (fromIndex: number): [number, number] | null => {
    for (let j = fromIndex + 1; j < steps.length; j++) {
      const s = steps[j];
      if (isRoutePoint(s)) return s.point;
      if (isRouteCircle(s)) return s.center;
      if (isRouteTangent(s)) {
        const t = s.tangent;
        if (typeof t === 'object' && 'center' in t) return t.center;
      }
      if (isRouteUntil(s)) {
        const ln = s.line;
        if (typeof ln === 'object' && 'axis' in ln) {
          return ln.axis === 'x' ? [ln.offset, s.until] : [s.until, ln.offset];
        }
      }
      if (isRouteLine(s)) {
        // Approximate: use the cursor Y/X for the missing coordinate
        const [cx, cy] = getCursorPos();
        return s.axis === 'x' ? [s.offset, cy] : [cx, s.offset];
      }
    }
    return null;
  };

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    if (isRoutePoint(step)) {
      // ─── Point: create and connect ─────────────────────────────────
      const [px, py] = step.point;
      const ptId = this.point(px, py);

      if (cursorPt) {
        // Connect with a line from cursor to this point
        const lineId = this.line(cursorPt, ptId);
        segments.push({ kind: 'line', id: lineId, startPt: cursorPt, endPt: ptId });
        lastLineId = lineId;
        lastArcId = null;
      }

      cursorPt = ptId;
      cursorX = px;
      cursorY = py;
    } else if (isRouteLine(step)) {
      // ─── Bare line: create a construction line segment ─────────────
      // We need to figure out start and end points. The start is the cursor;
      // the end is determined by the next element.
      if (!cursorPt) throw new Error('route(): line step requires a preceding point or element');

      const nextPos = peekNextStructuralPos(i);
      const [cx, cy] = getCursorPos();

      let endX: number, endY: number;
      if (step.axis === 'x') {
        // Vertical line at x=offset. We move along Y.
        endX = step.offset;
        endY = nextPos ? nextPos[1] : cy + 50; // approximate
        // Also fix cursor X to the line offset
        if (Math.abs(cx - step.offset) > 1e-6) {
          this.fix(cursorPt, step.offset);
        }
      } else {
        // Horizontal line at y=offset. We move along X.
        endX = nextPos ? nextPos[0] : cx + 50;
        endY = step.offset;
        if (Math.abs(cy - step.offset) > 1e-6) {
          this.fix(cursorPt, undefined, step.offset);
        }
      }

      const endPtId = this.point(endX, endY);
      const lineId = this.line(cursorPt, endPtId);

      if (step.axis === 'x') {
        this.vertical(lineId);
      } else {
        this.horizontal(lineId);
      }

      segments.push({ kind: 'line', id: lineId, startPt: cursorPt, endPt: endPtId });
      lastLineId = lineId;
      lastArcId = null;
      cursorPt = endPtId;
      cursorX = endX;
      cursorY = endY;
    } else if (isRouteUntil(step)) {
      // ─── Line until: follow a line clipped to a coordinate ──────────
      if (!cursorPt) throw new Error('route(): line-until step requires a preceding element');

      const ln = step.line;
      let axis: 'x' | 'y';
      let offset: number;
      if (typeof ln === 'object' && 'axis' in ln) {
        axis = ln.axis;
        offset = ln.offset;
      } else {
        throw new Error('route(): line-until requires a RouteLine object (not a LineId reference yet)');
      }

      const [cx, cy] = getCursorPos();
      let endX: number, endY: number;

      if (axis === 'x') {
        // Vertical line at x=offset, go until y=step.until
        endX = offset;
        endY = step.until;
        // Fix cursor x to the line's offset if needed
        if (Math.abs(cx - offset) > 0.5) {
          // Cursor is not on the line — add a line to get there first
          const onLinePt = this.point(offset, cy);
          const connLine = this.line(cursorPt, onLinePt);
          segments.push({ kind: 'line', id: connLine, startPt: cursorPt, endPt: onLinePt });
          cursorPt = onLinePt;
        }
      } else {
        // Horizontal line at y=offset, go until x=step.until
        endX = step.until;
        endY = offset;
        if (Math.abs(cy - offset) > 0.5) {
          const onLinePt = this.point(cx, offset);
          const connLine = this.line(cursorPt, onLinePt);
          segments.push({ kind: 'line', id: connLine, startPt: cursorPt, endPt: onLinePt });
          cursorPt = onLinePt;
        }
      }

      const endPtId = this.point(endX, endY, true); // fixed endpoint
      const lineId = this.line(cursorPt!, endPtId);

      if (axis === 'x') {
        this.vertical(lineId);
      } else {
        this.horizontal(lineId);
      }

      segments.push({ kind: 'line', id: lineId, startPt: cursorPt!, endPt: endPtId });
      lastLineId = lineId;
      lastArcId = null;
      cursorPt = endPtId;
      cursorX = endX;
      cursorY = endY;
    } else if (isRouteTangent(step)) {
      // ─── Tangent to circle: create arc on circle with tangency ──────
      if (!cursorPt) throw new Error('route(): tangent step requires a preceding element');

      let cx: number, cy: number, r: number;
      let circleId: CircleId;

      const t = step.tangent;
      if (typeof t === 'string') {
        // It's a CircleId reference
        circleId = this.resolveCircleId(t);
        const circ = this.circles.find((c: any) => c.id === circleId);
        const center = this.getPoint(circ.center);
        cx = center.x;
        cy = center.y;
        r = circ.radius;
      } else {
        // It's a RouteCircle — create a construction circle
        cx = t.center[0];
        cy = t.center[1];
        r = t.radius;
        const centerPt = this.point(cx, cy, true);
        circleId = this.circle(centerPt, r, true); // construction=true
      }

      // Look ahead for exit direction
      const nextPos = peekNextStructuralPos(i);
      const [curX, curY] = getCursorPos();
      const [toX, toY] = nextPos ?? [curX + 20, curY + 20];

      // Estimate entry and exit tangent points on the circle
      const [entryX, entryY] = estimateTangentPoint(cx, cy, r, curX, curY, toX, toY);
      const [exitX, exitY] = estimateTangentPoint(cx, cy, r, toX, toY, curX, curY);

      // Create entry and exit points
      const entryPtId = this.point(entryX, entryY);
      const exitPtId = this.point(exitX, exitY);

      // Constrain entry and exit points to lie on the circle
      this.pointOnCircle(entryPtId, circleId);
      this.pointOnCircle(exitPtId, circleId);

      // Connect cursor to entry point with a line (if not from a fillet/tangentArc)
      if (lastArcId === null && cursorPt) {
        // Need a line from cursor to entry
        const connLineId = this.line(cursorPt, entryPtId);
        segments.push({ kind: 'line', id: connLineId, startPt: cursorPt, endPt: entryPtId });

        // The line should be tangent to the circle at the entry point
        this.tangent(connLineId, circleId);

        lastLineId = connLineId;
      } else if (lastArcId !== null) {
        // Previous element was an arc — make entry coincident with cursor
        this.coincident(cursorPt, entryPtId);
      }

      // Create the arc on the circle from entry to exit (CCW)
      const circ = this.circles.find((c: any) => c.id === circleId);
      const arcId = this.arcByCenter(circ.center, entryPtId, exitPtId, false);
      segments.push({ kind: 'arc', id: arcId, startPt: entryPtId, endPt: exitPtId });

      // If previous element was a line, add tangency constraint
      if (lastLineId && lastArcId === null) {
        this.lineTangentArc(lastLineId, arcId, true); // tangent at arc start
      }

      lastArcId = arcId;
      lastLineId = null;
      cursorPt = exitPtId;
      cursorX = exitX;
      cursorY = exitY;
    } else if (isRouteFillet(step)) {
      // ─── Fillet: insert tangent arc between neighbors ───────────────
      if (!cursorPt) throw new Error('route(): fillet step requires a preceding element');

      const filletR = step.fillet;
      const [curX, curY] = getCursorPos();
      const nextPos = peekNextStructuralPos(i);
      const [toX, toY] = nextPos ?? [curX + 20, curY];

      // Estimate fillet arc center and endpoints
      const [fcx, fcy] = estimateFilletCenter(curX, curY, toX, toY, filletR);

      // Create fillet arc: center, start (at cursor), end (toward next)
      const filletCenterPt = this.point(fcx, fcy);
      const filletStartPt = cursorPt; // reuse cursor as the junction point
      // Estimate exit point on the fillet
      const dx2 = toX - fcx;
      const dy2 = toY - fcy;
      const d2 = Math.hypot(dx2, dy2);
      const exitX = d2 > 1e-9 ? fcx + (dx2 / d2) * filletR : fcx + filletR;
      const exitY = d2 > 1e-9 ? fcy + (dy2 / d2) * filletR : fcy;
      const filletEndPt = this.point(exitX, exitY);

      // Create the arc
      const arcId = this.arcByCenter(filletCenterPt, filletStartPt, filletEndPt, true); // CW for inward fillet

      // Constrain fillet radius via distance from center to start point
      this.distance(filletCenterPt, filletStartPt, filletR);

      // Tangency with previous element
      if (lastLineId) {
        this.lineTangentArc(lastLineId, arcId, true); // tangent at arc start
      } else if (lastArcId) {
        this.arcTangentArc(lastArcId, arcId);
      }

      segments.push({ kind: 'arc', id: arcId, startPt: filletStartPt, endPt: filletEndPt });
      lastArcId = arcId;
      lastLineId = null;
      cursorPt = filletEndPt;
      cursorX = exitX;
      cursorY = exitY;
    } else if (isRouteTangentArc(step)) {
      // ─── Tangent arc: free arc, solver finds center ─────────────────
      if (!cursorPt) throw new Error('route(): tangentArc step requires a preceding element');

      const arcR = step.tangentArc;
      const [curX, curY] = getCursorPos();
      const nextPos = peekNextStructuralPos(i);
      const [toX, toY] = nextPos ?? [curX + 20, curY];

      // Estimate center and exit similarly to fillet
      const [acx, acy] = estimateFilletCenter(curX, curY, toX, toY, arcR);
      const dx2 = toX - acx;
      const dy2 = toY - acy;
      const d2 = Math.hypot(dx2, dy2);
      const exitX = d2 > 1e-9 ? acx + (dx2 / d2) * arcR : acx + arcR;
      const exitY = d2 > 1e-9 ? acy + (dy2 / d2) * arcR : acy;

      const arcCenterPt = this.point(acx, acy);
      const arcStartPt = cursorPt;
      const arcEndPt = this.point(exitX, exitY);

      // Create arc (CCW for convex bump)
      const arcId = this.arcByCenter(arcCenterPt, arcStartPt, arcEndPt, false);
      this.distance(arcCenterPt, arcStartPt, arcR);

      // Tangency with previous element
      if (lastLineId) {
        this.lineTangentArc(lastLineId, arcId, true);
      } else if (lastArcId) {
        this.arcTangentArc(lastArcId, arcId);
      }

      segments.push({ kind: 'arc', id: arcId, startPt: arcStartPt, endPt: arcEndPt });
      lastArcId = arcId;
      lastLineId = null;
      cursorPt = arcEndPt;
      cursorX = exitX;
      cursorY = exitY;
    } else if (isRouteCircle(step)) {
      // ─── Bare circle (same as tangent shorthand) ────────────────────
      // Treat as { tangent: step }
      const tangentStep: RouteTangent = { tangent: step };
      // Re-process as tangent (decrement i to re-visit with modified step)
      steps[i] = tangentStep;
      i--;
      continue;
    }
  }

  // ─── Phase 2: Close the path if first element matches last ────────────
  // Check if the first step was a point and the route should close
  const firstStep = steps[0];
  const lastStep = steps[steps.length - 1];
  if (isRoutePoint(firstStep) && segments.length > 0) {
    const firstSeg = segments[0];
    // If cursor is not already at the first point, close with a line
    if (cursorPt && cursorPt !== firstSeg.startPt) {
      const closingLine = this.line(cursorPt, firstSeg.startPt);
      segments.push({ kind: 'line', id: closingLine, startPt: cursorPt, endPt: firstSeg.startPt });

      // If last element was an arc, add tangency
      if (lastArcId) {
        this.lineTangentArc(closingLine, lastArcId, false); // tangent at arc end
      }
    }
  }

  // ─── Phase 3: Register the profile loop ───────────────────────────────
  if (segments.length > 0) {
    const profileSegs = segments.map((seg) =>
      seg.kind === 'line'
        ? { kind: 'line' as const, line: seg.id as LineId }
        : { kind: 'arc' as const, arc: seg.id as ArcId },
    );
    this.addProfileLoop(profileSegs);
  }

  return this;
};
