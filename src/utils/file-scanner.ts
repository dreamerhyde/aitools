import { glob } from 'glob';
import { GitignoreHelper } from './gitignore-helper.js';

export class FileScanner {
  private readonly FILE_PATTERNS = [
    '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
    '**/*.py', '**/*.go', '**/*.java', '**/*.cs',
    '**/*.cpp', '**/*.c', '**/*.rs', '**/*.swift', '**/*.kt'
  ];
  
  private readonly DEFAULT_IGNORE = [
    // JavaScript/TypeScript
    '**/node_modules/**', '**/dist/**', '**/build/**',
    '**/*.min.js', '**/*.bundle.js', '**/*.d.ts',
    
    // Python
    '**/__pycache__/**', '**/*.pyc', '**/*.pyo', '**/*.pyd',
    '**/venv/**', '**/.venv/**', '**/env/**', '**/.env/**',
    '**/*.egg-info/**', '**/.pytest_cache/**',
    
    // Go
    '**/vendor/**', '**/go.sum',
    
    // iOS/Swift
    '**/Pods/**', '**/Carthage/**', '**/*.xcworkspace/**',
    '**/DerivedData/**',
    
    // Android/Kotlin/Java
    '**/target/**', '**/out/**', '**/.gradle/**', '**/gradle/**',
    
    // C#/.NET
    '**/bin/**', '**/obj/**', '**/packages/**',
    
    // Rust
    '**/Cargo.lock',
    
    // General
    '**/.git/**', '**/coverage/**', '**/*test*', '**/*spec*',
    '**/migrations/**', '**/.idea/**', '**/.vscode/**', '**/*.log'
  ];

  async findCodeFiles(searchPath: string, customIgnore: string[] = []): Promise<string[]> {
    // Use GitignoreHelper to respect .gitignore
    const gitignoreHelper = new GitignoreHelper(searchPath);
    const ignorePatterns = [...this.DEFAULT_IGNORE, ...customIgnore];
    const allFiles: string[] = [];
    
    for (const pattern of this.FILE_PATTERNS) {
      const files = await glob(pattern, {
        cwd: searchPath,
        ignore: ignorePatterns,
        absolute: true
      });
      allFiles.push(...files);
    }
    
    // Filter out gitignored files
    return gitignoreHelper.filterFiles(allFiles);
  }

  getFilePatterns(): string[] {
    return this.FILE_PATTERNS;
  }

  getDefaultIgnorePatterns(): string[] {
    return this.DEFAULT_IGNORE;
  }
}