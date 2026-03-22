/**
 * Draw mode state management.
 *
 * Manages the interactive drawing session: active tool, pending clicks,
 * snap detection, and code generation. Each draw action appends statements
 * to the session, regenerates the sketch code, and updates the file.
 */
import { create } from 'zustand';
import {
  type DrawSessionState,
  type DrawnPoint,
  generateSketchCode,
  pointStatement,
  lineStatement,
  circleStatement,
  constraintStatement,
  roundCoord,
} from './codegen';
import { useForgeStore } from '../store/forgeStore';

export type DrawTool = 'point' | 'line' | 'rectangle' | 'circle';

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

interface DrawState {
  active: boolean;
  tool: DrawTool;

  // Session state
  statements: string[];
  points: DrawnPoint[];
  nextPointIdx: number;
  nextLineIdx: number;
  nextCircleIdx: number;

  // In-progress interaction
  pendingClicks: { x: number; y: number; snappedToVar: string | null }[];
  previewPoint: { x: number; y: number } | null;
  snapResult: SnapResult | null;

  // The file being drawn into
  targetFile: string | null;

  // Actions
  enterDrawMode: () => void;
  exitDrawMode: () => void;
  setTool: (tool: DrawTool) => void;
  handleClick: (x: number, y: number) => void;
  setPreviewPoint: (pt: { x: number; y: number } | null) => void;
  cancelPending: () => void;
  undo: () => void;
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
  const gridSnap = Math.max(1, gridSize / 5); // snap to 1/5 of grid size
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
  // Trigger re-evaluation
  setTimeout(() => useForgeStore.getState().execute(), 0);
}

export const useDrawStore = create<DrawState>((set, get) => ({
  active: false,
  tool: 'line',

  statements: [],
  points: [],
  nextPointIdx: 0,
  nextLineIdx: 0,
  nextCircleIdx: 0,

  pendingClicks: [],
  previewPoint: null,
  snapResult: null,

  targetFile: null,

  enterDrawMode: () => {
    const forgeStore = useForgeStore.getState();
    let targetFile = forgeStore.activeFile;

    // If the file has content, create a new sketch file
    const existingCode = forgeStore.files[targetFile] ?? '';
    if (existingCode.trim().length > 0) {
      // Find a unique name
      let idx = 1;
      while (forgeStore.files[`drawing-${idx}.sketch.js`]) idx++;
      targetFile = `drawing-${idx}.sketch.js`;
      forgeStore.createFile(targetFile);
      forgeStore.setActiveFile(targetFile);
    }

    // Ensure it's a .sketch.js file
    if (!targetFile.endsWith('.sketch.js')) {
      // Rename by creating a new file
      const newName = targetFile.replace(/\.(js|sketch\.js)$/, '') + '.sketch.js';
      if (newName !== targetFile && !forgeStore.files[newName]) {
        forgeStore.createFile(newName);
        forgeStore.setActiveFile(newName);
        targetFile = newName;
      }
    }

    // Generate initial empty sketch
    const initialCode = generateSketchCode({ statements: [], points: [] });
    forgeStore.updateFileCode(targetFile, initialCode);
    setTimeout(() => forgeStore.execute(), 0);

    set({
      active: true,
      tool: 'line',
      statements: [],
      points: [],
      nextPointIdx: 0,
      nextLineIdx: 0,
      nextCircleIdx: 0,
      pendingClicks: [],
      previewPoint: null,
      snapResult: null,
      targetFile,
    });
  },

  exitDrawMode: () => {
    set({
      active: false,
      pendingClicks: [],
      previewPoint: null,
      snapResult: null,
    });
  },

  setTool: (tool) => {
    set({ tool, pendingClicks: [], previewPoint: null });
  },

  cancelPending: () => {
    set({ pendingClicks: [] });
  },

  handleClick: (rawX, rawY) => {
    const state = get();
    if (!state.active) return;

    const gridSize = useForgeStore.getState().gridSize;
    const snap = findSnapTarget(rawX, rawY, state.points, gridSize);
    const { x, y, snappedToVar } = snap;

    switch (state.tool) {
      case 'point': {
        if (snappedToVar) return; // Don't create duplicate point
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

        // Two clicks collected — create line
        const [start, end] = pending;
        const newStatements = [...state.statements];
        const newPoints = [...state.points];
        let nextPIdx = state.nextPointIdx;
        let nextLIdx = state.nextLineIdx;

        // Get or create start point
        let startVar = start.snappedToVar;
        if (!startVar) {
          startVar = `p${nextPIdx}`;
          newStatements.push(pointStatement(startVar, start.x, start.y));
          newPoints.push({ varName: startVar, x: start.x, y: start.y });
          nextPIdx++;
        }

        // Get or create end point
        let endVar = end.snappedToVar;
        if (!endVar) {
          endVar = `p${nextPIdx}`;
          newStatements.push(pointStatement(endVar, end.x, end.y));
          newPoints.push({ varName: endVar, x: end.x, y: end.y });
          nextPIdx++;
        }

        // Create line
        const lineVar = `l${nextLIdx}`;
        newStatements.push(lineStatement(lineVar, startVar, endVar));
        nextLIdx++;

        // Auto-detect horizontal/vertical constraint
        const lineConstraint = detectLineConstraint(start.x, start.y, end.x, end.y);
        if (lineConstraint) {
          newStatements.push(constraintStatement(lineConstraint, lineVar));
        }

        set({
          statements: newStatements,
          points: newPoints,
          nextPointIdx: nextPIdx,
          nextLineIdx: nextLIdx,
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
        let nextPIdx = state.nextPointIdx;
        const nextLIdx = state.nextLineIdx;

        // Create 4 corner points
        const vars = ['bl', 'br', 'tr', 'tl'].map((suffix) => `p${nextPIdx++}`);
        const corners: [number, number][] = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
        corners.forEach((c, i) => {
          newStatements.push(pointStatement(vars[i], c[0], c[1]));
          newPoints.push({ varName: vars[i], x: c[0], y: c[1] });
        });

        // Create 4 lines
        const lineVars: string[] = [];
        for (let i = 0; i < 4; i++) {
          const lv = `l${nextLIdx + i}`;
          lineVars.push(lv);
          newStatements.push(lineStatement(lv, vars[i], vars[(i + 1) % 4]));
        }

        // Add constraints: H, V, H, V + length + fixed
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
        let nextPIdx = state.nextPointIdx;
        const nextCIdx = state.nextCircleIdx;

        // Get or create center point
        let centerVar = center.snappedToVar;
        if (!centerVar) {
          centerVar = `p${nextPIdx}`;
          newStatements.push(pointStatement(centerVar, center.x, center.y));
          newPoints.push({ varName: centerVar, x: center.x, y: center.y });
          nextPIdx++;
        }

        // Create circle
        const circleVar = `c${nextCIdx}`;
        newStatements.push(circleStatement(circleVar, centerVar, radius));

        set({
          statements: newStatements,
          points: newPoints,
          nextPointIdx: nextPIdx,
          nextCircleIdx: nextCIdx + 1,
          pendingClicks: [],
        });
        syncCodeToFile({ statements: newStatements, points: newPoints, targetFile: state.targetFile });
        break;
      }
    }
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
      set({ pendingClicks: [] });
      return;
    }
    if (state.statements.length === 0) return;

    // Remove statements from the last action (find the last entity and remove everything after it)
    // Simple approach: find the last point/line/circle/constraint block and remove it
    const newStatements = [...state.statements];
    const lastStmt = newStatements[newStatements.length - 1];

    // Remove trailing constraints first
    while (newStatements.length > 0 && newStatements[newStatements.length - 1].startsWith('sk.')) {
      newStatements.pop();
    }
    // Remove the last entity (line/circle)
    if (newStatements.length > 0 && !newStatements[newStatements.length - 1].startsWith('sk.')) {
      const removed = newStatements.pop()!;
      // If it's a line, keep the points (they might be shared)
      // If it's a point that was created for this entity, also remove it
      // For simplicity in MVP, only remove the entity + constraints
    }

    // Rebuild points list from remaining statements
    const newPoints: DrawnPoint[] = [];
    const pointRegex = /^const (p\d+) = sk\.point\((-?[\d.]+), (-?[\d.]+)\);$/;
    for (const stmt of newStatements) {
      const m = stmt.match(pointRegex);
      if (m) {
        newPoints.push({ varName: m[1], x: parseFloat(m[2]), y: parseFloat(m[3]) });
      }
    }

    set({ statements: newStatements, points: newPoints });
    syncCodeToFile({ statements: newStatements, points: newPoints, targetFile: state.targetFile });
  },
}));
