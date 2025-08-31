import { SessionInfo } from '../types.js';
import { 
  truncateText, 
  wrapText, 
  formatMessageCount,
  createSeparator,
  formatStatusIndicator
} from '../utils/text-formatter.js';
import { sanitizeText, formatActionString } from '../../../utils/text-sanitizer.js';
import { QAStyleType, getQAStyle, formatQAMessage } from '../utils/qa-styles.js';
import { formatActionStatus, parseMarkdown } from '../utils/style-system.js';

export class SessionBoxesView {
  private sessionBoxes: any[] = []; // Fixed 4 boxes
  private screenManager: any;
  private grid: any;
  private blessed: any;
  private qaStyle = getQAStyle(QAStyleType.HYBRID); // Default to hybrid style (Q badge, A arrow)

  constructor(screenManager: any, grid: any, blessed: any) {
    this.screenManager = screenManager;
    this.grid = grid;
    this.blessed = blessed;
    this.initialize();
  }

  private initialize(): void {
    const screen = this.screenManager.getScreen();
    
    // Create 4 session boxes in 2x2 layout below the main fixed areas
    // Fixed areas end at top: 32 (Today's Spend + 30-Day = 20 + 12)
    const startTop = 32;
    
    // Check if there's enough space for session boxes (minimum height 10 per box)
    const screenHeight = screen.height;
    const availableHeight = screenHeight - startTop - 1; // -1 for status bar
    const minBoxHeight = 10;
    
    // If not enough space, don't create session boxes
    // Need at least 20 total height for 2 rows of boxes (10 * 2)
    if (availableHeight < minBoxHeight * 2) {
      return; // Don't create boxes if too small
    }
    
    // Calculate equal heights for 2x2 layout
    const remainingHeight = screenHeight - startTop - 1; // -1 for status bar
    const boxHeight = Math.floor(remainingHeight / 2);
    const midPoint = startTop + boxHeight;
    
    // 2x2 layout: left-right, left-right  
    const positions = [
      { top: startTop, left: '0%', width: '50%', height: boxHeight },     // Top-left
      { top: startTop, left: '50%', width: '50%', height: boxHeight },    // Top-right  
      { top: midPoint, left: '0%', width: '50%', height: boxHeight },     // Bottom-left
      { top: midPoint, left: '50%', width: '50%', height: boxHeight }     // Bottom-right
    ];
    
    for (let i = 0; i < 4; i++) {
      const pos = positions[i];
      const box = this.blessed.box({
        parent: screen,
        top: pos.top,
        left: pos.left,
        width: pos.width,
        height: pos.height, // Equal height for all boxes
        label: ` Session ${i + 1} `,
        border: { type: 'line', fg: 'gray' },
        style: {
          fg: 'white',
          border: { fg: 'gray' }
        },
        tags: true,
        wrap: true,
        scrollable: true,
        alwaysScroll: true,
        mouse: true,
        padding: {
          left: 1,
          right: 1,
          top: 0,
          bottom: 0
        }
      });
      
      // Initially show empty state
      box.setContent('{gray-fg}No active conversation{/gray-fg}');
      this.sessionBoxes.push(box);
    }
  }

  updateSessionBoxes(activeSessions: Map<string, SessionInfo>): void {
    // If no boxes were created due to size constraints, return early
    if (this.sessionBoxes.length === 0) {
      return;
    }
    
    const now = new Date();
    const sessions = Array.from(activeSessions.values())
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
      .slice(0, 4); // Take first 4 most recent sessions
    
    // Clean up inactive sessions (older than 30 minutes)
    for (const [id, session] of activeSessions) {
      const minutesInactive = (now.getTime() - session.lastActivity.getTime()) / 60000;
      if (minutesInactive > 30) {
        activeSessions.delete(id);
      }
    }
    
    // Update each of the 4 boxes
    for (let i = 0; i < 4; i++) {
      const box = this.sessionBoxes[i];
      
      if (i < sessions.length) {
        const session = sessions[i];
        
        // Update box label with user name and model
        const modelBadge = session.currentModel ? ` [${session.currentModel}]` : '';
        box.setLabel(` ${session.user}${modelBadge} `);
        
        // Set border color based on status
        let borderColor = 'gray';
        
        // Debug logging for status
        if (process.env.DEBUG_SESSIONS) {
          console.log(`[Session Box] ${session.user}: status=${session.status}, currentAction=${session.currentAction}`);
        }
        
        if (session.status === 'active') {
          borderColor = '#d77757'; // Orange for active
        } else if (session.status === 'completed') {
          borderColor = 'green'; // Green for completed
        } else {
          // Fallback: if no current action, assume completed
          if (!session.currentAction || session.currentAction.trim() === '') {
            borderColor = 'green';
          }
        }
        
        // Update border style
        box.style.border = { fg: borderColor };
        
        // Calculate box width for proper text wrapping (accounting for padding)
        const boxWidth = Math.floor((box.width as number) - 4);
        
        // Build content
        const contentLines: string[] = [];
        
        // Status line
        const status = formatStatusIndicator(session.lastActivity);
        const messageCountStr = formatMessageCount(session.messageCount);
        contentLines.push(`${status}  │  ${messageCountStr}`);
        contentLines.push('');
        
        // Show current action if present (like "Puttering..." when AI is working)
        if (session.currentAction && session.currentAction.trim() !== '') {
          const sanitizedAction = formatActionString(session.currentAction);
          // Use the new formatActionStatus with code block style
          contentLines.push(formatActionStatus(sanitizedAction));
          contentLines.push('');
        }
        
        // Show recent Q/A messages
        if (session.recentMessages && session.recentMessages.length > 0) {
          // Remove the "Recent conversation:" label and separator
          // contentLines.push('{cyan-fg}Recent conversation:{/cyan-fg}');
          // contentLines.push(createSeparator(boxWidth));
          
          // Display last 3 Q/A pairs
          const messagesToShow = session.recentMessages.slice(-6); // Last 3 Q/A pairs
          
          for (let j = 0; j < messagesToShow.length; j++) {
            const msg = messagesToShow[j];
            
            // Add empty line before each new question (except the first one)
            if (msg.role === 'user' && j > 0) {
              contentLines.push(''); // Empty line for visual separation
            }
            
            // Apply Markdown parsing FIRST (before sanitization changes the structure)
            const markdownParsed = parseMarkdown(msg.content);
            
            // Then clean and sanitize the already-parsed content
            const cleanContent = sanitizeText(markdownParsed, {
              removeEmojis: true,
              convertToAscii: true,
              preserveWhitespace: true  // Keep line breaks
            });
            
            // No truncation for AI responses, keep full content
            const contentToWrap = msg.role === 'assistant' ? cleanContent : truncateText(cleanContent, boxWidth * 4);
            // Different wrap width for user (Q badge = 5 chars) vs assistant (> = 2 chars)
            const wrapWidth = msg.role === 'user' ? boxWidth - 5 : boxWidth - 2;
            const wrappedLines = wrapText(contentToWrap, wrapWidth);
            
            // No line limit for AI responses, limit user messages to 4 lines
            const linesToShow = msg.role === 'assistant' ? wrappedLines : wrappedLines.slice(0, 4);
            const formattedLines = formatQAMessage(msg.role, linesToShow, this.qaStyle, session.status);
            contentLines.push(...formattedLines);
            
            // Add empty line after each question for better spacing
            if (msg.role === 'user') {
              contentLines.push(''); // Empty line after question
            }
            
            // Add separator between Q/A pairs (if style has one)
            if (j < messagesToShow.length - 1 && msg.role === 'assistant' && this.qaStyle.separator) {
              contentLines.push(this.qaStyle.separator);
            }
          }
        } else if (session.currentTopic) {
          // Fall back to showing topic if no recent messages
          contentLines.push('{cyan-fg}Topic:{/cyan-fg}');
          contentLines.push(createSeparator(boxWidth));
          
          const sanitizedTopic = sanitizeText(session.currentTopic, {
            removeEmojis: true,
            convertToAscii: true,
            preserveWhitespace: false
          });
          const wrappedTopic = wrapText(sanitizedTopic, boxWidth);
          for (const line of wrappedTopic.slice(0, 3)) {
            contentLines.push(line);
          }
        } else {
          contentLines.push('{gray-fg}No recent activity{/gray-fg}');
        }
        
        box.setContent(contentLines.join('\n'));
        // Auto-scroll to bottom to show latest messages
        // Use nextTick to ensure content is rendered before scrolling
        process.nextTick(() => {
          box.setScrollPerc(100);
        });
      } else {
        // Empty box
        box.setLabel(` Session ${i + 1} `);
        box.setContent('{gray-fg}No active conversation{/gray-fg}');
      }
    }
  }

  /**
   * Change the Q/A display style
   * @param styleType The style to use for Q/A messages
   */
  setQAStyle(styleType: QAStyleType): void {
    this.qaStyle = getQAStyle(styleType);
  }

  /**
   * Cycle through available Q/A styles
   */
  cycleQAStyle(): void {
    const styles = Object.values(QAStyleType);
    const currentIndex = styles.indexOf(this.qaStyle.description as QAStyleType);
    const nextIndex = (currentIndex + 1) % styles.length;
    this.setQAStyle(styles[nextIndex]);
  }

  destroy(): void {
    for (const box of this.sessionBoxes) {
      box.destroy();
    }
    this.sessionBoxes = [];
  }
}