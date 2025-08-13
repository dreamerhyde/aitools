import { readFileSync, statSync } from 'fs';
import { ComplexityCalculator } from './complexity-calculator.js';

export interface FileHealth {
  path: string;
  lines: number;
  size: string;
  complexity: number;
  issues: string[];
  suggestions: string[];
}

export interface CodeSmells {
  issues: string[];
  suggestions: string[];
}

export class CodeAnalyzer {
  private readonly LINE_THRESHOLD = 500;
  private readonly CRITICAL_THRESHOLD = 1000;
  private readonly COMPLEXITY_THRESHOLD = 10;
  private readonly complexityCalculator = new ComplexityCalculator();

  async analyzeFile(filePath: string, threshold: number): Promise<FileHealth | null> {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const lineCount = lines.length;
      
      const stats = statSync(filePath);
      const sizeInKB = (stats.size / 1024).toFixed(1);
      
      const complexity = this.complexityCalculator.calculate(content, filePath);
      
      const issues: string[] = [];
      const suggestions: string[] = [];
      
      if (lineCount > this.CRITICAL_THRESHOLD) {
        issues.push(`Critical: ${lineCount} lines`);
        suggestions.push('Split into multiple modules');
      } else if (lineCount > threshold) {
        issues.push(`Large file: ${lineCount} lines`);
        suggestions.push('Consider refactoring');
      }
      
      if (complexity > this.COMPLEXITY_THRESHOLD) {
        issues.push(`High complexity: ${complexity}`);
        suggestions.push('Simplify logic');
      }
      
      const codeSmells = this.detectCodeSmells(content);
      issues.push(...codeSmells.issues);
      suggestions.push(...codeSmells.suggestions);
      
      if (issues.length === 0) {
        return null;
      }
      
      return {
        path: filePath,
        lines: lineCount,
        size: `${sizeInKB}KB`,
        complexity,
        issues,
        suggestions
      };
    } catch (error) {
      return null;
    }
  }

  private detectCodeSmells(content: string): CodeSmells {
    const issues: string[] = [];
    const suggestions: string[] = [];
    
    // Long functions/methods
    const functionMatches = content.match(/function\s+\w+|const\s+\w+\s*=\s*\([^)]*\)\s*=>|class\s+\w+/g);
    if (functionMatches && functionMatches.length > 20) {
      issues.push(`Many functions (${functionMatches.length})`);
      suggestions.push('Consider splitting into separate modules');
    }
    
    // Deep nesting
    const deepNesting = /(\t{4,}|\s{16,})[^\s]/g;
    const nestingMatches = content.match(deepNesting);
    if (nestingMatches && nestingMatches.length > 10) {
      issues.push('Deep nesting detected');
      suggestions.push('Extract nested logic into separate functions');
    }
    
    // Too many imports
    const importMatches = content.match(/^import\s+/gm);
    if (importMatches && importMatches.length > 30) {
      issues.push(`Too many imports (${importMatches.length})`);
      suggestions.push('Review dependencies and module boundaries');
    }
    
    // God class indicators
    const methodMatches = content.match(/^\s*(public|private|protected)?\s*(async\s+)?[a-zA-Z_]\w*\s*\([^)]*\)\s*{/gm);
    if (methodMatches && methodMatches.length > 20) {
      issues.push(`God class (${methodMatches.length} methods)`);
      suggestions.push('Apply Single Responsibility Principle');
    }
    
    return { issues, suggestions };
  }

  getThresholds() {
    return {
      LINE_THRESHOLD: this.LINE_THRESHOLD,
      CRITICAL_THRESHOLD: this.CRITICAL_THRESHOLD,
      COMPLEXITY_THRESHOLD: this.COMPLEXITY_THRESHOLD
    };
  }
}