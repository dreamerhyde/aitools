import { extname } from 'path';

export class ComplexityCalculator {
  calculate(content: string, filePath: string): number {
    let complexity = 1;
    const ext = extname(filePath);
    const patterns = this.getPatternsForLanguage(ext);
    
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }
    
    return complexity;
  }

  private getPatternsForLanguage(ext: string): RegExp[] {
    switch (ext) {
      case '.ts':
      case '.tsx':
      case '.js':
      case '.jsx':
        return [
          /\bif\s*\(/g,
          /\belse\s+if\s*\(/g,
          /\bfor\s*\(/g,
          /\bwhile\s*\(/g,
          /\bswitch\s*\(/g,
          /\bcatch\s*\(/g,
          /\?\s*.*\s*:/g  // Ternary operators
        ];
      
      case '.py':
        return [
          /\bif\s+/g,
          /\belif\s+/g,
          /\bfor\s+/g,
          /\bwhile\s+/g,
          /\btry:/g,
          /\bexcept\s*/g
        ];
      
      default:
        return [
          /\bif\b/g,
          /\belse\s+if\b/g,
          /\bfor\b/g,
          /\bwhile\b/g,
          /\bswitch\b/g,
          /\bcatch\b/g
        ];
    }
  }
}