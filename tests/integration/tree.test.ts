import { describe, expect, test } from 'bun:test';
import { runCLI } from '../helpers/cli.js';

describe('CLI files command', () => {
  test('files runs without error', async () => {
    const { stdout, exitCode } = await runCLI(['files']);
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
  });

  test('files shows directories and files', async () => {
    const { stdout } = await runCLI(['files']);
    expect(stdout).toContain('src');
    expect(stdout).toContain('.ts');
  });
});

describe('CLI folders command', () => {
  test('folders runs without error', async () => {
    const { stdout, exitCode } = await runCLI(['folders']);
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
  });

  test('folders shows only directories', async () => {
    const { stdout } = await runCLI(['folders']);
    expect(stdout).toContain('src');
    expect(stdout).not.toContain('.ts');
  });
});

describe('CLI tree command (alias)', () => {
  test('tree runs as alias of folders', async () => {
    const { stdout: treeOut, exitCode } = await runCLI(['tree']);
    const { stdout: foldersOut } = await runCLI(['folders']);
    expect(exitCode).toBe(0);
    expect(treeOut).toBe(foldersOut);
  });
});
