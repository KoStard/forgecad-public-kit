# ForgeCAD Agent Skills

This folder contains the public ForgeCAD agent skill library.

The default command:

```bash
forgecad skill install
```

installs the self-contained `forgecad` modeling skill plus the broader workflow library with namespaced skill names. To install only the core modeling skill, use:

```bash
forgecad skill install --core-only
```

These additional skills expose more of the workflow prompts Ruben uses for planning, building, inspecting, optimizing, and documenting ForgeCAD models. Clone this repository if you want to read the source prompts directly.

| Skill | Purpose |
| --- | --- |
| [forgecad](forgecad/SKILL.md) | ForgeCAD model authoring, editing, debugging, and execution guidance for .forge.js, SVG-import, assembly, and CLI workflows. |
| [forgecad-build-model](forgecad-build-model/SKILL.md) | Build or edit a manufacture-realistic `.forge.js` model in a project, then validate it with run, render, inspect, and export evidence. |
| [forgecad-design-spec](forgecad-design-spec/SKILL.md) | Create a ForgeCAD design brief, HLD, or LLD before coding by walking through use, assembly, interfaces, decisions, and verification. |
| [forgecad-grade-model](forgecad-grade-model/SKILL.md) | Grade a ForgeCAD or CAD-as-code model against a requirement, brief, prompt, reference, or acceptance criteria with evidence and a 0-10 score. |
| [forgecad-image-prompt](forgecad-image-prompt/SKILL.md) | Write builder-honest AI image prompts from a concrete ForgeCAD model, build brief, HLD, or LLD without hiding how the artifact is built. |
| [forgecad-inspect-model](forgecad-inspect-model/SKILL.md) | Select, run, and interpret ForgeCAD inspection evidence for collisions, sections, wall thickness, components, masks, depth, normals, surface continuity, and fit. |
| [forgecad-project-sync](forgecad-project-sync/SKILL.md) | Manage hosted ForgeCAD project sync from the CLI: init, clone, pull, push, file operations, members, publishing, and shares. |
| [forgecad-reconstruct-cad-file](forgecad-reconstruct-cad-file/SKILL.md) | Reconstruct a readable parametric ForgeCAD model from an existing CAD or mesh file such as STL, OBJ, 3MF, STEP, or STP. |
| [forgecad-reconstruct-from-images](forgecad-reconstruct-from-images/SKILL.md) | Reconstruct a real parametric ForgeCAD object from reference images by using images as evidence, not as a one-view facade. |
| [forgecad-verify-mujoco](forgecad-verify-mujoco/SKILL.md) | Verify a ForgeCAD MJCF export in MuJoCo with dynamics, contacts, controls, joint travel, and rendered evidence before calling it simulation-ready. |
