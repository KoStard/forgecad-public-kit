import { Sketch, type Anchor } from './core';

function getAnchorPoint(sketch: Sketch, anchor: Anchor): [number, number] {
  const b = sketch.bounds();
  const [minX, minY] = b.min;
  const [maxX, maxY] = b.max;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  switch (anchor) {
    case 'center': return [cx, cy];
    case 'top-left': return [minX, maxY];
    case 'top-right': return [maxX, maxY];
    case 'bottom-left': return [minX, minY];
    case 'bottom-right': return [maxX, minY];
    case 'top': return [cx, maxY];
    case 'bottom': return [cx, minY];
    case 'left': return [minX, cy];
    case 'right': return [maxX, cy];
  }
}

export function sketchAttachTo(sketch: Sketch, target: Sketch, targetAnchor: Anchor, selfAnchor: Anchor = 'center'): Sketch {
  const targetPt = getAnchorPoint(target, targetAnchor);
  const selfPt = getAnchorPoint(sketch, selfAnchor);
  const dx = targetPt[0] - selfPt[0];
  const dy = targetPt[1] - selfPt[1];
  return sketch.translate(dx, dy);
}

Sketch.prototype.attachTo = function(target: Sketch, targetAnchor: Anchor, selfAnchor: Anchor = 'center') {
  return sketchAttachTo(this, target, targetAnchor, selfAnchor);
};
