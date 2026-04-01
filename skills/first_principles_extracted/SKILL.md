---
name: first_principles_extracted
description: Structured complex concepts isolation and extraction process by building separate science calculation, explanation, UV python code and visualization.
---

When facing a complex challenge, one way to think about it is that we are handling multiple connected scientific concepts. Usually as the complexity increases we lose track of the individual concepts and might jump to think about the whole system as one and make wrong assumptions. To solve this, we should create a book of concepts, with a central README like this:


```
# TITLE

Overall Introduction

---

## Structure

Each chapter is a folder with a numbered prefix. They build on each other:

TOC

Each chapter contains:
- `README.md` — workshop-style explanation of the concept
- `tutorial.py` — step-by-step build-up with print output + plots
- `fun_project.py` — a satisfying application of the concept
- Sometimes a `demo.py` for comparisons

---

## Quickstart

\```bash
# Install dependencies (one time)
uv sync

# Run any file
uv run "01 - residuals/tutorial.py"
uv run "03 - newton-raphson/fun_project.py"   # Newton's fractal
uv run "09 - full-solver/fun_project.py"      # 4-bar linkage
\```

All files save their plots as PNGs in their chapter folder. No display required.

---

## Dependencies

- `numpy` — linear algebra
- `scipy` — sparse matrices, sparse solvers
- `matplotlib` — plotting

All handled by `uv sync`.

---

## Adding a New Chapter

If you want to add chapter `10 - something`:

### 1. Create the folder

\```bash
mkdir "10 - something"
\```

### 2. Write the README

Structure it as:
- **The question that started this**: one paragraph, concrete
- **The core idea**: the key insight in 3-5 lines
- **Files table**: what each file contains
- **What you'll know after**: 3-5 bullet points

### 3. Write the tutorial

Template:
\```python
"""
Chapter N - Tutorial: [Concept Name]

[One paragraph: what came before, what this adds, why it matters.]

Run: uv run "N - concept/tutorial.py"
"""

import numpy as np
import matplotlib.pyplot as plt

# PART 1: [Simplest possible example]
# ...

# PART 2: [Build up complexity]
# ...

# PART 3: [The insight that makes it click]
# ...

plt.savefig('N - concept/N_tutorial_name.png', dpi=120, bbox_inches='tight')
\```

Rules for tutorials:
- Each part has a header comment block explaining what's being demonstrated
- Print output that shows the math working (print intermediate values)
- Always save the plot — don't rely on interactive display
- Use `np.random.seed(N)` so outputs are deterministic
- Each file must be runnable standalone with `uv run`

### 4. Write the fun project

Pick something that:
- Is physically intuitive (robot arm, pendulum, camera, spring, linkage, ...)
- Uses the chapter's concept as the core tool
- Produces a result you can look at and think "oh, that makes sense"

Avoid:
- Abstract benchmark problems without visual payoff
- Problems that require more than 50 lines of setup before the interesting part
- Anything that needs a GUI or external data files

### 5. Update this README

Add the chapter to the structure table and the learning path section.

---

## File conventions

- All `.py` files are standalone runnable with `uv run`
- Plots saved as `{chapter_prefix}_{name}.png` in the chapter folder
- No file should import from a different chapter folder (self-contained)
  - Exception: `09 - full-solver/` imports from `solver.py` in its own folder
- Workshop narration style in comments: start with a concrete observation,
  build toward the abstraction, not the other way around
```

If we claim there is some error in the algorithm, it should reproduce in isolation as well.
Hence for that we can have a separate file in this structure showcasing the issue we claim exists.