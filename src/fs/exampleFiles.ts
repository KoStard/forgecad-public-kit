/**
 * Default starter files shown in web/playground mode when there are no
 * persisted files in localStorage.
 */
export const EXAMPLE_FILES: Record<string, string> = {
  'welcome.forge.js': `\
// Welcome to ForgeCAD — parametric CAD that runs in your browser.
// Edit any parameter or modify the code. The model updates live!

const width  = param("Width",   80, { min: 20, max: 200, unit: "mm" });
const depth  = param("Depth",   50, { min: 20, max: 120, unit: "mm" });
const height = param("Height",  30, { min:  8, max:  80, unit: "mm" });
const wall   = param("Wall",     4, { min:  2, max:  15, unit: "mm" });

// Hollow enclosure via boolean subtraction
const body   = box(width, depth, height).color('#4a8fd4');
const cavity = box(width - wall * 2, depth - wall * 2, height, true)
  .translate(0, 0, wall);

return body.subtract(cavity);
`,
};
