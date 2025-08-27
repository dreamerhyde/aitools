import { exec } from 'child_process';
import { promisify } from 'util';
import { ProcessInfo, SystemStats, HookDetectionResult, MonitorOptions } from '../types/index.js';

const execAsync = promisify(exec);

export class ProcessMonitor {
  private options: MonitorOptions;

  constructor(options: Partial<MonitorOptions> = {}) {
    this.options = {
      cpuThreshold: 5.0,
      memoryThreshold: 1.0,
      timeThreshold: 300, // 5 minutes
      includeSystem: false,
      ...options
    };
  }

  async getSystemStats(): Promise<SystemStats> {
    try {
      // Get memory stats
      const { stdout: vmStat } = await execAsync('vm_stat');
      const { stdout: physicalMemory } = await execAsync('sysctl -n hw.memsize');
      
      // Get load average using sysctl (much faster than top)
      const { stdout: loadAvgOutput } = await execAsync('sysctl -n vm.loadavg');
      
      // Get CPU core count for proper percentage calculation
      const { stdout: cpuCountOutput } = await execAsync('sysctl -n hw.logicalcpu');
      const cpuCount = parseInt(cpuCountOutput.trim()) || 1;
      
      // Get CPU usage from ps (already being called anyway)
      const { stdout: cpuOutput } = await execAsync("ps aux | awk 'NR>1{sum+=$3} END {print sum}'");
      
      const memoryInfo = this.parseMemoryInfo(vmStat, parseInt(physicalMemory.trim()));
      
      // Parse load average from sysctl output: "{ 5.96 6.75 6.95 }"
      const loadMatch = loadAvgOutput.match(/\{\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
      const loadAverage = loadMatch ? 
        [parseFloat(loadMatch[1]), parseFloat(loadMatch[2]), parseFloat(loadMatch[3])] :
        [0, 0, 0];
      
      // Parse CPU usage and normalize to 0-100% by dividing by core count
      const rawCpuUsage = parseFloat(cpuOutput.trim()) || 0;
      const cpuUsage = rawCpuUsage / cpuCount;
      
      return {
        totalMemory: memoryInfo.total,
        freeMemory: memoryInfo.free,
        activeMemory: memoryInfo.active,
        memoryUsed: memoryInfo.usedBytes,
        memoryTotal: memoryInfo.totalBytes,
        cpuUsage: cpuUsage,
        loadAverage: loadAverage
      };
    } catch (error) {
      throw new Error(`Failed to get system status: ${error}`);
    }
  }

  async getAllProcesses(): Promise<ProcessInfo[]> {
    try {
      const { stdout } = await execAsync(
        'ps -Ao pid,ppid,pcpu,pmem,etime,stat,command | tail -n +2'
      );
      
      return stdout.trim().split('\n').map(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 7) return null;
        
        const [pid, ppid, cpu, memory, etime, stat, ...commandParts] = parts;
        const command = commandParts.join(' ');
        
        return {
          pid: parseInt(pid),
          ppid: parseInt(ppid),
          command,
          cpu: parseFloat(cpu),
          memory: parseFloat(memory),
          startTime: etime,
          isHook: this.isLikelyHook(command),
          status: this.parseStatus(stat)
        };
      }).filter((proc): proc is ProcessInfo => proc !== null);
    } catch (error) {
      throw new Error(`Failed to get process list: ${error}`);
    }
  }

  async findSuspiciousProcesses(): Promise<ProcessInfo[]> {
    const result = await this.detectSuspiciousHooks();
    return [
      ...result.suspiciousProcesses,
      ...result.highCpuProcesses,
      ...result.longRunningBash
    ];
  }

  async detectSuspiciousHooks(): Promise<HookDetectionResult> {
    const processes = await this.getAllProcesses();
    const systemStats = await this.getSystemStats();
    
    // Detect duplicate processes (same command running multiple times)
    const commandCounts = new Map<string, number>();
    processes.forEach(proc => {
      const baseCommand = proc.command.split(' ')[0]; // Get base command
      commandCounts.set(baseCommand, (commandCounts.get(baseCommand) || 0) + 1);
    });
    
    // Detect abnormal processes: sleeping but consuming CPU (zombie-like behavior)
    const suspiciousProcesses = processes.filter(proc => {
      // Hook processes that are suspicious
      if (proc.isHook) {
        // Restart/quick scripts shouldn't run long
        const isRestartScript = proc.command.includes('restart') || 
                               proc.command.includes('reload') || 
                               proc.command.includes('refresh');
        
        // Claude hooks are especially suspicious
        const isClaudeHook = proc.command.includes('.claude/hooks/');
        
        // Multiple instances of same hook
        const baseCommand = proc.command.split(' ')[0];
        const hasDuplicates = (commandCounts.get(baseCommand) || 0) > 1;
        
        // Any Claude hook using CPU while sleeping is abnormal
        if (isClaudeHook && proc.status === 'sleeping' && proc.cpu > 1) {
          return true;
        }
        
        // Restart scripts running for more than 1 minute
        if (isRestartScript && this.parseElapsedSeconds(proc.startTime) > 60) {
          return true;
        }
        
        // Multiple instances of the same hook
        if (isClaudeHook && hasDuplicates) {
          return true;
        }
        
        // General: sleeping but using significant CPU
        if (proc.status === 'sleeping' && proc.cpu >= 5) {
          return true;
        }
        
        // Long running hooks
        if (this.isLongRunning(proc.startTime)) {
          return true;
        }
        
        // High CPU hooks
        if (proc.cpu > this.options.cpuThreshold) {
          return true;
        }
      }
      return false;
    });
    
    const highCpuProcesses = processes.filter(proc => 
      proc.cpu > this.options.cpuThreshold && !proc.isHook
    );
    
    const longRunningBash = processes.filter(proc =>
      proc.command.includes('bash') && 
      this.isLongRunning(proc.startTime) &&
      (proc.cpu > 0 || proc.status === 'sleeping') // Include sleeping bash with any CPU usage
    );
    
    return {
      suspiciousProcesses,
      highCpuProcesses,
      longRunningBash,
      systemStats
    };
  }

  async getHighCpuProcesses(threshold: number = 10): Promise<ProcessInfo[]> {
    const processes = await this.getAllProcesses();
    return processes
      .filter(p => p.cpu > threshold)
      .sort((a, b) => b.cpu - a.cpu);
  }

  async killProcess(pid: number): Promise<boolean> {
    try {
      await execAsync(`kill -TERM ${pid}`);
      // Wait 2 seconds, force kill if still alive
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        await execAsync(`kill -0 ${pid}`);
        await execAsync(`kill -KILL ${pid}`);
      } catch {
        // Process already terminated
      }
      
      return true;
    } catch (error: any) {
      // Extract only the relevant error message
      const errorMessage = error.stderr ? 
        error.stderr.trim().replace(/\/bin\/sh: line \d+: /, '') : 
        error.message || 'Unknown error';
      
      // Only log permission errors and other critical errors silently
      if (errorMessage.includes('Operation not permitted')) {
        // Silent fail for permission errors - handled by caller
      } else if (errorMessage.includes('No such process')) {
        // Process already terminated - silent
      } else {
        // For other errors, log a concise message
        console.error(`Failed to terminate PID ${pid}: ${errorMessage}`);
      }
      
      return false;
    }
  }

  private isLikelyHook(command: string): boolean {
    // Exclude aitools itself from hook detection
    if (command.includes('aitools/dist/cli.js') || 
        command.includes('ai ps hooks') ||
        command.includes('ai process hooks')) {
      return false;
    }
    
    const hookPatterns = [
      /hook/i,
      /claude.*code/i,
      /git.*hook/i,
      /pre-commit/i,
      /post-commit/i,
      /husky/i,
      /lint-staged/i
    ];
    
    return hookPatterns.some(pattern => pattern.test(command));
  }

  private parseStatus(stat: string): ProcessInfo['status'] {
    const firstChar = stat.charAt(0).toUpperCase();
    switch (firstChar) {
      case 'R': return 'running';
      case 'S': return 'sleeping';
      case 'Z': return 'zombie';
      case 'T': return 'stopped';
      default: return 'running';
    }
  }

  private isLongRunning(etime: string): boolean {
    return this.parseElapsedSeconds(etime) > this.options.timeThreshold;
  }
  
  private parseElapsedSeconds(etime: string): number {
    // Parse etime format (could be MM:SS or HH:MM:SS or DD-HH:MM:SS)
    const parts = etime.split(/[-:]/);
    let totalSeconds = 0;
    
    if (parts.length === 2) {
      // MM:SS
      totalSeconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else if (parts.length === 3) {
      // HH:MM:SS
      totalSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    } else if (parts.length === 4) {
      // DD-HH:MM:SS
      totalSeconds = parseInt(parts[0]) * 86400 + parseInt(parts[1]) * 3600 + 
                    parseInt(parts[2]) * 60 + parseInt(parts[3]);
    }
    
    return totalSeconds;
  }

  private parseMemoryInfo(vmStat: string, physicalMemoryBytes?: number): { total: string; free: string; active: string; usedBytes: number; totalBytes: number } {
    const lines = vmStat.split('\n');
    const pageSize = 4096; // macOS page size
    
    let freePages = 0;
    let activePages = 0;
    let speculativePages = 0;
    let inactivePages = 0;
    let wiredPages = 0;
    let compressedPages = 0;
    
    lines.forEach(line => {
      if (line.includes('Pages free:')) {
        freePages = parseInt(line.split(':')[1].trim().replace('.', ''));
      } else if (line.includes('Pages active:')) {
        activePages = parseInt(line.split(':')[1].trim().replace('.', ''));
      } else if (line.includes('Pages speculative:')) {
        speculativePages = parseInt(line.split(':')[1].trim().replace('.', ''));
      } else if (line.includes('Pages inactive:')) {
        inactivePages = parseInt(line.split(':')[1].trim().replace('.', ''));
      } else if (line.includes('Pages wired down:')) {
        wiredPages = parseInt(line.split(':')[1].trim().replace('.', ''));
      } else if (line.includes('Pages occupied by compressor:')) {
        compressedPages = parseInt(line.split(':')[1].trim().replace('.', ''));
      }
    });
    
    const usedPages = activePages + wiredPages + compressedPages;
    
    const freeMemory = Math.round((freePages + speculativePages) * pageSize / 1024 / 1024);
    const activeMemory = Math.round(activePages * pageSize / 1024 / 1024);
    
    // Use physical memory if provided, otherwise calculate from pages
    let totalMemory: number;
    let totalBytes: number;
    if (physicalMemoryBytes) {
      totalMemory = Math.round(physicalMemoryBytes / 1024 / 1024);
      totalBytes = physicalMemoryBytes;
    } else {
      const totalPages = freePages + activePages + speculativePages + inactivePages + wiredPages + compressedPages;
      totalMemory = Math.round(totalPages * pageSize / 1024 / 1024);
      totalBytes = totalPages * pageSize;
    }
    
    return {
      total: `${totalMemory}MB`,
      free: `${freeMemory}MB`,
      active: `${activeMemory}MB`,
      usedBytes: usedPages * pageSize,
      totalBytes
    };
  }

  // Removed parseCpuInfo method - no longer needed since we don't use top command
}