import { Command } from 'commander';
import { ProcessMonitor } from '../utils/process-monitor.js';
import { UIHelper } from '../utils/ui.js';
import { ProcessIdentifier } from '../utils/process-identifier.js';
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

          // Development tools whitelist - these should always be shown regardless of CPU usage
          const isDevelopmentTool = (command: string): boolean => {
            const devToolPatterns = [
              /\b(vercel|vc)\s+dev/i,
              /\b(next|nuxt|vite)\s+dev/i,
              /\b(npm|yarn|pnpm|bun)\s+(run\s+)?(dev|start|serve)/i,
              /node.*webpack-dev-server/i,
              /node.*react-scripts.*start/i,
              /\btailwindcss.*--watch/i,
              /\bturbo.*dev/i,
              /\bnx.*serve/i
            ];
            return devToolPatterns.some(pattern => pattern.test(command));
          };

          filtered = processes.filter(p => {
            const passesCpu = p.cpu >= cpuThreshold;
            const isDevTool = isDevelopmentTool(p.command);
            return passesCpu || isDevTool;
          });
        }
        
        // Sort processes with development tools priority
        filtered.sort((a, b) => {
          const isDevelopmentTool = (command: string): boolean => {
            const devToolPatterns = [
              /\b(vercel|vc)\s+dev/i,
              /\b(next|nuxt|vite)\s+dev/i,
              /\b(npm|yarn|pnpm|bun)\s+(run\s+)?(dev|start|serve)/i,
              /node.*webpack-dev-server/i,
              /node.*react-scripts.*start/i,
              /\btailwindcss.*--watch/i,
              /\bturbo.*dev/i,
              /\bnx.*serve/i
            ];
            return devToolPatterns.some(pattern => pattern.test(command));
          };

          const aIsDevTool = isDevelopmentTool(a.command);
          const bIsDevTool = isDevelopmentTool(b.command);

          // Development tools get priority (shown first)
          if (aIsDevTool && !bIsDevTool) return -1;
          if (!aIsDevTool && bIsDevTool) return 1;

          // Within same category, sort by specified field
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
        await displayProcessTable(filtered);

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

async function displayProcessTable(processes: any[]): Promise<void> {
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
  
  // Batch identify processes for better performance
  const identifiedMap = await ProcessIdentifier.identifyBatch(
    processes.slice(0, 30).map(p => ({ pid: p.pid, command: p.command }))
  );

  processes.slice(0, 30).forEach(proc => {
    // Use identified name
    const identity = identifiedMap.get(proc.pid);
    const smartName = identity ? identity.displayName : proc.command.substring(0, 50);
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
  const stats = ProcessIdentifier.getCacheStats();
  console.log(chalk.cyan('\nCache Statistics:'));
  console.log(chalk.gray('Identification Cache:'));
  console.log(chalk.gray(`  L1 Cache Size: ${stats.l1Size} entries`));
  console.log(chalk.gray(`  L2 Cache Size: ${stats.l2Size} active`));
  console.log(chalk.gray(`  CWD Cache: ${stats.cwdSize} entries`));
  console.log(chalk.gray(`  Docker Cache: ${stats.dockerSize} entries`));
}

function displayStatusLegend(): void {
  console.log(chalk.gray('\nStatus: ') + 
    chalk.green('●') + ' Running  ' +
    chalk.gray('○') + ' Idle/Sleeping  ' +
    chalk.yellow('●') + ' Stopped  ' +
    chalk.red('●') + ' Zombie');
}