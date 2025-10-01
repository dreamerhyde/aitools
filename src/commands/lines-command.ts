import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';
import { UIHelper } from '../utils/ui.js';
import chalk from 'chalk';
import { Separator } from '../utils/separator.js';
import { IgnoreManager } from '../utils/ignore-manager.js';
import { ConfigManager } from '../utils/config-manager.js';
import { SuggestionFormatter } from '../utils/suggestion-formatter.js';

interface FileInfo {
  path: string;
  lines: number;
  exceedsLimit: boolean;
}

export class LinesCommand {
  private ignoreManager: IgnoreManager;
  private configManager: ConfigManager;
  private lineLimit: number = 500;

  constructor() {
    this.ignoreManager = new IgnoreManager(process.cwd(), 'lines');
    this.configManager = new ConfigManager();
  }

  async executeWithResults(): Promise<any> {
    try {
      // Load config to get line limit and ignore patterns
      const config = await this.configManager.load();
      this.lineLimit = config.line_limit || 500;

      // Load ignore patterns (.gitignore + config)
      await this.ignoreManager.loadGitignore();
      this.ignoreManager.setConfig(config);

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
    fail?: boolean;
  } = {}): Promise<void> {
    try {
      // Load config to get line limit and ignore patterns
      const config = await this.configManager.load();
      this.lineLimit = options.limit || config.line_limit || 500;

      const targetPath = path.resolve(options.path || '.');

      // Load ignore patterns (.gitignore + config)
      await this.ignoreManager.loadGitignore();
      this.ignoreManager.setConfig(config);

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
      console.log(chalk.bold(`File Line Count Check (limit: ${this.lineLimit} lines)`));
      console.log(Separator.short());

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
          `  ${chalk.yellow('▪')} ${chalk.cyan(file.path)} - ` +
          `${chalk.bold(file.lines)} lines ` +
          chalk.yellow(`(+${excess} lines, ${percentage}% over)`)
        );
      }

      // Show suggestion with consistent format
      SuggestionFormatter.show(SuggestionFormatter.REFACTOR_LINES, true);

      // Don't exit with error code in normal usage (only for CI/CD with --fail flag)
      // This prevents Warp from showing error blocks
      if (exceededFiles.length > 0 && options.fail) {
        process.exit(1);
      }

    } catch (error) {
      if (error instanceof Error) {
        UIHelper.showError(`Failed to check file lines: ${error.message}`);
      }
      // Don't exit with error code to avoid Warp showing error blocks
      // The error message is enough for users to understand something went wrong
    }
  }

  private async scanFiles(dirPath: string, basePath: string = dirPath): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(basePath, fullPath);

        // Skip if ignored (includes .gitignore + config patterns)
        if (this.ignoreManager.shouldIgnore(fullPath, entry.isDirectory())) {
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


  async executeForAI(options: { limit?: number; targetFile?: string } = {}): Promise<void> {
    this.lineLimit = options.limit || 500;
    
    try {
      // If a specific file is provided, only check that file
      if (options.targetFile) {
        const filePath = path.resolve(options.targetFile);
        if (fsSync.existsSync(filePath) && fsSync.statSync(filePath).isFile()) {
          const content = fsSync.readFileSync(filePath, 'utf-8');
          const lines = content.split('\n').length;
          
          if (lines > this.lineLimit) {
            const relativePath = path.relative(process.cwd(), filePath);
            const excess = lines - this.lineLimit;
            
            // Output to stdout for AI to see
            console.log(`File Length Warning:`);
            console.log(`- ${relativePath} (${lines} lines) exceeds limit by ${excess} lines`);
            // For AI: plain text without formatting
            SuggestionFormatter.show(SuggestionFormatter.REFACTOR_LINES, false);
            
            // Also output to stderr for user to see in Claude Code terminal
            console.error(chalk.yellow('\n⚠ File Length Warning'));
            console.error(chalk.gray(`  ${relativePath}: ${lines} lines (${excess} over limit)`));
          }
          // Don't output anything if the file is within limits - AI doesn't need to know
        }
        return;
      }
      
      // Default behavior: scan all files
      // Load ignore patterns (.gitignore + config)
      const config = await this.configManager.load();
      await this.ignoreManager.loadGitignore();
      this.ignoreManager.setConfig(config);

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
      
      // For AI: plain text without formatting
      SuggestionFormatter.show(SuggestionFormatter.REFACTOR_LINES, false);
    } catch (error) {
      console.log(`Error checking line counts: ${error}`);
    }
  }
}