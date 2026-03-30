/**
 * Compact joint animation controls for mobile — shown below the viewport in the Model tab.
 * Provides clip selection, play/pause, progress scrubbing, speed control, and manual joint sliders.
 */

import type { JointViewAnimationDef, JointViewDef } from '@forge/index';
import { animationSpeedToSlider, formatAnimationSpeed, sliderToAnimationSpeed } from '../animationSpeed';
import { resolveJointRange } from '../components/viewport/jointUtils';

interface MobileJointControlsProps {
  joints: JointViewDef[];
  animationClips: JointViewAnimationDef[];
  jointAnimationClip: string | null;
  jointAnimationPlaying: boolean;
  jointAnimationSpeed: number;
  activeAnimationClip: JointViewAnimationDef | null;
  displayedAnimationProgress: number;
  displayedJointValues: Record<string, number>;
  displayedRawJointValues: Record<string, number>;
  coupledJointNames: Set<string>;
  setJointAnimationClip: (clip: string | null) => void;
  setJointAnimationProgress: (v: number) => void;
  setJointAnimationSpeed: (v: number) => void;
  toggleJointAnimationPlayback: () => void;
  setJointValue: (name: string, value: number) => void;
}

export function MobileJointControls({
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
  setJointAnimationClip,
  setJointAnimationProgress,
  setJointAnimationSpeed,
  toggleJointAnimationPlayback,
  setJointValue,
}: MobileJointControlsProps) {
  const hasAnimation = animationClips.length > 0;
  const hasJoints = joints.some((j) => !j.hidden);

  if (!hasAnimation && !hasJoints) return null;

  return (
    <div className="fc-mobile-joints">
      {/* ── Animation clip controls ── */}
      {hasAnimation && (
        <div className="fc-mobile-joints-section">
          <div className="fc-mobile-joints-label">Animation</div>
          <div className="fc-mobile-joints-row">
            <select
              className="fc-mobile-joints-select"
              value={jointAnimationClip ?? ''}
              onChange={(e) => setJointAnimationClip(e.target.value || null)}
            >
              <option value="">Manual</option>
              {animationClips.map((clip) => (
                <option key={clip.name} value={clip.name}>
                  {clip.name}
                </option>
              ))}
            </select>
            <button
              className={`fc-mobile-joints-playbtn${jointAnimationPlaying ? ' active' : ''}`}
              onClick={toggleJointAnimationPlayback}
              disabled={!activeAnimationClip}
            >
              {jointAnimationPlaying ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              )}
            </button>
          </div>

          {/* Progress */}
          <div className="fc-mobile-joints-row">
            <input
              type="range"
              className="fc-mobile-joints-slider"
              min={0}
              max={1}
              step={0.001}
              value={displayedAnimationProgress}
              disabled={!activeAnimationClip}
              onChange={(e) => setJointAnimationProgress(Number(e.target.value))}
            />
            <span className="fc-mobile-joints-value" style={{ width: 36 }}>
              {Math.round(displayedAnimationProgress * 100)}%
            </span>
          </div>

          {/* Speed */}
          <div className="fc-mobile-joints-row">
            <input
              type="range"
              className="fc-mobile-joints-slider"
              min={0}
              max={1}
              step={0.001}
              value={animationSpeedToSlider(jointAnimationSpeed)}
              onChange={(e) => setJointAnimationSpeed(sliderToAnimationSpeed(Number(e.target.value)))}
            />
            <span className="fc-mobile-joints-value" style={{ width: 42 }}>
              {formatAnimationSpeed(jointAnimationSpeed)}x
            </span>
          </div>

          <div className="fc-mobile-joints-info">
            {activeAnimationClip
              ? `${activeAnimationClip.duration.toFixed(1)}s${activeAnimationClip.loop ? ' \u00B7 Loop' : ''}${activeAnimationClip.continuous ? ' \u00B7 Continuous' : ''}`
              : 'Select a clip to animate.'}
          </div>
        </div>
      )}

      {/* ── Manual joint sliders ── */}
      {hasJoints && (
        <div className="fc-mobile-joints-section">
          <div className="fc-mobile-joints-label">Joints</div>
          {joints
            .filter((j) => !j.hidden)
            .map((joint) => {
              const { min, max } = resolveJointRange(joint.type, joint.min, joint.max);
              const rawValue = displayedRawJointValues[joint.name] ?? joint.defaultValue;
              const clampedValue = displayedJointValues[joint.name] ?? joint.defaultValue;
              const value = Math.max(min, Math.min(max, clampedValue));
              const step = joint.type === 'prismatic' ? 0.1 : 1;
              const isCoupled = coupledJointNames.has(joint.name);

              return (
                <div key={joint.name} className="fc-mobile-joint-item">
                  <div className="fc-mobile-joint-header">
                    <span className="fc-mobile-joint-name">{joint.name}</span>
                    <span className="fc-mobile-joint-value">
                      {Number(rawValue.toFixed(2))}
                      {joint.unit ? ` ${joint.unit}` : ''}
                      {isCoupled ? ' (linked)' : ''}
                    </span>
                  </div>
                  <input
                    type="range"
                    className="fc-mobile-joints-slider"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    disabled={!!activeAnimationClip || isCoupled}
                    onChange={(e) => setJointValue(joint.name, Number(e.target.value))}
                  />
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
