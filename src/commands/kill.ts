import { confirm, select } from '@clack/prompts';
import { ProcessMonitor } from '../utils/process-monitor.js';
import { UIHelper } from '../utils/ui.js';

export interface KillCommandOptions {
  pid?: number[];
  force?: boolean;
  pattern?: string;
  hooks?: boolean;
  interactive?: boolean;
}

export class KillCommand {
  private monitor: ProcessMonitor;

  constructor() {
    this.monitor = new ProcessMonitor();
  }

  async execute(options: KillCommandOptions = {}): Promise<void> {
    try {
      if (options.pid && options.pid.length > 0) {
        await this.killByPids(options.pid, options.force);
      } else if (options.pattern) {
        await this.killByPattern(options.pattern, options.interactive);
      } else if (options.hooks) {
        await this.killAllHooks(options.interactive);
      } else {
        UIHelper.showError('Please specify process PIDs, pattern, or use --hooks option');
        this.showUsage();
      }
    } catch (error) {
      UIHelper.showError(`Process termination failed: ${error}`);
      process.exit(1);
    }
  }

  private async killByPids(pids: number[], force = false): Promise<void> {
    const spinner = UIHelper.createSpinner('Checking processes...');
    spinner.start();

    const allProcesses = await this.monitor.getAllProcesses();
    const targetProcesses = allProcesses.filter(p => pids.includes(p.pid));
    
    spinner.stop();

    if (targetProcesses.length === 0) {
      UIHelper.showWarning('Could not find specified processes');
      return;
    }

    if (targetProcesses.length !== pids.length) {
      const foundPids = targetProcesses.map(p => p.pid);
      const notFoundPids = pids.filter(pid => !foundPids.includes(pid));
      UIHelper.showWarning(`The following PIDs do not exist: ${notFoundPids.join(', ')}`);
    }

    // Show processes to be terminated
    UIHelper.showProcessTable(targetProcesses, 'Processes to be terminated');

    if (!force) {
      const shouldKill = await confirm({
        message: `Are you sure you want to terminate ${targetProcesses.length} processes?`
      });

      if (!shouldKill) {
        UIHelper.showWarning('Termination operation cancelled');
        return;
      }
    }

    await this.executeKill(targetProcesses);
  }

  private async killByPattern(pattern: string, interactive = false): Promise<void> {
    const spinner = UIHelper.createSpinner('Searching for matching processes...');
    spinner.start();

    const allProcesses = await this.monitor.getAllProcesses();
    const matchingProcesses = allProcesses.filter(p => 
      p.command.toLowerCase().includes(pattern.toLowerCase())
    );

    spinner.stop();

    if (matchingProcesses.length === 0) {
      UIHelper.showWarning(`No processes found matching pattern "${pattern}"`);
      return;
    }

    UIHelper.showProcessTable(matchingProcesses, `Processes matching "${pattern}"`);

    if (interactive && matchingProcesses.length > 1) {
      const action = await select({
        message: 'How would you like to handle these processes?',
        options: [
          { value: 'all', label: '💥 Terminate all matching processes' },
          { value: 'select', label: '✏️  Manually select processes to terminate' },
          { value: 'cancel', label: '❌ Cancel operation' }
        ]
      });

      switch (action) {
        case 'all':
          await this.executeKillWithConfirmation(matchingProcesses);
          break;
        case 'select':
          // TODO: Implement selective termination
          UIHelper.showWarning('Selective termination feature under development...');
          break;
        case 'cancel':
          UIHelper.showWarning('Operation cancelled');
          break;
      }
    } else {
      await this.executeKillWithConfirmation(matchingProcesses);
    }
  }

  private async killAllHooks(interactive = false): Promise<void> {
    const spinner = UIHelper.createSpinner('Searching for Hook processes...');
    spinner.start();

    const result = await this.monitor.detectSuspiciousHooks();
    const hookProcesses = result.suspiciousProcesses;

    spinner.stop();

    if (hookProcesses.length === 0) {
      UIHelper.showSuccess('No suspicious Hook processes found');
      return;
    }

    UIHelper.showProcessTable(hookProcesses, 'Detected Hook processes');

    if (interactive) {
      const action = await select({
        message: 'Hook processes detected. How would you like to handle them?',
        options: [
          { value: 'kill', label: '🔪 Immediately terminate all Hooks' },
          { value: 'analyze', label: ' Analyze before deciding' },
          { value: 'cancel', label: '❌ Cancel operation' }
        ]
      });

      if (action === 'kill') {
        await this.executeKillWithConfirmation(hookProcesses);
      } else if (action === 'analyze') {
        await this.analyzeHookProcesses(hookProcesses);
      } else {
        UIHelper.showWarning('Operation cancelled');
      }
    } else {
      await this.executeKillWithConfirmation(hookProcesses);
    }
  }

  private async executeKillWithConfirmation(processes: any[]): Promise<void> {
    const shouldKill = await confirm({
      message: `  Are you sure you want to terminate ${processes.length} processes? This operation cannot be undone.`
    });

    if (shouldKill) {
      await this.executeKill(processes);
    } else {
      UIHelper.showWarning('Termination operation cancelled');
    }
  }

  private async executeKill(processes: any[]): Promise<void> {
    const spinner = UIHelper.createSpinner(`Terminating ${processes.length} processes...`);
    spinner.start();

    let successCount = 0;
    const results = [];

    for (const process of processes) {
      try {
        const success = await this.monitor.killProcess(process.pid);
        results.push({ process, success });
        if (success) successCount++;
      } catch (error) {
        results.push({ process, success: false, error });
      }
    }

    spinner.stop();

    // Show results
    if (successCount === processes.length) {
      UIHelper.showSuccess(`Successfully terminated all ${processes.length} processes`);
    } else {
      UIHelper.showWarning(`Successfully terminated ${successCount}/${processes.length} processes`);
      
      const failedProcesses = results.filter(r => !r.success);
      if (failedProcesses.length > 0) {
        console.log('\n❌ Processes that failed to terminate:');
        failedProcesses.forEach(({ process, error }) => {
          console.log(`   PID ${process.pid}: ${process.command.substring(0, 50)} ${error ? `(${error})` : ''}`);
        });
      }
    }
  }

  private async analyzeHookProcesses(processes: any[]): Promise<void> {
    console.log('\n Hook Process Analysis:');
    console.log('═'.repeat(60));

    processes.forEach((proc, index) => {
      console.log(`\n${index + 1}. PID ${proc.pid} - ${proc.isHook ? '🎣 Hook' : '❓ Suspicious'}`);
      console.log(`   Command: ${proc.command}`);
      console.log(`   Resource usage: CPU ${proc.cpu}%, Memory ${proc.memory}%`);
      console.log(`   Runtime: ${proc.startTime}`);
      
      // Analyze potential issues
      const issues = [];
      if (proc.cpu > 10) issues.push('High CPU usage');
      if (proc.memory > 5) issues.push('High memory usage');
      if (proc.status === 'zombie') issues.push('Zombie process');
      
      if (issues.length > 0) {
        console.log(`     Issues: ${issues.join(', ')}`);
      }
    });

    const stillWantToKill = await confirm({
      message: 'After reviewing the analysis results, do you still want to terminate these processes?'
    });

    if (stillWantToKill) {
      await this.executeKill(processes);
    }
  }

  private showUsage(): void {
    console.log('\n📖 Usage:');
    console.log('  aitools kill [options]');
    console.log('\nOptions:');
    console.log('  --pid <pid1,pid2>    Terminate processes with specified PIDs');
    console.log('  --pattern <pattern>  Terminate processes matching pattern');
    console.log('  --hooks             Terminate all Hook processes');
    console.log('  --force             Force termination without confirmation');
    console.log('  --interactive       Interactive mode');
    console.log('\nExamples:');
    console.log('  aitools kill --pid 1234,5678');
    console.log('  aitools kill --pattern "claude"');
    console.log('  aitools kill --hooks --interactive');
  }
}