/**
 * Smart process identifier using multiple strategies
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
  port?: number;  // Add port for Docker container matching
}

export interface IdentifiedProcess {
  displayName: string;
  category: 'web' | 'database' | 'tool' | 'service' | 'app' | 'script' | 'system' | 'container';
  project?: string;
  port?: number;
  containerInfo?: { name: string; image: string };
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
 * Get Docker container by port mapping
 */
async function getDockerContainerByPort(port: number): Promise<{ name: string; image: string } | null> {
  try {
    // First get all containers, then filter in JavaScript to avoid grep exit code issues
    const { stdout } = await execAsync(`docker ps --format "{{.Names}}|{{.Ports}}"`, { 
      maxBuffer: 1024 * 1024,
      encoding: 'utf8'
    }).catch(() => ({ stdout: '' }));
    
    if (!stdout || stdout.trim() === '') {
      return null;
    }
    
    // Find the container with this port
    const lines = stdout.trim().split('\n');
    let matchingLine: string | null = null;
    
    for (const line of lines) {
      if (line.includes(`:${port}->`)) {
        matchingLine = line;
        break;
      }
    }
    
    if (!matchingLine) {
      return null;
    }
    
    const [name, ports] = matchingLine.split('|');
    if (!name) return null;
    
    // Keep the full container name
    let displayName = name;
    
    // Get the image name for additional context
    const { stdout: imageInfo } = await execAsync(`docker ps --format "{{.Names}}|{{.Image}}" 2>/dev/null | grep "^${name}|"`, { maxBuffer: 1024 * 1024 }).catch(() => ({ stdout: '' }));
    const image = imageInfo ? imageInfo.split('|')[1]?.trim() : 'unknown';
    
    return { name: displayName, image };
  } catch {
    // Docker not installed or not accessible
  }
  return null;
}

/**
 * Get Docker container info for a process
 */
async function getDockerContainerInfo(pid: number, port?: number): Promise<{ name: string; id: string } | null> {
  try {
    // If we have a port, try to match via Docker port mapping first
    if (port) {
      const containerByPort = await getDockerContainerByPort(port);
      if (containerByPort) {
        return { 
          name: containerByPort.name, 
          id: containerByPort.image 
        };
      }
    }
    
    // Method 1: Check if process is in a container via cgroup (Linux)
    const { stdout: cgroupOutput } = await execAsync(`cat /proc/${pid}/cgroup 2>/dev/null | grep -i docker`);
    if (cgroupOutput) {
      // Extract container ID from cgroup
      const containerIdMatch = cgroupOutput.match(/docker[/-]([a-f0-9]{12,64})/);
      if (containerIdMatch) {
        const containerId = containerIdMatch[1].substring(0, 12); // Use short ID
        
        // Get container name from docker
        try {
          const { stdout: containerInfo } = await execAsync(`docker ps --format "{{.ID}}:{{.Names}}:{{.Image}}" | grep "^${containerId}"`);
          if (containerInfo) {
            const [id, name, image] = containerInfo.trim().split(':');
            return { name: name || image, id };
          }
        } catch {
          // Docker might not be accessible
          return { name: `container:${containerId}`, id: containerId };
        }
      }
    }
    
    // Method 2: Check Docker Desktop processes (macOS specific)
    // On macOS, Docker Desktop runs in a VM, so we check for docker-proxy processes
    const { stdout: processInfo } = await execAsync(`ps -p ${pid} -o command= 2>/dev/null`);
    if (processInfo && (processInfo.includes('docker-proxy') || processInfo.includes('com.docker'))) {
      // This is likely a Docker proxy process
      // Try to match by checking all containers
      try {
        const { stdout: containers } = await execAsync(`docker ps --format "{{.Names}}:{{.Image}}"`);
        const lines = containers.split('\n').filter(l => l);
        if (lines.length === 1) {
          // If only one container is running, it's likely this one
          const [name, image] = lines[0].split(':');
          return { name, id: image };
        }
        // For multiple containers, we'd need port info to match
        return { name: 'docker-container', id: 'docker' };
      } catch {
        // Docker not accessible
      }
    }
  } catch {
    // Not a container process or can't determine
  }
  
  return null;
}

/**
 * Smart process identification using context
 */
export async function identifyProcess(info: ProcessInfo): Promise<IdentifiedProcess> {
  const { pid, command, port } = info;
  
  // 1. ALWAYS check Docker by port first if port is provided
  if (port) {
    const dockerByPort = await getDockerContainerByPort(port);
    if (dockerByPort) {
      return {
        displayName: `docker:${dockerByPort.name}`,
        category: 'container',
        project: dockerByPort.name,
        port,
        containerInfo: { name: dockerByPort.name, image: dockerByPort.image }
      };
    }
  }
  
  // 2. Check if it's a Docker container process by PID
  const dockerInfo = await getDockerContainerInfo(pid, port);
  if (dockerInfo) {
    return {
      displayName: `docker:${dockerInfo.name}`,
      category: 'container',
      project: dockerInfo.name,
      port,
      containerInfo: { name: dockerInfo.name, image: dockerInfo.id }
    };
  }
  
  // 2. Get the working directory for context
  const cwd = info.cwd || await getProcessCwd(pid);
  const projectName = cwd ? path.basename(cwd) : null;
  
  // 2. Special case: Docker Desktop process listening on ports
  // com.docker.backend or com.docke on macOS
  if (command.match(/com\.docker/i) && port) {
    const dockerByPort = await getDockerContainerByPort(port);
    if (dockerByPort) {
      return {
        displayName: `docker:${dockerByPort.name}`,
        category: 'container',
        project: dockerByPort.name,
        port,
        containerInfo: { name: dockerByPort.name, image: dockerByPort.image }
      };
    }
    // If no container found but it's Docker Desktop, still indicate it
    return {
      displayName: `docker:${port}`,
      category: 'container',
      port
    };
  }
  
  // 3. Identify by command patterns with priority
  const identifiers: Array<{
    pattern: RegExp;
    handler: (match: RegExpMatchArray, ctx: { cwd?: string, projectName?: string, port?: number }) => IdentifiedProcess;
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
    },
    
    // Docker Desktop process (com.docker.backend or com.docke)
    {
      pattern: /^com\.dock/i,
      handler: (match, ctx) => ({
        displayName: 'Docker Desktop',
        category: 'service'
      })
    }
  ];
  
  // 4. Try each identifier
  for (const { pattern, handler } of identifiers) {
    const match = command.match(pattern);
    if (match) {
      return handler(match, { 
        cwd: cwd || undefined, 
        projectName: projectName || undefined,
        port: port || undefined
      });
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