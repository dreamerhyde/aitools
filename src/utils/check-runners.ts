import chalk from 'chalk';
import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import ora from 'ora';
// GitignoreHelper import removed as it's no longer used

export interface CheckResult {
  tool: string;
  status: 'success' | 'warning' | 'error' | 'skipped';
  errors: number;
  warnings: number;
  files: FileIssue[];
  message?: string;
  duration?: number;
}

export interface FileIssue {
  file: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  rule?: string;
}

export class TypeScriptRunner {
  async run(targetFile?: string, silent?: boolean): Promise<CheckResult> {
    const spinner = silent ? null : ora('Running TypeScript type check...').start();
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const tscPath = path.join(process.cwd(), 'node_modules', '.bin', 'tsc');
      const hasTsc = fs.existsSync(tscPath);
      
      if (!hasTsc) {
        spinner?.fail('TypeScript not found');
        return resolve({
          tool: 'TypeScript',
          status: 'skipped',
          errors: 0,
          warnings: 0,
          files: [],
          message: 'TypeScript not installed in this project'
        });
      }
      
      if (spinner) spinner.text = 'Running TypeScript type check (this may take a moment)...';
      const tscArgs = ['--noEmit', '--pretty', 'false'];
      if (targetFile) {
        tscArgs.push(targetFile);
      }
      const tsc = spawn(tscPath, tscArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
      });
      
      let output = '';
      let errorOutput = '';
      
      tsc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      tsc.stderr.on('data', (data) => {
        errorOutput += data.toString();
        // Keep spinner alive to show progress
        if (spinner) spinner.text = `Running TypeScript type check... (${output.split('\n').length} lines processed)`;
      });
      
      // Add timeout handler
      const timeoutId = setTimeout(() => {
        tsc.kill('SIGKILL');
        spinner?.fail(chalk.red('TypeScript check timed out (60s limit)'));
        resolve({
          tool: 'TypeScript',
          status: 'error',
          errors: 1,
          warnings: 0,
          files: [],
          message: 'TypeScript check timed out - check for circular dependencies or complex types',
          duration: 60000
        });
      }, 60000);
      
      // Add progress indicator with file count estimation
      let progressInterval: NodeJS.Timeout | undefined;
      let fileCount = 0;
      
      // Only show progress if not in silent mode
      if (!silent) {
        // Count TypeScript files to give better progress indication
        setTimeout(() => {
          try {
            // execSync imported at top
            const findCmd = 'find . -path "./node_modules" -prune -o -path "./.next" -prune -o -path "./dist" -prune -o -path "./build" -prune -o \\( -name "*.ts" -o -name "*.tsx" \\) -print | wc -l';
            const result = execSync(findCmd, { encoding: 'utf8', timeout: 3000 });
            fileCount = parseInt(result.trim());
          } catch (e) {
            fileCount = 0;
          }
          
          let dots = 0, estimatedProgress = 0;
          progressInterval = setInterval(() => {
            dots = (dots + 1) % 4;
            const dotStr = '.'.repeat(dots) + ' '.repeat(3 - dots);
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            if (fileCount > 0) {
              estimatedProgress = Math.min(90, Math.floor((elapsed * 10 / fileCount) * 100));
              if (spinner) spinner.text = `TypeScript checking${dotStr} ${estimatedProgress}% (${elapsed}s)`;
            } else {
              if (spinner) spinner.text = `TypeScript checking${dotStr} (${elapsed}s)`;
            }
          }, 500);
        }, 1000);
      }
      
      tsc.on('close', (code) => {
        clearTimeout(timeoutId);
        if (progressInterval) clearInterval(progressInterval);
        
        const duration = Date.now() - startTime;
        const files = this.parseTypeScriptOutput(output + errorOutput);
        const errorCount = files.filter(f => f.severity === 'error').length;
        const warningCount = files.filter(f => f.severity === 'warning').length;
        
        if (code === 0) {
          spinner?.succeed(chalk.green('TypeScript check passed'));
          resolve({
            tool: 'TypeScript',
            status: 'success',
            errors: 0,
            warnings: 0,
            files: [],
            duration
          });
        } else {
          spinner?.fail(chalk.red(`TypeScript found ${errorCount} errors`));
          resolve({
            tool: 'TypeScript',
            status: 'error',
            errors: errorCount,
            warnings: warningCount,
            files,
            duration
          });
        }
      });
    });
  }
  
  private parseTypeScriptOutput(output: string): FileIssue[] {
    const issues: FileIssue[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)/);
      if (match) {
        issues.push({
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          severity: match[4] as 'error' | 'warning',
          message: match[5],
          rule: match[0].match(/TS(\d+)/)?.[1] ? `TS${match[0].match(/TS(\d+)/)?.[1]}` : undefined
        });
      }
    }
    
    return issues;
  }
}

export class ESLintRunner {
  async run(fix?: boolean, targetFile?: string, silent?: boolean): Promise<CheckResult> {
    const spinner = silent ? null : ora('Checking ESLint...').start();
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      // Only check for local ESLint
      const localEslintPath = path.join(process.cwd(), 'node_modules', '.bin', 'eslint');
      const hasLocalEslint = fs.existsSync(localEslintPath);
      
      if (!hasLocalEslint) {
        // No local ESLint found - provide helpful message
        if (!silent) {
          spinner?.fail(chalk.yellow('Local ESLint not found'));
          console.log('\n' + chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
          console.log(chalk.bold('  Local ESLint is required for reliable code checking'));
          console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
          console.log('\nPlease install ESLint as a dev dependency:\n');
          console.log(chalk.cyan('  Using Bun:'));
          console.log('    bun add -d eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser\n');
          console.log(chalk.cyan('  Using npm:'));
          console.log('    npm install --save-dev eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser\n');
          console.log(chalk.dim('  Local ESLint ensures consistent configuration and better performance.'));
          console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
        }
        
        return resolve({
          tool: 'ESLint',
          status: 'skipped',
          errors: 0,
          warnings: 0,
          files: [],
          message: 'Local ESLint not installed - install as dev dependency for reliable checking'
        });
      }
      
      // Check ESLint version and configuration
      // execSync imported at top
      // Note: Version detection removed as it's not currently used
      // Can be re-enabled when needed for version-specific features
      
      // Check if project has ESLint config or package.json lint script
      const configFiles = ['.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', 'eslint.config.js', 'eslint.config.mjs'];
      const hasConfig = configFiles.some(file => fs.existsSync(path.join(process.cwd(), file)));
      
      // Also check for package.json lint script
      // Note: Package script detection removed as usePackageScript is hardcoded to false
      // Can be re-enabled when package script support is implemented
      
      if (!hasConfig) {
        if (!silent) {
          spinner?.info(chalk.yellow('No ESLint configuration found'));
          console.log(chalk.dim('  Run') + chalk.cyan(' ai lint init') + chalk.dim(' to create ESLint configuration'));
          console.log();
        }
        
        return resolve({
          tool: 'ESLint',
          status: 'skipped',
          errors: 0,
          warnings: 0,
          files: [],
          message: 'No configuration - run ai lint init'
        });
      }
      
      // For now, disable package script usage to avoid hanging
      const usePackageScript = false; // !hasConfig && hasLintScript;
      
      const eslintCommand = usePackageScript ? 'npm' : localEslintPath;
      const eslintArgs: string[] = usePackageScript ? ['run', 'lint'] : [];
      if (spinner) spinner.text = 'Running ESLint (local)...';
      
      // Simplified file count - let ESLint handle the file discovery
      const fileCount = 10; // Estimated fallback
      
      let args: string[];
      
      if (usePackageScript) {
        // When using npm run lint, the arguments are already set
        args = eslintArgs;
      } else {
        // Direct ESLint command
        args = [
          ...eslintArgs,
          targetFile || '.',  // Check specific file or current directory
          '--format', 'json',
          '--ext', '.js,.jsx,.ts,.tsx'  // Explicitly specify extensions
        ];
        
      }
      
      if (fix && !usePackageScript) {
        args.push('--fix');
      }
      // Note: fix option with package scripts would need to be handled differently
      
      if (spinner) spinner.text = targetFile ? `ESLint (local): checking ${targetFile}...` : `ESLint (local): checking ${fileCount} files...`;
      
      // Add simple progress indicator with elapsed time
      let progressInterval: NodeJS.Timeout | undefined;
      if (spinner) {
        progressInterval = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const estimatedProgress = Math.min(90, elapsed * 8); // Roughly 8% per second
          if (spinner) spinner.text = `ESLint (local): ${estimatedProgress}% (${elapsed}s of ~${Math.ceil(fileCount/6)}s)`;
        }, 1000);
      }
      
      const eslint = spawn(eslintCommand, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
      });
      let output = '';
      
      eslint.stdout.on('data', (data) => {
        output += data.toString();
        // Update progress based on output
        const lines = output.split('\n').length;
        if (spinner) spinner.text = `ESLint: Processing... (${lines} issues found so far)`;
      });
      
      eslint.stderr.on('data', () => {
        // Handle stderr if needed but don't store it since it's not used
      });
      
      // Increase timeout to 30s for larger projects
      const timeoutId = setTimeout(() => {
        eslint.kill('SIGKILL');
        if (progressInterval) clearInterval(progressInterval);
        if (!silent) {
          spinner?.fail(chalk.red('ESLint check timed out (30s limit)'));
          console.log(chalk.yellow('\nESLint is taking too long. Possible solutions:'));
          console.log('  1. Add .eslintignore file to exclude unnecessary files');
          console.log('  2. Check specific directories: ' + chalk.cyan('eslint src/'));
          console.log('  3. Fix your .eslintrc configuration\n');
        }
        resolve({
          tool: 'ESLint',
          status: 'error',
          errors: 1,
          warnings: 0,
          files: [],
          message: `ESLint timed out checking ${fileCount} files`,
          duration: 30000
        });
      }, 30000);
      
      eslint.on('close', (code) => {
        clearTimeout(timeoutId);
        if (progressInterval) clearInterval(progressInterval);
        const duration = Date.now() - startTime;
        const files = usePackageScript ? 
          this.parseESLintTextOutput(output) : 
          this.parseESLintOutput(output);
        const errorCount = files.filter(f => f.severity === 'error').length;
        const warningCount = files.filter(f => f.severity === 'warning').length;
        
        if (code === 0 && warningCount === 0) {
          spinner?.succeed(chalk.green('ESLint check passed'));
          resolve({
            tool: 'ESLint',
            status: 'success',
            errors: 0,
            warnings: 0,
            files: [],
            duration
          });
        } else if (code === 0 && warningCount > 0) {
          // ESLint returns 0 when only warnings exist
          spinner?.warn(chalk.yellow(`ESLint found ${warningCount} warnings`));
          resolve({
            tool: 'ESLint',
            status: 'warning',
            errors: 0,
            warnings: warningCount,
            files,
            duration
          });
        } else if (errorCount > 0) {
          spinner?.fail(chalk.red(`ESLint found ${errorCount} errors, ${warningCount} warnings`));
          resolve({
            tool: 'ESLint',
            status: 'error',
            errors: errorCount,
            warnings: warningCount,
            files,
            duration
          });
        } else if (warningCount > 0) {
          spinner?.warn(chalk.yellow(`ESLint found ${warningCount} warnings`));
          resolve({
            tool: 'ESLint',
            status: 'warning',
            errors: 0,
            warnings: warningCount,
            files,
            duration
          });
        }
      });
    });
  }
  
  private parseESLintTextOutput(output: string): FileIssue[] {
    const issues: FileIssue[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      // Parse ESLint text format: filepath:line:column: level message [rule]
      const match = line.match(/^(.+):(\d+):(\d+):\s+(error|warning)\s+(.+?)\s+(@\S+|\S+)$/);
      if (match) {
        const [, file, lineNum, column, level, message, rule] = match;
        issues.push({
          file: file.trim(),
          line: parseInt(lineNum),
          column: parseInt(column),
          severity: level as 'error' | 'warning',
          message: message.trim(),
          rule: rule.replace(/[@[\]]/g, '')
        });
      }
    }
    
    return issues;
  }

  private parseESLintOutput(output: string): FileIssue[] {
    const issues: FileIssue[] = [];
    
    try {
      const results = JSON.parse(output);
      
      for (const file of results) {
        for (const message of file.messages) {
          issues.push({
            file: file.filePath,
            line: message.line,
            column: message.column,
            severity: message.severity === 2 ? 'error' : 'warning',
            message: message.message,
            rule: message.ruleId
          });
        }
      }
    } catch (e) {
      // Fallback to text parsing if JSON fails
    }
    
    return issues;
  }
}

export class BuildRunner {
  async run(): Promise<CheckResult> {
    const spinner = ora('Checking build status...').start();
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const packageJson = path.join(process.cwd(), 'package.json');
      
      if (!fs.existsSync(packageJson)) {
        spinner.fail('No package.json found');
        return resolve({
          tool: 'Build',
          status: 'skipped',
          errors: 0,
          warnings: 0,
          files: [],
          message: 'No package.json in current directory'
        });
      }
      
      const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf-8'));
      
      if (!pkg.scripts?.build) {
        spinner.info('No build script defined');
        return resolve({
          tool: 'Build',
          status: 'skipped',
          errors: 0,
          warnings: 0,
          files: [],
          message: 'No build script in package.json'
        });
      }
      
      const runner = fs.existsSync(path.join(process.cwd(), 'bun.lockb')) ? 'bun' : 'npm';
      const build = spawn(runner, ['run', 'build']);
      let errorOutput = '';
      
      build.stdout.on('data', () => {
        // Handle stdout if needed
      });
      
      build.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      build.on('close', (code) => {
        const duration = Date.now() - startTime;
        
        if (code === 0) {
          spinner.succeed(chalk.green('Build successful'));
          resolve({
            tool: 'Build',
            status: 'success',
            errors: 0,
            warnings: 0,
            files: [],
            duration
          });
        } else {
          spinner.fail(chalk.red('Build failed'));
          resolve({
            tool: 'Build',
            status: 'error',
            errors: 1,
            warnings: 0,
            files: [{
              file: 'build',
              severity: 'error',
              message: errorOutput || 'Build process failed'
            }],
            duration
          });
        }
      });
    });
  }
}