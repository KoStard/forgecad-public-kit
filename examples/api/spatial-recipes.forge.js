// Spatial Recipes — common arrangements for multi-part assemblies.
//
// ForgeCAD coordinate system:
//   X = left/right    (+X = right)
//   Y = forward/back  (+Y = forward, −Y = back toward camera)
//   Z = up/down       (+Z = up)
//
// "front" anchor = −Y face (faces the camera in default view)
// "back"  anchor = +Y face
//
// These recipes show how to position parts relative to each other
// using attachTo() so you never need manual coordinate math.

const recipe = param("Recipe", 1, { min: 1, max: 3, integer: true });

if (recipe === 1) {
  // ─── Recipe 1: Wall separating two spaces ───
  // Wall is thin along Y. Indoor side = −Y. Outdoor side = +Y.

  const wallThick = 15;
  const wall = box(200, wallThick, 150, true).color('#C4A77D');

  // Indoor unit: its back face meets the wall's front face
  const indoor = box(120, 30, 50, true).color('#F5F5F5')
    .attachTo(wall, 'front', 'back', [0, -5, 0]);

  // Outdoor unit: its front face meets the wall's back face
  const outdoor = box(140, 40, 60, true).color('#888888')
    .attachTo(wall, 'back', 'front', [0, 5, -10]);

  // Pipe hole through wall — orient along Y (same as wall thickness)
  const hole = cylinder(wallThick + 2, 10).pointAlong([0, 1, 0]);
  const wallWithHole = wall.subtract(hole);

  // Pipe spanning both sides — also along Y, centered at same XZ as hole
  const pipe = cylinder(100, 4).pointAlong([0, 1, 0]).color('#B87333');

  return [
    { name: "Wall", shape: wallWithHole },
    { name: "Indoor Unit", shape: indoor },
    { name: "Outdoor Unit", shape: outdoor },
    { name: "Pipe", shape: pipe },
  ];
}

if (recipe === 2) {
  // ─── Recipe 2: Surface details on a box ───
  // Place vents, displays, buttons ON the surface of a parent body.
  // Key: use attachTo(parent, 'front', 'back') — child's back meets parent's front.

  const body = box(100, 40, 60, true).color('#F5F5F5');

  // Vent slits on front face, near bottom
  const vent = box(80, 2, 12, true).color('#333333')
    .attachTo(body, 'front', 'back', [0, -1, -15]);

  // Display panel on front face, near top-right
  const display = box(35, 1.5, 8, true).color('#00ddee')
    .attachTo(body, 'top-front', 'top-back', [15, -1, -8]);

  // Button on front face
  const button = cylinder(2, 4).pointAlong([0, -1, 0]).color('#44cc44')
    .attachTo(body, 'front', 'back', [-30, -2, 10]);

  // Side vent on left face: child's right meets parent's left
  const sideVent = box(2, 30, 40, true).color('#666666')
    .attachTo(body, 'left', 'right', [1, 0, 0]);

  return [
    { name: "Body", shape: body },
    { name: "Front Vent", shape: vent },
    { name: "Display", shape: display },
    { name: "Button", shape: button },
    { name: "Side Vent", shape: sideVent },
  ];
}

if (recipe === 3) {
  // ─── Recipe 3: Stacking and penetration ───
  // Outdoor AC condenser: box body + fan on top + pipes from front

  const body = box(140, 50, 70, true).color('#888888');

  // Fan housing on top — cylinder defaults to Z-up, which is correct here
  const fan = cylinder(10, 50).color('#333333')
    .attachTo(body, 'top', 'bottom', [0, 0, 2]);

  // Fan grill (flat disc on top of fan)
  const grill = cylinder(2, 52).color('#777777')
    .attachTo(fan, 'top', 'bottom');

  // Pipe ports on front face — orient along Y (pointing outward from front)
  const pipe1 = cylinder(20, 5).pointAlong([0, -1, 0]).color('#B87333')
    .attachTo(body, 'front', 'back', [-15, -2, -10]);

  const pipe2 = cylinder(20, 3).pointAlong([0, -1, 0]).color('#B87333')
    .attachTo(body, 'front', 'back', [15, -2, -10]);

  // Feet on bottom
  const foot = box(20, 15, 5, true).color('#222222');
  const footL = foot.attachTo(body, 'bottom-left', 'top-left', [10, 5, -1]);
  const footR = foot.attachTo(body, 'bottom-right', 'top-right', [-10, 5, -1]);

  return [
    { name: "Body", shape: body },
    { name: "Fan", shape: fan },
    { name: "Grill", shape: grill },
    { name: "Pipe 1", shape: pipe1 },
    { name: "Pipe 2", shape: pipe2 },
    { name: "Foot L", shape: footL },
    { name: "Foot R", shape: footR },
  ];
}
