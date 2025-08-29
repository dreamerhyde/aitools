import { Command } from 'commander';
import { ProcessMonitor } from '../utils/process-monitor.js';
import { UIHelper } from '../utils/ui.js';
import { extractSmartProcessName, getCacheStats } from '../commands/monitor/utils/sanitizers.js';
import chalk from 'chalk';
import Table from 'cli-table3';
import { setupPortCommand } from './process/port-command.js';
import { setupKillCommand } from './process/kill-command.js';
import { setupHooksCommand } from './process/hooks-command.js';

export function setupProcessCommand(program: Command): void {
  const processCommand = program
    .command('process')
    .alias('ps')
    .description('System process management and monitoring');

  // Default process list
  processCommand
    .option('-a, --all', 'Show all processes')
    .option('--cpu <threshold>', 'Filter by CPU usage threshold', '0.1')
    .option('--sort <field>', 'Sort by field (cpu|mem|pid)', 'cpu')
    .option('--show-cache-stats', 'Show process name cache statistics')
    .action(async (options) => {
      try {
        const processMonitor = new ProcessMonitor();
        const processes = await processMonitor.getAllProcesses();
        
        // Filter processes
        let filtered = processes;
        if (!options.all) {
          const cpuThreshold = parseFloat(options.cpu);
          filtered = processes.filter(p => p.cpu >= cpuThreshold);
        }
        
        // Sort processes
        filtered.sort((a, b) => {
          switch (options.sort) {
            case 'mem':
              return b.memory - a.memory;
            case 'pid':
              return a.pid - b.pid;
            default:
              return b.cpu - a.cpu;
          }
        });
        
        if (filtered.length === 0) {
          console.log(chalk.gray('No processes match the criteria'));
          return;
        }
        
        // Display the process table
        displayProcessTable(filtered);
        
        // Show cache stats if requested
        if (options.showCacheStats) {
          displayCacheStats();
        }
        
        // Status legend
        displayStatusLegend();
        
      } catch (error) {
        UIHelper.showError(`Process command failed: ${error}`);
        process.exit(1);
      }
    });

  // Setup subcommands
  setupKillCommand(processCommand);
  setupPortCommand(processCommand);
  setupHooksCommand(processCommand);
}

function displayProcessTable(processes: any[]): void {
  // Get terminal width
  const termWidth = process.stdout.columns || 120;
  const commandWidth = Math.max(50, termWidth - 40);
  
  // Display compact table
  const table = new Table({
    head: ['PID', 'CPU%', 'MEM%', 'Status', 'Process'],
    style: {
      head: ['cyan'],
      border: ['gray']
    },
    colAligns: ['right', 'right', 'right', 'center', 'left']
  });
  
  processes.slice(0, 30).forEach(proc => {
    // Use smart process name extraction
    const smartName = extractSmartProcessName(proc.command);
    const shortCmd = smartName.length > commandWidth ? 
      smartName.substring(0, commandWidth - 3) + '...' : 
      smartName;
    
    // Color code based on CPU usage
    const cpuVal = proc.cpu.toFixed(1);
    const memVal = proc.memory.toFixed(1);
    const cpuDisplay = proc.cpu > 20 ? chalk.red(cpuVal) : 
                       proc.cpu > 10 ? chalk.yellow(cpuVal) : cpuVal;
    const memDisplay = proc.memory > 20 ? chalk.red(memVal) : 
                       proc.memory > 10 ? chalk.yellow(memVal) : memVal;
    
    // Status indicator with colored dots
    let statusIndicator = '';
    switch (proc.status.toLowerCase()) {
      case 'running':
        statusIndicator = chalk.green('●');
        break;
      case 'sleeping':
      case 'idle':
        statusIndicator = chalk.gray('○');
        break;
      case 'stopped':
        statusIndicator = chalk.yellow('●');
        break;
      case 'zombie':
        statusIndicator = chalk.red('●');
        break;
      default:
        statusIndicator = chalk.gray('○');
    }
    
    table.push([
      proc.pid.toString(),
      cpuDisplay,
      memDisplay,
      statusIndicator,
      shortCmd
    ]);
  });
  
  console.log(table.toString());
  console.log(chalk.gray(`\nShowing ${Math.min(30, processes.length)} of ${processes.length} processes`));
}

function displayCacheStats(): void {
  const stats = getCacheStats();
  console.log(chalk.cyan('\nCache Statistics:'));
  console.log(chalk.gray('Process Cache:'));
  console.log(chalk.gray(`  Size: ${stats.size}/${1000} entries`));
  console.log(chalk.gray(`  Hits: ${stats.hits}`));
  console.log(chalk.gray(`  Misses: ${stats.misses}`));
  console.log(chalk.gray(`  Hit Rate: ${stats.hitRate}`));
  
  if (stats.appCache) {
    console.log(chalk.gray('\nApplication Cache:'));
    console.log(chalk.gray(`  Cached Apps: ${stats.appCache.entries}`));
    console.log(chalk.gray(`  Cache Age: ${stats.appCache.age}`));
    console.log(chalk.gray(`  TTL: ${stats.appCache.ttl}`));
    console.log(chalk.gray(`  Remaining: ${stats.appCache.remaining}`));
  }
}

function displayStatusLegend(): void {
  console.log(chalk.gray('\nStatus: ') + 
    chalk.green('●') + ' Running  ' +
    chalk.gray('○') + ' Idle/Sleeping  ' +
    chalk.yellow('●') + ' Stopped  ' +
    chalk.red('●') + ' Zombie');
}