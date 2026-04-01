import { execSync } from 'child_process';

const PROD_BASE = 'https://kostard.github.io/ForgeCAD/';

/** Extract gist ID from a full GitHub Gist URL, or return the input as-is if it's already an ID. */
function extractGistId(input: string): string {
  const match = input.match(/gist\.github\.com\/(?:[^/]+\/)?([a-f0-9]+)/i);
  if (match) return match[1];
  return input;
}

export async function runLinkCli(args: string[]): Promise<void> {
  const input = args[0];
  if (!input) {
    console.error('Usage: forgecad link <gist-url-or-id>');
    process.exit(1);
  }

  const gistId = extractGistId(input);
  const url = `${PROD_BASE}?gist=${encodeURIComponent(gistId)}`;

  try {
    execSync('printf %s "$URL" | pbcopy', { env: { ...process.env, URL: url }, stdio: 'ignore' });
    console.log(`Copied to clipboard:\n${url}`);
  } catch {
    console.log(url);
  }
}
