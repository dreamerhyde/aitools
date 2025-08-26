/**
 * Text sanitizer utility for cleaning conversation content
 * Removes emojis and converts them to ASCII symbols following project guidelines
 */

export interface SanitizeOptions {
  removeEmojis?: boolean;
  convertToAscii?: boolean;
  maxLength?: number;
  preserveWhitespace?: boolean;
}

/**
 * Emoji to ASCII symbol mapping following project's visual design principles
 * Uses flat symbols instead of emojis (✓、✗、●、○、▪、→ etc.)
 */
const EMOJI_TO_ASCII: Record<string, string> = {
  // Success and failure indicators - using project standard symbols
  '✅': '✓',
  '❌': '✗',
  '✔️': '✓',
  '❎': '✗',
  '☑️': '✓',
  
  // Status indicators - using project standard symbols  
  '⭐': '●',
  '🔴': '●',
  '🟢': '●',
  '🟡': '●',
  '🔵': '●',
  '⚪': '○',
  '⚫': '●',
  '🟠': '●',
  '🟣': '●',
  
  // Arrows and directions - keeping Unicode arrows
  '📈': '↗',
  '📉': '↘',
  '🚀': '↑',
  '⬆️': '↑',
  '⬇️': '↓',
  '➡️': '→',
  '⬅️': '←',
  
  // Warning and attention - using project symbols
  '⚠️': '▪',
  '❗': '▪',
  '‼️': '▪',
  '❓': '▪',
  '❔': '▪',
  
  // Progress and activity
  '🔧': '→',
  '⚡': '→',
  '💡': '→',
  '🔍': '→',
  '📝': '→',
  '📁': '→',
  '📄': '→',
  '💻': '→',
  
  // Development related - simplified
  '🐛': '[bug]',
  '🔨': '[build]',
  '📦': '[pkg]',
  '🧪': '[test]',
  
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
 */
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F0FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{FE00}-\u{FE0F}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F191}-\u{1F251}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{3030}]|[\u{2B50}]|[\u{2B55}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{3297}]|[\u{3299}]|[\u{303D}]|[\u{00A9}]|[\u{00AE}]|[\u{2122}]|[\u{23F3}]|[\u{24C2}]|[\u{23E9}-\u{23EF}]|[\u{25B6}]|[\u{23F8}-\u{23FA}]|[\u{200D}]|[\u{20E3}]/gu;

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
    preserveWhitespace = false
  } = options;

  let result = text;

  // Convert known emojis to ASCII symbols first
  if (convertToAscii) {
    for (const [emoji, ascii] of Object.entries(EMOJI_TO_ASCII)) {
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

  // Apply length limit if specified
  if (maxLength && result.length > maxLength) {
    result = result.substring(0, maxLength - 3) + '...';
  }

  return result;
}

/**
 * Sanitizes conversation messages for display in session boxes
 * @param messages Array of conversation messages
 * @returns Sanitized messages ready for display
 */
export function sanitizeConversationMessages(messages: Array<{
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  tokens?: number;
}>): Array<{
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  tokens?: number;
}> {
  return messages.map(msg => ({
    ...msg,
    content: sanitizeText(msg.content, {
      removeEmojis: true,
      convertToAscii: true,
      maxLength: 500,
      preserveWhitespace: false
    })
  }));
}

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
  'Working': 'Working...',
  'Processing': 'Processing...'
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
    preserveWhitespace: false
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
 * Get action color based on action type
 * @param action The action string
 * @returns Color function for the action
 */
export function getActionColor(action: string): 'green' | 'yellow' | 'cyan' | 'blue' | 'magenta' | 'orange' {
  // Always return orange for all actions
  return 'orange';
}

/**
 * Sanitizes topic/title strings for display
 * @param topic The topic string to sanitize
 * @param maxLength Maximum length for the topic
 * @returns Sanitized topic string
 */
export function sanitizeTopic(topic: string, maxLength: number = 100): string {
  return sanitizeText(topic, {
    removeEmojis: true,
    convertToAscii: true,
    maxLength,
    preserveWhitespace: false
  });
}

/**
 * Checks if a string contains emojis
 * @param text The text to check
 * @returns True if the text contains emojis
 */
export function hasEmojis(text: string): boolean {
  return EMOJI_REGEX.test(text);
}

/**
 * Counts the number of emojis in a string
 * @param text The text to analyze
 * @returns Number of emojis found
 */
export function countEmojis(text: string): number {
  const matches = text.match(EMOJI_REGEX);
  return matches ? matches.length : 0;
}

/**
 * Extracts all emojis from a string
 * @param text The text to extract emojis from
 * @returns Array of emoji characters found
 */
export function extractEmojis(text: string): string[] {
  const matches = text.match(EMOJI_REGEX);
  return matches ? [...new Set(matches)] : [];
}