import { $ } from 'bun';
import { join } from 'path';

export interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const CLI_ENTRY = join(import.meta.dir, '../../src/cli.ts');

/**
 * Run CLI command via Bun subprocess
 * @param args CLI arguments (e.g. ['lines', '--json'])
 * @param options Additional options
 */
export async function runCLI(
  args: string[] = [],
  options: { cwd?: string; timeout?: number; env?: Record<string, string> } = {}
): Promise<CLIResult> {
  const { cwd, timeout = 10000, env = {} } = options;

  const proc = Bun.spawn(['bun', 'run', CLI_ENTRY, ...args], {
    cwd: cwd || join(import.meta.dir, '../..'),
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      NO_UPDATE_CHECK: '1',
      CI: '1',
      ...env,
    },
  });

  const timeoutId = setTimeout(() => proc.kill(), timeout);

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  clearTimeout(timeoutId);

  return { stdout, stderr, exitCode };
}
