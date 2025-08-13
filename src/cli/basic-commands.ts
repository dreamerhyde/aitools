import { Command } from 'commander';
import chalk from 'chalk';
import { MonitorCommand } from '../commands/monitor.js';
import { KillCommand } from '../commands/kill.js';
import { HealthCommand } from '../commands/health.js';
import { UpgradeCommand } from '../commands/upgrade.js';
import { UIHelper } from '../utils/ui.js';
import { AutoUpdateChecker } from '../utils/auto-update.js';

export function setupBasicCommands(program: Command): void {
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
        
        const spinner = UIHelper.createSpinner('Checking system health...');
        spinner.start();
        
        const processMonitor = new (await import('../utils/process-monitor.js')).ProcessMonitor();
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
          console.log('   Use "ai hooks" to manage active hooks');
        }
        
      } catch (error) {
        UIHelper.showError(`Status command failed: ${error}`);
        process.exit(1);
      }
    });

  // Health command - Code quality check for Vibe Coding
  program
    .command('health')
    .alias('check')
    .description('Check code health and suggest AI-assisted refactoring')
    .option('-p, --path <path>', 'Path to analyze (default: current directory)')
    .option('-t, --threshold <lines>', 'Line count threshold (default: 500)', '500')
    .option('-f, --format <format>', 'Output format (table|detailed|json)', 'table')
    .option('--ignore <patterns...>', 'Additional ignore patterns')
    .action(async (options) => {
      try {
        const health = new HealthCommand();
        await health.execute({
          path: options.path,
          threshold: parseInt(options.threshold),
          format: options.format,
          ignore: options.ignore
        });
      } catch (error) {
        UIHelper.showError(`Health check failed: ${error}`);
        process.exit(1);
      }
    });

  // Upgrade command - Self-update functionality
  program
    .command('upgrade')
    .alias('update')
    .description('Upgrade AI Tools to the latest version')
    .option('--check', 'Only check for updates without installing')
    .option('--force', 'Force upgrade even if on latest version')
    .option('--channel <channel>', 'Update channel (stable|beta|canary)', 'stable')
    .action(async (options) => {
      try {
        const upgrade = new UpgradeCommand();
        await upgrade.execute(options);
      } catch (error) {
        UIHelper.showError(`Upgrade failed: ${error}`);
        process.exit(1);
      }
    });

  // Config command - Settings management
  program
    .command('config')
    .description('Manage AI Tools configuration')
    .option('--disable-updates', 'Disable automatic update checks')
    .option('--enable-updates', 'Enable automatic update checks')
    .action(async (options) => {
      if (options.disableUpdates) {
        await AutoUpdateChecker.disableAutoCheck();
      } else if (options.enableUpdates) {
        await AutoUpdateChecker.enableAutoCheck();
      } else {
        console.log('Configuration options:');
        console.log('  --disable-updates  Disable automatic update checks');
        console.log('  --enable-updates   Enable automatic update checks');
      }
    });

  // Fix command - Automated problem resolution
  program
    .command('fix')
    .alias('f')
    .description('Automatically fix common AI development issues')
    .option('--aggressive', 'Use more aggressive fix strategies')
    .option('--dry-run', 'Show what would be fixed without actually killing processes')
    .action(async (options) => {
      try {
        UIHelper.showHeader();
        console.log('▪ Automated Fix Mode');
        console.log('─'.repeat(30));
        console.log('Scanning for abnormal processes...\n');
        
        // Use stricter detection for Claude hooks
        const processMonitor = new (await import('../utils/process-monitor.js')).ProcessMonitor({
          cpuThreshold: options.aggressive ? 3.0 : 5.0,
          memoryThreshold: 1.0
        });
        
        const result = await processMonitor.detectSuspiciousHooks();
        
        // Focus on red circle processes (critical abnormal)
        const criticalProcesses = result.suspiciousProcesses.filter(proc => {
          const isClaudeHook = proc.command.includes('.claude/hooks/');
          const isSleepingWithHighCPU = proc.status === 'sleeping' && proc.cpu >= 5;
          const isRestartScript = proc.command.includes('restart') || proc.command.includes('reload');
          
          // These are the "red circle" conditions
          return (isClaudeHook && proc.status === 'sleeping' && proc.cpu > 1) ||
                 isSleepingWithHighCPU ||
                 (isRestartScript && proc.cpu > 0);
        });
        
        if (criticalProcesses.length === 0 && result.suspiciousProcesses.length === 0) {
          UIHelper.showSuccess('No abnormal processes found - system is healthy!');
          return;
        }
        
        // Show what will be fixed
        if (criticalProcesses.length > 0) {
          console.log(chalk.red.bold(`Found ${criticalProcesses.length} critical abnormal process(es):`));
          criticalProcesses.forEach(proc => {
            const shortCmd = proc.command.length > 60 ? 
              proc.command.substring(0, 57) + '...' : 
              proc.command;
            console.log(chalk.red(`   ● PID ${proc.pid} (${proc.cpu.toFixed(1)}% CPU) - ${shortCmd}`));
          });
        }
        
        if (result.suspiciousProcesses.length > criticalProcesses.length) {
          const otherCount = result.suspiciousProcesses.length - criticalProcesses.length;
          console.log(chalk.yellow(`\nFound ${otherCount} other suspicious process(es)`));
        }
        
        if (options.dryRun) {
          console.log();
          console.log(chalk.cyan('▪ Dry run mode - no processes were terminated'));
          console.log(chalk.gray(`  Would have fixed ${criticalProcesses.length} critical issue(s)`));
          return;
        }
        
        // Actually fix the issues
        console.log();
        let fixed = 0;
        let failed = 0;
        
        for (const proc of criticalProcesses) {
          const spinner = UIHelper.createSpinner(`Terminating PID ${proc.pid}...`);
          spinner.start();
          
          const success = await processMonitor.killProcess(proc.pid);
          if (success) {
            spinner.succeed(`Terminated PID ${proc.pid}`);
            fixed++;
          } else {
            spinner.fail(`Failed to terminate PID ${proc.pid}`);
            failed++;
          }
        }
        
        // Fix other suspicious processes if aggressive mode
        if (options.aggressive && result.suspiciousProcesses.length > criticalProcesses.length) {
          const others = result.suspiciousProcesses.filter(p => 
            !criticalProcesses.some(c => c.pid === p.pid)
          );
          
          console.log(chalk.yellow('\nAggressive mode: cleaning other suspicious processes...'));
          for (const proc of others) {
            const success = await processMonitor.killProcess(proc.pid);
            if (success) {
              fixed++;
              console.log(chalk.gray(`   ✓ Terminated PID ${proc.pid}`));
            }
          }
        }
        
        // Summary
        console.log();
        if (fixed > 0) {
          UIHelper.showSuccess(`Successfully fixed ${fixed} issue(s)!`);
          if (failed > 0) {
            UIHelper.showWarning(`Failed to fix ${failed} issue(s) - may need sudo`);
          }
          console.log(chalk.green('\n Your vibe is restored!'));
        } else if (failed > 0) {
          UIHelper.showError(`Failed to fix ${failed} issue(s) - try with sudo`);
        }
        
      } catch (error) {
        UIHelper.showError(`Fix command failed: ${error}`);
        process.exit(1);
      }
    });
}