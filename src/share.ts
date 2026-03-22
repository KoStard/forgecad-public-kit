import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string';

const SHARED_PREFIX = 'code/';
const BUNDLE_PREFIX = 'bundle/';

export interface SharedModel {
  filename: string;
  code: string;
}

/** A multi-file bundle: an entry file plus all its dependencies. */
export interface SharedBundle {
  /** The entry filename to open/run. */
  entry: string;
  /** All files in the bundle (filename → code), including the entry file. */
  files: Record<string, string>;
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

// ---------------------------------------------------------------------------
// Multi-file bundle encoding / decoding
// Format: #bundle/<compressed-packed>
// Packed format: entry\0filename1\0code1\0filename2\0code2...
// Uses \0 (null byte) as separator — more compact than JSON after compression.
// ---------------------------------------------------------------------------

/** Encode a multi-file bundle into a shareable URL hash fragment. */
export function encodeSharedBundle(bundle: SharedBundle): string {
  const parts = [bundle.entry];
  for (const [name, code] of Object.entries(bundle.files)) {
    parts.push(name, code);
  }
  const packed = parts.join('\0');
  const compressed = compressToEncodedURIComponent(packed);
  return `#${BUNDLE_PREFIX}${compressed}`;
}

/** Try to decode a multi-file bundle from the current URL hash. Returns null if not a bundle link. */
export function decodeSharedBundle(hash: string): SharedBundle | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw.startsWith(BUNDLE_PREFIX)) return null;

  const compressed = raw.slice(BUNDLE_PREFIX.length);
  const packed = decompressFromEncodedURIComponent(compressed);
  if (!packed) return null;

  const parts = packed.split('\0');
  if (parts.length < 3 || parts.length % 2 === 0) return null; // need entry + N*(name,code) pairs

  const entry = parts[0];
  const files: Record<string, string> = {};
  for (let i = 1; i < parts.length; i += 2) {
    files[parts[i]] = parts[i + 1];
  }

  if (!files[entry]) return null; // entry must be in the bundle
  return { entry, files };
}

/** Build a full shareable URL for a multi-file bundle. */
export function buildBundleShareUrl(bundle: SharedBundle): string {
  return `${PROD_BASE}${encodeSharedBundle(bundle)}`;
}

/** Build an embed URL for a multi-file bundle. */
export function buildBundleEmbedUrl(bundle: SharedBundle): string {
  return `${PROD_BASE}?embed=1${encodeSharedBundle(bundle)}`;
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
