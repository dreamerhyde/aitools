import chalk from 'chalk';
import { ProcessIdentifier } from './process-identifier.js';
import type { ProcessInfo } from '../types/index.js';
import type { IdentifiedProcess } from './process/types.js';

export const PROCESS_DISPLAY_LIMIT = 30;

const COMMON_PORTS = ['80', '443', '8080', '8000', '3000', '5173', '5432', '3306'];

const DEV_TOOL_PATTERNS: RegExp[] = [
  /\b(vercel|vc)\s+dev/i,
  /\b(next|nuxt|vite)\s+dev/i,
  /\b(npm|yarn|pnpm|bun)\s+(run\s+)?(dev|start|serve)/i,
  /node.*webpack-dev-server/i,
  /node.*react-scripts.*start/i,
  /\btailwindcss.*--watch/i,
  /\bturbo.*dev/i,
  /\bnx.*serve/i,
];

export function isDevelopmentTool(command: string): boolean {
  return DEV_TOOL_PATTERNS.some(pattern => pattern.test(command));
}

export function getCommandWidth(): { termWidth: number; commandWidth: number } {
  const termWidth = process.stdout.columns || 120;
  const commandWidth = Math.max(50, termWidth - 40);
  return { termWidth, commandWidth };
}

export function truncateCommand(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  return text.substring(0, maxWidth - 3) + '...';
}

export function colorizePercent(value: number): string {
  const formatted = value.toFixed(1);
  if (value > 20) return chalk.red(formatted);
  if (value > 10) return chalk.yellow(formatted);
  return formatted;
}

export function colorizePercentPadded(value: number): string {
  const padded = value.toFixed(1).padStart(5);
  if (value > 20) return chalk.red(padded + '%');
  if (value > 10) return chalk.yellow(padded + '%');
  return chalk.white(padded + '%');
}

export function getStatusIndicator(status: string, isAbnormal = false): string {
  switch (status.toLowerCase()) {
    case 'running':
      return isAbnormal ? chalk.red('●') : chalk.green('●');
    case 'sleeping':
    case 'idle':
      return isAbnormal ? chalk.yellow('●') : chalk.gray('○');
    case 'stopped':
      return chalk.yellow('●');
    case 'zombie':
      return chalk.red('●');
    default:
      return chalk.gray('○');
  }
}

export function colorizePort(port: string): string {
  if (COMMON_PORTS.includes(port)) return chalk.yellow(port);
  if (parseInt(port) < 1024) return chalk.red(port);
  return chalk.cyan(port);
}

export function displayStatusLegend(): void {
  console.log(
    chalk.gray('\nStatus: ') +
      chalk.green('●') + ' Running  ' +
      chalk.gray('○') + ' Idle/Sleeping  ' +
      chalk.yellow('●') + ' Stopped  ' +
      chalk.red('●') + ' Zombie',
  );
}

export function sortProcesses(
  processes: ProcessInfo[],
  field: string,
  devToolPriority = true,
): void {
  processes.sort((a, b) => {
    if (devToolPriority) {
      const aIsDev = isDevelopmentTool(a.command);
      const bIsDev = isDevelopmentTool(b.command);
      if (aIsDev && !bIsDev) return -1;
      if (!aIsDev && bIsDev) return 1;
    }

    switch (field) {
      case 'mem':
        return b.memory - a.memory;
      case 'pid':
        return a.pid - b.pid;
      default: // 'cpu'
        return b.cpu - a.cpu;
    }
  });
}

export async function batchIdentifyProcesses(
  processes: ProcessInfo[],
): Promise<Map<number, IdentifiedProcess>> {
  return ProcessIdentifier.identifyBatch(
    processes.slice(0, PROCESS_DISPLAY_LIMIT).map(p => ({ pid: p.pid, command: p.command })),
  );
}

export function resolveDisplayName(
  pid: number,
  identifiedMap: Map<number, IdentifiedProcess>,
  fallbackCommand: string,
): string {
  const identity = identifiedMap.get(pid);
  return identity ? identity.displayName : fallbackCommand.substring(0, 50);
}

export function isUserCancellation(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === 'ExitPromptError') return true;
    if (error.message?.includes('SIGINT')) return true;
    if (!error.name) return true;
  }
  return false;
}
