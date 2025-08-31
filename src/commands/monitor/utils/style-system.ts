/* eslint-disable no-useless-escape */
/**
 * Unified style system for terminal text display
 * Provides consistent styling for different types of content
 */

export enum StyleType {
  // Basic styles
  DEFAULT = 'default',
  MUTED = 'muted',
  EMPHASIS = 'emphasis',
  
  // Status styles
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
  INFO = 'info',
  
  // Special styles
  CODE_BLOCK = 'code_block',
  ACTION_STATUS = 'action_status',
  SYSTEM_MESSAGE = 'system_message',
  BADGE = 'badge',
  HIGHLIGHT = 'highlight'
}

export interface StyleDefinition {
  name: string;
  description: string;
  prefix: string;
  suffix: string;
  wrapPadding?: number; // Padding for wrapped content
}

/**
 * Style definitions for blessed terminal display
 */
const STYLE_DEFINITIONS: Record<StyleType, StyleDefinition> = {
  [StyleType.DEFAULT]: {
    name: 'Default',
    description: 'Normal text',
    prefix: '',
    suffix: ''
  },
  
  [StyleType.MUTED]: {
    name: 'Muted',
    description: 'Dim/gray text',
    prefix: '{gray-fg}',
    suffix: '{/gray-fg}'
  },
  
  [StyleType.EMPHASIS]: {
    name: 'Emphasis',
    description: 'Bold text',
    prefix: '{bold}',
    suffix: '{/bold}'
  },
  
  [StyleType.SUCCESS]: {
    name: 'Success',
    description: 'Green success indicator',
    prefix: '{green-fg}',
    suffix: '{/green-fg}'
  },
  
  [StyleType.WARNING]: {
    name: 'Warning',
    description: 'Yellow warning indicator',
    prefix: '{yellow-fg}',
    suffix: '{/yellow-fg}'
  },
  
  [StyleType.ERROR]: {
    name: 'Error',
    description: 'Red error indicator',
    prefix: '{red-fg}',
    suffix: '{/red-fg}'
  },
  
  [StyleType.INFO]: {
    name: 'Info',
    description: 'Cyan info text',
    prefix: '{cyan-fg}',
    suffix: '{/cyan-fg}'
  },
  
  [StyleType.CODE_BLOCK]: {
    name: 'Code Block',
    description: 'Code block with background',
    prefix: '{bg-#2d2d2d-fg}{white-fg} ',
    suffix: ' {/white-fg}{/bg-#2d2d2d-fg}',
    wrapPadding: 1
  },
  
  [StyleType.ACTION_STATUS]: {
    name: 'Action Status',
    description: 'Highlighted action status like code block',
    prefix: '{#d77757-fg}✳ ',
    suffix: '{/#d77757-fg}',
    wrapPadding: 0
  },
  
  [StyleType.SYSTEM_MESSAGE]: {
    name: 'System Message',
    description: 'System/meta messages',
    prefix: '{gray-fg}',
    suffix: '{/gray-fg}'
  },
  
  [StyleType.BADGE]: {
    name: 'Badge',
    description: 'Badge-style text',
    prefix: '{bg-#333333-fg}{white-fg}[',
    suffix: ']{/white-fg}{/bg-#333333-fg}'
  },
  
  [StyleType.HIGHLIGHT]: {
    name: 'Highlight',
    description: 'Highlighted text with background',
    prefix: '{bg-yellow-fg}{black-fg}',
    suffix: '{/black-fg}{/bg-yellow-fg}'
  }
};

/**
 * Apply a style to text
 */
export function applyStyle(text: string, style: StyleType): string {
  const styleDef = STYLE_DEFINITIONS[style];
  if (!styleDef) {
    return text;
  }
  
  // Add padding if specified
  let styledText = text;
  if (styleDef.wrapPadding) {
    const padding = ' '.repeat(styleDef.wrapPadding);
    styledText = padding + text + padding;
  }
  
  return styleDef.prefix + styledText + styleDef.suffix;
}

/**
 * Apply style to multiple lines
 */
export function applyStyleToLines(lines: string[], style: StyleType): string[] {
  return lines.map(line => applyStyle(line, style));
}

/**
 * Strip all blessed tags from text
 */
export function stripStyles(text: string): string {
  return text.replace(/\{[^}]+\}/g, '');
}

/**
 * Get style definition
 */
export function getStyleDefinition(style: StyleType): StyleDefinition {
  return STYLE_DEFINITIONS[style];
}

/**
 * Create a custom style
 */
export function createCustomStyle(
  prefix: string,
  suffix: string,
  options?: { wrapPadding?: number }
): (text: string) => string {
  return (text: string) => {
    let styledText = text;
    if (options?.wrapPadding) {
      const padding = ' '.repeat(options.wrapPadding);
      styledText = padding + text + padding;
    }
    return prefix + styledText + suffix;
  };
}

/**
 * Format action status with dynamic color and style
 */
export function formatActionStatus(action: string, interrupt: boolean = true): string {
  // Import color function
  // const { getActionColor } = require('../../../utils/text-sanitizer.js');
  
  // Format with orange action and gray interrupt text
  if (interrupt) {
    return `{#FFA500-fg}${action}{/#FFA500-fg} {gray-fg}(esc to interrupt){/gray-fg}`;
  }
  
  // Just orange for the action without interrupt text
  return `{#FFA500-fg}${action}{/#FFA500-fg}`;
}

/**
 * Format system message
 */
export function formatSystemMessage(message: string): string {
  return applyStyle(message, StyleType.SYSTEM_MESSAGE);
}

/**
 * Format badge text
 */
export function formatBadge(text: string): string {
  return applyStyle(text, StyleType.BADGE);
}

/**
 * Format code block
 */
export function formatCodeBlock(code: string): string {
  return applyStyle(code, StyleType.CODE_BLOCK);
}

/**
 * Combined style application (e.g., bold + colored)
 */
export function combineStyles(text: string, ...styles: StyleType[]): string {
  let result = text;
  for (const style of styles) {
    const styleDef = STYLE_DEFINITIONS[style];
    if (styleDef) {
      result = styleDef.prefix + result + styleDef.suffix;
    }
  }
  return result;
}

/**
 * Parse and apply basic markdown formatting
 * Supports:
 * - Headers (# ## ###) converted to bold (only if followed by line break)
 * - Code blocks (`code`) with dim background
 */
export function parseMarkdown(text: string): string {
  let result = text;
  
  // Debug logging
  if (process.env.DEBUG_MARKDOWN && (text.includes('`'))) {
    console.log('[parseMarkdown] Input:', text);
  }
  
  // Convert headers to bold (# ## ### ONLY at start of line)
  // Headers must be at the beginning of a line to be considered headers
  result = result.replace(/^(#{1,3})\s+(.+)$/gm, (match, hashes, text) => {
    // Remove any existing bold tags to avoid nesting
    const cleanText = text.replace(/\{bold\}|\{\/bold\}/g, '');
    return `{bold}{white-fg}${cleanText}{/white-fg}{/bold}`;  // Bold + white for better visibility
  });
  
  // Handle markdown inline code with proper pairing
  // Process backticks from left to right, matching pairs correctly
  
  const parts: string[] = [];
  let lastIndex = 0;
  let i = 0;
  
  while (i < result.length) {
    if (result[i] === '`') {
      // Found backtick, count how many
      let openCount = 0;
      const startPos = i;
      while (i < result.length && result[i] === '`') {
        openCount++;
        i++;
      }
      
      // Look for matching closing backticks of same count
      let j = i;
      let found = false;
      
      while (j < result.length) {
        if (result[j] === '`') {
          let closeCount = 0;
          const closeStart = j;
          while (j < result.length && result[j] === '`') {
            closeCount++;
            j++;
          }
          
          if (closeCount === openCount) {
            // Found matching pair!
            // Add text before the code block
            parts.push(result.substring(lastIndex, startPos));
            // Add the code block content with blue color (more visible than cyan)
            let codeContent = result.substring(i, closeStart);
            
            // For triple backticks, check if first line is a language identifier
            let isCodeBlock = false;
            if (openCount === 3) {
              isCodeBlock = true;
              const lines = codeContent.split('\n');
              if (lines.length > 0 && lines[0].match(/^[a-zA-Z]+$/)) {
                // First line is just a language name (like "python", "javascript")
                // TODO: Store language for future syntax highlighting
                // const language = lines[0];
                // Remove the language line from the content
                codeContent = lines.slice(1).join('\n');
              }
              // Also trim any leading/trailing empty lines from the code content
              codeContent = codeContent.replace(/^\n+/, '').replace(/\n+$/, '');
            }
            
            // Don't add color if the content looks like a blessed tag itself
            // This prevents double-tagging like {blue-fg}{blue-fg}{/blue-fg}
            if (codeContent.match(/^\{[#a-z\-]+fg\}.*\{\/[#a-z\-]+fg\}$/)) {
              // Content is already a blessed tag, keep as-is for display
              parts.push(codeContent);
            } else {
              // For code blocks (triple backticks), add empty lines before and after for visual separation
              if (isCodeBlock) {
                // Add empty line before code block
                parts.push('\n');
              }
              
              // For multiline code blocks, wrap each line separately to avoid blessed tag issues
              const codeLines = codeContent.split('\n');
              const wrappedLines = codeLines.map(line => {
                // Don't wrap empty lines
                if (line.trim() === '') return line;
                return '{blue-fg}' + line + '{/blue-fg}';
              });
              parts.push(wrappedLines.join('\n'));
              
              // For code blocks (triple backticks), add empty line after
              if (isCodeBlock) {
                parts.push('\n');
              }
            }
            lastIndex = j;
            i = j;
            found = true;
            break;
          }
        } else {
          j++;
        }
      }
      
      if (!found) {
        // No matching backticks, skip these
        i = startPos + openCount;
      }
    } else {
      i++;
    }
  }
  
  // Add any remaining text
  parts.push(result.substring(lastIndex));
  result = parts.join('');
  
  // NOW process bold markers AFTER backticks are handled
  // This prevents ** from being processed inside code blocks
  result = result.replace(/\*\*([^*]+)\*\*/g, '{bold}{white-fg}$1{/white-fg}{/bold}');
  
  // Debug logging
  if (process.env.DEBUG_MARKDOWN && text.includes('`')) {
    console.log('[parseMarkdown] Output:', result);
  }
  
  return result;
}

/**
 * Format text with markdown support and additional styling
 */
export function formatRichText(text: string, baseStyle?: StyleType): string {
  // First apply markdown parsing
  let formatted = parseMarkdown(text);
  
  // Then apply base style if provided
  if (baseStyle) {
    const styleDef = STYLE_DEFINITIONS[baseStyle];
    if (styleDef) {
      formatted = styleDef.prefix + formatted + styleDef.suffix;
    }
  }
  
  return formatted;
}