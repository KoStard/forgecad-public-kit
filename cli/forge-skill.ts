import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { resolvePackagePath } from './package-runtime';

export async function runSkillInstallCli(_argv: string[] = []): Promise<void> {
  const src = resolvePackagePath(import.meta.url, 'dist-skill', 'SKILL.md');

  if (!existsSync(src)) {
    throw new Error(
      `Built skill file not found at ${src}.\n` +
        `If you are running from a source checkout, run: npm run build:skill:forgecad`,
    );
  }

  const destDir = join(homedir(), '.agents', 'skills', 'forgecad');
  const dest = join(destDir, 'SKILL.md');

  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, dest);

  console.log(`ForgeCAD skill installed to ${dest}`);
  console.log(`Reload Claude Code to activate.`);
}
