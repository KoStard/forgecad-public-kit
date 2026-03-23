/**
 * Draw mode state management.
 *
 * Manages the interactive drawing session: active tool, pending clicks,
 * snap detection, entity selection, constraint application, and code generation.
 * Each draw action appends statements to the session, regenerates the sketch
 * code, and updates the file.
 */
import { create } from 'zustand';
import {
  type DrawSessionState,
  type DrawnPoint,
  generateSketchCode,
  pointStatement,
  lineStatement,
  circleStatement,
  arcStatement,
  constraintStatement,
  roundCoord,
} from './codegen';
import { useForgeStore } from '../store/forgeStore';

// ─── Tool types ──────────────────────────────────────────────────────────────

/** Drawing tools create geometry. */
export type DrawingTool =
  | 'point' | 'line' | 'polyline' | 'rectangle' | 'circle'
  | 'arc' | 'polygon' | 'ellipse' | 'slot';

/** Edit tools modify existing geometry. */
export type EditTool = 'trim' | 'mirror' | 'offset';

/** Constraint tools apply constraints to selected entities. */
export type ConstraintTool =
  | 'c:horizontal' | 'c:vertical' | 'c:length' | 'c:distance'
  | 'c:angle' | 'c:radius' | 'c:parallel' | 'c:perpendicular'
  | 'c:coincident' | 'c:tangent' | 'c:equal' | 'c:fixed'
  | 'c:midpoint' | 'c:symmetric' | 'c:concentric'
  | 'c:pointOnLine' | 'c:pointOnCircle';

/** Special mode for selection without a specific tool. */
export type SelectTool = 'select';

export type DrawTool = DrawingTool | EditTool | ConstraintTool | SelectTool;

/** Whether the given tool is a constraint tool. */
export function isConstraintTool(tool: DrawTool): tool is ConstraintTool {
  return tool.startsWith('c:');
}

/** Whether the given tool is an edit tool. */
export function isEditTool(tool: DrawTool): tool is EditTool {
  return tool === 'trim' || tool === 'mirror' || tool === 'offset';
}

/** Whether the given tool is a drawing tool. */
export function isDrawingTool(tool: DrawTool): tool is DrawingTool {
  return !tool.startsWith('c:') && tool !== 'select' && !isEditTool(tool);
}

// ─── Entity selection ────────────────────────────────────────────────────────

export interface SelectedEntity {
  type: 'point' | 'line' | 'circle' | 'arc';
  varName: string;
  x?: number;
  y?: number;
}

// ─── Snap ────────────────────────────────────────────────────────────────────

/** Snap type for visual indicator differentiation. */
export type SnapType = 'point' | 'midpoint' | 'intersection' | 'perpendicular' | 'grid' | 'none';

/** Snap result: the snapped coordinate and whether it snapped to an existing point. */
export interface SnapResult {
  x: number;
  y: number;
  /** Variable name of the snapped-to point, if any. */
  snappedToVar: string | null;
  /** Whether x was axis-snapped to an existing point. */
  xAligned: boolean;
  /** Whether y was axis-snapped to an existing point. */
  yAligned: boolean;
  /** Type of snap for visual indicator. */
  snapType: SnapType;
}

// ─── Tracked entities (for constraint selection) ─────────────────────────────

export interface DrawnLine {
  varName: string;
  startVar: string;
  endVar: string;
}

export interface DrawnCircle {
  varName: string;
  centerVar: string;
  radius: number;
}

export interface DrawnArc {
  varName: string;
  p1Var: string;
  p2Var: string;
  p3Var: string;
}

// ─── State ───────────────────────────────────────────────────────────────────

interface DrawState {
  active: boolean;
  tool: DrawTool;

  // Session state
  statements: string[];
  points: DrawnPoint[];
  lines: DrawnLine[];
  circles: DrawnCircle[];
  arcs: DrawnArc[];
  nextPointIdx: number;
  nextLineIdx: number;
  nextCircleIdx: number;
  nextArcIdx: number;

  // In-progress interaction
  pendingClicks: { x: number; y: number; snappedToVar: string | null }[];
  previewPoint: { x: number; y: number } | null;
  snapResult: SnapResult | null;

  // Entity selection (for constraint tools)
  selectedEntities: SelectedEntity[];

  // Hovered entity (for visual highlight feedback)
  hoveredEntity: SelectedEntity | null;

  // Dimension input state
  dimensionInput: { constraintType: string; resolve: (value: number) => void } | null;

  // Exit confirmation
  showExitConfirm: boolean;

  // Construction mode toggle
  constructionMode: boolean;

  // Construction entities (varNames of entities created in construction mode)
  constructionEntities: Set<string>;

  // Mirror line variable name (for mirror tool)
  mirrorLineVar: string | null;

  // Polygon sides
  polygonSides: number;

  // The file being drawn into
  targetFile: string | null;

  // Actions
  enterDrawMode: () => void;
  requestExit: () => void;
  confirmExit: () => void;
  cancelExit: () => void;
  exitDrawMode: () => void;
  setTool: (tool: DrawTool) => void;
  handleClick: (x: number, y: number) => void;
  handleDoubleClick: (x: number, y: number) => void;
  setPreviewPoint: (pt: { x: number; y: number } | null) => void;
  cancelPending: () => void;
  undo: () => void;
  selectEntity: (entity: SelectedEntity) => void;
  clearSelection: () => void;
  applyConstraint: (tool: ConstraintTool, value?: number) => void;
  setDimensionInput: (input: DrawState['dimensionInput']) => void;
  setHoveredEntity: (entity: SelectedEntity | null) => void;
  toggleConstructionMode: () => void;
  setPolygonSides: (n: number) => void;
  deleteEntity: (varName: string) => void;
}

const POINT_SNAP_THRESHOLD = 3; // world units (mm)
const AXIS_SNAP_THRESHOLD = 1.5; // world units for axis alignment
const ANGLE_SNAP_THRESHOLD_DEG = 3; // degrees for near-H/V detection

/** Resolve line endpoint coordinates from points array. */
function resolveLineEndpoints(
  line: DrawnLine,
  points: DrawnPoint[],
): { x1: number; y1: number; x2: number; y2: number } | null {
  const p1 = points.find((p) => p.varName === line.startVar);
  const p2 = points.find((p) => p.varName === line.endVar);
  if (!p1 || !p2) return null;
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

/** Compute intersection of two line segments. Returns null if parallel or outside both segments. */
function lineLineIntersection(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number,
): { x: number; y: number } | null {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null; // parallel or coincident
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  // Allow intersection slightly beyond segment ends (5% extension) for usability
  if (t < -0.05 || t > 1.05 || u < -0.05 || u > 1.05) return null;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

/** Project a point onto a line segment. Returns the foot and parameter t (0..1 = on segment). */
function projectPointOntoSegment(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number,
): { x: number; y: number; t: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-10) return { x: x1, y: y1, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return { x: x1 + t * dx, y: y1 + t * dy, t };
}

function findSnapTarget(
  x: number,
  y: number,
  points: DrawnPoint[],
  lines: DrawnLine[],
  gridSize: number,
  pendingOrigin: { x: number; y: number } | null,
): SnapResult {
  // 1. Check point snap (highest priority)
  let bestDist = POINT_SNAP_THRESHOLD;
  let bestPoint: DrawnPoint | null = null;
  for (const p of points) {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < bestDist) {
      bestDist = d;
      bestPoint = p;
    }
  }
  if (bestPoint) {
    return { x: bestPoint.x, y: bestPoint.y, snappedToVar: bestPoint.varName, xAligned: true, yAligned: true, snapType: 'point' };
  }

  // 2. Midpoint snap — check midpoints of all lines
  let bestMidDist = POINT_SNAP_THRESHOLD;
  let bestMidpoint: { x: number; y: number } | null = null;
  for (const ln of lines) {
    const ep = resolveLineEndpoints(ln, points);
    if (!ep) continue;
    const mx = (ep.x1 + ep.x2) / 2;
    const my = (ep.y1 + ep.y2) / 2;
    const d = Math.hypot(x - mx, y - my);
    if (d < bestMidDist) {
      bestMidDist = d;
      bestMidpoint = { x: mx, y: my };
    }
  }
  if (bestMidpoint) {
    return { x: roundCoord(bestMidpoint.x), y: roundCoord(bestMidpoint.y), snappedToVar: null, xAligned: true, yAligned: true, snapType: 'midpoint' };
  }

  // 3. Intersection snap — check all pairs of lines (O(n^2), fine for <100 lines)
  let bestIsectDist = POINT_SNAP_THRESHOLD;
  let bestIsect: { x: number; y: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const ep1 = resolveLineEndpoints(lines[i], points);
    if (!ep1) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const ep2 = resolveLineEndpoints(lines[j], points);
      if (!ep2) continue;
      const isect = lineLineIntersection(ep1.x1, ep1.y1, ep1.x2, ep1.y2, ep2.x1, ep2.y1, ep2.x2, ep2.y2);
      if (!isect) continue;
      const d = Math.hypot(x - isect.x, y - isect.y);
      if (d < bestIsectDist) {
        bestIsectDist = d;
        bestIsect = isect;
      }
    }
  }
  if (bestIsect) {
    return { x: roundCoord(bestIsect.x), y: roundCoord(bestIsect.y), snappedToVar: null, xAligned: true, yAligned: true, snapType: 'intersection' };
  }

  // 4. Perpendicular snap — only when we have a pending first click (drawing a line)
  if (pendingOrigin) {
    let bestPerpDist = POINT_SNAP_THRESHOLD;
    let bestPerp: { x: number; y: number } | null = null;
    for (const ln of lines) {
      const ep = resolveLineEndpoints(ln, points);
      if (!ep) continue;
      const proj = projectPointOntoSegment(pendingOrigin.x, pendingOrigin.y, ep.x1, ep.y1, ep.x2, ep.y2);
      // Foot of perpendicular from pendingOrigin onto the line — snap cursor to it
      if (proj.t <= 0 || proj.t >= 1) continue; // must be on the segment interior
      const d = Math.hypot(x - proj.x, y - proj.y);
      if (d < bestPerpDist) {
        bestPerpDist = d;
        bestPerp = { x: proj.x, y: proj.y };
      }
    }
    if (bestPerp) {
      return { x: roundCoord(bestPerp.x), y: roundCoord(bestPerp.y), snappedToVar: null, xAligned: true, yAligned: true, snapType: 'perpendicular' };
    }
  }

  // 5. Check axis alignment with existing points
  let snapX = x;
  let snapY = y;
  let xAligned = false;
  let yAligned = false;
  for (const p of points) {
    if (Math.abs(x - p.x) < AXIS_SNAP_THRESHOLD) {
      snapX = p.x;
      xAligned = true;
    }
    if (Math.abs(y - p.y) < AXIS_SNAP_THRESHOLD) {
      snapY = p.y;
      yAligned = true;
    }
  }

  // 6. Threshold-based grid snap — only snap if within 30% of a grid line
  const gridSnap = Math.max(1, gridSize / 5);
  const gridThreshold = gridSnap * 0.3;
  if (!xAligned) {
    const nearestGridX = Math.round(snapX / gridSnap) * gridSnap;
    snapX = Math.abs(snapX - nearestGridX) < gridThreshold
      ? nearestGridX
      : Math.round(snapX * 10) / 10;
  }
  if (!yAligned) {
    const nearestGridY = Math.round(snapY / gridSnap) * gridSnap;
    snapY = Math.abs(snapY - nearestGridY) < gridThreshold
      ? nearestGridY
      : Math.round(snapY * 10) / 10;
  }

  const snapType: SnapType = (xAligned || yAligned) ? 'none' : 'grid';
  return { x: roundCoord(snapX), y: roundCoord(snapY), snappedToVar: null, xAligned, yAligned, snapType };
}

/** Check if a line is nearly horizontal or vertical. */
function detectLineConstraint(
  x1: number, y1: number, x2: number, y2: number,
): 'horizontal' | 'vertical' | null {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const len = Math.hypot(dx, dy);
  if (len < 0.1) return null;
  const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
  if (angleDeg < ANGLE_SNAP_THRESHOLD_DEG) return 'horizontal';
  if (angleDeg > 90 - ANGLE_SNAP_THRESHOLD_DEG) return 'vertical';
  return null;
}

function syncCodeToFile(state: { statements: string[]; points: DrawnPoint[]; targetFile: string | null }) {
  const { targetFile } = state;
  if (!targetFile) return;
  const code = generateSketchCode({ statements: state.statements, points: state.points });
  const forgeStore = useForgeStore.getState();
  forgeStore.updateFileCode(targetFile, code);
  setTimeout(() => useForgeStore.getState().execute(), 0);
}

/** Find the nearest entity (point, line, circle) to a given coordinate. */
export function findNearestEntity(
  x: number,
  y: number,
  state: Pick<DrawState, 'points' | 'lines' | 'circles' | 'arcs'>,
  threshold: number,
): SelectedEntity | null {
  let bestDist = threshold;
  let best: SelectedEntity | null = null;

  // Check points
  for (const p of state.points) {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < bestDist) {
      bestDist = d;
      best = { type: 'point', varName: p.varName, x: p.x, y: p.y };
    }
  }

  // Check lines (distance from point to line segment)
  for (const ln of state.lines) {
    const p1 = state.points.find((p) => p.varName === ln.startVar);
    const p2 = state.points.find((p) => p.varName === ln.endVar);
    if (!p1 || !p2) continue;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-10) continue;
    const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / len2));
    const projX = p1.x + t * dx;
    const projY = p1.y + t * dy;
    const d = Math.hypot(x - projX, y - projY);
    if (d < bestDist) {
      bestDist = d;
      best = { type: 'line', varName: ln.varName };
    }
  }

  // Check circles
  for (const c of state.circles) {
    const center = state.points.find((p) => p.varName === c.centerVar);
    if (!center) continue;
    const distToCenter = Math.hypot(x - center.x, y - center.y);
    const d = Math.abs(distToCenter - c.radius);
    if (d < bestDist) {
      bestDist = d;
      best = { type: 'circle', varName: c.varName };
    }
  }

  return best;
}

/** Helper: create a line from two points, with auto H/V detection. */
function createLine(
  start: { x: number; y: number; snappedToVar: string | null },
  end: { x: number; y: number; snappedToVar: string | null },
  state: { statements: string[]; points: DrawnPoint[]; lines: DrawnLine[]; nextPointIdx: number; nextLineIdx: number },
): { statements: string[]; points: DrawnPoint[]; lines: DrawnLine[]; nextPointIdx: number; nextLineIdx: number } {
  const newStatements = [...state.statements];
  const newPoints = [...state.points];
  const newLines = [...state.lines];
  let nextPIdx = state.nextPointIdx;
  let nextLIdx = state.nextLineIdx;

  let startVar = start.snappedToVar;
  if (!startVar) {
    startVar = `p${nextPIdx}`;
    newStatements.push(pointStatement(startVar, start.x, start.y));
    newPoints.push({ varName: startVar, x: start.x, y: start.y });
    nextPIdx++;
  }

  let endVar = end.snappedToVar;
  if (!endVar) {
    endVar = `p${nextPIdx}`;
    newStatements.push(pointStatement(endVar, end.x, end.y));
    newPoints.push({ varName: endVar, x: end.x, y: end.y });
    nextPIdx++;
  }

  const lineVar = `l${nextLIdx}`;
  newStatements.push(lineStatement(lineVar, startVar, endVar));
  newLines.push({ varName: lineVar, startVar, endVar });
  nextLIdx++;

  const lineConstraint = detectLineConstraint(start.x, start.y, end.x, end.y);
  if (lineConstraint) {
    newStatements.push(constraintStatement(lineConstraint, lineVar));
  }

  return { statements: newStatements, points: newPoints, lines: newLines, nextPointIdx: nextPIdx, nextLineIdx: nextLIdx };
}

// ─── Store ───────────────────────────────────────────────────────────────────

const emptySession = {
  statements: [] as string[],
  points: [] as DrawnPoint[],
  lines: [] as DrawnLine[],
  circles: [] as DrawnCircle[],
  arcs: [] as DrawnArc[],
  nextPointIdx: 0,
  nextLineIdx: 0,
  nextCircleIdx: 0,
  nextArcIdx: 0,
  pendingClicks: [] as { x: number; y: number; snappedToVar: string | null }[],
  previewPoint: null as { x: number; y: number } | null,
  snapResult: null as SnapResult | null,
  selectedEntities: [] as SelectedEntity[],
  hoveredEntity: null as SelectedEntity | null,
  dimensionInput: null as DrawState['dimensionInput'],
  showExitConfirm: false,
  constructionMode: false,
  constructionEntities: new Set<string>(),
  mirrorLineVar: null as string | null,
  polygonSides: 6,
};

export const useDrawStore = create<DrawState>((set, get) => ({
  active: false,
  tool: 'line' as DrawTool,
  targetFile: null,
  ...emptySession,

  enterDrawMode: () => {
    const forgeStore = useForgeStore.getState();
    const currentState = get();

    // If we have a target file from a previous session, allow re-entering
    if (currentState.targetFile && forgeStore.files[currentState.targetFile]) {
      set({ active: true, tool: 'line', pendingClicks: [], showExitConfirm: false });
      return;
    }

    let targetFile = forgeStore.activeFile;
    const existingCode = forgeStore.files[targetFile] ?? '';
    if (existingCode.trim().length > 0) {
      let idx = 1;
      while (forgeStore.files[`drawing-${idx}.forge.js`]) idx++;
      targetFile = `drawing-${idx}.forge.js`;
      forgeStore.createFile(targetFile);
      forgeStore.setActiveFile(targetFile);
    }

    if (!targetFile.endsWith('.forge.js')) {
      const newName = targetFile.replace(/\.js$/, '') + '.forge.js';
      if (newName !== targetFile && !forgeStore.files[newName]) {
        forgeStore.createFile(newName);
        forgeStore.setActiveFile(newName);
        targetFile = newName;
      }
    }

    const initialCode = generateSketchCode({ statements: [], points: [] });
    forgeStore.updateFileCode(targetFile, initialCode);
    setTimeout(() => forgeStore.execute(), 0);

    set({
      active: true,
      tool: 'line',
      ...emptySession,
      targetFile,
    });
  },

  requestExit: () => {
    const state = get();
    // If no work done, exit immediately
    if (state.statements.length === 0) {
      get().exitDrawMode();
      return;
    }
    set({ showExitConfirm: true });
  },

  confirmExit: () => {
    set({
      active: false,
      pendingClicks: [],
      previewPoint: null,
      snapResult: null,
      selectedEntities: [],
      showExitConfirm: false,
    });
  },

  cancelExit: () => {
    set({ showExitConfirm: false });
  },

  exitDrawMode: () => {
    set({
      active: false,
      pendingClicks: [],
      previewPoint: null,
      snapResult: null,
      selectedEntities: [],
      showExitConfirm: false,
    });
  },

  setTool: (tool) => {
    set({ tool, pendingClicks: [], selectedEntities: [], mirrorLineVar: null });
  },

  cancelPending: () => {
    set({ pendingClicks: [], selectedEntities: [] });
  },

  setHoveredEntity: (entity) => {
    const current = get().hoveredEntity;
    // Avoid unnecessary state updates
    if (entity === null && current === null) return;
    if (entity && current && entity.varName === current.varName) return;
    set({ hoveredEntity: entity });
  },

  toggleConstructionMode: () => {
    set((s) => ({ constructionMode: !s.constructionMode }));
  },

  setPolygonSides: (n) => {
    set({ polygonSides: Math.max(3, Math.min(32, n)) });
  },

  deleteEntity: (varName) => {
    const state = get();
    // Remove all statements that reference this varName
    const newStatements = state.statements.filter((stmt) => !stmt.includes(varName));

    // Rebuild entity lists from remaining statements
    const newPoints: DrawnPoint[] = [];
    const newLines: DrawnLine[] = [];
    const newCircles: DrawnCircle[] = [];
    const newArcs: DrawnArc[] = [];
    const pointRegex = /^const (p\d+) = sk\.point\((-?[\d.]+), (-?[\d.]+)\);$/;
    const lineRegex = /^const (l\d+) = sk\.line\((p\d+), (p\d+)\);$/;
    const circleRegex = /^const (c\d+) = sk\.circle\((p\d+), (-?[\d.]+)\);$/;
    const arcRegex = /^const (a\d+) = sk\.arc\((p\d+), (p\d+), (p\d+)\);$/;
    for (const stmt of newStatements) {
      let m = stmt.match(pointRegex);
      if (m) { newPoints.push({ varName: m[1], x: parseFloat(m[2]), y: parseFloat(m[3]) }); continue; }
      m = stmt.match(lineRegex);
      if (m) { newLines.push({ varName: m[1], startVar: m[2], endVar: m[3] }); continue; }
      m = stmt.match(circleRegex);
      if (m) { newCircles.push({ varName: m[1], centerVar: m[2], radius: parseFloat(m[3]) }); continue; }
      m = stmt.match(arcRegex);
      if (m) { newArcs.push({ varName: m[1], p1Var: m[2], p2Var: m[3], p3Var: m[4] }); continue; }
    }

    set({ statements: newStatements, points: newPoints, lines: newLines, circles: newCircles, arcs: newArcs });
    syncCodeToFile({ statements: newStatements, points: newPoints, targetFile: state.targetFile });
  },

  // ─── Entity selection (for constraint tools) ────────────────────────────

  selectEntity: (entity) => {
    const state = get();
    // Toggle: if already selected, deselect
    const already = state.selectedEntities.findIndex((e) => e.varName === entity.varName);
    if (already >= 0) {
      set({ selectedEntities: state.selectedEntities.filter((_, i) => i !== already) });
      return;
    }
    // Max 2 entities for constraint selection
    const sel = [...state.selectedEntities, entity].slice(-2);
    set({ selectedEntities: sel });
  },

  clearSelection: () => {
    set({ selectedEntities: [] });
  },

  setDimensionInput: (input) => {
    set({ dimensionInput: input });
  },

  // ─── Constraint application ─────────────────────────────────────────────

  applyConstraint: (tool, value) => {
    const state = get();
    const sel = state.selectedEntities;
    const constraintType = tool.slice(2); // remove 'c:' prefix
    const newStatements = [...state.statements];

    switch (constraintType) {
      case 'horizontal':
      case 'vertical': {
        const line = sel.find((e) => e.type === 'line');
        if (!line) return;
        newStatements.push(constraintStatement(constraintType, line.varName));
        break;
      }
      case 'length': {
        const line = sel.find((e) => e.type === 'line');
        if (!line || value == null) return;
        newStatements.push(constraintStatement('length', line.varName, value));
        break;
      }
      case 'distance': {
        const pts = sel.filter((e) => e.type === 'point');
        if (pts.length < 2 || value == null) return;
        newStatements.push(constraintStatement('distance', pts[0].varName, pts[1].varName, value));
        break;
      }
      case 'angle': {
        const lines = sel.filter((e) => e.type === 'line');
        if (lines.length < 2 || value == null) return;
        newStatements.push(constraintStatement('angle', lines[0].varName, lines[1].varName, value));
        break;
      }
      case 'radius': {
        const circ = sel.find((e) => e.type === 'circle');
        if (!circ || value == null) return;
        newStatements.push(constraintStatement('radius', circ.varName, value));
        break;
      }
      case 'parallel': {
        const lines = sel.filter((e) => e.type === 'line');
        if (lines.length < 2) return;
        newStatements.push(constraintStatement('parallel', lines[0].varName, lines[1].varName));
        break;
      }
      case 'perpendicular': {
        const lines = sel.filter((e) => e.type === 'line');
        if (lines.length < 2) return;
        newStatements.push(constraintStatement('perpendicular', lines[0].varName, lines[1].varName));
        break;
      }
      case 'coincident': {
        const pts = sel.filter((e) => e.type === 'point');
        if (pts.length < 2) return;
        newStatements.push(constraintStatement('coincident', pts[0].varName, pts[1].varName));
        break;
      }
      case 'tangent': {
        const line = sel.find((e) => e.type === 'line');
        const circ = sel.find((e) => e.type === 'circle' || e.type === 'arc');
        if (!line || !circ) return;
        newStatements.push(constraintStatement('tangent', line.varName, circ.varName));
        break;
      }
      case 'equal': {
        const lines = sel.filter((e) => e.type === 'line');
        if (lines.length >= 2) {
          newStatements.push(constraintStatement('equal', lines[0].varName, lines[1].varName));
        } else {
          const circs = sel.filter((e) => e.type === 'circle');
          if (circs.length >= 2) {
            newStatements.push(constraintStatement('equalRadius', circs[0].varName, circs[1].varName));
          } else return;
        }
        break;
      }
      case 'fixed': {
        const pt = sel.find((e) => e.type === 'point');
        if (!pt) return;
        newStatements.push(constraintStatement('fixed', pt.varName));
        break;
      }
      case 'midpoint': {
        const pt = sel.find((e) => e.type === 'point');
        const line = sel.find((e) => e.type === 'line');
        if (!pt || !line) return;
        newStatements.push(constraintStatement('midpoint', pt.varName, line.varName));
        break;
      }
      case 'symmetric': {
        const pts = sel.filter((e) => e.type === 'point');
        const line = sel.find((e) => e.type === 'line');
        if (pts.length < 2 || !line) return;
        newStatements.push(constraintStatement('symmetric', pts[0].varName, pts[1].varName, line.varName));
        break;
      }
      case 'concentric': {
        const circs = sel.filter((e) => e.type === 'circle');
        if (circs.length < 2) return;
        newStatements.push(constraintStatement('concentric', circs[0].varName, circs[1].varName));
        break;
      }
      case 'pointOnLine': {
        const pt = sel.find((e) => e.type === 'point');
        const line = sel.find((e) => e.type === 'line');
        if (!pt || !line) return;
        newStatements.push(constraintStatement('pointOnLine', pt.varName, line.varName));
        break;
      }
      case 'pointOnCircle': {
        const pt = sel.find((e) => e.type === 'point');
        const circ = sel.find((e) => e.type === 'circle');
        if (!pt || !circ) return;
        newStatements.push(constraintStatement('pointOnCircle', pt.varName, circ.varName));
        break;
      }
      default:
        return;
    }

    set({ statements: newStatements, selectedEntities: [] });
    syncCodeToFile({ statements: newStatements, points: state.points, targetFile: state.targetFile });
  },

  // ─── Click handling ─────────────────────────────────────────────────────

  handleClick: (rawX, rawY) => {
    const state = get();
    if (!state.active) return;

    const gridSize = useForgeStore.getState().gridSize;
    const pendingOrigin = state.pendingClicks.length > 0 ? state.pendingClicks[state.pendingClicks.length - 1] : null;
    const snap = findSnapTarget(rawX, rawY, state.points, state.lines, gridSize, pendingOrigin);
    const { x, y, snappedToVar } = snap;

    // In select mode or constraint mode, try to select an entity
    if (state.tool === 'select' || isConstraintTool(state.tool)) {
      const entity = findNearestEntity(x, y, state, POINT_SNAP_THRESHOLD * 2);
      if (entity) {
        get().selectEntity(entity);
      }
      return;
    }

    switch (state.tool) {
      case 'point': {
        if (snappedToVar) return;
        const varName = `p${state.nextPointIdx}`;
        const stmt = pointStatement(varName, x, y);
        const newPoints = [...state.points, { varName, x, y }];
        const newStatements = [...state.statements, stmt];
        set({
          statements: newStatements,
          points: newPoints,
          nextPointIdx: state.nextPointIdx + 1,
        });
        syncCodeToFile({ statements: newStatements, points: newPoints, targetFile: state.targetFile });
        break;
      }

      case 'line': {
        const pending = [...state.pendingClicks, { x, y, snappedToVar }];
        if (pending.length < 2) {
          set({ pendingClicks: pending });
          return;
        }

        const [start, end] = pending;
        const result = createLine(start, end, {
          statements: state.statements,
          points: state.points,
          lines: state.lines,
          nextPointIdx: state.nextPointIdx,
          nextLineIdx: state.nextLineIdx,
        });

        // Track construction entities
        const newConstructionEntities = new Set(state.constructionEntities);
        if (state.constructionMode) {
          const newLine = result.lines[result.lines.length - 1];
          if (newLine) newConstructionEntities.add(newLine.varName);
        }

        set({
          statements: result.statements,
          points: result.points,
          lines: result.lines,
          nextPointIdx: result.nextPointIdx,
          nextLineIdx: result.nextLineIdx,
          pendingClicks: [],
          constructionEntities: newConstructionEntities,
        });
        syncCodeToFile({ statements: result.statements, points: result.points, targetFile: state.targetFile });
        break;
      }

      case 'polyline': {
        // Accumulate clicks; lines are created on double-click or Escape/Enter
        const pending = [...state.pendingClicks, { x, y, snappedToVar }];
        set({ pendingClicks: pending });
        break;
      }

      case 'arc': {
        // Arc: click center, then start point, then end point
        // Generates: sk.arcByCenter(center, start, end)
        const pending = [...state.pendingClicks, { x, y, snappedToVar }];
        if (pending.length < 3) {
          set({ pendingClicks: pending });
          return;
        }

        const [center, start, end] = pending;
        const newStatements = [...state.statements];
        const newPoints = [...state.points];
        const newArcs = [...state.arcs];
        let nextPIdx = state.nextPointIdx;
        const nextAIdx = state.nextArcIdx;

        const vars: string[] = [];
        for (const pt of [center, start, end]) {
          let v = pt.snappedToVar;
          if (!v) {
            v = `p${nextPIdx}`;
            newStatements.push(pointStatement(v, pt.x, pt.y));
            newPoints.push({ varName: v, x: pt.x, y: pt.y });
            nextPIdx++;
          }
          vars.push(v);
        }

        const arcVar = `a${nextAIdx}`;
        // arcStatement generates: sk.arcByCenter(center, start, end)
        newStatements.push(arcStatement(arcVar, vars[0], vars[1], vars[2]));
        newArcs.push({ varName: arcVar, p1Var: vars[0], p2Var: vars[1], p3Var: vars[2] });

        set({
          statements: newStatements,
          points: newPoints,
          arcs: newArcs,
          nextPointIdx: nextPIdx,
          nextArcIdx: nextAIdx + 1,
          pendingClicks: [],
        });
        syncCodeToFile({ statements: newStatements, points: newPoints, targetFile: state.targetFile });
        break;
      }

      case 'rectangle': {
        const pending = [...state.pendingClicks, { x, y, snappedToVar }];
        if (pending.length < 2) {
          set({ pendingClicks: pending });
          return;
        }

        const [corner1, corner2] = pending;
        const x1 = Math.min(corner1.x, corner2.x);
        const y1 = Math.min(corner1.y, corner2.y);
        const x2 = Math.max(corner1.x, corner2.x);
        const y2 = Math.max(corner1.y, corner2.y);
        const w = roundCoord(x2 - x1);
        const h = roundCoord(y2 - y1);
        if (w < 0.1 || h < 0.1) {
          set({ pendingClicks: [] });
          return;
        }

        const newStatements = [...state.statements];
        const newPoints = [...state.points];
        const newLines = [...state.lines];
        let nextPIdx = state.nextPointIdx;
        const nextLIdx = state.nextLineIdx;

        const vars = [0, 1, 2, 3].map(() => `p${nextPIdx++}`);
        const corners: [number, number][] = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
        corners.forEach((c, i) => {
          newStatements.push(pointStatement(vars[i], c[0], c[1]));
          newPoints.push({ varName: vars[i], x: c[0], y: c[1] });
        });

        const lineVars: string[] = [];
        for (let i = 0; i < 4; i++) {
          const lv = `l${nextLIdx + i}`;
          lineVars.push(lv);
          newStatements.push(lineStatement(lv, vars[i], vars[(i + 1) % 4]));
          newLines.push({ varName: lv, startVar: vars[i], endVar: vars[(i + 1) % 4] });
        }

        newStatements.push(constraintStatement('horizontal', lineVars[0]));
        newStatements.push(constraintStatement('vertical', lineVars[1]));
        newStatements.push(constraintStatement('horizontal', lineVars[2]));
        newStatements.push(constraintStatement('vertical', lineVars[3]));
        newStatements.push(constraintStatement('length', lineVars[0], w));
        newStatements.push(constraintStatement('length', lineVars[1], h));
        newStatements.push(constraintStatement('fixed', vars[0]));

        set({
          statements: newStatements,
          points: newPoints,
          lines: newLines,
          nextPointIdx: nextPIdx,
          nextLineIdx: nextLIdx + 4,
          pendingClicks: [],
        });
        syncCodeToFile({ statements: newStatements, points: newPoints, targetFile: state.targetFile });
        break;
      }

      case 'circle': {
        const pending = [...state.pendingClicks, { x, y, snappedToVar }];
        if (pending.length < 2) {
          set({ pendingClicks: pending });
          return;
        }

        const [center, edge] = pending;
        const radius = roundCoord(Math.hypot(edge.x - center.x, edge.y - center.y));
        if (radius < 0.1) {
          set({ pendingClicks: [] });
          return;
        }

        const newStatements = [...state.statements];
        const newPoints = [...state.points];
        const newCircles = [...state.circles];
        let nextPIdx = state.nextPointIdx;
        const nextCIdx = state.nextCircleIdx;

        let centerVar = center.snappedToVar;
        if (!centerVar) {
          centerVar = `p${nextPIdx}`;
          newStatements.push(pointStatement(centerVar, center.x, center.y));
          newPoints.push({ varName: centerVar, x: center.x, y: center.y });
          nextPIdx++;
        }

        const circleVar = `c${nextCIdx}`;
        newStatements.push(circleStatement(circleVar, centerVar, radius));
        newCircles.push({ varName: circleVar, centerVar, radius });

        // Track construction entities
        const newCECircle = new Set(state.constructionEntities);
        if (state.constructionMode) newCECircle.add(circleVar);

        set({
          statements: newStatements,
          points: newPoints,
          circles: newCircles,
          nextPointIdx: nextPIdx,
          nextCircleIdx: nextCIdx + 1,
          pendingClicks: [],
          constructionEntities: newCECircle,
        });
        syncCodeToFile({ statements: newStatements, points: newPoints, targetFile: state.targetFile });
        break;
      }

      case 'polygon': {
        const pending = [...state.pendingClicks, { x, y, snappedToVar }];
        if (pending.length < 2) {
          set({ pendingClicks: pending });
          return;
        }

        const [center, edgePt] = pending;
        const r = Math.hypot(edgePt.x - center.x, edgePt.y - center.y);
        if (r < 0.1) {
          set({ pendingClicks: [] });
          return;
        }

        const sides = state.polygonSides;
        const newStatements = [...state.statements];
        const newPoints = [...state.points];
        const newLines = [...state.lines];
        let nextPIdx = state.nextPointIdx;
        let nextLIdx = state.nextLineIdx;

        // Create polygon vertices
        const baseAngle = Math.atan2(edgePt.y - center.y, edgePt.x - center.x);
        const polyPtVars: string[] = [];
        for (let i = 0; i < sides; i++) {
          const angle = baseAngle + (i / sides) * Math.PI * 2;
          const px = roundCoord(center.x + Math.cos(angle) * r);
          const py = roundCoord(center.y + Math.sin(angle) * r);
          const v = `p${nextPIdx++}`;
          newStatements.push(pointStatement(v, px, py));
          newPoints.push({ varName: v, x: px, y: py });
          polyPtVars.push(v);
        }

        // Create edges
        const polyLineVars: string[] = [];
        for (let i = 0; i < sides; i++) {
          const lv = `l${nextLIdx++}`;
          newStatements.push(lineStatement(lv, polyPtVars[i], polyPtVars[(i + 1) % sides]));
          newLines.push({ varName: lv, startVar: polyPtVars[i], endVar: polyPtVars[(i + 1) % sides] });
          polyLineVars.push(lv);
        }

        // Equal length constraints for all edges
        for (let i = 1; i < sides; i++) {
          newStatements.push(constraintStatement('equal', polyLineVars[0], polyLineVars[i]));
        }
        // Fix first point
        newStatements.push(constraintStatement('fixed', polyPtVars[0]));

        set({
          statements: newStatements,
          points: newPoints,
          lines: newLines,
          nextPointIdx: nextPIdx,
          nextLineIdx: nextLIdx,
          pendingClicks: [],
        });
        syncCodeToFile({ statements: newStatements, points: newPoints, targetFile: state.targetFile });
        break;
      }

      case 'ellipse': {
        // Click center, then click corner of bounding box -> derives rx, ry
        const pending = [...state.pendingClicks, { x, y, snappedToVar }];
        if (pending.length < 2) {
          set({ pendingClicks: pending });
          return;
        }

        const [centerE, cornerE] = pending;
        const rx = roundCoord(Math.abs(cornerE.x - centerE.x));
        const ry = roundCoord(Math.abs(cornerE.y - centerE.y));
        if (rx < 0.1 || ry < 0.1) {
          set({ pendingClicks: [] });
          return;
        }

        // Approximate ellipse with 4 arcs (quadrant arcs through axis endpoints)
        const eStmts = [...state.statements];
        const ePts = [...state.points];
        const eArcs = [...state.arcs];
        let ePIdx = state.nextPointIdx;
        let eAIdx = state.nextArcIdx;

        // Center point (for reference)
        let eCenterVar = centerE.snappedToVar;
        if (!eCenterVar) {
          eCenterVar = `p${ePIdx}`;
          eStmts.push(pointStatement(eCenterVar, centerE.x, centerE.y));
          ePts.push({ varName: eCenterVar, x: centerE.x, y: centerE.y });
          ePIdx++;
        }

        // Axis endpoints: right, top, left, bottom
        const axisPts: { vn: string; px: number; py: number }[] = [
          { vn: `p${ePIdx}`, px: roundCoord(centerE.x + rx), py: centerE.y },
          { vn: `p${ePIdx + 1}`, px: centerE.x, py: roundCoord(centerE.y + ry) },
          { vn: `p${ePIdx + 2}`, px: roundCoord(centerE.x - rx), py: centerE.y },
          { vn: `p${ePIdx + 3}`, px: centerE.x, py: roundCoord(centerE.y - ry) },
        ];
        ePIdx += 4;

        for (const ap of axisPts) {
          eStmts.push(pointStatement(ap.vn, ap.px, ap.py));
          ePts.push({ varName: ap.vn, x: ap.px, y: ap.py });
        }

        // Mid-arc points on the ellipse (at 45, 135, 225, 315 degrees)
        const midPts: { vn: string; px: number; py: number }[] = [];
        for (let q = 0; q < 4; q++) {
          const angle = (Math.PI / 4) + (q * Math.PI / 2);
          const mx = roundCoord(centerE.x + rx * Math.cos(angle));
          const my = roundCoord(centerE.y + ry * Math.sin(angle));
          const vn = `p${ePIdx++}`;
          midPts.push({ vn, px: mx, py: my });
          eStmts.push(pointStatement(vn, mx, my));
          ePts.push({ varName: vn, x: mx, y: my });
        }

        // 4 arcs: right->top, top->left, left->bottom, bottom->right
        eStmts.push('// Ellipse approximated with 4 arcs');
        for (let q = 0; q < 4; q++) {
          const arcVar = `a${eAIdx++}`;
          const p1v = axisPts[q].vn;
          const pMidv = midPts[q].vn;
          const p2v = axisPts[(q + 1) % 4].vn;
          eStmts.push(arcStatement(arcVar, p1v, pMidv, p2v));
          eArcs.push({ varName: arcVar, p1Var: p1v, p2Var: pMidv, p3Var: p2v });
        }

        set({
          statements: eStmts,
          points: ePts,
          arcs: eArcs,
          nextPointIdx: ePIdx,
          nextArcIdx: eAIdx,
          pendingClicks: [],
        });
        syncCodeToFile({ statements: eStmts, points: ePts, targetFile: state.targetFile });
        break;
      }

      case 'slot': {
        // Click center1, click center2, click to set width/radius
        const pending = [...state.pendingClicks, { x, y, snappedToVar }];
        if (pending.length < 3) {
          set({ pendingClicks: pending });
          return;
        }

        const [sc1, sc2, widthPt] = pending;
        const sdx = sc2.x - sc1.x;
        const sdy = sc2.y - sc1.y;
        const sLineLen = Math.hypot(sdx, sdy);
        if (sLineLen < 0.1) {
          set({ pendingClicks: [] });
          return;
        }
        // Perpendicular distance from widthPt to line c1->c2
        const sPerpDist = Math.abs(sdx * (sc1.y - widthPt.y) - sdy * (sc1.x - widthPt.x)) / sLineLen;
        const sRadius = roundCoord(Math.max(0.5, sPerpDist));

        // Direction perpendicular to c1->c2
        const snx = -sdy / sLineLen;
        const sny = sdx / sLineLen;

        const sStmts = [...state.statements];
        const sPts = [...state.points];
        const sLines = [...state.lines];
        const sArcs = [...state.arcs];
        let sPIdx = state.nextPointIdx;
        let sLIdx = state.nextLineIdx;
        let sAIdx = state.nextArcIdx;

        sStmts.push('// Slot (stadium shape)');

        // 4 corner points of the slot
        const slotCorners = [
          { sx: roundCoord(sc1.x + snx * sRadius), sy: roundCoord(sc1.y + sny * sRadius) },
          { sx: roundCoord(sc2.x + snx * sRadius), sy: roundCoord(sc2.y + sny * sRadius) },
          { sx: roundCoord(sc2.x - snx * sRadius), sy: roundCoord(sc2.y - sny * sRadius) },
          { sx: roundCoord(sc1.x - snx * sRadius), sy: roundCoord(sc1.y - sny * sRadius) },
        ];
        const slotPtVars: string[] = [];
        for (const sp of slotCorners) {
          const v = `p${sPIdx++}`;
          sStmts.push(pointStatement(v, sp.sx, sp.sy));
          sPts.push({ varName: v, x: sp.sx, y: sp.sy });
          slotPtVars.push(v);
        }

        // Semicircle arc midpoints
        const sDirX = sdx / sLineLen;
        const sDirY = sdy / sLineLen;
        const sArcMid1 = { x: roundCoord(sc2.x + sDirX * sRadius), y: roundCoord(sc2.y + sDirY * sRadius) };
        const sArcMid2 = { x: roundCoord(sc1.x - sDirX * sRadius), y: roundCoord(sc1.y - sDirY * sRadius) };
        const sArcMid1Var = `p${sPIdx++}`;
        const sArcMid2Var = `p${sPIdx++}`;
        sStmts.push(pointStatement(sArcMid1Var, sArcMid1.x, sArcMid1.y));
        sPts.push({ varName: sArcMid1Var, x: sArcMid1.x, y: sArcMid1.y });
        sStmts.push(pointStatement(sArcMid2Var, sArcMid2.x, sArcMid2.y));
        sPts.push({ varName: sArcMid2Var, x: sArcMid2.x, y: sArcMid2.y });

        // Two straight lines
        const sLv1 = `l${sLIdx++}`;
        sStmts.push(lineStatement(sLv1, slotPtVars[0], slotPtVars[1]));
        sLines.push({ varName: sLv1, startVar: slotPtVars[0], endVar: slotPtVars[1] });

        const sLv2 = `l${sLIdx++}`;
        sStmts.push(lineStatement(sLv2, slotPtVars[2], slotPtVars[3]));
        sLines.push({ varName: sLv2, startVar: slotPtVars[2], endVar: slotPtVars[3] });

        // Two semicircle arcs
        const sAv1 = `a${sAIdx++}`;
        sStmts.push(arcStatement(sAv1, slotPtVars[1], sArcMid1Var, slotPtVars[2]));
        sArcs.push({ varName: sAv1, p1Var: slotPtVars[1], p2Var: sArcMid1Var, p3Var: slotPtVars[2] });

        const sAv2 = `a${sAIdx++}`;
        sStmts.push(arcStatement(sAv2, slotPtVars[3], sArcMid2Var, slotPtVars[0]));
        sArcs.push({ varName: sAv2, p1Var: slotPtVars[3], p2Var: sArcMid2Var, p3Var: slotPtVars[0] });

        // Parallel + equal constraints for the two straight lines
        sStmts.push(constraintStatement('parallel', sLv1, sLv2));
        sStmts.push(constraintStatement('equal', sLv1, sLv2));

        set({
          statements: sStmts,
          points: sPts,
          lines: sLines,
          arcs: sArcs,
          nextPointIdx: sPIdx,
          nextLineIdx: sLIdx,
          nextArcIdx: sAIdx,
          pendingClicks: [],
        });
        syncCodeToFile({ statements: sStmts, points: sPts, targetFile: state.targetFile });
        break;
      }

      case 'trim': {
        // MVP: click near an entity to delete it and all referencing statements
        const trimEntity = findNearestEntity(x, y, state, POINT_SNAP_THRESHOLD * 2);
        if (trimEntity) {
          get().deleteEntity(trimEntity.varName);
        }
        break;
      }

      case 'mirror': {
        // Step 1: select a mirror line (first click on a line)
        // Step 2: subsequent clicks create mirrored points
        if (!state.mirrorLineVar) {
          const mirEntity = findNearestEntity(x, y, state, POINT_SNAP_THRESHOLD * 2);
          if (mirEntity && mirEntity.type === 'line') {
            set({ mirrorLineVar: mirEntity.varName });
          }
          return;
        }

        // Mirror line is set -- create a mirrored point
        const mirLine = state.lines.find((l) => l.varName === state.mirrorLineVar);
        if (!mirLine) return;
        const mlp1 = state.points.find((p) => p.varName === mirLine.startVar);
        const mlp2 = state.points.find((p) => p.varName === mirLine.endVar);
        if (!mlp1 || !mlp2) return;

        const mldx = mlp2.x - mlp1.x;
        const mldy = mlp2.y - mlp1.y;
        const mllen2 = mldx * mldx + mldy * mldy;
        if (mllen2 < 1e-10) return;

        const mlt = ((x - mlp1.x) * mldx + (y - mlp1.y) * mldy) / mllen2;
        const projMx = mlp1.x + mlt * mldx;
        const projMy = mlp1.y + mlt * mldy;
        const mirX = roundCoord(2 * projMx - x);
        const mirY = roundCoord(2 * projMy - y);

        const mStmts = [...state.statements];
        const mPts = [...state.points];
        let mPIdx = state.nextPointIdx;

        let origVar = snappedToVar;
        if (!origVar) {
          origVar = `p${mPIdx}`;
          mStmts.push(pointStatement(origVar, x, y));
          mPts.push({ varName: origVar, x, y });
          mPIdx++;
        }

        const mirVar = `p${mPIdx}`;
        mStmts.push(pointStatement(mirVar, mirX, mirY));
        mPts.push({ varName: mirVar, x: mirX, y: mirY });
        mPIdx++;

        mStmts.push(constraintStatement('symmetric', origVar, mirVar, state.mirrorLineVar));

        set({
          statements: mStmts,
          points: mPts,
          nextPointIdx: mPIdx,
        });
        syncCodeToFile({ statements: mStmts, points: mPts, targetFile: state.targetFile });
        break;
      }

      case 'offset': {
        // Click 1: select entity, Click 2: set offset distance
        const pending = [...state.pendingClicks, { x, y, snappedToVar }];
        if (pending.length < 2) {
          set({ pendingClicks: pending });
          return;
        }

        const [selectClick, distClick] = pending;
        const offEntity = findNearestEntity(selectClick.x, selectClick.y, state, POINT_SNAP_THRESHOLD * 2);
        if (!offEntity) {
          set({ pendingClicks: [] });
          return;
        }

        const oStmts = [...state.statements];
        const oPts = [...state.points];
        const oLines = [...state.lines];
        const oCircles = [...state.circles];
        let oPIdx = state.nextPointIdx;
        let oLIdx = state.nextLineIdx;
        let oCIdx = state.nextCircleIdx;

        if (offEntity.type === 'line') {
          const srcLine = state.lines.find((l) => l.varName === offEntity.varName);
          if (!srcLine) { set({ pendingClicks: [] }); return; }
          const osp1 = state.points.find((p) => p.varName === srcLine.startVar);
          const osp2 = state.points.find((p) => p.varName === srcLine.endVar);
          if (!osp1 || !osp2) { set({ pendingClicks: [] }); return; }

          const oldx = osp2.x - osp1.x;
          const oldy = osp2.y - osp1.y;
          const ollen = Math.hypot(oldx, oldy);
          if (ollen < 0.1) { set({ pendingClicks: [] }); return; }

          const ocross = oldx * (distClick.y - osp1.y) - oldy * (distClick.x - osp1.x);
          const osign = ocross >= 0 ? 1 : -1;
          const onx = -oldy / ollen * osign;
          const ony = oldx / ollen * osign;
          const offsetDist = roundCoord(Math.abs(ocross) / ollen);
          if (offsetDist < 0.1) { set({ pendingClicks: [] }); return; }

          const op1Var = `p${oPIdx++}`;
          const op2Var = `p${oPIdx++}`;
          const op1x = roundCoord(osp1.x + onx * offsetDist);
          const op1y = roundCoord(osp1.y + ony * offsetDist);
          const op2x = roundCoord(osp2.x + onx * offsetDist);
          const op2y = roundCoord(osp2.y + ony * offsetDist);

          oStmts.push(pointStatement(op1Var, op1x, op1y));
          oPts.push({ varName: op1Var, x: op1x, y: op1y });
          oStmts.push(pointStatement(op2Var, op2x, op2y));
          oPts.push({ varName: op2Var, x: op2x, y: op2y });

          const newLineVar = `l${oLIdx++}`;
          oStmts.push(lineStatement(newLineVar, op1Var, op2Var));
          oLines.push({ varName: newLineVar, startVar: op1Var, endVar: op2Var });
          oStmts.push(constraintStatement('parallel', offEntity.varName, newLineVar));

          set({
            statements: oStmts,
            points: oPts,
            lines: oLines,
            nextPointIdx: oPIdx,
            nextLineIdx: oLIdx,
            pendingClicks: [],
          });
        } else if (offEntity.type === 'circle') {
          const srcCircle = state.circles.find((c) => c.varName === offEntity.varName);
          if (!srcCircle) { set({ pendingClicks: [] }); return; }
          const centerPt = state.points.find((p) => p.varName === srcCircle.centerVar);
          if (!centerPt) { set({ pendingClicks: [] }); return; }

          const distFromCenter = Math.hypot(distClick.x - centerPt.x, distClick.y - centerPt.y);
          const newRadius = roundCoord(Math.max(0.5, distFromCenter));

          const newCircleVar = `c${oCIdx++}`;
          oStmts.push(circleStatement(newCircleVar, srcCircle.centerVar, newRadius));
          oCircles.push({ varName: newCircleVar, centerVar: srcCircle.centerVar, radius: newRadius });
          oStmts.push(constraintStatement('concentric', offEntity.varName, newCircleVar));

          set({
            statements: oStmts,
            points: oPts,
            circles: oCircles,
            nextCircleIdx: oCIdx,
            pendingClicks: [],
          });
        } else {
          set({ pendingClicks: [] });
          return;
        }

        syncCodeToFile({ statements: oStmts, points: oPts, targetFile: state.targetFile });
        break;
      }
    }
  },

  // ─── Double-click: finish polyline ──────────────────────────────────────

  handleDoubleClick: (_rawX, _rawY) => {
    const state = get();
    if (state.tool !== 'polyline' || state.pendingClicks.length < 2) return;

    // Finalize polyline: create all line segments
    const pending = state.pendingClicks;
    let result = {
      statements: state.statements,
      points: state.points,
      lines: state.lines,
      nextPointIdx: state.nextPointIdx,
      nextLineIdx: state.nextLineIdx,
    };

    for (let i = 0; i < pending.length - 1; i++) {
      result = createLine(pending[i], pending[i + 1], result);
    }

    set({
      statements: result.statements,
      points: result.points,
      lines: result.lines,
      nextPointIdx: result.nextPointIdx,
      nextLineIdx: result.nextLineIdx,
      pendingClicks: [],
    });
    syncCodeToFile({ statements: result.statements, points: result.points, targetFile: state.targetFile });
  },

  setPreviewPoint: (pt) => {
    if (!pt) {
      set({ previewPoint: null, snapResult: null });
      return;
    }
    const state = get();
    const gridSize = useForgeStore.getState().gridSize;
    const pendingOrigin = state.pendingClicks.length > 0 ? state.pendingClicks[state.pendingClicks.length - 1] : null;
    const snap = findSnapTarget(pt.x, pt.y, state.points, state.lines, gridSize, pendingOrigin);
    set({ previewPoint: { x: snap.x, y: snap.y }, snapResult: snap });
  },

  undo: () => {
    const state = get();
    if (state.pendingClicks.length > 0) {
      // For polyline, remove last pending click
      if (state.tool === 'polyline' && state.pendingClicks.length > 1) {
        set({ pendingClicks: state.pendingClicks.slice(0, -1) });
      } else {
        set({ pendingClicks: [] });
      }
      return;
    }
    if (state.statements.length === 0) return;

    const newStatements = [...state.statements];

    // Remove trailing constraints first
    while (newStatements.length > 0 && newStatements[newStatements.length - 1].startsWith('sk.')) {
      newStatements.pop();
    }
    // Remove the last entity (line/circle/arc)
    if (newStatements.length > 0 && !newStatements[newStatements.length - 1].startsWith('sk.')) {
      newStatements.pop();
    }

    // Rebuild entity lists from remaining statements
    const newPoints: DrawnPoint[] = [];
    const newLines: DrawnLine[] = [];
    const newCircles: DrawnCircle[] = [];
    const newArcs: DrawnArc[] = [];
    const pointRegex = /^const (p\d+) = sk\.point\((-?[\d.]+), (-?[\d.]+)\);$/;
    const lineRegex = /^const (l\d+) = sk\.line\((p\d+), (p\d+)\);$/;
    const circleRegex = /^const (c\d+) = sk\.circle\((p\d+), (-?[\d.]+)\);$/;
    const arcRegex = /^const (a\d+) = sk\.arc\((p\d+), (p\d+), (p\d+)\);$/;
    for (const stmt of newStatements) {
      let m = stmt.match(pointRegex);
      if (m) { newPoints.push({ varName: m[1], x: parseFloat(m[2]), y: parseFloat(m[3]) }); continue; }
      m = stmt.match(lineRegex);
      if (m) { newLines.push({ varName: m[1], startVar: m[2], endVar: m[3] }); continue; }
      m = stmt.match(circleRegex);
      if (m) { newCircles.push({ varName: m[1], centerVar: m[2], radius: parseFloat(m[3]) }); continue; }
      m = stmt.match(arcRegex);
      if (m) { newArcs.push({ varName: m[1], p1Var: m[2], p2Var: m[3], p3Var: m[4] }); continue; }
    }

    set({ statements: newStatements, points: newPoints, lines: newLines, circles: newCircles, arcs: newArcs });
    syncCodeToFile({ statements: newStatements, points: newPoints, targetFile: state.targetFile });
  },
}));

// ─── File-switch watcher ─────────────────────────────────────────────────────
// When the user switches to a different file while draw mode is active,
// pause draw mode. When they return to the draw file, re-activate it.

let _prevActiveFile: string | null = null;
useForgeStore.subscribe((state) => {
  const activeFile = state.activeFile;
  if (activeFile === _prevActiveFile) return;
  _prevActiveFile = activeFile;

  const drawState = useDrawStore.getState();
  if (!drawState.targetFile) return;

  if (drawState.active && activeFile !== drawState.targetFile) {
    // Switched away from draw file — pause (keep state, just deactivate UI)
    useDrawStore.setState({
      active: false,
      pendingClicks: [],
      previewPoint: null,
      snapResult: null,
    });
  } else if (!drawState.active && activeFile === drawState.targetFile && drawState.statements.length > 0) {
    // Returned to draw file — re-activate
    useDrawStore.setState({ active: true, tool: 'select' as DrawTool });
  }
});
