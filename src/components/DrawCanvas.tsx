/**
 * DrawCanvas — Three.js component rendered inside the R3F Canvas.
 * Provides a hit plane for capturing draw-mode clicks and renders
 * preview geometry (rubber-band lines, snap indicators, etc.).
 */

import { Html } from '@react-three/drei';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { findNearestEntity, useDrawStore } from '../draw/drawStore';

/**
 * Hook that returns a world-space pixel size — the number of world units
 * that correspond to 1 CSS pixel at the current zoom level.
 * Multiply by desired pixel size to get zoom-independent world dimensions.
 */
function useWorldPixel(): number {
  const [wp, setWp] = useState(1);
  useFrame(({ camera, size }) => {
    const ortho = camera as THREE.OrthographicCamera;
    if (!ortho.isOrthographicCamera) return;
    const worldH = (ortho.top - ortho.bottom) / Math.max(1e-6, ortho.zoom);
    const next = worldH / Math.max(1, size.height);
    // Only update when it changes meaningfully (avoid excessive re-renders)
    if (Math.abs(next - wp) > wp * 0.02) setWp(next);
  });
  return wp;
}

/** Crosshair rendered at the snap position — constant screen size. */
function SnapCrosshair({ x, y, snapped, wp }: { x: number; y: number; snapped: boolean; wp: number }) {
  const size = wp * 12; // 12 screen pixels
  const color = snapped ? '#4ade80' : '#a3a3a3';
  const geo = useMemo(() => {
    const pts = [
      new THREE.Vector3(x - size, y, 0.6),
      new THREE.Vector3(x + size, y, 0.6),
      new THREE.Vector3(x, y, 0.6),
      new THREE.Vector3(x, y - size, 0.6),
      new THREE.Vector3(x, y + size, 0.6),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [x, y, size]);

  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={color} linewidth={1} transparent opacity={0.8} />
    </lineSegments>
  );
}

/** Rubber-band line from first click to current mouse position. */
function RubberBandLine({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const lineObj = useMemo(() => {
    const pts = [new THREE.Vector3(from.x, from.y, 0.6), new THREE.Vector3(to.x, to.y, 0.6)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.7 });
    return new THREE.Line(geo, mat);
  }, [from.x, from.y, to.x, to.y]);

  return <primitive object={lineObj} raycast={() => null} />;
}

/** Preview rectangle outline. */
function RubberBandRect({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const lineObj = useMemo(() => {
    const x1 = Math.min(from.x, to.x);
    const y1 = Math.min(from.y, to.y);
    const x2 = Math.max(from.x, to.x);
    const y2 = Math.max(from.y, to.y);
    const pts = [
      new THREE.Vector3(x1, y1, 0.6),
      new THREE.Vector3(x2, y1, 0.6),
      new THREE.Vector3(x2, y2, 0.6),
      new THREE.Vector3(x1, y2, 0.6),
      new THREE.Vector3(x1, y1, 0.6),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.7 });
    return new THREE.Line(geo, mat);
  }, [from.x, from.y, to.x, to.y]);

  return <primitive object={lineObj} raycast={() => null} />;
}

/** Preview circle outline. */
function RubberBandCircle({ center, radius }: { center: { x: number; y: number }; radius: number }) {
  const lineObj = useMemo(() => {
    const segments = 64;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, 0.6));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.7 });
    return new THREE.Line(geo, mat);
  }, [center.x, center.y, radius]);

  return <primitive object={lineObj} raycast={() => null} />;
}

/** Coordinate label showing current position near the cursor — offset is zoom-independent. */
function CoordLabel({ x, y, wp }: { x: number; y: number; wp: number }) {
  const offset = wp * 18; // 18 screen pixels away from cursor
  return (
    <Html position={[x + offset, y - offset, 0.7]} center={false} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          background: '#111111d9',
          color: '#e5e5e5',
          padding: '2px 6px',
          borderRadius: 3,
          fontSize: 10,
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          border: '1px solid #333',
        }}
      >
        {x.toFixed(1)}, {y.toFixed(1)}
      </div>
    </Html>
  );
}

/** Axis alignment guides — lines from aligned point to cursor. */
function AlignmentGuides({
  x,
  y,
  points,
  snapResult,
}: {
  x: number;
  y: number;
  points: { x: number; y: number }[];
  snapResult: { xAligned: boolean; yAligned: boolean; snappedToVar: string | null } | null;
}) {
  const lineObjs = useMemo(() => {
    if (!snapResult || snapResult.snappedToVar) return [];
    const result: THREE.Line[] = [];
    const mat = new THREE.LineBasicMaterial({ color: '#34d399', transparent: true, opacity: 0.4 });

    if (snapResult.xAligned) {
      for (const p of points) {
        if (Math.abs(p.x - x) < 0.01) {
          const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(x, Math.min(y, p.y), 0.5),
            new THREE.Vector3(x, Math.max(y, p.y), 0.5),
          ]);
          result.push(new THREE.Line(geo, mat));
          break;
        }
      }
    }

    if (snapResult.yAligned) {
      for (const p of points) {
        if (Math.abs(p.y - y) < 0.01) {
          const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(Math.min(x, p.x), y, 0.5),
            new THREE.Vector3(Math.max(x, p.x), y, 0.5),
          ]);
          result.push(new THREE.Line(geo, mat));
          break;
        }
      }
    }

    return result;
  }, [x, y, points, snapResult]);

  return (
    <>
      {lineObjs.map((obj, i) => (
        <primitive key={i} object={obj} raycast={() => null} />
      ))}
    </>
  );
}

/** Small point dot — zoom-independent size. */
function PointMarker({ x, y, wp, color = '#60a5fa' }: { x: number; y: number; wp: number; color?: string }) {
  const radius = wp * 4; // 4 screen pixels
  return (
    <mesh position={[x, y, 0.6]}>
      <circleGeometry args={[radius, 16]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

/** Hover highlight ring for a point — unfilled ring outline in amber. */
function HoverPointHighlight({ x, y, wp }: { x: number; y: number; wp: number }) {
  const radius = wp * 6; // slightly larger than PointMarker
  const lineObj = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const segments = 24;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 0.65));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#f59e0b', linewidth: 2, transparent: true, opacity: 0.9 });
    return new THREE.Line(geo, mat);
  }, [x, y, radius]);

  return <primitive object={lineObj} raycast={() => null} />;
}

/** Hover highlight for a line — re-renders the segment in amber. */
function HoverLineHighlight({ varName }: { varName: string }) {
  const lines = useDrawStore((s) => s.lines);
  const storePoints = useDrawStore((s) => s.points);

  const lineObj = useMemo(() => {
    const ln = lines.find((l) => l.varName === varName);
    if (!ln) return null;
    const p1 = storePoints.find((p) => p.varName === ln.startVar);
    const p2 = storePoints.find((p) => p.varName === ln.endVar);
    if (!p1 || !p2) return null;
    const pts = [new THREE.Vector3(p1.x, p1.y, 0.65), new THREE.Vector3(p2.x, p2.y, 0.65)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#f59e0b', linewidth: 2, transparent: true, opacity: 0.9 });
    return new THREE.Line(geo, mat);
  }, [varName, lines, storePoints]);

  if (!lineObj) return null;
  return <primitive object={lineObj} raycast={() => null} />;
}

/** Hover highlight for a circle — amber outline. */
function HoverCircleHighlight({ varName }: { varName: string }) {
  const circles = useDrawStore((s) => s.circles);
  const storePoints = useDrawStore((s) => s.points);

  const lineObj = useMemo(() => {
    const c = circles.find((ci) => ci.varName === varName);
    if (!c) return null;
    const center = storePoints.find((p) => p.varName === c.centerVar);
    if (!center) return null;
    const segments = 64;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(center.x + Math.cos(angle) * c.radius, center.y + Math.sin(angle) * c.radius, 0.65));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#f59e0b', linewidth: 2, transparent: true, opacity: 0.9 });
    return new THREE.Line(geo, mat);
  }, [varName, circles, storePoints]);

  if (!lineObj) return null;
  return <primitive object={lineObj} raycast={() => null} />;
}

/** Construction line overlay — dashed line rendered over the existing entity. */
function ConstructionLineOverlay({ varName }: { varName: string }) {
  const lines = useDrawStore((s) => s.lines);
  const storePoints = useDrawStore((s) => s.points);

  const lineObj = useMemo(() => {
    const ln = lines.find((l) => l.varName === varName);
    if (!ln) return null;
    const p1 = storePoints.find((p) => p.varName === ln.startVar);
    const p2 = storePoints.find((p) => p.varName === ln.endVar);
    if (!p1 || !p2) return null;
    const pts = [new THREE.Vector3(p1.x, p1.y, 0.62), new THREE.Vector3(p2.x, p2.y, 0.62)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.computeBoundingSphere();
    const mat = new THREE.LineDashedMaterial({
      color: '#9ca3af',
      dashSize: 2,
      gapSize: 1.5,
      transparent: true,
      opacity: 0.6,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    return line;
  }, [varName, lines, storePoints]);

  if (!lineObj) return null;
  return <primitive object={lineObj} raycast={() => null} />;
}

/** Construction circle overlay — dashed circle rendered over the existing entity. */
function ConstructionCircleOverlay({ varName }: { varName: string }) {
  const circles = useDrawStore((s) => s.circles);
  const storePoints = useDrawStore((s) => s.points);

  const lineObj = useMemo(() => {
    const c = circles.find((ci) => ci.varName === varName);
    if (!c) return null;
    const center = storePoints.find((p) => p.varName === c.centerVar);
    if (!center) return null;
    const segments = 64;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(center.x + Math.cos(angle) * c.radius, center.y + Math.sin(angle) * c.radius, 0.62));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.computeBoundingSphere();
    const mat = new THREE.LineDashedMaterial({
      color: '#9ca3af',
      dashSize: 2,
      gapSize: 1.5,
      transparent: true,
      opacity: 0.6,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    return line;
  }, [varName, circles, storePoints]);

  if (!lineObj) return null;
  return <primitive object={lineObj} raycast={() => null} />;
}

export function DrawCanvas() {
  const active = useDrawStore((s) => s.active);
  const tool = useDrawStore((s) => s.tool);
  const handleClick = useDrawStore((s) => s.handleClick);
  const setPreviewPoint = useDrawStore((s) => s.setPreviewPoint);
  const setHoveredEntity = useDrawStore((s) => s.setHoveredEntity);
  const pendingClicks = useDrawStore((s) => s.pendingClicks);
  const previewPoint = useDrawStore((s) => s.previewPoint);
  const snapResult = useDrawStore((s) => s.snapResult);
  const points = useDrawStore((s) => s.points);
  const selectedEntities = useDrawStore((s) => s.selectedEntities);
  const hoveredEntity = useDrawStore((s) => s.hoveredEntity);
  const constructionEntities = useDrawStore((s) => s.constructionEntities);
  const storeLines = useDrawStore((s) => s.lines);
  const storeCircles = useDrawStore((s) => s.circles);

  const wp = useWorldPixel();

  if (!active) return null;

  const isSnappedToPoint = !!snapResult?.snappedToVar;

  // Determine which construction entity varNames correspond to lines vs circles
  const constructionLineVarNames = storeLines.filter((l) => constructionEntities.has(l.varName)).map((l) => l.varName);
  const constructionCircleVarNames = storeCircles.filter((c) => constructionEntities.has(c.varName)).map((c) => c.varName);

  return (
    <>
      {/* Large transparent hit plane to capture all pointer events */}
      <mesh
        position={[0, 0, 0.4]}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setPreviewPoint({ x: e.point.x, y: e.point.y });
          // Detect hovered entity for highlight feedback
          const state = useDrawStore.getState();
          const hoverThreshold = wp * 8; // 8 screen pixels, zoom-independent
          const nearest = findNearestEntity(e.point.x, e.point.y, state, hoverThreshold);
          setHoveredEntity(nearest);
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          handleClick(e.point.x, e.point.y);
        }}
        onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          useDrawStore.getState().handleDoubleClick(e.point.x, e.point.y);
        }}
        onPointerLeave={() => {
          setPreviewPoint(null);
          setHoveredEntity(null);
        }}
        onContextMenu={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          useDrawStore.getState().cancelPending();
        }}
      >
        <planeGeometry args={[4000, 4000]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Snap crosshair */}
      {previewPoint && <SnapCrosshair x={previewPoint.x} y={previewPoint.y} snapped={isSnappedToPoint} wp={wp} />}

      {/* Coordinate label */}
      {previewPoint && <CoordLabel x={previewPoint.x} y={previewPoint.y} wp={wp} />}

      {/* Alignment guides */}
      {previewPoint && <AlignmentGuides x={previewPoint.x} y={previewPoint.y} points={points} snapResult={snapResult} />}

      {/* Rubber-band preview for line tool */}
      {(tool === 'line' || tool === 'polyline') && pendingClicks.length >= 1 && previewPoint && (
        <RubberBandLine from={pendingClicks[pendingClicks.length - 1]} to={previewPoint} />
      )}

      {/* Rubber-band preview for rectangle tool */}
      {tool === 'rectangle' && pendingClicks.length === 1 && previewPoint && <RubberBandRect from={pendingClicks[0]} to={previewPoint} />}

      {/* Rubber-band preview for circle tool */}
      {tool === 'circle' && pendingClicks.length === 1 && previewPoint && (
        <RubberBandCircle
          center={pendingClicks[0]}
          radius={Math.hypot(previewPoint.x - pendingClicks[0].x, previewPoint.y - pendingClicks[0].y)}
        />
      )}

      {/* Rubber-band preview for arc tool (3-point) */}
      {tool === 'arc' &&
        pendingClicks.length >= 1 &&
        previewPoint &&
        (pendingClicks.length === 1 ? (
          <RubberBandLine from={pendingClicks[0]} to={previewPoint} />
        ) : (
          <RubberBandArc p1={pendingClicks[0]} p2={pendingClicks[1]} p3={previewPoint} />
        ))}

      {/* Polyline segments already committed in this chain */}
      {tool === 'polyline' &&
        pendingClicks.length >= 2 &&
        pendingClicks.slice(0, -1).map((pt, i) => <RubberBandLine key={`poly-${i}`} from={pt} to={pendingClicks[i + 1]} />)}

      {/* Point markers for pending clicks — zoom-independent */}
      {pendingClicks.map((pt, i) => (
        <PointMarker key={`pending-${i}`} x={pt.x} y={pt.y} wp={wp} />
      ))}

      {/* Highlight selected entities for constraint tools */}
      {selectedEntities.map((ent, i) =>
        ent.type === 'point' ? <PointMarker key={`sel-${i}`} x={ent.x!} y={ent.y!} wp={wp} color="#f59e0b" /> : null,
      )}

      {/* Hovered entity highlight */}
      {hoveredEntity && hoveredEntity.type === 'point' && hoveredEntity.x != null && hoveredEntity.y != null && (
        <HoverPointHighlight x={hoveredEntity.x} y={hoveredEntity.y} wp={wp} />
      )}
      {hoveredEntity && hoveredEntity.type === 'line' && <HoverLineHighlight varName={hoveredEntity.varName} />}
      {hoveredEntity && hoveredEntity.type === 'circle' && <HoverCircleHighlight varName={hoveredEntity.varName} />}

      {/* Construction entity overlays — dashed lines for construction geometry */}
      {constructionLineVarNames.map((varName) => (
        <ConstructionLineOverlay key={`constr-${varName}`} varName={varName} />
      ))}
      {constructionCircleVarNames.map((varName) => (
        <ConstructionCircleOverlay key={`constr-${varName}`} varName={varName} />
      ))}
    </>
  );
}

/** Preview arc through 3 points. */
function RubberBandArc({ p1, p2, p3 }: { p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number } }) {
  const lineObj = useMemo(() => {
    // Compute circumscribed circle through 3 points
    const ax = p1.x,
      ay = p1.y,
      bx = p2.x,
      by = p2.y,
      cx = p3.x,
      cy = p3.y;
    const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(D) < 1e-10) {
      // Points are collinear — draw straight lines
      const pts = [new THREE.Vector3(ax, ay, 0.6), new THREE.Vector3(bx, by, 0.6), new THREE.Vector3(cx, cy, 0.6)];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.7 });
      return new THREE.Line(geo, mat);
    }
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
    const r = Math.hypot(ax - ux, ay - uy);

    // Compute angles
    let a1 = Math.atan2(ay - uy, ax - ux);
    const _a2 = Math.atan2(by - uy, bx - ux);
    let a3 = Math.atan2(cy - uy, cx - ux);

    // Determine arc direction
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const ccw = cross > 0;

    const normalize = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    a1 = normalize(a1);
    a3 = normalize(a3);

    const startAngle = a1;
    let endAngle = a3;
    if (ccw) {
      if (endAngle <= startAngle) endAngle += Math.PI * 2;
    } else {
      if (endAngle >= startAngle) endAngle -= Math.PI * 2;
    }

    const segments = 48;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = startAngle + (endAngle - startAngle) * t;
      pts.push(new THREE.Vector3(ux + Math.cos(angle) * r, uy + Math.sin(angle) * r, 0.6));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.7 });
    return new THREE.Line(geo, mat);
  }, [p1.x, p1.y, p2.x, p2.y, p3.x, p3.y]);

  return <primitive object={lineObj} raycast={() => null} />;
}

/** Preview ellipse outline. */
function _RubberBandEllipse({ center, rx, ry }: { center: { x: number; y: number }; rx: number; ry: number }) {
  const lineObj = useMemo(() => {
    const segments = 64;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(center.x + Math.cos(angle) * rx, center.y + Math.sin(angle) * ry, 0.6));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.7 });
    return new THREE.Line(geo, mat);
  }, [center.x, center.y, rx, ry]);

  return <primitive object={lineObj} raycast={() => null} />;
}

/** Preview slot (stadium) outline. */
function _RubberBandSlot({
  c1,
  c2,
  widthPt,
}: {
  c1: { x: number; y: number };
  c2: { x: number; y: number };
  widthPt: { x: number; y: number };
}) {
  const lineObj = useMemo(() => {
    const dx = c2.x - c1.x;
    const dy = c2.y - c1.y;
    const lineLen = Math.hypot(dx, dy);
    if (lineLen < 0.1) return null;

    const perpDist = Math.abs(dx * (c1.y - widthPt.y) - dy * (c1.x - widthPt.x)) / lineLen;
    const radius = Math.max(0.5, perpDist);

    const nx = -dy / lineLen;
    const ny = dx / lineLen;

    const pts: THREE.Vector3[] = [];
    const arcSegments = 24;

    // Top line
    pts.push(new THREE.Vector3(c1.x + nx * radius, c1.y + ny * radius, 0.6));
    pts.push(new THREE.Vector3(c2.x + nx * radius, c2.y + ny * radius, 0.6));

    // Right semicircle around c2
    const startAngle1 = Math.atan2(ny, nx);
    for (let i = 0; i <= arcSegments; i++) {
      const a = startAngle1 - (i / arcSegments) * Math.PI;
      pts.push(new THREE.Vector3(c2.x + Math.cos(a) * radius, c2.y + Math.sin(a) * radius, 0.6));
    }

    // Bottom line
    pts.push(new THREE.Vector3(c1.x - nx * radius, c1.y - ny * radius, 0.6));

    // Left semicircle around c1
    const startAngle2 = Math.atan2(-ny, -nx);
    for (let i = 0; i <= arcSegments; i++) {
      const a = startAngle2 - (i / arcSegments) * Math.PI;
      pts.push(new THREE.Vector3(c1.x + Math.cos(a) * radius, c1.y + Math.sin(a) * radius, 0.6));
    }

    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.7 });
    return new THREE.Line(geo, mat);
  }, [c1.x, c1.y, c2.x, c2.y, widthPt.x, widthPt.y]);

  if (!lineObj) return null;
  return <primitive object={lineObj} raycast={() => null} />;
}
