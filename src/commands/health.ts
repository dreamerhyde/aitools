import chalk from 'chalk';
import { UIHelper } from '../utils/ui.js';
import { HealthDisplay } from '../utils/health-display.js';
import { FileScanner } from '../utils/file-scanner.js';
import { CodeAnalyzer, FileHealth } from '../utils/code-analyzer.js';

interface HealthReport {
  oversizedFiles: FileHealth[];
  totalFiles: number;
  healthScore: number;
  criticalFiles: FileHealth[];
}

export interface HealthOptions {
  path?: string;
  threshold?: number;
  ignore?: string[];
  format?: 'table' | 'json' | 'detailed';
  fix?: boolean;
}

export class HealthCommand {
  private readonly display = new HealthDisplay();
  private readonly scanner = new FileScanner();
  private readonly analyzer = new CodeAnalyzer();

  async execute(options: HealthOptions = {}): Promise<void> {
    const thresholds = this.analyzer.getThresholds();
    const threshold = options.threshold || thresholds.LINE_THRESHOLD;
    const searchPath = options.path || process.cwd();
    
    UIHelper.showHeader();
    console.log(chalk.bold.cyan('Code Health Check'));
    console.log(chalk.gray('Analyzing code quality for Vibe Coding...'));
    console.log('─'.repeat(40));
    
    const spinner = UIHelper.createSpinner('Scanning codebase...');
    spinner.start();
    
    try {
      const files = await this.scanner.findCodeFiles(searchPath, options.ignore || []);
      const fileHealthData = await this.analyzeFiles(files, threshold);
      
      spinner.stop();
      
      const report = this.generateReport(
        fileHealthData, 
        files.length, 
        threshold, 
        thresholds.CRITICAL_THRESHOLD
      );
      
      this.display.displayReport(report, options.format || 'table', threshold);
      
    } catch (error) {
      spinner.stop();
      UIHelper.showError(`Health check failed: ${error}`);
      process.exit(1);
    }
  }
  
  private async analyzeFiles(files: string[], threshold: number): Promise<FileHealth[]> {
    const fileHealthData: FileHealth[] = [];
    
    for (const file of files) {
      const health = await this.analyzer.analyzeFile(file, threshold);
      if (health) {
        fileHealthData.push(health);
      }
    }
    
    return fileHealthData;
  }
  
  private generateReport(
    files: FileHealth[], 
    totalFiles: number, 
    threshold: number,
    criticalThreshold: number
  ): HealthReport {
    const oversizedFiles = files.filter(f => f.lines > threshold);
    const criticalFiles = files.filter(f => f.lines > criticalThreshold);
    
    const avgLines = files.reduce((sum, f) => sum + f.lines, 0) / (files.length || 1);
    const healthScore = Math.max(0, Math.min(100, 100 - (avgLines / threshold) * 50));
    
    return {
      oversizedFiles: oversizedFiles.sort((a, b) => b.lines - a.lines),
      criticalFiles,
      totalFiles,
      healthScore: Math.round(healthScore)
    };
  }
}

// For backward compatibility with HealthCommandV2
export class HealthCommandV2 extends HealthCommand {}