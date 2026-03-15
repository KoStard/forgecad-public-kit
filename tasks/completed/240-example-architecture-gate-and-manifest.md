# Example Architecture Gate And Manifest
## Problem Definition
After task 230, the compiler architecture may be honest for the supported feature set, but the repo still lacks a precise definition of what it means for the broader example surface to "work with the new setup."

Without that definition:

- we cannot tell whether all examples are covered or only the compiler corpus
- future example changes can bypass the new architecture without being noticed
- later migration work will duplicate effort or argue over scope instead of executing

This is the deepest post-MLP prerequisite because all later example migration work depends on one checked inventory and one shared definition of success.

## Description
Create the example-architecture gate: a checked inventory/manifest plus validation harness that defines what "working with the new setup" means for every example artifact in `examples/`.

This task should:

- inventory every `.forge.js`, `.sketch.js`, and `.forge-notebook.json` artifact under `examples/`
- classify each artifact by validation class
- attach an intentional validation path to each class
- attach an intentional compiler-route expectation to each `part` example
- fail when new examples are added without being classified

Primary files:

- new example-manifest / inventory files
- CLI example-check runner
- package scripts if needed
- `docs/temporary/projects/2026/03/backend-compiler-program/post-mlp-example-phase.md`
- permanent CLI docs if a new check command is added

## Acceptance Criteria
- There is a checked manifest or inventory that covers every example artifact present under `examples/` at the program branch tip.
- The manifest distinguishes at least the validation classes needed by the repo today:
  - `part`
  - `assembly`
  - `runtime-scene`
  - `sketch`
  - `notebook`
  - a temporary holdout class such as `legacy` or `experimental`
- There is one dedicated command or check surface that validates the manifest end to end and fails if:
  - an example file is unclassified
  - a classified file is missing
  - the assigned validation path fails
  - a `part` example's declared route expectation does not match the compiler report
- `part` examples can declare at least these intentional route outcomes:
  - `exact`
  - `faceted`
  - explicit temporary holdout outside the architecture gate
- The manifest format is split or structured so later parallel tasks can update distinct example families without all editing one monolithic file.
- The docs define the architecture-phase gate in concrete terms and explain what each example class means.

## Isolation Rule
- This is a definition-and-harness task, not a broad migration task.
- Prefer inventory, check, and doc work over mass example rewrites.
- Only touch example scripts when a small change is required to make the gate truthful.

## Dependencies
- task 230

## Parallelization
This is the first post-MLP core lane.

Do not start the broader example migration tasks until this lands, because they need one shared manifest and one shared success contract.

## Status and log
- 2026-03-12: Created as the deepest post-MLP prerequisite for repo-wide example migration into the new architecture phase.
