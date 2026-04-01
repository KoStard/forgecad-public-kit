import { Environment, Lightformer } from '@react-three/drei';

/** Local studio lights for PBR reflections without remote HDR fetches. */
export function LocalStudioEnvironment() {
  return (
    <Environment resolution={128}>
      <Lightformer form="rect" intensity={4} color="#ffffff" rotation-x={Math.PI / 2} position={[0, 40, 0]} scale={[120, 120, 1]} />
      <Lightformer form="rect" intensity={3} color="#f8fbff" rotation-y={Math.PI / 2} position={[40, 10, 20]} scale={[80, 80, 1]} />
      <Lightformer form="rect" intensity={2} color="#f4f6ff" rotation-y={-Math.PI / 2} position={[-35, -8, 16]} scale={[70, 60, 1]} />
      <Lightformer form="ring" intensity={1.25} color="#dbe8ff" rotation-x={Math.PI / 2} position={[0, -20, 0]} scale={[35, 35, 1]} />
    </Environment>
  );
}
