import { describe, expect, test } from 'bun:test';
import { ComplexityCalculator } from '../../src/utils/complexity-calculator.js';

const calc = new ComplexityCalculator();

describe('ComplexityCalculator', () => {
  test('returns base complexity of 1 for empty file', () => {
    expect(calc.calculate('', 'test.ts')).toBe(1);
  });

  test('counts if statements in TypeScript', () => {
    const code = `
      if (a) { }
      if (b) { }
    `;
    expect(calc.calculate(code, 'test.ts')).toBe(3); // 1 base + 2 ifs
  });

  test('counts multiple control flow patterns', () => {
    const code = `
      if (a) { }
      else if (b) { }
      for (let i = 0; i < 10; i++) { }
      while (true) { }
      switch (x) { }
      try { } catch (e) { }
    `;
    // 1 base + if + else if (also matches if) + for + while + switch + catch = 8
    expect(calc.calculate(code, 'test.ts')).toBe(8);
  });

  test('uses Python patterns for .py files', () => {
    const code = `
if True:
  pass
elif False:
  pass
for i in range(10):
  pass
while True:
  pass
try:
  pass
except Exception:
  pass
    `;
    // 1 base + if + elif + for + while + try + except = 7
    expect(calc.calculate(code, 'test.py')).toBe(7);
  });

  test('uses generic patterns for unknown extensions', () => {
    const code = 'if else if for while switch catch';
    const result = calc.calculate(code, 'test.rb');
    expect(result).toBeGreaterThan(1);
  });
});
