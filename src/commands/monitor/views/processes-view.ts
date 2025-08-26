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
    
    // Processes - fixed height 12 lines (same as 30-Day chart)
    this.highCpuProcessesBox = blessed.box({
      parent: screen,
      top: 20, // Start below System Resources (at 10) + height (10) = 20
      left: '66%', // Same as other right-side boxes
      width: '34%', // 4/12 columns (spans right side)
      height: 12, // Fixed height - same as 30-Day chart
      label: ' Processes ',
      border: { type: 'line', fg: 'gray' },
      style: {
        fg: 'white',
        border: { fg: 'gray' }
      },
      padding: {
        left: 1,
        right: 1,
        top: 1,
        bottom: 1
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
      
      // Sort by CPU usage, take top 8 (reduced due to padding)
      const topProcesses = processes
        .filter((p: ProcessInfo) => p && p.cpu >= 0)
        .sort((a: ProcessInfo, b: ProcessInfo) => b.cpu - a.cpu)
        .slice(0, 8);
      
      const processInfo = [];
      
      // Get actual box width for dynamic sizing
      const boxWidth = this.highCpuProcessesBox.width as number || 40;
      // Account for padding and border (left padding: 1, right padding: 1, borders: 2)
      const contentWidth = boxWidth - 4;
      
      // Header row - with all labels centered
      processInfo.push(chalk.gray(' CPU%    MEM%   Status  Process'));
      processInfo.push(chalk.gray('─'.repeat(contentWidth)));
      
      // Always show exactly 8 rows (reduced due to padding)
      for (let i = 0; i < 8; i++) {
        if (i < topProcesses.length) {
          const proc = topProcesses[i];
          
          // Smart process name extraction
          const smartName = extractSmartProcessName(proc.command);
          
          // Format CPU percentage (centered in 6 char field)
          const cpuValue = proc.cpu.toFixed(1);
          const cpuStr = cpuValue.padStart(5).padEnd(6);
          
          // Format Memory percentage (centered in 6 char field)
          const memValue = proc.memory.toFixed(1);
          const memStr = memValue.padStart(5).padEnd(6);
          
          // Status indicator with colored dots (like ai ps)
          let statusIndicator = '';
          switch (proc.status.toLowerCase()) {
            case 'running':
              statusIndicator = chalk.green('●'); // Solid circle for running
              break;
            case 'sleeping':
            case 'idle':
              statusIndicator = chalk.gray('○'); // Empty circle for idle/sleeping
              break;
            case 'stopped':
              statusIndicator = chalk.yellow('●'); // Yellow for stopped
              break;
            case 'zombie':
              statusIndicator = chalk.red('●'); // Red for zombie
              break;
            default:
              statusIndicator = chalk.gray('○'); // Default to empty circle
          }
          
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
          
          // Calculate available width for process name dynamically
          // Header: ' CPU%    MEM%   Status  Process'
          // Spacing: space(1) + CPU(6) + space(2) + MEM(6) + space(2) + status(7) + space(2) = 26
          const fixedWidth = 26;
          const nameWidth = Math.max(Math.min(contentWidth - fixedWidth, 30), 10);
          const displayName = smartName.length > nameWidth ? 
            smartName.substring(0, nameWidth - 1) + '…' : 
            smartName;
          
          // Center the status indicator (3 spaces before, 3 spaces after for 7 char field)
          const statusField = '   ' + statusIndicator + '   ';
          
          processInfo.push(
            ' ' + cpuColor(cpuStr) + '  ' +
            memColor(memStr) + ' ' +
            statusField + ' ' +
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