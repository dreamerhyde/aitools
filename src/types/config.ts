export interface AiToolsConfig {
  // Auto update settings
  auto_update?: boolean;
  completion?: boolean;

  // API Settings
  openai_api_key?: string;
  slack_webhook_url?: string;
  model?: string;  // OpenAI GPT model (gpt-5, gpt-5-mini, gpt-5-nano, gpt-4o, gpt-3.5-turbo)

  // Quality Rules
  line_limit?: number;
  lint_on_hook?: boolean;
  lines_on_hook?: boolean;

  // Hooks Settings
  hooks?: {
    global?: boolean;
    notification?: boolean;
    auto_fix?: boolean;
  };

  // README Generation
  readme?: {
    include_badges?: boolean;
    include_installation?: boolean;
  };

  // Notification Settings
  notifications?: {
    enabled?: boolean;
    on_success?: boolean;
    on_error?: boolean;
    include_changes?: boolean;
    include_summary?: boolean;
  };

  // File Ignore Patterns
  ignore?: {
    all?: string[];      // Global ignore patterns (applies to all commands)
    tree?: string[];     // Tree/files command specific
    lines?: string[];    // Lines check specific
    lint?: string[];     // Lint specific
  };
}

export const defaultConfig: AiToolsConfig = {
  auto_update: true,
  completion: true,
  model: 'gpt-5',  // Updated to latest GPT-5 model
  line_limit: 500,
  lint_on_hook: true,
  lines_on_hook: true,
  hooks: {
    global: false,
    notification: true,
    auto_fix: false
  },
  readme: {
    include_badges: true,
    include_installation: true
  },
  notifications: {
    enabled: true,
    on_success: true,
    on_error: true,
    include_changes: true,
    include_summary: true
  },
  ignore: {
    all: ['node_modules/', '.git/', '*.log', '.DS_Store'],
    tree: ['dist/', 'build/', 'coverage/', '.next/'],
    lines: [],
    lint: []
  }
};