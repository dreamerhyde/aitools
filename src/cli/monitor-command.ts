import { Command } from 'commander';
import { UIHelper } from '../utils/ui.js';

// Conditionally import the right monitor implementation
const getMonitorCommand = async () => {
  // Check if running in development mode (source files)
  const isDev = process.argv[1]?.endsWith('.ts') || process.env.NODE_ENV === 'development';
  
  if (isDev) {
    // In dev mode, use the full monitor with blessed
    const { MonitorCommand } = await import('../commands/monitor-command.js');
    return MonitorCommand;
  } else {
    // In production/bundled mode, use the stub
    const { MonitorCommand } = await import('../commands/monitor-stub.js');
    return MonitorCommand;
  }
};

export function setupMonitorCommand(program: Command): void {
  const monitor = program
    .command('monitor')
    .alias('m')
    .description('Real-time Claude Code session monitor (TUI dashboard)')
    .option('-r, --refresh <seconds>', 'Refresh interval in seconds', '2')
    .option('--no-color', 'Disable colored output')
    .action(async (options) => {
      try {
        const MonitorCommand = await getMonitorCommand();
        const command = new MonitorCommand();
        await command.execute();
      } catch (error: any) {
        UIHelper.showError(`Monitor failed: ${error.message}`);
        process.exit(1);
      }
    });

  // Add examples to help
  monitor.addHelpText('after', `
Examples:
  $ ai monitor              # Start real-time monitoring dashboard
  $ ai m                    # Short alias for monitor
  $ ai monitor -r 5         # Update every 5 seconds

Keyboard Controls:
  q         - Quit
  k         - Kill selected process
  r         - Refresh data
  ↑/↓       - Navigate processes
  Enter     - View process details
  
Dashboard Sections:
  - Active Sessions: Live Claude Code sessions and hooks
  - Cost Summary: Today/Week/Month costs with trends
  - Session Metrics: Active sessions, tokens, and usage
  - Live Activity: Real-time log of new sessions
`);
}