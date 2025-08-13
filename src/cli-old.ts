#!/usr/bin/env node

import { Command } from 'commander';
import { MonitorCommand } from './commands/monitor.js';
import { ListCommand } from './commands/list.js';
import { KillCommand } from './commands/kill.js';
import { UIHelper } from './utils/ui.js';

const program = new Command();

program
  .name('aitools')
  .description('🤖 AI CLI Toolkit - Monitor and manage hook processes')
  .version('1.0.0');

// Monitor command
program
  .command('monitor')
  .alias('m')
  .description('🔍 Monitor system processes and detect stuck hooks')
  .option('-i, --interactive', 'Interactive mode to select processes to terminate')
  .option('-c, --cpu-threshold <number>', 'CPU usage threshold (%)', '5.0')
  .option('-m, --memory-threshold <number>', 'Memory usage threshold (%)', '1.0')
  .option('-a, --auto-kill', 'Automatically kill suspicious processes')
  .option('-w, --watch', 'Continuous monitoring mode')
  .action(async (options) => {
    try {
      const monitor = new MonitorCommand({
        cpuThreshold: parseFloat(options.cpuThreshold),
        memoryThreshold: parseFloat(options.memoryThreshold)
      });
      
      await monitor.execute(options);
    } catch (error) {
      UIHelper.showError(`Monitor command failed: ${error}`);
      process.exit(1);
    }
  });

// List command
program
  .command('list')
  .alias('ls')
  .description('📋 List system processes')
  .option('-a, --all', 'Show all processes')
  .option('-h, --hooks', 'Show only hook-related processes')
  .option('-c, --cpu <number>', 'Show only processes with CPU usage >= specified value')
  .option('-m, --memory <number>', 'Show only processes with memory usage >= specified value')
  .option('-s, --sort <field>', 'Sort field (pid|cpu|memory|time)', 'cpu')
  .option('-l, --limit <number>', 'Limit display count', '50')
  .action(async (options) => {
    try {
      const list = new ListCommand();
      
      await list.execute({
        ...options,
        cpu: options.cpu ? parseFloat(options.cpu) : undefined,
        memory: options.memory ? parseFloat(options.memory) : undefined,
        limit: options.limit ? parseInt(options.limit) : undefined
      });
    } catch (error) {
      UIHelper.showError(`List command failed: ${error}`);
      process.exit(1);
    }
  });

// Kill command
program
  .command('kill')
  .alias('k')
  .description('🔪 Terminate specified processes')
  .option('-p, --pid <pids>', 'Process PIDs to terminate (comma-separated)', (value) => 
    value.split(',').map(pid => parseInt(pid.trim()))
  )
  .option('-P, --pattern <pattern>', 'Terminate processes matching specified pattern')
  .option('-h, --hooks', 'Terminate all suspicious hook processes')
  .option('-f, --force', 'Force termination without confirmation')
  .option('-i, --interactive', 'Interactive mode')
  .action(async (options) => {
    try {
      const kill = new KillCommand();
      await kill.execute(options);
    } catch (error) {
      UIHelper.showError(`Kill command failed: ${error}`);
      process.exit(1);
    }
  });

// Stats command - Quick system status overview
program
  .command('stats')
  .alias('s')
  .description('📊 Show system status overview')
  .action(async () => {
    try {
      const monitor = new MonitorCommand();
      const spinner = UIHelper.createSpinner('Getting system status...');
      spinner.start();
      
      // Simplified status display
      const processMonitor = new (await import('./utils/process-monitor.js')).ProcessMonitor();
      const stats = await processMonitor.getSystemStats();
      
      spinner.stop();
      UIHelper.showHeader();
      UIHelper.showSystemStats(stats);
      
    } catch (error) {
      UIHelper.showError(`Status command failed: ${error}`);
      process.exit(1);
    }
  });

// Quick command - Quick fix for common issues
program
  .command('quick')
  .alias('q')
  .description('⚡ Quick detection and fix for common hook issues')
  .action(async () => {
    try {
      UIHelper.showHeader();
      console.log('⚡ Quick fix mode');
      console.log('Running default issue detection and fixes...\n');
      
      const monitor = new MonitorCommand({
        cpuThreshold: 15.0,  // Raise threshold to avoid killing normal processes
        memoryThreshold: 1.0
      });
      
      await monitor.execute({
        interactive: false,
        autoKill: true
      });
      
      UIHelper.showSuccess('Quick fix completed!');
      
    } catch (error) {
      UIHelper.showError(`Quick fix failed: ${error}`);
      process.exit(1);
    }
  });

// Enhanced help command
program
  .command('help')
  .description('📖 Show detailed usage instructions')
  .action(() => {
    console.log(`
🤖 AI Tools CLI - Complete Usage Guide

${program.helpInformation()}

📚 Detailed Examples:

1. 🔍 Basic Monitoring:
   aitools monitor                    # Basic process monitoring
   aitools monitor -i                 # Interactive mode with selection options
   aitools monitor -w                 # Continuous monitoring mode

2. 📋 Process Listing:
   aitools list                       # Show high CPU processes
   aitools list --hooks               # Show only hook-related processes
   aitools list --cpu 10              # Show processes with CPU > 10%
   aitools list --sort memory         # Sort by memory usage

3. 🔪 Process Termination:
   aitools kill --pid 1234,5678       # Terminate specified PIDs
   aitools kill --pattern "claude"    # Terminate processes containing "claude"
   aitools kill --hooks -i            # Interactive termination of hook processes

4. ⚡ Quick Fix:
   aitools quick                      # Auto-detect and fix common issues
   aitools stats                      # Quick system status overview

💡 Tips:
- Use abbreviations: monitor -> m, list -> ls, kill -> k
- Interactive mode (-i) lets you safely select processes to handle
- Watch mode (-w) is suitable for long-term system observation
- Quick mode is suitable for daily maintenance
`);
  });

// Error handling
program.on('command:*', () => {
  UIHelper.showError(`Unknown command: ${program.args.join(' ')}`);
  console.log('\nUse "aitools help" to see available commands');
  process.exit(1);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  UIHelper.showError(`Unhandled error: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  UIHelper.showError(`Unhandled Promise rejection: ${reason}`);
  process.exit(1);
});

// Parse command line arguments
program.parse();