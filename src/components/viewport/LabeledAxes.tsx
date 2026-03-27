import { Html } from '@react-three/drei';
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

/** Labeled axes helper — draws X/Y/Z arrows with text labels */
export function LabeledAxes({ size = 50 }: { size?: number }) {
  const axesRef = useRef<THREE.AxesHelper>(null);

  useEffect(() => {
    if (!axesRef.current) return;
    // Render axes on top of everything so they're always visible at origin
    axesRef.current.renderOrder = 999;
    axesRef.current.material = (axesRef.current.material as THREE.Material[]).length
      ? (axesRef.current.material as THREE.Material[]).map((m) => {
          m.depthTest = false;
          return m;
        })
      : (() => {
          (axesRef.current!.material as THREE.Material).depthTest = false;
          return axesRef.current!.material;
        })();
  }, []);

  const labelStyle = (color: string): React.CSSProperties => ({
    color,
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'monospace',
    userSelect: 'none',
    pointerEvents: 'none',
    textShadow: '0 0 3px #000, 0 0 6px #000',
  });
  return (
    <group>
      <axesHelper ref={axesRef} args={[size]} />
      <Html position={[size + 3, 0, 0]} center style={labelStyle('#ff4444')}>
        X
      </Html>
      <Html position={[0, size + 3, 0]} center style={labelStyle('#44ff44')}>
        Y
      </Html>
      <Html position={[0, 0, size + 3]} center style={labelStyle('#4488ff')}>
        Z
      </Html>
    </group>
  );
}
