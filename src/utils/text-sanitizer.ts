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
  // Emotions
  '😀': ':)',
  '😁': ':D',
  '😂': 'XD',
  '🤣': 'XD',
  '😊': ':)',
  '😢': ':(',
  '😭': ":'(",
  '😡': '>:(',
  '😠': '>:(',
  '🤔': '(?)',
  '😎': 'B)',
  '🙄': ':-/',
  
  // Gestures
  '👍': '+1',
  '👎': '-1',
  '👌': 'OK',
  '✌️': 'V',
  '🤝': '[handshake]',
  '👏': '[clap]',
  '🙏': '[pray]',
  
  // Symbols and indicators
  '❤️': '<3',
  '💔': '</3',
  '🔥': '*',
  '⭐': '*',
  '✅': '[OK]',
  '❌': '[X]',
  '⚠️': '[!]',
  '📌': '[pin]',
  '🔗': '[link]',
  
  // Arrows and trends
  '📈': '↗',
  '📉': '↘',
  '🚀': '^',
  '⬆️': '↑',
  '⬇️': '↓',
  '➡️': '→',
  '⬅️': '←',
  
  // Status indicators
  '💡': '[idea]',
  '💯': '100%',
  '📝': '[note]',
  '📁': '[folder]',
  '📄': '[file]',
  '💰': '$',
  '⚡': '!',
  '✨': '~',
  '🎉': '***',
  '🎯': '[target]',
  
  // Development related
  '🐛': '[bug]',
  '🔧': '[fix]',
  '🔨': '[build]',
  '📦': '[package]',
  '🧪': '[test]',
  '🔍': '[search]',
  '💻': '[code]',
  
  // Colors (for status)
  '🔴': '(red)',
  '🟡': '(yellow)', 
  '🟢': '(green)',
  '🔵': '(blue)',
  '⚪': '(white)',
  '⚫': '(black)'
};

/**
 * Comprehensive emoji regex pattern that catches most emoji characters
 */
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F0FF}]|[\u{1FA70}-\u{1FAFF}]/gu;

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
    preserveWhitespace: false
  });
  
  // Apply enhanced mapping if available
  const enhanced = ENHANCED_ACTION_MAPPING[sanitized];
  if (enhanced) {
    sanitized = enhanced;
  } else {
    // If no direct mapping, add dots for progressive feel if not already present
    if (!sanitized.endsWith('...') && !sanitized.endsWith('.')) {
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
export function getActionColor(action: string): 'green' | 'yellow' | 'cyan' | 'blue' | 'magenta' {
  const lowercaseAction = action.toLowerCase();
  
  // Thinking and analysis - cyan
  if (lowercaseAction.includes('thinking') || 
      lowercaseAction.includes('analyzing') || 
      lowercaseAction.includes('planning') ||
      lowercaseAction.includes('orchestrating')) {
    return 'cyan';
  }
  
  // File operations - green  
  if (lowercaseAction.includes('reading') ||
      lowercaseAction.includes('writing') ||
      lowercaseAction.includes('editing') ||
      lowercaseAction.includes('file')) {
    return 'green';
  }
  
  // Commands and execution - yellow
  if (lowercaseAction.includes('running') ||
      lowercaseAction.includes('executing') ||
      lowercaseAction.includes('command')) {
    return 'yellow';
  }
  
  // Web and network - blue
  if (lowercaseAction.includes('fetching') ||
      lowercaseAction.includes('searching') ||
      lowercaseAction.includes('web')) {
    return 'blue';
  }
  
  // Development tools - magenta
  if (lowercaseAction.includes('building') ||
      lowercaseAction.includes('auditing') ||
      lowercaseAction.includes('testing')) {
    return 'magenta';
  }
  
  // Default - cyan
  return 'cyan';
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