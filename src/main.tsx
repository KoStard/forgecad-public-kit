import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme, type ThemeName } from './theme';

// Apply saved theme (or default dark) before first render
applyTheme((localStorage.getItem('fc-theme') as ThemeName) || 'dark');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
