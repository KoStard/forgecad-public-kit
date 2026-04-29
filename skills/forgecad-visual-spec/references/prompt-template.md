# Prompt Template

Use this as a fill-in structure, not as fixed text.

## Block Order

1. Artifact identity
2. Mechanical / build truth
3. Material and color truth
4. Pose and shot
5. Render style
6. Negative constraints

## Skeleton

```text
A [artifact identity and scale], designed as a real buildable CAD-driven object, not a fantasy concept. [Major subassemblies and mechanism truth]. [Materials, colors, finish, and visible hardware truth]. Show it in [pose / state]. [Shot, camera, background, and lighting]. It should look physically buildable and mechanically honest, with visible part boundaries and serviceable architecture. No [negative 1], no [negative 2], no [negative 3].
```

## Default Prompt Shape

Use this for most first-pass prompts:

- artifact identity:
  compact benchtop robot arm, printable gripper, modular fixture, shop tool, enclosure, etc.
- mechanism truth:
  weighted base, exposed belt reductions, mounted motor, support shafts, guide rods, removable cover, jaw mechanism, hinge stack, etc.
- materials:
  PETG, TPU, aluminum shaft, brass pinion, black belt, matte plastic, realistic metal
- shot:
  front-left three-quarter view
- render style:
  clean premium studio product render, neutral background, soft diffused lighting, crisp soft shadows
- negatives:
  fake sleek shell, hidden mechanics, over-smoothed geometry, text, labels, humans

## Shot Suffixes

Useful one-line suffixes:

- `front-left three-quarter hero view, eye-level product camera`
- `rear-right three-quarter view showing motor placement and belt routing`
- `pure side view showing the reach silhouette and joint stack clearly`
- `close-up on the wrist and end effector showing the mechanism clearly`

## Mode Swaps

### Honest Hero Render

Add phrases like:

- `clean premium studio product render`
- `show the final artifact clearly`
- `physically buildable and mechanically honest`
- `visible part boundaries and serviceable architecture`

### Builder-First Mechanical Render

Add phrases like:

- `emphasizing how it would actually be built`
- `clear visibility of interfaces, seams, and subsystem boundaries`
- `serious prototype, not a polished consumer shell`

### Mild Exploded Assembly Render

Add phrases like:

- `major modules separated by small clean gaps`
- `reveal the build logic without chaotic disassembly`
- `no tiny floating fragments, no labels, no arrows`

### Workshop Prototype Realism

Add phrases like:

- `realistic workshop photo`
- `visible print lines and honest surface texture`
- `believable but uncluttered engineering bench background`
