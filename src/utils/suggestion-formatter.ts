import chalk from 'chalk';

export class SuggestionFormatter {
  /**
   * Display a formatted suggestion with consistent styling
   * @param suggestion The suggestion text to display
   * @param showLabel Whether to show "Suggested Action" label (for human-readable output)
   */
  static show(suggestion: string, showLabel: boolean = true): void {
    if (showLabel) {
      // Human-readable format with label and separator
      console.log('\n' + chalk.bold('Suggested Action'));
      console.log(chalk.hex('#303030')('─'.repeat(30)));
      console.log(chalk.yellow('▪') + ' ' + suggestion);
    } else {
      // AI-readable format without label
      console.log('\n' + suggestion);
    }
  }

  /**
   * Format suggestion text with command highlighting
   * @param text The main text
   * @param command Optional command to highlight
   */
  static format(text: string, command?: string): string {
    if (command) {
      return text.replace(command, chalk.cyan(command));
    }
    return text;
  }

  // Common suggestions
  static readonly LINT_FIX = 'Run `aitools lint --fix` to auto-fix ESLint issues, then manually fix remaining TypeScript errors.';
  static readonly REFACTOR_LINES = 'Consider extracting utility functions, splitting into modules, or refactoring these files to improve maintainability.';
}