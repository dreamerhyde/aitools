import chalk from 'chalk';

export interface ChartData {
  date: string;
  value: number;
}

export interface ChartOptions {
  width?: number;      // Chart width (default: auto)
  height?: number;     // Chart height (default: 10)
  barWidth?: number;   // Width of each bar (default: 2)
  showDates?: boolean; // Show date labels (default: true)
  fullDates?: boolean; // Show all dates vs key dates only (default: false)
}

export class ChartGenerator {
  /**
   * Generate continuous 30 days of data, filling gaps with zeros
   */
  static generateContinuous30Days(data: Map<string, number>): ChartData[] {
    const result: ChartData[] = [];
    const today = new Date();
    
    // Generate 30 consecutive days ending today
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      // Format date using user's timezone
      const formatter = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      const dateStr = formatter.format(date);
      
      result.push({
        date: dateStr,
        value: data.get(dateStr) || 0
      });
    }
    
    return result;
  }

  /**
   * Generate ASCII bar chart
   */
  static generateBarChart(data: ChartData[], options: ChartOptions = {}): string[] {
    const {
      height = 10,
      barWidth = 2,
      showDates = true,
      fullDates = false,
      width
    } = options;
    
    const dataCount = data.length; // Should be 30 for 30-day chart
    
    // Simple fixed spacing like ai cost command
    // Each bar takes 3 characters: 2 for bar, 1 for space
    const actualBarWidth = 2; // Standard bar width
    const barTotalWidth = 3; // barWidth(2) + spacing(1)
    const chartWidth = Math.min(dataCount * barTotalWidth, width || 120);
    
    // Find max value for scaling (ensure it's not zero)
    const maxValue = Math.max(0.01, Math.max(...data.map(d => d.value)));
    
    // Create chart array
    const chart: string[][] = [];
    for (let i = 0; i < height; i++) {
      chart[i] = new Array(chartWidth).fill(' ');
    }
    
    // Draw bars with fixed spacing (like ai cost)
    data.forEach((item, index) => {
      const barHeight = item.value > 0 
        ? Math.max(1, Math.ceil((item.value / maxValue) * (height - 1)))
        : 0;
      
      // Simple position calculation: each bar at index * 3
      const x = index * barTotalWidth;
      
      for (let y = 0; y < barHeight; y++) {
        const chartY = height - 1 - y;
        if (x < chartWidth) {
          // Choose color based on value relative to max
          let barChar = '█';
          if (item.value > maxValue * 0.8) {
            barChar = '{red-fg}█{/red-fg}';
          } else if (item.value > maxValue * 0.5) {
            barChar = '{yellow-fg}█{/yellow-fg}';
          } else if (item.value > 0) {
            barChar = '{green-fg}█{/green-fg}';
          }
          
          // Draw bar with actual width (3 characters)
          for (let w = 0; w < Math.min(actualBarWidth, chartWidth - x); w++) {
            chart[chartY][x + w] = barChar;
          }
        }
      }
      
      // Don't show anything for zero values - leave empty
    });
    
    // Build output lines
    const lines: string[] = [];
    
    // Add Y-axis labels and chart
    for (let i = 0; i < height; i++) {
      const value = Math.round(((height - i) / height * maxValue));
      const label = `$ ${value}`;
      const paddedLabel = label.padStart(6);
      lines.push(`{gray-fg}${paddedLabel}{/gray-fg} {gray-fg}│{/gray-fg}${chart[i].join('')}`);
    }
    
    // Add X-axis with proper spacing (7 spaces for Y-axis area + └)
    lines.push('{gray-fg}       └' + '─'.repeat(chartWidth) + '{/gray-fg}');
    
    // Add date labels
    if (showDates) {
      const dateRow = '        '; // 8 spaces for Y-axis alignment
      let dateLabel = dateRow;
      
      if (fullDates) {
        // Show all dates - aligned with bars
        const dateChars: string[] = new Array(chartWidth + 1).fill(' ');
        
        data.forEach((item, index) => {
          // Same position as bars
          const x = index * barTotalWidth;
          
          if (x < chartWidth) {
            const dayNum = item.date.substring(8, 10);
            // Place date at bar position (2 chars wide)
            if (x < dateChars.length) {
              dateChars[x] = dayNum[0];
            }
            if (x + 1 < dateChars.length) {
              dateChars[x + 1] = dayNum[1];
            }
          }
        });
        
        dateLabel = dateRow + dateChars.join('');
      } else {
        // Show only key dates (1st, 10th, 20th, 30th)
        const keyDates = [0, 9, 19, 29];
        const dateChars: string[] = new Array(chartWidth + 1).fill(' ');
        
        keyDates.forEach(i => {
          if (i < data.length) {
            const x = i * barTotalWidth;
            if (x < chartWidth) {
              const dayNum = data[i].date.substring(8, 10);
              if (x < dateChars.length) {
                dateChars[x] = dayNum[0];
              }
              if (x + 1 < dateChars.length) {
                dateChars[x + 1] = dayNum[1];
              }
            }
          }
        });
        
        dateLabel = dateRow + dateChars.join('');
      }
      
      lines.push('{gray-fg}' + dateLabel + '{/gray-fg}');
    }
    
    return lines;
  }
}