#!/usr/bin/env node

import { readFileSync } from 'fs';
import { runCheckApiContractsCli } from './check-api-contracts';
import { runCheckTextCli } from './check-text';
import { runCheckBrepExportCli } from './check-brep-export';
import { runCheckCompilerCli } from './check-compiler';
import { runCheckExamplesCli } from './check-examples';
import { runCheckQueryPropagationCli } from './check-query-propagation';
import { runCheckSuiteCli } from './check-suite';
import { runCheckDimensionsCli } from './check-dimensions';
import { runCheckJsModulesCli } from './check-js-modules';
import { runCheckPlacementReferencesCli } from './check-placement-references';
import { runCheckTransformsCli } from './check-transforms';
import { runCheckConstraintsCli } from './check-constraints';
import {
  runCompletionCli,
  runHiddenCompletionCli,
  type CommandCompletionDefinition,
  type CompletionItem,
  type CompletionOptionDefinition,
} from './forge-completion';
import { runDebugCompilerCli } from './debug-compiler';
import { runDebugFaceHistoryCli } from './debug-face-history';
import { runCaptureCli } from './forge-capture';
import { runNotebookCli } from './forge-notebook';
import { runReportCli } from './forge-report';
import { runRenderCli } from './forge-render.mjs';
import { runSdfCli } from './forge-sdf';
import { runDevCli } from './forge-dev';
import { runStudioCli } from './forge-studio';
import { runWebCli } from './forge-web';
import { runSvgCli } from './forge-svg';
import { runBrepCli } from './forge-brep';
import { isDirectCliRun, resolvePackagePath } from './package-runtime';
import { runParamCheckCli } from './param-check';
import { runScriptCli } from './test-run';
import { runDebugDimensionsCli } from './debug-dimensions';
import { runSkillInstallCli, runSkillOneFileCli } from './forge-skill';

type CommandDefinition = {
  group: 'Studio' | 'Shell' | 'Modeling' | 'Export' | 'Checks' | 'Debug';
  path: string[];
  summary: string;
  usage: string[];
  examples: string[];
  hidden?: boolean;
  completion?: CommandCompletionDefinition;
  run: (args: string[]) => Promise<void>;
};

const SHELL_VALUES: CompletionItem[] = [
  { value: 'bash', description: 'Bash completion script' },
  { value: 'zsh', description: 'Zsh completion script' },
  { value: 'fish', description: 'Fish completion script' },
];

const HOST_VALUES: CompletionItem[] = [
  { value: '0.0.0.0', description: 'Listen on all interfaces' },
  { value: '127.0.0.1', description: 'Loopback only' },
  { value: 'localhost', description: 'Loopback hostname' },
];

const SERVER_VALUES: CompletionItem[] = [
  { value: 'http://localhost:5173', description: 'Default local Forge server' },
];

const RENDER_ANGLE_VALUES: CompletionItem[] = [
  { value: 'front', description: 'View from -Y' },
  { value: 'back', description: 'View from +Y' },
  { value: 'side', description: 'View from +X' },
  { value: 'top', description: 'View from +Z' },
  { value: 'iso', description: 'Diagonal isometric view' },
];

const CAPTURE_TYPE_VALUES: CompletionItem[] = [
  { value: 'orbit', description: 'Orbit the camera around the model' },
  { value: 'animation', description: 'Play a jointsView clip with a fixed camera' },
];

const OUTPUT_FORMAT_VALUES: CompletionItem[] = [
  { value: 'gif', description: 'Animated GIF' },
  { value: 'mp4', description: 'H.264 MP4' },
];

const RENDER_MODE_VALUES: CompletionItem[] = [
  { value: 'solid', description: 'Render solid shading' },
  { value: 'wireframe', description: 'Render edges only' },
];

const QUALITY_VALUES: CompletionItem[] = [
  { value: 'default', description: 'Forge default quality' },
  { value: 'live', description: 'Fast viewport quality' },
  { value: 'high', description: 'High quality export preset' },
];

const ENCODER_VALUES: CompletionItem[] = [
  { value: 'auto', description: 'Pick the best available encoder' },
  { value: 'ffmpeg', description: 'Force ffmpeg' },
  { value: 'js', description: 'Force the pure-JS encoder' },
];

const STUDIO_OPTIONS: CompletionOptionDefinition[] = [
  { name: '--blank', description: 'Start without a project folder' },
  { name: '--port', description: 'Bind to a specific port', argument: 'required', valueLabel: '<n>' },
  { name: '--host', description: 'Expose the server on the network', argument: 'optional', valueLabel: '[host]', values: HOST_VALUES },
  { name: '--open', description: 'Open a browser window automatically' },
  { name: '--strict-port', description: 'Fail instead of selecting another port' },
];

const NOTEBOOK_SHARED_OPTIONS: CompletionOptionDefinition[] = [
  { name: '--code', description: 'Append inline cell source', argument: 'required', valueLabel: '<code>' },
  { name: '--file', description: 'Read cell source from a file', argument: 'required', valueLabel: '<path>', valueKind: 'path' },
  { name: '--after', description: 'Insert after a specific cell id', argument: 'required', valueLabel: '<cell-id>' },
  { name: '--server', description: 'Reuse an existing Forge server', argument: 'required', valueLabel: '<url>', values: SERVER_VALUES },
  { name: '--port', description: 'Preferred port when auto-starting the server', argument: 'required', valueLabel: '<n>' },
];

const NOTEBOOK_RUN_OPTIONS: CompletionOptionDefinition[] = [
  { name: '--server', description: 'Reuse an existing Forge server', argument: 'required', valueLabel: '<url>', values: SERVER_VALUES },
  { name: '--port', description: 'Preferred port when auto-starting the server', argument: 'required', valueLabel: '<n>' },
];

const RENDER_OPTIONS: CompletionOptionDefinition[] = [
  { name: '--angles', description: 'Comma-separated standard angles', argument: 'required', valueLabel: '<front,back,side,top,iso>', values: RENDER_ANGLE_VALUES, valueMode: 'csv' },
  { name: '--size', description: 'Image size in pixels', argument: 'required', valueLabel: '<px>' },
  { name: '--port', description: 'Vite dev server port', argument: 'required', valueLabel: '<n>' },
  { name: '--camera', description: 'Exact camera spec', argument: 'required', valueLabel: '<spec>' },
  { name: '--scene', description: 'Viewport scene state JSON', argument: 'required', valueLabel: '<json>' },
  { name: '--background', description: 'Canvas background override', argument: 'required', valueLabel: '<color>' },
  { name: '--chrome-path', description: 'Chrome or Chromium executable path', argument: 'required', valueLabel: '<path>', valueKind: 'path' },
];

const CAPTURE_COMMON_OPTIONS: CompletionOptionDefinition[] = [
  { name: '--format', description: 'Output format', argument: 'required', valueLabel: '<gif|mp4>', values: OUTPUT_FORMAT_VALUES },
  { name: '--capture', description: 'Capture preset', argument: 'required', valueLabel: '<orbit|animation>', values: CAPTURE_TYPE_VALUES },
  { name: '--animation', description: 'Named jointsView animation clip', argument: 'required', valueLabel: '<name>' },
  { name: '--animation-loops', description: 'Repeat the selected animation clip', argument: 'required', valueLabel: '<n>' },
  { name: '--cut-plane', description: 'Enable a named cut plane', argument: 'required', valueLabel: '<name>', repeatable: true },
  { name: '--camera', description: 'Exact camera spec', argument: 'required', valueLabel: '<spec>' },
  { name: '--scene', description: 'Viewport scene state JSON', argument: 'required', valueLabel: '<json>' },
  { name: '--render-mode', description: 'Primary render mode', argument: 'required', valueLabel: '<solid|wireframe>', values: RENDER_MODE_VALUES },
  { name: '--include-wireframe-pass', description: 'Append an extra wireframe pass' },
  { name: '--no-wireframe-pass', description: 'Disable the extra wireframe pass' },
  { name: '--size', description: 'Output frame size in pixels', argument: 'required', valueLabel: '<px>' },
  { name: '--pixel-ratio', description: 'Render supersampling factor', argument: 'required', valueLabel: '<n>' },
  { name: '--fps', description: 'Output frame rate', argument: 'required', valueLabel: '<n>' },
  { name: '--frames-per-turn', description: 'Frames for one orbit turn', argument: 'required', valueLabel: '<n>' },
  { name: '--hold-frames', description: 'Freeze frames before each pass', argument: 'required', valueLabel: '<n>' },
  { name: '--pitch', description: 'Orbit pitch override', argument: 'required', valueLabel: '<deg>' },
  { name: '--background', description: 'Canvas background override', argument: 'required', valueLabel: '<color>' },
  { name: '--quality', description: 'Forge quality preset', argument: 'required', valueLabel: '<default|live|high>', values: QUALITY_VALUES },
  { name: '--encoder', description: 'GIF encoder strategy', argument: 'required', valueLabel: '<auto|ffmpeg|js>', values: ENCODER_VALUES },
  { name: '--crf', description: 'ffmpeg/libx264 quality', argument: 'required', valueLabel: '<n>' },
  { name: '--port', description: 'Vite dev server port', argument: 'required', valueLabel: '<n>' },
  { name: '--chrome-path', description: 'Chrome or Chromium executable path', argument: 'required', valueLabel: '<path>', valueKind: 'path' },
  { name: '--ffmpeg-path', description: 'ffmpeg executable path', argument: 'required', valueLabel: '<path>', valueKind: 'path' },
  { name: '--list', description: 'Print available animations and cut planes' },
];

const commands: CommandDefinition[] = [
  {
    group: 'Studio',
    path: ['dev'],
    summary: 'Start the Vite dev server with live reload. No build step required — the preferred way to run ForgeCAD during active development.',
    usage: [
      'forgecad dev',
      'forgecad dev <project-path>',
      'forgecad dev --blank',
    ],
    examples: [
      'forgecad dev',
      'forgecad dev ~/cad/gearbox',
      'forgecad dev --blank --port 4173',
    ],
    completion: {
      options: STUDIO_OPTIONS,
      positionals: [
        { description: 'project path', valueKind: 'directory' },
      ],
    },
    run: runDevCli,
  },
  {
    group: 'Studio',
    path: ['studio'],
    summary: 'Serve the production build of the studio (requires dist/ — run `npm run build` first).',
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
    completion: {
      options: STUDIO_OPTIONS,
      positionals: [
        { description: 'project path', valueKind: 'directory' },
      ],
    },
    run: runStudioCli,
  },
  {
    group: 'Studio',
    path: ['web'],
    summary: 'Start a local dev server in web/playground mode (no filesystem, localStorage only).',
    usage: ['forgecad web', 'forgecad web --open'],
    examples: ['forgecad web', 'forgecad web --open --port 4173'],
    completion: {
      options: [
        { name: '--open', description: 'Open a browser window automatically' },
        { name: '--port', description: 'Dev server port', argument: 'required', valueLabel: '<n>' },
      ],
    },
    run: runWebCli,
  },
  {
    group: 'Studio',
    path: ['open'],
    summary: 'Alias for `forgecad studio`.',
    usage: ['forgecad open [project-path]'],
    examples: ['forgecad open ~/cad/gearbox'],
    completion: {
      options: STUDIO_OPTIONS,
      positionals: [
        { description: 'project path', valueKind: 'directory' },
      ],
    },
    run: runStudioCli,
  },
  {
    group: 'Shell',
    path: ['completion'],
    summary: 'Generate shell completion scripts for bash, zsh, or fish.',
    usage: ['forgecad completion <bash|zsh|fish>'],
    examples: [
      'source <(forgecad completion bash)',
      'source <(forgecad completion zsh)',
      'forgecad completion fish > ~/.config/fish/completions/forgecad.fish',
    ],
    completion: {
      positionals: [
        { description: 'shell', values: SHELL_VALUES },
      ],
    },
    run: async (args) => runCompletionCli(args),
  },
  {
    group: 'Shell',
    path: ['skill', 'install'],
    summary: 'Install the ForgeCAD agent skill to ~/.agents/skills/forgecad/SKILL.md (Claude Code, Codex, OpenCode, …).',
    usage: ['forgecad skill install'],
    examples: ['forgecad skill install'],
    run: runSkillInstallCli,
  },
  {
    group: 'Shell',
    path: ['skill', 'one-file'],
    summary: 'Write a single self-contained context file with all ForgeCAD docs for pasting into a chat UI (Claude.ai, ChatGPT, …).',
    usage: ['forgecad skill one-file <output-path>'],
    examples: [
      'forgecad skill one-file ~/Desktop/forgecad-context.md',
      'forgecad skill one-file ./forgecad-context.md',
    ],
    completion: {
      positionals: [
        { description: 'output path for the context file', valueKind: 'path' },
      ],
    },
    run: runSkillOneFileCli,
  },
  {
    group: 'Shell',
    path: ['__complete'],
    summary: 'Internal shell completion hook.',
    usage: [],
    examples: [],
    hidden: true,
    run: async (args) => runHiddenCompletionCli(args, commands),
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
    completion: {
      options: [
        { name: '--debug-imports', description: 'Print the import trace' },
      ],
      positionals: [
        { description: 'Forge script or notebook', valueKind: 'renderable' },
      ],
    },
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
    completion: {
      options: NOTEBOOK_SHARED_OPTIONS,
      positionals: [
        { description: 'notebook path', valueKind: 'notebook' },
      ],
    },
    run: runNotebookCli,
  },
  {
    group: 'Modeling',
    path: ['notebook', 'append'],
    summary: 'Append a new code cell to a notebook, optionally auto-creating the file first.',
    usage: ['forgecad notebook append <notebook.forge-notebook.json> [--code "..."] [--file path] [--after cell-id]'],
    examples: [
      'forgecad notebook append examples/demo.forge-notebook.json --code "show(box(40, 20, 10));"',
      'forgecad notebook append examples/demo.forge-notebook.json --file /tmp/cell.js',
    ],
    completion: {
      options: NOTEBOOK_SHARED_OPTIONS,
      positionals: [
        { description: 'notebook path', valueKind: 'notebook' },
      ],
    },
    run: (args) => runNotebookCli(['append', ...args]),
  },
  {
    group: 'Modeling',
    path: ['notebook', 'run'],
    summary: 'Run a notebook preview cell or a specific cell id.',
    usage: ['forgecad notebook run <notebook.forge-notebook.json> [cell-id]'],
    examples: [
      'forgecad notebook run examples/api/notebook-iteration.forge-notebook.json',
      'forgecad notebook run examples/api/notebook-iteration.forge-notebook.json preview-cell-id',
    ],
    completion: {
      options: NOTEBOOK_RUN_OPTIONS,
      positionals: [
        { description: 'notebook path', valueKind: 'notebook' },
        { description: 'cell id' },
      ],
    },
    run: (args) => runNotebookCli(['run', ...args]),
  },
  {
    group: 'Modeling',
    path: ['notebook', 'view'],
    summary: 'Render notebook cells and stored outputs directly in the terminal.',
    usage: ['forgecad notebook view <notebook.forge-notebook.json> [cell-number|cell-id|preview]'],
    examples: [
      'forgecad notebook view examples/api/notebook-iteration.forge-notebook.json',
      'forgecad notebook view examples/api/notebook-iteration.forge-notebook.json preview',
    ],
    completion: {
      positionals: [
        { description: 'notebook path', valueKind: 'notebook' },
        {
          description: 'cell number, cell id, or preview',
          values: [{ value: 'preview', description: 'Notebook preview cell' }],
        },
      ],
    },
    run: (args) => runNotebookCli(['view', ...args]),
  },
  {
    group: 'Modeling',
    path: ['notebook', 'export'],
    summary: 'Export a notebook into a plain `.forge.js` script.',
    usage: ['forgecad notebook export <notebook.forge-notebook.json> [output.forge.js]'],
    examples: [
      'forgecad notebook export examples/demo.forge-notebook.json',
      'forgecad notebook export examples/demo.forge-notebook.json out/demo.forge.js',
    ],
    completion: {
      positionals: [
        { description: 'notebook path', valueKind: 'notebook' },
        { description: 'output Forge script path', valueKind: 'path' },
      ],
    },
    run: (args) => runNotebookCli(['export', ...args]),
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
    completion: {
      options: RENDER_OPTIONS,
      positionals: [
        { description: 'Forge script or notebook', valueKind: 'renderable' },
        { description: 'output PNG path', valueKind: 'png' },
      ],
    },
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
    completion: {
      options: CAPTURE_COMMON_OPTIONS,
      positionals: [
        { description: 'Forge script or notebook', valueKind: 'renderable' },
        { description: 'output GIF path', valueKind: 'gif' },
      ],
    },
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
    completion: {
      options: CAPTURE_COMMON_OPTIONS,
      positionals: [
        { description: 'Forge script or notebook', valueKind: 'renderable' },
        { description: 'output MP4 path', valueKind: 'mp4' },
      ],
    },
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
    completion: {
      positionals: [
        { description: 'Sketch script', valueKind: 'sketch-script' },
        { description: 'output SVG path', valueKind: 'svg' },
      ],
    },
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
    completion: {
      options: [
        { name: '--output', description: 'Output STEP path', argument: 'required', valueLabel: '<path>', valueKind: 'path' },
        { name: '--python', description: 'Python interpreter for uv', argument: 'required', valueLabel: '<path>', valueKind: 'path' },
        { name: '--uv', description: 'uv executable path', argument: 'required', valueLabel: '<path>', valueKind: 'path' },
        { name: '--allow-faceted', description: 'Allow faceted fallback for closed mesh solids' },
      ],
      positionals: [
        { description: 'Forge script', valueKind: 'forge-script' },
      ],
    },
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
    completion: {
      options: [
        { name: '--output', description: 'Output BREP path', argument: 'required', valueLabel: '<path>', valueKind: 'path' },
        { name: '--python', description: 'Python interpreter for uv', argument: 'required', valueLabel: '<path>', valueKind: 'path' },
        { name: '--uv', description: 'uv executable path', argument: 'required', valueLabel: '<path>', valueKind: 'path' },
        { name: '--allow-faceted', description: 'Allow faceted fallback for closed mesh solids' },
      ],
      positionals: [
        { description: 'Forge script', valueKind: 'forge-script' },
      ],
    },
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
    completion: {
      options: [
        { name: '--output', description: 'Output package directory', argument: 'required', valueLabel: '<dir>', valueKind: 'directory' },
      ],
      positionals: [
        { description: 'Forge script', valueKind: 'forge-script' },
      ],
    },
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
    completion: {
      options: [
        { name: '--dim-angle-tol', description: 'Dimension routing tolerance in degrees', argument: 'required', valueLabel: '<deg>' },
      ],
      positionals: [
        { description: 'Forge script', valueKind: 'forge-script' },
        { description: 'output PDF path', valueKind: 'pdf' },
      ],
    },
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
    completion: {
      options: [
        { name: '--samples', description: 'Number of samples per parameter', argument: 'required', valueLabel: '<n>' },
      ],
      positionals: [
        { description: 'Forge script', valueKind: 'forge-script' },
      ],
    },
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
    path: ['check', 'constraints'],
    summary: 'Run constraint solver invariants and snapshot regression tests.',
    usage: [
      'forgecad check constraints',
      'forgecad check constraints --update',
      'forgecad check constraints --verbose',
      'forgecad check constraints angle',
    ],
    examples: [
      'forgecad check constraints',
      'forgecad check constraints --update   # regenerate snapshots',
      'forgecad check constraints angle      # filter by name',
    ],
    run: (args) => runCheckConstraintsCli(args),
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
    group: 'Checks',
    path: ['check', 'text'],
    summary: 'Run text2d geometry contract tests.',
    usage: ['forgecad check text'],
    examples: ['forgecad check text'],
    run: () => runCheckTextCli(),
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
    completion: {
      options: [
        { name: '--all', description: 'Print the full dimension list' },
        { name: '--dim-angle-tol', description: 'Dimension routing tolerance in degrees', argument: 'required', valueLabel: '<deg>' },
      ],
      positionals: [
        { description: 'Forge script', valueKind: 'forge-script' },
      ],
    },
    run: runDebugDimensionsCli,
  },
  {
    group: 'Debug',
    path: ['debug', 'faces'],
    summary: 'Inspect face transformation histories for a script.',
    usage: ['forgecad debug faces <script.forge.js> [face-name]'],
    examples: [
      'forgecad debug faces examples/api/face-transformation-history.forge.js',
      'forgecad debug faces examples/api/face-transformation-history.forge.js floor',
    ],
    completion: {
      positionals: [
        { description: 'Forge script', valueKind: 'forge-script' },
        { description: 'Optional face name to filter', valueKind: 'string' },
      ],
    },
    run: runDebugFaceHistoryCli,
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

function defaultOptionValueLabel(option: CompletionOptionDefinition): string {
  if (option.valueLabel) return option.valueLabel;
  if (option.values && option.values.length > 0) {
    const joined = option.values.map((item) => item.value).join('|');
    return option.argument === 'optional' ? `[${joined}]` : `<${joined}>`;
  }
  if (option.valueKind === 'directory') return option.argument === 'optional' ? '[dir]' : '<dir>';
  if (option.valueKind === 'path') return option.argument === 'optional' ? '[path]' : '<path>';
  return option.argument === 'optional' ? '[value]' : '<value>';
}

function optionSynopsis(option: CompletionOptionDefinition): string {
  const argumentMode = option.argument ?? 'none';
  if (argumentMode === 'none') return option.name;
  return `${option.name} ${defaultOptionValueLabel(option)}`;
}

function printGlobalHelp(exitCode = 0): never {
  const visibleCommands = commands.filter((command) => !command.hidden);
  const width = Math.max(...visibleCommands.map((command) => commandLabel(command).length));
  console.log(`ForgeCAD ${readVersion()}

Code-first parametric CAD for JavaScript/TypeScript.

Usage:
  forgecad <command> [options]

Install for plain-shell usage from a checkout:
  npm install
  npm link

Commands:`);

  for (const group of ['Studio', 'Shell', 'Modeling', 'Export', 'Checks', 'Debug'] as const) {
    console.log(`\n${group}`);
    visibleCommands
      .filter((command) => command.group === group)
      .forEach((command) => {
        console.log(`  ${padRight(commandLabel(command), width + 2)}${command.summary}`);
      });
  }

  console.log(`
Help:
  forgecad help
  forgecad help completion
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
  const options = command.completion?.options ?? [];
  if (options.length > 0) {
    const width = Math.max(...options.map((option) => optionSynopsis(option).length));
    console.log('\nOptions:');
    options.forEach((option) => {
      console.log(`  ${padRight(optionSynopsis(option), width + 2)}${option.description}`);
    });
  }
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
