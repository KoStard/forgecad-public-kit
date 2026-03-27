import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import { resolvePackagePath } from './package-runtime';

export async function runSkillInstallCli(_argv: string[] = []): Promise<void> {
  const srcSkill = resolvePackagePath(import.meta.url, 'dist-skill', 'SKILL.md');
  const srcDocs = resolvePackagePath(import.meta.url, 'dist-skill', 'docs');

  if (!existsSync(srcSkill)) {
    throw new Error(
      `Built skill file not found at ${srcSkill}.\n` + `If you are running from a source checkout, run: npm run build:skill:forgecad`,
    );
  }

  const destDir = join(homedir(), '.agents', 'skills', 'forgecad');
  const dest = join(destDir, 'SKILL.md');

  mkdirSync(destDir, { recursive: true });

  const skillContent = readFileSync(srcSkill, 'utf-8').replaceAll('{{SKILL_DIR}}', destDir);
  writeFileSync(dest, skillContent);

  if (existsSync(srcDocs)) {
    cpSync(srcDocs, join(destDir, 'docs'), { recursive: true });
  }

  console.log(`ForgeCAD skill installed to ${dest}`);
  console.log(`Reload your agent (Claude Code, Codex, OpenCode, …) to activate.`);
}

export async function runSkillOneFileCli(argv: string[] = []): Promise<void> {
  const outputArg = argv.find((a) => !a.startsWith('-'));
  if (!outputArg) {
    throw new Error(`Usage: forgecad skill one-file <output-path>\n` + `Example: forgecad skill one-file ~/Desktop/forgecad-context.md`);
  }

  const src = resolvePackagePath(import.meta.url, 'dist-skill', 'CONTEXT.md');
  if (!existsSync(src)) {
    throw new Error(
      `Built context file not found at ${src}.\n` + `If you are running from a source checkout, run: npm run build:skill:forgecad`,
    );
  }

  const dest = resolve(outputArg);
  writeFileSync(dest, readFileSync(src));
  console.log(`ForgeCAD context written to ${dest}`);
  console.log(`Paste the contents into any AI chat UI (Claude.ai, ChatGPT, Gemini, …) to get full ForgeCAD API knowledge.`);
}
