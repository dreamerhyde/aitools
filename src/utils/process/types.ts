/**
 * Shared type definitions for process identification modules
 */

export interface ProcessInfo {
  pid: number;
  ppid?: number;
  command: string;
  cwd?: string;
  name?: string;
  port?: number;
}

export interface IdentifiedProcess {
  displayName: string;
  category: 'web' | 'database' | 'tool' | 'service' | 'app' | 'script' | 'system' | 'container';
  project?: string;
  port?: number;
  containerInfo?: { name: string; image: string };
}

export interface ProcessContext {
  cwd?: string | null;
  projectName?: string | null;
  port?: number;
}

export interface PatternIdentifier {
  pattern: RegExp;
  handler: (match: RegExpMatchArray, ctx: ProcessContext) => IdentifiedProcess;
}