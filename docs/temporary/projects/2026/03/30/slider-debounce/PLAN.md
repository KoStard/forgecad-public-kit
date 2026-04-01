# Slider Debounce — Smooth Parameter Transitions

## Goal & Current State

**Problem**: Dragging parameter sliders causes constant flashing between "working" and "done" in the status bar. The viewport rebuilds on every single `onChange` event (~60Hz), creating a visible build→show→rebuild→show loop.

**Root cause**: `setParam()` calls `execute()` immediately on every slider tick. Each `execute()` sets `isEvaluating: true`, dispatches to the worker, gets a result, sets `isEvaluating: false`. At 60Hz input, the status bar oscillates rapidly between evaluating and idle states.

**What already works well**:
- `paramOverrides` provides instant visual feedback on the slider value (no lag)
- Worker-side request coalescing drops stale requests (only latest queued payload runs)
- Client-side cancellation rejects pending promises for superseded runs

**What's missing**: No debounce between slider input and `execute()` dispatch. The worker coalescing helps but doesn't prevent the rapid `isEvaluating` state toggling.

## Architecture Summary

```
Slider onChange → setParam(name, value)
  ├─ set({ paramOverrides })     ← instant, visual only
  └─ execute()                   ← FIRES EVERY TICK (the problem)
       ├─ set({ isEvaluating: true })
       ├─ evalWorkerClient.run(...)
       └─ set({ isEvaluating: false })  ← on result/error/cache-hit
```

## Solution

**Trailing debounce on `execute()` within `setParam()`** (~80ms window):
- `paramOverrides` updates immediately → slider stays smooth
- `execute()` only fires after 80ms of no new slider input → worker gets the final value
- Status bar transitions: idle → evaluating → idle (once per drag, not 60×)

This is ~5 lines of code. No architectural changes needed.

## Progress Tracker

| # | Change | Flashing | Slider Feel | Status |
|---|--------|----------|-------------|--------|
| — | Baseline | Constant during drag | Responsive | ✅ Measured |
| P1 | Debounce execute in setParam | TBD | TBD | 🔄 |

## Experiment Log

#### Baseline
**What**: Current behavior — every onChange triggers execute().
**Result**: Status bar flashes rapidly. Worker gets flooded with requests (most cancelled/coalesced). Each request that completes causes a brief "done" state before the next "working" kicks in.

#### P1: Trailing Debounce (IN PROGRESS)
**What**: Add a module-level debounce timer. setParam() clears/resets it on each call. execute() only fires after the timer expires.
**Why this works**: The slider visual is already decoupled via paramOverrides. The 3D viewport just needs to catch up after the drag settles. 80ms is imperceptible but eliminates the flood.

## Files Modified

| File | Purpose |
|------|---------|
| `src/store/forgeStore.ts` | Add debounced execute in setParam |
