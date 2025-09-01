/**
 * Enhanced status tracking system for Claude Code sessions
 * Provides dynamic status updates with activeForm support
 */

import { formatActionString } from './text-sanitizer.js';

export interface TaskStatus {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
  timestamp?: Date;
  progress?: number;
}

export interface SessionStatus {
  sessionId: string;
  currentAction?: string;
  currentTask?: TaskStatus;
  isActive: boolean;
  lastUpdate: Date;
  messageCount: number;
}

/**
 * Status tracker for managing session states
 */
export class StatusTracker {
  private sessionStates: Map<string, SessionStatus> = new Map();
  private activeTaskMapping: Map<string, string> = new Map();

  /**
   * Enhanced tool to activeForm mapping
   */
  private toolToActiveFormMapping: Record<string, string> = {
    // File operations
    'Read': '讀取檔案中',
    'Write': '寫入檔案中', 
    'Edit': '編輯檔案中',
    'MultiEdit': '批次編輯檔案中',
    'Glob': '搜尋檔案中',
    'Grep': '檔案內容搜尋中',
    'LS': '列出目錄內容中',
    
    // Command operations
    'Bash': '執行指令中',
    'BashOutput': '讀取輸出中',
    'KillBash': '終止程序中',
    
    // Web operations
    'WebFetch': '擷取網頁內容中',
    'WebSearch': '搜尋網路中',
    
    // Task management  
    'TodoWrite': '更新待辦事項中',
    'Task': '執行代理任務中',
    'ExitPlanMode': '規劃任務中',
    
    // Development tools
    'NotebookEdit': '編輯筆記本中',
    
    // MCP tools
    'mcp__Sequential_Thinking__sequentialthinking': '思考中',
    'mcp__Shrimp__plan_task': '規劃任務中',
    'mcp__Shrimp__analyze_task': '分析任務中',
    'mcp__File_System__write_file': '寫入檔案中',
    'mcp__File_System__read_file': '讀取檔案中',
    'mcp__File_System__edit_file': '編輯檔案中',
    'mcp__File_System__search_files': '搜尋檔案中',
    'mcp__Supabase__execute_sql': '執行 SQL 中',
    'mcp__Context_7__get-library-docs': '取得文檔中',
    'mcp__Browser_Tools__takeScreenshot': '截圖中',
    'mcp___21st-dev_magic__21st_magic_component_builder': '建立元件中',
    
    // Generic states
    'default': '處理中'
  };

  /**
   * Update session status based on tool usage
   */
  updateSessionStatus(
    sessionId: string, 
    toolName: string | null, 
    messageCount: number = 0
  ): void {
    const currentStatus = this.sessionStates.get(sessionId) || {
      sessionId,
      isActive: false,
      lastUpdate: new Date(),
      messageCount: 0
    };

    if (toolName) {
      const activeForm = this.toolToActiveFormMapping[toolName] || this.toolToActiveFormMapping['default'];
      const currentAction = formatActionString(activeForm);
      
      currentStatus.currentAction = currentAction;
      currentStatus.isActive = true;
      currentStatus.lastUpdate = new Date();
      currentStatus.messageCount = messageCount;
    } else {
      // Clear active status when no tool is being used
      currentStatus.currentAction = undefined;
      currentStatus.isActive = false;
    }

    this.sessionStates.set(sessionId, currentStatus);
  }

  /**
   * Update task status with activeForm
   */
  updateTaskStatus(sessionId: string, task: TaskStatus): void {
    const currentStatus = this.sessionStates.get(sessionId) || {
      sessionId,
      isActive: false,
      lastUpdate: new Date(),
      messageCount: 0
    };

    currentStatus.currentTask = task;
    currentStatus.isActive = task.status === 'in_progress';
    currentStatus.lastUpdate = new Date();

    this.sessionStates.set(sessionId, currentStatus);
  }

  /**
   * Get formatted status display
   */
  getStatusDisplay(sessionId: string): {
    text: string;
    color: 'green' | 'yellow' | 'cyan' | 'blue' | 'magenta';
    isActive: boolean;
  } {
    const status = this.sessionStates.get(sessionId);
    
    if (!status) {
      return {
        text: '閒置中',
        color: 'cyan',
        isActive: false
      };
    }

    // If there's an active task, use its activeForm
    if (status.currentTask && status.currentTask.status === 'in_progress') {
      return {
        text: status.currentTask.activeForm,
        color: 'yellow',
        isActive: true
      };
    }

    // If there's a current action, use it
    if (status.currentAction) {
      return {
        text: status.currentAction,
        color: getActionColor(),
        isActive: status.isActive
      };
    }

    // Default idle state
    return {
      text: '等待中',
      color: 'cyan',
      isActive: false
    };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SessionStatus[] {
    const now = new Date();
    const fiveMinutesAgo = now.getTime() - 5 * 60 * 1000;

    return Array.from(this.sessionStates.values())
      .filter(status => status.isActive && status.lastUpdate.getTime() > fiveMinutesAgo)
      .sort((a, b) => b.lastUpdate.getTime() - a.lastUpdate.getTime());
  }

  /**
   * Clean up old inactive sessions
   */
  cleanup(): void {
    const now = new Date();
    const thirtyMinutesAgo = now.getTime() - 30 * 60 * 1000;

    for (const [sessionId, status] of this.sessionStates) {
      if (status.lastUpdate.getTime() < thirtyMinutesAgo) {
        this.sessionStates.delete(sessionId);
      }
    }
  }

  /**
   * Get session count by status
   */
  getSessionCounts(): {
    active: number;
    total: number;
    thinking: number;
    working: number;
  } {
    const sessions = Array.from(this.sessionStates.values());
    const active = sessions.filter(s => s.isActive).length;
    const thinking = sessions.filter(s => 
      s.currentAction?.toLowerCase().includes('thinking') ||
      s.currentAction?.toLowerCase().includes('analyzing') ||
      s.currentAction?.toLowerCase().includes('planning')
    ).length;
    const working = sessions.filter(s => 
      s.isActive && !s.currentAction?.toLowerCase().includes('thinking')
    ).length;

    return {
      active,
      total: sessions.length,
      thinking,
      working
    };
  }
}

// Export a singleton instance
export const statusTracker = new StatusTracker();