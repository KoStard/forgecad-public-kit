import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

/** Enable local clipping on the WebGL renderer when any cut planes are active */
export function ClippingManager({ active }: { active: boolean }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.localClippingEnabled = active;
  }, [gl, active]);
  return null;
}
