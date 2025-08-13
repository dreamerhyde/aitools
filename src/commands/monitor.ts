import { select, multiselect, confirm } from '@clack/prompts';
import { ProcessMonitor } from '../utils/process-monitor.js';
import { UIHelper } from '../utils/ui.js';
import { ProcessInfo } from '../types/index.js';

export interface MonitorCommandOptions {
  interactive?: boolean;
  cpuThreshold?: number;
  memoryThreshold?: number;
  autoKill?: boolean;
  watch?: boolean;
}

export class MonitorCommand {
  private monitor: ProcessMonitor;

  constructor(options: MonitorCommandOptions = {}) {
    this.monitor = new ProcessMonitor({
      cpuThreshold: options.cpuThreshold || 5.0,
      memoryThreshold: options.memoryThreshold || 1.0,
      timeThreshold: 300
    });
  }

  async execute(options: MonitorCommandOptions = {}): Promise<void> {
    const spinner = UIHelper.createSpinner('Scanning system processes...');
    spinner.start();

    try {
      const result = await this.monitor.detectSuspiciousHooks();
      spinner.stop();

      UIHelper.showDetectionResult(result);

      if (options.interactive) {
        await this.handleInteractiveMode(result);
      } else if (options.autoKill && result.suspiciousProcesses.length > 0) {
        await this.autoKillProcesses(result.suspiciousProcesses);
      }

      if (options.watch) {
        console.log('\n👀 Watch mode (press Ctrl+C to exit)');
        this.startWatchMode(options);
      }

    } catch (error) {
      spinner.stop();
      UIHelper.showError(`Monitoring failed: ${error}`);
      process.exit(1);
    }
  }

  private async handleInteractiveMode(result: any): Promise<void> {
    const allProblematicProcesses = [
      ...result.suspiciousProcesses,
      ...result.longRunningBash.filter((p: ProcessInfo) => p.cpu > 1.0)
    ];

    if (allProblematicProcesses.length === 0) {
      UIHelper.showSuccess('No problematic processes found that need handling');
      return;
    }

    const action = await select({
      message: 'Suspicious processes detected. How would you like to handle them?',
      options: [
        { value: 'kill', label: '🔪 Terminate selected processes' },
        { value: 'kill-all', label: '💥 Terminate all suspicious processes' },
        { value: 'ignore', label: '⏭️  Ignore for now' },
        { value: 'details', label: '🔍 View detailed information' }
      ]
    });

    switch (action) {
      case 'kill':
        await this.interactiveKill(allProblematicProcesses);
        break;
      case 'kill-all':
        await this.killAllProcesses(allProblematicProcesses);
        break;
      case 'details':
        await this.showDetailedInfo(allProblematicProcesses);
        break;
      case 'ignore':
        UIHelper.showWarning('Suspicious processes ignored');
        break;
    }
  }

  private async interactiveKill(processes: ProcessInfo[]): Promise<void> {
    const processOptions = processes.map((proc, index) => ({
      value: index,
      label: `PID ${proc.pid}: ${proc.command.substring(0, 50)}... (CPU: ${proc.cpu}%)`,
      hint: proc.isHook ? '🎣 Hook' : ''
    }));

    const selected = await multiselect({
      message: 'Select processes to terminate:',
      options: processOptions,
      required: false
    });

    if (Array.isArray(selected) && selected.length > 0) {
      const selectedProcesses = (selected as number[]).map(index => processes[index]);
      await this.killSelectedProcesses(selectedProcesses);
    }
  }

  private async killSelectedProcesses(processes: ProcessInfo[]): Promise<void> {
    const confirmKill = await confirm({
      message: `Are you sure you want to terminate ${processes.length} processes? This may affect running tasks.`
    });

    if (!confirmKill) {
      UIHelper.showWarning('Termination operation cancelled');
      return;
    }

    const spinner = UIHelper.createSpinner(`Terminating ${processes.length} processes...`);
    spinner.start();

    let successCount = 0;
    for (const process of processes) {
      const success = await this.monitor.killProcess(process.pid);
      if (success) {
        successCount++;
      }
    }

    spinner.stop();
    
    if (successCount === processes.length) {
      UIHelper.showSuccess(`Successfully terminated ${successCount} processes`);
    } else {
      UIHelper.showWarning(`Successfully terminated ${successCount}/${processes.length} processes`);
    }
  }

  private async killAllProcesses(processes: ProcessInfo[]): Promise<void> {
    const confirmKill = await confirm({
      message: `⚠️  Are you sure you want to terminate all ${processes.length} suspicious processes?`
    });

    if (confirmKill) {
      await this.killSelectedProcesses(processes);
    }
  }

  private async autoKillProcesses(processes: ProcessInfo[]): Promise<void> {
    UIHelper.showWarning(`Auto mode: Found ${processes.length} suspicious processes, terminating...`);
    
    for (const process of processes) {
      const success = await this.monitor.killProcess(process.pid);
      if (success) {
        console.log(`✅ Terminated PID ${process.pid}: ${process.command.substring(0, 50)}`);
      } else {
        console.log(`❌ Failed to terminate PID ${process.pid}: ${process.command.substring(0, 50)}`);
      }
    }
  }

  private async showDetailedInfo(processes: ProcessInfo[]): Promise<void> {
    console.log('\n📋 Detailed Process Information:');
    console.log('═'.repeat(80));
    
    processes.forEach((proc, index) => {
      console.log(`\n${index + 1}. PID ${proc.pid} (PPID: ${proc.ppid})`);
      console.log(`   Command: ${proc.command}`);
      console.log(`   CPU: ${proc.cpu}% | Memory: ${proc.memory}% | Runtime: ${proc.startTime}`);
      console.log(`   Status: ${proc.status} | Hook: ${proc.isHook ? 'Yes' : 'No'}`);
    });
  }

  private startWatchMode(options: MonitorCommandOptions): void {
    const watchInterval = setInterval(async () => {
      try {
        console.clear();
        const result = await this.monitor.detectSuspiciousHooks();
        UIHelper.showDetectionResult(result);
        
        if (options.autoKill && result.suspiciousProcesses.length > 0) {
          await this.autoKillProcesses(result.suspiciousProcesses);
        }
      } catch (error) {
        UIHelper.showError(`Monitoring update failed: ${error}`);
      }
    }, 5000);

    process.on('SIGINT', () => {
      clearInterval(watchInterval);
      console.log('\n👋 Monitoring stopped');
      process.exit(0);
    });
  }
}