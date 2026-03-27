/**
 * Feature Flags — central registry for gating experimental features.
 *
 * Flags default to disabled. Enable via:
 *   - Command palette: Commands > Advanced > toggle flags
 *   - URL param:       ?ff=drawMode,otherFlag
 *   - Console:         window.__FF.enable('drawMode')
 *
 * Flags persist in localStorage and survive refresh.
 * Toggling from the command palette updates the UI instantly (Zustand-backed).
 */
import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Flag definitions — add new flags here
// ---------------------------------------------------------------------------

export interface FeatureFlagDef {
  /** Human-readable label shown in the command palette. */
  label: string;
  /** Default state when not explicitly set. */
  defaultEnabled: boolean;
}

/**
 * All known feature flags. Keys are camelCase identifiers.
 * Add new flags here — the command palette picks them up automatically.
 */
export const FLAG_DEFINITIONS: Record<string, FeatureFlagDef> = {
  drawMode: {
    label: 'Draw Mode (interactive sketch editor)',
    defaultEnabled: false,
  },
};

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const LS_PREFIX = 'ff-';

function readStoredFlag(name: string): boolean | null {
  try {
    const v = localStorage.getItem(`${LS_PREFIX}${name}`);
    if (v === '1' || v === 'true') return true;
    if (v === '0' || v === 'false') return false;
  } catch {
    /* */
  }
  return null;
}

function writeStoredFlag(name: string, enabled: boolean): void {
  try {
    localStorage.setItem(`${LS_PREFIX}${name}`, enabled ? '1' : '0');
  } catch {
    /* */
  }
}

// ---------------------------------------------------------------------------
// URL param overrides (?ff=drawMode,other)
// ---------------------------------------------------------------------------

function parseUrlFlags(): Map<string, boolean> {
  const result = new Map<string, boolean>();
  try {
    const ffParam = new URLSearchParams(window.location.search).get('ff');
    if (ffParam) {
      for (const tok of ffParam.split(',')) {
        const name = tok.trim();
        if (name) result.set(name, true);
      }
    }
  } catch {
    /* */
  }
  return result;
}

const urlOverrides = parseUrlFlags();

// ---------------------------------------------------------------------------
// Resolve initial state for all flags
// ---------------------------------------------------------------------------

function resolveInitialFlags(): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const [name, def] of Object.entries(FLAG_DEFINITIONS)) {
    // Priority: URL > localStorage > default
    if (urlOverrides.has(name)) {
      flags[name] = urlOverrides.get(name)!;
    } else {
      const stored = readStoredFlag(name);
      flags[name] = stored ?? def.defaultEnabled;
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Zustand store — reactive flag state
// ---------------------------------------------------------------------------

interface FeatureFlagStore {
  flags: Record<string, boolean>;
  toggle: (name: string) => void;
  enable: (name: string) => void;
  disable: (name: string) => void;
}

export const useFeatureFlagStore = create<FeatureFlagStore>((set, get) => ({
  flags: resolveInitialFlags(),

  toggle: (name) => {
    const current = get().flags[name] ?? FLAG_DEFINITIONS[name]?.defaultEnabled ?? false;
    const next = !current;
    writeStoredFlag(name, next);
    set({ flags: { ...get().flags, [name]: next } });
  },

  enable: (name) => {
    writeStoredFlag(name, true);
    set({ flags: { ...get().flags, [name]: true } });
  },

  disable: (name) => {
    writeStoredFlag(name, false);
    set({ flags: { ...get().flags, [name]: false } });
  },
}));

// ---------------------------------------------------------------------------
// React hook — reactive
// ---------------------------------------------------------------------------

/**
 * React hook to check a feature flag. Re-renders when the flag changes.
 */
export function useFeatureFlag(name: string): boolean {
  return useFeatureFlagStore((s) => s.flags[name] ?? FLAG_DEFINITIONS[name]?.defaultEnabled ?? false);
}

// ---------------------------------------------------------------------------
// Plain function (for non-React code)
// ---------------------------------------------------------------------------

export function isFeatureEnabled(name: string): boolean {
  return useFeatureFlagStore.getState().flags[name] ?? FLAG_DEFINITIONS[name]?.defaultEnabled ?? false;
}

// ---------------------------------------------------------------------------
// Console helper — window.__FF
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  const store = useFeatureFlagStore;
  (window as any).__FF = {
    enable: (name: string) => store.getState().enable(name),
    disable: (name: string) => store.getState().disable(name),
    toggle: (name: string) => store.getState().toggle(name),
    list: () => {
      const { flags } = store.getState();
      const table: Record<string, { enabled: boolean; label: string }> = {};
      for (const [name, def] of Object.entries(FLAG_DEFINITIONS)) {
        table[name] = { enabled: flags[name] ?? def.defaultEnabled, label: def.label };
      }
      console.table(table);
      return table;
    },
  };
}
