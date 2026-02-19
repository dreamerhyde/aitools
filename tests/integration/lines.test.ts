import { describe, expect, test } from 'bun:test';
import { runCLI } from '../helpers/cli.js';

describe('CLI lines command', () => {
  test('lines runs without error', async () => {
    const { exitCode } = await runCLI(['lines']);
    expect(exitCode).toBe(0);
  });

  test('lines --json outputs JSON with lineLimit field', async () => {
    const { stdout, exitCode } = await runCLI(['lines', '--json']);
    expect(exitCode).toBe(0);
    // Extract JSON from output (may have spinner text before it)
    const jsonStart = stdout.indexOf('{');
    const json = stdout.slice(jsonStart);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty('lineLimit');
    expect(parsed).toHaveProperty('totalFiles');
  });

  test('lines --limit accepts custom limit', async () => {
    const { exitCode } = await runCLI(['lines', '--limit', '100']);
    expect(exitCode).toBe(0);
  });
});
