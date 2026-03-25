/**
 * Cutting Layout Demo — demonstrates sheetStock declarations
 * for the cutting layout PDF with cut sequencing.
 */

// Cabinet panels — 5.5mm plywood
sheetStock(464, 350, 'Base Bottom Panel', { material: '5.5mm plywood' });
sheetStock(464, 90, 'Base Front Panel', { material: '5.5mm plywood', quantity: 2 });
sheetStock(350, 90, 'Base Side Panel', { material: '5.5mm plywood', quantity: 2 });
sheetStock(464, 200, 'Shelf', { material: '5.5mm plywood', quantity: 3 });
sheetStock(464, 350, 'Back Panel', { material: '5.5mm plywood' });

// Structural pieces — 18mm plywood
sheetStock(500, 80, 'Support Rail', { material: '18mm plywood', quantity: 4 });
sheetStock(340, 80, 'Cross Brace', { material: '18mm plywood', quantity: 2 });
