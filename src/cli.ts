#!/usr/bin/env node

import { Command } from 'commander';
import { MonitorCommand } from './commands/monitor.js';
import { ListCommand } from './commands/list.js';
import { KillCommand } from './commands/kill.js';
import { HooksCommand } from './commands/hooks.js';
import { UIHelper } from './utils/ui.js';

const program = new Command();

program
  .name('aitools')
  .description('Vibe Coding Toolkit - Keep your AI-assisted development flow smooth')
  .version('1.0.0');

// Hooks command - Primary AI development hook management
program
  .command('hooks')
  .alias('h')
  .description('Manage AI development hooks (Claude, Git, etc.)')
  .option('-i, --interactive', 'Interactive mode for hook management')
  .option('-k, --kill', 'Terminate all detected hooks')
  .option('-w, --watch', 'Watch hooks in real-time')
  .action(async (options) => {
    try {
      const hooks = new HooksCommand();
      await hooks.execute(options);
    } catch (error) {
      UIHelper.showError(`Hooks command failed: ${error}`);
      process.exit(1);
    }
  });

// Monitor command - System-wide monitoring
program
  .command('monitor')
  .alias('m')
  .description('Monitor system for performance issues and stuck processes')
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

// Processes command - View all processes
program
  .command('processes')
  .alias('ps')
  .description('View and filter system processes')
  .option('-a, --all', 'Show all processes')
  .option('--hooks', 'Show only hook-related processes')
  .option('-c, --cpu <number>', 'Filter by CPU usage >= value')
  .option('-m, --memory <number>', 'Filter by memory usage >= value')
  .option('-s, --sort <field>', 'Sort by field (pid|cpu|memory|time)', 'cpu')
  .option('-l, --limit <number>', 'Limit results', '50')
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
      UIHelper.showError(`Processes command failed: ${error}`);
      process.exit(1);
    }
  });

// Kill command - Process termination
program
  .command('kill')
  .alias('k')
  .description('Terminate specified processes')
  .option('-p, --pid <pids>', 'Process PIDs to terminate (comma-separated)', (value) => 
    value.split(',').map(pid => parseInt(pid.trim()))
  )
  .option('-P, --pattern <pattern>', 'Terminate processes matching pattern')
  .option('--hooks', 'Terminate all hook processes')
  .option('-f, --force', 'Force termination without confirmation')
  .option('-i, --interactive', 'Interactive selection mode')
  .action(async (options) => {
    try {
      const kill = new KillCommand();
      await kill.execute(options);
    } catch (error) {
      UIHelper.showError(`Kill command failed: ${error}`);
      process.exit(1);
    }
  });

// Status command - Quick system overview
program
  .command('status')
  .alias('s')
  .description('Show system status and AI development environment health')
  .action(async () => {
    try {
      const monitor = new MonitorCommand();
      const spinner = UIHelper.createSpinner('Checking system health...');
      spinner.start();
      
      const processMonitor = new (await import('./utils/process-monitor.js')).ProcessMonitor();
      const stats = await processMonitor.getSystemStats();
      const processes = await processMonitor.getAllProcesses();
      
      // Count different types of processes
      const hookProcesses = processes.filter(p => p.isHook);
      const highCpuProcesses = processes.filter(p => p.cpu > 10);
      const claudeHooks = hookProcesses.filter(p => p.command.includes('claude'));
      
      spinner.stop();
      UIHelper.showHeader();
      UIHelper.showSystemStats(stats);
      
      // AI Development Status
      console.log();
      console.log('▪ AI Development Status');
      console.log('─'.repeat(30));
      console.log(`   Active hooks: ${hookProcesses.length}`);
      console.log(`   Claude hooks: ${claudeHooks.length}`);
      console.log(`   High CPU processes: ${highCpuProcesses.length}`);
      
      if (hookProcesses.length > 0) {
        console.log();
        console.log('   Use "aitools hooks" to manage active hooks');
      }
      
    } catch (error) {
      UIHelper.showError(`Status command failed: ${error}`);
      process.exit(1);
    }
  });

// Fix command - Automated problem resolution
program
  .command('fix')
  .alias('f')
  .description('Automatically fix common AI development issues')
  .option('--aggressive', 'Use more aggressive fix strategies')
  .action(async (options) => {
    try {
      UIHelper.showHeader();
      console.log('▪ Automated Fix Mode');
      console.log('─'.repeat(30));
      console.log('Scanning for common issues...\n');
      
      const threshold = options.aggressive ? 10.0 : 15.0;
      
      const monitor = new MonitorCommand({
        cpuThreshold: threshold,
        memoryThreshold: 1.0
      });
      
      // First detect issues
      const processMonitor = new (await import('./utils/process-monitor.js')).ProcessMonitor({
        cpuThreshold: threshold
      });
      const result = await processMonitor.detectSuspiciousHooks();
      
      let issuesFixed = 0;
      
      // Fix stuck hooks
      if (result.suspiciousProcesses.length > 0) {
        console.log(`Found ${result.suspiciousProcesses.length} stuck hook(s)`);
        for (const proc of result.suspiciousProcesses) {
          const success = await processMonitor.killProcess(proc.pid);
          if (success) {
            issuesFixed++;
            console.log(`   ✓ Terminated stuck hook: PID ${proc.pid}`);
          }
        }
      }
      
      // Fix long-running bash processes
      if (result.longRunningBash.length > 0) {
        console.log(`Found ${result.longRunningBash.length} long-running bash process(es)`);
        for (const proc of result.longRunningBash) {
          if (proc.cpu > 5) { // Only kill if actually using CPU
            const success = await processMonitor.killProcess(proc.pid);
            if (success) {
              issuesFixed++;
              console.log(`   ✓ Terminated long-running bash: PID ${proc.pid}`);
            }
          }
        }
      }
      
      if (issuesFixed > 0) {
        UIHelper.showSuccess(`Fixed ${issuesFixed} issue(s)!`);
      } else {
        UIHelper.showSuccess('No issues found - system is healthy!');
      }
      
    } catch (error) {
      UIHelper.showError(`Fix command failed: ${error}`);
      process.exit(1);
    }
  });

// Help command with examples
program
  .command('help [command]')
  .description('Show help for a specific command')
  .action((cmdName) => {
    if (cmdName) {
      const cmd = program.commands.find(c => c.name() === cmdName);
      if (cmd) {
        cmd.outputHelp();
      } else {
        UIHelper.showError(`Unknown command: ${cmdName}`);
      }
    } else {
      console.log(`
AI Tools CLI - Usage Guide

Common Workflows:

1. Check AI development environment health:
   aitools status

2. Manage Claude Code hooks:
   aitools hooks              # View all hooks
   aitools hooks -i           # Interactive management
   aitools hooks -k           # Kill all hooks

3. Fix common issues automatically:
   aitools fix                # Standard fix
   aitools fix --aggressive   # Aggressive fix

4. Monitor system performance:
   aitools monitor            # One-time check
   aitools monitor -w         # Continuous monitoring

5. View processes:
   aitools processes          # All processes
   aitools processes --hooks  # Only hook processes

6. Terminate specific processes:
   aitools kill -p 1234       # Kill by PID
   aitools kill --hooks       # Kill all hooks
   aitools kill -i            # Interactive selection

${program.helpInformation()}
`);
    }
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