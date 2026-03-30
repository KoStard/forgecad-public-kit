# Mobile Animation Controls

## Goal & Current State

**Goal**: Make joint animations accessible on mobile — users should be able to select animation clips, play/pause, scrub progress, adjust speed, and manually control joints.

**Baseline**: Mobile viewport renders static objects only. No joint transforms applied, no animation UI controls, no RAF playback loop.

## Architecture Summary

Desktop splits animation into three layers:
1. **useViewportState.ts** — RAF loop, joint matrix computation, object matrix composition
2. **useViewPanelState.ts** — animation state derivation (displayed values, active clip)
3. **JointControls.tsx** — UI controls (clip selector, play/pause, sliders)

Mobile had none of these — `MobileViewport` only used sketch placement matrices, and `MobileParams` only showed parameter sliders.

## Progress Tracker

| # | Change | Animation plays | Joint transforms | Controls visible | Status |
|---|--------|----------------|-----------------|-----------------|--------|
| — | Baseline | No | No | No | — |
| 1 | Add useMobileJointAnimation hook + MobileJointControls + wire into MobileApp/MobileViewport | Yes | Yes | Yes | Done |

## Experiment Log

#### Add mobile animation system (SUCCESS)
**What**: Created three pieces:
1. `useMobileJointAnimation.ts` — hook mirroring desktop's joint animation logic (state from store, joint matrix computation via `computeJointNodeMatrices`, RAF playback loop, derived display values)
2. `MobileJointControls.tsx` — compact touch-friendly controls (clip selector, play/pause icon button, progress slider, speed slider, manual joint sliders)
3. Updated `MobileViewport.tsx` to accept `jointMatrices` prop and compose them with sketch placement matrices
4. Updated `MobileApp.tsx` to wire the hook into both viewport and controls
5. Added CSS in `mobile.css` for the controls (44px touch targets, accent-colored play button)

**Result**: TypeScript compiles cleanly, biome lint passes, all animation state flows through correctly.

**Why it worked**: The animation engine (`resolveJointAnimation`, `computeJointNodeMatrices`, `resolveJointViewValues`) was already fully functional and backend-agnostic. Only the UI and matrix wiring were missing on mobile.

## Files Modified

| File | Purpose |
|------|---------|
| `src/mobile/useMobileJointAnimation.ts` | New — animation state hook + RAF loop for mobile |
| `src/mobile/MobileJointControls.tsx` | New — compact animation + joint UI controls |
| `src/mobile/MobileViewport.tsx` | Modified — accepts jointMatrices, composes with sketch matrices |
| `src/mobile/MobileApp.tsx` | Modified — imports hook + wires into viewport and controls |
| `src/mobile/mobile.css` | Modified — styles for joint/animation control panel |
