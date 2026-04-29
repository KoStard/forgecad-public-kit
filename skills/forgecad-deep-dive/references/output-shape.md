# Output Shape

Use this reference before drafting the deep-dive folder.

## Folder skeleton

```text
docs/temporary/projects/YYYY/MM/DD/<slug>/
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

## INDEX.md

`INDEX.md` is the navigation surface, not just a title page.

Include:

- one short thesis paragraph,
- the concept tree,
- one or two recommended reading paths,
- links to the appendix files,
- a short note on source posture if the topic mixes verified facts and inference.

## Concept note template

Use this template for each concept page:

```markdown
# <Concept Title>

<A few clean paragraphs that explain one concept from first principles.>

## Appendix

- Parent: <link or none>
- Children: <links>
- ForgeCAD anchors: <repo files, docs, or APIs>
- Primary sources: <URLs or local artifacts>
- Inference notes: <what was inferred rather than directly stated>
```

## Writing standard

- Keep the main body narrative-first.
- Do not let the appendix become larger than the explanation.
- Prefer a few high-signal sources over a noisy dump.
- Use concrete product or code examples only when they clarify the concept.
- End external analyses with a concrete implication for ForgeCAD.

## What to avoid

- Changelog summaries.
- A giant report pasted into one file.
- Notes that each cover three or four ideas at once.
- Hiding uncertainty. If a conclusion is inferred, say so.
