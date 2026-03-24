import type { JointOverlayViewConfig, JointViewDef } from '@forge/index';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { resolveArcReferenceDirection, resolveSegmentMeshTransform, resolveVisualArcAngleDeg } from './jointUtils';

export interface HoveredJointOverlayState {
  joint: JointViewDef;
  value: number;
  pivotWorld: THREE.Vector3;
  axisWorld: THREE.Vector3;
  axisLength: number;
}

export function HoveredJointOverlay({ state, config }: { state: HoveredJointOverlayState; config: JointOverlayViewConfig }) {
  const axisStart = useMemo(
    () => state.pivotWorld.clone().addScaledVector(state.axisWorld, -state.axisLength * 0.5),
    [state.axisLength, state.axisWorld, state.pivotWorld],
  );
  const axisEnd = useMemo(
    () => state.pivotWorld.clone().addScaledVector(state.axisWorld, state.axisLength * 0.5),
    [state.axisLength, state.axisWorld, state.pivotWorld],
  );
  const axisSegment = useMemo(() => resolveSegmentMeshTransform(axisStart, axisEnd), [axisEnd, axisStart]);
  const isRevolute = state.joint.type === 'revolute';
  const visualArcAngleDeg = useMemo(
    () => resolveVisualArcAngleDeg(state.value, config.arcVisualLimitDeg),
    [config.arcVisualLimitDeg, state.value],
  );
  const arcAngleRad = useMemo(() => THREE.MathUtils.degToRad(visualArcAngleDeg), [visualArcAngleDeg]);

  const axisLineRadius = THREE.MathUtils.clamp(
    state.axisLength * config.axisLineRadiusScale,
    config.axisLineRadiusMin,
    config.axisLineRadiusMax,
  );
  const spokeLineRadius = THREE.MathUtils.clamp(
    state.axisLength * config.spokeLineRadiusScale,
    config.spokeLineRadiusMin,
    config.spokeLineRadiusMax,
  );
  const arcLineRadius = THREE.MathUtils.clamp(
    state.axisLength * config.arcLineRadiusScale,
    config.arcLineRadiusMin,
    config.arcLineRadiusMax,
  );
  const axisDotRadius = Math.max(config.axisDotRadiusMin, state.axisLength * config.axisDotRadiusScale);
  const axisArrowRadius = Math.max(config.axisArrowRadiusMin, state.axisLength * config.axisArrowRadiusScale);
  const axisArrowLength = Math.max(config.axisArrowLengthMin, state.axisLength * config.axisArrowLengthScale);
  const arrowPosition = useMemo(
    () => axisEnd.clone().addScaledVector(state.axisWorld, axisArrowLength * config.axisArrowOffsetFactor),
    [axisArrowLength, axisEnd, config.axisArrowOffsetFactor, state.axisWorld],
  );
  const arrowQuaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), state.axisWorld),
    [state.axisWorld],
  );

  const arcRadius = Math.max(config.arcRadiusMin, state.axisLength * config.arcRadiusScale);
  const arcDotRadius = Math.max(config.arcDotRadiusMin, state.axisLength * config.arcDotRadiusScale);
  const arcStartDirection = useMemo(() => resolveArcReferenceDirection(state.axisWorld), [state.axisWorld]);
  const arcStartPoint = useMemo(
    () => state.pivotWorld.clone().addScaledVector(arcStartDirection, arcRadius),
    [arcRadius, arcStartDirection, state.pivotWorld],
  );
  const arcEndDirection = useMemo(
    () => arcStartDirection.clone().applyAxisAngle(state.axisWorld, arcAngleRad),
    [arcAngleRad, arcStartDirection, state.axisWorld],
  );
  const arcEndPoint = useMemo(
    () => state.pivotWorld.clone().addScaledVector(arcEndDirection, arcRadius),
    [arcEndDirection, arcRadius, state.pivotWorld],
  );
  const arcStartArmSegment = useMemo(() => resolveSegmentMeshTransform(state.pivotWorld, arcStartPoint), [arcStartPoint, state.pivotWorld]);
  const arcCurrentArmSegment = useMemo(() => resolveSegmentMeshTransform(state.pivotWorld, arcEndPoint), [arcEndPoint, state.pivotWorld]);
  const arcCurvePoints = useMemo(() => {
    if (!isRevolute || Math.abs(arcAngleRad) <= 1e-4) return null;
    const steps = Math.max(config.arcMinSteps, Math.ceil(Math.abs(visualArcAngleDeg) / config.arcStepDeg));
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const theta = arcAngleRad * (i / steps);
      const direction = arcStartDirection.clone().applyAxisAngle(state.axisWorld, theta);
      points.push(state.pivotWorld.clone().addScaledVector(direction, arcRadius));
    }
    return points;
  }, [
    arcAngleRad,
    config.arcMinSteps,
    config.arcStepDeg,
    arcRadius,
    arcStartDirection,
    visualArcAngleDeg,
    isRevolute,
    state.axisWorld,
    state.pivotWorld,
  ]);
  const arcTubeGeometry = useMemo(() => {
    if (!arcCurvePoints || arcCurvePoints.length < 2) return null;
    const segments = Math.max(config.arcTubeSegmentsMin, Math.ceil(arcCurvePoints.length * config.arcTubeSegmentsFactor));
    const curve = new THREE.CatmullRomCurve3(arcCurvePoints, false, 'centripetal');
    return new THREE.TubeGeometry(curve, segments, arcLineRadius, config.arcTubeRadialSegments, false);
  }, [arcCurvePoints, arcLineRadius, config.arcTubeRadialSegments, config.arcTubeSegmentsFactor, config.arcTubeSegmentsMin]);
  const arcArrowLength = Math.max(config.arcArrowLengthMin, state.axisLength * config.arcArrowLengthScale);
  const arcArrowRadius = Math.max(config.arcArrowRadiusMin, state.axisLength * config.arcArrowRadiusScale);
  const arcTangent = useMemo(() => {
    if (!isRevolute || Math.abs(arcAngleRad) <= 1e-4) return null;
    const tangent = state.axisWorld.clone().cross(arcEndDirection);
    if (tangent.lengthSq() <= 1e-8) return null;
    tangent.normalize();
    if (arcAngleRad < 0) tangent.multiplyScalar(-1);
    return tangent;
  }, [arcAngleRad, arcEndDirection, isRevolute, state.axisWorld]);
  const arcArrowPosition = useMemo(() => {
    if (!arcTangent || !arcCurvePoints) return null;
    return arcEndPoint.clone().addScaledVector(arcTangent, arcArrowLength * config.arcArrowOffsetFactor);
  }, [arcArrowLength, arcCurvePoints, arcEndPoint, arcTangent, config.arcArrowOffsetFactor]);
  const arcArrowQuaternion = useMemo(() => {
    if (!arcTangent || !arcCurvePoints) return null;
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), arcTangent);
  }, [arcCurvePoints, arcTangent]);

  useEffect(
    () => () => {
      arcTubeGeometry?.dispose();
    },
    [arcTubeGeometry],
  );

  return (
    <group>
      {axisSegment && (
        <mesh
          position={[axisSegment.midpoint.x, axisSegment.midpoint.y, axisSegment.midpoint.z]}
          quaternion={axisSegment.quaternion}
          renderOrder={95}
          userData={{ measureHelper: true }}
        >
          <cylinderGeometry args={[axisLineRadius, axisLineRadius, axisSegment.length, 18]} />
          <meshBasicMaterial color={config.axisColor} depthTest={false} transparent opacity={0.98} toneMapped={false} />
        </mesh>
      )}
      <mesh position={[state.pivotWorld.x, state.pivotWorld.y, state.pivotWorld.z]} renderOrder={96} userData={{ measureHelper: true }}>
        <sphereGeometry args={[axisDotRadius, 18, 18]} />
        <meshBasicMaterial color={config.axisCoreColor} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh
        position={[arrowPosition.x, arrowPosition.y, arrowPosition.z]}
        quaternion={arrowQuaternion}
        renderOrder={96}
        userData={{ measureHelper: true }}
      >
        <coneGeometry args={[axisArrowRadius, axisArrowLength, 18]} />
        <meshBasicMaterial color={config.axisColor} depthTest={false} toneMapped={false} />
      </mesh>
      {isRevolute && (
        <>
          {arcStartArmSegment && (
            <mesh
              position={[arcStartArmSegment.midpoint.x, arcStartArmSegment.midpoint.y, arcStartArmSegment.midpoint.z]}
              quaternion={arcStartArmSegment.quaternion}
              renderOrder={97}
              userData={{ measureHelper: true }}
            >
              <cylinderGeometry args={[spokeLineRadius, spokeLineRadius, arcStartArmSegment.length, 14]} />
              <meshBasicMaterial color={config.zeroColor} depthTest={false} transparent opacity={0.95} toneMapped={false} />
            </mesh>
          )}
          {arcCurrentArmSegment && (
            <mesh
              position={[arcCurrentArmSegment.midpoint.x, arcCurrentArmSegment.midpoint.y, arcCurrentArmSegment.midpoint.z]}
              quaternion={arcCurrentArmSegment.quaternion}
              renderOrder={97}
              userData={{ measureHelper: true }}
            >
              <cylinderGeometry args={[spokeLineRadius, spokeLineRadius, arcCurrentArmSegment.length, 14]} />
              <meshBasicMaterial color={config.arcColor} depthTest={false} transparent opacity={0.98} toneMapped={false} />
            </mesh>
          )}
          {arcTubeGeometry && (
            <mesh geometry={arcTubeGeometry} renderOrder={98} userData={{ measureHelper: true }}>
              <meshBasicMaterial color={config.arcColor} depthTest={false} transparent opacity={0.98} toneMapped={false} />
            </mesh>
          )}
          <mesh position={[arcStartPoint.x, arcStartPoint.y, arcStartPoint.z]} renderOrder={98} userData={{ measureHelper: true }}>
            <sphereGeometry args={[arcDotRadius, 14, 14]} />
            <meshBasicMaterial color={config.zeroColor} depthTest={false} toneMapped={false} />
          </mesh>
          <mesh position={[arcEndPoint.x, arcEndPoint.y, arcEndPoint.z]} renderOrder={98} userData={{ measureHelper: true }}>
            <sphereGeometry args={[arcDotRadius, 14, 14]} />
            <meshBasicMaterial color={config.arcColor} depthTest={false} toneMapped={false} />
          </mesh>
          {arcArrowPosition && arcArrowQuaternion && (
            <mesh
              position={[arcArrowPosition.x, arcArrowPosition.y, arcArrowPosition.z]}
              quaternion={arcArrowQuaternion}
              renderOrder={99}
              userData={{ measureHelper: true }}
            >
              <coneGeometry args={[arcArrowRadius, arcArrowLength, 14]} />
              <meshBasicMaterial color={config.arcColor} depthTest={false} toneMapped={false} />
            </mesh>
          )}
        </>
      )}
    </group>
  );
}
