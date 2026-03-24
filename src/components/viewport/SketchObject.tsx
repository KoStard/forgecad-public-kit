import type { SceneObject } from '@forge/index';
import type { HighlightDef } from '@forge/sketch/highlights';
import { convertFromMm } from '@forge/units';
import { Html } from '@react-three/drei';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { type ObjectSettings, type RenderMode, useForgeStore } from '../../store/forgeStore';
import { themes } from '../../theme';
import { findHoveredSurface, findNearestSketchEntity, type SketchHoveredEntity } from './sketchHitTesting';

/** Format a constraint value for display — strips trailing ".00" and rounds large values. */
const formatConstraintValue = (value: number): string => {
  if (Number.isNaN(value)) return '';
  const rounded = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
  return rounded.replace(/\.00$/, '');
};

/** Renders a 2D sketch as filled shape + outline on the XY plane */
export function SketchObject({
  obj,
  settings,
  renderMode,
  matrix,
  isSketchMode,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onClick,
  onDoubleClick,
  onContextMenu,
  onEntityClick,
  onVertexHover,
}: {
  obj: SceneObject;
  settings: ObjectSettings;
  renderMode: RenderMode;
  matrix: THREE.Matrix4;
  isSketchMode?: boolean;
  onPointerEnter?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerLeave?: (event: ThreeEvent<PointerEvent>) => void;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void;
  onContextMenu?: (event: ThreeEvent<MouseEvent>) => void;
  onEntityClick?: (entity: SketchHoveredEntity, clientX: number, clientY: number) => void;
  onVertexHover?: (pointId: string, event: ThreeEvent<PointerEvent>) => void;
}) {
  const sketchTheme = useForgeStore((s) => themes[s.theme]);
  const surfacesVisible = useForgeStore((s) => s.surfacesVisible);
  const [hoveredEntity, setHoveredEntity] = useState<SketchHoveredEntity | null>(null);
  const [hoveredSurfIdx, setHoveredSurfIdx] = useState<number | null>(null);
  const worldThresholdRef = useRef(5);
  const selectedConstraintId = useForgeStore((s) => s.selectedConstraintId);
  const setSelectedConstraintId = useForgeStore((s) => s.setSelectedConstraintId);
  const selectedSurfaceIndex = useForgeStore((s) => s.selectedSurfaceIndex);
  const setSelectedSurfaceIndex = useForgeStore((s) => s.setSelectedSurfaceIndex);
  const setHoveredSurfaceIndex = useForgeStore((s) => s.setHoveredSurfaceIndex);
  const selectedSketchEntityId = useForgeStore((s) => s.selectedSketchEntityId);
  const setSelectedSketchEntityId = useForgeStore((s) => s.setSelectedSketchEntityId);

  useFrame(({ camera, size }) => {
    if (!isSketchMode) return;
    const ortho = camera as THREE.OrthographicCamera;
    if (!ortho.isOrthographicCamera) return;
    const worldH = (ortho.top - ortho.bottom) / Math.max(1e-6, ortho.zoom);
    worldThresholdRef.current = (worldH / Math.max(1, size.height)) * 10;
  });
  const { fillGeo, lineGeos, pointGeos } = useMemo(() => {
    if (!obj.sketch) return { fillGeo: null, lineGeos: [] as THREE.BufferGeometry[], pointGeos: [] as THREE.BufferGeometry[] };
    try {
      const polys = obj.sketch.toPolygons();
      const lines: THREE.BufferGeometry[] = [];
      const points: THREE.BufferGeometry[] = [];

      for (const contour of polys) {
        if (contour.length === 1) {
          const pt = new THREE.Vector3(contour[0][0], contour[0][1], 0);
          points.push(new THREE.BufferGeometry().setFromPoints([pt]));
        } else if (contour.length >= 2) {
          const pts = contour.map((p: number[]) => new THREE.Vector3(p[0], p[1], 0));
          pts.push(pts[0]);
          lines.push(new THREE.BufferGeometry().setFromPoints(pts));
        }
      }

      const shapes: THREE.Shape[] = [];
      for (const contour of polys) {
        if (contour.length < 3) continue;
        const shape = new THREE.Shape();
        shape.moveTo(contour[0][0], contour[0][1]);
        for (let i = 1; i < contour.length; i++) {
          shape.lineTo(contour[i][0], contour[i][1]);
        }
        shape.closePath();
        shapes.push(shape);
      }
      const fill = shapes.length > 0 ? new THREE.ShapeGeometry(shapes) : null;

      return { fillGeo: fill, lineGeos: lines, pointGeos: points };
    } catch {
      return { fillGeo: null, lineGeos: [] as THREE.BufferGeometry[], pointGeos: [] as THREE.BufferGeometry[] };
    }
  }, [obj.sketch]);

  // Global status color — used for fill and polygon outlines (sketch geometry without entity IDs).
  const constraintStatusColor =
    obj.sketchMeta?.status === 'over'
      ? sketchTheme.sketchOverConstrained
      : obj.sketchMeta?.status === 'fully'
        ? sketchTheme.sketchFullyConstrained
        : obj.sketchMeta?.status === 'under'
          ? sketchTheme.sketchUnderConstrained
          : settings.color;

  // Per-entity color map: entity ID → worst constraint status color.
  // Only problematic edges get colored; normal edges stay neutral.
  const entityColorMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!obj.sketchMeta) return map;
    for (const c of obj.sketchMeta.constraints) {
      const color = c.isConflicting ? sketchTheme.sketchConflicting : c.isRedundant ? sketchTheme.sketchRedundant : null;
      if (!color) continue;
      for (const eid of c.entityIds) {
        const existing = map.get(eid);
        // conflicting takes priority over redundant
        if (!existing || (color === sketchTheme.sketchConflicting && existing !== sketchTheme.sketchConflicting)) {
          map.set(eid, color);
        }
      }
    }
    return map;
  }, [obj.sketchMeta, sketchTheme]);

  const lengthUnit = useForgeStore((s) => s.lengthUnit);

  // ─── Annotation-based constraint rendering ───
  // Symbol map: ConstraintSymbol → display character for Html overlays.
  const symbolChars: Record<string, string> = {
    parallel: '∥',
    equal: '=',
    perpendicular: '⊥',
    horizontal: 'H',
    vertical: 'V',
    fixed: '⚓',
    midpoint: '◆',
    coincident: '⊙',
    collinear: '·',
    tangent: 'T',
    concentric: '◎',
    ccw: '↺',
    symmetric: '⟷',
  };

  type AnnotationLabel = {
    key: string;
    text: string;
    position: [number, number, number];
    constraintId: string;
    isConflicting: boolean;
    isRedundant: boolean;
    entityIds: string[];
    fontSize?: number;
  };
  type AnnotationLine = { key: string; points: [number, number, number][]; color: string; opacity?: number; lineWidth?: number };
  type AnnotationTriangle = { key: string; points: [number, number][]; color: string };
  type AnnotationArc = { key: string; points: [number, number, number][]; color: string };

  /** Convert a dimension annotation value (mm string) to the user's preferred unit. */
  const convertDimValue = (raw: string): string => {
    // Extract leading prefix like "⌀" or "R" and numeric part
    const match = raw.match(/^([⌀R]?)(.+)$/);
    if (!match) return raw;
    const [, prefix, numStr] = match;
    const num = Number(numStr);
    if (isNaN(num)) return raw;
    const converted = convertFromMm(num, lengthUnit);
    return `${prefix}${formatConstraintValue(converted)} ${lengthUnit}`;
  };

  const constraintAnnotations = useMemo(() => {
    const labels: AnnotationLabel[] = [];
    const lines: AnnotationLine[] = [];
    const triangles: AnnotationTriangle[] = [];
    const arcs: AnnotationArc[] = [];

    if (!obj.sketchMeta) return { labels, lines, triangles, arcs };

    // Compute centroid of all sketch points to determine "inside" direction
    const allPts = obj.sketchMeta.edges.points;
    let cx = 0,
      cy = 0;
    if (allPts.length > 0) {
      for (const pt of allPts) {
        cx += pt.pos[0];
        cy += pt.pos[1];
      }
      cx /= allPts.length;
      cy /= allPts.length;
    }

    for (const c of obj.sketchMeta.constraints) {
      const color = c.isConflicting
        ? sketchTheme.sketchConflicting
        : c.isRedundant
          ? sketchTheme.sketchRedundant
          : sketchTheme.sketchConstraint;
      let annIdx = 0;
      for (const ann of c.annotations) {
        const k = `${c.id}-${annIdx++}`;
        if (ann.kind === 'symbol') {
          labels.push({
            key: k,
            text: symbolChars[ann.symbol] ?? ann.symbol,
            position: [ann.position[0], ann.position[1], 0.1],
            constraintId: c.id,
            isConflicting: c.isConflicting,
            isRedundant: c.isRedundant,
            entityIds: c.entityIds,
            fontSize: 9,
          });
        } else if (ann.kind === 'dimension') {
          // Extension lines (from → dimension line, to → dimension line)
          const dx = ann.to[0] - ann.from[0],
            dy = ann.to[1] - ann.from[1];
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          // Perpendicular direction: (-dy, dx) / len
          let perpX = -dy / len,
            perpY = dx / len;
          // Flip perpendicular if it points toward the centroid (inside the body)
          const segMidX = (ann.from[0] + ann.to[0]) / 2;
          const segMidY = (ann.from[1] + ann.to[1]) / 2;
          const toCentroidX = cx - segMidX,
            toCentroidY = cy - segMidY;
          const toCentroidLen = Math.sqrt(toCentroidX * toCentroidX + toCentroidY * toCentroidY);
          if (toCentroidLen > 1e-6) {
            // If perpendicular points toward centroid, flip the offset sign
            const dot = perpX * toCentroidX + perpY * toCentroidY;
            if (dot * ann.offset > 0) {
              // Perpendicular and offset both point toward centroid — flip
              perpX = -perpX;
              perpY = -perpY;
            }
          }
          const nx = perpX * ann.offset,
            ny = perpY * ann.offset;
          const f: [number, number] = [ann.from[0] + nx, ann.from[1] + ny];
          const t: [number, number] = [ann.to[0] + nx, ann.to[1] + ny];
          // Extension lines
          lines.push({
            key: `${k}-ext1`,
            points: [
              [ann.from[0], ann.from[1], 0.08],
              [f[0], f[1], 0.08],
            ],
            color,
            opacity: 0.5,
          });
          lines.push({
            key: `${k}-ext2`,
            points: [
              [ann.to[0], ann.to[1], 0.08],
              [t[0], t[1], 0.08],
            ],
            color,
            opacity: 0.5,
          });
          // Dimension line
          lines.push({
            key: `${k}-dim`,
            points: [
              [f[0], f[1], 0.08],
              [t[0], t[1], 0.08],
            ],
            color,
          });
          // Arrowheads
          const adx = t[0] - f[0],
            ady = t[1] - f[1];
          const alen = Math.sqrt(adx * adx + ady * ady) || 1;
          const ux = adx / alen,
            uy = ady / alen;
          const arrowLen = Math.min(0.8, alen * 0.15);
          const arrowW = arrowLen * 0.35;
          triangles.push({
            key: `${k}-arr1`,
            points: [
              f,
              [f[0] + ux * arrowLen + uy * arrowW, f[1] + uy * arrowLen - ux * arrowW],
              [f[0] + ux * arrowLen - uy * arrowW, f[1] + uy * arrowLen + ux * arrowW],
            ],
            color,
          });
          triangles.push({
            key: `${k}-arr2`,
            points: [
              t,
              [t[0] - ux * arrowLen + uy * arrowW, t[1] - uy * arrowLen - ux * arrowW],
              [t[0] - ux * arrowLen - uy * arrowW, t[1] - uy * arrowLen + ux * arrowW],
            ],
            color,
          });
          // Value label at midpoint of dimension line — convert from mm to user unit
          const mx = (f[0] + t[0]) / 2,
            my = (f[1] + t[1]) / 2;
          labels.push({
            key: `${k}-val`,
            text: convertDimValue(ann.value),
            position: [mx, my, 0.12],
            constraintId: c.id,
            isConflicting: c.isConflicting,
            isRedundant: c.isRedundant,
            entityIds: c.entityIds,
            fontSize: 10,
          });
        } else if (ann.kind === 'angle-arc') {
          // Arc geometry
          const segs = 32;
          const pts: [number, number, number][] = [];
          for (let i = 0; i <= segs; i++) {
            const a = ann.startAngle + (ann.endAngle - ann.startAngle) * (i / segs);
            const rad = (a * Math.PI) / 180;
            pts.push([ann.center[0] + Math.cos(rad) * ann.radius, ann.center[1] + Math.sin(rad) * ann.radius, 0.08]);
          }
          arcs.push({ key: `${k}-arc`, points: pts, color });
          // Value label at arc midpoint
          const midA = (((ann.startAngle + ann.endAngle) / 2) * Math.PI) / 180;
          const labelR = ann.radius * 1.3;
          labels.push({
            key: `${k}-val`,
            text: `${ann.value}°`,
            position: [ann.center[0] + Math.cos(midA) * labelR, ann.center[1] + Math.sin(midA) * labelR, 0.12],
            constraintId: c.id,
            isConflicting: c.isConflicting,
            isRedundant: c.isRedundant,
            entityIds: c.entityIds,
            fontSize: 9,
          });
        } else if (ann.kind === 'text') {
          labels.push({
            key: k,
            text: ann.text,
            position: [ann.position[0], ann.position[1], 0.1],
            constraintId: c.id,
            isConflicting: c.isConflicting,
            isRedundant: c.isRedundant,
            entityIds: c.entityIds,
          });
        }
      }
    }
    return { labels, lines, triangles, arcs };
  }, [obj.sketchMeta, sketchTheme, lengthUnit]);

  // Entity IDs referenced by the selected constraint — used for highlight rendering.
  const highlightedEntityIds = useMemo(() => {
    if (!selectedConstraintId || !obj.sketchMeta) return new Set<string>();
    const constraint = obj.sketchMeta.constraints.find((c) => c.id === selectedConstraintId);
    if (!constraint) return new Set<string>();
    return new Set(constraint.entityIds);
  }, [selectedConstraintId, obj.sketchMeta]);

  // Surface region fill geometries from arrangement detection.
  const surfaceFills = useMemo(() => {
    const surfaces = obj.sketchMeta?.surfaces;
    if (!surfaces || surfaces.length === 0) return [];
    const palette = [0x4488cc, 0x44cc88, 0xcc8844, 0xcc44aa, 0x88cc44, 0x44aacc, 0xaa44cc, 0xcccc44];
    return surfaces.map((s) => {
      const shape = new THREE.Shape();
      shape.moveTo(s.polygon[0][0], s.polygon[0][1]);
      for (let i = 1; i < s.polygon.length; i++) {
        shape.lineTo(s.polygon[i][0], s.polygon[i][1]);
      }
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      return { index: s.index, geo, color: palette[s.index % palette.length], area: s.area };
    });
  }, [obj.sketchMeta]);

  const edgeLines = useMemo(() => {
    const meta = obj.sketchMeta?.edges;
    if (!meta)
      return {
        lines: [] as { id: string; geo: THREE.BufferGeometry }[],
        circles: [] as { id: string; geo: THREE.BufferGeometry }[],
        points: [] as { id: string; pos: [number, number] }[],
      };
    const lines = meta.lines.map((line) => ({
      id: line.id,
      geo: new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(line.a[0], line.a[1], 0.01),
        new THREE.Vector3(line.b[0], line.b[1], 0.01),
      ]),
    }));
    const segments = 64;
    const circles = meta.circles.map((circle) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i += 1) {
        const angle = (i / segments) * Math.PI * 2;
        pts.push(
          new THREE.Vector3(circle.center[0] + Math.cos(angle) * circle.radius, circle.center[1] + Math.sin(angle) * circle.radius, 0.01),
        );
      }
      return { id: circle.id, geo: new THREE.BufferGeometry().setFromPoints(pts) };
    });
    return { lines, circles, points: meta.points };
  }, [obj.sketchMeta]);

  const constructionLines = useMemo(() => {
    const meta = obj.sketchMeta?.construction;
    if (!meta) return [] as THREE.Line[];
    return meta.lines.map((line) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(line.a[0], line.a[1], 0),
        new THREE.Vector3(line.b[0], line.b[1], 0),
      ]);
      const mat = new THREE.LineDashedMaterial({
        color: sketchTheme.sketchConstruction,
        dashSize: 2,
        gapSize: 1,
        transparent: true,
        opacity: 0.6,
      });
      const dashed = new THREE.Line(geo, mat);
      dashed.computeLineDistances();
      return dashed;
    });
  }, [obj.sketchMeta, sketchTheme]);

  const constructionCircles = useMemo(() => {
    const meta = obj.sketchMeta?.construction;
    if (!meta) return [] as THREE.Line[];
    const segments = 64;
    return meta.circles.map((circle) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i += 1) {
        const angle = (i / segments) * Math.PI * 2;
        pts.push(
          new THREE.Vector3(circle.center[0] + Math.cos(angle) * circle.radius, circle.center[1] + Math.sin(angle) * circle.radius, 0),
        );
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineDashedMaterial({
        color: sketchTheme.sketchConstruction,
        dashSize: 2,
        gapSize: 1,
        transparent: true,
        opacity: 0.6,
      });
      const dashed = new THREE.Line(geo, mat);
      dashed.computeLineDistances();
      return dashed;
    });
  }, [obj.sketchMeta, sketchTheme]);

  // Pulse animation for highlighted entities — oscillates between 0.5 and 1.0.
  const highlightPulseRef = useRef(1.0);
  useFrame(({ clock }) => {
    highlightPulseRef.current = 0.75 + 0.25 * Math.sin(clock.elapsedTime * 4);
  });

  // Build a lookup set for programmatic highlights.
  const highlightMap = useMemo(() => {
    const map = new Map<string, HighlightDef>();
    const highlights = obj.sketchMeta?.highlights;
    if (!highlights) return map;
    for (const h of highlights) {
      map.set(h.entityId, h);
    }
    return map;
  }, [obj.sketchMeta]);

  // Bounding box covering all sketch geometry — used as a transparent hit plane so
  // pointer events fire even when the cursor is over edges/vertices outside the fill.
  const hitPlaneBounds = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const expand = (x: number, y: number) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };
    for (const edge of edgeLines.lines) {
      const pos = edge.geo.attributes.position;
      if (pos) {
        for (let i = 0; i < pos.count; i++) expand(pos.getX(i), pos.getY(i));
      }
    }
    for (const pt of edgeLines.points) {
      expand(pt.pos[0], pt.pos[1]);
    }
    if (!isFinite(minX)) return null;
    const pad = 5;
    return {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      w: Math.max(maxX - minX + pad * 2, pad * 2),
      h: Math.max(maxY - minY + pad * 2, pad * 2),
    };
  }, [edgeLines]);

  // Inverted matrix for transforming world-space hit points to sketch-local 2D coords.
  const matrixInverse = useMemo(() => new THREE.Matrix4().copy(matrix).invert(), [matrix]);

  // Intercept pointer move to detect vertex proximity and call onVertexHover when close.
  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      onPointerMove?.(event);
      if (!onVertexHover || edgeLines.points.length === 0) return;
      const localPt = event.point.clone().applyMatrix4(matrixInverse);
      const THRESH = 5;
      let nearest: { id: string; dist: number } | null = null;
      for (const pt of edgeLines.points) {
        const d = Math.hypot(localPt.x - pt.pos[0], localPt.y - pt.pos[1]);
        if (d < THRESH && (!nearest || d < nearest.dist)) nearest = { id: pt.id, dist: d };
      }
      if (nearest) onVertexHover(nearest.id, event);
    },
    [edgeLines.points, matrixInverse, onPointerMove, onVertexHover],
  );

  if (!settings.visible) return null;

  const showFill = renderMode !== 'wireframe';

  return (
    <group
      matrixAutoUpdate={false}
      matrix={matrix}
      onPointerEnter={onPointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={(event) => {
        setHoveredEntity(null);
        setHoveredSurfIdx(null);
        setHoveredSurfaceIndex(null);
        onPointerLeave?.(event);
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {fillGeo && showFill && (
        <mesh
          geometry={fillGeo}
          onPointerMove={
            isSketchMode && obj.sketchMeta
              ? (e) => {
                  const entity = findNearestSketchEntity(e.point.x, e.point.y, obj.sketchMeta!, worldThresholdRef.current);
                  setHoveredEntity(entity);
                  // Surface detection — only when no entity is near
                  const surfIdx = !entity ? findHoveredSurface(e.point.x, e.point.y, obj.sketchMeta!) : null;
                  setHoveredSurfIdx(surfIdx);
                  setHoveredSurfaceIndex(surfIdx);
                }
              : undefined
          }
          onClick={
            isSketchMode && obj.sketchMeta
              ? (e) => {
                  const entity = findNearestSketchEntity(e.point.x, e.point.y, obj.sketchMeta!, worldThresholdRef.current);
                  if (entity) {
                    setSelectedSketchEntityId(entity.id);
                    onEntityClick?.(entity, e.clientX, e.clientY);
                  } else {
                    // Check for surface click
                    const surfIdx = findHoveredSurface(e.point.x, e.point.y, obj.sketchMeta!);
                    if (surfIdx !== null) {
                      setSelectedSurfaceIndex(surfIdx);
                      setSelectedSketchEntityId(null);
                    }
                  }
                }
              : undefined
          }
        >
          <meshBasicMaterial color={constraintStatusColor} transparent opacity={Math.min(0.6, settings.opacity)} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Surface region fills from arrangement detection */}
      {surfacesVisible &&
        surfaceFills.length > 0 &&
        surfaceFills.map((sf) => {
          const isHovered = hoveredSurfIdx === sf.index;
          const isSelected = selectedSurfaceIndex === sf.index;
          const opacity = isSelected ? 0.45 : isHovered ? 0.35 : 0.15;
          return (
            <mesh key={`sf-${sf.index}`} geometry={sf.geo} position={[0, 0, -0.01]} raycast={() => null}>
              <meshBasicMaterial color={sf.color} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          );
        })}
      {/* Transparent hit plane for detecting hovers near edges when no fill is present */}
      {isSketchMode && obj.sketchMeta && (
        <mesh
          position={[0, 0, -0.5]}
          onPointerMove={(e) => {
            const entity = findNearestSketchEntity(e.point.x, e.point.y, obj.sketchMeta!, worldThresholdRef.current);
            setHoveredEntity(entity);
            const surfIdx = !entity ? findHoveredSurface(e.point.x, e.point.y, obj.sketchMeta!) : null;
            setHoveredSurfIdx(surfIdx);
            setHoveredSurfaceIndex(surfIdx);
          }}
          onClick={(e) => {
            const entity = findNearestSketchEntity(e.point.x, e.point.y, obj.sketchMeta!, worldThresholdRef.current);
            if (entity) {
              setSelectedSketchEntityId(entity.id);
              onEntityClick?.(entity, e.clientX, e.clientY);
            } else {
              const surfIdx = findHoveredSurface(e.point.x, e.point.y, obj.sketchMeta!);
              if (surfIdx !== null) {
                setSelectedSurfaceIndex(surfIdx);
                setSelectedSketchEntityId(null);
              }
            }
          }}
        >
          <planeGeometry args={[2000, 2000]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {lineGeos.map((geo, i) => (
        <primitive
          key={i}
          object={
            new THREE.Line(
              geo,
              new THREE.LineBasicMaterial({ color: constraintStatusColor, linewidth: 1, transparent: true, opacity: settings.opacity }),
            )
          }
          raycast={() => null}
        />
      ))}
      {pointGeos.map((geo, i) => (
        <primitive
          key={`pt-${i}`}
          object={new THREE.Points(geo, new THREE.PointsMaterial({ color: constraintStatusColor, size: 5 }))}
          raycast={() => null}
        />
      ))}
      {edgeLines.lines.map((edge) => {
        const isEntitySelected = selectedSketchEntityId === edge.id;
        const isEntityHovered = hoveredEntity?.id === edge.id;
        const color = isEntitySelected ? '#4aa3ff' : isEntityHovered ? '#7ec8ff' : (entityColorMap.get(edge.id) ?? sketchTheme.sketchEdge);
        return (
          <primitive
            key={`el-${edge.id}`}
            object={
              new THREE.Line(edge.geo, new THREE.LineBasicMaterial({ color, linewidth: 2, transparent: true, opacity: settings.opacity }))
            }
            raycast={() => null}
          />
        );
      })}
      {edgeLines.circles.map((edge) => {
        const isEntitySelected = selectedSketchEntityId === edge.id;
        const isEntityHovered = hoveredEntity?.id === edge.id;
        const color = isEntitySelected ? '#4aa3ff' : isEntityHovered ? '#7ec8ff' : (entityColorMap.get(edge.id) ?? sketchTheme.sketchEdge);
        return (
          <primitive
            key={`ec-${edge.id}`}
            object={
              new THREE.Line(edge.geo, new THREE.LineBasicMaterial({ color, linewidth: 2, transparent: true, opacity: settings.opacity }))
            }
            raycast={() => null}
          />
        );
      })}
      {edgeLines.points.map((pt) => {
        const isEntitySelected = selectedSketchEntityId === pt.id;
        const isEntityHovered = hoveredEntity?.id === pt.id;
        const bg = isEntitySelected ? '#4aa3ff' : isEntityHovered ? '#7ec8ff' : (entityColorMap.get(pt.id) ?? sketchTheme.sketchPoint);
        const size = isEntitySelected || isEntityHovered ? 8 : 5;
        return (
          <Html key={`ep-${pt.id}`} position={[pt.pos[0], pt.pos[1], 0.05]} center zIndexRange={[0, 0]} style={{ pointerEvents: 'none' }}>
            <div
              style={{
                width: size,
                height: size,
                borderRadius: '50%',
                background: bg,
                boxShadow: isEntitySelected ? '0 0 6px #4aa3ff' : '0 0 2px #000',
                transition: 'all 0.1s',
              }}
            />
          </Html>
        );
      })}
      {/* Programmatic debug highlights — thicker overlay lines on highlighted edges */}
      {highlightMap.size > 0 &&
        edgeLines.lines.map((edge) => {
          const hl = highlightMap.get(edge.id);
          if (!hl) return null;
          const color = hl.color ?? '#ff00ff';
          return (
            <primitive
              key={`hl-${edge.id}`}
              object={
                new THREE.Line(
                  edge.geo,
                  new THREE.LineBasicMaterial({
                    color,
                    linewidth: 4,
                    transparent: true,
                    opacity: hl.pulse ? highlightPulseRef.current : 0.9,
                    depthWrite: false,
                  }),
                )
              }
              raycast={() => null}
            />
          );
        })}
      {highlightMap.size > 0 &&
        edgeLines.circles.map((edge) => {
          const hl = highlightMap.get(edge.id);
          if (!hl) return null;
          const color = hl.color ?? '#ff00ff';
          return (
            <primitive
              key={`hl-${edge.id}`}
              object={
                new THREE.Line(
                  edge.geo,
                  new THREE.LineBasicMaterial({
                    color,
                    linewidth: 4,
                    transparent: true,
                    opacity: hl.pulse ? highlightPulseRef.current : 0.9,
                    depthWrite: false,
                  }),
                )
              }
              raycast={() => null}
            />
          );
        })}
      {highlightMap.size > 0 &&
        edgeLines.points.map((pt) => {
          const hl = highlightMap.get(pt.id);
          if (!hl) return null;
          const color = hl.color ?? '#ff00ff';
          return (
            <Html key={`hl-${pt.id}`} position={[pt.pos[0], pt.pos[1], 0.06]} center zIndexRange={[0, 0]} style={{ pointerEvents: 'none' }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: color,
                  opacity: hl.pulse ? highlightPulseRef.current : 0.9,
                  boxShadow: `0 0 8px ${color}`,
                }}
              />
            </Html>
          );
        })}
      {/* Highlight labels rendered near highlighted entities */}
      {highlightMap.size > 0 &&
        edgeLines.points.map((pt) => {
          const hl = highlightMap.get(pt.id);
          if (!hl?.label) return null;
          return (
            <Html
              key={`hl-label-${pt.id}`}
              position={[pt.pos[0], pt.pos[1], 0.07]}
              center
              zIndexRange={[0, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 8,
                  top: -8,
                  background: 'rgba(0,0,0,0.75)',
                  color: hl.color ?? '#ff00ff',
                  fontSize: 11,
                  padding: '1px 5px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                  fontFamily: 'monospace',
                }}
              >
                {hl.label}
              </div>
            </Html>
          );
        })}
      {/* Highlight labels for lines — positioned at midpoint */}
      {highlightMap.size > 0 &&
        edgeLines.lines.map((edge) => {
          const hl = highlightMap.get(edge.id);
          if (!hl?.label) return null;
          const pos = edge.geo.attributes.position;
          if (!pos || pos.count < 2) return null;
          const mx = (pos.getX(0) + pos.getX(pos.count - 1)) / 2;
          const my = (pos.getY(0) + pos.getY(pos.count - 1)) / 2;
          return (
            <Html key={`hl-label-${edge.id}`} position={[mx, my, 0.07]} center zIndexRange={[0, 0]} style={{ pointerEvents: 'none' }}>
              <div
                style={{
                  background: 'rgba(0,0,0,0.75)',
                  color: hl.color ?? '#ff00ff',
                  fontSize: 11,
                  padding: '1px 5px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                  fontFamily: 'monospace',
                }}
              >
                {hl.label}
              </div>
            </Html>
          );
        })}
      {hitPlaneBounds && (
        <mesh position={[hitPlaneBounds.cx, hitPlaneBounds.cy, -0.02]}>
          <planeGeometry args={[hitPlaneBounds.w, hitPlaneBounds.h]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {constructionLines.map((line, i) => (
        <primitive key={`cl-${i}`} object={line} raycast={() => null} />
      ))}
      {constructionCircles.map((circle, i) => (
        <primitive key={`cc-${i}`} object={circle} raycast={() => null} />
      ))}
      {/* Annotation geometry: dimension lines, arrowheads, angle arcs */}
      {constraintAnnotations.lines.map((line) => {
        const geo = new THREE.BufferGeometry().setFromPoints(line.points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
        return (
          <primitive
            key={line.key}
            object={
              new THREE.Line(
                geo,
                new THREE.LineBasicMaterial({
                  color: line.color,
                  transparent: true,
                  opacity: line.opacity ?? 1,
                  depthWrite: false,
                  depthTest: false,
                }),
              )
            }
            renderOrder={5}
            raycast={() => null}
          />
        );
      })}
      {constraintAnnotations.arcs.map((arc) => {
        const geo = new THREE.BufferGeometry().setFromPoints(arc.points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
        return (
          <primitive
            key={arc.key}
            object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: arc.color, depthWrite: false, depthTest: false }))}
            renderOrder={5}
            raycast={() => null}
          />
        );
      })}
      {constraintAnnotations.triangles.map((tri) => {
        const shape = new THREE.Shape();
        shape.moveTo(tri.points[0][0], tri.points[0][1]);
        shape.lineTo(tri.points[1][0], tri.points[1][1]);
        shape.lineTo(tri.points[2][0], tri.points[2][1]);
        shape.closePath();
        const geo = new THREE.ShapeGeometry(shape);
        return (
          <mesh key={tri.key} position={[0, 0, 0.08]} renderOrder={5}>
            <primitive object={geo} attach="geometry" />
            <meshBasicMaterial color={tri.color} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
      {/* Surface centroid labels — only shown for hovered/selected to avoid clutter */}
      {isSketchMode &&
        obj.sketchMeta?.surfaces.map((s) => {
          const isHovered = hoveredSurfIdx === s.index;
          const isSelected = selectedSurfaceIndex === s.index;
          if (!isHovered && !isSelected) return null;
          const palette = ['#4488cc', '#44cc88', '#cc8844', '#cc44aa', '#88cc44', '#44aacc', '#aa44cc', '#cccc44'];
          const color = palette[s.index % palette.length];
          return (
            <Html
              key={`sl-${s.index}`}
              position={[s.centroid[0], s.centroid[1], 0.08]}
              center
              zIndexRange={[0, 0]}
              style={{ pointerEvents: 'auto' }}
            >
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedSurfaceIndex(s.index);
                }}
                style={{
                  fontSize: 10,
                  fontFamily: 'system-ui, sans-serif',
                  fontWeight: 600,
                  color: '#fff',
                  background: isSelected ? color : `${color}88`,
                  borderRadius: 3,
                  padding: '1px 4px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  textShadow: '0 0 2px #000',
                  border: isSelected ? `1px solid ${color}` : '1px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                S{s.index} {s.area.toFixed(0)}mm²
              </span>
            </Html>
          );
        })}
      {/* Entity hover tooltip */}
      {hoveredEntity &&
        isSketchMode &&
        (() => {
          let label = '';
          if (hoveredEntity.kind === 'line') {
            const len = Math.hypot(hoveredEntity.b[0] - hoveredEntity.a[0], hoveredEntity.b[1] - hoveredEntity.a[1]);
            label = `${hoveredEntity.id} — ${len.toFixed(1)}mm`;
          } else if (hoveredEntity.kind === 'circle') {
            label = `${hoveredEntity.id} — r=${hoveredEntity.radius.toFixed(1)}mm`;
          } else if (hoveredEntity.kind === 'arc') {
            label = `${hoveredEntity.id} — r=${hoveredEntity.radius.toFixed(1)}mm`;
          } else {
            label = hoveredEntity.id;
          }
          const pos: [number, number] =
            hoveredEntity.kind === 'point'
              ? hoveredEntity.position
              : hoveredEntity.kind === 'line'
                ? [(hoveredEntity.a[0] + hoveredEntity.b[0]) / 2, (hoveredEntity.a[1] + hoveredEntity.b[1]) / 2]
                : [hoveredEntity.center[0], hoveredEntity.center[1]];
          return (
            <Html position={[pos[0], pos[1], 0.12]} center zIndexRange={[0, 0]} style={{ pointerEvents: 'none' }}>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: 'system-ui, sans-serif',
                  fontWeight: 500,
                  color: '#fff',
                  background: 'rgba(30,30,30,0.9)',
                  borderRadius: 4,
                  padding: '2px 6px',
                  whiteSpace: 'nowrap',
                  border: '1px solid rgba(74,163,255,0.5)',
                  transform: 'translateY(-14px)',
                }}
              >
                {label}
              </div>
            </Html>
          );
        })()}
      {/* Annotation labels: symbols, dimension values, angle values, fallback text */}
      {constraintAnnotations.labels.map((lbl) => (
        <Html key={lbl.key} position={lbl.position} center zIndexRange={[0, 0]} style={{ pointerEvents: 'auto' }}>
          <span
            onClick={(e) => {
              e.stopPropagation();
              setSelectedConstraintId(lbl.constraintId);
            }}
            style={{
              fontSize: lbl.fontSize ?? 10,
              fontFamily: 'system-ui, sans-serif',
              fontWeight: 600,
              color:
                selectedConstraintId === lbl.constraintId
                  ? sketchTheme.sketchSelected
                  : lbl.isConflicting
                    ? sketchTheme.sketchConflicting
                    : lbl.isRedundant
                      ? sketchTheme.sketchRedundant
                      : 'var(--fc-text)',
              textShadow: `0 0 3px var(--fc-viewportBg), 0 0 3px var(--fc-viewportBg)`,
              whiteSpace: 'nowrap',
              userSelect: 'none',
              cursor: 'pointer',
              background: selectedConstraintId === lbl.constraintId ? `${sketchTheme.sketchSelected}33` : 'transparent',
              borderRadius: 3,
              padding: '1px 3px',
            }}
          >
            {lbl.text}
          </span>
        </Html>
      ))}
      {hoveredEntity &&
        isSketchMode &&
        (() => {
          const z = 0.05;
          if (hoveredEntity.kind === 'line') {
            const geo = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(hoveredEntity.a[0], hoveredEntity.a[1], z),
              new THREE.Vector3(hoveredEntity.b[0], hoveredEntity.b[1], z),
            ]);
            return (
              <primitive
                object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: sketchTheme.sketchSelected }))}
                raycast={() => null}
              />
            );
          }
          if (hoveredEntity.kind === 'circle') {
            const pts: THREE.Vector3[] = [];
            for (let i = 0; i <= 64; i++) {
              const a = (i / 64) * Math.PI * 2;
              pts.push(
                new THREE.Vector3(
                  hoveredEntity.center[0] + Math.cos(a) * hoveredEntity.radius,
                  hoveredEntity.center[1] + Math.sin(a) * hoveredEntity.radius,
                  z,
                ),
              );
            }
            return (
              <primitive
                object={
                  new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints(pts),
                    new THREE.LineBasicMaterial({ color: sketchTheme.sketchSelected }),
                  )
                }
                raycast={() => null}
              />
            );
          }
          if (hoveredEntity.kind === 'arc') {
            const sa = Math.atan2(hoveredEntity.start[1] - hoveredEntity.center[1], hoveredEntity.start[0] - hoveredEntity.center[0]);
            const ea = Math.atan2(hoveredEntity.end[1] - hoveredEntity.center[1], hoveredEntity.end[0] - hoveredEntity.center[0]);
            let span = ea - sa;
            if (hoveredEntity.clockwise && span > 0) span -= Math.PI * 2;
            if (!hoveredEntity.clockwise && span < 0) span += Math.PI * 2;
            const pts: THREE.Vector3[] = [];
            for (let i = 0; i <= 64; i++) {
              const a = sa + (span * i) / 64;
              pts.push(
                new THREE.Vector3(
                  hoveredEntity.center[0] + Math.cos(a) * hoveredEntity.radius,
                  hoveredEntity.center[1] + Math.sin(a) * hoveredEntity.radius,
                  z,
                ),
              );
            }
            return (
              <primitive
                object={
                  new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints(pts),
                    new THREE.LineBasicMaterial({ color: sketchTheme.sketchSelected }),
                  )
                }
                raycast={() => null}
              />
            );
          }
          if (hoveredEntity.kind === 'point') {
            const geo = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(hoveredEntity.position[0], hoveredEntity.position[1], z),
            ]);
            return (
              <primitive
                object={new THREE.Points(geo, new THREE.PointsMaterial({ color: sketchTheme.sketchSelected, size: 12 }))}
                raycast={() => null}
              />
            );
          }
          return null;
        })()}
      {highlightedEntityIds.size > 0 &&
        (() => {
          const z = 0.06;
          const highlightColor = sketchTheme.sketchSelected;
          const elements: React.ReactNode[] = [];
          const meta = obj.sketchMeta;
          if (!meta) return null;
          // Highlight matching edge lines
          for (const line of meta.edges.lines) {
            if (!highlightedEntityIds.has(line.id)) continue;
            const geo = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(line.a[0], line.a[1], z),
              new THREE.Vector3(line.b[0], line.b[1], z),
            ]);
            elements.push(
              <primitive
                key={`hl-ln-${line.id}`}
                object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: highlightColor, linewidth: 2 }))}
                raycast={() => null}
              />,
            );
          }
          // Highlight matching construction lines
          for (const line of meta.construction.lines) {
            if (!highlightedEntityIds.has(line.id)) continue;
            const geo = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(line.a[0], line.a[1], z),
              new THREE.Vector3(line.b[0], line.b[1], z),
            ]);
            elements.push(
              <primitive
                key={`hl-cl-${line.id}`}
                object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: highlightColor, linewidth: 2 }))}
                raycast={() => null}
              />,
            );
          }
          // Highlight matching edge circles
          for (const circle of meta.edges.circles) {
            if (!highlightedEntityIds.has(circle.id)) continue;
            const pts: THREE.Vector3[] = [];
            for (let i = 0; i <= 64; i++) {
              const a = (i / 64) * Math.PI * 2;
              pts.push(
                new THREE.Vector3(circle.center[0] + Math.cos(a) * circle.radius, circle.center[1] + Math.sin(a) * circle.radius, z),
              );
            }
            elements.push(
              <primitive
                key={`hl-ci-${circle.id}`}
                object={
                  new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: highlightColor }))
                }
                raycast={() => null}
              />,
            );
          }
          // Highlight matching edge points
          for (const pt of meta.edges.points) {
            if (!highlightedEntityIds.has(pt.id)) continue;
            const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(pt.pos[0], pt.pos[1], z)]);
            elements.push(
              <primitive
                key={`hl-pt-${pt.id}`}
                object={new THREE.Points(geo, new THREE.PointsMaterial({ color: highlightColor, size: 14 }))}
                raycast={() => null}
              />,
            );
          }
          return <>{elements}</>;
        })()}
    </group>
  );
}
