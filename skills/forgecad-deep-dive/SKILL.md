---
name: forgecad-deep-dive
description: Create a linked folder of concept one-pagers that deconstruct a ForgeCAD idea, architecture area, scientific concept, competitor capability, or future feature into a recursive concept tree. Use when the user wants a deep dive, concept book, walkthrough folder, architecture explainer, state-of-the-art analysis, or future-facing capability teardown saved under docs/temporary/projects/ or in Obsidian.
forgecad-public: true
---

# ForgeCAD Deep Dive

Create a durable deep-dive folder that helps a reader internalize one idea by walking from the thesis down to its irreducible concepts.

This skill is for understanding, not for shipping code directly. The deliverable is a linked set of notes that makes one concept feel obvious after reading, especially when the topic spans architecture, geometry, science, manufacturing, or competitor workflows.

## Distinct Intent

- Use this skill when the user wants a multi-page concept tree, not a single page.
- If the user only wants one short narrative memo, use `concept-one-pager` instead.
- If the user wants implementation design without the teaching artifact, use `forgecad-high-level-spec` or `design-doc`.
- If the user wants brainstorming or pushback before writing, use `nonaction` or `discuss`.

## Output Contract

1. Choose the artifact location.
   Default to `docs/temporary/projects/YYYY/MM/DD/<slug>/`.
   Only write into Obsidian when the user explicitly asks for it or provides a vault path.
2. Create `INDEX.md`.
   Start with a short thesis paragraph, then show the concept tree and suggested reading order.
3. Create a linked set of concept notes.
   The usual range is 5-12 notes.
   Each note should cover one pure concept and link to its parent and children.
4. Keep each note narrative-first.
   The main body should read like a concept one-pager.
   Put examples, sources, code references, and neighboring-note links in an appendix.
5. Add `appendix/sources.md`.
   Use primary sources whenever possible.
   If a claim is inferred from public evidence rather than explicitly stated, label it as an inference.
6. When the topic touches ForgeCAD, add `appendix/forgecad-code-map.md` or an equivalent file that maps the concept back to concrete repo files, current limitations, and leverage points.

Before drafting, read [references/output-shape.md](references/output-shape.md).

## Workflow

1. Frame the root question.
   State what the user is actually trying to understand and why it matters.
2. Find the central thesis.
   The entire folder should orbit one claim, not a bag of notes.
3. Decompose the thesis into a concept tree.
   Start with 3-6 first-order concepts.
   Recurse only where a child concept is still too impure or overloaded.
4. Gather evidence from both sides of the problem.
   For ForgeCAD topics, read the relevant local code and docs.
   For competitor or industry topics, verify temporally unstable claims on the internet and prefer official docs, product pages, release notes, standards, or research papers.
5. Draft the notes from top to bottom.
   Write the root thesis first, then the foundational notes, then the downstream implications.
6. Link the notes.
   The reader should always know what concept a note depends on and where to go next.
7. Close with implications.
   If the topic is external or competitive, end with what ForgeCAD should learn, copy, reject, or build.

## Writing Rules

- One concept per note.
- The main body should be mostly paragraphs, not bullets.
- Explain the plain-language version before introducing specialized vocabulary.
- Keep the note short enough that a motivated reader can finish it in one sitting.
- Avoid changelog language. The goal is understanding, not event reporting.
- If you include comparisons, separate direct evidence from your inference.
- Be explicit about uncertainty when public material is incomplete.

## Quality Bar

A good deep dive leaves the reader with:

- a clear root thesis,
- a believable decomposition into smaller ideas,
- a sense of what is proven versus inferred,
- a practical bridge back to ForgeCAD,
- and a folder they can revisit later without needing the original conversation.

If the folder reads like notes from a research sprint instead of a teachable walkthrough, rewrite it.

## Common Patterns

- Competitor teardown:
  Explain the public model, the likely internal architecture, the user-visible constraints, and the implications for ForgeCAD.
- Future feature deep dive:
  Explain what the feature is, what abstractions it needs, what the hard parts really are, and what a staged roadmap should look like.
- Science concept deep dive:
  Isolate the math or geometry concepts until each note has one job.
- Repo architecture deep dive:
  Tie every major concept back to the current codebase and make the missing abstractions obvious.

## Deliverable Shape

Use a shape like this unless the topic strongly suggests a different tree:

```text
<slug>/
├── INDEX.md
├── 00-thesis.md
├── 10-<cluster>/
│   ├── 11-<concept>.md
│   └── 12-<concept>.md
├── 20-<cluster>/
│   └── ...
└── appendix/
    ├── sources.md
    └── forgecad-code-map.md
```

Use numbered prefixes so the notes are readable both as a graph and as a linear path.

## Final Check

Ask these questions before you stop:

- Would a new teammate understand the idea from the folder alone?
- Did I split overloaded notes into purer concepts?
- Are the most important public claims verified and dated where needed?
- Does the folder make a concrete difference to ForgeCAD, not just summarize a competitor?
