/**
 * Type-cast helpers between the opaque ProfileBackend and Manifold's CrossSection.
 *
 * These are intentionally thin — they exist to make the manifold-3d dependency
 * explicit and easy to grep for.  Only files inside `backends/manifold/` (and
 * files that knowingly work with the Manifold backend) should use them.
 */
import type { CrossSection } from 'manifold-3d';
import type { ProfileBackend } from '../../profileBackend';

/** Unwrap a ProfileBackend to a Manifold CrossSection. */
export function asCrossSection(profile: ProfileBackend): CrossSection {
  return profile as CrossSection;
}

/** Wrap a Manifold CrossSection as an opaque ProfileBackend. */
export function fromCrossSection(cs: CrossSection): ProfileBackend {
  return cs as ProfileBackend;
}
