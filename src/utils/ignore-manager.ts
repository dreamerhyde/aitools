import { GitignoreParser } from './gitignore-parser.js';
import { AiToolsConfig } from '../types/config.js';

/**
 * IgnoreManager - Manages file ignore patterns from multiple sources
 *
 * Merge priority (highest to lowest):
 * 1. CLI options (-i flag)
 * 2. config.toml [ignore.{command}]
 * 3. config.toml [ignore.all]
 * 4. .gitignore
 * 5. Built-in defaults
 */
export class IgnoreManager {
  private gitignoreParser: GitignoreParser;
  private config: AiToolsConfig | null = null;
  private commandName: string;
  private cliPatterns: string[] = [];

  constructor(rootPath: string, commandName: string) {
    this.gitignoreParser = new GitignoreParser(rootPath);
    this.commandName = commandName;
  }

  /**
   * Load ignore patterns from .gitignore
   */
  async loadGitignore(): Promise<void> {
    await this.gitignoreParser.load();
  }

  /**
   * Set config patterns from config.toml
   */
  setConfig(config: AiToolsConfig): void {
    this.config = config;
  }

  /**
   * Set CLI patterns from -i option
   */
  setCliPatterns(patterns: string[]): void {
    this.cliPatterns = patterns || [];
  }

  /**
   * Check if a file should be ignored
   * Combines patterns from all sources
   */
  shouldIgnore(filePath: string, isDirectory: boolean): boolean {
    // First check .gitignore
    if (this.gitignoreParser.shouldIgnore(filePath, isDirectory)) {
      return true;
    }

    // Then check config patterns (if any)
    if (this.config?.ignore) {
      const allPatterns = this.config.ignore.all || [];
      const commandPatterns = this.getCommandPatterns();
      const configPatterns = [...allPatterns, ...commandPatterns];

      if (configPatterns.length > 0) {
        const configParser = new GitignoreParser(this.gitignoreParser['rootPath']);
        configParser['patterns'] = [];
        configParser['negativePatterns'] = [];

        // Parse config patterns using same logic as .gitignore
        for (const pattern of configPatterns) {
          if (pattern.startsWith('!')) {
            configParser['negativePatterns'].push(pattern.substring(1));
          } else {
            configParser['patterns'].push(pattern);
          }
        }

        if (configParser.shouldIgnore(filePath, isDirectory)) {
          return true;
        }
      }
    }

    // Finally check CLI patterns
    if (this.cliPatterns.length > 0) {
      const cliParser = new GitignoreParser(this.gitignoreParser['rootPath']);
      cliParser['patterns'] = [];
      cliParser['negativePatterns'] = [];

      for (const pattern of this.cliPatterns) {
        if (pattern.startsWith('!')) {
          cliParser['negativePatterns'].push(pattern.substring(1));
        } else {
          cliParser['patterns'].push(pattern);
        }
      }

      if (cliParser.shouldIgnore(filePath, isDirectory)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get command-specific patterns from config
   */
  private getCommandPatterns(): string[] {
    if (!this.config?.ignore) return [];

    const commandKey = this.commandName as keyof typeof this.config.ignore;
    const patterns = this.config.ignore[commandKey];

    // Empty array means no command-specific patterns
    if (Array.isArray(patterns)) {
      return patterns;
    }

    return [];
  }

  /**
   * Get all active patterns (for debugging)
   */
  getActivePatterns(): {
    gitignore: string[];
    configAll: string[];
    configCommand: string[];
    cli: string[];
  } {
    return {
      gitignore: [...this.gitignoreParser['patterns'], ...this.gitignoreParser['negativePatterns'].map(p => `!${p}`)],
      configAll: this.config?.ignore?.all || [],
      configCommand: this.getCommandPatterns(),
      cli: this.cliPatterns
    };
  }
}
