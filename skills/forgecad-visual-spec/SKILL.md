---
name: forgecad-visual-spec
description: Turn a concrete ForgeCAD artifact, build brief, HLD, or existing model into builder-honest image prompts for AI image models. Use when the user wants visual-spec renders that show the final product while keeping mechanisms, seams, hardware, and build cues visible instead of drifting into concept art.
forgecad-public: true
---

# ForgeCAD Visual Spec

Use this skill after the artifact is already concrete enough to visualize.

Good triggers:

- a specific `.forge.js` model or project folder
- a build brief or HLD that already defines the object
- a request like "write image prompts for this model"
- a request to show the final product without hiding how it is built

Do not use this skill for a vague artifact brief. If the object is still underspecified, use `forgecad-prepare-prompt` first.

## Core Rule

These prompts are not concept art prompts. They are visual-spec prompts.

The image should:

- show the final artifact clearly
- preserve build truth and subsystem truth
- keep visible the seams, modules, hardware, and mechanical hierarchy that matter

The image should not:

- smooth away the mechanism into a fake consumer shell
- invent flashy sci-fi styling that hides how it works
- pretend to be a CAD drawing, dimensioned blueprint, or engineering diagram

## Default Strategy

Default to one `honest hero render`.

That is the best first image for most ForgeCAD artifacts because it balances:

- final-product readability
- mechanical honesty
- visual appeal

Only add more prompts if the user wants them. The most useful support prompts are:

- `builder-first mechanical render`
- `mild exploded assembly render`
- `workshop prototype realism`
- `gripper / end-effector close-up`

Prefer separate images over one collage. Multi-view boards are acceptable, but single-purpose images are usually more reliable.

## Workflow

1. Gather artifact truth.
   Read only the minimum context needed:
   - top-level `.forge.js` entry
   - key helper/module file if the entry delegates the geometry
   - build brief / HLD if they exist

2. Extract the truths that must survive the image model.
   Capture:
   - artifact type and scale
   - major subassemblies
   - actuation style
   - visible mechanisms
   - material cues
   - color cues if already established
   - what must stay visible for build understanding

3. Choose the representation mode.
   Default: `honest hero render`
   Switch only if the user explicitly wants a support view or image pack.

4. Write the prompt in blocks.
   Use the template in `references/prompt-template.md`.
   Keep the wording concrete and artifact-specific.

5. Add negative constraints inline.
   Tell the model what to avoid, especially:
   - hidden mechanics
   - fake sleek shelling
   - over-smoothed geometry
   - unreadable clutter
   - text, labels, or dimension arrows unless explicitly requested

6. Return the prompt pack.
   If the user asked for "a prompt", return one prompt.
   If the user asked to compare approaches, return 2-4 prompts with clearly different jobs.

## Prompt Writing Rules

- Use real artifact language: base, turntable, shoulder, rails, bearings, gripper, belt, pulley, shaft.
- Prefer visible subsystem truth over poetic adjectives.
- Keep exact dimensions out unless they matter visually and are already known.
- If a detail is uncertain, stay honest at the subsystem level instead of inventing internals.
- Ask for "physically buildable", "mechanically honest", and "visible part boundaries" when that is central.
- For robots and mechanisms, mention motors, belts, pulleys, shafts, guide rods, fasteners, or service covers only if they are genuinely part of the artifact.
- Avoid long style dumps. A short strong prompt beats a bloated one.

## Mode Guide

### Honest Hero Render

Use by default.

Best when the user wants one image that shows the final object clearly while still reading as something that could actually be built.

### Builder-First Mechanical Render

Use when the user wants the image to teach the build more directly.

Bias harder toward interfaces, seams, mounted actuators, and subsystem boundaries.

### Mild Exploded Assembly Render

Use when the user wants assembly logic or modular breakdown.

Keep the explosion restrained. Separate only major modules, not every screw.

### Workshop Prototype Realism

Use when the user wants the artifact to feel like a real first prototype rather than a clean studio render.

Bias toward print texture, honest materials, and believable workshop context.

## Output Contract

When using this skill, the answer should usually contain:

1. one sentence interpreting the artifact
2. one primary prompt, usually the `honest hero render`
3. optional support prompts only if useful
4. a short note on which prompt to try first

Do not bury the prompts under theory.
