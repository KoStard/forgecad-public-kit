Underneath ForgeCAD currently uses Manifold for browser-time geometry work.

Implementation note:
- Manifold is Y-up internally
- ForgeCAD is Z-up externally

If a kernel-facing operation behaves as if axes are swapped, check whether a Manifold call is still assuming Y-up semantics.
