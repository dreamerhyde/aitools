import ignore from 'ignore';
import * as fs from 'fs';
import * as path from 'path';

export class GitignoreHelper {
  private ig: ReturnType<typeof ignore>;
  private hasGitignore: boolean;
  
  constructor(rootPath: string = process.cwd()) {
    this.ig = ignore();
    this.hasGitignore = false;
    this.loadGitignore(rootPath);
  }
  
  private loadGitignore(rootPath: string): void {
    const gitignorePath = path.join(rootPath, '.gitignore');
    
    if (fs.existsSync(gitignorePath)) {
      try {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
        this.ig.add(gitignoreContent);
        this.hasGitignore = true;
        
        // Also add common patterns that should always be ignored
        this.ig.add([
          'node_modules/**',
          '.git/**',
          'dist/**',
          'build/**',
          '.next/**',
          '*.log',
          '.DS_Store',
          'coverage/**',
          '.env.local',
          '.env.*.local'
        ]);
      } catch (error) {
        console.warn('Warning: Could not read .gitignore file');
      }
    } else {
      // Even without gitignore, ignore common patterns
      this.ig.add([
        'node_modules/**',
        '.git/**',
        'dist/**',
        'build/**',
        '.next/**',
        '*.log',
        '.DS_Store',
        'coverage/**'
      ]);
    }
  }
  
  isIgnored(filePath: string): boolean {
    // Convert absolute path to relative path
    const relativePath = path.relative(process.cwd(), filePath);
    return this.ig.ignores(relativePath);
  }
  
  filterFiles(files: string[]): string[] {
    return files.filter(file => !this.isIgnored(file));
  }
  
  getPatterns(): string[] {
    // Return patterns for use in ESLint, etc.
    if (this.hasGitignore) {
      return [
        'node_modules/**',
        '.git/**',
        'dist/**',
        'build/**',
        '.next/**',
        'coverage/**',
        '*.min.js',
        'public/**'
      ];
    }
    return [
      'node_modules/**',
      '.git/**',
      'dist/**',
      'build/**',
      '.next/**',
      'coverage/**'
    ];
  }
}