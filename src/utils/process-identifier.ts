/**
 * Smart process identifier using multiple strategies with LRU cache and batch optimization
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

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

/**
 * Process tree for managing parent-child relationships
 */
class ProcessTree {
  private processes: Map<number, ProcessInfo>;
  private childrenMap: Map<number, Set<number>>;
  private parentMap: Map<number, number>;

  constructor(processes: ProcessInfo[]) {
    this.processes = new Map(processes.map(p => [p.pid, p]));
    this.childrenMap = new Map();
    this.parentMap = new Map();

    // Build parent-child relationships
    for (const process of processes) {
      if (process.ppid) {
        // Map child to parent
        this.parentMap.set(process.pid, process.ppid);

        // Map parent to children
        if (!this.childrenMap.has(process.ppid)) {
          this.childrenMap.set(process.ppid, new Set());
        }
        this.childrenMap.get(process.ppid)!.add(process.pid);
      }
    }
  }

  getParent(pid: number): ProcessInfo | null {
    const ppid = this.parentMap.get(pid);
    return ppid ? this.processes.get(ppid) || null : null;
  }

  getChildren(pid: number): ProcessInfo[] {
    const childPids = this.childrenMap.get(pid) || new Set();
    return Array.from(childPids)
      .map(childPid => this.processes.get(childPid))
      .filter((p): p is ProcessInfo => p !== undefined);
  }

  isDescendantOf(childPid: number, ancestorPid: number): boolean {
    let currentPid = childPid;
    const visited = new Set<number>();

    while (currentPid && !visited.has(currentPid)) {
      visited.add(currentPid);
      const parentPid = this.parentMap.get(currentPid);

      if (parentPid === ancestorPid) {
        return true;
      }

      currentPid = parentPid || 0;
    }

    return false;
  }
}

/**
 * Intelligent process relationship detection
 */
class ProcessRelationship {
  /**
   * Check if child process should inherit parent's identity
   */
  static shouldInherit(
    child: ProcessInfo,
    parent: ProcessInfo,
    parentIdentity: IdentifiedProcess
  ): boolean {
    const parentCmd = parent.command.toLowerCase();
    const childCmd = child.command.toLowerCase();

    // Rule 1: Development tool chains
    if (this.isDevelopmentToolChain(parentCmd, childCmd)) {
      return true;
    }

    // Rule 2: Same project directory
    if (parentIdentity.project && this.isSameProject(parent.command, child.command, parentIdentity.project)) {
      return true;
    }

    // Rule 3: Script execution chain
    if (this.isScriptExecutionChain(parentCmd, childCmd)) {
      return true;
    }

    return false;
  }

  /**
   * Detect development tool chains (npm -> next-server, vercel -> webpack, etc.)
   */
  private static isDevelopmentToolChain(parentCmd: string, childCmd: string): boolean {
    const devTools = /\b(npm|yarn|pnpm|bun|vercel|nx|turbo|next|vite|webpack)/;
    const devServers = /\b(next-server|webpack|vite|nodemon|ts-node|dev-server|serve)/;

    return devTools.test(parentCmd) && devServers.test(childCmd);
  }

  /**
   * Check if processes belong to the same project
   */
  private static isSameProject(parentCmd: string, childCmd: string, parentProject: string): boolean {
    // Extract project name from child command
    const childProjectMatch = childCmd.match(/\/([^\/]+)\/(dist|src|bin|lib|build|out)\//);
    if (childProjectMatch && childProjectMatch[1] === parentProject) {
      return true;
    }

    // Check if both commands reference the same project directory
    const parentProjectPattern = new RegExp(`/${parentProject}/`, 'i');
    return parentProjectPattern.test(childCmd);
  }

  /**
   * Detect script execution chains (shell -> script -> tool)
   */
  private static isScriptExecutionChain(parentCmd: string, childCmd: string): boolean {
    const shells = /\b(sh|bash|zsh|fish|csh|tcsh)$/;
    const runtimes = /\b(node|bun|python|python3|ruby|php|deno)/;

    // Shell -> Runtime/Script
    if (shells.test(parentCmd) && (runtimes.test(childCmd) || childCmd.includes('/'))) {
      return true;
    }

    // Runtime -> Script (when script path is clear)
    if (runtimes.test(parentCmd) && childCmd.includes('/') && childCmd.includes('.')) {
      return true;
    }

    return false;
  }

  /**
   * Create inherited identity from parent
   */
  static inheritIdentity(parentIdentity: IdentifiedProcess, child: ProcessInfo): IdentifiedProcess {
    // Keep the parent's main identity but add child-specific info if needed
    const childName = path.basename(child.command.split(/\s+/)[0]);

    // For development servers, we usually want to keep the parent's name
    const devServers = ['next-server', 'webpack', 'vite', 'nodemon'];
    if (devServers.some(server => child.command.toLowerCase().includes(server))) {
      return {
        ...parentIdentity,
        // Keep parent's displayName - this ensures consistency
      };
    }

    // For other cases, might want to show relationship
    return {
      ...parentIdentity,
      displayName: `${parentIdentity.displayName}→${childName}`
    };
  }
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
   * Batch identify processes with shared system calls and intelligent parent-child relationships
   */
  static async identifyBatch(processes: ProcessInfo[]): Promise<Map<number, IdentifiedProcess>> {
    // Build process tree to understand relationships
    const processTree = new ProcessTree(processes);

    // Pre-fetch all CWDs in a single batch
    const pids = processes.map(p => p.pid);
    const cwds = await this.batchGetCwd(pids);

    // Pre-fetch Docker info if any processes have ports
    const portsToCheck = processes.filter(p => p.port).map(p => p.port!);
    let dockerPorts: Map<number, { name: string; image: string }> = new Map();
    if (portsToCheck.length > 0) {
      dockerPorts = await this.batchGetDockerPorts(portsToCheck);
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

    // 2. Get working directory for context and extract project name intelligently
    const cwd = info.cwd || await this.getProcessCwd(pid);
    const projectName = this.extractProjectName(cwd, command);

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
   * Extract project name intelligently from cwd and command
   */
  private static extractProjectName(cwd: string | null, command: string): string | null {
    // Common container directories that should not be treated as project names
    const containerDirs = ['repositories', 'projects', 'code', 'workspace', 'dev', 'src', 'work', 'git'];

    if (cwd) {
      const basename = path.basename(cwd);

      // Check if current directory is a container directory
      if (containerDirs.includes(basename.toLowerCase())) {
        // Try to extract project name from command path
        // Look for patterns like /repositories/PROJECT_NAME/...
        const pathPattern = new RegExp(`/${basename}/([^/]+)/`);
        const match = command.match(pathPattern);
        if (match && match[1]) {
          // Avoid common subdirectories
          const commonSubdirs = ['node_modules', 'dist', 'src', 'bin', 'lib', 'build', '.git'];
          if (!commonSubdirs.includes(match[1])) {
            return match[1];
          }
        }

        // Try to extract from deeper paths like /repositories/aitools/dist/cli.js
        const deepMatch = command.match(/\/(repositories|projects|code|workspace|dev|src|work|git)\/([^/]+)\/(dist|src|bin|lib|build|out)\//);
        if (deepMatch && deepMatch[2]) {
          return deepMatch[2];
        }

        // If we can't extract from command, return null to avoid showing container name
        return null;
      }

      // If not a container directory, use it as project name
      return basename;
    }

    // If no cwd, try to extract from command path
    const commandMatch = command.match(/\/(repositories|projects|code|workspace|dev)\/([^/]+)\//);
    if (commandMatch && commandMatch[2]) {
      return commandMatch[2];
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
      // aitools specific pattern (highest priority)
      {
        pattern: /(?:bun|node|npm|yarn|pnpm|npx)\s+(?:run\s+)?(?:.*\/)?(?:dist\/)?cli\.js\s+(\w+)/i,
        handler: (match) => {
          const subcommand = match[1];
          // Map short aliases to full names
          const commandMap: { [key: string]: string } = {
            'm': 'monitor',
            'ps': 'process',
            'k': 'kill',
            'c': 'cost',
            'h': 'hooks',
            't': 'tree'
          };
          const displayCmd = commandMap[subcommand] || subcommand;
          return {
            displayName: `aitools:${displayCmd}`,
            category: 'tool',
            project: 'aitools'
          };
        }
      },
      // Generic CLI tools pattern
      {
        pattern: /^(?:bun|node)\s+(?:.*\/)([^\/]+)\/(dist|bin|lib|build)\/([^\/\s]+?)(?:\.(?:js|ts|mjs))?\s*(\w*)/i,
        handler: (match, ctx) => {
          const projectName = match[1];
          const scriptName = match[3];
          const subcommand = match[4];

          // If script name is generic (cli, index, main), use project name
          const genericScripts = ['cli', 'index', 'main', 'app', 'server'];
          const toolName = genericScripts.includes(scriptName) ? projectName : scriptName;

          return {
            displayName: subcommand ? `${toolName}:${subcommand}` : toolName,
            category: 'tool',
            project: projectName
          };
        }
      },
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
      // Shell processes - don't show project context for interactive shells
      {
        pattern: /^(-?(?:.*\/)?(sh|bash|zsh|fish|csh|tcsh))\s*(-.*)?$/i,
        handler: (match) => {
          const shell = match[2]; // Extract shell name
          return {
            displayName: shell,
            category: 'system'
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