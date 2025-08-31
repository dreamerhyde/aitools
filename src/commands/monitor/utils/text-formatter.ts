// path: src/commands/monitor/utils/text-formatter.ts

import chalk from 'chalk';

/**
 * Strip blessed tags for length calculation
 */
function stripBlessedTags(text: string): string {
  return text.replace(/\{[^}]+\}/g, '');
}

/**
 * Calculate actual display width for terminal (considering double-width characters)
 * Chinese, Japanese, Korean characters are double-width
 */
function getCharWidth(char: string): number {
  const code = char.charCodeAt(0);
  // Check for East Asian Wide characters
  // This is a simplified check - ideally use a library like 'string-width'
  if (
    (code >= 0x1100 && code <= 0x115F) || // Hangul Jamo
    (code >= 0x2E80 && code <= 0x9FFF) || // CJK
    (code >= 0xAC00 && code <= 0xD7AF) || // Hangul Syllables
    (code >= 0xF900 && code <= 0xFAFF) || // CJK Compatibility
    (code >= 0xFE30 && code <= 0xFE4F) || // CJK Compatibility Forms
    (code >= 0xFF00 && code <= 0xFF60) || // Fullwidth Forms
    (code >= 0xFFE0 && code <= 0xFFE6)    // Fullwidth Forms
  ) {
    return 2;
  }
  return 1;
}

/**
 * Calculate actual display length (excluding blessed tags)
 */
function getDisplayLength(text: string): number {
  const stripped = stripBlessedTags(text);
  let width = 0;
  for (const char of stripped) {
    width += getCharWidth(char);
  }
  return width;
}

/**
 * Truncate text to a maximum length with ellipsis
 * Correctly handles blessed tags by not counting them in length
 */
export function truncateText(text: string, maxLength: number, addEllipsis: boolean = true): string {
  if (!text) return text;
  
  const displayLength = getDisplayLength(text);
  if (displayLength <= maxLength) {
    return text;
  }
  
  // For text with blessed tags, we need to be more careful
  // Simple approach: if text has tags, don't truncate (to avoid breaking tags)
  if (text.includes('{') && text.includes('}')) {
    // If text has blessed tags, return as-is to avoid breaking them
    // This is safer than trying to truncate with tags
    return text;
  }
  
  const truncated = text.substring(0, maxLength);
  return addEllipsis ? `${truncated}...` : truncated;
}

/**
 * Wrap text to fit within a specific width, breaking at word boundaries
 * Correctly handles blessed tags by not counting them in width calculations
 */
export function wrapText(text: string, maxWidth: number): string[] {
  if (!text || maxWidth <= 0) {
    return [];
  }
  
  // First split by newlines to preserve line breaks
  const inputLines = text.split('\n');
  const resultLines: string[] = [];
  
  for (const line of inputLines) {
    // Skip empty lines but preserve them
    if (!line.trim()) {
      resultLines.push('');
      continue;
    }
    
    // For lines that might contain CJK characters without spaces,
    // we need character-by-character wrapping instead of word-based
    const lineLength = getDisplayLength(line);
    
    if (lineLength <= maxWidth) {
      // Line fits entirely
      resultLines.push(line);
      continue;
    }
    
    // Check if line has spaces for word-based wrapping
    if (line.includes(' ')) {
      // Has spaces, use word-based wrapping
      const words = line.split(/\s+/);
      let currentLine = '';
      
      for (const word of words) {
        const wordDisplayLength = getDisplayLength(word);
        
        // If single word is longer than max width, break it character by character
        if (wordDisplayLength > maxWidth) {
          if (currentLine) {
            resultLines.push(currentLine.trim());
            currentLine = '';
          }
          // Break the long word character by character
          const brokenLines = breakLongText(word, maxWidth);
          resultLines.push(...brokenLines);
          continue;
        }
        
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testLineLength = getDisplayLength(testLine);
        
        if (testLineLength <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            resultLines.push(currentLine.trim());
          }
          currentLine = word;
        }
      }
      
      if (currentLine) {
        resultLines.push(currentLine.trim());
      }
    } else {
      // No spaces (likely CJK text), break character by character
      const brokenLines = breakLongText(line, maxWidth);
      resultLines.push(...brokenLines);
    }
  }
  
  return resultLines;
}

/**
 * Break long text character by character, respecting blessed tags and character widths
 */
function breakLongText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let currentLine = '';
  let currentWidth = 0;
  let inTag = false;
  let tagBuffer = '';
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // Handle blessed tags
    if (char === '{' && !inTag) {
      inTag = true;
      tagBuffer = char;
      continue;
    }
    
    if (inTag) {
      tagBuffer += char;
      if (char === '}') {
        inTag = false;
        currentLine += tagBuffer;
        tagBuffer = '';
      }
      continue;
    }
    
    // Calculate width of this character
    const charWidth = getCharWidth(char);
    
    if (currentWidth + charWidth > maxWidth) {
      // Would exceed max width, start new line
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = char;
      currentWidth = charWidth;
    } else {
      currentLine += char;
      currentWidth += charWidth;
    }
  }
  
  // Add any remaining tag buffer
  if (tagBuffer) {
    currentLine += tagBuffer;
  }
  
  // Add final line
  if (currentLine) {
    lines.push(currentLine);
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