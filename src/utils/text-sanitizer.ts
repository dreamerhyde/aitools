/**
 * Text sanitizer utility for cleaning conversation content
 * Removes emojis and converts them to ASCII symbols following project guidelines
 */

export interface SanitizeOptions {
  removeEmojis?: boolean;
  convertToAscii?: boolean;
  maxLength?: number;
  preserveWhitespace?: boolean;
  useColors?: boolean;  // Enable colored output for blessed terminals
}

/**
 * Plain ASCII mapping without colors
 */
const EMOJI_TO_PLAIN_ASCII: Record<string, string> = {
  // Success and failure indicators
  '✅': '✓',
  '❌': '✗',
  '✔️': '✓',
  '❎': '✗',
  '☑️': '✓',
  
  // Status indicators
  '⭐': '●',
  '🔴': '●',
  '🟢': '●',
  '🟡': '●',
  '🔵': '●',
  '⚪': '○',
  '⚫': '●',
  '🟠': '●',
  '🟣': '●',
  
  // Arrows and directions
  '📈': '↗',
  '📉': '↘',
  '🚀': '↑',
  '⬆️': '↑',
  '⬇️': '↓',
  '➡️': '→',
  '⬅️': '←',
  
  // Warning and attention
  '⚠️': '!',
  '❗': '!',
  '‼️': '!!',
  '❓': '?',
  '❔': '?',
  
  // Progress and activity
  '🔧': '→',
  '⚡': '→',
  '💡': '→',
  '🔍': '→',
  '📝': '→',
  '📁': '→',
  '📄': '→',
  '💻': '→',
  
  // Development related
  '🐛': '[bug]',
  '🔨': '[build]',
  '📦': '[pkg]',
  '🧪': '[test]',
  
  // Numbers and lists - remove completely
  '1️⃣': '', '2️⃣': '', '3️⃣': '', '4️⃣': '', '5️⃣': '',
  '6️⃣': '', '7️⃣': '', '8️⃣': '', '9️⃣': '', '🔟': '', '0️⃣': '',
  
  // Emotions - remove
  '😀': '', '😁': '', '😂': '', '🤣': '', '😊': '',
  '😢': '', '😭': '', '😡': '', '😠': '', '🤔': '',
  '😎': '', '🙄': '',
  
  // Gestures - remove
  '👍': '', '👎': '', '👌': '', '✌️': '',
  '🤝': '', '👏': '', '🙏': '',
  
  // Hearts and celebrations - remove
  '❤️': '', '💔': '', '🔥': '', '✨': '',
  '🎉': '', '🎯': '', '💯': '',
  
  // Additional common emojis
  '📋': '', '📊': '', '📌': '▪', '💰': '$',
  '🔗': '', '📮': '', '📬': '', '📭': '', '📯': '',
  
  // Media and objects - remove
  '🖥️': '', '⌨️': '', '🖱️': '', '🖨️': '',
  '📱': '', '💿': '', '💾': '', '💽': '',
  
  // Time and calendar - remove
  '⏰': '', '⏲️': '', '⏱️': '',
  '📅': '', '📆': '', '🗓️': '',
  
  // Common activity emojis
  '🏃': '→', '🚶': '→', '💨': '→'
};

/**
 * DEPRECATED: Mixed ANSI and Blessed tags - causing rendering issues
 * Should use text-formatter.ts instead
 */
const EMOJI_TO_COLORED_ASCII: Record<string, string> = {
  // Success and failure indicators - with colors
  // Try using ANSI escape codes directly instead of blessed tags
  '✅': '\x1b[32m✓\x1b[0m',  // Direct ANSI green
  '❌': '\x1b[31m✗\x1b[0m',  // Direct ANSI red
  '✔️': '\x1b[32m✓\x1b[0m',  // Direct ANSI green
  '❎': '\x1b[31m✗\x1b[0m',  // Direct ANSI red
  '☑️': '\x1b[32m✓\x1b[0m',  // Direct ANSI green
  
  // Status indicators - with appropriate colors (using ANSI)
  '⭐': '\x1b[33m●\x1b[0m',  // Yellow
  '🔴': '\x1b[31m●\x1b[0m',  // Red
  '🟢': '\x1b[32m●\x1b[0m',  // Green
  '🟡': '\x1b[33m●\x1b[0m',  // Yellow
  '🔵': '\x1b[34m●\x1b[0m',  // Blue
  '⚪': '\x1b[90m○\x1b[0m',  // Gray
  '⚫': '\x1b[90m●\x1b[0m',  // Gray
  '🟠': '\x1b[38;5;208m●\x1b[0m',  // Orange (256 color)
  '🟣': '\x1b[35m●\x1b[0m',  // Magenta
  
  // Arrows and directions - with subtle colors
  '📈': '{green-fg}↗{/green-fg}',
  '📉': '{red-fg}↘{/red-fg}',
  '🚀': '{cyan-fg}↑{/cyan-fg}',
  '⬆️': '{green-fg}↑{/green-fg}',
  '⬇️': '{red-fg}↓{/red-fg}',
  '➡️': '{blue-fg}→{/blue-fg}',
  '⬅️': '{blue-fg}←{/blue-fg}',
  
  // Warning and attention - with appropriate colors (using ANSI)
  '⚠️': '\x1b[33m!\x1b[0m',  // Yellow
  '❗': '\x1b[31m!\x1b[0m',  // Red
  '‼️': '\x1b[31m!!\x1b[0m',  // Red
  '❓': '\x1b[36m?\x1b[0m',  // Cyan
  '❔': '\x1b[90m?\x1b[0m',  // Gray
  
  // Progress and activity - with contextual colors
  '🔧': '{cyan-fg}→{/cyan-fg}',
  '⚡': '{yellow-fg}→{/yellow-fg}',
  '💡': '{yellow-fg}→{/yellow-fg}',
  '🔍': '{blue-fg}→{/blue-fg}',
  '📝': '{gray-fg}→{/gray-fg}',
  '📁': '{blue-fg}→{/blue-fg}',
  '📄': '{gray-fg}→{/gray-fg}',
  '💻': '{cyan-fg}→{/cyan-fg}',
  
  // Development related - with semantic colors
  '🐛': '{red-fg}[bug]{/red-fg}',
  '🔨': '{cyan-fg}[build]{/cyan-fg}',
  '📦': '{blue-fg}[pkg]{/blue-fg}',
  '🧪': '{green-fg}[test]{/green-fg}',
  
  // Numbers and lists - remove completely to match UI principles
  '1️⃣': '',
  '2️⃣': '',
  '3️⃣': '',
  '4️⃣': '',
  '5️⃣': '',
  '6️⃣': '',
  '7️⃣': '',
  '8️⃣': '',
  '9️⃣': '',
  '🔟': '',
  '0️⃣': '',
  
  // Emotions - simplified ASCII
  '😀': '',
  '😁': '',
  '😂': '',
  '🤣': '',
  '😊': '',
  '😢': '',
  '😭': '',
  '😡': '',
  '😠': '',
  '🤔': '',
  '😎': '',
  '🙄': '',
  
  // Gestures - remove as not part of flat design
  '👍': '',
  '👎': '',
  '👌': '',
  '✌️': '',
  '🤝': '',
  '👏': '',
  '🙏': '',
  
  // Hearts and celebrations - not needed in CLI
  '❤️': '',
  '💔': '',
  '🔥': '',
  '✨': '',
  '🎉': '',
  '🎯': '',
  '💯': '',
  
  // Additional common emojis - remove or convert
  '📋': '',
  '📊': '',
  '📌': '▪',
  '💰': '$',
  '🔗': '',
  '📮': '',
  '📬': '',
  '📭': '',
  '📯': '',
  
  // Media and objects - remove  
  '🖥️': '',
  '⌨️': '',
  '🖱️': '',
  '🖨️': '',
  '📱': '',
  '💿': '',
  '💾': '',
  '💽': '',
  
  // Time and calendar - remove
  '⏰': '',
  '⏲️': '',
  '⏱️': '',
  '📅': '',
  '📆': '',
  '🗓️': '',
  
  // Common activity emojis - use arrows
  '🏃': '→',
  '🚶': '→',
  '💨': '→'
};

/**
 * Comprehensive emoji regex pattern that catches most emoji characters
 * Including number emojis, skin tones, and modifier sequences
 * IMPORTANT: Excludes checkmarks (✓ U+2713, ✗ U+2717) and other ASCII symbols we want to keep
 */
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{2712}]|[\u{2714}-\u{2716}]|[\u{2718}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F0FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{FE00}-\u{FE0F}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F191}-\u{1F251}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{3030}]|[\u{2B50}]|[\u{2B55}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{3297}]|[\u{3299}]|[\u{303D}]|[\u{00A9}]|[\u{00AE}]|[\u{2122}]|[\u{23F3}]|[\u{24C2}]|[\u{23E9}-\u{23EF}]|[\u{25B6}]|[\u{23F8}-\u{23FA}]|[\u{200D}]|[\u{20E3}]/gu;

/**
 * Sanitizes text by removing or converting emojis
 * @param text The input text to sanitize
 * @param options Sanitization options
 * @returns Sanitized text
 */
export function sanitizeText(text: string, options: SanitizeOptions = {}): string {
  const {
    removeEmojis = true,
    convertToAscii = true,
    maxLength,
    preserveWhitespace = false,
    useColors = false  // DEPRECATED: This mixing of formats causes issues
  } = options;

  let result = text;
  
  // IMPORTANT: Protect blessed terminal tags from being modified
  // Store blessed tags temporarily and restore them after sanitization
  const blessedTags: string[] = [];
  const placeholder = '___BLESSED_TAG___';
  
  // Extract and replace blessed tags with placeholders
  result = result.replace(/\{[^}]+\}/g, (match) => {
    blessedTags.push(match);
    return `${placeholder}${blessedTags.length - 1}${placeholder}`;
  });

  // Convert known emojis to ASCII symbols first
  if (convertToAscii) {
    // Choose the appropriate mapping based on useColors option
    const mappingTable = useColors ? EMOJI_TO_COLORED_ASCII : EMOJI_TO_PLAIN_ASCII;
    
    for (const [emoji, ascii] of Object.entries(mappingTable)) {
      const regex = new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      result = result.replace(regex, ascii);
    }
  }

  // Remove remaining emojis
  if (removeEmojis) {
    result = result.replace(EMOJI_REGEX, '');
    
    // Additional cleanup for specific problematic sequences
    result = result
      .replace(/[\u0030-\u0039]\uFE0F?\u20E3/g, '') // Number emojis like 1️⃣ 2️⃣ etc
      .replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '') // Flag emojis
      .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '') // Skin tone modifiers
      .replace(/\u200D/g, '') // Zero width joiner
      .replace(/\uFE0F/g, '') // Variation selector
      .replace(/\u20E3/g, '') // Keycap sequence
      .replace(/[\u{E0020}-\u{E007F}]/gu, '') // Tag characters
      .replace(/[\u{1F9B0}-\u{1F9B3}]/gu, ''); // Additional hair emojis
  }

  // Clean up whitespace
  if (!preserveWhitespace) {
    result = result
      .replace(/\s+/g, ' ')  // Collapse multiple spaces
      .replace(/\n\s*\n/g, '\n')  // Remove empty lines
      .trim();
  }
  
  // Restore blessed tags BEFORE applying length limit
  // This prevents breaking blessed tags or showing placeholders
  for (let i = 0; i < blessedTags.length; i++) {
    result = result.replace(`${placeholder}${i}${placeholder}`, blessedTags[i]);
  }

  // Apply length limit if specified (AFTER restoring blessed tags)
  // Note: Avoid using maxLength to prevent truncation in table views
  if (maxLength && result.length > maxLength) {
    // Try to find a good break point (space or newline) near the limit
    const cutPoint = result.lastIndexOf(' ', maxLength);
    const breakPoint = cutPoint > maxLength - 20 ? cutPoint : maxLength - 3;
    result = result.substring(0, breakPoint) + '...';
  }

  return result;
}

// Removed: sanitizeConversationMessages - not used anywhere

/**
 * Enhanced action status mapping with progressive indicators
 * Maps tool names to display status with progress indicators
 */
const ENHANCED_ACTION_MAPPING: Record<string, string> = {
  // File operations
  'Reading file': 'Reading file...',
  'Writing file': 'Writing file...',
  'Editing file': 'Editing file...',
  'Editing multiple files': 'Editing multiple files...',
  'Moving file': 'Moving file...',
  'Creating directory': 'Creating directory...',
  'Listing directory': 'Listing directory...',
  'Searching files': 'Searching files...',
  
  // Command operations
  'Running command': 'Running command...',
  'Reading output': 'Reading output...',
  'Terminating process': 'Terminating process...',
  
  // Analysis and thinking
  'Thinking': 'Thinking...',
  'Analyzing task': 'Analyzing task...',
  'Planning task': 'Planning task...',
  'Processing': 'Processing...',
  
  // Web operations  
  'Fetching web content': 'Fetching web content...',
  'Searching web': 'Searching web...',
  'Taking screenshot': 'Taking screenshot...',
  'Reading console': 'Reading console...',
  'Checking errors': 'Checking errors...',
  
  // Database operations
  'Executing SQL': 'Executing SQL...',
  'Listing tables': 'Listing tables...',
  
  // Documentation
  'Getting docs': 'Getting docs...',
  'Resolving library': 'Resolving library...',
  
  // Development tools
  'Building component': 'Building component...',
  'Running agent': 'Running agent...',
  'Auditing accessibility': 'Auditing accessibility...',
  'Auditing performance': 'Auditing performance...',
  'Auditing SEO': 'Auditing SEO...',
  
  // Task management
  'Updating todos': 'Updating todos...',
  'Planning': 'Planning...',
  
  // Generic states
  'Puttering': 'Puttering...',
  'Orchestrating': 'Orchestrating...',
  'Working': 'Working...'
};

/**
 * Formats action strings for display with enhanced status indicators
 * @param action The action string to format
 * @returns Formatted action string with progress indicators
 */
export function formatActionString(action: string): string {
  // First sanitize the text
  let sanitized = sanitizeText(action, {
    removeEmojis: true,
    convertToAscii: true,
    preserveWhitespace: false,
    useColors: true  // Enable colored emoji conversion
  });
  
  // Check if it's already a formatted status (like from activeForm)
  // These usually end with "..." or contain "(esc to interrupt)"
  if (sanitized.includes('(esc to interrupt)') || 
      sanitized.includes('(ESC to interrupt)')) {
    // It's already formatted from activeForm, just return it
    return sanitized;
  }
  
  // Apply enhanced mapping if available
  const enhanced = ENHANCED_ACTION_MAPPING[sanitized];
  if (enhanced) {
    sanitized = enhanced;
  } else {
    // For any -ing word, ensure it has dots (dynamic status verbs)
    if (sanitized.match(/ing\b/i) && !sanitized.endsWith('...')) {
      sanitized += '...';
    }
    // If no direct mapping and not an -ing word, add dots for progressive feel
    else if (!sanitized.endsWith('...') && !sanitized.endsWith('.')) {
      sanitized += '...';
    }
  }
  
  return sanitized;
}

/**
 * Sanitizes topic/title strings for display
 */
export function sanitizeTopic(topic: string, maxLength: number = 100): string {
  return sanitizeText(topic, {
    removeEmojis: true,
    convertToAscii: true,
    maxLength,
    preserveWhitespace: false
  });
}