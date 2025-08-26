// Utility function to sanitize text for safe terminal display
export function sanitizeForTerminal(str: string): string {
  return str
    // Remove ALL potentially problematic Unicode characters
    // Keep only: Basic Latin, Latin-1 Supplement, and CJK
    .replace(/[^\u0020-\u007E\u00A0-\u00FF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFF9F\u4E00-\u9FAF\u3400-\u4DBF]/g, '')
    // Remove control characters except newlines and tabs
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, (match) => {
      if (match === '\n' || match === '\t') return match;
      return '';
    })
    // Remove variation selectors and joiners
    .replace(/[\uFE00-\uFE0F]/g, '')
    .replace(/[\u200C-\u200D]/g, '')
    // Remove combining marks that might affect width
    .replace(/[\u0300-\u036F]/g, '');
}

// Extract smart process name from command
export function extractSmartProcessName(command: string): string {
  // Common patterns for different types of processes
  const patterns = [
    // Node.js scripts
    { regex: /node\s+([^\/\s]+\.js)/i, group: 1 },
    { regex: /node\s+.*\/([^\/]+\.js)/i, group: 1 },
    
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
    
    // Common tools
    { regex: /(webpack|vite|rollup|parcel|esbuild)/i, group: 1 },
    { regex: /(jest|mocha|vitest|cypress)/i, group: 1 },
    { regex: /(eslint|prettier|tsc|tsx)/i, group: 1 },
    
    // Extract binary name from path
    { regex: /^.*\/([^\/]+)(?:\s|$)/i, group: 1 },
    
    // Fallback to first word
    { regex: /^([^\s\/]+)/i, group: 1 }
  ];

  for (const pattern of patterns) {
    const match = command.match(pattern.regex);
    if (match && match[pattern.group]) {
      const name = match[pattern.group];
      return pattern.prefix ? `${pattern.prefix}${name}` : name;
    }
  }

  // Ultimate fallback: truncate command
  return command.split(' ')[0].substring(0, 30);
}