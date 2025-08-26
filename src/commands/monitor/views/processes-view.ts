import chalk from 'chalk';
import { ProcessInfo } from '../types.js';
import { extractSmartProcessName } from '../utils/sanitizers.js';
import { createMiniBar } from '../utils/formatters.js';

export class ProcessesView {
  private highCpuProcessesBox: any;
  private screenManager: any;
  private grid: any;

  constructor(screenManager: any, grid: any) {
    this.screenManager = screenManager;
    this.grid = grid;
  }

  initialize(): void {
    const blessed = this.screenManager.getBlessed();
    const screen = this.screenManager.getScreen();
    
    // High CPU Processes - fixed height 12 lines (same as 30-Day chart)
    this.highCpuProcessesBox = blessed.box({
      parent: screen,
      top: 20, // Start below System Resources (at 10) + height (10) = 20
      left: '66%', // Same as other right-side boxes
      width: '34%', // 4/12 columns (spans right side)
      height: 12, // Fixed height - same as 30-Day chart
      label: ' High CPU Processes ',
      border: { type: 'line', fg: 'gray' },
      style: {
        fg: 'white',
        border: { fg: 'gray' }
      },
      padding: {
        left: 1,
        right: 0
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true
    });
  }

  async updateHighCpuProcesses(processMonitor: any): Promise<void> {
    if (!this.highCpuProcessesBox) return;
    
    try {
      // Get all processes
      const processes = await processMonitor.getAllProcesses();
      
      // Sort by CPU usage, take top 15
      const topProcesses = processes
        .filter((p: ProcessInfo) => p && p.cpu >= 0)
        .sort((a: ProcessInfo, b: ProcessInfo) => b.cpu - a.cpu)
        .slice(0, 15);
      
      const processInfo = [];
      
      // Header row
      processInfo.push(chalk.gray('CPU%   MEM%  Status     Process'));
      processInfo.push(chalk.gray('─'.repeat(38)));
      
      // Always show exactly 15 rows
      for (let i = 0; i < 15; i++) {
        if (i < topProcesses.length) {
          const proc = topProcesses[i];
          
          // Smart process name extraction
          const smartName = extractSmartProcessName(proc.command);
          
          // Format CPU percentage (right aligned, 5 chars)
          const cpuStr = proc.cpu.toFixed(1).padStart(5);
          
          // Format Memory percentage (right aligned, 5 chars)
          const memStr = proc.memory.toFixed(1).padStart(5);
          
          // Format Status (10 chars, left aligned)
          const statusStr = proc.status.padEnd(10);
          
          // Color code based on CPU usage
          let cpuColor = chalk.green;
          if (proc.cpu > 80) cpuColor = chalk.red;
          else if (proc.cpu > 50) cpuColor = chalk.yellow;
          else if (proc.cpu > 20) cpuColor = chalk.cyan;
          
          // Color for memory
          let memColor = chalk.green;
          if (proc.memory > 50) memColor = chalk.red;
          else if (proc.memory > 30) memColor = chalk.yellow;
          else if (proc.memory > 10) memColor = chalk.cyan;
          
          // Color for status
          let statusColor = chalk.green;
          if (proc.status === 'zombie') statusColor = chalk.red;
          else if (proc.status === 'stopped') statusColor = chalk.yellow;
          else if (proc.status === 'sleeping') statusColor = chalk.gray;
          
          // Calculate available width for process name
          const nameWidth = 15;
          const displayName = smartName.length > nameWidth ? 
            smartName.substring(0, nameWidth - 1) + '…' : 
            smartName;
          
          processInfo.push(
            cpuColor(cpuStr) + '  ' +
            memColor(memStr) + '  ' +
            statusColor(statusStr) + ' ' +
            chalk.white(displayName)
          );
        } else {
          // Empty row for consistent layout
          processInfo.push('');
        }
      }

      this.highCpuProcessesBox.setContent(processInfo.join('\n'));
      this.screenManager.render();
    } catch (error) {
      this.highCpuProcessesBox.setContent('\n' + chalk.red('  Error loading processes'));
      this.screenManager.render();
    }
  }

  destroy(): void {
    // Cleanup if needed
  }
}