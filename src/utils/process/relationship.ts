/**
 * Intelligent process relationship detection
 */

import path from 'path';
import type { ProcessInfo, IdentifiedProcess } from './types.js';

export class ProcessRelationship {
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
    const childProjectMatch = childCmd.match(/\/([^/]+)\/(dist|src|bin|lib|build|out)\//);
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