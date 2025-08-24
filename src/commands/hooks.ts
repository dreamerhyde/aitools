import { ProcessMonitor } from '../utils/process-monitor.js';
import { UIHelper } from '../utils/ui.js';
import { ProcessInfo } from '../types/index.js';
import inquirer from 'inquirer';
import chalk from 'chalk';

export class HooksCommand {
  private monitor: ProcessMonitor;

  constructor(options: any = {}) {
    this.monitor = new ProcessMonitor(options);
  }

  async execute(options: any): Promise<void> {
    const spinner = UIHelper.createSpinner('Detecting AI development hooks...');
    spinner.start();

    const processes = await this.monitor.getAllProcesses();
    
    // Filter hook processes
    const hookProcesses = processes.filter(proc => proc.isHook);
    
    spinner.stop();
    
    UIHelper.showHeader();
    
    if (hookProcesses.length === 0) {
      UIHelper.showSuccess('No active AI development hooks found');
      return;
    }
    
    // Show hooks grouped by type
    const claudeHooks = hookProcesses.filter(p => p.command.includes('claude'));
    const gitHooks = hookProcesses.filter(p => 
      p.command.includes('git') || p.command.includes('pre-commit') || p.command.includes('post-commit')
    );
    const otherHooks = hookProcesses.filter(p => 
      !p.command.includes('claude') && !p.command.includes('git') && 
      !p.command.includes('pre-commit') && !p.command.includes('post-commit')
    );
    
    if (claudeHooks.length > 0) {
      UIHelper.showProcessTable(claudeHooks, 'Claude Code Hooks');
    }
    
    if (gitHooks.length > 0) {
      UIHelper.showProcessTable(gitHooks, 'Git Hooks');
    }
    
    if (otherHooks.length > 0) {
      UIHelper.showProcessTable(otherHooks, 'Other Development Hooks');
    }
    
    // Summary
    console.log();
    console.log('▪ Summary');
    console.log(`   → Total hooks: ${hookProcesses.length}`);
    console.log(`   → Claude hooks: ${claudeHooks.length}`);
    console.log(`   → Git hooks: ${gitHooks.length}`);
    console.log(`   → Other hooks: ${otherHooks.length}`);
    
    // Interactive options
    if (options.interactive) {
      await this.handleInteractive(hookProcesses);
    } else if (options.kill) {
      await this.killAllHooks(hookProcesses);
    }
  }
  
  private async handleInteractive(hooks: ProcessInfo[]): Promise<void> {
    if (hooks.length === 0) return;
    
    try {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do? (CTRL+C to cancel)',
          choices: [
            { name: 'Kill all hooks', value: 'kill-all' },
            { name: 'Select hooks to kill', value: 'select' },
            { name: 'Exit', value: 'exit' }
          ],
          loop: false
        }
      ]);
      
      if (action === 'kill-all') {
        await this.killAllHooks(hooks);
      } else if (action === 'select') {
        const { selected } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selected',
            message: 'Select hooks to terminate (CTRL+C to cancel):',
            choices: hooks.map(proc => ({
              name: `[PID: ${proc.pid}] ${proc.command.substring(0, 80)}`,
              value: proc.pid
            })),
            loop: false
          }
        ]);
        
        if (selected && selected.length > 0) {
          for (const pid of selected) {
            const success = await this.monitor.killProcess(pid);
            if (success) {
              UIHelper.showSuccess(`Terminated process ${pid}`);
            } else {
              UIHelper.showError(`Failed to terminate process ${pid}`);
            }
          }
        } else {
          console.log(chalk.gray('No processes selected'));
        }
      }
    } catch (error: any) {
      // User cancelled with Ctrl+C
      if (error.name === 'ExitPromptError' || !error.name) {
        console.log(chalk.gray('\nOperation cancelled'));
      } else {
        throw error;
      }
    }
  }
  
  private async killAllHooks(hooks: ProcessInfo[]): Promise<void> {
    if (hooks.length === 0) return;
    
    console.log('\nTerminating all hooks...');
    let killed = 0;
    let failed = 0;
    
    for (const proc of hooks) {
      const success = await this.monitor.killProcess(proc.pid);
      if (success) {
        killed++;
      } else {
        failed++;
      }
    }
    
    if (killed > 0) {
      UIHelper.showSuccess(`Successfully terminated ${killed} hook process(es)`);
    }
    if (failed > 0) {
      UIHelper.showError(`Failed to terminate ${failed} hook process(es)`);
    }
  }
}