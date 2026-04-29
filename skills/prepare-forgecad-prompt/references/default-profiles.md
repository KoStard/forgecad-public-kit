# Scoped Intake Profiles

This file does not define universal defaults.

It defines a safer process:

1. classify the artifact family
2. choose a manufacturing/process posture
3. choose qualitative levers
4. translate those levers into starter assumptions only inside that family

These starter assumptions are not "truth".
They are temporary engineering anchors used only when the user has not provided exact numbers.

## Universal Levers

Use these across families before translating into numbers:

- manufacturing posture: infer unless specified; common values are `production-realistic`, `prototype-realistic`, `printable`, and `visual-CAD`
- duty level: `light-duty`, `general-duty`, `sturdy-duty`
- scale level: `compact`, `medium`, `large`
- cost posture: `cheapest`, `balanced`, `performance-first`

Never take a number from one family and silently reuse it for another.

## Manufacturing Selection Rule

Do not use 3D printing as the universal default.
Choose the process stack from the artifact family, load path, scale, safety expectations, material properties, quantity/iteration needs, and operating story.
Only use print defaults when the user explicitly requested printing or the selected process stack includes printed parts.

Examples:

- rideable vehicles: metal/composite/wood structure, urethane/rubber wheels, bearings, brakes, fasteners, and purchased safety-critical hardware
- furniture: wood, sheet goods, tube, metal brackets, conventional joinery, and printed parts only for honest secondary details
- enclosures: injection molding, sheet metal, CNC, thermoforming, or printing depending on quantity, ruggedness, and serviceability
- fixtures: machined, laser-cut, welded, printed, or hybrid with standard clamps/pins/fasteners
- small mechanisms: hybrid printed/machined/sheet parts plus purchased pivots, shafts, bearings, springs, fasteners, motors, and electronics where appropriate

## Family: Grippers And Small Mechanisms

Use for:

- robot grippers
- articulated fingers
- small pick-and-place tools
- small manipulators and end-effectors

### Family Questions

- What feels closest: delicate handling, mixed general handling, or rigid/tool-like handling?
- Is the size closer to small desk objects, everyday household objects, or larger workshop objects?
- Should we bias for cheapest, balanced, or performance-first hardware?

### Translation To Starter Assumptions

`light-duty`

- object mass band: roughly `0.05-0.15 kg`
- opening / feature band: roughly `30-60 mm`
- hardware posture: small servo / compact mechanism / lightweight prototype members; printed, machined, or laser-cut depending on the selected manufacturing posture

`general-duty`

- object mass band: roughly `0.20-0.50 kg`
- opening / feature band: roughly `60-120 mm`
- hardware posture: standard metal-gear servo or NEMA17-class solution, M3/M4 fasteners, inserts, pins, bearings where honest

`sturdy-duty`

- object mass band: roughly `0.50-1.00 kg`
- opening / feature band: roughly `100-180 mm`
- hardware posture: stronger shafts, bearings, more metal reinforcement, likely downgrade final certainty unless the mechanism remains simple

### Subtype: Dexterous Finger / Humanoid Hand Module

Use when the request is for a robot finger, dexterous finger, anthropomorphic finger, tendon finger, prosthetic-style finger, or one module of a robot hand.

Default specific operating story shape:

- invented organization: a named ambitious robotics company or advanced hardware group, not a famous real company
- named program: a humanoid hand, embodied AI manipulation, warehouse-pilot, or end-effector program with real mission pressure
- named revision: a concrete module/revision like `F2 index finger`, `DIP/PIP tendon mule`, or `Rev-C palm-mount finger`
- review moment: go/no-go gate, customer-demo readiness review, actuator-routing review, palm-integration check, or grasp-demo gate
- test setting: named curl-cycle rig, palm mule, contact-pad wear fixture, or instrumented grasp bench
- stakes: first-customer pilot, investor demo, field-trial gate, reliability target, or deployment schedule

Good story seed:

- "Helix Handworks is preparing the F2 index-finger module for its DEX-07 warehouse-pilot go/no-go review. The finger must bolt into Palm Mule V3, route a Bowden tendon through the MCP base without rubbing the housing wall, survive a 1,000-cycle curl test on Rig-3, and expose pivot/wear surfaces before the customer demo cell is frozen."

Starter assumptions for `general-duty` / `medium` / `balanced`:

- envelope: adult index-finger scale, roughly `95-115 mm` long, `18-24 mm` wide, `16-24 mm` thick
- joints: MCP/PIP/DIP-like flexion chain with hard stops and clearance checks through curl
- motion target: MCP roughly `0-75 deg`, PIP roughly `0-90 deg`, DIP roughly `0-65 deg`
- actuation: tendon or Bowden cable flexion with passive elastic/spring return unless the user asks for independent motors
- hardware posture: metal pivot pins or shoulder screws, bushings or bearing surfaces, serviceable tendon anchor, replaceable fingertip/contact pad, palm mounting datum
- validation: full-range curl sweep, tendon rub check, pivot wear check, fingertip contact load path, base-mount stiffness, and assembly access

### Manufacturing Defaults When Printing Is Selected

- structural printed parts: PETG by default
- prototypes / fit checks: PLA allowed
- sliding or rotating interfaces: prefer pins, bushings, bearings, or sacrificial wear parts over raw printed rubbing

## Family: Fixtures, Jigs, And Holders

Use for:

- drill guides
- work-holding fixtures
- camera / sensor mounts
- brackets and repeatable positioning tools

### Family Questions

- Is it mostly for positioning, clamping, or repeated handling?
- Is the scale closer to palm-size, hand-size, or bench-size?
- Is speed of build more important than stiffness, or vice versa?

### Translation To Starter Assumptions

`light-duty`

- small hand-tool or desktop fixture
- low clamp loads
- simple printed, machined, laser-cut, or bent-sheet geometry acceptable depending on the selected process

`general-duty`

- hand-size or bench-size fixture
- moderate clamp loads
- inserts, metal pins, or off-the-shelf fasteners where wear concentrates

`sturdy-duty`

- repeated clamping or alignment duty
- workshop abuse expected
- printed geometry, if used, should be backed by thicker sections, inserts, metal rails, or replaceable wear faces

## Family: Enclosures And Electronics Housings

Use for:

- PCB enclosures
- instrument cases
- sensor housings
- covers and protective shells

### Family Questions

- Is this for one PCB, a hand-sized electronics stack, or a larger bench device?
- Does it need passive venting, fan support, or mostly dust protection?
- Is aesthetics, serviceability, or ruggedness the main goal?

### Translation To Starter Assumptions

`light-duty`

- single small board or simple module
- easier snap/screw access acceptable
- lighter wall sections

`general-duty`

- multiple boards or connectors
- removable lid / inserts / real fastening
- enough clearance for wiring and service loops

`sturdy-duty`

- rugged transport or workshop environment
- thicker walls, boss reinforcement, connector strain protection, better sealing strategy

## Family: Furniture And Load-Bearing Structures

Use for:

- tables
- shelves
- stands
- stools
- structural frames

### Important Caution

Human-bearing or safety-critical structures should usually end as `BEST-EFFORT BUILD CANDIDATE` unless there is real structural reasoning, conservative geometry, and honest material limits.

### Family Questions

- Is this mostly decorative / light household / real workshop use?
- Is the span closer to side-table size, desk size, or bench size?
- Will it ever support a person, concentrated heavy tools, or repeated impact?

### Translation To Starter Assumptions

`light-duty`

- decor, lamps, light household items
- smaller spans
- simpler joints acceptable

`general-duty`

- laptop, books, normal desk use
- medium spans
- real attention to leg stiffness, racking resistance, and joint reinforcement

`sturdy-duty`

- workshop surfaces, heavier distributed loads, or concentrated tools
- larger spans or more demanding rigidity
- stronger joinery, thicker members, more triangulation / bracing, and often conventional structural reinforcement

### Manufacturing Defaults

- do not assume "fully 3D printed" is the right answer
- for structural furniture, consider wood, sheet goods, tube, or metal hardware as first-class BOM items
- use printed parts mainly where they are honest: brackets, templates, feet, cable features, corner blocks, custom connectors

## Family: Chassis And Mobile Robot Structures

Use for:

- wheeled robot chassis
- tracked platforms
- sensor carts
- mobile bases

Do not use this family for human-ridden scooters, bicycles, skateboards, mobility devices, or other rideable products. Use `Human Vehicles And Rideable Product Forms` instead.

### Family Questions

- Indoor smooth floor, mixed home floor, or rough workshop floor?
- Tiny robot, small rolling base, or larger mobile platform?
- Is runtime / price / ruggedness the main priority?

### Translation To Starter Assumptions

`light-duty`

- small indoor base
- low speeds
- simpler drivetrain packaging

`general-duty`

- home or workshop mixed surfaces
- modest payloads
- stronger wheel mounts, motor mounts, and battery restraint

`sturdy-duty`

- rougher surfaces or heavier payloads
- more metal shafts / bearings / real fastening
- increased skepticism about fully printed load paths

## Family: Human Vehicles And Rideable Product Forms

Use for:

- kick scooters
- bicycles and balance bikes
- skateboards and longboards
- carts, strollers, dollies, or mobility-adjacent platforms with human interaction
- any artifact where a person stands on, rides, steers, brakes, or leans on the structure

### Important Caution

Human-ridden or safety-critical vehicles should usually end as `BEST-EFFORT BUILD CANDIDATE` unless there is real structural analysis, conservative geometry, braking/steering reasoning, and explicit test limitations.
Do not present a rider-rated design as safe without validation.
Do not make rideable load paths printed by default.

### Family Questions

- Is this a visual/product CAD study, a prototype-realistic build candidate, or a specifically printable toy/model?
- Is it for child-scale, adult-scale, display-scale, or cargo/utility scale?
- Does it need steering, braking, folding, suspension, or only static product form?

### Translation To Starter Assumptions

`light-duty`

- display-scale, toy-scale, or non-ridden study
- simplified load paths acceptable if clearly labeled
- printed or lightweight prototype parts may be acceptable for cosmetic/non-critical features

`general-duty`

- adult product form or prototype-realistic scooter/bike/cart architecture
- aluminum or steel tube/frame members, machined or cast fork/dropout-like features, wood/composite/aluminum deck where appropriate
- urethane/rubber wheels, real bearings, axles, fasteners, spacers, grip tape, grips, and purchased brake/steering hardware where appropriate

`sturdy-duty`

- repeated riding, rougher surfaces, heavier loads, cargo, impact, or braking/steering duty
- conservative metal/composite structure, triangulation, large bearing interfaces, replaceable wear parts, and no printed primary load paths unless the user explicitly requested a printed demonstration model
- downgrade final certainty unless structural checks and real-world test plan are explicit

### Manufacturing Defaults

- primary load paths: aluminum/steel tube, plate, extrusion, wood/composite deck, or equivalent conventional structural members
- rolling interfaces: purchased wheels, bearings, axles, spacers, and bushings
- contact/wear interfaces: urethane/rubber, grip tape, replaceable pads, bushings, bearings
- printed parts: cosmetic covers, cable guides, templates, fit-check models, brackets for low-load accessories, or explicit printable-model requests

## If No Family Fits

Do not force a nearby family just because it is available.

Instead:

- say the nearest family
- explain the mismatch
- create a custom intake brief with 2-4 artifact-specific levers

## When Printing Is Selected

Only use when the artifact actually includes printed parts:

- nozzle: `0.4 mm`
- layer height: `0.2 mm`
- threaded service joints: use heat-set inserts where repeated opening is expected
- wear-heavy interfaces: do not trust raw printed friction unless the task is intentionally low-duty
