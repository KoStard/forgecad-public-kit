# Family Intake Profiles

Family-scoped starter anchors for closing missing inputs — temporary engineering anchors, not truth, and never reused across families.

## Process Selection By Family

Never default to 3D printing. Choose the process stack from artifact family, load path, scale, safety expectations, material properties, quantity/iteration needs, and operating story. Typical honest stacks:

- rideable vehicles: metal/composite/wood structure, urethane/rubber wheels, bearings, brakes, fasteners, purchased safety-critical hardware
- furniture: wood, sheet goods, tube, metal brackets, conventional joinery; printed parts only for honest secondary details
- enclosures: injection molding, sheet metal, CNC, thermoforming, or printing depending on quantity, ruggedness, serviceability
- fixtures: machined, laser-cut, welded, printed, or hybrid with standard clamps/pins/fasteners
- small mechanisms: hybrid printed/machined/sheet parts plus purchased pivots, shafts, bearings, springs, fasteners, motors, electronics

## Family: Grippers And Small Mechanisms

Use for: robot grippers, articulated fingers, small pick-and-place tools, manipulators, end-effectors.

Family questions: delicate / mixed-general / rigid-tool-like handling? size closer to desk, household, or workshop objects? cheapest / balanced / performance-first hardware?

Duty bands:

- `light-duty` — object mass `0.05-0.15 kg`, opening/feature band `30-60 mm`; small servo, compact lightweight prototype members (printed, machined, or laser-cut per the selected posture)
- `general-duty` — object mass `0.20-0.50 kg`, opening `60-120 mm`; standard metal-gear servo or NEMA17-class solution, M3/M4 fasteners, inserts, pins, bearings where honest
- `sturdy-duty` — object mass `0.50-1.00 kg`, opening `100-180 mm`; stronger shafts, bearings, more metal reinforcement; downgrade final certainty unless the mechanism stays simple

### Subtype: Dexterous Finger / Humanoid Hand Module

Use for robot/dexterous/anthropomorphic/tendon/prosthetic-style fingers or one module of a robot hand.

Story shape: a hand/manipulation program at an invented robotics org, a concrete module revision (`F2 index finger`, `Rev-C palm-mount finger`), a go/no-go or demo gate, a named test rig, real deployment stakes. Seed: "Helix Handworks is preparing the F2 index-finger module for its DEX-07 warehouse-pilot go/no-go review. The finger must bolt into Palm Mule V3, route a Bowden tendon through the MCP base without rubbing the housing wall, survive a 1,000-cycle curl test on Rig-3, and expose pivot/wear surfaces before the customer demo cell is frozen."

Starter assumptions for `general-duty` / `medium` / `balanced`:

- envelope: adult index-finger scale, roughly `95-115 mm` long, `18-24 mm` wide, `16-24 mm` thick
- joints: MCP/PIP/DIP-like flexion chain with hard stops and clearance checks through curl
- motion target: MCP `0-75 deg`, PIP `0-90 deg`, DIP `0-65 deg`
- actuation: tendon or Bowden cable flexion with passive elastic/spring return unless the user asks for independent motors
- hardware: metal pivot pins or shoulder screws, bushings or bearing surfaces, serviceable tendon anchor, replaceable fingertip/contact pad, palm mounting datum
- validation: full-range curl sweep, tendon rub check, pivot wear check, fingertip contact load path, base-mount stiffness, assembly access

## Family: Fixtures, Jigs, And Holders

Use for: drill guides, work-holding fixtures, camera/sensor mounts, brackets, repeatable positioning tools.

Family questions: positioning, clamping, or repeated handling? palm-, hand-, or bench-size? speed of build vs stiffness?

Non-obvious anchors: at `general-duty`, put inserts, metal pins, or off-the-shelf fasteners where wear concentrates; at `sturdy-duty` (repeated clamping, workshop abuse), printed geometry must be backed by thicker sections, inserts, metal rails, or replaceable wear faces.

## Family: Enclosures And Electronics Housings

Use for: PCB enclosures, instrument cases, sensor housings, covers and shells.

Family questions: one PCB, hand-sized stack, or bench device? passive venting, fan support, or dust protection? aesthetics, serviceability, or ruggedness?

Non-obvious anchors: at `general-duty`, a removable lid with real fastening (inserts) and clearance for wiring/service loops; at `sturdy-duty`, thicker walls, boss reinforcement, connector strain protection, and a sealing strategy.

## Family: Furniture And Load-Bearing Structures

Use for: tables, shelves, stands, stools, structural frames.

**Caution:** human-bearing or safety-critical structures usually end `BEST-EFFORT BUILD CANDIDATE` unless there is real structural reasoning, conservative geometry, and honest material limits.

Family questions: decorative / light household / real workshop use? side-table, desk, or bench span? will it ever support a person, heavy tools, or repeated impact?

Non-obvious anchors: at `general-duty`, real attention to leg stiffness, racking resistance, and joint reinforcement; at `sturdy-duty`, stronger joinery, thicker members, triangulation/bracing. Wood, sheet goods, tube, and metal hardware are first-class BOM items; printed parts only where honest (brackets, templates, feet, cable features, corner blocks).

## Family: Chassis And Mobile Robot Structures

Use for: wheeled robot chassis, tracked platforms, sensor carts, mobile bases. **Not** for human-ridden scooters, bikes, skateboards, or mobility devices — those route to Human Vehicles below.

Family questions: indoor smooth, mixed home, or rough workshop floor? tiny robot, small rolling base, or larger platform? runtime / price / ruggedness priority?

Non-obvious anchors: at `general-duty`, strengthen wheel mounts, motor mounts, and battery restraint; at `sturdy-duty`, more metal shafts/bearings/real fastening and increased skepticism about fully printed load paths.

## Family: Human Vehicles And Rideable Product Forms

Use for: kick scooters, bicycles, skateboards/longboards, carts, strollers, dollies, mobility-adjacent platforms — anything a person stands on, rides, steers, brakes, or leans on.

**Caution:** rideables usually end `BEST-EFFORT BUILD CANDIDATE` unless there is real structural analysis, conservative geometry, braking/steering reasoning, and explicit test limitations. Never present a rider-rated design as safe without validation.

Family questions: visual CAD study, manufacture-realistic prototype candidate, or explicitly printable toy/model? child-, adult-, display-, or cargo-scale? steering, braking, folding, suspension, or static form only?

Anchors: `light-duty` = display/toy/non-ridden study, printed cosmetic parts acceptable. `general-duty` = aluminum/steel tube or frame, machined or cast fork/dropout features, wood/composite/aluminum deck, urethane/rubber wheels, real bearings, axles, grip tape, purchased brake/steering hardware. `sturdy-duty` = conservative metal/composite structure, triangulation, large bearing interfaces, replaceable wear parts; downgrade certainty unless structural checks and a real test plan are explicit.

Manufacturing: primary load paths in metal tube/plate/extrusion or wood/composite — never printed unless the user explicitly requested a printed demonstration model. Rolling interfaces purchased (wheels, bearings, axles, spacers, bushings); contact/wear interfaces in urethane/rubber, grip tape, replaceable pads. Printed parts only for cosmetic covers, cable guides, templates, fit-check models, or low-load accessory brackets.

## If No Family Fits

Do not force a nearby family. Name the nearest family, state the mismatch, and build a custom intake brief with 2-4 artifact-specific levers.

## When Printing Is Selected

Only when the artifact actually includes printed parts:

- structural printed parts: PETG by default; PLA allowed for prototypes/fit checks
- nozzle `0.4 mm`, layer height `0.2 mm`
- threaded service joints: heat-set inserts where repeated opening is expected
- sliding/rotating or wear-heavy interfaces: pins, bushings, bearings, or sacrificial wear parts — never raw printed rubbing unless intentionally low-duty
