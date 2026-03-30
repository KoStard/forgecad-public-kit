/**
 * Mobile device detection for ForgeCAD.
 *
 * Heuristic: touch-capable + narrow screen.
 * Override with ?mobile=1 or ?desktop=1 query params.
 */

function getQueryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function detectMobile(): boolean {
  // Query-param overrides (for testing)
  if (getQueryParam('mobile') === '1') return true;
  if (getQueryParam('desktop') === '1') return false;

  // Vertical layout is an explicit desktop feature (portrait recording on laptop).
  // Don't enter mobile mode when the user deliberately chose it.
  try {
    if (localStorage.getItem('ff-verticalLayout') === '1') return false;
  } catch {
    /* */
  }

  const hasTouch = navigator.maxTouchPoints > 0;
  const isNarrow = window.innerWidth < 768;
  return hasTouch && isNarrow;
}

/** Cached at module load — screen class doesn't change mid-session. */
export const isMobile = detectMobile();
