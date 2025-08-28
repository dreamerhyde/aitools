/**
 * Q/A Display Style Options for Session Boxes
 * Different visual styles for identifying Questions and Answers
 */

export enum QAStyleType {
  BADGE = 'badge',           // Colored background badges
  ICON = 'icon',             // Unicode icons
  BRACKET = 'bracket',       // Bracketed labels
  ARROW = 'arrow',           // Arrow indicators
  MINIMAL = 'minimal',       // Minimal style
  HYBRID = 'hybrid'          // Hybrid: Q with background, A with arrow
}

export interface QAStyle {
  userPrefix: string;
  assistantPrefix: string;
  userContinuation: string;
  assistantContinuation: string;
  separator: string;
  description: string;
}

export const QA_STYLES: Record<QAStyleType, QAStyle> = {
  // Style 1: Colored text labels (no background)
  [QAStyleType.BADGE]: {
    userPrefix: '{bold}{cyan-fg}[Q]{/cyan-fg}{/bold} {cyan-fg}',
    assistantPrefix: '{bold}{green-fg}[A]{/green-fg}{/bold} {#DDDDDD-fg}',  // Light gray for AI
    userContinuation: '     {cyan-fg}',
    assistantContinuation: '     {#DDDDDD-fg}',  // Light gray
    separator: '{gray-fg}' + '─'.repeat(20) + '{/gray-fg}',
    description: 'Colored brackets without background'
  },

  // Style 2: Unicode Icons (Clean and modern)
  [QAStyleType.ICON]: {
    userPrefix: '{cyan-fg}{bold}▶ Q:{/bold} ',
    assistantPrefix: '{green-fg}{bold}▷ A:{/bold} {#DDDDDD-fg}',  // Light gray for AI
    userContinuation: '      {cyan-fg}',
    assistantContinuation: '      {#DDDDDD-fg}',  // Light gray
    separator: '{gray-fg}  · · ·{/gray-fg}',
    description: 'Arrow icons with colors'
  },

  // Style 3: Bracketed Labels (Traditional)
  [QAStyleType.BRACKET]: {
    userPrefix: '{cyan-fg}{bold}[Q]{/bold} ',
    assistantPrefix: '{green-fg}{bold}[A]{/bold} {#DDDDDD-fg}',  // Light gray for AI
    userContinuation: '    {cyan-fg}',
    assistantContinuation: '    {#DDDDDD-fg}',  // Light gray
    separator: '',
    description: 'Square brackets with colors'
  },

  // Style 4: Arrow Indicators (Directional)
  [QAStyleType.ARROW]: {
    userPrefix: '{cyan-fg}{bold}→{/bold} ',
    assistantPrefix: '{green-fg}{bold}←{/bold} {#DDDDDD-fg}',  // Light gray for AI
    userContinuation: '  {cyan-fg}',
    assistantContinuation: '  {#DDDDDD-fg}',  // Light gray
    separator: '',
    description: 'Directional arrows'
  },

  // Style 5: Minimal (Subtle)
  [QAStyleType.MINIMAL]: {
    userPrefix: '{cyan-fg}• ',
    assistantPrefix: '{#DDDDDD-fg}  ',  // Light gray for AI
    userContinuation: '  {cyan-fg}',
    assistantContinuation: '    {#DDDDDD-fg}',  // Light gray
    separator: '',
    description: 'Minimal with indentation'
  },

  // Style 6: Hybrid (Q with badge, A with arrow) - RECOMMENDED
  [QAStyleType.HYBRID]: {
    userPrefix: '{green-bg}{black-fg} Q {/black-fg}{/green-bg} {green-fg}',  // Q with green background badge
    assistantPrefix: '{#DDDDDD-fg}→ ',  // Light gray for AI
    userContinuation: '     {green-fg}',  // Align with Q badge width
    assistantContinuation: '  {#DDDDDD-fg}',  // Light gray
    separator: '',
    description: 'Hybrid style with Q badge and A arrow'
  }
};

// Alternative color schemes
export interface ColorScheme {
  userColor: string;
  assistantColor: string;
  separatorColor: string;
}

export const COLOR_SCHEMES = {
  default: {
    userColor: 'cyan',
    assistantColor: 'green',
    separatorColor: 'gray'
  },
  ocean: {
    userColor: 'blue',
    assistantColor: 'cyan',
    separatorColor: 'gray'
  },
  warm: {
    userColor: 'yellow',
    assistantColor: 'magenta',
    separatorColor: 'gray'
  },
  monochrome: {
    userColor: 'white',
    assistantColor: 'gray',
    separatorColor: 'gray'
  },
  high_contrast: {
    userColor: 'yellow',
    assistantColor: 'white',
    separatorColor: 'blue'
  }
};

/**
 * Get Q/A style configuration
 * @param styleType The style type to use
 * @param colorScheme Optional color scheme override
 */
export function getQAStyle(
  styleType: QAStyleType = QAStyleType.BADGE,
  colorScheme?: ColorScheme
): QAStyle {
  const baseStyle = QA_STYLES[styleType];
  
  // If custom color scheme provided, apply it
  if (colorScheme) {
    return {
      ...baseStyle,
      userPrefix: baseStyle.userPrefix
        .replace(/cyan/g, colorScheme.userColor),
      assistantPrefix: baseStyle.assistantPrefix
        .replace(/green/g, colorScheme.assistantColor),
      userContinuation: baseStyle.userContinuation
        .replace(/cyan/g, colorScheme.userColor),
      assistantContinuation: baseStyle.assistantContinuation
        .replace(/white/g, colorScheme.assistantColor),
      separator: baseStyle.separator
        .replace(/gray/g, colorScheme.separatorColor)
    };
  }
  
  return baseStyle;
}

// Message type detection for different Q styling
export enum UserMessageType {
  NORMAL = 'normal',        // Regular user question
  INTERRUPTION = 'interruption', // Message sent during AI response
  FOLLOWUP = 'followup',    // Quick follow-up or clarification
  SYSTEM = 'system'         // System interrupt messages
}

/**
 * Detect the type of user message based on context and content
 */
export function detectUserMessageType(
  content: string,
  sessionStatus?: 'active' | 'completed' | 'idle',
  isRecent?: boolean
): UserMessageType {
  // System interrupt messages
  if (content.includes('[Request interrupted') || 
      content === '[Request interrupted by user]' ||
      content === '[Request interrupted by user for tool use]') {
    return UserMessageType.SYSTEM;
  }
  
  // Short messages during CONFIRMED active sessions might be interruptions
  // But be more conservative - only very short messages during active sessions
  if (sessionStatus === 'active' && content.length < 30 && isRecent) {
    return UserMessageType.INTERRUPTION;
  }
  
  // Only extremely short messages are follow-ups (like single words or very brief questions)
  if (content.length < 15 && content.includes('?')) {
    return UserMessageType.FOLLOWUP;
  }
  
  // Default to NORMAL for most user messages
  return UserMessageType.NORMAL;
}

/**
 * Get Q prefix style based on message type
 */
export function getQPrefixForType(type: UserMessageType, baseStyle: QAStyle): string {
  switch (type) {
    case UserMessageType.NORMAL:
      return baseStyle.userPrefix; // Green Q badge
      
    case UserMessageType.INTERRUPTION:
      // Green Q badge for interruptions (same as normal)
      return '{green-bg}{black-fg} Q {/black-fg}{/green-bg} {green-fg}';
      
    case UserMessageType.FOLLOWUP:
      // Green Q badge for follow-ups (same as normal)
      return '{green-bg}{black-fg} Q {/black-fg}{/green-bg} {green-fg}';
      
    case UserMessageType.SYSTEM:
      return ''; // No prefix for system messages
  }
}

/**
 * Format Q/A message with selected style and intelligent Q typing
 */
export function formatQAMessage(
  role: 'user' | 'assistant',
  content: string[],
  style: QAStyle,
  sessionStatus?: 'active' | 'completed' | 'idle'
): string[] {
  const lines: string[] = [];
  const isUser = role === 'user';
  
  // First line with prefix
  if (content.length > 0) {
    if (isUser) {
      // Detect message type for intelligent Q styling
      const messageType = detectUserMessageType(content[0], sessionStatus, true);
      
      if (messageType === UserMessageType.SYSTEM) {
        // System messages: no Q badge, just gray text
        lines.push('{gray-fg}' + content[0] + '{/gray-fg}');
      } else {
        // User messages with typed Q badges
        const qPrefix = getQPrefixForType(messageType, style);
        // All message types now use green
        const suffix = '{/green-fg}';
        lines.push(qPrefix + content[0] + suffix);
      }
      
      // Continuation lines for user messages
      for (let i = 1; i < content.length; i++) {
        const messageType = detectUserMessageType(content[0], sessionStatus, true);
        if (messageType !== UserMessageType.SYSTEM) {
          const continuation = style.userContinuation;
          const suffix = messageType === UserMessageType.NORMAL ? '{/green-fg}' : 
                        messageType === UserMessageType.INTERRUPTION ? '{/#d77757-fg}' : 
                        '{/yellow-fg}';
          lines.push(continuation + content[i] + suffix);
        }
      }
    } else {
      // Assistant messages - no suffix to allow internal colors (cyan, bold, etc)
      const prefix = style.assistantPrefix;
      lines.push(prefix + content[0]);
      
      // Continuation lines
      for (let i = 1; i < content.length; i++) {
        const continuation = style.assistantContinuation;
        lines.push(continuation + content[i]);
      }
    }
  }
  
  return lines;
}