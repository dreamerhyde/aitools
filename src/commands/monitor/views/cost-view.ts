import chalk from 'chalk';
import * as figlet from 'figlet';
import { CostMetrics, DailyUsage, SessionInfo } from '../types.js';
import { formatNumber } from '../../../utils/formatters.js';
import { ChartGenerator } from '../../../utils/chart-generator.js';
import { sanitizeText } from '../../../utils/text-sanitizer.js';

export class CostView {
    private costBox: any;
    private costTrendChart: any;
    private screenManager: any;
    private grid: any;
    private currentFontIndex: number = 0;
    private allFonts: figlet.Fonts[] = [
        'ANSI Shadow',
        'Big',
        'Standard',
        'Small',
        'Slant',
    ];

    constructor(screenManager: any, grid: any) {
        this.screenManager = screenManager;
        this.grid = grid;
    }

    initialize(): void {
        const blessed = this.screenManager.getBlessed();
        const screen = this.screenManager.getScreen();

        // Today's Spend box - fixed height 20 lines
        this.costBox = blessed.box({
            parent: screen,
            top: 0,
            left: 0,
            width: '66%', // 8/12 columns
            height: 20, // Fixed height
            label: " Today's Spend ",
            border: { type: 'line', fg: 'gray' },
            style: {
                fg: 'white',
                border: { fg: 'gray' },
            },
            align: 'left', // Changed to left for powered by alignment
            valign: 'top', // Change to top to control layout manually
            padding: {
                top: 1,
                bottom: 0,
                left: 0,
                right: 0,
            },
        });

        // 30-Day Cost Trend - fixed height 12 lines
        this.costTrendChart = blessed.box({
            parent: screen,
            top: 20, // Start after Today's Spend (now height 20)
            left: 0,
            width: '66%', // 8/12 columns
            height: 12, // Fixed height
            label: ' 30-Day Cost Trend ',
            border: { type: 'line', fg: 'gray' },
            style: {
                fg: 'white',
                border: { fg: 'gray' },
            },
            align: 'center', // Center align content
            tags: true,
            padding: {
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
            },
        });
    }

    updateCostDisplay(
        metrics: CostMetrics | null,
        activeSessions: Map<string, SessionInfo>,
    ): void {
        if (!this.costBox || !metrics) return;

        const cost = metrics.today;
        const sessions = metrics.todaySessions;
        const tokens = formatNumber(metrics.todayTokens);

        // Get the most recent model
        let currentModel = 'No activity';

        // Priority 1: Use today's model from metrics if available
        if (metrics.todayModel) {
            const cleanModel = metrics.todayModel
                .replace('claude-', '')
                .replace('-20', '-')
                .replace('241022', '')
                .replace('240805', '') // Remove date stamps
                .replace('20240805', ''); // Remove full date format
            currentModel = sanitizeText(cleanModel, {
                removeEmojis: true,
                convertToAscii: true,
            });
        }
        // Priority 2: Get from active sessions
        else if (activeSessions.size > 0) {
            const recentSession = Array.from(activeSessions.values())
                .filter((session) => session.currentModel)
                .sort(
                    (a, b) =>
                        b.lastActivity.getTime() - a.lastActivity.getTime(),
                )[0];

            if (recentSession && recentSession.currentModel) {
                const cleanModel = recentSession.currentModel
                    .replace('claude-', '')
                    .replace('-20', '-')
                    .replace('241022', '')
                    .replace('240805', '')
                    .replace('20240805', '');
                currentModel = sanitizeText(cleanModel, {
                    removeEmojis: true,
                    convertToAscii: true,
                });
            }
        }
        // Priority 3: Show activity detected if we have sessions but no model info
        else if (metrics.todaySessions > 0) {
            currentModel = 'Activity today';
        }

        // Create figlet ASCII art with space between $ and amount
        const costStr = `$ ${cost.toFixed(2)}`;

        try {
            // Use current selected font
            const selectedFont = this.allFonts[this.currentFontIndex];
            const figletOptions = {
                font: selectedFont as figlet.Fonts,
                horizontalLayout: 'default' as figlet.KerningMethods,
                verticalLayout: 'default' as figlet.KerningMethods,
            };

            const bigCost = figlet.textSync(costStr, figletOptions);

            // Apply green color to the big cost display
            const coloredCost = chalk.green.bold(bigCost);

            // Add powered by text at the bottom left corner (very dim)
            const poweredBy = chalk.gray.dim.italic(
                ' powered by @dreamerhyde/aitools',
            );

            // Split the figlet text into lines
            const figletLinesArray = bigCost.split('\n');
            const figletLines = figletLinesArray.length;

            // Box has height 20, with padding top 1, so we have 18 lines usable
            // Build an array of all 18 lines
            const lines: string[] = new Array(18).fill('');

            // Calculate vertical center for main content
            const mainContentLines = figletLines + 3; // figlet + 1 blank + stats + model
            const startLine = Math.floor((18 - mainContentLines) / 2) + 1; // +1 to move down a bit

            // Get actual box width for accurate centering
            const boxWidth = (this.costBox.width as number) || 80;

            // Helper function to center text based on actual box width
            const centerText = (text: string): string => {
                // Remove ANSI codes and blessed tags for accurate length calculation
                const cleanText = text
                    .replace(/\x1b\[[0-9;]*m/g, '')
                    .replace(/\{[^}]+\}/g, '');
                const textLength = cleanText.length;
                const padding = Math.max(
                    0,
                    Math.floor((boxWidth - textLength) / 2),
                );
                return ' '.repeat(padding) + text;
            };

            // Place figlet art (centered)
            // For figlet, center based on its actual content width
            let currentLine = startLine;
            const maxFigletWidth = Math.max(
                ...figletLinesArray.map((l) => l.length),
            );
            const figletPadding = Math.max(
                0,
                Math.floor((boxWidth - maxFigletWidth) / 2),
            );

            figletLinesArray.forEach((line) => {
                if (currentLine < 18) {
                    lines[currentLine] =
                        ' '.repeat(figletPadding) + chalk.green.bold(line);
                    currentLine++;
                }
            });

            // Skip 1 line for spacing (reduced from 2)
            currentLine += 1;

            // Place sessions and tokens (centered)
            if (currentLine < 18) {
                const statsText = `${chalk.cyan(
                    sessions + ' sessions',
                )} | ${chalk.yellow(tokens + ' tokens')}`;
                lines[currentLine] = centerText(statsText);
                currentLine++;
            }

            // Skip 1 line
            currentLine += 1;

            // Place model info (centered)
            if (currentLine < 18) {
                const modelText = `${chalk.magenta(
                    'Model:',
                )} ${chalk.white.bold(currentModel)}`;
                lines[currentLine] = centerText(modelText);
            }

            // Place powered by at line 16 (0-indexed) to ensure it's visible
            lines[16] = poweredBy;

            // Join all lines and set content
            this.costBox.setContent(lines.join('\n'));
        } catch (error) {
            // Fallback to simple display if figlet fails
            const poweredBy = chalk.gray.dim.italic(
                '  powered by @dreamerhyde/aitools',
            );

            // Build an array of all 18 lines
            const lines: string[] = new Array(18).fill('');

            // Get actual box width for accurate centering
            const boxWidth = (this.costBox.width as number) || 80;

            // Helper function to center text
            const centerText = (text: string): string => {
                const cleanText = text
                    .replace(/\x1b\[[0-9;]*m/g, '')
                    .replace(/\{[^}]+\}/g, '');
                const textLength = cleanText.length;
                const padding = Math.max(
                    0,
                    Math.floor((boxWidth - textLength) / 2),
                );
                return ' '.repeat(padding) + text;
            };

            // Center the simple content
            const startLine = 6; // Start around middle

            lines[startLine] = centerText(
                chalk.green.bold('$ ' + cost.toFixed(2)),
            );
            lines[startLine + 2] = centerText(
                `${sessions} sessions | ${tokens} tokens`,
            );
            lines[startLine + 4] = centerText(
                `Model: ${chalk.bold(currentModel)}`,
            );

            // Place powered by at line 16 to ensure it's visible
            lines[16] = poweredBy;

            this.costBox.setContent(lines.join('\n'));
        }

        this.screenManager.render();
    }

    updateTrendChart(dailyUsage?: DailyUsage[], metrics?: CostMetrics): void {
        if (!this.costTrendChart || !metrics) return;

        // Get box dimensions - use full available space
        const boxWidth = (this.costTrendChart.width as number) || 60;
        const boxHeight = (this.costTrendChart.height as number) || 10;

        // Prepare cost data map from the last 30 days
        const costData = new Map<string, number>();

        // Build cost map from actual data
        if (dailyUsage) {
            dailyUsage.forEach((day) => {
                costData.set(day.date, day.totalCost);
            });
        }

        // Generate continuous 30 days using the shared utility
        const chartData = ChartGenerator.generateContinuous30Days(costData);

        // Calculate chart width to fill the entire box
        const chartWidth = Math.max(30, boxWidth - 2 - 6);

        // Generate chart with full width
        const chartLines = ChartGenerator.generateBarChart(chartData, {
            width: chartWidth,
            height: Math.max(6, boxHeight - 4),
            barWidth: 2,
            showDates: true,
            fullDates: true,
        });

        // Set content directly without extra padding
        // The chart uses blessed tags for colors, so we need to parse them
        const chartContent = chartLines.join('\n');
        this.costTrendChart.setContent(chartContent);
        this.screenManager.render();
    }

    rotateFont(): void {
        this.currentFontIndex =
            (this.currentFontIndex + 1) % this.allFonts.length;
    }

    destroy(): void {
        // Cleanup if needed
    }
}
