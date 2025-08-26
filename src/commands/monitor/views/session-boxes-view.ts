import chalk from 'chalk';
import { SessionInfo } from '../types.js';
import { 
  truncateText, 
  wrapText, 
  formatElapsedTime, 
  formatMessageCount,
  createSeparator,
  formatStatusIndicator
} from '../utils/text-formatter.js';

export class SessionBoxesView {
  private sessionBoxes: any[] = []; // Fixed 4 boxes
  private screenManager: any;
  private grid: any;
  private blessed: any;

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
    
    // Check if there's enough space for session boxes (minimum height 10)
    const screenHeight = screen.height;
    const availableHeight = screenHeight - startTop - 1; // -1 for status bar
    const minBoxHeight = 10;
    
    // If not enough space, don't create session boxes
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
      box.setContent(chalk.gray('No active conversation'));
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
        if (session.currentAction) {
          // Add a pulsing indicator for active work
          const actionIndicator = '* ';
          contentLines.push(`{yellow-fg}${actionIndicator}${session.currentAction}... (esc to interrupt){/yellow-fg}`);
          contentLines.push('');
        }
        
        // Show recent Q/A messages
        if (session.recentMessages && session.recentMessages.length > 0) {
          contentLines.push('{cyan-fg}Recent conversation:{/cyan-fg}');
          contentLines.push(createSeparator(boxWidth));
          
          // Display last 3 Q/A pairs
          const messagesToShow = session.recentMessages.slice(-6); // Last 3 Q/A pairs
          
          for (let j = 0; j < messagesToShow.length; j++) {
            const msg = messagesToShow[j];
            const prefix = msg.role === 'user' ? '{cyan-fg}Q:{/cyan-fg} ' : '{white-fg}A:{/white-fg} ';
            
            // Clean and truncate the message content
            const cleanContent = msg.content
              .replace(/\r\n/g, ' ')
              .replace(/\n+/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            
            const truncatedContent = truncateText(cleanContent, boxWidth * 2); // Allow 2 lines worth
            const wrappedLines = wrapText(truncatedContent, boxWidth - 3); // Account for "Q: " or "A: "
            
            // Add first line with prefix
            if (wrappedLines.length > 0) {
              contentLines.push(prefix + wrappedLines[0]);
              
              // Add remaining wrapped lines with indent
              for (let k = 1; k < Math.min(wrappedLines.length, 2); k++) {
                contentLines.push('   ' + wrappedLines[k]);
              }
            }
            
            // Add separator between Q/A pairs
            if (j < messagesToShow.length - 1 && msg.role === 'assistant') {
              contentLines.push('');
            }
          }
        } else if (session.currentTopic) {
          // Fall back to showing topic if no recent messages
          contentLines.push('{cyan-fg}Topic:{/cyan-fg}');
          contentLines.push(createSeparator(boxWidth));
          
          const wrappedTopic = wrapText(session.currentTopic, boxWidth);
          for (const line of wrappedTopic.slice(0, 3)) {
            contentLines.push(line);
          }
        } else {
          contentLines.push('{gray-fg}No recent activity{/gray-fg}');
        }
        
        box.setContent(contentLines.join('\n'));
      } else {
        // Empty box
        box.setLabel(` Session ${i + 1} `);
        box.setContent('{gray-fg}No active conversation{/gray-fg}');
      }
    }
  }

  destroy(): void {
    for (const box of this.sessionBoxes.values()) {
      box.destroy();
    }
    this.sessionBoxes.clear();
  }
}