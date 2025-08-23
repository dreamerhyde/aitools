export interface GitChanges {
  files: number;
  insertions: number;
  deletions: number;
  summary: string;
}

export interface TaskNotification {
  project: string;
  branch: string;
  spent: string;
  changes: GitChanges;
  finished: string;
  message: string;
}

export interface SlackMessage {
  text?: string;
  blocks?: SlackBlock[];
  attachments?: any[];
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
  accessory?: any;
}

export interface NotificationConfig {
  enabled: boolean;
  on_success: boolean;
  on_error: boolean;
  include_changes: boolean;
  include_summary: boolean;
}