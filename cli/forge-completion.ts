#!/usr/bin/env node

import { readdirSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';

export type CompletionValueKind =
  | 'directory'
  | 'path'
  | 'renderable'
  | 'notebook'
  | 'forge-script'
  | 'sketch-script'
  | 'png'
  | 'gif'
  | 'mp4'
  | 'pdf'
  | 'svg';

export type CompletionItem = {
  value: string;
  description?: string;
};

export type CompletionOptionDefinition = {
  name: string;
  description: string;
  argument?: 'none' | 'required' | 'optional';
  valueLabel?: string;
  repeatable?: boolean;
  values?: CompletionItem[];
  valueKind?: CompletionValueKind;
  valueMode?: 'single' | 'csv';
};

export type CompletionPositionalDefinition = {
  description: string;
  repeatable?: boolean;
  values?: CompletionItem[];
  valueKind?: CompletionValueKind;
};

export type CommandCompletionDefinition = {
  options?: CompletionOptionDefinition[];
  positionals?: CompletionPositionalDefinition[];
};

export interface CompletionAwareCommandDefinition {
  path: string[];
  summary: string;
  hidden?: boolean;
  completion?: CommandCompletionDefinition;
}

type CompletionShell = 'bash' | 'zsh' | 'fish';

type CommandTreeNode = {
  segment: string | null;
  command?: CompletionAwareCommandDefinition;
  children: Map<string, CommandTreeNode>;
};

type PathCompletionRule = {
  allowFiles: boolean;
  allowDirectories: boolean;
  fileExtensions?: string[];
  fileDescription: string;
};

const HELP_FLAGS: CompletionOptionDefinition[] = [
  { name: '--help', description: 'Show help' },
  { name: '-h', description: 'Show help' },
];

const ROOT_FLAGS: CompletionOptionDefinition[] = [
  ...HELP_FLAGS,
  { name: '--version', description: 'Print version' },
  { name: '-v', description: 'Print version' },
];

const PATH_RULES: Record<CompletionValueKind, PathCompletionRule> = {
  directory: { allowFiles: false, allowDirectories: true, fileDescription: 'directory' },
  path: { allowFiles: true, allowDirectories: true, fileDescription: 'path' },
  renderable: {
    allowFiles: true,
    allowDirectories: true,
    fileExtensions: ['.forge.js', '.forge-notebook.json'],
    fileDescription: 'ForgeCAD input',
  },
  notebook: {
    allowFiles: true,
    allowDirectories: true,
    fileExtensions: ['.forge-notebook.json'],
    fileDescription: 'notebook',
  },
  'forge-script': {
    allowFiles: true,
    allowDirectories: true,
    fileExtensions: ['.forge.js'],
    fileDescription: 'Forge script',
  },
  'sketch-script': {
    allowFiles: true,
    allowDirectories: true,
    fileExtensions: ['.forge.js'],
    fileDescription: 'Sketch script',
  },
  png: {
    allowFiles: true,
    allowDirectories: true,
    fileExtensions: ['.png'],
    fileDescription: 'PNG image',
  },
  gif: {
    allowFiles: true,
    allowDirectories: true,
    fileExtensions: ['.gif'],
    fileDescription: 'GIF animation',
  },
  mp4: {
    allowFiles: true,
    allowDirectories: true,
    fileExtensions: ['.mp4'],
    fileDescription: 'MP4 video',
  },
  pdf: {
    allowFiles: true,
    allowDirectories: true,
    fileExtensions: ['.pdf'],
    fileDescription: 'PDF report',
  },
  svg: {
    allowFiles: true,
    allowDirectories: true,
    fileExtensions: ['.svg'],
    fileDescription: 'SVG file',
  },
};

function completionUsage(): string {
  return `ForgeCAD shell completion

Usage:
  forgecad completion <bash|zsh|fish>

Examples:
  source <(forgecad completion bash)
  source <(forgecad completion zsh)
  forgecad completion fish > ~/.config/fish/completions/forgecad.fish`;
}

function parseShell(value: string | undefined): CompletionShell {
  if (value === 'bash' || value === 'zsh' || value === 'fish') return value;
  throw new Error(`Unsupported shell "${value ?? 'missing'}". Expected bash, zsh, or fish.`);
}

function buildCommandTree(commands: CompletionAwareCommandDefinition[]): CommandTreeNode {
  const root: CommandTreeNode = { segment: null, children: new Map() };
  for (const command of commands) {
    let node = root;
    for (const segment of command.path) {
      let child = node.children.get(segment);
      if (!child) {
        child = { segment, children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.command = command;
  }
  return root;
}

function hasVisibleCommand(node: CommandTreeNode): boolean {
  if (node.command && !node.command.hidden) return true;
  for (const child of node.children.values()) {
    if (hasVisibleCommand(child)) return true;
  }
  return false;
}

function nodeSummary(node: CommandTreeNode): string {
  if (node.command?.summary) return node.command.summary;
  return 'Subcommands';
}

function pushUnique(target: CompletionItem[], item: CompletionItem, seen: Set<string>): void {
  if (seen.has(item.value)) return;
  seen.add(item.value);
  target.push(item);
}

function startsWithPrefix(value: string, prefix: string): boolean {
  return prefix.length === 0 || value.startsWith(prefix);
}

function normalizeOptionArgument(option: CompletionOptionDefinition): 'none' | 'required' | 'optional' {
  return option.argument ?? 'none';
}

function splitPathPrefix(raw: string): { rawDir: string; entryPrefix: string } {
  const slashIndex = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
  if (slashIndex === -1) return { rawDir: '', entryPrefix: raw };
  return {
    rawDir: raw.slice(0, slashIndex + 1),
    entryPrefix: raw.slice(slashIndex + 1),
  };
}

function expandHomePath(raw: string): string {
  if (raw === '~') return homedir();
  if (raw.startsWith('~/')) return resolve(homedir(), raw.slice(2));
  return raw;
}

function listPathSuggestions(prefix: string, kind: CompletionValueKind): CompletionItem[] {
  const rule = PATH_RULES[kind];
  const raw = prefix || '';
  const { rawDir, entryPrefix } = splitPathPrefix(raw);
  const lookupDir = rawDir.length > 0 ? expandHomePath(rawDir) : '.';
  const absoluteLookupDir = resolve(lookupDir);
  const includeHidden = entryPrefix.startsWith('.');

  try {
    const entries = readdirSync(absoluteLookupDir, { withFileTypes: true })
      .filter((entry) => includeHidden || !entry.name.startsWith('.'))
      .filter((entry) => entry.name.startsWith(entryPrefix))
      .filter((entry) => {
        if (entry.isDirectory()) return rule.allowDirectories;
        if (!rule.allowFiles) return false;
        if (!rule.fileExtensions || rule.fileExtensions.length === 0) return true;
        return rule.fileExtensions.some((extension) => entry.name.endsWith(extension));
      })
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    return entries.map((entry) => ({
      value: `${rawDir}${entry.name}${entry.isDirectory() ? '/' : ''}`,
      description: entry.isDirectory() ? 'directory' : rule.fileDescription,
    }));
  } catch {
    return [];
  }
}

function completeCsvValues(prefix: string, values: CompletionItem[]): CompletionItem[] {
  const lastComma = prefix.lastIndexOf(',');
  const head = lastComma === -1 ? '' : prefix.slice(0, lastComma + 1);
  const tail = lastComma === -1 ? prefix : prefix.slice(lastComma + 1);
  const used = new Set(
    head
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );

  return values
    .filter((item) => !used.has(item.value))
    .filter((item) => startsWithPrefix(item.value, tail))
    .map((item) => ({
      value: `${head}${item.value}`,
      description: item.description,
    }));
}

function completeValue(
  prefix: string,
  source: Pick<CompletionOptionDefinition | CompletionPositionalDefinition, 'values' | 'valueKind'> & { valueMode?: 'single' | 'csv' },
): CompletionItem[] {
  if (source.values && source.values.length > 0) {
    if (source.valueMode === 'csv') {
      return completeCsvValues(prefix, source.values);
    }
    return source.values.filter((item) => startsWithPrefix(item.value, prefix));
  }
  if (source.valueKind) {
    return listPathSuggestions(prefix, source.valueKind);
  }
  return [];
}

function collectChildSuggestions(node: CommandTreeNode, prefix: string): CompletionItem[] {
  const items: CompletionItem[] = [];
  for (const child of node.children.values()) {
    if (!hasVisibleCommand(child)) continue;
    if (!child.segment || !startsWithPrefix(child.segment, prefix)) continue;
    items.push({
      value: child.segment,
      description: nodeSummary(child),
    });
  }
  return items;
}

function lookupOption(options: CompletionOptionDefinition[] | undefined, token: string): CompletionOptionDefinition | null {
  return options?.find((option) => option.name === token) || null;
}

function parseCompletedArguments(
  args: string[],
  options: CompletionOptionDefinition[] | undefined,
): { usedOptions: Set<string>; positionalCount: number } {
  const usedOptions = new Set<string>();
  let positionalCount = 0;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const option = lookupOption(options, token);
    if (option) {
      usedOptions.add(option.name);
      const argumentMode = normalizeOptionArgument(option);
      if (argumentMode === 'required') {
        index += 1;
      } else if (argumentMode === 'optional') {
        const next = args[index + 1];
        if (next && !next.startsWith('-')) {
          index += 1;
        }
      }
      continue;
    }

    if (!token.startsWith('-')) {
      positionalCount += 1;
    }
  }

  return { usedOptions, positionalCount };
}

function pendingOptionValue(
  args: string[],
  options: CompletionOptionDefinition[] | undefined,
  current: string,
): CompletionOptionDefinition | null {
  if (args.length === 0) return null;
  const option = lookupOption(options, args[args.length - 1]);
  if (!option) return null;
  const argumentMode = normalizeOptionArgument(option);
  if (argumentMode === 'required') return option;
  if (argumentMode === 'optional' && !current.startsWith('-')) return option;
  return null;
}

function collectOptionSuggestions(
  current: string,
  completedArgs: string[],
  options: CompletionOptionDefinition[] | undefined,
): CompletionItem[] {
  if (!options || options.length === 0) return [];
  const { usedOptions } = parseCompletedArguments(completedArgs, options);
  return options
    .filter((option) => option.repeatable || !usedOptions.has(option.name))
    .filter((option) => current.length === 0 || option.name.startsWith(current))
    .map((option) => ({
      value: option.name,
      description: option.description,
    }));
}

function positionalForIndex(
  positionals: CompletionPositionalDefinition[] | undefined,
  index: number,
): CompletionPositionalDefinition | null {
  if (!positionals || positionals.length === 0) return null;
  if (index < positionals.length) return positionals[index];
  const last = positionals[positionals.length - 1];
  return last.repeatable ? last : null;
}

function resolveActiveNode(root: CommandTreeNode, completedTokens: string[]): { node: CommandTreeNode; remainingArgs: string[] } {
  let node = root;
  let consumed = 0;

  while (consumed < completedTokens.length) {
    const token = completedTokens[consumed];
    if (token.startsWith('-')) break;
    const next = node.children.get(token);
    if (!next) break;
    node = next;
    consumed += 1;
  }

  return {
    node,
    remainingArgs: completedTokens.slice(consumed),
  };
}

function completeHelpPath(root: CommandTreeNode, completedTokens: string[], current: string): CompletionItem[] {
  const { node, remainingArgs } = resolveActiveNode(root, completedTokens);
  if (remainingArgs.length > 0) return [];
  return collectChildSuggestions(node, current);
}

function collectCommandSuggestions(
  root: CommandTreeNode,
  node: CommandTreeNode,
  remainingCompletedArgs: string[],
  current: string,
): CompletionItem[] {
  const results: CompletionItem[] = [];
  const seen = new Set<string>();
  const baseOptions = node === root ? ROOT_FLAGS : [...HELP_FLAGS, ...(node.command?.completion?.options ?? [])];
  const pendingOption = pendingOptionValue(remainingCompletedArgs, baseOptions, current);

  if (pendingOption) {
    const valueItems = completeValue(current, pendingOption);
    for (const item of valueItems) {
      pushUnique(results, item, seen);
    }
    return results;
  }

  if (node === root && remainingCompletedArgs.length === 0) {
    if (startsWithPrefix('help', current)) {
      pushUnique(results, { value: 'help', description: 'Show help for ForgeCAD or a subcommand' }, seen);
    }
    for (const item of collectChildSuggestions(root, current)) {
      pushUnique(results, item, seen);
    }
    if (current.length === 0 || current.startsWith('-')) {
      for (const item of collectOptionSuggestions(current, remainingCompletedArgs, ROOT_FLAGS)) {
        pushUnique(results, item, seen);
      }
    }
    return results;
  }

  const completion = node.command?.completion;
  if (remainingCompletedArgs.length === 0) {
    for (const item of collectChildSuggestions(node, current)) {
      pushUnique(results, item, seen);
    }
  }

  if ((current.length === 0 || current.startsWith('-')) && baseOptions.length > 0) {
    for (const item of collectOptionSuggestions(current, remainingCompletedArgs, baseOptions)) {
      pushUnique(results, item, seen);
    }
  }

  if (completion) {
    const { positionalCount } = parseCompletedArguments(remainingCompletedArgs, baseOptions);
    const positional = positionalForIndex(completion.positionals, positionalCount);
    if (positional && !current.startsWith('-')) {
      for (const item of completeValue(current, positional)) {
        pushUnique(results, item, seen);
      }
    }
  }

  return results;
}

function formatCompletionItem(item: CompletionItem): string {
  return item.description ? `${item.value}\t${item.description}` : item.value;
}

function completeLine(argv: string[], commands: CompletionAwareCommandDefinition[]): CompletionItem[] {
  const root = buildCommandTree(commands);
  const words = argv.length === 0 ? [''] : argv;
  const current = words[words.length - 1] ?? '';
  const completedTokens = words.slice(0, -1);

  if (completedTokens[0] === 'help') {
    return completeHelpPath(root, completedTokens.slice(1), current);
  }

  const { node, remainingArgs } = resolveActiveNode(root, completedTokens);
  return collectCommandSuggestions(root, node, remainingArgs, current);
}

function bashCompletionScript(): string {
  return `# bash completion for forgecad
_forgecad_completion() {
  local -a words=()
  local i
  for ((i = 1; i < \${#COMP_WORDS[@]}; i += 1)); do
    words+=("\${COMP_WORDS[i]}")
  done

  local output
  if ! output="$(forgecad __complete bash -- "\${words[@]}" 2>/dev/null)"; then
    return 0
  fi

  COMPREPLY=()
  local line value
  local needs_nospace=0
  while IFS=$'\\t' read -r value _; do
    [[ -z "$value" ]] && continue
    COMPREPLY+=("$value")
    [[ "$value" == */ ]] && needs_nospace=1
  done <<< "$output"

  if declare -F compopt >/dev/null 2>&1; then
    if [[ $needs_nospace -eq 1 ]]; then
      compopt -o nospace 2>/dev/null
    fi
    compopt -o nosort 2>/dev/null
  fi
}

complete -F _forgecad_completion forgecad`;
}

function zshCompletionScript(): string {
  return `#compdef forgecad

_forgecad() {
  local -a args values descriptions
  local line value description
  args=("\${words[@]:1}")

  while IFS=$'\\t' read -r value description; do
    [[ -z "$value" ]] && continue
    values+=("$value")
    descriptions+=("$description")
  done < <(forgecad __complete zsh -- "\${args[@]}" 2>/dev/null)

  if (( \${#values[@]} == 0 )); then
    return 1
  fi

  compadd -Q -d descriptions -- "\${values[@]}"
}

compdef _forgecad forgecad`;
}

function fishCompletionScript(): string {
  return `function __fish_forgecad_complete
    set -l tokens (commandline -opc)
    set -e tokens[1]
    forgecad __complete fish -- $tokens (commandline -ct) 2>/dev/null
end

complete -c forgecad -f -a '(__fish_forgecad_complete)'`;
}

function renderCompletionScript(shell: CompletionShell): string {
  if (shell === 'bash') return bashCompletionScript();
  if (shell === 'zsh') return zshCompletionScript();
  return fishCompletionScript();
}

export function runCompletionCli(argv: string[] = process.argv.slice(2)): void {
  if (argv.length === 0) {
    console.log(completionUsage());
    return;
  }

  const shell = parseShell(argv[0]);
  console.log(renderCompletionScript(shell));
}

export function runHiddenCompletionCli(argv: string[], commands: CompletionAwareCommandDefinition[]): void {
  const shell = parseShell(argv[0]);
  void shell;

  const separatorIndex = argv.indexOf('--');
  const words = separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : argv.slice(1);
  const suggestions = completeLine(words, commands);
  process.stdout.write(suggestions.map(formatCompletionItem).join('\n'));
}
