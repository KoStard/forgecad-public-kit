/**
 * Backend-agnostic 2D profile representation.
 * Manifold backend: wraps CrossSection.
 * OCCT backend: could wrap TopoDS_Wire/Face (future).
 *
 * Code outside `backends/` should treat this as opaque.
 * Code that needs CrossSection-specific APIs should import and cast
 * through `backends/manifold/profileCast.ts`.
 */
export type ProfileBackend = unknown;
