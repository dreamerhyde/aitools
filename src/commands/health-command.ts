import chalk from 'chalk';
import Table from 'cli-table3';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import ora from 'ora';

interface FileHealth {
  file: string;
  lines: number;
  size: number;
  complexity: number;
  issues: string[];
  functions: number;
  classes: number;
  imports: number;
  exports: number;
}

export class HealthCommand {
  private healthScore = 100;
  private filesAnalyzed = 0;
  private filesWithIssues: FileHealth[] = [];
  
  async execute(options: { 
    path?: string;
    ignore?: string[];
    threshold?: number;
  }): Promise<void> {
    const targetPath = options.path || process.cwd();
    const ignorePatterns = options.ignore || ['node_modules', 'dist', 'build', '.git', 'coverage'];
    const threshold = options.threshold || 500; // Default 500 lines threshold
    
    console.log(chalk.bold('\n▪ AI Tools CLI'));
    console.log('Process Monitor & Management');
    console.log(chalk.dim('─'.repeat(30)));
    console.log(chalk.bold('Code Health Check'));
    console.log('Analyzing code quality for Vibe Coding...');
    console.log(chalk.dim('─'.repeat(process.stdout.columns || 80)));
    
    const spinner = ora('Scanning project files...').start();
    
    // Scan for TypeScript and JavaScript files
    const files = this.scanFiles(targetPath, ignorePatterns);
    
    spinner.text = 'Analyzing file complexity...';
    
    // Analyze each file
    for (const file of files) {
      const health = await this.analyzeFile(file, threshold);
      this.filesAnalyzed++;
      
      if (health.issues.length > 0) {
        this.filesWithIssues.push(health);
        this.healthScore -= Math.min(3, health.issues.length);
      }
    }
    
    this.healthScore = Math.max(0, this.healthScore);
    
    spinner.succeed(`Analysis complete. Analyzed ${this.filesAnalyzed} files`);
    
    // Display results
    this.displayOverallHealth();
    this.displayFilesNeedingAttention();
    this.generateAIRefactoringGuide();
  }
  
  private scanFiles(targetPath: string, ignorePatterns: string[]): string[] {
    const files: string[] = [];
    
    const scan = (dir: string) => {
      try {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const relativePath = path.relative(targetPath, fullPath);
          
          // Check if should ignore
          if (ignorePatterns.some(pattern => relativePath.includes(pattern))) {
            continue;
          }
          
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            scan(fullPath);
          } else if (stat.isFile() && /\.(ts|tsx|js|jsx)$/.test(item)) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };
    
    scan(targetPath);
    return files;
  }
  
  private async analyzeFile(filePath: string, threshold: number): Promise<FileHealth> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const stats = fs.statSync(filePath);
    const relativePath = path.relative(process.cwd(), filePath);
    
    const health: FileHealth = {
      file: relativePath,
      lines: lines.length,
      size: stats.size,
      complexity: 0,
      issues: [],
      functions: 0,
      classes: 0,
      imports: 0,
      exports: 0
    };
    
    // Count various code elements
    let currentIndent = 0;
    let maxIndent = 0;
    let braceDepth = 0;
    let maxBraceDepth = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Count functions
      if (/^(async\s+)?function\s+\w+|^\w+\s*:\s*(async\s+)?\(.*\)\s*=>|^\w+\s*\(.*\)\s*\{/.test(trimmed)) {
        health.functions++;
      }
      
      // Count classes
      if (/^(export\s+)?(abstract\s+)?class\s+\w+/.test(trimmed)) {
        health.classes++;
      }
      
      // Count imports
      if (/^import\s+/.test(trimmed)) {
        health.imports++;
      }
      
      // Count exports
      if (/^export\s+/.test(trimmed)) {
        health.exports++;
      }
      
      // Track nesting depth
      const leadingSpaces = line.match(/^(\s*)/)?.[1].length || 0;
      currentIndent = Math.floor(leadingSpaces / 2);
      maxIndent = Math.max(maxIndent, currentIndent);
      
      // Track brace depth
      for (const char of trimmed) {
        if (char === '{') braceDepth++;
        if (char === '}') braceDepth--;
        maxBraceDepth = Math.max(maxBraceDepth, braceDepth);
      }
    }
    
    // Calculate complexity (simplified cyclomatic complexity)
    health.complexity = health.functions + health.classes + Math.floor(maxBraceDepth / 2);
    
    // Add conditions and loops to complexity
    const conditions = content.match(/\b(if|else if|switch|case|while|for|do|catch)\b/g);
    health.complexity += conditions ? conditions.length : 0;
    
    // Identify issues
    if (health.lines > threshold) {
      health.issues.push(`Large file: ${health.lines} lines`);
    }
    
    if (health.complexity > 10) {
      health.issues.push(`High complexity: ${health.complexity}`);
    }
    
    if (health.functions > 20) {
      health.issues.push(`Many functions (${health.functions})`);
    }
    
    if (health.classes > 1 && health.classes < 5) {
      health.issues.push(`Multiple classes (${health.classes})`);
    }
    
    if (health.classes >= 5) {
      health.issues.push(`God class (${health.functions} methods)`);
    }
    
    if (maxIndent > 6) {
      health.issues.push('Deep nesting detected');
    }
    
    return health;
  }
  
  private displayOverallHealth(): void {
    console.log('\n' + chalk.bold('Overall Health Score'));
    console.log(chalk.dim('─'.repeat(process.stdout.columns || 80)));
    
    const scoreColor = 
      this.healthScore >= 80 ? chalk.green :
      this.healthScore >= 60 ? chalk.yellow :
      chalk.red;
    
    console.log('  ' + chalk.bold('Score: ') + scoreColor.bold(`${this.healthScore}/100`));
    console.log('  ' + chalk.bold('Files analyzed: ') + chalk.cyan(this.filesAnalyzed));
    console.log('  ' + chalk.bold('Files needing attention: ') + 
      (this.filesWithIssues.length > 0 ? chalk.yellow(this.filesWithIssues.length) : chalk.green('0')));
  }
  
  private displayFilesNeedingAttention(): void {
    if (this.filesWithIssues.length === 0) {
      console.log('\n' + chalk.green('✓ All files are healthy!'));
      return;
    }
    
    console.log('\n' + chalk.bold('Files Needing Attention'));
    console.log(chalk.dim('─'.repeat(process.stdout.columns || 80)));
    
    // Sort by number of issues and lines
    const sorted = this.filesWithIssues.sort((a, b) => {
      if (b.issues.length !== a.issues.length) {
        return b.issues.length - a.issues.length;
      }
      return b.lines - a.lines;
    }).slice(0, 10); // Show top 10 problematic files
    
    for (const file of sorted) {
      console.log();
      console.log('  ' + chalk.gray('○') + ' ' + chalk.cyan(file.file));
      
      const sizeKB = (file.size / 1024).toFixed(1);
      const metadata = [
        `Lines: ${chalk.yellow(file.lines)}`,
        `Size: ${chalk.yellow(sizeKB + 'KB')}`,
        `Complexity: ${chalk.yellow(file.complexity)}`
      ];
      
      console.log('     ' + metadata.join('    '));
      
      if (file.issues.length > 0) {
        console.log('     ' + chalk.red(file.issues.join(', ')));
      }
    }
  }
  
  private generateAIRefactoringGuide(): void {
    if (this.filesWithIssues.length === 0) return;
    
    console.log('\n' + chalk.bold('AI Refactoring Guide'));
    console.log(chalk.dim('─'.repeat(process.stdout.columns || 80)));
    
    console.log('\n' + chalk.bold('Quick Actions:'));
    console.log('  1. Copy the prompt below to your AI assistant');
    console.log('  2. The AI will analyze and suggest refactoring');
    console.log('  3. Review and apply the suggested changes');
    
    console.log('\n' + chalk.cyan('→ Copy-Paste Ready AI Prompt:'));
    console.log('  ' + chalk.gray('(Select all text between the lines below)'));
    
    console.log('\n' + chalk.dim('━'.repeat(72)));
    console.log('\nI need help refactoring these files to improve code quality:\n');
    
    // Generate refactoring recommendations for top 3 files
    const topFiles = this.filesWithIssues.slice(0, 3);
    
    for (const file of topFiles) {
      console.log(`File: ${file.file}`);
      console.log(`- Current lines: ${file.lines}`);
      
      if (file.lines > 500) {
        const reduction = file.lines - 500;
        const modules = Math.ceil(reduction / 150);
        console.log(`- Target: < 500 lines (needs to reduce ${reduction} lines)`);
        console.log(`- Complexity: ${file.complexity}`);
        console.log(`- Issues: ${file.issues.join(', ')}`);
        console.log(`- Action: Extract ${modules} components/modules to get under 500 lines`);
      }
      
      if (file.complexity > 10) {
        console.log(`- Action: Reduce complexity from ${file.complexity} to <10 by extracting functions`);
      }
      
      if (file.functions > 20 || file.classes > 1) {
        console.log('- Focus: Extract services and utility functions');
      }
      
      console.log();
    }
    
    console.log('Refactoring Requirements:');
    console.log('1. CRITICAL: Each file MUST be under 500 lines after refactoring');
    console.log('2. Target 300-400 lines per file for better maintainability');
    console.log('3. Complexity should be under 10 per module');
    console.log('4. Follow SOLID principles (Single Responsibility especially)');
    console.log('5. Maintain 100% existing functionality');
    console.log('6. Create clear module boundaries');
    console.log('7. Update all imports/exports properly');
    
    console.log('\nExpected Output:');
    console.log('1. Module breakdown showing file names and line counts:');
    console.log('   - ComponentA.tsx (~300 lines)');
    console.log('   - ComponentB.tsx (~250 lines)');
    console.log('   - utils/helpers.ts (~150 lines)');
    console.log('2. Complete code for each new module');
    console.log('3. Updated imports for existing code');
    console.log('4. Verification that no file exceeds 500 lines');
    
    console.log('\n' + chalk.dim('━'.repeat(72)));
    
    console.log('\n' + chalk.cyan('→ Tip: ') + chalk.gray('Select and copy the text above'));
    console.log('  ' + chalk.gray('Works with: Claude, ChatGPT, GitHub Copilot Chat'));
    
    console.log('\n' + chalk.bold('File paths for reference:') + '\n');
    for (const file of topFiles) {
      console.log('  ' + file.file);
    }
  }
}