import { Command } from 'commander';
import chalk from 'chalk';
import { HooksCommand } from '../commands/hooks.js';
import { UIHelper } from '../utils/ui.js';

export function setupHooksCommand(program: Command): void {
  const hooksCommand = program
    .command('hooks')
    .alias('h')
    .description('Manage AI development hooks (Claude, Git, etc.)');

  // Default hooks action
  hooksCommand
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

  // hooks clean subcommand - clean abnormal hooks only
  hooksCommand
    .command('clean')
    .description('Clean up abnormal hooks (high CPU while sleeping)')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (options) => {
      try {
        UIHelper.showHeader();
        console.log(chalk.red.bold('▪ Hook Cleanup'));
        console.log('─'.repeat(30));
        
        const processMonitor = new (await import('../utils/process-monitor.js')).ProcessMonitor({
          cpuThreshold: 1.0
        });
        
        const processes = await processMonitor.getAllProcesses();
        
        // Only abnormal hooks
        const abnormalHooks = processes.filter(proc => {
          if (!proc.isHook) return false;
          const isClaudeHook = proc.command.includes('.claude/hooks/');
          const isSleepingWithCPU = proc.status === 'sleeping' && proc.cpu > 1;
          return isClaudeHook && isSleepingWithCPU;
        });
        
        if (abnormalHooks.length === 0) {
          UIHelper.showSuccess('No abnormal hooks to clean!');
          return;
        }
        
        console.log(chalk.red(`Found ${abnormalHooks.length} abnormal hook(s):`));
        abnormalHooks.forEach(proc => {
          const shortCmd = proc.command.split('/').pop() || proc.command;
          console.log(chalk.red(`   ● PID ${proc.pid} (${proc.cpu.toFixed(1)}% CPU) - ${shortCmd}`));
        });
        
        if (!options.yes) {
          const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          const answer = await new Promise<string>(resolve => {
            readline.question(chalk.bold('\nClean these hooks? (y/N): '), resolve);
          });
          readline.close();
          
          if (answer.toLowerCase() !== 'y') {
            console.log(chalk.gray('Cancelled.'));
            return;
          }
        }
        
        let cleaned = 0;
        for (const proc of abnormalHooks) {
          if (await processMonitor.killProcess(proc.pid)) {
            console.log(chalk.green(`   ✓ Terminated PID ${proc.pid}`));
            cleaned++;
          } else {
            console.log(chalk.red(`   ✗ Failed PID ${proc.pid}`));
          }
        }
        
        console.log();
        UIHelper.showSuccess(`Cleaned ${cleaned} abnormal hook(s)!`);
        console.log(chalk.green(' Your hooks are clean and ready to vibe!'));
      } catch (error) {
        UIHelper.showError(`Hook cleanup failed: ${error}`);
        process.exit(1);
      }
    });
}