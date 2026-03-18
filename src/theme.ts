export type ThemeName = 'dark' | 'light' | 'gruvbox' | 'tokyo-night' | 'kanagawa-lotus';

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

  // Sketch
  sketchEdge: string;
  sketchPoint: string;
  sketchConstruction: string;
  sketchSurface: string;
  sketchConstraint: string;
  sketchConstraintDim: string;
  sketchConflicting: string;
  sketchRedundant: string;
  sketchSelected: string;
  sketchFullyConstrained: string;
  sketchUnderConstrained: string;
  sketchOverConstrained: string;
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

  sketchEdge: '#e8e8e8',
  sketchPoint: '#ffffff',
  sketchConstruction: '#6b7280',
  sketchSurface: '#4488cc',
  sketchConstraint: '#4ade80',
  sketchConstraintDim: '#4ade80',
  sketchConflicting: '#ff6b6b',
  sketchRedundant: '#faad14',
  sketchSelected: '#ffcc00',
  sketchFullyConstrained: '#35c759',
  sketchUnderConstrained: '#4aa3ff',
  sketchOverConstrained: '#ff4d4f',
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

  sketchEdge: '#2d2d2d',
  sketchPoint: '#1a1a1a',
  sketchConstruction: '#9ca3af',
  sketchSurface: '#3370aa',
  sketchConstraint: '#16a34a',
  sketchConstraintDim: '#16a34a',
  sketchConflicting: '#dc2626',
  sketchRedundant: '#d97706',
  sketchSelected: '#ca8a04',
  sketchFullyConstrained: '#16a34a',
  sketchUnderConstrained: '#2563eb',
  sketchOverConstrained: '#dc2626',
};

const gruvbox: Theme = {
  bg: '#282828',
  bgPanel: '#1d2021',
  bgSurface: '#3c3836',
  bgHover: '#504945',
  bgActive: '#665c54',
  bgInput: '#1d2021',
  bgOverlay: '#282828',
  text: '#ebdbb2',
  textMuted: '#a89984',
  textDim: '#928374',
  border: '#504945',
  borderLight: '#3c3836',
  accent: '#fe8019',
  accentText: '#282828',
  error: '#fb4934',
  errorBg: '#3c1f1e',
  success: '#b8bb26',
  successBg: '#1d2a1d',
  warning: '#fabd2f',
  viewportBg: '#1d2021',
  gridCell: '#504945',
  gridSection: '#7c6f64',

  sketchEdge: '#ebdbb2',
  sketchPoint: '#fbf1c7',
  sketchConstruction: '#7c6f64',
  sketchSurface: '#458588',
  sketchConstraint: '#b8bb26',
  sketchConstraintDim: '#b8bb26',
  sketchConflicting: '#fb4934',
  sketchRedundant: '#fabd2f',
  sketchSelected: '#fe8019',
  sketchFullyConstrained: '#b8bb26',
  sketchUnderConstrained: '#83a598',
  sketchOverConstrained: '#fb4934',
};

const tokyoNight: Theme = {
  bg: '#1a1b26',
  bgPanel: '#16161e',
  bgSurface: '#24283b',
  bgHover: '#292e42',
  bgActive: '#33467c',
  bgInput: '#16161e',
  bgOverlay: '#1a1b26',
  text: '#c0caf5',
  textMuted: '#9aa5ce',
  textDim: '#565f89',
  border: '#292e42',
  borderLight: '#24283b',
  accent: '#7aa2f7',
  accentText: '#1a1b26',
  error: '#f7768e',
  errorBg: '#2d1520',
  success: '#9ece6a',
  successBg: '#1a2a1a',
  warning: '#e0af68',
  viewportBg: '#16161e',
  gridCell: '#292e42',
  gridSection: '#3b4261',

  sketchEdge: '#c0caf5',
  sketchPoint: '#dfe5fa',
  sketchConstruction: '#565f89',
  sketchSurface: '#7aa2f7',
  sketchConstraint: '#9ece6a',
  sketchConstraintDim: '#9ece6a',
  sketchConflicting: '#f7768e',
  sketchRedundant: '#e0af68',
  sketchSelected: '#ff9e64',
  sketchFullyConstrained: '#9ece6a',
  sketchUnderConstrained: '#7aa2f7',
  sketchOverConstrained: '#f7768e',
};

const kanagawaLotus: Theme = {
  bg: '#f2ecbc',
  bgPanel: '#f7f3d7',
  bgSurface: '#e7dba0',
  bgHover: '#d9d08e',
  bgActive: '#c9b97a',
  bgInput: '#f7f3d7',
  bgOverlay: '#f2ecbc',
  text: '#545464',
  textMuted: '#766b6b',
  textDim: '#8a8980',
  border: '#d7d194',
  borderLight: '#e0daa0',
  accent: '#c84053',
  accentText: '#f7f3d7',
  error: '#c84053',
  errorBg: '#f5d5d5',
  success: '#6f894e',
  successBg: '#e0ecd0',
  warning: '#cc6d00',
  viewportBg: '#e7dba0',
  gridCell: '#c9c08a',
  gridSection: '#a8a070',

  sketchEdge: '#545464',
  sketchPoint: '#3a3a4a',
  sketchConstruction: '#8a8980',
  sketchSurface: '#597b8c',
  sketchConstraint: '#6f894e',
  sketchConstraintDim: '#6f894e',
  sketchConflicting: '#c84053',
  sketchRedundant: '#cc6d00',
  sketchSelected: '#d27e19',
  sketchFullyConstrained: '#6f894e',
  sketchUnderConstrained: '#4d699b',
  sketchOverConstrained: '#c84053',
};

export const themes: Record<ThemeName, Theme> = { dark, light, gruvbox, 'tokyo-night': tokyoNight, 'kanagawa-lotus': kanagawaLotus };

export function applyTheme(name: ThemeName) {
  const t = themes[name];
  const root = document.documentElement;
  for (const [key, value] of Object.entries(t)) {
    root.style.setProperty(`--fc-${key}`, value);
  }
  // Monaco needs a theme name
  root.dataset.fcTheme = name;
}
