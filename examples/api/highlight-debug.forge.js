/**
 * Debug Highlight API — visual debugging for any geometry
 *
 * highlight() accepts points, edges, planes, faces, shapes, and sketch entities.
 * Each highlighted item renders as a colored overlay in the viewport.
 */

const b = box(30, 20, 15);

// Point highlight — rendered as a small sphere
highlight([0, 0, 0], { color: 'cyan', label: 'origin' });
highlight([30, 20, 15], { color: 'cyan', label: 'corner' });

// Edge highlight — rendered as a line segment with endpoint spheres
highlight([[0, 0, 0], [30, 20, 15]], { color: 'yellow', label: 'diagonal' });

// Plane highlight — rendered as a semi-transparent disc with normal arrow
highlight({ normal: [0, 0, 1], offset: 7.5 }, { color: 'lime', label: 'z=7.5', size: 30 });

// Plane from normal + point
highlight({ normal: [1, 0, 0], point: [15, 0, 0] }, { color: 'orange', label: 'x=15' });

// Face reference — highlight a named face from a tracked shape
highlight(b.face('top'), { color: 'red', label: 'top face' });

// Edge reference — highlight a named edge
highlight(b.edge('top-right'), { color: 'blue', label: 'top-right edge' });

// Shape highlight — transparent colored overlay on the entire shape
highlight(b, { color: '#ff00ff' });

// Intermediary shape highlight — snapshot a temporary shape that is not returned
const temporary = b.translate(40, 0, 0);
highlight(temporary, { color: '#00ffff', label: 'temporary snapshot' });

return b;
