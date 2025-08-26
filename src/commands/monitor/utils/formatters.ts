import chalk from 'chalk';
import { DailyUsage } from '../types.js';

export function createMiniBar(value: number, max: number, width: number): string {
  const percentage = Math.min(value / max, 1);
  const filled = Math.round(percentage * width);
  const empty = width - filled;
  
  let color = chalk.green;
  if (percentage > 0.8) color = chalk.red;
  else if (percentage > 0.6) color = chalk.yellow;
  
  return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}

export function getTrend(dailyUsage: DailyUsage[]): string {
  if (dailyUsage.length < 2) return '→';
  
  const recent = dailyUsage.slice(-7);
  if (recent.length < 2) return '→';
  
  const lastValue = recent[recent.length - 1].totalCost;
  const prevValue = recent[recent.length - 2].totalCost;
  
  if (lastValue > prevValue * 1.2) return '↑';
  if (lastValue < prevValue * 0.8) return '↓';
  return '→';
}

export function formatMemory(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export function getColorForMetric(value: number, type: 'cpu' | 'memory' | 'gpu' = 'cpu'): typeof chalk {
  if (type === 'memory') {
    // Memory has 4 tiers
    if (value < 40) return chalk.green;
    if (value < 60) return chalk.cyan;
    if (value < 80) return chalk.yellow;
    return chalk.red;
  } else {
    // CPU/GPU has 3 tiers
    if (value < 60) return chalk.green;
    if (value < 80) return chalk.yellow;
    return chalk.red;
  }
}

