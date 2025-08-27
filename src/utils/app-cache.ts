import fs from 'fs';
import path from 'path';
import os from 'os';

interface CacheEntry {
  appPath: string;
  appName: string;
  executable?: string;
}

interface CacheData {
  entries: Map<string, string>;  // executable path -> app name
  cliEntries?: Map<string, string>;  // CLI tool path -> tool name
  timestamp: number;
  version: string;
}

export class ApplicationCache {
  private static instance: ApplicationCache;
  private cache: Map<string, string> = new Map();
  private cliCache: Map<string, string> = new Map(); // CLI tools cache
  private cacheFile = path.join(os.homedir(), '.aitools', 'app-cache.json');
  private cacheTTL = 300000; // 300 seconds = 5 minutes
  private lastUpdate = 0;
  
  private constructor() {
    this.loadCache();
  }
  
  static getInstance(): ApplicationCache {
    if (!ApplicationCache.instance) {
      ApplicationCache.instance = new ApplicationCache();
    }
    return ApplicationCache.instance;
  }
  
  /**
   * Get app name from cache or scan if needed
   */
  get(executablePath: string): string | undefined {
    // Check if cache needs refresh
    if (this.needsRefresh()) {
      this.scanApplications();
      this.scanCLITools();
    }
    
    // Try CLI cache first (more specific)
    if (this.cliCache.has(executablePath)) {
      return this.cliCache.get(executablePath);
    }
    
    // Try exact match in app cache
    if (this.cache.has(executablePath)) {
      return this.cache.get(executablePath);
    }
    
    // Try to match partial path (for helpers and CLI tools)
    for (const [path, name] of this.cliCache.entries()) {
      if (executablePath.includes(path)) {
        return name;
      }
    }
    
    // Try to match partial path (for helpers)
    for (const [path, name] of this.cache.entries()) {
      if (executablePath.includes(path)) {
        return name;
      }
    }
    
    return undefined;
  }
  
  /**
   * Check if cache needs refresh
   */
  private needsRefresh(): boolean {
    return Date.now() - this.lastUpdate > this.cacheTTL;
  }
  
  /**
   * Scan CLI tools in common directories
   */
  private scanCLITools(): void {
    // Remove console.log - it interferes with monitor TUI
    const cliDirs = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      path.join(os.homedir(), '.npm', 'bin'),
      path.join(os.homedir(), '.yarn', 'bin'),
      path.join(os.homedir(), '.bun', 'bin'),
      path.join(os.homedir(), '.cargo', 'bin'),
      path.join(os.homedir(), 'repositories')
    ];
    
    this.cliCache.clear();
    
    // Add our own aitools
    // Add our own aitools with various invocation patterns
    const aitoolsPaths = [
      path.join(os.homedir(), 'repositories', 'aitools', 'dist', 'cli.js'),
      path.join(os.homedir(), 'repositories', 'aitools', 'src', 'cli.ts'),
      '/usr/local/bin/aitools',
      '/opt/homebrew/bin/aitools'
    ];
    
    // Map for specific command patterns we might see in ps output
    for (const toolPath of aitoolsPaths) {
      // Basic tool name
      this.cliCache.set(toolPath, 'aitools');
      
      // With bun/node prefix
      this.cliCache.set(`bun ${toolPath}`, 'aitools');
      this.cliCache.set(`node ${toolPath}`, 'aitools');
      
      // With subcommands (these appear in ps output)
      const subcommands = ['m', 'monitor', 'ps', 'kill', 'cost', 'hooks', 'tree', 'lint'];
      for (const cmd of subcommands) {
        // Direct invocation
        this.cliCache.set(`${toolPath} ${cmd}`, `aitools ${cmd}`);
        // With runtime
        this.cliCache.set(`bun ${toolPath} ${cmd}`, `aitools ${cmd}`);
        this.cliCache.set(`node ${toolPath} ${cmd}`, `aitools ${cmd}`);
      }
    }
    
    // Scan common CLI directories
    for (const dir of cliDirs) {
      if (!fs.existsSync(dir)) continue;
      
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          
          // Map common CLI tools
          const knownTools: { [key: string]: string } = {
            'node': 'Node.js',
            'npm': 'npm',
            'yarn': 'Yarn',
            'pnpm': 'pnpm',
            'bun': 'Bun',
            'deno': 'Deno',
            'cargo': 'Cargo',
            'rustc': 'Rust Compiler',
            'python': 'Python',
            'python3': 'Python 3',
            'ruby': 'Ruby',
            'go': 'Go',
            'java': 'Java',
            'git': 'Git',
            'docker': 'Docker',
            'kubectl': 'Kubernetes',
            'terraform': 'Terraform',
            'aws': 'AWS CLI',
            'gcloud': 'Google Cloud SDK',
            'azure': 'Azure CLI'
          };
          
          if (knownTools[item]) {
            this.cliCache.set(fullPath, knownTools[item]);
          }
        }
      } catch (e) {
        // Skip if can't read
      }
    }
    
    // Removed console.log - it interferes with monitor TUI
  }
  
  /**
   * Scan /Applications folder and build cache
   */
  private scanApplications(): void {
    // Removed console.log - it interferes with monitor TUI
    const startTime = Date.now();
    
    try {
      const applicationsDir = '/Applications';
      const apps = fs.readdirSync(applicationsDir);
      
      this.cache.clear();
      
      for (const app of apps) {
        if (!app.endsWith('.app')) continue;
        
        const appPath = path.join(applicationsDir, app);
        const appName = app.replace('.app', '');
        
        // Check for main executable
        const macosDir = path.join(appPath, 'Contents', 'MacOS');
        if (fs.existsSync(macosDir)) {
          try {
            const executables = fs.readdirSync(macosDir);
            
            for (const exec of executables) {
              const execPath = path.join(macosDir, exec);
              
              // Store various path formats
              this.cache.set(execPath, appName);
              this.cache.set(`${appPath}/Contents/MacOS/${exec}`, appName);
              
              // Special handling for generic names
              if (['stable', 'main', 'electron', 'launcher', 'runtime'].includes(exec.toLowerCase())) {
                // Store with higher priority
                this.cache.set(`/Applications/${app}/Contents/MacOS/${exec}`, appName);
              }
            }
          } catch (e) {
            // Skip if can't read
          }
        }
        
        // Also scan for helper apps
        const frameworksDir = path.join(appPath, 'Contents', 'Frameworks');
        if (fs.existsSync(frameworksDir)) {
          this.scanHelperApps(frameworksDir, appName);
        }
      }
      
      // Also scan CLI tools when scanning applications
      this.scanCLITools();
      
      this.lastUpdate = Date.now();
      this.saveCache();
      
      const scanTime = Date.now() - startTime;
      // Removed console.log - it interferes with monitor TUI
      
    } catch (error) {
      // Silent fail - don't log in monitor mode
    }
  }
  
  /**
   * Scan for helper applications
   */
  private scanHelperApps(frameworksDir: string, parentAppName: string): void {
    try {
      const items = fs.readdirSync(frameworksDir, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = path.join(frameworksDir, item.name);
        
        if (item.isDirectory()) {
          // Recursively scan subdirectories
          if (item.name.includes('Helper') && item.name.endsWith('.app')) {
            // Found a helper app
            const helperType = item.name.match(/Helper\s*\(([^)]+)\)/)?.[1] || 'Helper';
            const displayName = `${parentAppName} (${helperType})`;
            
            const macosPath = path.join(itemPath, 'Contents', 'MacOS');
            if (fs.existsSync(macosPath)) {
              const execs = fs.readdirSync(macosPath);
              for (const exec of execs) {
                this.cache.set(path.join(macosPath, exec), displayName);
              }
            }
          } else if (item.name.includes('Helpers') || item.name.includes('Framework')) {
            // Continue scanning
            this.scanHelperApps(itemPath, parentAppName);
          }
        }
      }
    } catch (e) {
      // Skip errors
    }
  }
  
  /**
   * Load cache from file
   */
  private loadCache(): void {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const data = fs.readFileSync(this.cacheFile, 'utf-8');
        const parsed: CacheData = JSON.parse(data);
        
        // Check if cache is still valid
        if (Date.now() - parsed.timestamp < this.cacheTTL) {
          this.cache = new Map(Object.entries(parsed.entries));
          this.cliCache = new Map(Object.entries(parsed.cliEntries || {}));
          this.lastUpdate = parsed.timestamp;
          // Silent load - don't log in monitor mode
          return;
        }
      }
    } catch (e) {
      // Cache load failed, will rescan
    }
    
    // Scan on first load
    this.scanApplications();
    this.scanCLITools();
  }
  
  /**
   * Save cache to file
   */
  private saveCache(): void {
    try {
      const dir = path.dirname(this.cacheFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const data: CacheData = {
        entries: Object.fromEntries(this.cache) as any,
        cliEntries: Object.fromEntries(this.cliCache) as any,
        timestamp: this.lastUpdate,
        version: '1.1'
      };
      
      fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
    } catch (e) {
      // Silent fail - don't log in monitor mode
    }
  }
  
  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size + this.cliCache.size,
      appCacheSize: this.cache.size,
      cliCacheSize: this.cliCache.size,
      age: Math.round((Date.now() - this.lastUpdate) / 1000),
      ttl: Math.round(this.cacheTTL / 1000),
      remainingTime: Math.max(0, Math.round((this.cacheTTL - (Date.now() - this.lastUpdate)) / 1000))
    };
  }
  
  /**
   * Force refresh cache
   */
  refresh(): void {
    this.scanApplications();
  }
}