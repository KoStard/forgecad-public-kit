/// <reference types="vite/client" />

declare module 'virtual:forge-project' {
  const project: Record<string, string> | null;
  export default project;
}

declare const __FORGE_MODE__: 'studio' | 'web';
