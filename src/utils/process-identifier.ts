/**
 * Smart process identifier using multiple strategies with LRU cache and batch optimization
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export interface ProcessInfo {
  pid: number;
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

/**
 * LRU Cache implementation for process identification
 */
class LRUCache<K, V> {
  private maxSize: number;
  private cache: Map<K, { value: V; timestamp: number }>;
  private accessOrder: K[];
  private ttl: number;

  constructor(maxSize: number, ttl: number = 10000) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessOrder = [];
    this.ttl = ttl;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.delete(key);
      return undefined;
    }

    // Update access order
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);

    return entry.value;
  }

  set(key: K, value: V): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, { value, timestamp: Date.now() });

    // Update access order
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  delete(key: K): void {
    this.cache.delete(key);
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Process Identifier with multi-level caching and batch optimization
 */
export class ProcessIdentifier {
  // L1 Cache: Fast lookup for recently identified processes
  private static l1Cache = new LRUCache<string, IdentifiedProcess>(1000, 10000); // 10 second TTL

  // L2 Cache: Ongoing identification promises to prevent duplicate work
  private static l2Cache = new Map<string, Promise<IdentifiedProcess>>();

  // CWD Cache with batch support
  private static cwdCache = new Map<number, string>();
  private static cwdCacheTime = 0;
  private static CWD_CACHE_TTL = 30000; // 30 seconds

  // Docker cache
  private static dockerCache = new Map<number, { name: string; image: string }>();
  private static dockerCacheTime = 0;
  private static DOCKER_CACHE_TTL = 30000; // 30 seconds

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
   * Batch identify processes with shared system calls
   */
  static async identifyBatch(processes: ProcessInfo[]): Promise<Map<number, IdentifiedProcess>> {
    // Pre-fetch all CWDs in a single batch
    const pids = processes.map(p => p.pid);
    const cwds = await this.batchGetCwd(pids);

    // Pre-fetch Docker info if any processes have ports
    const portsToCheck = processes.filter(p => p.port).map(p => p.port!);
    let dockerPorts: Map<number, { name: string; image: string }> = new Map();
    if (portsToCheck.length > 0) {
      dockerPorts = await this.batchGetDockerPorts(portsToCheck);
    }

    // Identify all processes with pre-fetched data
    const identifyPromises = processes.map(async (p) => {
      const enhancedInfo: ProcessInfo = {
        ...p,
        cwd: cwds.get(p.pid) || p.cwd
      };

      // Check cache first
      const cacheKey = `${p.pid}:${p.port || ''}:${p.command.substring(0, 50)}`;
      const cached = this.l1Cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Use pre-fetched Docker info if available
      if (p.port && dockerPorts.has(p.port)) {
        const dockerInfo = dockerPorts.get(p.port)!;
        const result: IdentifiedProcess = {
          displayName: `docker:${dockerInfo.name}`,
          category: 'container',
          project: dockerInfo.name,
          port: p.port,
          containerInfo: dockerInfo
        };
        this.l1Cache.set(cacheKey, result);
        return result;
      }

      return this.identify(enhancedInfo);
    });

    const identified = await Promise.all(identifyPromises);

    // Return as map for easy lookup
    const result = new Map<number, IdentifiedProcess>();
    processes.forEach((p, i) => {
      result.set(p.pid, identified[i]);
    });

    return result;
  }

  /**
   * Batch get working directories with a single lsof call
   */
  private static async batchGetCwd(pids: number[]): Promise<Map<number, string>> {
    const result = new Map<number, string>();

    // Return cached values if still valid
    if (Date.now() - this.cwdCacheTime < this.CWD_CACHE_TTL) {
      for (const pid of pids) {
        if (this.cwdCache.has(pid)) {
          result.set(pid, this.cwdCache.get(pid)!);
        }
      }
      // If all found in cache, return immediately
      if (result.size === pids.length) {
        return result;
      }
    }

    // Batch query for missing PIDs
    const missingPids = pids.filter(pid => !result.has(pid));
    if (missingPids.length === 0) {
      return result;
    }

    try {
      // Use single lsof call for all PIDs
      const pidList = missingPids.join(',');
      const { stdout } = await execAsync(
        `lsof -p ${pidList} -a -d cwd -F pn 2>/dev/null`
      ).catch(() => ({ stdout: '' }));

      if (stdout) {
        // Parse lsof output: p<pid> followed by n<path>
        const lines = stdout.trim().split('\n');
        let currentPid: number | null = null;

        for (const line of lines) {
          if (line.startsWith('p')) {
            currentPid = parseInt(line.substring(1));
          } else if (line.startsWith('n') && currentPid !== null) {
            const cwd = line.substring(1);
            result.set(currentPid, cwd);
            this.cwdCache.set(currentPid, cwd);
          }
        }

        this.cwdCacheTime = Date.now();
      }
    } catch {
      // Silent fail, CWD is optional enhancement
    }

    return result;
  }

  /**
   * Batch get Docker container info for ports
   */
  private static async batchGetDockerPorts(ports: number[]): Promise<Map<number, { name: string; image: string }>> {
    const result = new Map<number, { name: string; image: string }>();

    // Check cache first
    if (Date.now() - this.dockerCacheTime < this.DOCKER_CACHE_TTL) {
      for (const port of ports) {
        if (this.dockerCache.has(port)) {
          result.set(port, this.dockerCache.get(port)!);
        }
      }
      if (result.size === ports.length) {
        return result;
      }
    }

    try {
      // Get all running containers with port mappings
      const { stdout } = await execAsync(
        `docker ps --format "{{.Names}}|{{.Image}}|{{.Ports}}" 2>/dev/null`
      ).catch(() => ({ stdout: '' }));

      if (stdout) {
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const [name, image, portsStr] = line.split('|');

          // Parse ports (e.g., "0.0.0.0:3000->3000/tcp, 0.0.0.0:5432->5432/tcp")
          for (const port of ports) {
            if (portsStr && portsStr.includes(`:${port}->`)) {
              const containerInfo = { name, image };
              result.set(port, containerInfo);
              this.dockerCache.set(port, containerInfo);
            }
          }
        }

        this.dockerCacheTime = Date.now();
      }
    } catch {
      // Docker might not be available
    }

    return result;
  }

  /**
   * Core identification logic
   */
  private static async doIdentify(info: ProcessInfo): Promise<IdentifiedProcess> {
    const { pid, command, port } = info;

    // 1. Check Docker by port first if port is provided
    if (port) {
      const dockerInfo = await this.getDockerContainerByPort(port);
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

    // 2. Get working directory for context
    const cwd = info.cwd || await this.getProcessCwd(pid);
    const projectName = cwd ? path.basename(cwd) : null;

    // 3. Special case: Docker Desktop process
    if (command.match(/com\.docker/i) && port) {
      return {
        displayName: port ? `docker:${port}` : 'Docker Desktop',
        category: 'container',
        port
      };
    }

    // 4. Apply pattern matching
    const identified = this.applyPatterns(command, { cwd, projectName, port });
    if (identified) {
      return identified;
    }

    // 5. Fallback
    const basename = path.basename(command.split(/\s+/)[0]);
    return {
      displayName: projectName ? `${basename} [${projectName}]` : basename,
      category: 'system',
      project: projectName || undefined
    };
  }

  /**
   * Get Docker container by port
   */
  private static async getDockerContainerByPort(port: number): Promise<{ name: string; image: string } | null> {
    // Check cache first
    if (this.dockerCache.has(port) && Date.now() - this.dockerCacheTime < this.DOCKER_CACHE_TTL) {
      return this.dockerCache.get(port)!;
    }

    try {
      const { stdout } = await execAsync(
        `docker ps --format "{{.Names}}|{{.Image}}|{{.Ports}}" 2>/dev/null | grep ":${port}->"`
      ).catch(() => ({ stdout: '' }));

      if (stdout) {
        const [name, image] = stdout.trim().split('|');
        const result = { name, image };
        this.dockerCache.set(port, result);
        this.dockerCacheTime = Date.now();
        return result;
      }
    } catch {
      // Docker not available
    }

    return null;
  }

  /**
   * Get process working directory
   */
  private static async getProcessCwd(pid: number): Promise<string | null> {
    // Check cache first
    if (this.cwdCache.has(pid) && Date.now() - this.cwdCacheTime < this.CWD_CACHE_TTL) {
      return this.cwdCache.get(pid)!;
    }

    try {
      const { stdout } = await execAsync(
        `lsof -p ${pid} -a -d cwd -F n 2>/dev/null | grep '^n' | head -1`
      );
      if (stdout) {
        const cwd = stdout.replace(/^n/, '').trim();
        this.cwdCache.set(pid, cwd);
        this.cwdCacheTime = Date.now();
        return cwd;
      }
    } catch {
      // Silent fail
    }

    return null;
  }

  /**
   * Apply pattern matching for process identification
   */
  private static applyPatterns(
    command: string,
    context: { cwd?: string | null; projectName?: string | null; port?: number }
  ): IdentifiedProcess | null {
    const identifiers: Array<{
      pattern: RegExp;
      handler: (match: RegExpMatchArray, ctx: typeof context) => IdentifiedProcess;
    }> = [
      // Web development servers
      {
        pattern: /node.*\/(vc|vercel)\s+(\w+)/i,
        handler: (match, ctx) => ({
          displayName: ctx.projectName ? `vercel:${match[2]} [${ctx.projectName}]` : `vercel:${match[2]}`,
          category: 'web',
          project: ctx.projectName || undefined
        })
      },
      {
        pattern: /node.*\/(next|nuxt|vite|webpack-dev-server|react-scripts)\s*(.*)/i,
        handler: (match, ctx) => ({
          displayName: ctx.projectName ? `${match[1]}:${ctx.projectName}` : match[1],
          category: 'web',
          project: ctx.projectName || undefined
        })
      },
      {
        pattern: /(npm|yarn|pnpm|bun)\s+(?:run\s+)?(\w+)/i,
        handler: (match, ctx) => ({
          displayName: ctx.projectName ? `${match[1]}:${match[2]} [${ctx.projectName}]` : `${match[1]}:${match[2]}`,
          category: 'tool',
          project: ctx.projectName || undefined
        })
      },
      // Databases
      {
        pattern: /(postgres|postgresql|mysql|mongodb|redis|elasticsearch)/i,
        handler: (match) => ({
          displayName: match[1].toLowerCase(),
          category: 'database'
        })
      },
      // Programming languages
      {
        pattern: /^(node|python\d*|ruby|java|go|rust|php)\s+(.+)/i,
        handler: (match, ctx) => {
          const runtime = match[1];
          const script = match[2];

          let scriptName = script;
          if (script.includes('/')) {
            scriptName = path.basename(script);
            // Common entry points
            if (['index.js', 'main.js', 'app.js', 'server.js', 'main.py', 'app.py'].includes(scriptName) && ctx.projectName) {
              return {
                displayName: `${runtime}:${ctx.projectName}`,
                category: 'script',
                project: ctx.projectName
              };
            }
          }

          scriptName = scriptName.replace(/\.(js|ts|py|rb|go|rs|php)$/, '');

          return {
            displayName: ctx.projectName ? `${runtime}:${scriptName} [${ctx.projectName}]` : `${runtime}:${scriptName}`,
            category: 'script',
            project: ctx.projectName || undefined
          };
        }
      },
      // macOS Applications
      {
        pattern: /\/Applications\/([^/]+)\.app\/.*\/([^/\s]+)$/i,
        handler: (match) => {
          const appName = match[1];
          const binary = match[2];
          if (binary.toLowerCase().replace(/[\s-]/g, '') === appName.toLowerCase().replace(/[\s-]/g, '')) {
            return { displayName: appName, category: 'app' };
          }
          return { displayName: `${appName}:${binary}`, category: 'app' };
        }
      }
    ];

    for (const { pattern, handler } of identifiers) {
      const match = command.match(pattern);
      if (match) {
        return handler(match, context);
      }
    }

    return null;
  }

  /**
   * Clear all caches
   */
  static clearCache(): void {
    this.l1Cache.clear();
    this.l2Cache.clear();
    this.cwdCache.clear();
    this.dockerCache.clear();
    this.cwdCacheTime = 0;
    this.dockerCacheTime = 0;
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { l1Size: number; l2Size: number; cwdSize: number; dockerSize: number } {
    return {
      l1Size: this.l1Cache.size(),
      l2Size: this.l2Cache.size,
      cwdSize: this.cwdCache.size,
      dockerSize: this.dockerCache.size
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