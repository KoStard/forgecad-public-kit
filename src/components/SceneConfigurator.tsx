/**
 * SceneConfigurator — Applies SceneConfig from .forge.js scripts to the Three.js scene.
 *
 * Renders inside a <Canvas> and reactively updates camera, lights, background,
 * fog, environment, and post-processing based on the script's scene() calls.
 */

import type { SceneConfig, SceneFogConfig, SceneLightConfig } from '@forge/scene';
import { Environment } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

function SceneBackground({ config }: { config: SceneConfig }) {
  const { scene, gl } = useThree();
  const gradientTextureRef = useRef<THREE.Texture | null>(null);

  useEffect(() => {
    if (config.background === null) return;

    if (typeof config.background === 'string') {
      scene.background = new THREE.Color(config.background);
      return;
    }

    // Gradient background
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, config.background.top);
    gradient.addColorStop(1, config.background.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.background = texture;
    gradientTextureRef.current = texture;

    return () => {
      texture.dispose();
      if (gradientTextureRef.current === texture) {
        gradientTextureRef.current = null;
      }
    };
  }, [config.background, scene, gl]);

  return null;
}

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------

function createLight(def: SceneLightConfig): THREE.Light {
  const color = def.color ? new THREE.Color(def.color) : new THREE.Color(0xffffff);
  const intensity = def.intensity ?? 1;

  switch (def.type) {
    case 'ambient':
      return new THREE.AmbientLight(color, intensity);

    case 'directional': {
      const light = new THREE.DirectionalLight(color, intensity);
      if (def.position) light.position.set(...def.position);
      if (def.target) light.target.position.set(...def.target);
      if (def.castShadow) {
        light.castShadow = true;
        light.shadow.mapSize.width = 2048;
        light.shadow.mapSize.height = 2048;
        light.shadow.camera.near = 0.5;
        light.shadow.camera.far = 5000;
        const extent = 500;
        light.shadow.camera.left = -extent;
        light.shadow.camera.right = extent;
        light.shadow.camera.top = extent;
        light.shadow.camera.bottom = -extent;
      }
      return light;
    }

    case 'point': {
      const light = new THREE.PointLight(color, intensity, def.distance ?? 0, def.decay ?? 2);
      if (def.position) light.position.set(...def.position);
      if (def.castShadow) light.castShadow = true;
      return light;
    }

    case 'spot': {
      const light = new THREE.SpotLight(color, intensity, def.distance ?? 0, def.angle ?? Math.PI / 6, def.penumbra ?? 0, def.decay ?? 2);
      if (def.position) light.position.set(...def.position);
      if (def.target) light.target.position.set(...def.target);
      if (def.castShadow) light.castShadow = true;
      return light;
    }

    case 'hemisphere': {
      const skyColor = def.skyColor ? new THREE.Color(def.skyColor) : color;
      const groundColor = def.groundColor ? new THREE.Color(def.groundColor) : new THREE.Color(0x444444);
      return new THREE.HemisphereLight(skyColor, groundColor, intensity);
    }

    default:
      return new THREE.AmbientLight(color, intensity);
  }
}

function SceneLights({ lights }: { lights: SceneLightConfig[] }) {
  const { scene } = useThree();
  const lightsRef = useRef<THREE.Light[]>([]);

  useEffect(() => {
    // Dispose old custom lights
    lightsRef.current.forEach((l) => {
      scene.remove(l);
      l.dispose();
    });

    const newLights = lights.map((def) => createLight(def));
    newLights.forEach((l) => {
      scene.add(l);
      // For directional and spot lights, add their target to the scene
      if ('target' in l && l.target instanceof THREE.Object3D) {
        scene.add(l.target);
      }
    });
    lightsRef.current = newLights;

    return () => {
      newLights.forEach((l) => {
        scene.remove(l);
        if ('target' in l && l.target instanceof THREE.Object3D) {
          scene.remove(l.target);
        }
        l.dispose();
      });
      lightsRef.current = [];
    };
  }, [lights, scene]);

  return null;
}

// ---------------------------------------------------------------------------
// Fog
// ---------------------------------------------------------------------------

function SceneFog({ fog }: { fog: SceneFogConfig }) {
  const { scene } = useThree();

  useEffect(() => {
    const color = fog.color ? new THREE.Color(fog.color) : new THREE.Color(0x000000);
    if (fog.density !== undefined) {
      scene.fog = new THREE.FogExp2(color, fog.density);
    } else {
      scene.fog = new THREE.Fog(color, fog.near ?? 100, fog.far ?? 1000);
    }
    return () => {
      scene.fog = null;
    };
  }, [fog, scene]);

  return null;
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

function SceneCamera({ config }: { config: SceneConfig }) {
  const { camera } = useThree();
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!config.camera || appliedRef.current) return;
    appliedRef.current = true;

    const cam = config.camera;
    if (cam.position) camera.position.set(...cam.position);
    if (cam.up) camera.up.set(...cam.up);
    if (cam.fov && 'fov' in camera) {
      (camera as THREE.PerspectiveCamera).fov = cam.fov;
    }
    if (cam.target) {
      camera.lookAt(new THREE.Vector3(...cam.target));
    }
    camera.updateProjectionMatrix();
  }, [config.camera, camera]);

  // Reset when scene config changes identity (new script run)
  useEffect(() => {
    appliedRef.current = false;
  }, [config]);

  return null;
}

// ---------------------------------------------------------------------------
// Tone Mapping Exposure
// ---------------------------------------------------------------------------

function SceneExposure({ exposure }: { exposure: number }) {
  const { gl } = useThree();

  useEffect(() => {
    gl.toneMappingExposure = exposure;
    return () => {
      gl.toneMappingExposure = 1.0;
    };
  }, [exposure, gl]);

  return null;
}

// ---------------------------------------------------------------------------
// Post-Processing
// ---------------------------------------------------------------------------

function SceneEffects({ config }: { config: SceneConfig }) {
  const pp = config.postProcessing;
  if (!pp) return null;

  const bloom = pp.bloom;
  const vignette = pp.vignette;
  const grain = pp.grain;

  if (!bloom && !vignette && !grain) return null;

  // Build effects array — EffectComposer requires non-null children
  const effects: React.ReactElement[] = [];
  if (bloom) {
    effects.push(
      <Bloom
        key="bloom"
        intensity={bloom.intensity ?? 1}
        luminanceThreshold={bloom.threshold ?? 0.9}
        luminanceSmoothing={0.025}
        radius={bloom.radius ?? 0.4}
      />,
    );
  }
  if (vignette) {
    effects.push(
      <Vignette key="vignette" darkness={vignette.darkness ?? 0.5} offset={vignette.offset ?? 0.5} blendFunction={BlendFunction.NORMAL} />,
    );
  }
  if (grain) {
    effects.push(<Noise key="grain" premultiply blendFunction={BlendFunction.ADD} opacity={grain.intensity ?? 0.15} />);
  }

  return <EffectComposer>{effects}</EffectComposer>;
}

function ScenePostProcessing({ config }: { config: SceneConfig }) {
  const pp = config.postProcessing;
  if (!pp) return null;

  return (
    <>
      {pp.toneMappingExposure !== undefined && <SceneExposure exposure={pp.toneMappingExposure} />}
      <SceneEffects config={config} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function SceneEnvironment({ config }: { config: SceneConfig }) {
  const env = config.environment;
  if (!env || env.preset === 'none') return null;

  return <Environment preset={env.preset ?? 'studio'} environmentIntensity={env.intensity ?? 1} background={env.background ?? false} />;
}

// ---------------------------------------------------------------------------
// Ground Plane
// ---------------------------------------------------------------------------

function SceneGround({ config }: { config: SceneConfig }) {
  const ground = config.ground;
  if (!ground || ground.visible === false) return null;

  return (
    <mesh position={[0, 0, ground.height ?? 0]} receiveShadow={ground.receiveShadow ?? false}>
      <planeGeometry args={[10000, 10000]} />
      <meshStandardMaterial color={ground.color ?? '#1a1a1a'} roughness={1} metalness={0} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Main Orchestrator
// ---------------------------------------------------------------------------

interface SceneConfiguratorProps {
  config: SceneConfig;
  /** When true, hide the default lights (because custom lights replace them) */
  onDefaultLightsOverridden: (overridden: boolean) => void;
  /** When true, hide the default environment */
  onDefaultEnvironmentOverridden: (overridden: boolean) => void;
}

export function SceneConfigurator({ config, onDefaultLightsOverridden, onDefaultEnvironmentOverridden }: SceneConfiguratorProps) {
  // Signal to parent whether defaults should be hidden
  useEffect(() => {
    onDefaultLightsOverridden(config.lights !== null);
  }, [config.lights, onDefaultLightsOverridden]);

  useEffect(() => {
    onDefaultEnvironmentOverridden(config.environment !== null);
  }, [config.environment, onDefaultEnvironmentOverridden]);

  return (
    <>
      <SceneBackground config={config} />
      <SceneCamera config={config} />
      {config.lights && <SceneLights lights={config.lights} />}
      {config.fog && <SceneFog fog={config.fog} />}
      {config.environment && <SceneEnvironment config={config} />}
      {config.ground && <SceneGround config={config} />}
      <ScenePostProcessing config={config} />
    </>
  );
}
