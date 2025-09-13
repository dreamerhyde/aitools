/**
 * Process Identifier with multi-level caching and batch optimization
 */

import path from 'path';
import type { ProcessInfo, IdentifiedProcess } from './types.js';
import { LRUCache } from './cache.js';
import { ProcessTree } from './tree.js';
import { ProcessRelationship } from './relationship.js';
import { SystemInfo } from './system-info.js';
import { ProcessPatterns } from './patterns.js';

export class ProcessIdentifier {
  // L1 Cache: Fast lookup for recently identified processes
  private static l1Cache = new LRUCache<string, IdentifiedProcess>(1000, 10000); // 10 second TTL

  // L2 Cache: Ongoing identification promises to prevent duplicate work
  private static l2Cache = new Map<string, Promise<IdentifiedProcess>>();

  /**
   * Unified entry point for process identification with automatic caching
   */
  static async identify(info: ProcessInfo): Promise<IdentifiedProcess> {
    const cacheKey = `${info.pid}:${info.port || ''}:${info.command.substring(0, 50)}`;

    // L1 Cache: Immediate return
    const cached = this.l1Cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // L2 Cache: Avoid duplicate identification
    if (this.l2Cache.has(cacheKey)) {
      return this.l2Cache.get(cacheKey)!;
    }

    // Start identification
    const promise = this.doIdentify(info);
    this.l2Cache.set(cacheKey, promise);

    try {
      const result = await promise;
      this.l1Cache.set(cacheKey, result);
      return result;
    } finally {
      this.l2Cache.delete(cacheKey);
    }
  }

  /**
   * Batch identify processes with shared system calls and intelligent parent-child relationships
   */
  static async identifyBatch(processes: ProcessInfo[]): Promise<Map<number, IdentifiedProcess>> {
    // Build process tree to understand relationships
    const processTree = new ProcessTree(processes);

    // Pre-fetch all CWDs in a single batch
    const pids = processes.map(p => p.pid);
    const cwds = await SystemInfo.batchGetCwd(pids);

    // Pre-fetch Docker info if any processes have ports
    const portsToCheck = processes.filter(p => p.port).map(p => p.port!);
    let dockerPorts: Map<number, { name: string; image: string }> = new Map();
    if (portsToCheck.length > 0) {
      dockerPorts = await SystemInfo.batchGetDockerPorts(portsToCheck);
    }

    const identified = new Map<number, IdentifiedProcess>();

    // Sort processes to identify parents before children
    const sortedProcesses = [...processes].sort((a, b) => {
      // If A is parent of B, A should come first
      if (processTree.isDescendantOf(b.pid, a.pid)) return -1;
      if (processTree.isDescendantOf(a.pid, b.pid)) return 1;
      return a.pid - b.pid;
    });

    // Identify processes considering parent-child relationships
    for (const process of sortedProcesses) {
      // Check cache first
      const cacheKey = `${process.pid}:${process.port || ''}:${process.command.substring(0, 50)}`;
      const cached = this.l1Cache.get(cacheKey);
      if (cached) {
        identified.set(process.pid, cached);
        continue;
      }

      // Handle Docker containers first (highest priority)
      if (process.port && dockerPorts.has(process.port)) {
        const dockerInfo = dockerPorts.get(process.port)!;
        const result: IdentifiedProcess = {
          displayName: `docker:${dockerInfo.name}`,
          category: 'container',
          project: dockerInfo.name,
          port: process.port,
          containerInfo: dockerInfo
        };
        this.l1Cache.set(cacheKey, result);
        identified.set(process.pid, result);
        continue;
      }

      // Get parent info and check if we should inherit
      const parent = processTree.getParent(process.pid);
      const parentIdentity = parent ? identified.get(parent.pid) : null;

      let result: IdentifiedProcess;

      if (parentIdentity && ProcessRelationship.shouldInherit(process, parent!, parentIdentity)) {
        // Inherit from parent for consistency
        result = ProcessRelationship.inheritIdentity(parentIdentity, process);
      } else {
        // Regular identification
        const enhancedInfo: ProcessInfo = {
          ...process,
          cwd: cwds.get(process.pid) || process.cwd
        };
        result = await this.identify(enhancedInfo);
      }

      this.l1Cache.set(cacheKey, result);
      identified.set(process.pid, result);
    }

    return identified;
  }

  /**
   * Core identification logic
   */
  private static async doIdentify(info: ProcessInfo): Promise<IdentifiedProcess> {
    const { pid, command, port } = info;

    // 1. Check Docker by port first if port is provided
    if (port) {
      const dockerInfo = await SystemInfo.getDockerContainerByPort(port);
      if (dockerInfo) {
        return {
          displayName: `docker:${dockerInfo.name}`,
          category: 'container',
          project: dockerInfo.name,
          port,
          containerInfo: dockerInfo
        };
      }
    }

    // 2. Get working directory for context and extract project name intelligently
    const cwd = info.cwd || await SystemInfo.getProcessCwd(pid);
    const projectName = ProcessPatterns.extractProjectName(cwd, command);

    // 3. Special case: Docker Desktop process
    if (command.match(/com\.docker/i) && port) {
      return {
        displayName: port ? `docker:${port}` : 'Docker Desktop',
        category: 'container',
        port
      };
    }

    // 4. Apply pattern matching
    const identified = ProcessPatterns.applyPatterns(command, { cwd, projectName, port });
    if (identified) {
      return identified;
    }

    // 5. Improved fallback - detect runtime-executed tools
    const firstPart = command.split(/\s+/)[0];
    const basename = path.basename(firstPart);

    // Common runtimes that might execute CLI tools
    const runtimes = ['node', 'bun', 'python', 'python3', 'ruby', 'php', 'deno'];

    if (runtimes.includes(basename)) {
      // Try to extract tool name from the command
      const toolMatch = command.match(/\/([\w-]+)\.(?:js|ts|py|rb|php|mjs)\s*(\w*)/);
      if (toolMatch) {
        const scriptName = toolMatch[1];
        const subcommand = toolMatch[2];

        // If script is generic and we have project name, use project name
        const genericScripts = ['cli', 'index', 'main', 'app', 'server', 'run'];
        const toolName = (genericScripts.includes(scriptName) && projectName) ? projectName : scriptName;

        return {
          displayName: subcommand ? `${toolName}:${subcommand}` : toolName,
          category: 'tool',
          project: projectName || undefined
        };
      }

      // If we have a project name but couldn't extract tool name, show project name
      if (projectName) {
        return {
          displayName: projectName,
          category: 'tool',
          project: projectName
        };
      }
    }

    // Final fallback - show basename with project if available
    return {
      displayName: projectName ? `${basename} [${projectName}]` : basename,
      category: 'system',
      project: projectName || undefined
    };
  }

  /**
   * Clear all caches
   */
  static clearCache(): void {
    this.l1Cache.clear();
    this.l2Cache.clear();
    SystemInfo.clearCache();
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { l1Size: number; l2Size: number; cwdSize: number; dockerSize: number } {
    const systemStats = SystemInfo.getCacheStats();
    return {
      l1Size: this.l1Cache.size(),
      l2Size: this.l2Cache.size,
      cwdSize: systemStats.cwdSize,
      dockerSize: systemStats.dockerSize
    };
  }
}

// Export convenience functions for backward compatibility
export const identifyProcess = (info: ProcessInfo) => ProcessIdentifier.identify(info);
export const identifyProcessBatch = (processes: ProcessInfo[]) => ProcessIdentifier.identifyBatch(processes);
export const formatProcessDisplay = (identified: IdentifiedProcess, port?: number): string => {
  if (port) {
    return `${identified.displayName}:${port}`;
  }
  return identified.displayName;
};