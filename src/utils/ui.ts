import chalk from 'chalk';
import { table } from 'table';
import ora from 'ora';
import { ProcessInfo, SystemStats, HookDetectionResult } from '../types/index.js';
import { TABLE_CHARS } from './table-config.js';

export class UIHelper {
  static createSpinner(text: string) {
    return ora({
      text: chalk.cyan(text),
      spinner: 'dots12'
    });
  }

  static showSpinner(text: string) {
    return ora({
      text: chalk.cyan(text),
      spinner: 'dots12'
    }).start();
  }

  static showHeader() {
    console.log();
    console.log(chalk.bold.cyan('▪ AI Tools CLI'));
    console.log(chalk.gray('Process Monitor & Management'));
    console.log(chalk.hex('#303030')('─'.repeat(30)));
  }

  static showSystemStats(stats: SystemStats) {
    console.log(chalk.bold.yellow('\n▪ System Status'));
    console.log(chalk.hex('#303030')('─'.repeat(30)));
    
    const data = [
      ['Metric', 'Value'],
      ['CPU Usage', `${stats.cpuUsage.toFixed(1)}%`],
      ['Load Average', `${stats.loadAverage.map(l => l.toFixed(2)).join(', ')}`],
      ['Total Memory', stats.totalMemory],
      ['Free Memory', stats.freeMemory],
      ['Active Memory', stats.activeMemory]
    ];

    const config = {
      columnDefault: {
        paddingLeft: 1,
        paddingRight: 1
      },
      columns: {
        0: { alignment: 'left' as const },
        1: { alignment: 'right' as const }
      }
    };

    console.log(table(data, config));
  }

  static showProcessTable(processes: ProcessInfo[], title: string, limit = 10) {
    if (processes.length === 0) {
      console.log(chalk.green(`\n✓ ${title}: No issues found`));
      return;
    }

    // Format times and calculate dynamic Time column width
    const formattedProcesses = processes.slice(0, limit).map(proc => ({
      ...proc,
      formattedTime: this.formatElapsedTime(proc.startTime)
    }));

    const timeColumnWidth = Math.max(
      10, // Minimum width for header
      ...formattedProcesses.map(proc => proc.formattedTime.length + 2) // +2 for padding
    );

    // Get terminal width for responsive layout
    const terminalWidth = process.stdout.columns || 120;
    const minCommandWidth = 40;
    const fixedColumnsWidth = 7 + 6 + 6 + timeColumnWidth + 6 + 10; // PID + CPU% + MEM% + Time(dynamic) + Status + padding
    const availableCommandWidth = Math.max(minCommandWidth, terminalWidth - fixedColumnsWidth - 10);

    // Title with count indicator
    console.log();
    console.log(chalk.bold.yellow(`${title} ${chalk.gray(`(${processes.length})`)}`)  );
    console.log(chalk.hex('#303030')('─'.repeat(Math.min(terminalWidth - 2, 120))));

    // Clean table data for the table library
    const data = [];
    
    // Header row with clean styling
    data.push([
      chalk.bold.cyan('PID'),
      chalk.bold.cyan('CPU%'),
      chalk.bold.cyan('MEM%'),
      chalk.bold.cyan('Time'),
      chalk.bold.cyan('Status'),
      chalk.bold.cyan('Command')
    ]);

    // Process rows
    formattedProcesses.forEach(proc => {
      // Detect abnormal processes
      const isClaudeHook = proc.command.includes('.claude/hooks/');
      const isSleepingWithCPU = proc.status === 'sleeping' && proc.cpu > 1;
      
      // For Claude hooks, be more strict - any CPU usage while sleeping is abnormal
      const isAbnormal = isClaudeHook ? 
        (isSleepingWithCPU || proc.cpu >= 5) : 
        (proc.status === 'sleeping' && proc.cpu >= 5);
      
      // Critical: high CPU or multiple issues
      const isCritical = isClaudeHook ? 
        (isSleepingWithCPU && proc.cpu >= 5) : 
        (proc.status === 'sleeping' && proc.cpu >= 10);
      
      // Color coding for CPU
      let cpuColor;
      if (isCritical) {
        cpuColor = chalk.red.bold(proc.cpu.toFixed(1)); // Critical: sleeping but high CPU
      } else if (isAbnormal) {
        cpuColor = chalk.yellow(proc.cpu.toFixed(1)); // Warning: sleeping but moderate CPU
      } else if (proc.cpu >= 50) {
        cpuColor = chalk.red(proc.cpu.toFixed(1));
      } else if (proc.cpu >= 20) {
        cpuColor = chalk.yellow(proc.cpu.toFixed(1));
      } else {
        cpuColor = chalk.green(proc.cpu.toFixed(1));
      }
      
      // Override status icon for abnormal processes
      let statusIcon = this.getStatusIcon(proc.status);
      if (isCritical) {
        statusIcon = chalk.red('●'); // Red solid circle for critical abnormal processes
      } else if (isAbnormal) {
        statusIcon = chalk.yellow('●'); // Yellow solid circle for warning abnormal processes
      }
      
      data.push([
        chalk.white(proc.pid.toString()),
        cpuColor,
        proc.memory >= 50 ? chalk.red(proc.memory.toFixed(1)) :
          proc.memory >= 20 ? chalk.yellow(proc.memory.toFixed(1)) :
          chalk.green(proc.memory.toFixed(1)),
        chalk.gray(proc.formattedTime),
        statusIcon,
        isCritical ? chalk.red(this.truncateCommand(proc.command, availableCommandWidth - 2)) :
          isAbnormal ? chalk.yellow(this.truncateCommand(proc.command, availableCommandWidth - 2)) :
          chalk.gray(this.truncateCommand(proc.command, availableCommandWidth - 2))
      ]);
    });

    // Table configuration with dynamic command column width
    const config = {
      // 使用共用的表格字元配置
      border: {
        topBody: TABLE_CHARS['top'],
        topJoin: TABLE_CHARS['top-mid'],
        topLeft: TABLE_CHARS['top-left'],
        topRight: TABLE_CHARS['top-right'],
        bottomBody: TABLE_CHARS['bottom'],
        bottomJoin: TABLE_CHARS['bottom-mid'],
        bottomLeft: TABLE_CHARS['bottom-left'],
        bottomRight: TABLE_CHARS['bottom-right'],
        bodyLeft: TABLE_CHARS['left'],
        bodyRight: TABLE_CHARS['right'],
        bodyJoin: TABLE_CHARS['middle'],
        joinBody: TABLE_CHARS['mid'],
        joinLeft: TABLE_CHARS['left-mid'],
        joinRight: TABLE_CHARS['right-mid'],
        joinJoin: TABLE_CHARS['mid-mid']
      },
      columnDefault: {
        paddingLeft: 1,
        paddingRight: 1
      },
      columns: {
        0: { alignment: 'center' as const, width: 7 },   // PID  
        1: { alignment: 'center' as const, width: 6 },   // CPU%
        2: { alignment: 'center' as const, width: 6 },   // MEM%
        3: { alignment: 'center' as const, width: timeColumnWidth },  // Time - dynamic width
        4: { alignment: 'center' as const, width: 6 },   // Status
        5: { alignment: 'left' as const, width: availableCommandWidth } // Command - dynamic width
      },
      drawHorizontalLine: (lineIndex: number, rowCount: number) => {
        return lineIndex === 0 || lineIndex === 1 || lineIndex === rowCount;
      }
    };

    console.log(table(data, config));

    if (processes.length > limit) {
      console.log(chalk.gray(`   ... ${processes.length - limit} more processes not shown`));
    }
  }

  static showDetectionResult(result: HookDetectionResult) {
    this.showHeader();
    this.showSystemStats(result.systemStats);
    
    this.showProcessTable(result.suspiciousProcesses, 'Suspicious Hook Processes');
    this.showProcessTable(result.longRunningBash, 'Long-running Bash Processes');
    this.showProcessTable(result.highCpuProcesses, 'High CPU Usage Processes');
  }

  static async showKillConfirmation(processes: ProcessInfo[]): Promise<number[]> {
    if (processes.length === 0) {
      console.log(chalk.yellow('\nNo processes found to handle'));
      return [];
    }

    console.log(chalk.bold.red('\n⚠ Found the following suspicious processes:'));
    
    const data = [
      ['Option', 'PID', 'CPU%', 'Command']
    ];

    processes.forEach((proc, index) => {
      data.push([
        `[${index + 1}]`,
        proc.pid.toString(),
        proc.cpu.toFixed(1),
        this.truncateCommand(proc.command, 50)
      ]);
    });

    const config = {
      columnDefault: {
        paddingLeft: 1,
        paddingRight: 1
      }
    };

    console.log(table(data, config));
    console.log(chalk.gray('\nOptions:'));
    console.log(chalk.white('  • Enter numbers to select processes to kill (e.g., 1,2,3)'));
    console.log(chalk.white('  • Enter "all" to kill all processes'));
    console.log(chalk.white('  • Press Enter to skip'));
    
    return [];
  }

  static showSuccess(message: string) {
    console.log(chalk.green(`\n✓ ${message}`));
  }

  static showError(message: string) {
    console.log(chalk.red(`\n✗ ${message}`));
  }

  static showWarning(message: string) {
    console.log(chalk.yellow(`\n⚠ ${message}`));
  }

  private static getStatusIcon(status: ProcessInfo['status']): string {
    switch (status) {
      case 'running':
        return chalk.green('●');  // Green solid - Running (active)
      case 'sleeping':
        return chalk.gray('○');   // Gray hollow - Sleeping (idle, normal)
      case 'zombie':
        return chalk.red('●');    // Red solid - Zombie process (critical)
      case 'stopped':
        return chalk.yellow('○'); // Yellow hollow - Stopped (paused)
      default:
        return chalk.gray('?');
    }
  }

  private static truncateCommand(command: string, maxLength: number): string {
    if (command.length <= maxLength) return command;
    return command.substring(0, maxLength - 3) + '...';
  }

  private static formatElapsedTime(etime: string): string {
    // Parse different etime formats and make them more readable
    // Formats: MM:SS, HH:MM:SS, DD-HH:MM:SS
    const parts = etime.split(/[-:]/);
    
    if (parts.length === 2) {
      // MM:SS format
      const minutes = parseInt(parts[0]);
      const seconds = parseInt(parts[1]);
      if (minutes < 60) {
        return `${minutes}m ${seconds}s`;
      }
      return etime; // Keep original if unusual
    } else if (parts.length === 3) {
      // HH:MM:SS format
      const hours = parseInt(parts[0]);
      const minutes = parseInt(parts[1]);
      const seconds = parseInt(parts[2]);
      if (hours === 0) {
        return `${minutes}m ${seconds}s`;
      } else if (hours < 24) {
        return `${hours}h ${minutes}m`;
      }
      return etime; // Keep original if unusual
    } else if (parts.length === 4) {
      // DD-HH:MM:SS format
      const days = parseInt(parts[0]);
      const hours = parseInt(parts[1]);
      // const minutes = parseInt(parts[2]); // unused variable
      if (days === 1) {
        return `1 day ${hours}h`;
      } else {
        return `${days} days ${hours}h`;
      }
    }
    
    // Return original if format is not recognized
    return etime;
  }
}