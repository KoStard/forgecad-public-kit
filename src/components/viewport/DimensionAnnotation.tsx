import type { DimensionDef } from '@forge/sketch/dimensions';
import { formatLength, type LengthUnit } from '@forge/units';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/** Renders a single dimension annotation — Fusion360-style with extension lines, arrows, and label */
export function DimensionAnnotation({ def, lengthUnit: dimUnit }: { def: DimensionDef; lengthUnit: LengthUnit }) {
  const from = useMemo(() => new THREE.Vector3(...def.from), [def.from]);
  const to = useMemo(() => new THREE.Vector3(...def.to), [def.to]);
  const color = def.color ?? '#e0e0e0';
  const labelSpriteRef = useRef<THREE.Sprite>(null);
  const arrowStartRef = useRef<THREE.Mesh>(null);
  const arrowEndRef = useRef<THREE.Mesh>(null);

  // Stable perpendicular offset (camera-independent).
  // Convention: positive offset pushes "outward" (−Y for X/Z lines, −X for Y lines).
  const { dimStart, dimEnd, mid, dist } = useMemo(() => {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 1e-6) return { dimStart: from, dimEnd: to, mid: from, dist: 0 };
    const dirN = dir.clone().normalize();
    const ax = Math.abs(dirN.x),
      ay = Math.abs(dirN.y),
      az = Math.abs(dirN.z);

    // Pick a perpendicular that pushes AWAY from the sketch origin (0,0).
    // Compute the two possible perpendiculars and choose the one whose dot product
    // with (midpoint - origin) is positive, so dims go outside the body.
    let perp: THREE.Vector3;
    if (az > ax && az > ay) {
      perp = new THREE.Vector3(0, -1, 0);
    } else if (ay > ax) {
      perp = new THREE.Vector3(-1, 0, 0);
    } else {
      perp = new THREE.Vector3(0, -1, 0);
    }
    // Flip perpendicular so it points away from origin relative to the segment midpoint
    const segMid = from.clone().add(to).multiplyScalar(0.5);
    if (segMid.lengthSq() > 1e-8) {
      // If perp points toward origin (dot < 0), flip it
      if (perp.dot(segMid) < 0) {
        perp.negate();
      }
    }
    perp.multiplyScalar(def.offset);

    const dS = from.clone().add(perp);
    const dE = to.clone().add(perp);
    return { dimStart: dS, dimEnd: dE, mid: dS.clone().add(dE).multiplyScalar(0.5), dist: len };
  }, [from, to, def.offset]);

  const label = def.label ? `${def.label}: ${formatLength(dist, dimUnit, 1)}` : formatLength(dist, dimUnit, 1);

  // Extension lines with gap near geometry and overshoot past dimension line
  const extDir = useMemo(() => dimStart.clone().sub(from).normalize(), [dimStart, from]);
  const extGap = Math.max(Math.abs(def.offset) * 0.15, 0.8);
  const extOver = Math.max(Math.abs(def.offset) * 0.15, 0.8);
  const extAGeo = useMemo(
    () =>
      new THREE.BufferGeometry().setFromPoints([
        from.clone().add(extDir.clone().multiplyScalar(extGap)),
        dimStart.clone().add(extDir.clone().multiplyScalar(extOver)),
      ]),
    [from, dimStart, extDir, extGap, extOver],
  );
  const extBGeo = useMemo(
    () =>
      new THREE.BufferGeometry().setFromPoints([
        to.clone().add(extDir.clone().multiplyScalar(extGap)),
        dimEnd.clone().add(extDir.clone().multiplyScalar(extOver)),
      ]),
    [to, dimEnd, extDir, extGap, extOver],
  );
  const dimLineGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints([dimStart, dimEnd]), [dimStart, dimEnd]);

  const dimDir = useMemo(() => dimEnd.clone().sub(dimStart).normalize(), [dimStart, dimEnd]);
  const labelTextureData = useMemo(() => {
    const fontPx = 36;
    const padX = 28;
    const logicalHeight = 80;
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 3);

    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d')!;
    measureCtx.font = `bold ${fontPx}px -apple-system, "Segoe UI", sans-serif`;
    const textWidth = measureCtx.measureText(label).width;
    const logicalWidth = THREE.MathUtils.clamp(Math.ceil(textWidth + padX * 2), 220, 720);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(logicalWidth * dpr));
    canvas.height = Math.max(1, Math.round(logicalHeight * dpr));
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    ctx.fillStyle = '#1a1a1acc';
    ctx.beginPath();
    ctx.roundRect(8, 8, logicalWidth - 16, logicalHeight - 16, 12);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = `bold ${fontPx}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, logicalWidth / 2, logicalHeight / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return {
      texture,
      aspect: logicalWidth / logicalHeight,
    };
  }, [label, color]);

  useEffect(() => {
    return () => {
      labelTextureData.texture.dispose();
    };
  }, [labelTextureData]);

  useFrame(({ camera, size }) => {
    if (dist < 1e-6 || size.height <= 0) return;

    const isOrtho = (camera as THREE.OrthographicCamera).isOrthographicCamera;
    const worldUnitsPerPixel = isOrtho
      ? ((camera as THREE.OrthographicCamera).top - (camera as THREE.OrthographicCamera).bottom) /
        Math.max(1e-6, (camera as THREE.OrthographicCamera).zoom) /
        size.height
      : (2 * Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov * 0.5)) * camera.position.distanceTo(mid)) /
        (size.height * Math.max(1e-6, (camera as THREE.PerspectiveCamera).zoom));

    // Camera-aware on-screen sizing: stable across tiny/huge models and zoom levels.
    const labelHeightPx = 28;
    const labelWidthPx = labelHeightPx * labelTextureData.aspect;
    labelSpriteRef.current?.scale.set(labelWidthPx * worldUnitsPerPixel, labelHeightPx * worldUnitsPerPixel, 1);

    const arrowHeightPx = 12;
    const desiredArrowHeight = arrowHeightPx * worldUnitsPerPixel;
    const maxArrowHeight = Math.max(dist * 0.3, worldUnitsPerPixel * 2);
    const arrowHeight = Math.min(desiredArrowHeight, maxArrowHeight);
    arrowStartRef.current?.scale.set(arrowHeight, arrowHeight, arrowHeight);
    arrowEndRef.current?.scale.set(arrowHeight, arrowHeight, arrowHeight);
  });

  if (dist < 1e-6) return null;

  return (
    <group renderOrder={10}>
      <lineSegments geometry={extAGeo}>
        <lineBasicMaterial color={color} transparent opacity={0.4} depthTest={false} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={extBGeo}>
        <lineBasicMaterial color={color} transparent opacity={0.4} depthTest={false} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={dimLineGeo}>
        <lineBasicMaterial color={color} transparent opacity={0.8} depthTest={false} depthWrite={false} />
      </lineSegments>
      <mesh
        ref={arrowStartRef}
        position={dimStart}
        quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dimDir)}
      >
        <coneGeometry args={[0.5, 1, 8]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh
        ref={arrowEndRef}
        position={dimEnd}
        quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dimDir.clone().negate())}
      >
        <coneGeometry args={[0.5, 1, 8]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
      </mesh>
      <sprite ref={labelSpriteRef} position={mid}>
        <spriteMaterial map={labelTextureData.texture} depthTest={false} transparent />
      </sprite>
    </group>
  );
}
