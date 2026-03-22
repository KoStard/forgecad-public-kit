import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string';

const SHARED_PREFIX = 'code/';

export interface SharedModel {
  filename: string;
  code: string;
}

/** Encode a file into a shareable URL hash fragment: `#code/<filename>/<compressed>` */
export function encodeSharedModel(filename: string, code: string): string {
  const compressed = compressToEncodedURIComponent(code);
  return `#${SHARED_PREFIX}${encodeURIComponent(filename)}/${compressed}`;
}

/** Try to decode a shared model from the current URL hash. Returns null if not a share link. */
export function decodeSharedHash(hash: string): SharedModel | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw.startsWith(SHARED_PREFIX)) return null;

  const rest = raw.slice(SHARED_PREFIX.length);
  const slashIdx = rest.indexOf('/');
  if (slashIdx === -1) return null;

  const filename = decodeURIComponent(rest.slice(0, slashIdx));
  const compressed = rest.slice(slashIdx + 1);
  const code = decompressFromEncodedURIComponent(compressed);
  if (!code) return null;

  return { filename, code };
}

/** Production base URL — share links always point here, even from a local dev server. */
const PROD_BASE = 'https://kostard.github.io/ForgeCAD/';

/** Build the full shareable URL for the current page. */
export function buildShareUrl(filename: string, code: string): string {
  return `${PROD_BASE}${encodeSharedModel(filename, code)}`;
}

/** Build an embed URL (adds ?embed=1 query param). */
export function buildEmbedUrl(filename: string, code: string): string {
  return `${PROD_BASE}?embed=1${encodeSharedModel(filename, code)}`;
}

/** Build an embed URL that loads from a GitHub Gist. */
export function buildGistEmbedUrl(gistId: string): string {
  return `${PROD_BASE}?gist=${encodeURIComponent(gistId)}&embed=1`;
}

/** Build a share URL that loads from a GitHub Gist. */
export function buildGistShareUrl(gistId: string): string {
  return `${PROD_BASE}?gist=${encodeURIComponent(gistId)}`;
}

/** Build an iframe snippet for embedding. */
export function buildEmbedSnippet(embedUrl: string, width = 800, height = 500): string {
  return `<iframe src="${embedUrl}" width="${width}" height="${height}" style="border:none; border-radius:8px;" allowfullscreen></iframe>`;
}

/** Parse URL query parameters. */
export function getQueryParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

/** Check if we're in embed mode. */
export function isEmbedMode(): boolean {
  return getQueryParams().get('embed') === '1';
}

/** Get gist ID from URL if present. */
export function getGistId(): string | null {
  return getQueryParams().get('gist');
}

/** Fetch a ForgeCAD model from a GitHub Gist. Returns the first .forge.js file found. */
export async function fetchGistModel(gistId: string): Promise<SharedModel> {
  const res = await fetch(`https://api.github.com/gists/${gistId}`);
  if (!res.ok) throw new Error(`Failed to fetch gist: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const files = data.files as Record<string, { filename: string; content: string }>;

  // Prefer .forge.js, then .sketch.js (legacy), then first file
  const entries = Object.values(files);
  const forgeFile = entries.find((f) => f.filename.endsWith('.forge.js'))
    || entries.find((f) => f.filename.endsWith('.sketch.js'))
    || entries[0];

  if (!forgeFile) throw new Error('Gist contains no files');
  return { filename: forgeFile.filename, code: forgeFile.content };
}
