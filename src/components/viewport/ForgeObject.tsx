import type { CutPlaneDef } from '@forge/cutPlane';
import type { SceneObject } from '@forge/index';
import { intersectWithPlane } from '@forge/index';
import { shapeToGeometry } from '@forge/mesh/meshToGeometry';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ObjectSettings, RenderMode } from '../../store/forgeStore';
import { buildFilledGeometryFromPolygons, buildOutlineGeometryFromPolygons, hashString, resolvePlaneTransform } from './geometryUtils';
import { SectionCutSurface } from './SectionPlane';
import { resolveSectionHatchMetrics, resolveSectionSurfaceLift } from './sectionUtils';
import type { CutSurfaceDef } from './types';

/**
 * Renders a solid body with CAD-appropriate shading.
 *
 * Shading depends on the geometry backend:
 *
 * - **OCCT (B-rep)**: Smooth per-vertex normals extracted from the actual
 *   surface geometry. Curved faces (cylinders, fillets) shade smoothly;
 *   sharp edges between faces stay sharp because each face has its own
 *   vertices with independent normals. `flatShading` is OFF.
 *
 * - **Manifold (mesh-only)**: Flat face normals computed from triangle cross
 *   products. Every triangle is independently shaded. `flatShading` is ON.
 *   Without B-rep data, this is the only correct option — averaging normals
 *   at shared vertices would blur intentional sharp edges (box corners).
 *
 * The `hasSmoothNormals` flag on ForgeGeometry controls the switch.
 */
export function ForgeObject({
  obj,
  settings,
  renderMode,
  isInteracting,
  matrix,
  isHovered,
  cutPlanes,
  clippingPlanes,
  debugHighlightColor,
  debugHighlightPulse,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onClick,
  onDoubleClick,
  onContextMenu,
}: {
  obj: SceneObject;
  settings: ObjectSettings;
  renderMode: RenderMode;
  isInteracting?: boolean;
  matrix: THREE.Matrix4;
  isHovered?: boolean;
  cutPlanes?: CutPlaneDef[];
  clippingPlanes?: THREE.Plane[];
  debugHighlightColor?: string;
  debugHighlightPulse?: boolean;
  onPointerEnter?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerLeave?: (event: ThreeEvent<PointerEvent>) => void;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void;
  onContextMenu?: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const hasCutPlanes = (cutPlanes?.length ?? 0) > 0;
  const clippingTransformKey = hasCutPlanes ? matrix : null;
  const { solidGeo, edgesGeo, hasSmoothNormals, cutSurfaces, useFallbackClipping } = useMemo(() => {
    if (!obj.shape) {
      return {
        solidGeo: null,
        edgesGeo: null,
        hasSmoothNormals: false,
        cutSurfaces: [] as CutSurfaceDef[],
        useFallbackClipping: false,
      };
    }
    let shapeForRender = obj.shape;
    const nextCutSurfaces: CutSurfaceDef[] = [];
    let fallbackToGpuClip = false;

    if (hasCutPlanes) {
      try {
        // Cut planes are defined in world space, so convert each plane into this object's
        // local coordinates before sectioning to keep everything aligned with animated transforms.
        const inverseMatrix = matrix.clone().invert();
        const surfaceLift = resolveSectionSurfaceLift(obj.shape);
        cutPlanes?.forEach((cutPlaneDef, planeIndex) => {
          const worldNormal = new THREE.Vector3(cutPlaneDef.normal[0], cutPlaneDef.normal[1], cutPlaneDef.normal[2]);
          if (worldNormal.lengthSq() <= 1e-8) return;
          worldNormal.normalize();

          const worldPlane = new THREE.Plane(worldNormal, -cutPlaneDef.offset);
          const localPlane = worldPlane.clone().applyMatrix4(inverseMatrix);
          const normalLength = localPlane.normal.length();
          if (!Number.isFinite(normalLength) || normalLength <= 1e-8) return;

          const invNormalLength = 1 / normalLength;
          const localNormal: [number, number, number] = [
            localPlane.normal.x * invNormalLength,
            localPlane.normal.y * invNormalLength,
            localPlane.normal.z * invNormalLength,
          ];
          const localOffset = -localPlane.constant * invNormalLength;
          const [insideShape, outsideShape] = shapeForRender.splitByPlane(localNormal, localOffset);
          shapeForRender = insideShape;

          if (!outsideShape.isEmpty()) {
            try {
              const sectionSketch = intersectWithPlane(outsideShape, {
                origin: [localNormal[0] * localOffset, localNormal[1] * localOffset, localNormal[2] * localOffset],
                normal: localNormal,
              });
              const polygons = sectionSketch.toPolygons();
              const geometry = buildFilledGeometryFromPolygons(polygons);
              const transform = resolvePlaneTransform(localNormal, localOffset, surfaceLift);
              if (geometry && transform) {
                const outlineGeometry = buildOutlineGeometryFromPolygons(polygons);
                const hatch = resolveSectionHatchMetrics(geometry);
                const angleSeed = hashString(`${obj.name}:${cutPlaneDef.name}:${planeIndex}`);
                nextCutSurfaces.push({
                  id: `${cutPlaneDef.name}:${planeIndex}`,
                  geometry,
                  outlineGeometry,
                  sourcePlaneIndex: planeIndex,
                  position: transform.center,
                  quaternion: transform.quaternion,
                  hatchAngleRad: THREE.MathUtils.degToRad(35 + (angleSeed % 2) * 55),
                  hatchSpacing: hatch.spacing,
                  hatchLineWidth: hatch.lineWidth,
                });
              } else {
                geometry?.dispose();
              }
            } catch {
              // Ignore cap-only failures; keep the solid trim result if it succeeded.
            }
          }
        });
      } catch {
        // If boolean trimming fails on pathological geometry, fall back to GPU clipping.
        nextCutSurfaces.forEach((surface) => {
          surface.geometry.dispose();
          surface.outlineGeometry?.dispose();
        });
        shapeForRender = obj.shape;
        fallbackToGpuClip = true;
      }
    }

    try {
      const { solid, edges, hasSmoothNormals: smooth } = shapeToGeometry(shapeForRender);
      return {
        solidGeo: solid,
        edgesGeo: edges,
        hasSmoothNormals: smooth,
        cutSurfaces: fallbackToGpuClip ? [] : nextCutSurfaces,
        useFallbackClipping: fallbackToGpuClip,
      };
    } catch {
      if (!fallbackToGpuClip && hasCutPlanes) {
        try {
          const { solid, edges, hasSmoothNormals: smooth } = shapeToGeometry(obj.shape);
          nextCutSurfaces.forEach((surface) => {
            surface.geometry.dispose();
            surface.outlineGeometry?.dispose();
          });
          return {
            solidGeo: solid,
            edgesGeo: edges,
            hasSmoothNormals: smooth,
            cutSurfaces: [] as CutSurfaceDef[],
            useFallbackClipping: true,
          };
        } catch {
          nextCutSurfaces.forEach((surface) => {
            surface.geometry.dispose();
            surface.outlineGeometry?.dispose();
          });
          return {
            solidGeo: null,
            edgesGeo: null,
            hasSmoothNormals: false,
            cutSurfaces: [] as CutSurfaceDef[],
            useFallbackClipping: false,
          };
        }
      }
      nextCutSurfaces.forEach((surface) => {
        surface.geometry.dispose();
        surface.outlineGeometry?.dispose();
      });
      return {
        solidGeo: null,
        edgesGeo: null,
        hasSmoothNormals: false,
        cutSurfaces: [] as CutSurfaceDef[],
        useFallbackClipping: false,
      };
    }
  }, [clippingTransformKey, cutPlanes, hasCutPlanes, obj.name, obj.shape]);

  useEffect(() => {
    return () => {
      solidGeo?.dispose();
      edgesGeo?.dispose();
      cutSurfaces.forEach((surface) => {
        surface.geometry.dispose();
        surface.outlineGeometry?.dispose();
      });
    };
  }, [cutSurfaces, edgesGeo, solidGeo]);

  if (!solidGeo || !settings.visible) return null;

  const effectiveRenderMode = isInteracting && renderMode === 'overlay' ? 'solid' : renderMode;
  const meshOpacity = settings.opacity;
  const showSolid = effectiveRenderMode !== 'wireframe';
  const showEdges = effectiveRenderMode === 'overlay';
  const showWire = effectiveRenderMode === 'wireframe';
  const fallbackSolidClippingPlanes = useFallbackClipping ? (clippingPlanes ?? []) : [];

  return (
    <group
      matrixAutoUpdate={false}
      matrix={matrix}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {showSolid && (
        <mesh geometry={solidGeo}>
          <meshPhysicalMaterial
            color={settings.color}
            metalness={obj.materialProps?.metalness ?? 0.05}
            roughness={obj.materialProps?.roughness ?? 0.35}
            clearcoat={obj.materialProps?.clearcoat ?? 0.1}
            clearcoatRoughness={obj.materialProps?.clearcoatRoughness ?? 0.4}
            flatShading={!hasSmoothNormals}
            side={THREE.DoubleSide}
            transparent={meshOpacity < 1 || (obj.materialProps?.opacity !== undefined && obj.materialProps.opacity < 1)}
            opacity={obj.materialProps?.opacity !== undefined ? Math.min(meshOpacity, obj.materialProps.opacity) : meshOpacity}
            emissive={isHovered ? settings.color : (obj.materialProps?.emissive ?? '#000000')}
            emissiveIntensity={isHovered ? 0.3 : (obj.materialProps?.emissiveIntensity ?? 0)}
            wireframe={obj.materialProps?.wireframe ?? false}
            clippingPlanes={fallbackSolidClippingPlanes}
          />
        </mesh>
      )}
      {showSolid &&
        cutSurfaces.map((surface) => (
          <SectionCutSurface
            key={surface.id}
            surface={surface}
            color={settings.color}
            opacity={meshOpacity}
            clippingPlanes={clippingPlanes ?? []}
          />
        ))}
      {showWire && edgesGeo && (
        // raycast disabled: edge lines are visual only; line raycasting at oblique angles
        // can report a smaller t-value than the frontmost solid mesh, causing wrong hover picks.
        <lineSegments geometry={edgesGeo} raycast={() => null}>
          <lineBasicMaterial
            color={settings.color}
            transparent={meshOpacity < 1}
            opacity={meshOpacity}
            clippingPlanes={fallbackSolidClippingPlanes}
          />
        </lineSegments>
      )}
      {showEdges && edgesGeo && (
        <lineSegments geometry={edgesGeo} raycast={() => null}>
          <lineBasicMaterial
            color="#1a1a2e"
            linewidth={1}
            transparent
            opacity={Math.min(1, meshOpacity + 0.1)}
            clippingPlanes={fallbackSolidClippingPlanes}
          />
        </lineSegments>
      )}
      {/* Debug highlight: transparent colored overlay on the entire shape */}
      {debugHighlightColor && solidGeo && (
        <mesh geometry={solidGeo} raycast={() => null}>
          <meshBasicMaterial
            color={debugHighlightColor}
            transparent
            opacity={0.35}
            side={THREE.DoubleSide}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      )}
      {debugHighlightColor && edgesGeo && (
        <lineSegments geometry={edgesGeo} raycast={() => null}>
          <lineBasicMaterial color={debugHighlightColor} linewidth={2} depthTest={false} />
        </lineSegments>
      )}
    </group>
  );
}
