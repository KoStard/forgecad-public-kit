# ForgeCAD BREP Transition Plan

Date: 2026-03-06

## Bottom line

Yes, ForgeCAD can move toward BREP-capable CAD, but the wrong move is a full kernel rewrite or a language rewrite first.

The right move is:

1. Keep the current script language and modeling API.
2. Formalize the geometry contract at the `Shape`/`TrackedShape` boundary.
3. Introduce a hybrid backend path for the operations where BREP actually matters.

## What the current codebase already proves

- The product is not “just Manifold.” The value is the code-first workflow, params, imports, assemblies, topology naming, reports, and examples.
- ForgeCAD already expresses higher-level CAD intent:
  - tracked extrusions/revolves
  - semantic face/edge references
  - assemblies and motion checks
  - surfacing-style features like `loft()` and `sweep()`
- The hard limitation is not expressiveness of the language. It is geometric exactness and topology persistence after general operations.

## What users actually mean by “it’s not BREP”

Usually they mean one or more of:

- fillets should be exact and robust
- shell should be native, not approximated
- face references should survive more edits
- sketch-on-face should be dependable
- STEP/IGES exchange should exist
- surfacing should feel less sampled/meshed

Those are backend and topology problems, not evidence that the Forge language is wrong.

## What should stay unchanged

- `.forge.js` as the source format
- `param(...)`, imports, assemblies, BOM/report APIs
- script-level composition patterns
- the idea that code is the feature tree

If ForgeCAD ever gets an OCCT-backed path, scripts should mostly stay valid.

## First formalization step

The repo now has `shape.geometryInfo()` / `trackedShape.geometryInfo()` with:

- `backend`
- `representation`
- `fidelity`
- `topology`
- `sources`

This is the correct place to formalize before any bigger migration. It lets ForgeCAD say, in code, whether a result is:

- `kernel-native`
- `sampled`
- `deformed`
- topology-free vs synthetically tracked

That is enough to make hybrid execution explicit without forcing a new language.

The maintained exact-export parity matrix lives in [`docs/permanent/API/output/brep-export.md`](../../permanent/API/output/brep-export.md).

## Recommended architecture

### Phase 1: Hybrid contract, not hybrid kernel chaos

Keep `Shape` as the public solid type. Internally, let it become backend-agnostic.

Target internal model:

- `Shape` = public immutable wrapper
- backend payload = Manifold mesh solid or OCCT BREP solid
- capability/provenance metadata = surfaced via `geometryInfo()`

This keeps scripts stable while internals evolve.

### Phase 2: Selective BREP adoption

Do not port everything to BREP.

Use a BREP backend only for features where it pays for itself. The current lowest-friction path is a Python OCCT backend through CadQuery/OCP, not a full FreeCAD app dependency and not an in-browser OCCT port on day one.

- shell
- exact fillet/chamfer
- sketch-on-face / projection
- robust face splitting
- STEP export/import

Keep Manifold for the things it is already good at:

- fast booleans
- viewport-friendly regeneration
- level-set/SDF workflows
- loose surfacing approximations
- mesh export

### Phase 3: Operation-level routing

A realistic end state is:

- `box`, `cylinder`, `extrude`, `revolve`: can be emitted as either Manifold or BREP solids
- `loft`, `sweep`: keep approximation path first, optionally add BREP implementation later
- `shell`, `fillet`, `stepExport`: BREP-first operations
- booleans: route to the backend that owns the operands, or convert intentionally

That means conversion boundaries must be explicit and rare, not accidental.

## What not to do

### Do not rewrite the Forge language

There is no evidence that a new DSL would solve the actual complaints. The complaints are geometric robustness and exactness.

### Do not rewrite a kernel from scratch

Writing a production BREP kernel is years of work and would bury the project.

### Do not immediately replace Manifold everywhere

That would risk losing ForgeCAD’s speed, simplicity, and browser friendliness before the exact-feature path is even validated.

## Concrete next steps

1. Add a backend adapter layer behind `Shape` operations.
2. Define which operations are backend-native, sampled, or conversion-heavy.
3. Prototype one OCCT-backed feature end-to-end:
   - best candidates: `shell()` or STEP export
4. Preserve `geometryInfo()` across conversions so behavior is inspectable.
5. Add a “backend mismatch/conversion” warning path in CLI diagnostics.

## Language formalization guidance

The language does not need a rigid standalone spec yet.

What does need to be formalized now:

- coordinate conventions
- object-return conventions
- stable naming rules for faces/edges/areas
- backend/provenance contract for solids
- which operations preserve topology and which do not

That level of formalization is enough to make the system reliable without freezing experimentation.

## Recommendation

Move toward a hybrid ForgeCAD, not “ForgeCAD rewritten as a BREP system.”

If the project does this well, users get the benefits they associate with BREP while keeping the parts that already make ForgeCAD distinct and valuable.
