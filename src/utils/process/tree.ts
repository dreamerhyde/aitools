/**
 * Process tree for managing parent-child relationships
 */

import type { ProcessInfo } from './types.js';

export class ProcessTree {
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