/**
 * Text formatter utility for different output targets
 * Provides specialized formatting for CLI, Blessed UI, and Slack
 */

/**
 * Base emoji patterns and mappings
 */

// Comprehensive emoji regex pattern that catches most emoji characters
// IMPORTANT: Excludes checkmarks (✓ U+2713, ✗ U+2717) and other ASCII symbols we want to keep
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{2712}]|[\u{2714}-\u{2716}]|[\u{2718}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F0FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{FE00}-\u{FE0F}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F191}-\u{1F251}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{3030}]|[\u{2B50}]|[\u{2B55}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{3297}]|[\u{3299}]|[\u{303D}]|[\u{00A9}]|[\u{00AE}]|[\u{2122}]|[\u{23F3}]|[\u{24C2}]|[\u{23E9}-\u{23EF}]|[\u{25B6}]|[\u{23F8}-\u{23FA}]|[\u{200D}]|[\u{20E3}]/gu;

// Base emoji to ASCII mapping (without colors)
const EMOJI_TO_ASCII: Record<string, string> = {
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
  
  // Common symbols
  '📌': '▪',
  '💰': '$',
  
  // Activity
  '🏃': '→',
  '🚶': '→',
  '💨': '→'
};

// Emojis to remove completely (decorative, not functional)
const EMOJIS_TO_REMOVE = [
  // Numbers
  '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '0️⃣',
  // Emotions
  '😀', '😁', '😂', '🤣', '😊', '😢', '😭', '😡', '😠', '🤔', '😎', '🙄',
  // Gestures
  '👍', '👎', '👌', '✌️', '🤝', '👏', '🙏',
  // Hearts and celebrations
  '❤️', '💔', '🔥', '✨', '🎉', '🎯', '💯',
  // Media and objects
  '🖥️', '⌨️', '🖱️', '🖨️', '📱', '💿', '💾', '💽',
  '📋', '📊', '🔗', '📮', '📬', '📭', '📯',
  // Time
  '⏰', '⏲️', '⏱️', '📅', '📆', '🗓️'
];

/**
 * Base filtering function - removes unwanted characters and normalizes whitespace
 */
export function filterBase(text: string, preserveWhitespace = false): string {
  let result = text;
  
  // Remove zero-width and control characters
  result = result
    .replace(/\u200D/g, '') // Zero width joiner
    .replace(/\uFE0F/g, '') // Variation selector
    .replace(/\u20E3/g, '') // Keycap sequence
    .replace(/[\u{E0020}-\u{E007F}]/gu, '') // Tag characters
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '') // Skin tone modifiers
    .replace(/[\u{1F9B0}-\u{1F9B3}]/gu, ''); // Additional hair emojis
  
  // Clean up whitespace
  if (!preserveWhitespace) {
    result = result
      .replace(/\s+/g, ' ')  // Collapse multiple spaces
      .replace(/\n\s*\n/g, '\n')  // Remove empty lines
      .trim();
  }
  
  return result;
}

/**
 * Convert emojis to ASCII equivalents
 */
function convertEmojisToAscii(text: string): string {
  let result = text;
  
  // First, remove decorative emojis
  for (const emoji of EMOJIS_TO_REMOVE) {
    const regex = new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    result = result.replace(regex, '');
  }
  
  // Then convert functional emojis to ASCII
  for (const [emoji, ascii] of Object.entries(EMOJI_TO_ASCII)) {
    const regex = new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    result = result.replace(regex, ascii);
  }
  
  // Remove any remaining emojis
  result = result.replace(EMOJI_REGEX, '');
  
  // Additional cleanup for specific problematic sequences
  result = result
    .replace(/[\u0030-\u0039]\uFE0F?\u20E3/g, '') // Number emojis
    .replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '') // Flag emojis
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, ''); // Skin tone modifiers
  
  return result;
}

/**
 * Format text for CLI output (with ANSI color codes)
 */
export function formatForCLI(text: string, options: { preserveWhitespace?: boolean } = {}): string {
  // Convert emojis to ASCII
  let result = convertEmojisToAscii(text);
  
  // Apply base filtering
  result = filterBase(result, options.preserveWhitespace);
  
  // Add ANSI colors for specific patterns
  const colorMappings: Array<[RegExp, string]> = [
    [/✓/g, '\x1b[32m✓\x1b[0m'],  // Green checkmark
    [/✗/g, '\x1b[31m✗\x1b[0m'],  // Red X
    [/!/g, '\x1b[33m!\x1b[0m'],   // Yellow warning
    [/\?/g, '\x1b[36m?\x1b[0m'],  // Cyan question
    [/\[bug\]/g, '\x1b[31m[bug]\x1b[0m'],     // Red bug
    [/\[build\]/g, '\x1b[36m[build]\x1b[0m'], // Cyan build
    [/\[pkg\]/g, '\x1b[34m[pkg]\x1b[0m'],     // Blue package
    [/\[test\]/g, '\x1b[32m[test]\x1b[0m'],   // Green test
  ];
  
  for (const [pattern, replacement] of colorMappings) {
    result = result.replace(pattern, replacement);
  }
  
  return result;
}

/**
 * Format text for Blessed UI (with Blessed tags)
 */
export function formatForBlessed(text: string, options: { preserveWhitespace?: boolean } = {}): string {
  // Convert emojis to ASCII
  let result = convertEmojisToAscii(text);
  
  // Apply base filtering
  result = filterBase(result, options.preserveWhitespace);
  
  // Blessed doesn't support escaping with {open}/{close}
  // For now, just remove the escaping since we're controlling the output
  // and not expecting user input with curly braces
  // If needed, we could use a placeholder and restore later
  
  // Add Blessed color tags for specific patterns
  const colorMappings: Array<[RegExp, string]> = [
    [/✓/g, '{green-fg}✓{/green-fg}'],
    [/✗/g, '{red-fg}✗{/red-fg}'],
    [/!/g, '{yellow-fg}!{/yellow-fg}'],
    [/\?/g, '{cyan-fg}?{/cyan-fg}'],
    [/\[bug\]/g, '{red-fg}[bug]{/red-fg}'],
    [/\[build\]/g, '{cyan-fg}[build]{/cyan-fg}'],
    [/\[pkg\]/g, '{blue-fg}[pkg]{/blue-fg}'],
    [/\[test\]/g, '{green-fg}[test]{/green-fg}'],
  ];
  
  for (const [pattern, replacement] of colorMappings) {
    result = result.replace(pattern, replacement);
  }
  
  return result;
}

/**
 * Format text for Slack (preserve emojis, use Slack markdown)
 */
export function formatForSlack(text: string, options: { preserveWhitespace?: boolean } = {}): string {
  let result = text;
  
  // Apply base filtering (but keep emojis)
  result = filterBase(result, options.preserveWhitespace);
  
  // Convert markdown-style formatting to Slack format
  // Bold: **text** or __text__ -> *text*
  result = result.replace(/\*\*(.*?)\*\*/g, '*$1*');
  result = result.replace(/__(.*?)__/g, '*$1*');
  
  // Italic: *text* or _text_ -> _text_
  // Need to be careful not to conflict with bold
  result = result.replace(/(?<!\*)\*(?!\*)([^*]+)(?<!\*)\*(?!\*)/g, '_$1_');
  
  // Code blocks: ```text``` stays the same
  // Inline code: `text` stays the same
  
  // Strike through: ~~text~~ -> ~text~
  result = result.replace(/~~(.*?)~~/g, '~$1~');
  
  return result;
}

/**
 * Format raw text (no modifications except base filtering)
 */
export function formatRaw(text: string, options: { preserveWhitespace?: boolean } = {}): string {
  return filterBase(text, options.preserveWhitespace);
}

/**
 * Helper to detect which format to use based on environment
 */
export function autoFormat(text: string, options: { 
  preserveWhitespace?: boolean,
  forceFormat?: 'cli' | 'blessed' | 'slack' | 'raw'
} = {}): string {
  if (options.forceFormat) {
    switch (options.forceFormat) {
      case 'cli':
        return formatForCLI(text, options);
      case 'blessed':
        return formatForBlessed(text, options);
      case 'slack':
        return formatForSlack(text, options);
      case 'raw':
        return formatRaw(text, options);
    }
  }
  
  // Default to CLI format
  return formatForCLI(text, options);
}

/**
 * Format action strings with progress indicators
 */
export function formatActionString(action: string, target: 'cli' | 'blessed' | 'slack' = 'cli'): string {
  // Enhanced action mapping
  const actionMappings: Record<string, string> = {
    'Reading file': 'Reading file...',
    'Writing file': 'Writing file...',
    'Editing file': 'Editing file...',
    'Running command': 'Running command...',
    'Thinking': 'Thinking...',
    'Analyzing task': 'Analyzing task...',
    'Planning task': 'Planning task...',
    'Processing': 'Processing...',
    'Fetching web content': 'Fetching web content...',
    'Searching web': 'Searching web...',
    'Executing SQL': 'Executing SQL...',
    'Getting docs': 'Getting docs...',
    'Building component': 'Building component...',
    'Updating todos': 'Updating todos...',
  };
  
  // Apply mapping if available
  let formatted = actionMappings[action] || action;
  
  // Add dots for -ing words if not already present
  if (formatted.match(/ing\b/i) && !formatted.endsWith('...')) {
    formatted += '...';
  }
  
  // Apply target-specific formatting
  switch (target) {
    case 'cli':
      return formatForCLI(formatted);
    case 'blessed':
      return formatForBlessed(formatted);
    case 'slack':
      return formatForSlack(formatted);
    default:
      return formatted;
  }
}

/**
 * Check if text contains emojis
 */
export function hasEmojis(text: string): boolean {
  return EMOJI_REGEX.test(text);
}

/**
 * Count emojis in text
 */
export function countEmojis(text: string): number {
  const matches = text.match(EMOJI_REGEX);
  return matches ? matches.length : 0;
}

/**
 * Extract all emojis from text
 */
export function extractEmojis(text: string): string[] {
  const matches = text.match(EMOJI_REGEX);
  return matches ? [...new Set(matches)] : [];
}