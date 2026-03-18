import { packageRootFrom, spawnPackageVite } from './package-runtime';
import { type ChildProcess } from 'child_process';

interface WebOptions {
  open: boolean;
  port?: number;
}

function parseWebArgs(argv: string[]): WebOptions {
  const options: WebOptions = { open: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--open') { options.open = true; continue; }
    if (arg === '--port') {
      const raw = argv[i + 1];
      if (!raw) throw new Error('--port requires a value');
      const port = Number.parseInt(raw, 10);
      if (!Number.isFinite(port) || port < 1 || port > 65535) throw new Error(`Invalid port: ${raw}`);
      options.port = port;
      i += 1;
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function waitForExit(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 0));
  });
}

export async function runWebCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const options = parseWebArgs(argv);
  const viteArgs: string[] = [];
  if (options.port != null) viteArgs.push('--port', String(options.port));
  if (options.open) viteArgs.push('--open');

  const child = spawnPackageVite(import.meta.url, viteArgs, {
    cwd: packageRootFrom(import.meta.url),
    stdio: 'inherit',
    env: {
      ...process.env,
      FORGE_MODE: 'web',
    },
  });

  const code = await waitForExit(child);
  if (code !== 0) process.exit(code);
}
