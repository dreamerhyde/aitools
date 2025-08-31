/* eslint-disable no-useless-escape */
import { ApplicationCache } from '../../../utils/app-cache.js';

// Cache for process name extraction
const processNameCache = new Map<string, string>();
const CACHE_MAX_SIZE = 1000;
let cacheHits = 0;
let cacheMisses = 0;

// Application cache instance (singleton)
const appCache = ApplicationCache.getInstance();

// Export cache stats for debugging
export function getCacheStats() {
  const appStats = appCache.getStats();
  return {
    size: processNameCache.size,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: cacheHits > 0 ? (cacheHits / (cacheHits + cacheMisses) * 100).toFixed(2) + '%' : '0%',
    appCache: {
      entries: appStats.size,
      age: `${appStats.age}s`,
      ttl: `${appStats.ttl}s`,
      remaining: `${appStats.remainingTime}s`
    }
  };
}

// Clear cache if needed
export function clearProcessNameCache() {
  processNameCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}

// Utility function to sanitize text for safe terminal display
export function sanitizeForTerminal(str: string): string {
  return str
    // Remove ALL potentially problematic Unicode characters
    // Keep only: Basic Latin (including newline/tab), Latin-1 Supplement, and CJK
    // Added \u0009 (tab) and \u000A (newline) to the allowed characters
    .replace(/[^\u0009\u000A\u0020-\u007E\u00A0-\u00FF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFF9F\u4E00-\u9FAF\u3400-\u4DBF]/g, '')
    // Remove other control characters (but newlines and tabs are already preserved above)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '')
    // Remove variation selectors and joiners
    .replace(/[\uFE00-\uFE0F]/g, '')
    .replace(/[\u200C-\u200D]/g, '')
    // Remove combining marks that might affect width
    .replace(/[\u0300-\u036F]/g, '');
}

// Extract smart process name from command
export function extractSmartProcessName(command: string): string {
  // Check cache first
  const cached = processNameCache.get(command);
  if (cached !== undefined) {
    cacheHits++;
    return cached;
  }
  cacheMisses++;
  
  // Check application cache for known apps
  const appName = appCache.get(command);
  if (appName) {
    // Found in app cache, store in process cache and return
    processNameCache.set(command, appName);
    return appName;
  }
  
  // Define the pattern type
  interface Pattern {
    regex: RegExp;
    group: number;
    prefix?: string;
    transform?: (match: string, fullMatch: RegExpMatchArray) => string | null;
  }
  
  // Special handling for known generic executable names
  const genericExecutables = [
    'stable', 'main', 'electron', 'node', 'runtime', 'launcher',
    'helper', 'worker', 'daemon', 'service', 'agent'
  ];
  
  // Common patterns for different types of processes
  const patterns: Pattern[] = [
    // Special handling for aitools itself
    {
      regex: /(?:bun|node|npm|yarn|pnpm|npx)\s+(?:run\s+)?([^\/]*\/)?(?:dist\/)?cli\.js\s+(\w+)/,
      group: 0,
      transform: (match: string, fullMatch: RegExpMatchArray) => {
        const subcommand = fullMatch[2];
        const commandMap: { [key: string]: string } = {
          'm': 'monitor',
          'ps': 'process list',
          'k': 'kill',
          'c': 'cost',
          'h': 'hooks',
          't': 'tree'
        };
        return `aitools ${commandMap[subcommand] || subcommand}`;
      }
    },
    
    // Apple System Drivers (DriverKit)
    {
      regex: /\/System\/Library\/DriverExtensions\/([^\/]+)\.dext\/([^\s]+)/,
      group: 0,
      transform: (match: string, fullMatch: RegExpMatchArray) => {
        const driverName = fullMatch[1];
        // const execName = fullMatch[2]; // Currently unused
        
        // Map known Apple drivers to friendly names
        const driverMap: { [key: string]: string } = {
          'com.apple.DriverKit-AppleBCMWLAN': 'Apple WiFi/Bluetooth Driver',
          'com.apple.DriverKit-IOUserDockChannelSerial': 'Apple Dock Serial Driver',
          'com.apple.AppleUserHIDDrivers': 'Apple HID Drivers',
          'IOUserBluetoothSerialDriver': 'Bluetooth Serial Driver',
          'com.apple.DriverKit-AppleUSBDeviceNCM': 'Apple USB Network Driver',
          'com.apple.DriverKit-AppleConvergedIPCOLYBTControl': 'Apple Bluetooth Controller'
        };
        
        return driverMap[driverName] || `Driver: ${driverName.replace('com.apple.DriverKit-', '')}`;
      }
    },
    
    // Apple Virtualization Framework
    {
      regex: /Virtualization\.framework.*com\.apple\.Virtualization\.VirtualMachine/,
      group: 0,
      transform: () => {
        // Simple static name - we know Docker is the most common user
        // If needed, we can enhance this later with a smarter detection
        return 'Virtual Machine (Docker/UTM)';
      }
    },
    
    // macOS Application Bundle - Main app from /Applications
    // e.g., /Applications/Warp.app/Contents/MacOS/stable -> Warp
    { 
      regex: /\/Applications\/([^\/]+)\.app\/Contents\/MacOS\/([^\s]+)/i, 
      group: 1,
      transform: (match: string, fullMatch: RegExpMatchArray) => {
        const appName = match;
        const execName = fullMatch[2];
        
        // For generic executables, always use app name
        if (genericExecutables.includes(execName.toLowerCase())) {
          return appName;
        }
        
        // If executable name matches app name (case-insensitive), just use app name
        if (execName.toLowerCase() === appName.toLowerCase() || 
            execName.toLowerCase().replace(/[\s-]/g, '') === appName.toLowerCase().replace(/[\s-]/g, '')) {
          return appName;
        }
        
        // For other cases, show app name only if executable is very different
        return appName;
      }
    },
    
    // macOS Helper Processes - with type (GPU, Renderer, Plugin, etc.)
    // e.g., .../Browser Helper (GPU).app/... -> Arc Helper (GPU)
    { 
      regex: /\/Applications\/([^\/]+)\.app\/.*\/([^\/]+)\s*\(([^)]+)\)\.app/i,
      group: 0,
      transform: (match: string, fullMatch: RegExpMatchArray) => {
        const appName = fullMatch[1];
        const helperType = fullMatch[3];
        // Show app name with helper type for clarity
        return `${appName} (${helperType})`;
      }
    },
    
    // macOS Helper Processes - without type
    // e.g., .../Aqua Voice Helper.app/... -> Aqua Voice Helper
    { 
      regex: /\/Applications\/([^\/]+)\.app\/.*\/([^\/]+Helper[^\/]*?)\.app/i,
      group: 0,
      transform: (match: string, fullMatch: RegExpMatchArray) => {
        const appName = fullMatch[1];
        // const helperName = fullMatch[2]; // Currently unused - just using app name
        // Simplify to just app name + Helper
        return `${appName} Helper`;
      }
    },
    
    // Electron/Chromium crash handlers
    { 
      regex: /chrome_crashpad_handler.*--annotation=_productName=([^\s]+)/i,
      group: 1,
      prefix: 'Crashpad: '
    },
    
    // System Applications and Services
    { 
      regex: /\/System\/Applications\/([^\/]+)\.app\/Contents\/MacOS\/([^\s]+)/i,
      group: 1,
      transform: (match: string, fullMatch: RegExpMatchArray) => {
        const appName = match;
        const execName = fullMatch[2];
        // System apps usually have matching names
        if (execName.toLowerCase() === appName.toLowerCase()) {
          return `System: ${appName}`;
        }
        return `System: ${appName}`;
      }
    },
    
    // Library and Framework services
    { 
      regex: /\/Library\/.*\/([^\/]+)\.framework\/.*\/([^\s\/]+)$/i,
      group: 2,
      prefix: 'Framework: '
    },
    
    // XPC Services
    { 
      regex: /\.xpc\/Contents\/MacOS\/([^\s]+)/i,
      group: 1,
      prefix: 'XPC: '
    },
    
    // System Extensions
    { 
      regex: /\.systemextension\/Contents\/MacOS\/([^\s]+)/i,
      group: 1,
      prefix: 'SysExt: '
    },
    
    // App Extensions
    { 
      regex: /\.appex\/Contents\/MacOS\/([^\s]+)/i,
      group: 1,
      prefix: 'Extension: '
    },
    
    // Any macOS app from any location (fallback for non-standard paths)
    {
      regex: /\/([^\/]+)\.app\/Contents\/MacOS\/([^\s]+)/i,
      group: 1,
      transform: (match: string, fullMatch: RegExpMatchArray) => {
        const appName = match;
        const execName = fullMatch[2];
        
        // Skip if it's a helper app (already handled above)
        if (appName.includes('Helper')) return null;
        
        // For generic executables, show both app and exec name for clarity
        if (genericExecutables.includes(execName.toLowerCase())) {
          return `${appName}: ${execName}`;
        }
        
        // If names match, just use app name
        if (execName.toLowerCase() === appName.toLowerCase() ||
            execName.toLowerCase().replace(/[\s-]/g, '') === appName.toLowerCase().replace(/[\s-]/g, '')) {
          return appName;
        }
        
        return appName;
      }
    },
    
    // Claude hooks - special handling
    {
      regex: /\.claude\/hooks\/([^\/\s]+)/i,
      group: 1,
      prefix: 'Claude Hook: '
    },
    
    // Node.js with Vercel/vc CLI
    {
      regex: /node\s+.*\/(vc|vercel)\s+(\w+)/i,
      group: 1,
      transform: (match: string, fullMatch: RegExpMatchArray) => {
        // const tool = fullMatch[1]; // vc or vercel - currently not used
        const command = fullMatch[2]; // dev, build, etc.
        // Try to get the current working directory from the process
        // For now, just show the command clearly
        return `vercel:${command}`;
      }
    },
    
    // Node.js with npm/yarn/pnpm/bun scripts
    {
      regex: /node\s+.*\/(npm|yarn|pnpm|bun)\s+(run\s+)?(\w+)/i,
      group: 1,
      transform: (match: string, fullMatch: RegExpMatchArray) => {
        const tool = fullMatch[1];
        const script = fullMatch[3];
        return `${tool}:${script}`;
      }
    },
    
    // Node.js scripts with project detection
    {
      regex: /node\s+(.*\/([^\/]+)\/[^\/]+\.js)/i,
      group: 1,
      transform: (match: string, fullMatch: RegExpMatchArray) => {
        const projectName = fullMatch[2]; // The directory name
        const scriptName = match.split('/').pop(); // The script file
        return `node:${projectName}/${scriptName}`;
      }
    },
    { regex: /node\s+([^\/\s]+\.js)/i, group: 1, prefix: 'node:' },
    { regex: /node\s+.*\/([^\/]+\.js)/i, group: 1, prefix: 'node:' },
    
    // Python scripts
    { regex: /python[0-9]?\s+([^\/\s]+\.py)/i, group: 1 },
    { regex: /python[0-9]?\s+.*\/([^\/]+\.py)/i, group: 1 },
    
    // Shell scripts
    { regex: /(bash|sh|zsh)\s+([^\/\s]+\.sh)/i, group: 2 },
    { regex: /(bash|sh|zsh)\s+.*\/([^\/]+\.sh)/i, group: 2 },
    
    // Git hooks
    { regex: /\.git\/hooks\/([^\/\s]+)/i, group: 1, prefix: 'hook:' },
    
    // npm/yarn/pnpm scripts
    { regex: /(npm|yarn|pnpm)\s+run\s+(\S+)/i, group: 2, prefix: 'npm:' },
    { regex: /(npm|yarn|pnpm)\s+(\S+)/i, group: 2, prefix: 'npm:' },
    
    // Docker containers
    { regex: /docker\s+run\s+.*?([^\/\s:]+)(?::|$)/i, group: 1, prefix: 'docker:' },
    { regex: /docker-compose\s+(\S+)/i, group: 1, prefix: 'compose:' },
    
    // Common development tools
    { regex: /(webpack|vite|rollup|parcel|esbuild|turbo|nx)/i, group: 1 },
    
    // Generic runtime with working directory detection
    {
      regex: /^(node|bun|deno|python[0-9]?|ruby|java|go)\s+(?!.*\.(?:js|ts|py|rb|java|go)).*?\/([^\/]+)(?:\/|$)/i,
      group: 1,
      transform: (match: string, fullMatch: RegExpMatchArray) => {
        const runtime = fullMatch[1];
        const projectDir = fullMatch[2];
        return `${runtime}:${projectDir}`;
      }
    },
    { regex: /(jest|mocha|vitest|cypress|playwright)/i, group: 1 },
    { regex: /(eslint|prettier|tsc|tsx|swc|babel)/i, group: 1 },
    { regex: /(cargo|rustc|go|gcc|g\+\+|clang|make|cmake)/i, group: 1 },
    
    // Common system daemons and services
    {
      regex: /\/(sbin|bin|usr\/bin|usr\/sbin|usr\/local\/bin)\/([^\s\/]+)/i,
      group: 2,
      transform: (match: string) => {
        // Clean up common daemon suffixes
        return match.replace(/d$/, ' Daemon').replace(/_/, ' ');
      }
    },
    
    // Homebrew installed programs
    {
      regex: /\/opt\/homebrew\/.*\/([^\s\/]+)$/i,
      group: 1,
      prefix: 'brew: '
    },
    
    // Extract binary name from path (second to last resort)
    { 
      regex: /^.*\/([^\/]+)(?:\s|$)/i, 
      group: 1,
      transform: (match: string) => {
        // One more check for generic names
        if (genericExecutables.includes(match.toLowerCase())) {
          // Try to extract more context from the path
          const parentMatch = command.match(/\/([^\/]+)\/[^\/]+\/[^\/]+$/);
          if (parentMatch && parentMatch[1]) {
            return `${parentMatch[1]} (${match})`;
          }
        }
        return match;
      }
    },
    
    // Fallback to first word
    { regex: /^([^\s\/]+)/i, group: 1 }
  ];

  let result: string | undefined;
  
  for (const pattern of patterns) {
    const match = command.match(pattern.regex);
    if (match) {
      // Handle transform function if present
      if ('transform' in pattern && pattern.transform) {
        const transformed = pattern.transform(match[pattern.group], match);
        if (transformed !== null) {
          result = transformed;
          break;
        }
      }
      // Standard extraction
      if (match[pattern.group]) {
        const name = match[pattern.group];
        result = pattern.prefix ? `${pattern.prefix}${name}` : name;
        break;
      }
    }
  }

  // Ultimate fallback: truncate command
  if (!result) {
    result = command.split(' ')[0].substring(0, 30);
  }
  
  // Clean up escaped characters (like \x20 for space)
  result = result.replace(/\\x([0-9a-fA-F]{2})/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  
  // Also clean up any trailing spaces
  result = result.trim();
  
  // Store in cache with LRU eviction
  if (processNameCache.size >= CACHE_MAX_SIZE) {
    // Remove oldest entry (first in map)
    const firstKey = processNameCache.keys().next().value;
    if (firstKey !== undefined) {
      processNameCache.delete(firstKey);
    }
  }
  processNameCache.set(command, result);
  
  return result;
}