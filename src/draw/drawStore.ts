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
  | 'arc' | 'polygon';

/** Constraint tools apply constraints to selected entities. */
export type ConstraintTool =
  | 'c:horizontal' | 'c:vertical' | 'c:length' | 'c:distance'
  | 'c:angle' | 'c:radius' | 'c:parallel' | 'c:perpendicular'
  | 'c:coincident' | 'c:tangent' | 'c:equal' | 'c:fixed'
  | 'c:midpoint' | 'c:symmetric' | 'c:concentric';

/** Special mode for selection without a specific tool. */
export type SelectTool = 'select';

export type DrawTool = DrawingTool | ConstraintTool | SelectTool;

/** Whether the given tool is a constraint tool. */
export function isConstraintTool(tool: DrawTool): tool is ConstraintTool {
  return tool.startsWith('c:');
}

/** Whether the given tool is a drawing tool. */
export function isDrawingTool(tool: DrawTool): tool is DrawingTool {
  return !tool.startsWith('c:') && tool !== 'select';
}

// ─── Entity selection ────────────────────────────────────────────────────────

export interface SelectedEntity {
  type: 'point' | 'line' | 'circle' | 'arc';
  varName: string;
  x?: number;
  y?: number;
}

// ─── Snap ────────────────────────────────────────────────────────────────────

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

  // Dimension input state
  dimensionInput: { constraintType: string; resolve: (value: number) => void } | null;

  // Exit confirmation
  showExitConfirm: boolean;

  // Construction mode toggle
  constructionMode: boolean;

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
  toggleConstructionMode: () => void;
  setPolygonSides: (n: number) => void;
}

const POINT_SNAP_THRESHOLD = 3; // world units (mm)
const AXIS_SNAP_THRESHOLD = 1.5; // world units for axis alignment
const ANGLE_SNAP_THRESHOLD_DEG = 3; // degrees for near-H/V detection

function findSnapTarget(
  x: number,
  y: number,
  points: DrawnPoint[],
  gridSize: number,
): SnapResult {
  // 1. Check point snap
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
    return { x: bestPoint.x, y: bestPoint.y, snappedToVar: bestPoint.varName, xAligned: true, yAligned: true };
  }

  // 2. Check axis alignment with existing points
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

  // 3. Grid snap on non-axis-aligned coordinates
  const gridSnap = Math.max(1, gridSize / 5);
  if (!xAligned) snapX = Math.round(snapX / gridSnap) * gridSnap;
  if (!yAligned) snapY = Math.round(snapY / gridSnap) * gridSnap;

  return { x: roundCoord(snapX), y: roundCoord(snapY), snappedToVar: null, xAligned, yAligned };
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
function findNearestEntity(
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
  dimensionInput: null as DrawState['dimensionInput'],
  showExitConfirm: false,
  constructionMode: false,
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
    set({ tool, pendingClicks: [], selectedEntities: [] });
  },

  cancelPending: () => {
    set({ pendingClicks: [], selectedEntities: [] });
  },

  toggleConstructionMode: () => {
    set((s) => ({ constructionMode: !s.constructionMode }));
  },

  setPolygonSides: (n) => {
    set({ polygonSides: Math.max(3, Math.min(32, n)) });
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
    const snap = findSnapTarget(rawX, rawY, state.points, gridSize);
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

        set({
          statements: result.statements,
          points: result.points,
          lines: result.lines,
          nextPointIdx: result.nextPointIdx,
          nextLineIdx: result.nextLineIdx,
          pendingClicks: [],
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
        const pending = [...state.pendingClicks, { x, y, snappedToVar }];
        if (pending.length < 3) {
          set({ pendingClicks: pending });
          return;
        }

        // 3-point arc
        const [p1, p2, p3] = pending;
        const newStatements = [...state.statements];
        const newPoints = [...state.points];
        const newArcs = [...state.arcs];
        let nextPIdx = state.nextPointIdx;
        const nextAIdx = state.nextArcIdx;

        const vars: string[] = [];
        for (const pt of [p1, p2, p3]) {
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

        set({
          statements: newStatements,
          points: newPoints,
          circles: newCircles,
          nextPointIdx: nextPIdx,
          nextCircleIdx: nextCIdx + 1,
          pendingClicks: [],
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
    const snap = findSnapTarget(pt.x, pt.y, state.points, gridSize);
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
