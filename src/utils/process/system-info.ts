/**
 * System information utilities for process identification
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class SystemInfo {
  // CWD Cache with batch support
  private static cwdCache = new Map<number, string>();
  private static cwdCacheTime = 0;
  private static CWD_CACHE_TTL = 30000; // 30 seconds

  // Docker cache
  private static dockerCache = new Map<number, { name: string; image: string }>();
  private static dockerCacheTime = 0;
  private static DOCKER_CACHE_TTL = 30000; // 30 seconds

  /**
   * Batch get working directories with a single lsof call
   */
  static async batchGetCwd(pids: number[]): Promise<Map<number, string>> {
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
   * Get process working directory
   */
  static async getProcessCwd(pid: number): Promise<string | null> {
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
   * Batch get Docker container info for ports
   */
  static async batchGetDockerPorts(ports: number[]): Promise<Map<number, { name: string; image: string }>> {
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
   * Get Docker container by port
   */
  static async getDockerContainerByPort(port: number): Promise<{ name: string; image: string } | null> {
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
   * Clear all caches
   */
  static clearCache(): void {
    this.cwdCache.clear();
    this.dockerCache.clear();
    this.cwdCacheTime = 0;
    this.dockerCacheTime = 0;
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { cwdSize: number; dockerSize: number } {
    return {
      cwdSize: this.cwdCache.size,
      dockerSize: this.dockerCache.size
    };
  }
}