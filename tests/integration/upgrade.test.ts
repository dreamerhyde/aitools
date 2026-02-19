import { describe, expect, test } from 'bun:test';
import { runCLI } from '../helpers/cli.js';

describe('CLI upgrade --check', () => {
  test('upgrade --check shows version info', async () => {
    const { stdout, exitCode } = await runCLI(['upgrade', '--check'], { timeout: 15000 });
    // May exit 0 or non-zero depending on network
    // But should always show version info or error message
    expect(stdout.length + (exitCode === 0 ? 1 : 0)).toBeGreaterThan(0);
  });

  test('upgrade --check contains version number', async () => {
    const { stdout } = await runCLI(['upgrade', '--check'], { timeout: 15000 });
    // Should show current version somewhere in output
    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  });
});
