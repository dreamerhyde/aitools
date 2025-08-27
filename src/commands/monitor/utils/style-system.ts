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
 * - Headers (# ## ###) converted to bold
 * - Bold text (**text**)
 * - Code blocks (`code`)
 * - Italic (*text* or _text_) converted to cyan
 */
export function parseMarkdown(text: string): string {
  // Skip if text already contains blessed color tags (check for specific pattern)
  if (text.match(/\{[#a-z\-]+fg\}|\{\/[#a-z\-]+fg\}/)) {
    return text;
  }
  
  let result = text;
  
  // First handle triple backtick code blocks (``` ... ```)
  // This must be done BEFORE other processing to avoid conflicts
  result = result.replace(/```[\w]*\n?([\s\S]*?)\n?```/g, (match, code) => {
    // Style the entire code block with a subtle background
    const lines = code.split('\n');
    return lines.map((line: string) => `{gray-fg}${line}{/gray-fg}`).join('\n');
  });
  
  // Convert headers to bold (# ## ### at start of line)
  // Only if not inside code blocks
  result = result.replace(/^#{1,3}\s+(.+)$/gm, '{bold}$1{/bold}');
  
  // Convert **bold** to bold (but not inside code blocks)
  result = result.replace(/\*\*([^*]+)\*\*/g, '{bold}$1{/bold}');
  
  // Convert __bold__ to bold
  result = result.replace(/__([^_]+)__/g, '{bold}$1{/bold}');
  
  // Convert single backtick `code` to monospace style
  // Only if not part of triple backticks
  result = result.replace(/(?<!`)`([^`\n]+)`(?!`)/g, '{white-fg}$1{/white-fg}');
  
  // Convert *italic* to cyan (avoid conflicting with bold)
  result = result.replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, '{cyan-fg}$1{/cyan-fg}');
  
  // Convert _italic_ to cyan
  result = result.replace(/(?<!_)_(?!_)([^_]+)_(?!_)/g, '{cyan-fg}$1{/cyan-fg}');
  
  // Convert lists (- or * at start of line) to have a bullet point
  result = result.replace(/^[\*\-]\s+/gm, '• ');
  
  // Convert numbered lists to have consistent formatting
  result = result.replace(/^\d+\.\s+/gm, '  ◦ ');
  
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