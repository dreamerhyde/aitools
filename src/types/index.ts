export interface ProcessInfo {
  pid: number;
  ppid: number;
  command: string;
  cpu: number;
  memory: number;
  startTime: string;
  isHook: boolean;
  status: 'running' | 'sleeping' | 'zombie' | 'stopped';
}

export interface SystemStats {
  totalMemory: string;
  freeMemory: string;
  activeMemory: string;
  memoryUsed: number;  // in bytes
  memoryTotal: number; // in bytes
  cpuUsage: number;
  loadAverage: number[];
}

export interface HookDetectionResult {
  suspiciousProcesses: ProcessInfo[];
  highCpuProcesses: ProcessInfo[];
  longRunningBash: ProcessInfo[];
  systemStats: SystemStats;
}

export interface MonitorOptions {
  cpuThreshold: number;
  memoryThreshold: number;
  timeThreshold: number;
  includeSystem: boolean;
}