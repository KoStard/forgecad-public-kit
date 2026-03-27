import type { CutPlaneDef } from '@forge/cutPlane';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { hashString, resolvePlaneTransform } from './geometryUtils';
import { parseExportColor } from './orbitGif';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CutSurfaceDef {
  id: string;
  geometry: THREE.BufferGeometry;
  outlineGeometry: THREE.BufferGeometry | null;
  sourcePlaneIndex: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  hatchAngleRad: number;
  hatchSpacing: number;
  hatchLineWidth: number;
}

export interface SectionPlaneGuideStyle {
  showFill: boolean;
  fillOpacity: number;
  showBorder: boolean;
  showAxis: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const colorFromName = (name: string | undefined | null): string => {
  const hue = hashString(name || 'default') % 360;
  return `hsl(${hue}, 72%, 58%)`;
};

// ---------------------------------------------------------------------------
// SectionCutSurface — renders a section cut surface with hatching
// ---------------------------------------------------------------------------

export function SectionCutSurface({
  surface,
  color,
  opacity,
  clippingPlanes,
}: {
  surface: CutSurfaceDef;
  color: string;
  opacity: number;
  clippingPlanes: THREE.Plane[];
}) {
  const sectionClippingPlanes = useMemo(
    () => clippingPlanes.filter((_, index) => index !== surface.sourcePlaneIndex),
    [clippingPlanes, surface.sourcePlaneIndex],
  );
  const material = useMemo(() => {
    const baseColor = parseExportColor(color, 0x5b9bd5).lerp(new THREE.Color('#ffffff'), 0.2);
    const lineColor = parseExportColor(color, 0x5b9bd5).lerp(new THREE.Color('#101010'), 0.55);
    const direction = new THREE.Vector2(Math.cos(surface.hatchAngleRad), Math.sin(surface.hatchAngleRad));
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      side: THREE.DoubleSide,
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      clippingPlanes: sectionClippingPlanes,
      toneMapped: false,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.hatchBaseColor = { value: baseColor };
      shader.uniforms.hatchLineColor = { value: lineColor };
      shader.uniforms.hatchDirection = { value: direction };
      shader.uniforms.hatchSpacing = { value: surface.hatchSpacing };
      shader.uniforms.hatchLineWidth = { value: surface.hatchLineWidth };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vSectionPlanePosition;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSectionPlanePosition = position.xy;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec2 vSectionPlanePosition;
uniform vec3 hatchBaseColor;
uniform vec3 hatchLineColor;
uniform vec2 hatchDirection;
uniform float hatchSpacing;
uniform float hatchLineWidth;`,
        )
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `float planeCoord = dot(vSectionPlanePosition, hatchDirection);
float stripeDistance = abs(fract(planeCoord / hatchSpacing + 0.5) - 0.5) * hatchSpacing;
float aa = max(fwidth(planeCoord), 1e-4);
float lineMask = 1.0 - smoothstep(hatchLineWidth - aa, hatchLineWidth + aa, stripeDistance);
vec3 sectionColor = mix(hatchBaseColor, hatchLineColor, lineMask);
vec4 diffuseColor = vec4(sectionColor, opacity);`,
        );
    };
    mat.customProgramCacheKey = () =>
      `section-hatch:${baseColor.getHexString()}:${lineColor.getHexString()}:` +
      `${surface.hatchSpacing.toFixed(3)}:${surface.hatchLineWidth.toFixed(3)}:${surface.hatchAngleRad.toFixed(3)}`;
    return mat;
  }, [color, opacity, sectionClippingPlanes, surface.hatchAngleRad, surface.hatchLineWidth, surface.hatchSpacing]);
  const outlineColor = useMemo(() => parseExportColor(color, 0x5b9bd5).lerp(new THREE.Color('#050505'), 0.68), [color]);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <group position={[surface.position.x, surface.position.y, surface.position.z]} quaternion={surface.quaternion}>
      <mesh geometry={surface.geometry} renderOrder={24}>
        <primitive object={material} attach="material" />
      </mesh>
      {surface.outlineGeometry && (
        <lineSegments geometry={surface.outlineGeometry} renderOrder={25}>
          <lineBasicMaterial
            color={outlineColor}
            transparent={opacity < 1}
            opacity={Math.min(1, opacity + 0.18)}
            depthWrite={false}
            clippingPlanes={sectionClippingPlanes}
            toneMapped={false}
          />
        </lineSegments>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// SectionPlaneGuide — renders a single section plane guide
// ---------------------------------------------------------------------------

export function SectionPlaneGuide({ def, sectionSize, style }: { def: CutPlaneDef; sectionSize: number; style: SectionPlaneGuideStyle }) {
  const transform = useMemo(() => resolvePlaneTransform(def.normal, def.offset), [def.normal, def.offset]);

  const borderGeometry = useMemo(() => {
    const half = sectionSize / 2;
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half, -half, 0),
      new THREE.Vector3(half, -half, 0),
      new THREE.Vector3(half, half, 0),
      new THREE.Vector3(-half, half, 0),
    ]);
  }, [sectionSize]);

  const guideColor = useMemo(() => colorFromName(def.name), [def.name]);
  const axisLength = Math.max(8, sectionSize * 0.2);
  const axisRadius = Math.max(0.2, sectionSize * 0.0045);
  const coneRadius = Math.max(0.45, sectionSize * 0.008);
  const coneHeight = Math.max(1.8, sectionSize * 0.03);

  if (!transform) return null;

  return (
    <group position={[transform.center.x, transform.center.y, transform.center.z]} quaternion={transform.quaternion}>
      {style.showFill && (
        <mesh userData={{ measureHelper: true }} renderOrder={20}>
          <planeGeometry args={[sectionSize, sectionSize]} />
          <meshBasicMaterial color={guideColor} transparent opacity={style.fillOpacity} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
      {style.showBorder && (
        <lineLoop geometry={borderGeometry} renderOrder={21}>
          <lineBasicMaterial color={guideColor} transparent opacity={0.9} depthTest={false} />
        </lineLoop>
      )}
      {style.showAxis && (
        <group renderOrder={22}>
          <mesh userData={{ measureHelper: true }} position={[0, 0, axisLength * 0.5]}>
            <cylinderGeometry args={[axisRadius, axisRadius, axisLength, 12]} />
            <meshBasicMaterial color={guideColor} depthTest={false} />
          </mesh>
          <mesh userData={{ measureHelper: true }} position={[0, 0, axisLength + coneHeight * 0.5]}>
            <coneGeometry args={[coneRadius, coneHeight, 14]} />
            <meshBasicMaterial color={guideColor} depthTest={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// SectionPlaneGuides — renders all section plane guides
// ---------------------------------------------------------------------------

export function SectionPlaneGuides({
  cutPlanes,
  sectionSize,
  style,
}: {
  cutPlanes: CutPlaneDef[];
  sectionSize: number;
  style: SectionPlaneGuideStyle;
}) {
  if (cutPlanes.length === 0 || sectionSize <= 0) return null;

  return (
    <group>
      {cutPlanes.map((def) => (
        <SectionPlaneGuide key={def.name} def={def} sectionSize={sectionSize} style={style} />
      ))}
    </group>
  );
}
