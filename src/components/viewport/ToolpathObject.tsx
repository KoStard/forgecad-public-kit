import { type SceneObject } from '@forge/index';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { type ObjectSettings } from '../../store/forgeStore';

// ---- Toolpath (G-code) rendering ----

/** Speed -> color: green (slow) to red (fast). */
function toolpathSpeedColor(speed: number, maxSpeed: number): THREE.Color {
  const t = Math.min(1, speed / Math.max(1, maxSpeed));
  return new THREE.Color().setHSL(0.33 * (1 - t), 0.9, 0.5);
}

// Shared geometry for all extrusion bead instances — a cylinder along +Y,
// radius 0.5, height 1. Each instance is transformed to span a segment
// and squished to beadWidth x beadHeight cross-section.
const BEAD_RADIAL_SEGMENTS = 6;
const _beadGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, BEAD_RADIAL_SEGMENTS, 1, false);

// Temps reused per-segment to avoid allocation
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _color = new THREE.Color();

/** Renders extrusion segments as instanced 3D cylinders with proper lighting. */
function ExtrusionBeadMesh({
  toolpath,
  maxSegmentIndex,
  opacity,
}: {
  toolpath: NonNullable<SceneObject['toolpath']>;
  maxSegmentIndex: number;
  opacity: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const { extrudeCount, instanceData } = useMemo(() => {
    const segs = toolpath.segments;
    const limit = Math.min(maxSegmentIndex, segs.length);
    const maxSpeed = segs.reduce((mx, s) => (s.extrude && s.speed > mx ? s.speed : mx), 0);

    // First pass: count extrusion segments
    let count = 0;
    for (let i = 0; i < limit; i++) if (segs[i].extrude) count++;

    // Allocate arrays for matrices and colors
    const matrices = new Float32Array(count * 16);
    const colors = new Float32Array(count * 3);

    const beadW = toolpath.beadWidth ?? 0.4;
    const beadH = toolpath.beadHeight ?? 0.2;

    let idx = 0;
    for (let i = 0; i < limit; i++) {
      const seg = segs[i];
      if (!seg.extrude) continue;

      _dir.set(seg.to[0] - seg.from[0], seg.to[1] - seg.from[1], seg.to[2] - seg.from[2]);
      const len = _dir.length();
      if (len < 1e-6) {
        idx++;
        continue;
      }
      _dir.divideScalar(len);

      _mid.set((seg.from[0] + seg.to[0]) * 0.5, (seg.from[1] + seg.to[1]) * 0.5, (seg.from[2] + seg.to[2]) * 0.5);

      // Rotate unit +Y cylinder to align with segment direction
      _quat.setFromUnitVectors(_up, _dir);
      // Scale: X=beadWidth, Y=segment length, Z=beadHeight
      _scale.set(beadW, len, beadH);
      _mat4.compose(_mid, _quat, _scale);

      _mat4.toArray(matrices, idx * 16);

      const c = toolpathSpeedColor(seg.speed, maxSpeed);
      colors[idx * 3] = c.r;
      colors[idx * 3 + 1] = c.g;
      colors[idx * 3 + 2] = c.b;

      idx++;
    }

    return { extrudeCount: idx, instanceData: { matrices, colors } };
  }, [toolpath, maxSegmentIndex]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || extrudeCount === 0) return;

    const { matrices, colors } = instanceData;
    for (let i = 0; i < extrudeCount; i++) {
      _mat4.fromArray(matrices, i * 16);
      mesh.setMatrixAt(i, _mat4);
      _color.fromArray(colors, i * 3);
      mesh.setColorAt(i, _color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = extrudeCount;
  }, [extrudeCount, instanceData]);

  if (extrudeCount === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[_beadGeo, undefined, extrudeCount]} frustumCulled={false}>
      <meshStandardMaterial vertexColors roughness={0.65} metalness={0.0} transparent={opacity < 1} opacity={opacity} />
    </instancedMesh>
  );
}

/** Renders travel segments as dashed lines. */
function TravelLines({
  toolpath,
  maxSegmentIndex,
  opacity,
}: {
  toolpath: NonNullable<SceneObject['toolpath']>;
  maxSegmentIndex: number;
  opacity: number;
}) {
  const { size } = useThree();

  const lineObj = useMemo(() => {
    const segs = toolpath.segments;
    const limit = Math.min(maxSegmentIndex, segs.length);
    const posArr: number[] = [];
    for (let i = 0; i < limit; i++) {
      const seg = segs[i];
      if (seg.extrude) continue;
      posArr.push(seg.from[0], seg.from[1], seg.from[2]);
      posArr.push(seg.to[0], seg.to[1], seg.to[2]);
    }
    if (posArr.length === 0) return null;

    const g = new LineSegmentsGeometry();
    g.setPositions(new Float32Array(posArr));

    const m = new LineMaterial({
      linewidth: 1,
      worldUnits: false,
      color: 0x4466cc,
      transparent: true,
      opacity: opacity * 0.25,
      dashed: true,
      dashScale: 0.5,
      dashSize: 3,
      gapSize: 2,
      resolution: new THREE.Vector2(size.width, size.height),
    });
    const obj = new LineSegments2(g, m);
    obj.computeLineDistances();
    return obj;
  }, [toolpath, maxSegmentIndex, opacity, size.width, size.height]);

  useEffect(() => {
    if (!lineObj) return;
    (lineObj.material as LineMaterial).resolution.set(size.width, size.height);
  }, [lineObj, size.width, size.height]);

  useEffect(
    () => () => {
      if (!lineObj) return;
      lineObj.geometry.dispose();
      (lineObj.material as LineMaterial).dispose();
    },
    [lineObj],
  );

  if (!lineObj) return null;
  return <primitive object={lineObj} />;
}

export function ToolpathObject({
  obj,
  settings,
  matrix,
  maxSegmentIndex,
}: {
  obj: SceneObject;
  settings: ObjectSettings;
  matrix: THREE.Matrix4;
  maxSegmentIndex: number;
}) {
  const toolpath = obj.toolpath;
  if (!toolpath || toolpath.segments.length === 0) return null;

  return (
    <group matrix={matrix} matrixAutoUpdate={false}>
      <ExtrusionBeadMesh toolpath={toolpath} maxSegmentIndex={maxSegmentIndex} opacity={settings.opacity} />
      {settings.opacity > 0.5 && <TravelLines toolpath={toolpath} maxSegmentIndex={maxSegmentIndex} opacity={settings.opacity} />}
    </group>
  );
}
