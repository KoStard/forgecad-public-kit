// Side-effect imports: each file patches ConstrainedSketchBuilder.prototype
import './rect';
import './polygon';
import './regularPolygon';

// Re-export public API
export { addRect } from './rect';
export type { RectOptions, RectVertexName, RectSideName, ConstrainedRect } from './rect';

export { addPolygon } from './polygon';
export type { PolygonOptions, ConstrainedPolygon } from './polygon';

export { addRegularPolygon } from './regularPolygon';
export type { RegularPolygonOptions, ConstrainedRegularPolygon } from './regularPolygon';
