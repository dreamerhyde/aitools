import { SessionInfo } from '../types.js';
import { 
  wrapText, 
  formatMessageCount,
  createSeparator,
  formatStatusIndicator
} from '../utils/text-formatter.js';
import { formatForBlessed, formatActionString as formatAction } from '../../../utils/text-formatter.js';
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
          // Don't set fg here - it overrides color tags!
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
        
        // Update box label with user name and model (shorten long model names)
        let modelBadge = '';
        if (session.currentModel) {
          // Shorten long model names like claude-opus-4-1-20250805 to claude-opus-4.1
          let shortModel = session.currentModel;
          if (shortModel.includes('claude-')) {
            // Extract key parts: claude-opus-4-1 -> claude-opus-4.1
            shortModel = shortModel
              .replace(/^(claude-\w+)-(\d+)-(\d+).*/, '$1-$2.$3')
              .replace('claude-', ''); // Remove claude- prefix for brevity
          }
          modelBadge = ` [${shortModel}]`;
        }
        box.setLabel(` ${session.user}${modelBadge} `);
        
        // Set border color based on status
        let borderColor = 'gray'; // Default to gray (inactive)
        
        // Debug logging for status
        if (process.env.DEBUG_SESSIONS) {
          console.log(`[Session Box] ${session.user}: status=${session.status}, currentAction=${session.currentAction}`);
        }
        
        if (session.status === 'active') {
          borderColor = '#d77757'; // Orange for active (processing)
        } else if (session.status === 'completed') {
          borderColor = 'gray'; // Gray for completed (inactive)
        } else {
          // Fallback based on currentAction
          if (!session.currentAction || session.currentAction.trim() === '') {
            borderColor = 'gray'; // No action = inactive
          } else {
            borderColor = '#d77757'; // Has action = active (orange)
          }
        }
        
        // Update border style
        box.style.border = { fg: borderColor };
        
        // Calculate box dimensions for proper text wrapping and height management
        const boxWidth = Math.floor((box.width as number) - 4);
        const boxHeight = Math.floor((box.height as number) - 2); // Account for borders
        
        // Build content - we'll manage Q and A separately for smart layout
        const contentLines: string[] = [];
        const qLines: string[] = [];      // Fixed Q section
        const aLines: string[] = [];      // Scrollable A section
        
        // Status line at top (2 lines)
        const status = formatStatusIndicator(session.lastActivity, session.status, session.currentAction);
        const messageCountStr = formatMessageCount(session.messageCount);
        contentLines.push(`${status}  │  ${messageCountStr}`);
        contentLines.push('');
        
        // Store action status to show at bottom
        let actionStatus: string | null = null;
        if (session.currentAction && session.currentAction.trim() !== '') {
          const formattedAction = formatAction(session.currentAction, 'blessed');
          actionStatus = formatActionStatus(formattedAction);
        }
        
        // Show recent Q/A messages with sticky Q at top
        if (session.recentMessages && session.recentMessages.length > 0) {
          // Find the last user question and separate Q from A
          let lastUserQuestion: typeof session.recentMessages[0] | null = null;
          const assistantMessages: typeof session.recentMessages = [];
          
          // Debug: Log message structure
          if (process.env.DEBUG_SESSIONS) {
            console.log(`[Session Box] Total messages: ${session.recentMessages.length}`);
            session.recentMessages.forEach((msg, i) => {
              // Log both role and type to see which field exists
              console.log(`  [Processing ${i}] role=${msg.role}, type=${(msg as any).type}, content length: ${msg.content.length}`);
            });
          }
          
          // Find last user question - check 'role' field instead of 'type'
          for (let i = session.recentMessages.length - 1; i >= 0; i--) {
            if (session.recentMessages[i].role === 'user') {
              lastUserQuestion = session.recentMessages[i];
              // Collect all assistant messages after this question
              for (let j = i + 1; j < session.recentMessages.length; j++) {
                if (session.recentMessages[j].role === 'assistant') {
                  assistantMessages.push(session.recentMessages[j]);
                }
              }
              break;
            }
          }
          
          if (process.env.DEBUG_SESSIONS) {
            console.log(`[Session Box] Found Q: ${lastUserQuestion ? 'Yes' : 'No'}`);
            console.log(`[Session Box] Assistant messages: ${assistantMessages.length}`);
          }
          
          // First, show the sticky Q at top (if exists)
          if (lastUserQuestion) {
            const msg = lastUserQuestion;
            
            // No separator line needed between Q and A
            
            // Apply Markdown parsing FIRST (before sanitization changes the structure)
            const markdownParsed = parseMarkdown(msg.content);
            
            // Debug logging
            if (process.env.DEBUG_EMOJI) {
              console.log(`[EMOJI DEBUG] Original: "${msg.content}"`);
              console.log(`[EMOJI DEBUG] After markdown: "${markdownParsed}"`);
            }
            
            // Then clean and format the already-parsed content for Blessed
            // For Q, we should merge multiple lines into one to avoid awkward breaks
            const cleanContent = formatForBlessed(markdownParsed, {
              preserveWhitespace: false  // Don't preserve line breaks for Q
            });
            
            // Debug logging
            if (process.env.DEBUG_EMOJI) {
              console.log(`[EMOJI DEBUG] After sanitize: "${cleanContent}"`);
              console.log(`[EMOJI DEBUG] Has ANSI codes: ${cleanContent.includes('\x1b[')}`);
            }
            
            // Special handling for user messages: limit to 2 lines with ellipsis
            // Q badge is " Q " + space = 4 visible chars
            const wrapWidth = boxWidth - 4;
            const allWrappedLines = wrapText(cleanContent, wrapWidth);
            
            let wrappedLines: string[];
            // Limit user message to max 2 lines
            if (allWrappedLines.length > 2) {
              wrappedLines = allWrappedLines.slice(0, 2);
              // Add ellipsis to the second line
              const secondLine = wrappedLines[1];
              if (secondLine.length > 3) {
                wrappedLines[1] = secondLine.substring(0, secondLine.length - 3) + '...';
              } else {
                wrappedLines[1] = '...';
              }
            } else {
              wrappedLines = allWrappedLines;
            }
            
            // Format the Q with proper styling and store separately
            const formattedQ = formatQAMessage('user', wrappedLines, this.qaStyle, session.status);
            qLines.push(...formattedQ);
            // No extra space after Q - let A content flow naturally
          }
          
          // Then show all assistant messages below
          for (let j = 0; j < assistantMessages.length; j++) {
            const msg = assistantMessages[j];
            
            // Apply Markdown parsing
            const markdownParsed = parseMarkdown(msg.content);
            const cleanContent = formatForBlessed(markdownParsed, {
              preserveWhitespace: true
            });
            
            // Assistant messages show full content
            const wrapWidth = boxWidth - 2; // > = 2 chars
            const wrappedLines = wrapText(cleanContent, wrapWidth);
            
            // Check if this is a continuation of previous assistant messages
            const isAssistantContinuation = j > 0;
            
            // Format assistant message
            let formattedLines: string[];
            if (isAssistantContinuation) {
              // Continuation lines (no > prefix)
              formattedLines = wrappedLines.map(line => 
                this.qaStyle.assistantContinuation + line
              );
            } else {
              // First assistant message with > prefix
              formattedLines = formatQAMessage('assistant', wrappedLines, this.qaStyle, session.status);
            }
            
            aLines.push(...formattedLines);
            
            // Add spacing between assistant messages if needed
            if (j < assistantMessages.length - 1) {
              aLines.push('');
            }
          }
        } else if (session.currentTopic) {
          // Fall back to showing topic if no recent messages
          qLines.push('{cyan-fg}Topic:{/cyan-fg}');
          qLines.push(createSeparator(boxWidth));
          
          const sanitizedTopic = formatForBlessed(session.currentTopic, {
            preserveWhitespace: false
          });
          const wrappedTopic = wrapText(sanitizedTopic, boxWidth);
          // Show all lines of the topic, no limit
          for (const line of wrappedTopic) {
            qLines.push(line);
          }
        } else {
          qLines.push('{gray-fg}No recent activity{/gray-fg}');
        }
        
        // Note: reservedLines calculation removed as we now show all content
        // and rely on scrolling for overflow
        
        // Calculate available space for scrollable content
        const availableHeight = boxHeight - 2; // Account for borders
        
        // Smart content assembly to simulate sticky Q:
        // We need to ensure Q is always visible even when scrolled to bottom
        
        // Calculate how much space Q needs (already in qLines)
        const qHeight = qLines.length;
        
        // Calculate how much space is left for A content (account for separator line between Q and A)
        const spaceForA = Math.max(3, availableHeight - qHeight - 1 - (actionStatus ? 2 : 0));
        
        // Build final content:
        // 1. Always include Q at the top
        if (qLines.length > 0) {
          contentLines.push(...qLines);
          contentLines.push(''); // Add empty line between Q and A
        }
        
        // 2. Handle A content based on available space
        if (aLines.length > 0) {
          if (aLines.length > spaceForA) {
            // A content exceeds available space
            // Show indicator that there's more content above (aligned with assistant prefix)
            contentLines.push('{gray-fg}> ...{/gray-fg}');
            
            // Show only the most recent A lines that fit
            const startIdx = aLines.length - spaceForA + 1; // +1 for the indicator line
            contentLines.push(...aLines.slice(startIdx));
          } else {
            // All A content fits
            contentLines.push(...aLines);
          }
        }
        
        // 3. Add action status right after the last message (not at bottom)
        if (actionStatus) {
          // Add one blank line then the status
          contentLines.push('');
          contentLines.push(actionStatus);
        }
        
        // Set content - it should fit within the visible area
        box.setContent(contentLines.join('\n'));
        
        // No scrolling needed - content is pre-trimmed to fit
        box.setScrollPerc(0);
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