# UI Polish Investigation — Make ForgeCAD Feel Premium

## Goal & Current State

**Goal:** Transform ForgeCAD's utilitarian UI into something users love — polished, responsive, delightful. Every interaction should feel crafted.

**Current state:** Functional but flat. Buttons have no hover/active transitions, scrollbars are browser-default, the loading screen is plain text, status feedback is inline text changes, panel headers lack hover affordance.

## Architecture Summary

- React 19 + inline styles + CSS custom properties (`--fc-*`) for theming
- 5 themes (dark, light, gruvbox, tokyo-night, kanagawa-lotus)
- No CSS framework — all inline `CSSProperties` objects
- Zustand for state management
- Key components: Toolbar, FileExplorer, CodeEditor, Viewport, ViewPanel, ConsolePanel, ParamPanel, ExportPanel

## Progress Tracker

| # | Change | Impact | Status |
|---|--------|--------|--------|
| — | Baseline | Functional but flat UI | ✅ |
| P1 | Global CSS polish layer | High — every interactive element gains transitions, hover/active/focus states, custom scrollbars, styled range inputs, selection colors | ✅ |
| P2 | Enhanced eval indicator | Medium — braille spinner, phase dots, elapsed timer, entrance animation | ✅ |
| P3 | Polished loading screen | Medium — pulsing anvil, shimmer progress bar, fade-in | ✅ |
| P4 | Toast notification system | Medium — slide-in/out toasts, auto-dismiss, success/error/info variants | ✅ |
| P5 | Status bar | Medium — file info, eval time, object count, backend, error status, theme switcher | ✅ |

## Files Modified

| File | Purpose |
|------|---------|
| `src/ui-polish.css` | Global CSS polish: scrollbars, transitions, button classes, animations, range/color inputs |
| `src/main.tsx` | Import ui-polish.css |
| `src/App.tsx` | Loading screen, toolbar (fc-btn/fc-toolbar/fc-separator), toast + status bar integration |
| `src/components/Viewport.tsx` | Enhanced EvaluationIndicator component |
| `src/components/Toast.tsx` | Toast notification system (standalone pub/sub store) |
| `src/components/StatusBar.tsx` | Bottom status bar |
| `src/components/ViewPanel.tsx` | Migrated buttons to fc-btn CSS class |
| `src/components/ParamPanel.tsx` | Migrated panel header to fc-panel-header |
| `src/components/ConsolePanel.tsx` | Migrated panel header to fc-panel-header |
| `src/components/VerificationsPanel.tsx` | Migrated panel header to fc-panel-header |
| `src/components/ResizablePanel.tsx` | Added fc-resize-handle class + transition |

## Key Design Decisions

1. **CSS-first approach** — `ui-polish.css` provides base polish (scrollbars, transitions, animations) while `fc-btn`/`fc-panel-header` CSS classes replace repeated inline style objects. This reduces bundle size and provides consistent hover/active/focus states.

2. **Theme compatibility** — Every CSS rule uses `var(--fc-*)` variables, so all 5 themes (dark, light, gruvbox, tokyo-night, kanagawa-lotus) work automatically.

3. **Lightweight toast system** — Used `useSyncExternalStore` with a module-level pub/sub instead of adding to the Zustand store, keeping it self-contained.

4. **No breaking changes** — All existing functionality preserved. The status bar adds info, doesn't remove any existing UI.
