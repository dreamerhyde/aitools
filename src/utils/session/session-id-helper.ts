/**
 * Session ID generation helper
 * Ensures consistent session ID generation across the application
 */

/**
 * Generate a consistent session ID from a project path
 * @param projectPath The absolute path to the project
 * @returns A consistent session ID
 */
export function generateSessionId(projectPath: string): string {
  // Convert path to safe format: /Users/albertliu/repos/proj -> Users-albertliu-repos-proj
  const safePath = projectPath.replace(/\//g, '-').substring(1);
  return `claude-${safePath}`;
}

/**
 * Extract project path from a session ID
 * @param sessionId The session ID
 * @returns The original project path or null if invalid
 */
export function extractProjectPath(sessionId: string): string | null {
  if (!sessionId.startsWith('claude-')) {
    return null;
  }
  
  // Remove 'claude-' prefix and convert back to path
  const safePath = sessionId.substring(7);
  return '/' + safePath.replace(/-/g, '/');
}

/**
 * Get session file directory path from project path
 * @param projectPath The absolute path to the project
 * @returns The path to the session files directory
 */
export function getSessionDirectory(projectPath: string): string {
  const path = require('path');
  const os = require('os');
  const safePath = projectPath.replace(/\//g, '-').substring(1);
  return path.join(os.homedir(), '.claude', 'projects', `-${safePath}`);
}