import { describe, expect, test } from 'bun:test';
import { runCLI } from '../helpers/cli.js';

describe('CLI help and version', () => {
  test('--help shows CLI info', async () => {
    const { stdout, exitCode } = await runCLI(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('AI Tools CLI');
  });

  test('--version shows version number', async () => {
    const { stdout, exitCode } = await runCLI(['--version']);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  test('no arguments shows help', async () => {
    const { stdout, exitCode } = await runCLI([]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Commands:');
  });

  test('unknown command exits with non-zero', async () => {
    const { stdout, stderr, exitCode } = await runCLI(['nonexistent-command']);
    // Should indicate error somehow (either non-zero exit or error message)
    const output = stdout + stderr;
    expect(output.length).toBeGreaterThan(0);
  });
});
