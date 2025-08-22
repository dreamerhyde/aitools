import { promises as fs } from 'fs';
import path from 'path';

export class GitignoreParser {
  private patterns: string[] = [];
  private negativePatterns: string[] = [];
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  async load(): Promise<void> {
    try {
      const gitignorePath = path.join(this.rootPath, '.gitignore');
      const content = await fs.readFile(gitignorePath, 'utf-8');
      this.parse(content);
    } catch (error) {
      // No .gitignore file, that's okay
      if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
        console.warn('Failed to read .gitignore:', error);
      }
    }
  }

  private parse(content: string): void {
    const lines = content.split('\n');
    
    for (const line of lines) {
      // Skip empty lines and comments
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Handle negative patterns (starting with !)
      if (trimmed.startsWith('!')) {
        this.negativePatterns.push(trimmed.substring(1));
      } else {
        this.patterns.push(trimmed);
      }
    }
  }

  shouldIgnore(filePath: string, isDirectory: boolean): boolean {
    // Get relative path from root
    const relativePath = path.relative(this.rootPath, filePath);
    
    // Split into parts for matching
    const parts = relativePath.split(path.sep);
    const fileName = parts[parts.length - 1];

    // Check each pattern
    for (const pattern of this.patterns) {
      if (this.matchesPattern(relativePath, fileName, pattern, isDirectory)) {
        // Check if there's a negative pattern that overrides
        for (const negPattern of this.negativePatterns) {
          if (this.matchesPattern(relativePath, fileName, negPattern, isDirectory)) {
            return false;
          }
        }
        return true;
      }
    }

    return false;
  }

  private matchesPattern(relativePath: string, fileName: string, pattern: string, isDirectory: boolean): boolean {
    // Handle directory-only patterns (ending with /)
    if (pattern.endsWith('/')) {
      if (!isDirectory) return false;
      pattern = pattern.slice(0, -1);
    }

    // Handle patterns starting with /
    if (pattern.startsWith('/')) {
      pattern = pattern.substring(1);
      // Must match from root
      return this.matchGlob(relativePath, pattern);
    }

    // Handle ** patterns (match any depth)
    if (pattern.includes('**')) {
      return this.matchGlob(relativePath, pattern);
    }

    // Handle patterns with / (specific path)
    if (pattern.includes('/')) {
      return this.matchGlob(relativePath, pattern);
    }

    // Simple filename pattern - can match at any depth
    // Check if any part of the path matches
    const pathParts = relativePath.split(path.sep);
    for (const part of pathParts) {
      if (this.matchGlob(part, pattern)) {
        return true;
      }
    }

    return false;
  }

  private matchGlob(text: string, pattern: string): boolean {
    // Convert glob pattern to regex
    let regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.')
      .replace(/\[([^\]]+)\]/g, '[$1]');

    // Handle ** for any depth
    regex = regex.replace(/\[^\/\]\*\[^\/\]\*/g, '.*');

    try {
      const re = new RegExp(`^${regex}$`);
      return re.test(text);
    } catch {
      // If regex fails, fall back to simple string matching
      return text === pattern;
    }
  }
}