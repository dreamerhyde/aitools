/**
 * Smart process identifier using multiple strategies
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

interface ProcessInfo {
  pid: number;
  command: string;
  cwd?: string;
  name?: string;
}

interface IdentifiedProcess {
  displayName: string;
  category: 'web' | 'database' | 'tool' | 'service' | 'app' | 'script' | 'system';
  project?: string;
  port?: number;
}

// Cache for process working directories
const cwdCache = new Map<number, string>();
const CWD_CACHE_TTL = 30000; // 30 seconds
let cwdCacheTime = 0;

/**
 * Get working directory for a process
 */
async function getProcessCwd(pid: number): Promise<string | null> {
  try {
    // Check cache first
    if (Date.now() - cwdCacheTime < CWD_CACHE_TTL && cwdCache.has(pid)) {
      return cwdCache.get(pid) || null;
    }
    
    // Try lsof to get cwd (most reliable on macOS)
    const { stdout } = await execAsync(`lsof -p ${pid} -a -d cwd -F n 2>/dev/null | grep '^n' | head -1`);
    if (stdout) {
      const cwd = stdout.replace(/^n/, '').trim();
      cwdCache.set(pid, cwd);
      cwdCacheTime = Date.now();
      return cwd;
    }
  } catch {
    // Fallback: try pwdx (if available) or /proc (Linux)
    try {
      const { stdout } = await execAsync(`pwdx ${pid} 2>/dev/null`);
      if (stdout) {
        const cwd = stdout.split(':')[1]?.trim();
        if (cwd) {
          cwdCache.set(pid, cwd);
          return cwd;
        }
      }
    } catch {
      // Silent fail
    }
  }
  return null;
}

/**
 * Smart process identification using context
 */
export async function identifyProcess(info: ProcessInfo): Promise<IdentifiedProcess> {
  const { pid, command } = info;
  
  // 1. First, try to get the working directory for context
  const cwd = info.cwd || await getProcessCwd(pid);
  const projectName = cwd ? path.basename(cwd) : null;
  
  // 2. Identify by command patterns with priority
  const identifiers: Array<{
    pattern: RegExp;
    handler: (match: RegExpMatchArray, ctx: { cwd?: string, projectName?: string }) => IdentifiedProcess;
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
    
    // Programming languages with context
    {
      pattern: /^(node|python\d*|ruby|java|go|rust|php)\s+(.+)/i,
      handler: (match, ctx) => {
        const runtime = match[1];
        const script = match[2];
        
        // Extract script name intelligently
        let scriptName = script;
        if (script.includes('/')) {
          scriptName = path.basename(script);
          // If it's a common entry point, use project name
          if (['index.js', 'main.js', 'app.js', 'server.js', 'main.py', 'app.py'].includes(scriptName) && ctx.projectName) {
            return {
              displayName: `${runtime}:${ctx.projectName}`,
              category: 'script',
              project: ctx.projectName
            };
          }
        }
        
        // Remove extension for cleaner display
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
      pattern: /\/Applications\/([^\/]+)\.app\/.*\/([^\/\s]+)$/i,
      handler: (match) => {
        const appName = match[1];
        const binary = match[2];
        // Only show binary if it's different from app name
        if (binary.toLowerCase().replace(/[\s-]/g, '') === appName.toLowerCase().replace(/[\s-]/g, '')) {
          return { displayName: appName, category: 'app' };
        }
        return { displayName: `${appName}:${binary}`, category: 'app' };
      }
    },
    
    // Docker containers
    {
      pattern: /docker\s+run.*\s+([^\/\s:]+)(?::|$)/i,
      handler: (match) => ({
        displayName: `docker:${match[1]}`,
        category: 'service'
      })
    }
  ];
  
  // 3. Try each identifier
  for (const { pattern, handler } of identifiers) {
    const match = command.match(pattern);
    if (match) {
      return handler(match, { cwd: cwd || undefined, projectName: projectName || undefined });
    }
  }
  
  // 4. Fallback: use command basename
  const basename = path.basename(command.split(/\s+/)[0]);
  return {
    displayName: projectName ? `${basename} [${projectName}]` : basename,
    category: 'system',
    project: projectName || undefined
  };
}

/**
 * Batch identify processes (more efficient)
 */
export async function identifyProcessBatch(processes: ProcessInfo[]): Promise<Map<number, IdentifiedProcess>> {
  // Pre-fetch all CWDs in parallel for efficiency
  const cwdPromises = processes.map(p => getProcessCwd(p.pid));
  const cwds = await Promise.all(cwdPromises);
  
  // Add CWDs to process info
  const processesWithCwd = processes.map((p, i) => ({
    ...p,
    cwd: cwds[i] || undefined
  }));
  
  // Identify all processes
  const identifyPromises = processesWithCwd.map(p => identifyProcess(p));
  const identified = await Promise.all(identifyPromises);
  
  // Return as map for easy lookup
  const result = new Map<number, IdentifiedProcess>();
  processes.forEach((p, i) => {
    result.set(p.pid, identified[i]);
  });
  
  return result;
}

/**
 * Format display name with port if available
 */
export function formatProcessDisplay(identified: IdentifiedProcess, port?: number): string {
  if (port) {
    return `${identified.displayName}:${port}`;
  }
  return identified.displayName;
}