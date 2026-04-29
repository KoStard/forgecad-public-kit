// Flange coupling — demonstrates route() with typed step factories and tangent approach

const R_CORE = 45
const R_CORE_IN = 27.5
const R_LUG = 18
const LUG_DIST = 60
const R_BOLT = 10

const core  = route.circle([0, 0], R_CORE)
const lugTR = route.circle(polar(LUG_DIST, 60), R_LUG)
const lugTL = route.circle(polar(LUG_DIST, 120), R_LUG)
const lugBL = route.circle(polar(LUG_DIST, 240), R_LUG)
const lugBR = route.circle(polar(LUG_DIST, 300), R_LUG);

// Route the outer perimeter: circles connected by fillet arcs
// Tangent approach adds a straight tangent line from each lug to the core body

let body = constrainedSketch()
  .route([
    lugTR,  route.fillet(17),
    lugTL,  route.fillet(5, 'tangent'),
    core,   route.fillet(5, 'tangent'),
    lugBL,  route.fillet(17),
    lugBR,  route.fillet(5, 'tangent'),
    core,   route.fillet(5, 'tangent'),
  ])
  .solve();

// Subtract center bore
body = body.subtract(circle2d(R_CORE_IN))

const solidCutRectangle = rect(200, 8);
const solidRing = circle2d(R_CORE)
  .subtract(circle2d(R_CORE_IN))
  .subtract(solidCutRectangle)
  .subtract(solidCutRectangle.rotate(60))
  .subtract(solidCutRectangle.rotate(120));

// Subtract bolt holes
for (const angle of [60, 120, 240, 300]) {
  body = body.subtract(circle2d(R_BOLT).translate(...polar(LUG_DIST, angle)))
}

return union(
  body
    .extrude(15),
  solidRing
    .extrude(15).
    translate(0, 0, 15)
);
