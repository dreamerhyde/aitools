/**
 * Pattern matching logic for process identification
 */

import path from 'path';
import type { IdentifiedProcess, ProcessContext, PatternIdentifier } from './types.js';

export class ProcessPatterns {
  /**
   * Extract project name intelligently from cwd and command
   */
  static extractProjectName(cwd: string | null, command: string): string | null {
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
   * Get all pattern identifiers for process matching
   */
  static getPatterns(): PatternIdentifier[] {
    return [
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
        pattern: /^(?:bun|node)\s+(?:.*\/)?([^/]+)\/(dist|bin|lib|build)\/([^/\s]+?)(?:\.(?:js|ts|mjs))?\s*(\w*)/i,
        handler: (match) => {
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
          displayName: ctx.projectName ? `${match[1]} [${ctx.projectName}]` : match[1],
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
                displayName: `${runtime} [${ctx.projectName}]`,
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
      // macOS Applications - Smart multi-layer parsing
      {
        pattern: /\/Applications\//i,
        handler: (match) => {
          const fullCommand = match.input || '';

          // Step 1: Separate executable path from arguments
          const argsIndex = fullCommand.search(/\s+--?\w/);
          const execPath = argsIndex > -1 ? fullCommand.substring(0, argsIndex).trim() : fullCommand.trim();

          // Step 2: Find all .app occurrences
          const appMatches = [...execPath.matchAll(/\/([^/]+)\.app/gi)];
          if (appMatches.length === 0) {
            // Not a macOS app, return generic system process
            return { displayName: path.basename(fullCommand.split(' ')[0]), category: 'system' as const };
          }

          // Step 3: Extract app names and executable
          const primaryApp = appMatches[0][1]; // First .app (main application)
          const lastApp = appMatches[appMatches.length - 1][1]; // Last .app (might be Helper)
          const execName = path.basename(execPath);

          // Step 4: Apply intelligent naming rules

          // Rule 1: Version markers
          const versionMarkers = ['stable', 'beta', 'canary', 'alpha', 'dev', 'nightly'];
          if (versionMarkers.includes(execName.toLowerCase())) {
            return { displayName: primaryApp, category: 'app' };
          }

          // Rule 2: Helper applications
          if (lastApp !== primaryApp && lastApp.includes('Helper')) {
            // Simplify helper names
            let helperType = execName;

            // Common helper patterns
            if (execName.includes('Browser Helper')) {
              // Extract type from parentheses if present
              const typeMatch = execName.match(/\(([^)]+)\)/);
              if (typeMatch) {
                helperType = `Helper:${typeMatch[1]}`;
              } else {
                helperType = 'Helper';
              }
            } else if (execName.includes('Code Helper')) {
              helperType = 'Code Helper';
            } else {
              helperType = lastApp.replace(/\s*\([^)]+\)/, '');
            }

            return { displayName: `${primaryApp}:${helperType}`, category: 'app' };
          }

          // Rule 3: Executable same as app name
          const cleanExecName = execName.replace(/[\s-]/g, '').toLowerCase();
          const cleanAppName = primaryApp.replace(/[\s-]/g, '').toLowerCase();
          if (cleanExecName === cleanAppName) {
            return { displayName: primaryApp, category: 'app' };
          }

          // Rule 4: Meaningful differences
          const meaningfulBinaries = ['com.docker.backend', 'com.docker.supervisor', 'com.docker.admin'];
          if (meaningfulBinaries.some(bin => execName.includes(bin))) {
            return { displayName: `${primaryApp}:${execName}`, category: 'app' };
          }

          // Rule 5: Default - show app:binary for clarity
          return { displayName: `${primaryApp}:${execName}`, category: 'app' };
        }
      }
    ];
  }

  /**
   * Apply pattern matching for process identification
   */
  static applyPatterns(
    command: string,
    context: ProcessContext
  ): IdentifiedProcess | null {
    const patterns = this.getPatterns();

    for (const { pattern, handler } of patterns) {
      const match = command.match(pattern);
      if (match) {
        return handler(match, context);
      }
    }

    return null;
  }
}