// path: src/commands/monitor/utils/text-formatter.ts

import chalk from 'chalk';

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number, addEllipsis: boolean = true): string {
  if (!text || text.length <= maxLength) {
    return text;
  }
  
  const truncated = text.substring(0, maxLength);
  return addEllipsis ? `${truncated}...` : truncated;
}

/**
 * Wrap text to fit within a specific width, breaking at word boundaries
 */
export function wrapText(text: string, maxWidth: number): string[] {
  if (!text || maxWidth <= 0) {
    return [];
  }
  
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    // If single word is longer than max width, truncate it
    if (word.length > maxWidth) {
      if (currentLine) {
        lines.push(currentLine.trim());
        currentLine = '';
      }
      lines.push(truncateText(word, maxWidth));
      continue;
    }
    
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    
    if (testLine.length <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine.trim());
      }
      currentLine = word;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine.trim());
  }
  
  return lines;
}

/**
 * Clean and normalize text for terminal display
 */
export function cleanText(text: string): string {
  if (!text) return '';
  
  return text
    .replace(/\r\n/g, '\n')  // Normalize line endings
    .replace(/\n+/g, ' ')     // Replace multiple newlines with space
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .replace(/[^\x20-\x7E\n]/g, '') // Remove non-printable characters
    .trim();
}

/**
 * Format a Q/A message for display in a box
 */
export interface FormattedMessage {
  role: 'Q' | 'A';
  content: string[];  // Array of wrapped lines
  color: string;
}

export function formatMessage(
  role: 'user' | 'assistant',
  content: string,
  maxWidth: number
): FormattedMessage {
  const cleanedContent = cleanText(content);
  const truncatedContent = truncateText(cleanedContent, 300, true);
  const wrappedLines = wrapText(truncatedContent, maxWidth - 4); // Account for "Q: " or "A: " prefix
  
  return {
    role: role === 'user' ? 'Q' : 'A',
    content: wrappedLines,
    color: role === 'user' ? 'cyan' : 'white'
  };
}

/**
 * Format elapsed time in a human-readable format
 */
export function formatElapsedTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  
  if (diffMinutes === 0) {
    return 'now';
  } else if (diffMinutes === 1) {
    return '1m ago';
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else {
    const hours = Math.floor(diffMinutes / 60);
    if (hours === 1) {
      return '1h ago';
    }
    return `${hours}h ago`;
  }
}

/**
 * Format message count display
 */
export function formatMessageCount(count: number): string {
  if (count === 0) {
    return 'No messages';
  } else if (count === 1) {
    return '1 message';
  } else {
    return `${count} messages`;
  }
}

/**
 * Create a separator line that fits the box width
 */
export function createSeparator(width: number, char: string = '─'): string {
  return char.repeat(Math.max(0, width));
}

/**
 * Format status indicator based on activity
 */
export function formatStatusIndicator(lastActivity: Date): string {
  const minutesAgo = Math.floor((Date.now() - lastActivity.getTime()) / 60000);
  
  if (minutesAgo === 0) {
    return chalk.green('● Active');
  } else if (minutesAgo < 5) {
    return chalk.yellow('● Recent');
  } else {
    return chalk.gray('● Idle');
  }
}