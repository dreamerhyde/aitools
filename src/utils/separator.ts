import chalk from 'chalk';

/**
 * Unified separator line utility for consistent UI across the application
 * Matches the style used in lint command's Check Summary
 */
export class Separator {
    /**
     * Creates a separator line with consistent styling
     * @param length - The length of the separator (default: 30, or terminal width if available)
     * @returns Styled separator string
     */
    static line(length?: number): string {
        const width = length || process.stdout.columns || 30;
        return chalk.hex('#344149')('─'.repeat(width));
    }

    /**
     * Creates a short separator (30 chars) - commonly used for section headers
     */
    static short(): string {
        return chalk.hex('#344149')('─'.repeat(30));
    }

    /**
     * Creates a full-width separator based on terminal width
     */
    static full(): string {
        const width = process.stdout.columns || 80;
        return chalk.hex('#344149')('─'.repeat(width));
    }
}
