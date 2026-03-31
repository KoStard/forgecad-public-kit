// Flange coupling — demonstrates routePerimeter with construction circles and fillet arcs

const R_CORE = 45
const R_CORE_IN = 27.5
const R_LUG = 18
const LUG_DIST = 60
const R_BOLT = 10

const core  = { center: [0, 0],               radius: R_CORE }
const lugTR = { center: polar(LUG_DIST, 60),   radius: R_LUG }
const lugTL = { center: polar(LUG_DIST, 120),  radius: R_LUG }
const lugBL = { center: polar(LUG_DIST, 240),  radius: R_LUG }
const lugBR = { center: polar(LUG_DIST, 300),  radius: R_LUG }

// Route the outer perimeter: circles connected by fillet arcs
let body = routePerimeter([
  lugTR,  { fillet: 17 },
  lugTL,  { fillet: 5, approach: 'tangent' },
  core,   { fillet: 5, approach: 'tangent' },
  lugBL,  { fillet: 17 },
  lugBR,  { fillet: 5, approach: 'tangent' },
  core,   { fillet: 5, approach: 'tangent' },
])

// Subtract center bore
body = body.subtract(circle2d(R_CORE_IN))

// Subtract bolt holes
for (const angle of [60, 120, 240, 300]) {
  body = body.subtract(circle2d(R_BOLT).translate(...polar(LUG_DIST, angle)))
}

return body.extrude(15)
