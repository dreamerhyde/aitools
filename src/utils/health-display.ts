import chalk from 'chalk';
import { relative, basename, extname } from 'path';

interface FileHealth {
  path: string;
  lines: number;
  size: string;
  complexity: number;
  issues: string[];
  suggestions: string[];
}

interface HealthReport {
  oversizedFiles: FileHealth[];
  totalFiles: number;
  healthScore: number;
  criticalFiles: FileHealth[];
}

export class HealthDisplay {
  private readonly LINE_THRESHOLD = 500;
  private readonly CRITICAL_THRESHOLD = 1000;
  private readonly COMPLEXITY_THRESHOLD = 10;

  displayReport(report: HealthReport, format: string, threshold: number): void {
    console.log();
    
    // Health Score with cleaner format
    const scoreColor = report.healthScore > 70 ? chalk.green : 
                      report.healthScore > 40 ? chalk.yellow : 
                      chalk.red;
    
    console.log(chalk.bold('Overall Health Score'));
    console.log('─'.repeat(40));
    console.log(`  Score: ${scoreColor.bold(report.healthScore + '/100')}`);
    console.log(`  Files analyzed: ${report.totalFiles}`);
    console.log(`  Files needing attention: ${chalk.yellow(report.oversizedFiles.length.toString())}`);
    
    if (report.criticalFiles.length > 0) {
      console.log(`  Critical files: ${chalk.red(report.criticalFiles.length.toString())}`);
    }
    
    if (report.oversizedFiles.length === 0) {
      console.log();
      console.log(chalk.green('✓ All files are within healthy size limits!'));
      console.log(chalk.gray('  Keep vibing with clean, maintainable code'));
      return;
    }
    
    // Files list with improved format
    console.log();
    console.log(chalk.bold('Files Needing Attention'));
    console.log('─'.repeat(40));
    console.log();
    
    // Simple, clean format without table borders
    for (const file of report.oversizedFiles.slice(0, 10)) {
      const relativePath = relative(process.cwd(), file.path);
      const lineColor = file.lines > this.CRITICAL_THRESHOLD ? chalk.red :
                       file.lines > this.LINE_THRESHOLD ? chalk.yellow :
                       chalk.white;
      
      // Clean format with aligned columns
      const status = file.lines > this.CRITICAL_THRESHOLD ? chalk.red('●') :
                    file.lines > 700 ? chalk.yellow('●') :
                    chalk.gray('○');
                    
      console.log(`  ${status} ${relativePath}`);
      console.log(`     ${chalk.gray('Lines:')} ${lineColor.bold(file.lines.toString().padEnd(6))} ${chalk.gray('Size:')} ${file.size.padEnd(8)} ${chalk.gray('Complexity:')} ${file.complexity}`);
      
      if (file.issues.length > 1) {
        console.log(`     ${chalk.yellow(file.issues.slice(1).join(', '))}`);
      }
      console.log();
    }
    
    if (report.oversizedFiles.length > 10) {
      console.log(chalk.gray(`  ... and ${report.oversizedFiles.length - 10} more files`));
      console.log();
    }
    
    // Call the refactoring suggestions
    this.showRefactoringSection(report);
  }

  private showRefactoringSection(report: HealthReport): void {
    console.log(chalk.bold('AI Refactoring Guide'));
    console.log('─'.repeat(40));
    console.log();
    
    // Quick suggestions
    console.log(chalk.cyan('Quick Actions:'));
    console.log('  1. Copy the prompt below to your AI assistant');
    console.log('  2. The AI will analyze and suggest refactoring');
    console.log('  3. Review and apply the suggested changes');
    console.log();
    
    // Generate copy-ready prompt
    this.generateCopyPrompt(report);
  }

  private generateCopyPrompt(report: HealthReport): void {
    console.log(chalk.bold.green('→ Copy-Paste Ready AI Prompt:'));
    console.log(chalk.gray('  (Select all text between the lines below)'));
    console.log();
    console.log(chalk.gray('━'.repeat(70)));
    console.log();
    
    // Build the prompt
    const prompt: string[] = [];
    
    prompt.push('I need help refactoring these files to improve code quality:');
    prompt.push('');
    
    // Add file information
    for (const file of report.oversizedFiles.slice(0, 3)) {
      const relativePath = relative(process.cwd(), file.path);
      const ext = extname(file.path);
      
      prompt.push(`File: ${relativePath}`);
      prompt.push(`- Current lines: ${file.lines}`);
      prompt.push(`- Target: < 500 lines (needs to reduce ${file.lines - 500} lines)`);
      prompt.push(`- Complexity: ${file.complexity}`);
      
      if (file.issues.length > 0) {
        prompt.push(`- Issues: ${file.issues.join(', ')}`);
      }
      
      // Add specific refactoring requirements
      if (file.lines > this.CRITICAL_THRESHOLD) {
        const modules = Math.ceil(file.lines / 400); // Target ~400 lines per module for safety
        prompt.push(`- Action: Split into ${modules} modules (~${Math.floor(file.lines / modules)} lines each)`);
      } else if (file.lines > 500) {
        prompt.push(`- Action: Extract ${Math.ceil((file.lines - 450) / 50)} components/modules to get under 500 lines`);
      }
      
      if (file.complexity > this.COMPLEXITY_THRESHOLD) {
        prompt.push(`- Action: Reduce complexity from ${file.complexity} to <10 by extracting functions`);
      }
      
      // Language-specific guidance
      if (ext === '.tsx' || ext === '.jsx') {
        prompt.push('- Framework: React - extract reusable components');
      } else if (ext === '.ts' || ext === '.js') {
        prompt.push('- Focus: Extract services and utility functions');
      } else if (ext === '.py') {
        prompt.push('- Focus: Split into modules following Python conventions');
      }
      
      prompt.push('');
    }
    
    prompt.push('Refactoring Requirements:');
    prompt.push('1. CRITICAL: Each file MUST be under 500 lines after refactoring');
    prompt.push('2. Target 300-400 lines per file for better maintainability');
    prompt.push('3. Complexity should be under 10 per module');
    prompt.push('4. Follow SOLID principles (Single Responsibility especially)');
    prompt.push('5. Maintain 100% existing functionality');
    prompt.push('6. Create clear module boundaries');
    prompt.push('7. Update all imports/exports properly');
    prompt.push('');
    prompt.push('Expected Output:');
    prompt.push('1. Module breakdown showing file names and line counts:');
    prompt.push('   - ComponentA.tsx (~300 lines)');
    prompt.push('   - ComponentB.tsx (~250 lines)');
    prompt.push('   - utils/helpers.ts (~150 lines)');
    prompt.push('2. Complete code for each new module');
    prompt.push('3. Updated imports for existing code');
    prompt.push('4. Verification that no file exceeds 500 lines');
    
    // Output the prompt in a copy-friendly format with clean indentation
    const promptLines = prompt.join('\n').split('\n');
    
    // Display each line without extra formatting for easy copying
    promptLines.forEach(line => {
      console.log(line);
    });
    
    console.log();
    console.log(chalk.gray('━'.repeat(70)));
    console.log();
    
    // Additional tips
    console.log(chalk.green('→ Tip: Select and copy the text above'));
    console.log(chalk.gray('  Works with: Claude, ChatGPT, GitHub Copilot Chat'));
    console.log();
    
    // Show file paths for easy reference
    if (report.oversizedFiles.length > 0) {
      console.log(chalk.bold('File paths for reference:'));
      console.log();
      for (const file of report.oversizedFiles.slice(0, 5)) {
        const relativePath = relative(process.cwd(), file.path);
        console.log(`  ${chalk.cyan(relativePath)}`);
      }
      console.log();
    }
  }
}