#!/usr/bin/env node

import { readFileSync } from 'fs';
import { basename } from 'path';
import { runCheckApiContractsCli } from './check-api-contracts';
import { runCheckBrepExportCli } from './check-brep-export';
import { runCheckCompilerCli } from './check-compiler';
import { runCheckExamplesCli } from './check-examples';
import { runCheckQueryPropagationCli } from './check-query-propagation';
import { runCheckSuiteCli } from './check-suite';
import { runCheckDimensionsCli } from './check-dimensions';
import { runCheckJsModulesCli } from './check-js-modules';
import { runCheckPlacementReferencesCli } from './check-placement-references';
import { runCheckTransformsCli } from './check-transforms';
import { runDebugCompilerCli } from './debug-compiler';
import { runCaptureCli } from './forge-capture';
import { runNotebookCli } from './forge-notebook';
import { runReportCli } from './forge-report';
import { runRenderCli } from './forge-render.mjs';
import { runSdfCli } from './forge-sdf';
import { runStudioCli } from './forge-studio';
import { runSvgCli } from './forge-svg';
import { runBrepCli } from './forge-brep';
import { isDirectCliRun, resolvePackagePath } from './package-runtime';
import { runParamCheckCli } from './param-check';
import { runScriptCli } from './test-run';
import { runDebugDimensionsCli } from './debug-dimensions';

type CommandDefinition = {
  group: 'Studio' | 'Modeling' | 'Export' | 'Checks' | 'Debug';
  path: string[];
  summary: string;
  usage: string[];
  examples: string[];
  run: (args: string[]) => Promise<void>;
};

const commands: CommandDefinition[] = [
  {
    group: 'Studio',
    path: ['studio'],
    summary: 'Launch the browser studio against examples, a project folder, or a blank workspace.',
    usage: [
      'forgecad studio',
      'forgecad studio <project-path>',
      'forgecad studio --blank',
    ],
    examples: [
      'forgecad studio',
      'forgecad studio ~/cad/gearbox',
      'forgecad studio --blank --port 4173',
    ],
    run: runStudioCli,
  },
  {
    group: 'Studio',
    path: ['open'],
    summary: 'Alias for `forgecad studio`.',
    usage: ['forgecad open [project-path]'],
    examples: ['forgecad open ~/cad/gearbox'],
    run: runStudioCli,
  },
  {
    group: 'Modeling',
    path: ['run'],
    summary: 'Execute a Forge script or notebook preview with the real runtime and print geometry diagnostics.',
    usage: ['forgecad run <script.forge.js|notebook.forge-notebook.json> [--debug-imports]'],
    examples: [
      'forgecad run examples/cup.forge.js',
      'forgecad run examples/api/notebook-iteration.forge-notebook.json',
      'forgecad run examples/cup.forge.js --debug-imports',
    ],
    run: runScriptCli,
  },
  {
    group: 'Modeling',
    path: ['notebook'],
    summary: 'Append, execute, inspect, and export `.forge-notebook.json` files.',
    usage: [
      'forgecad notebook <notebook.forge-notebook.json>',
      'forgecad notebook <notebook.forge-notebook.json> --code "show(box(40, 20, 10));"',
      'forgecad notebook append <notebook.forge-notebook.json> --file /tmp/cell.js',
      'forgecad notebook run <notebook.forge-notebook.json> [cell-id]',
      'forgecad notebook view <notebook.forge-notebook.json> [cell-number|cell-id|preview]',
      'forgecad notebook export <notebook.forge-notebook.json> [output.forge.js]',
    ],
    examples: [
      'forgecad notebook examples/demo.forge-notebook.json --code "show(box(40, 20, 10));"',
      'forgecad notebook view examples/api/notebook-iteration.forge-notebook.json preview',
      'cat /tmp/cell.js | forgecad notebook examples/demo.forge-notebook.json',
      'forgecad notebook export examples/demo.forge-notebook.json out/demo.forge.js',
    ],
    run: runNotebookCli,
  },
  {
    group: 'Modeling',
    path: ['render'],
    summary: 'Render a Forge scene or notebook preview to PNG using the real viewport renderer.',
    usage: ['forgecad render <script.forge.js|notebook.forge-notebook.json> [output.png] [options]'],
    examples: [
      'forgecad render examples/cup.forge.js',
      'forgecad render examples/api/notebook-iteration.forge-notebook.json',
      'forgecad render examples/cup.forge.js out/scene.png --angles iso',
    ],
    run: runRenderCli,
  },
  {
    group: 'Modeling',
    path: ['capture', 'gif'],
    summary: 'Capture an animated GIF from a script or notebook preview via orbit or jointsView playback.',
    usage: ['forgecad capture gif <script.forge.js|notebook.forge-notebook.json> [output.gif] [options]'],
    examples: [
      'forgecad capture gif examples/cup.forge.js',
      'forgecad capture gif examples/api/notebook-assembly-debug.forge-notebook.json --list',
      'forgecad capture gif examples/3d-printer.forge.js out/section.gif --cut-plane "Front Section"',
    ],
    run: (args) => runCaptureCli({ command: 'forgecad capture gif', defaultFormat: 'gif' }, args),
  },
  {
    group: 'Modeling',
    path: ['capture', 'mp4'],
    summary: 'Capture an MP4 from a script or notebook preview via orbit or jointsView playback.',
    usage: ['forgecad capture mp4 <script.forge.js|notebook.forge-notebook.json> [output.mp4] [options]'],
    examples: [
      'forgecad capture mp4 examples/cup.forge.js',
      'forgecad capture mp4 examples/api/runtime-joints-view.forge.js out/step.mp4 --capture animation --animation Step',
    ],
    run: (args) => runCaptureCli({ command: 'forgecad capture mp4', defaultFormat: 'mp4' }, args),
  },
  {
    group: 'Export',
    path: ['export', 'svg'],
    summary: 'Export a `.sketch.js` file to SVG.',
    usage: ['forgecad export svg <script.sketch.js> [output.svg]'],
    examples: [
      'forgecad export svg examples/frame.sketch.js',
      'forgecad export svg examples/frame.sketch.js out/frame.svg',
    ],
    run: runSvgCli,
  },
  {
    group: 'Export',
    path: ['export', 'step'],
    summary: 'Export the exact STEP subset, with optional faceted fallback for closed mesh solids.',
    usage: [
      'forgecad export step <script.forge.js> [--output path] [--python path] [--uv path] [--allow-faceted]',
    ],
    examples: [
      'forgecad export step examples/api/brep-exportable.forge.js',
      'forgecad export step examples/chess-set.forge.js --allow-faceted',
    ],
    run: (args) => runBrepCli(['--format', 'step', ...args]),
  },
  {
    group: 'Export',
    path: ['export', 'brep'],
    summary: 'Export the exact BREP subset, with optional faceted fallback for closed mesh solids.',
    usage: [
      'forgecad export brep <script.forge.js> [--output path] [--python path] [--uv path] [--allow-faceted]',
    ],
    examples: [
      'forgecad export brep examples/api/brep-exportable.forge.js',
      'forgecad export brep examples/chess-set.forge.js --allow-faceted',
    ],
    run: (args) => runBrepCli(['--format', 'brep', ...args]),
  },
  {
    group: 'Export',
    path: ['export', 'sdf'],
    summary: 'Export a robot assembly as a Gazebo-ready SDF package.',
    usage: ['forgecad export sdf <script.forge.js> [--output dir]'],
    examples: [
      'forgecad export sdf examples/api/sdf-rover-demo.forge.js',
      'forgecad export sdf examples/api/sdf-rover-demo.forge.js --output out/forge_scout',
    ],
    run: runSdfCli,
  },
  {
    group: 'Export',
    path: ['export', 'report'],
    summary: 'Generate a multi-view PDF report with BOM and dimensions.',
    usage: ['forgecad export report <script.forge.js> [output.pdf] [--dim-angle-tol <deg>]'],
    examples: [
      'forgecad export report examples/cup.forge.js',
      'forgecad export report examples/cup.forge.js out/cup.pdf --dim-angle-tol 18',
    ],
    run: runReportCli,
  },
  {
    group: 'Checks',
    path: ['check', 'params'],
    summary: 'Sweep parameter ranges and report runtime failures, degeneracy, and new collisions.',
    usage: ['forgecad check params <script.forge.js> [--samples N]'],
    examples: [
      'forgecad check params examples/shoe-rack-doors.forge.js',
      'forgecad check params path/to/model.forge.js --samples 12',
    ],
    run: runParamCheckCli,
  },
  {
    group: 'Checks',
    path: ['check', 'suite'],
    summary: 'Run the repo invariant suite, including compiler snapshots and export/runtime contract checks.',
    usage: ['forgecad check suite'],
    examples: ['forgecad check suite'],
    run: () => runCheckSuiteCli(),
  },
  {
    group: 'Checks',
    path: ['check', 'transforms'],
    summary: 'Run transform and assembly invariants.',
    usage: ['forgecad check transforms'],
    examples: ['forgecad check transforms'],
    run: () => runCheckTransformsCli(),
  },
  {
    group: 'Checks',
    path: ['check', 'dimensions'],
    summary: 'Run dimension propagation invariants.',
    usage: ['forgecad check dimensions'],
    examples: ['forgecad check dimensions'],
    run: () => runCheckDimensionsCli(),
  },
  {
    group: 'Checks',
    path: ['check', 'placement'],
    summary: 'Run placement reference invariants.',
    usage: ['forgecad check placement'],
    examples: ['forgecad check placement'],
    run: () => runCheckPlacementReferencesCli(),
  },
  {
    group: 'Checks',
    path: ['check', 'js-modules'],
    summary: 'Run JavaScript module import invariants.',
    usage: ['forgecad check js-modules'],
    examples: ['forgecad check js-modules'],
    run: () => runCheckJsModulesCli(),
  },
  {
    group: 'Checks',
    path: ['check', 'brep'],
    summary: 'Run exact BREP export invariants.',
    usage: ['forgecad check brep'],
    examples: ['forgecad check brep'],
    run: () => runCheckBrepExportCli(),
  },
  {
    group: 'Checks',
    path: ['check', 'compiler'],
    summary: 'Run compiler routing snapshots and runtime-vs-lowered invariants.',
    usage: [
      'forgecad check compiler',
      'forgecad check compiler --case segmented-runtime-hints',
      'forgecad check compiler --update',
    ],
    examples: [
      'forgecad check compiler',
      'forgecad check compiler --case example-brep-exportable',
      'forgecad check compiler --update',
    ],
    run: runCheckCompilerCli,
  },
  {
    group: 'Checks',
    path: ['check', 'query-propagation'],
    summary: 'Run focused topology-rewrite query-propagation snapshots and invariants.',
    usage: [
      'forgecad check query-propagation',
      'forgecad check query-propagation --case hull-runtime-boundary',
      'forgecad check query-propagation --update',
    ],
    examples: [
      'forgecad check query-propagation',
      'forgecad check query-propagation --case corpus-edge-finished-mount',
      'forgecad check query-propagation --update',
    ],
    run: runCheckQueryPropagationCli,
  },
  {
    group: 'Checks',
    path: ['check', 'examples'],
    summary: 'Run the example architecture gate across the checked manifest for `examples/`.',
    usage: [
      'forgecad check examples',
      'forgecad check examples --family api-parts --family compiler-corpus',
      'forgecad check examples --example examples/api/brep-exportable.forge.js',
    ],
    examples: [
      'forgecad check examples',
      'forgecad check examples --family non-part',
      'forgecad check examples --example examples/chess-set.forge.js',
    ],
    run: runCheckExamplesCli,
  },
  {
    group: 'Checks',
    path: ['check', 'api'],
    summary: 'Run script API contract invariants.',
    usage: ['forgecad check api'],
    examples: ['forgecad check api'],
    run: () => runCheckApiContractsCli(),
  },
  {
    group: 'Debug',
    path: ['debug', 'compiler'],
    summary: 'Inspect compiler routes, lowered plans, and runtime snapshots for a script.',
    usage: ['forgecad debug compiler <script.forge.js> [--compact]'],
    examples: [
      'forgecad debug compiler examples/api/brep-exportable.forge.js',
      'forgecad debug compiler examples/chess-set.forge.js --compact',
    ],
    run: runDebugCompilerCli,
  },
  {
    group: 'Debug',
    path: ['debug', 'dimensions'],
    summary: 'Inspect report-dimension routing for a script.',
    usage: ['forgecad debug dimensions <script.forge.js> [--all] [--dim-angle-tol 12]'],
    examples: [
      'forgecad debug dimensions path/to/file.forge.js',
      'forgecad debug dimensions path/to/file.forge.js --all --dim-angle-tol 18',
    ],
    run: runDebugDimensionsCli,
  },
];

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolvePackagePath(import.meta.url, 'package.json'), 'utf-8')) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function commandLabel(command: CommandDefinition): string {
  return `forgecad ${command.path.join(' ')}`;
}

function padRight(value: string, width: number): string {
  return value.length >= width ? value : `${value}${' '.repeat(width - value.length)}`;
}

function printGlobalHelp(exitCode = 0): never {
  const width = Math.max(...commands.map((command) => commandLabel(command).length));
  console.log(`ForgeCAD ${readVersion()}

Code-first parametric CAD for JavaScript/TypeScript.

Usage:
  forgecad <command> [options]

Install for plain-shell usage from a checkout:
  npm install
  npm link

Commands:`);

  for (const group of ['Studio', 'Modeling', 'Export', 'Checks', 'Debug'] as const) {
    console.log(`\n${group}`);
    commands
      .filter((command) => command.group === group)
      .forEach((command) => {
        console.log(`  ${padRight(commandLabel(command), width + 2)}${command.summary}`);
      });
  }

  console.log(`
Help:
  forgecad help
  forgecad help export step
  forgecad help notebook
  forgecad help capture gif`);
  process.exit(exitCode);
}

function printCommandHelp(command: CommandDefinition): void {
  console.log(`${commandLabel(command)}

${command.summary}

Usage:`);
  command.usage.forEach((line) => console.log(`  ${line}`));
  if (command.examples.length > 0) {
    console.log('\nExamples:');
    command.examples.forEach((line) => console.log(`  ${line}`));
  }
}

function findCommand(argv: string[]): { command: CommandDefinition; args: string[] } | null {
  const sorted = [...commands].sort((a, b) => b.path.length - a.path.length);
  for (const command of sorted) {
    const matches = command.path.every((segment, index) => argv[index] === segment);
    if (matches) {
      return {
        command,
        args: argv.slice(command.path.length),
      };
    }
  }
  return null;
}

function findCommandByPath(path: string[]): CommandDefinition | null {
  return commands.find((command) => command.path.join(' ') === path.join(' ')) || null;
}

export async function runForgeCadCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    printGlobalHelp();
  }

  if (argv[0] === '-v' || argv[0] === '--version') {
    console.log(readVersion());
    return;
  }

  if (argv[0] === 'help') {
    if (argv.length === 1) {
      printGlobalHelp();
    }
    const command = findCommandByPath(argv.slice(1));
    if (!command) {
      console.error(`Unknown command: ${argv.slice(1).join(' ')}`);
      printGlobalHelp(1);
    }
    printCommandHelp(command);
    return;
  }

  const match = findCommand(argv);
  if (!match) {
    console.error(`Unknown command: ${argv.join(' ')}`);
    printGlobalHelp(1);
  }

  if (match.args.includes('-h') || match.args.includes('--help')) {
    printCommandHelp(match.command);
    return;
  }

  await match.command.run(match.args);
}

if (isDirectCliRun(import.meta.url)) {
  runForgeCadCli().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
