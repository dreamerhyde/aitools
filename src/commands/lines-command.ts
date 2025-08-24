import { promises as fs } from 'fs';
import path from 'path';
import { UIHelper } from '../utils/ui.js';
import chalk from 'chalk';
import { GitignoreParser } from '../utils/gitignore-parser.js';
import { ConfigManager } from '../utils/config-manager.js';

interface FileInfo {
  path: string;
  lines: number;
  exceedsLimit: boolean;
}

export class LinesCommand {
  private gitignoreParser: GitignoreParser;
  private configManager: ConfigManager;
  private lineLimit: number = 500;

  constructor() {
    this.gitignoreParser = new GitignoreParser(process.cwd());
    this.configManager = new ConfigManager();
  }

  async executeWithResults(): Promise<any> {
    try {
      // Load config to get line limit
      const config = await this.configManager.load();
      this.lineLimit = config.line_limit || 500;
      
      // Load gitignore
      await this.gitignoreParser.load();
      
      // Scan files
      const files = await this.scanFiles(process.cwd());
      
      // Filter files by line count
      const exceededFiles = files.filter(f => f.exceedsLimit);
      
      return {
        violations: exceededFiles.map(f => ({
          file: f.path,
          lines: f.lines,
          excess: f.lines - this.lineLimit
        })),
        totalFiles: files.length,
        limit: this.lineLimit
      };
    } catch (error) {
      return {
        violations: [],
        totalFiles: 0,
        limit: this.lineLimit
      };
    }
  }

  async execute(options: { 
    limit?: number; 
    all?: boolean; 
    json?: boolean;
    path?: string;
  } = {}): Promise<void> {
    try {
      // Load config to get line limit
      const config = await this.configManager.load();
      this.lineLimit = options.limit || config.line_limit || 500;

      const targetPath = path.resolve(options.path || '.');
      
      // Load gitignore
      await this.gitignoreParser.load();

      // Scan files
      const spinner = UIHelper.showSpinner('Scanning files...');
      const files = await this.scanFiles(targetPath);
      spinner.stop();

      // Filter files by line count
      const exceededFiles = files.filter(f => f.exceedsLimit);
      const allFiles = options.all ? files : exceededFiles;

      if (options.json) {
        // JSON output for AI consumption
        console.log(JSON.stringify({
          lineLimit: this.lineLimit,
          totalFiles: files.length,
          exceededCount: exceededFiles.length,
          files: allFiles
        }, null, 2));
        return;
      }

      // Human-readable output
      console.log('');
      console.log(chalk.bold(`📏 File Line Count Check (limit: ${this.lineLimit} lines)\n`));

      if (exceededFiles.length === 0) {
        UIHelper.showSuccess('All files are within the line limit!');
        console.log(chalk.gray(`Checked ${files.length} files`));
        return;
      }

      // Show files exceeding limit
      console.log(chalk.yellow(`Found ${exceededFiles.length} files exceeding ${this.lineLimit} lines:\n`));

      // Sort by line count (descending)
      exceededFiles.sort((a, b) => b.lines - a.lines);

      for (const file of exceededFiles) {
        const excess = file.lines - this.lineLimit;
        const percentage = ((excess / this.lineLimit) * 100).toFixed(1);
        
        console.log(
          `  ${chalk.red('●')} ${chalk.cyan(file.path)} - ` +
          `${chalk.bold(file.lines)} lines ` +
          chalk.red(`(+${excess} lines, ${percentage}% over)`)
        );
      }

      console.log('');
      console.log(chalk.bold('Refactoring Recommendations:'));
      
      for (const file of exceededFiles.slice(0, 3)) { // Top 3 worst offenders
        const recommendation = this.getRefactoringRecommendation(file);
        console.log(`  ${chalk.blue('→')} ${chalk.cyan(path.basename(file.path))}: ${recommendation}`);
      }

      console.log('');
      console.log(chalk.gray('Tip: Use "ai refactor" for detailed refactoring suggestions'));

      // Set exit code for CI/CD
      if (exceededFiles.length > 0 && !options.all) {
        process.exit(1);
      }

    } catch (error) {
      if (error instanceof Error) {
        UIHelper.showError(`Failed to check file lines: ${error.message}`);
      }
      process.exit(1);
    }
  }

  private async scanFiles(dirPath: string, basePath: string = dirPath): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(basePath, fullPath);

        // Skip if gitignored
        if (this.gitignoreParser.shouldIgnore(fullPath, entry.isDirectory())) {
          continue;
        }

        // Skip common directories
        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
            continue;
          }
          // Recursively scan subdirectories
          const subFiles = await this.scanFiles(fullPath, basePath);
          files.push(...subFiles);
        } else {
          // Check if it's a code file
          const ext = path.extname(entry.name).toLowerCase();
          const codeExtensions = [
            '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
            '.py', '.java', '.cpp', '.c', '.h', '.cs',
            '.go', '.rs', '.swift', '.kt', '.rb', '.php',
            '.vue', '.svelte', '.astro'
          ];

          if (codeExtensions.includes(ext)) {
            const lines = await this.countLines(fullPath);
            files.push({
              path: relativePath,
              lines,
              exceedsLimit: lines > this.lineLimit
            });
          }
        }
      }
    } catch (error) {
      // Silently skip directories we can't read
    }

    return files;
  }

  private async countLines(filePath: string): Promise<number> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      return lines.length;
    } catch {
      return 0;
    }
  }

  private getRefactoringRecommendation(file: FileInfo): string {
    const ext = path.extname(file.path).toLowerCase();
    const excess = file.lines - this.lineLimit;

    if (file.path.includes('component') || ['.jsx', '.tsx', '.vue'].includes(ext)) {
      if (excess > 200) {
        return 'Split into multiple components';
      } else if (excess > 100) {
        return 'Extract sub-components and hooks';
      } else {
        return 'Extract utility functions';
      }
    }

    if (file.path.includes('utils') || file.path.includes('helper')) {
      return 'Split into domain-specific utility modules';
    }

    if (file.path.includes('api') || file.path.includes('route')) {
      return 'Extract middleware and validation logic';
    }

    if (file.path.includes('test') || file.path.includes('spec')) {
      return 'Split into separate test suites';
    }

    // Generic recommendations based on size
    if (excess > 300) {
      return 'Consider splitting into multiple modules';
    } else if (excess > 150) {
      return 'Extract reusable functions and types';
    } else {
      return 'Review and extract complex logic';
    }
  }

  async executeForAI(options: { limit?: number } = {}): Promise<void> {
    this.lineLimit = options.limit || 500;
    
    try {
      // Load gitignore
      await this.gitignoreParser.load();
      
      // Scan files
      const files = await this.scanFiles(process.cwd());
      
      // Filter files exceeding limit
      const exceededFiles = files.filter(f => f.exceedsLimit);
      
      if (exceededFiles.length === 0) {
        console.log('All files are within the line limit.');
        return;
      }
      
      console.log(`Files Exceeding ${this.lineLimit} Lines:`);
      exceededFiles
        .sort((a, b) => b.lines - a.lines)
        .forEach(file => {
          const relativePath = path.relative(process.cwd(), file.path);
          const excess = file.lines - this.lineLimit;
          console.log(`- ${relativePath} (${file.lines} lines) - needs ${excess} line reduction`);
        });
      
      console.log('\nRefactoring Recommendations:');
      let recommendationNum = 1;
      exceededFiles
        .sort((a, b) => b.lines - a.lines)
        .slice(0, 5)
        .forEach(file => {
          const relativePath = path.relative(process.cwd(), file.path);
          const recommendation = this.getRefactoringRecommendation(file);
          console.log(`${recommendationNum}. ${recommendation} for ${relativePath}`);
          recommendationNum++;
        });
    } catch (error) {
      console.log(`Error checking line counts: ${error}`);
    }
  }
}