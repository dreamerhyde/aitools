import { promises as fs } from 'fs';
import path from 'path';
import { UIHelper } from '../utils/ui.js';
import { GitignoreParser } from '../utils/gitignore-parser.js';
import chalk from 'chalk';

export interface TreeOptions {
  filesOnly?: boolean;
  addIgnore?: string[];
  path?: string;
  maxDepth?: number;
  respectGitignore?: boolean;
}

interface TreeStats {
  directories: number;
  files: number;
}

export class TreeCommand {
  private ignorePatterns: Set<string>;
  private stats: TreeStats;
  private gitignoreParser?: GitignoreParser;

  constructor() {
    this.ignorePatterns = new Set();
    this.stats = { directories: 0, files: 0 };
  }

  async execute(options: TreeOptions = {}): Promise<void> {
    const targetPath = path.resolve(options.path || '.');
    const dirName = path.basename(targetPath);

    try {
      // Check if target path exists
      const stats = await fs.stat(targetPath);
      if (!stats.isDirectory()) {
        UIHelper.showError(`Path ${targetPath} is not a directory`);
        process.exit(1);
      }

      // Always load gitignore by default (unless explicitly disabled)
      if (options.respectGitignore !== false) {
        this.gitignoreParser = new GitignoreParser(targetPath);
        await this.gitignoreParser.load();
      }
      
      // Initialize minimal ignore patterns (only truly essential ones)
      this.initializeIgnorePatterns(options);

      // Reset stats
      this.stats = { directories: 0, files: 0 };

      // Generate tree (only show spinner for large directories)
      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      
      let spinner: any = null;
      if (entries.length > 20) {
        spinner = UIHelper.showSpinner('Generating directory tree...');
      }
      
      // Clear any spinner output
      if (spinner) {
        spinner.stop();
        spinner.clear();
      }
      
      // Now display the tree
      console.log(chalk.bold(dirName));
      
      await this.buildTree(targetPath, '', true, options.filesOnly || false, options.maxDepth || Infinity);

      // Show summary
      this.showSummary();

    } catch (error) {
      if (error instanceof Error) {
        UIHelper.showError(`Failed to generate tree: ${error.message}`);
      }
      process.exit(1);
    }
  }

  private initializeIgnorePatterns(options: TreeOptions): void {
    // Minimal default ignore patterns - only essential system/tool directories
    // Most patterns should come from .gitignore
    const defaultIgnore = [
      '.git',  // Always ignore git directory
      'node_modules'  // Too large to display
    ];

    // Add patterns to set
    defaultIgnore.forEach(pattern => this.ignorePatterns.add(pattern));

    // Add custom ignore patterns
    if (options.addIgnore) {
      options.addIgnore.forEach(pattern => this.ignorePatterns.add(pattern));
    }
  }

  private shouldIgnore(name: string, showFiles: boolean, isDirectory: boolean): boolean {
    // Check exact match
    if (this.ignorePatterns.has(name)) {
      return true;
    }

    // In directory-only mode, skip all files
    if (!showFiles && !isDirectory) {
      return true;
    }

    // Check patterns
    for (const pattern of this.ignorePatterns) {
      // Support wildcards
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        if (regex.test(name)) {
          return true;
        }
      }
    }

    return false;
  }

  private async buildTree(
    dirPath: string,
    prefix: string,
    isLast: boolean,
    showFiles: boolean,
    maxDepth: number,
    currentDepth: number = 0
  ): Promise<void> {
    if (currentDepth >= maxDepth) {
      return;
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      // Filter and sort entries
      const filteredEntries = entries
        .filter(entry => {
          // Don't filter hidden directories/files - let other filters handle them
          
          // Check gitignore patterns if enabled
          if (this.gitignoreParser) {
            const entryPath = path.join(dirPath, entry.name);
            if (this.gitignoreParser.shouldIgnore(entryPath, entry.isDirectory())) {
              return false;
            }
          }
          
          return !this.shouldIgnore(entry.name, showFiles, entry.isDirectory());
        })
        .sort((a, b) => {
          // VSCode style sorting: case-insensitive alphabetical, mixed files and directories
          // Hidden items (starting with .) come first
          const aIsHidden = a.name.startsWith('.');
          const bIsHidden = b.name.startsWith('.');
          
          if (aIsHidden && !bIsHidden) return -1;
          if (!aIsHidden && bIsHidden) return 1;
          
          // Case-insensitive alphabetical sort
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });

      for (let i = 0; i < filteredEntries.length; i++) {
        const entry = filteredEntries[i];
        const isLastEntry = i === filteredEntries.length - 1;
        const entryPath = path.join(dirPath, entry.name);

        // Determine the tree characters with dim color
        const connector = chalk.dim(isLastEntry ? '└── ' : '├── ');
        const extension = chalk.dim(isLastEntry ? '    ' : '│   ');

        // Format entry name
        let displayName = entry.name;
        if (entry.isDirectory()) {
          displayName = chalk.blue(displayName + '/');
          this.stats.directories++;
        } else {
          this.stats.files++;
          // Color files based on extension
          const ext = path.extname(entry.name).toLowerCase();
          if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
            displayName = chalk.yellow(displayName);
          } else if (['.json', '.xml', '.yaml', '.yml'].includes(ext)) {
            displayName = chalk.green(displayName);
          } else if (['.md', '.txt', '.log'].includes(ext)) {
            displayName = chalk.gray(displayName);
          }
        }

        // Print the entry (connector already has dim color)
        console.log(prefix + connector + displayName);

        // Recursively process directories
        if (entry.isDirectory()) {
          await this.buildTree(
            entryPath,
            prefix + extension,
            isLastEntry,
            showFiles,
            maxDepth,
            currentDepth + 1
          );
        }
      }
    } catch (error) {
      // Silently skip directories we can't read
      if (error instanceof Error && 'code' in error && error.code === 'EACCES') {
        console.log(prefix + '└── ' + chalk.red('[Permission Denied]'));
      }
    }
  }

  private showSummary(): void {
    console.log('');
    UIHelper.showSuccess(`Summary: ${this.stats.directories} directories, ${this.stats.files} files`);
  }
}