import { describe, expect, test } from 'bun:test';
import { parseESLintOutput, parseESLintTextOutput, parseTypeScriptOutput } from '../../src/utils/check-formatters.js';

describe('parseESLintOutput (JSON)', () => {
  test('parses valid JSON output', () => {
    const json = JSON.stringify([
      {
        filePath: '/src/foo.ts',
        messages: [
          { line: 10, column: 5, severity: 2, message: 'Unused var', ruleId: 'no-unused-vars' },
          { line: 20, column: 1, severity: 1, message: 'Missing semicolon', ruleId: 'semi' }
        ]
      }
    ]);

    const issues = parseESLintOutput(json);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toEqual({
      file: '/src/foo.ts',
      line: 10,
      column: 5,
      severity: 'error',
      message: 'Unused var',
      rule: 'no-unused-vars'
    });
    expect(issues[1].severity).toBe('warning');
  });

  test('returns empty array for invalid JSON', () => {
    expect(parseESLintOutput('not json')).toEqual([]);
  });

  test('returns empty array for empty results', () => {
    expect(parseESLintOutput('[]')).toEqual([]);
  });
});

describe('parseESLintTextOutput', () => {
  test('parses file path and error lines', () => {
    const text = `/src/foo.ts
  10:5  error  Unused var  no-unused-vars
  20:1  warning  Missing semicolon  semi`;

    const issues = parseESLintTextOutput(text);
    expect(issues).toHaveLength(2);
    expect(issues[0].file).toBe('/src/foo.ts');
    expect(issues[0].line).toBe(10);
    expect(issues[0].column).toBe(5);
    expect(issues[0].severity).toBe('error');
    expect(issues[1].severity).toBe('warning');
  });

  test('handles multiple files', () => {
    const text = `/src/a.ts
  1:1  error  msg  rule1

/src/b.tsx
  2:2  warning  msg2  rule2`;

    const issues = parseESLintTextOutput(text);
    expect(issues).toHaveLength(2);
    expect(issues[0].file).toBe('/src/a.ts');
    expect(issues[1].file).toBe('/src/b.tsx');
  });

  test('returns empty array for empty input', () => {
    expect(parseESLintTextOutput('')).toEqual([]);
  });
});

describe('parseTypeScriptOutput', () => {
  test('parses TypeScript error format', () => {
    const output = 'src/foo.ts(10,5): error TS2304: Cannot find name "bar"';
    const issues = parseTypeScriptOutput(output, '');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      file: 'src/foo.ts',
      line: 10,
      column: 5,
      severity: 'error',
      message: 'Cannot find name "bar"',
      rule: 'TS2304'
    });
  });

  test('parses from both stdout and stderr', () => {
    const stdout = 'src/a.ts(1,1): error TS1000: msg1\n';
    const stderr = 'src/b.ts(2,2): error TS2000: msg2';
    const issues = parseTypeScriptOutput(stdout, stderr);
    expect(issues).toHaveLength(2);
  });

  test('returns empty array for clean output', () => {
    expect(parseTypeScriptOutput('', '')).toEqual([]);
  });
});
