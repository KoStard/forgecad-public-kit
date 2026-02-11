export type ThemeName = 'dark' | 'light';

export interface Theme {
  // Surfaces
  bg: string;
  bgPanel: string;
  bgSurface: string;
  bgHover: string;
  bgActive: string;
  bgInput: string;
  bgOverlay: string;

  // Text
  text: string;
  textMuted: string;
  textDim: string;

  // Borders
  border: string;
  borderLight: string;

  // Accent
  accent: string;
  accentText: string;

  // Status
  error: string;
  errorBg: string;
  success: string;
  successBg: string;
  warning: string;

  // Viewport
  viewportBg: string;
  gridCell: string;
  gridSection: string;
}

const dark: Theme = {
  bg: '#1e1e1e',
  bgPanel: '#1f1f1f',
  bgSurface: '#252525',
  bgHover: '#2d2d2d',
  bgActive: '#37373d',
  bgInput: '#111',
  bgOverlay: '#202020',

  text: '#ccc',
  textMuted: '#aaa',
  textDim: '#888',

  border: '#333',
  borderLight: '#2b2b2b',

  accent: '#4a9eff',
  accentText: '#fff',

  error: '#f48771',
  errorBg: '#3a1d1d',
  success: '#6a9955',
  successBg: '#1a2a1a',
  warning: '#ffcc00',

  viewportBg: '#252526',
  gridCell: '#404040',
  gridSection: '#555',
};

const light: Theme = {
  bg: '#f5f5f5',
  bgPanel: '#ffffff',
  bgSurface: '#eaeaea',
  bgHover: '#e0e0e0',
  bgActive: '#d0d8e0',
  bgInput: '#fff',
  bgOverlay: '#f0f0f0',

  text: '#1e1e1e',
  textMuted: '#555',
  textDim: '#888',

  border: '#d0d0d0',
  borderLight: '#e0e0e0',

  accent: '#0070d6',
  accentText: '#fff',

  error: '#d32f2f',
  errorBg: '#fde8e8',
  success: '#2e7d32',
  successBg: '#e8f5e9',
  warning: '#e6a700',

  viewportBg: '#e8e8e8',
  gridCell: '#c0c0c0',
  gridSection: '#a0a0a0',
};

export const themes: Record<ThemeName, Theme> = { dark, light };

export function applyTheme(name: ThemeName) {
  const t = themes[name];
  const root = document.documentElement;
  for (const [key, value] of Object.entries(t)) {
    root.style.setProperty(`--fc-${key}`, value);
  }
  // Monaco needs a theme name
  root.dataset.fcTheme = name;
}
