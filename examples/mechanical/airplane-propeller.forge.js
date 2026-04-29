// ================================================================
//  Airplane Propeller — Aerodynamic Design from First Principles
// ================================================================
//
// Generates a geometrically accurate airplane propeller using:
//
//   Airfoil:    NACA 4-digit series — closed-form polynomial equations
//               (Abbott & Von Doenhoff, "Theory of Wing Sections", 1959)
//
//   Twist:      Ideal distribution from Blade Element Momentum Theory
//               β(r) = atan(tan(β₇₅) × 0.75R / r)
//               Constant-circulation condition (Betz optimum)
//
//   Chord:      Betz-optimal taper — peaks near 35% span, elliptical falloff
//               (Adkins & Liebeck, "Design of Optimum Propellers", AIAA 1994)
//
//   Thickness:  24% at root (structural) → 6% at tip (aerodynamic)
//   Camber:     4% at root → 1.5% at tip (Cl margin at low-speed root)

// ─── Design Parameters ──────────────────────────────────────────
const diameter    = Param.number("Diameter",       1900, { min: 1200, max: 2600, unit: "mm" });
const numBlades   = Param.number("Blades",            3, { min: 2,    max: 6,    integer: true });
const pitchAngle  = Param.number("Pitch @75%R",      22, { min: 10,   max: 40,   unit: "°" });
const maxChord    = Param.number("Max Chord",       155, { min: 80,   max: 250,  unit: "mm" });
const hubDiameter = Param.number("Hub Diameter",    140, { min: 80,   max: 220,  unit: "mm" });
const meshRes     = Param.number("Mesh Resolution", 2.5, { min: 1.0,  max: 5.0,  step: 0.5, unit: "mm" });
const showSections = Param.bool("Show Airfoil Sections", false);

const R    = diameter / 2;
const rHub = hubDiameter / 2;
const DEG  = Math.PI / 180;

// ─── NACA 4-Digit Airfoil Generator ─────────────────────────────
//
// The NACA 4-digit series defines an airfoil by three parameters:
//   m — maximum camber as fraction of chord
//   p — chordwise position of maximum camber (fraction)
//   t — maximum thickness as fraction of chord
//
// The thickness distribution is a polynomial fitted to empirical data:
//   yt(x) = 5t [0.2969√x − 0.1260x − 0.3516x² + 0.2843x³ − 0.1036x⁴]
//
// The last coefficient −0.1036 (vs. original −0.1015) closes the trailing edge.
//
// Camber line yc(x) and its derivative dyc/dx define the mean line.
// Upper/lower surfaces are offset perpendicular to the camber line.
//
// Returns an array of [x, y] points tracing the airfoil outline.
// Points are centered at the aerodynamic quarter-chord and scaled by chord.
// Cosine spacing concentrates points at the leading edge where curvature is highest.

function nacaPoints(m, p, t, chord, n) {
  const upper = [];
  const lower = [];

  for (let i = 0; i <= n; i++) {
    // Cosine spacing: x ∈ [0, 1] with clustering at LE and TE
    const x = 0.5 * (1 - Math.cos(Math.PI * i / n));

    // Half-thickness from NACA polynomial
    const yt = 5 * t * (
        0.2969 * Math.sqrt(x)
      - 0.1260 * x
      - 0.3516 * x * x
      + 0.2843 * x * x * x
      - 0.1036 * x * x * x * x
    );

    // Mean camber line and its slope
    let yc = 0, dyc = 0;
    if (m > 0 && p > 0) {
      if (x <= p) {
        yc  = (m / (p * p)) * (2 * p * x - x * x);
        dyc = (2 * m / (p * p)) * (p - x);
      } else {
        yc  = (m / ((1 - p) * (1 - p))) * ((1 - 2 * p) + 2 * p * x - x * x);
        dyc = (2 * m / ((1 - p) * (1 - p))) * (p - x);
      }
    }

    // Surface points are offset perpendicular to the camber line
    const theta = Math.atan2(dyc, 1);
    const sinT  = Math.sin(theta);
    const cosT  = Math.cos(theta);

    // Center at quarter-chord (x = 0.25c) — the aerodynamic center
    upper.push([
      (x - yt * sinT - 0.25) * chord,
      (yc + yt * cosT) * chord,
    ]);
    lower.push([
      (x + yt * sinT - 0.25) * chord,
      (yc - yt * cosT) * chord,
    ]);
  }

  // Trace outline: upper surface LE→TE, then lower surface TE→LE
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(upper[i]);
  for (let i = n - 1; i >= 1; i--) pts.push(lower[i]);
  return pts;
}

// ─── 2D Point Rotation ──────────────────────────────────────────

function rotate2D(pts, angleDeg) {
  const a = angleDeg * DEG;
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

// ─── Aerodynamic Distributions Along the Blade Span ─────────────
//
// These functions define how the blade geometry varies from root to tip.
// rNorm ∈ [0, 1]: 0 = hub surface, 1 = blade tip.

// Twist: β(r) = atan(tan(β₇₅) × 0.75R / r)
// This is the ideal twist for constant circulation across the disk.
// At 75% radius it equals the user-set pitch angle (the industry reference station).
function twistAt(r) {
  return Math.atan(Math.tan(pitchAngle * DEG) * 0.75 * R / r) / DEG;
}

// Chord: GA propeller distribution — structural root + Betz-optimal taper.
// Peaks near 25% span, maintains width at root for structural attachment,
// smooth cosine taper to tip.
function chordAt(rNorm) {
  const r = rNorm;
  // Root: rises from 55% at hub to 100% at ~25% span
  const rootRise = r < 0.25
    ? 0.55 + 0.45 * Math.pow(r / 0.25, 0.7)
    : 1.0;
  // Cosine taper from peak to tip (exponent < 1 for fuller planform)
  const tipTaper = r < 0.25
    ? 1.0
    : Math.pow(Math.cos(Math.PI / 2 * ((r - 0.25) / 0.75)), 0.5);
  return maxChord * rootRise * tipTaper;
}

// Thickness ratio: thick root for structure, thin tip for aero.
// Varies from 24% at root to 6% at tip (power-law taper).
function thicknessRatioAt(rNorm) {
  return 0.24 - 0.18 * Math.pow(rNorm, 0.7);
}

// Camber: higher at root for Cl margin at low tangential speed.
// 4% at root → 1.5% at tip.
function camberAt(rNorm) {
  return 0.04 - 0.025 * rNorm;
}

// ─── Build Blade Profiles ───────────────────────────────────────
//
// Generate airfoil cross-sections at discrete radial stations.
// Each profile is:
//   1. A NACA airfoil with station-specific camber, thickness, and chord
//   2. Rotated 90° to align chord with the tangential direction (Y)
//   3. Further rotated by the pitch angle β for twist
//
// After lofting along Z (radial direction) and rotating 90° around Y,
// the blade extends radially in the XY propeller disk plane.
// The 90° + β rotation ensures:
//   - Zero pitch → chord along tangential (Y in world)
//   - Positive β → leading edge tilts toward thrust axis (+Z)

const NUM_STATIONS = 12;
const NACA_PTS     = 40;      // points per airfoil surface (80 total outline)
const CAMBER_POS   = 0.4;     // max camber at 40% chord (standard for props)

const profiles = [];
const heights  = [];

for (let i = 0; i <= NUM_STATIONS; i++) {
  const rNorm = i / NUM_STATIONS;
  const r     = rHub + rNorm * (R - rHub);

  const chord = Math.max(chordAt(rNorm), 5);  // minimum 5mm to avoid degenerate polygon
  const thick = thicknessRatioAt(rNorm);
  const camber = camberAt(rNorm);
  const twist = twistAt(r);

  // Generate NACA points and rotate to blade orientation
  let pts = nacaPoints(camber, CAMBER_POS, thick, chord, NACA_PTS);
  pts = rotate2D(pts, 90 + twist);  // 90° aligns chord with tangential, +twist adds pitch

  profiles.push(polygon(pts));
  heights.push(r);
}

// Loft all profiles into a smooth blade solid
const bladeRaw = loft(profiles, heights, { edgeLength: meshRes });

// Rotate blade from Z-axis (span) to X-axis (radial in propeller disk)
const blade = bladeRaw.rotateY(90);

// ─── Spinner / Hub ──────────────────────────────────────────────
//
// Ogive spinner: parabolic nose + cylindrical body + rear taper.
// Built as a loft of circular profiles along the propeller axis (Z).

const spinnerLen = hubDiameter * 1.3;
const spinnerR   = rHub * 0.95;
const HUB_STATIONS = 10;

const hubProfiles = [];
const hubHeights  = [];

for (let i = 0; i <= HUB_STATIONS; i++) {
  const t = i / HUB_STATIONS;   // 0 = nose (front), 1 = back

  let r;
  if (t < 0.35) {
    // Nose: parabolic ogive for low drag
    const tn = t / 0.35;
    r = spinnerR * Math.sqrt(tn);
  } else if (t < 0.7) {
    // Cylindrical body where blades attach
    r = spinnerR;
  } else {
    // Rear taper
    const tb = (t - 0.7) / 0.3;
    r = spinnerR * (1 - 0.25 * tb * tb);
  }

  hubProfiles.push(circle2d(Math.max(r, 3)));
  hubHeights.push(-spinnerLen * 0.35 + t * spinnerLen);
}

const spinner = loft(hubProfiles, hubHeights, { edgeLength: meshRes });

// ─── Assembly ───────────────────────────────────────────────────

const allBlades = circularPattern(blade, numBlades);

// ─── Optional: Airfoil Section Visualization ────────────────────
//
// When enabled, shows thin extrusions of each airfoil cross-section
// along the blade, revealing the twist and chord distribution.

const result = [
  { name: "Blades",  shape: allBlades.color('#2d2d30') },
  { name: "Spinner", shape: spinner.color('#c8c8cc') },
];

if (showSections) {
  const sectionShapes = [];
  for (let i = 0; i <= NUM_STATIONS; i++) {
    const rNorm = i / NUM_STATIONS;
    const r     = rHub + rNorm * (R - rHub);

    const chord = Math.max(chordAt(rNorm), 5);
    const thick = thicknessRatioAt(rNorm);
    const camber = camberAt(rNorm);
    const twist = twistAt(r);

    let pts = nacaPoints(camber, CAMBER_POS, thick, chord, NACA_PTS);
    pts = rotate2D(pts, 90 + twist);

    const section = polygon(pts).extrude(2)
      .rotateY(90)
      .translate(r, 0, 0)
      .color('#ff4422');

    sectionShapes.push(section);
  }
  result.push({ name: "Airfoil Sections", shape: union(...sectionShapes) });
}

return result;
