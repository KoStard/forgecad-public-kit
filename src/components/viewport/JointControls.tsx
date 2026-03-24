import type { CSSProperties } from 'react';
import { animationSpeedToSlider, formatAnimationSpeed, sliderToAnimationSpeed } from '../../animationSpeed';

const inputStyle: CSSProperties = {
  flex: 1,
  background: 'var(--fc-bgInput)',
  border: '1px solid var(--fc-border)',
  borderRadius: 4,
  padding: '4px 6px',
  color: 'var(--fc-text)',
  fontSize: 12,
};

const sectionStyle: CSSProperties = {
  borderTop: '1px solid var(--fc-borderLight)',
  padding: '10px 12px',
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--fc-textDim)',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
};

const resolveJointRange = (type: 'revolute' | 'prismatic', min?: number, max?: number): { min: number; max: number } => ({
  min: min ?? (type === 'prismatic' ? -100 : 0),
  max: max ?? (type === 'prismatic' ? 100 : 360),
});

interface JointControlsProps {
  joints: any[];
  animationClips: any[];
  jointAnimationClip: string | null;
  jointAnimationPlaying: boolean;
  jointAnimationSpeed: number;
  activeAnimationClip: any;
  displayedAnimationProgress: number;
  displayedJointValues: Record<string, number>;
  displayedRawJointValues: Record<string, number>;
  coupledJointNames: Set<string>;
  hoveredJointName: string | null;
  setJointAnimationClip: (clip: string | null) => void;
  setJointAnimationProgress: (v: number) => void;
  setJointAnimationSpeed: (v: number) => void;
  toggleJointAnimationPlayback: () => void;
  setJointValue: (name: string, value: number) => void;
  setHoveredJointName: (name: string | null) => void;
}

export function JointControls({
  joints,
  animationClips,
  jointAnimationClip,
  jointAnimationPlaying,
  jointAnimationSpeed,
  activeAnimationClip,
  displayedAnimationProgress,
  displayedJointValues,
  displayedRawJointValues,
  coupledJointNames,
  hoveredJointName,
  setJointAnimationClip,
  setJointAnimationProgress,
  setJointAnimationSpeed,
  toggleJointAnimationPlayback,
  setJointValue,
  setHoveredJointName,
}: JointControlsProps) {
  return (
    <>
      {animationClips.length > 0 && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Animation</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={jointAnimationClip ?? ''}
              onChange={(event) => setJointAnimationClip(event.target.value || null)}
              style={inputStyle}
            >
              <option value="">Manual</option>
              {animationClips.map((clip) => (
                <option key={clip.name} value={clip.name}>
                  {clip.name}
                </option>
              ))}
            </select>
            <button
              className={`fc-btn${jointAnimationPlaying ? ' active' : ''}`}
              onClick={toggleJointAnimationPlayback}
              disabled={!activeAnimationClip}
              title={activeAnimationClip ? 'Play or pause clip playback' : 'Select a clip first'}
            >
              {jointAnimationPlaying ? 'Pause' : 'Play'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={displayedAnimationProgress}
              disabled={!activeAnimationClip}
              onChange={(event) => setJointAnimationProgress(Number(event.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, color: 'var(--fc-textDim)', width: 36, textAlign: 'right' }}>
              {Math.round(displayedAnimationProgress * 100)}%
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={animationSpeedToSlider(jointAnimationSpeed)}
              onChange={(event) => setJointAnimationSpeed(sliderToAnimationSpeed(Number(event.target.value)))}
              style={{ flex: 1 }}
              title="Playback speed multiplier (log scale: 0.01x to 4x)"
            />
            <span style={{ fontSize: 11, color: 'var(--fc-textDim)', width: 42, textAlign: 'right' }}>
              {formatAnimationSpeed(jointAnimationSpeed)}x
            </span>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--fc-textDim)' }}>
            {activeAnimationClip
              ? `Duration ${activeAnimationClip.duration.toFixed(2)}s${activeAnimationClip.loop ? ' • Loop' : ''}${activeAnimationClip.continuous ? ' • Continuous' : ''}`
              : 'Select a clip for coordinated joint motion.'}
          </div>
        </div>
      )}

      {joints.length > 0 && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Joints</div>
          {joints.map((joint) => {
            const { min, max } = resolveJointRange(joint.type, joint.min, joint.max);
            const rawValue = displayedRawJointValues[joint.name] ?? joint.defaultValue;
            const clampedValue = displayedJointValues[joint.name] ?? joint.defaultValue;
            const value = Math.max(min, Math.min(max, clampedValue));
            const step = joint.type === 'prismatic' ? 0.1 : 1;
            const isCoupled = coupledJointNames.has(joint.name);

            return (
              <div
                key={joint.name}
                style={{ marginBottom: 8 }}
                onMouseEnter={() => setHoveredJointName(joint.name)}
                onMouseLeave={() => {
                  if (hoveredJointName === joint.name) setHoveredJointName(null);
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                  <span style={{ color: 'var(--fc-text)' }}>{joint.name}</span>
                  <span style={{ color: 'var(--fc-accent)', fontFamily: 'monospace' }}>
                    {Number(rawValue.toFixed(2))}
                    {joint.unit ? ` ${joint.unit}` : ''}
                    {isCoupled ? ' (linked)' : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={value}
                  disabled={!!activeAnimationClip || isCoupled}
                  onFocus={() => setHoveredJointName(joint.name)}
                  onBlur={() => {
                    if (hoveredJointName === joint.name) setHoveredJointName(null);
                  }}
                  onChange={(event) => setJointValue(joint.name, Number(event.target.value))}
                  title={isCoupled ? 'Linked joint (driven by other joints)' : undefined}
                  style={{ width: '100%' }}
                />
              </div>
            );
          })}
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--fc-textDim)' }}>
            {activeAnimationClip ? 'Animation clip currently drives joint values.' : 'Viewport-only motion. Geometry does not recompute.'}
          </div>
        </div>
      )}
    </>
  );
}
