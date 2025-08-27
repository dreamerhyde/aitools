// import chalk from 'chalk';

export interface ChartData {
  date: string;
  value: number;
}

export interface ChartOptions {
  width?: number;
  height?: number;
  barWidth?: number;
  showDates?: boolean;
  fullDates?: boolean;
}

export class ChartGenerator {
  static generateContinuous30Days(data: Map<string, number>): ChartData[] {
    const result: ChartData[] = [];
    const now = new Date();
    
    // Generate dates for the last 30 days
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // Format date as YYYY-MM-DD
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      result.push({
        date: dateStr,
        value: data.get(dateStr) || 0
      });
    }
    
    return result;
  }

  static generateBarChart(data: ChartData[], options: ChartOptions = {}): string[] {
    const {
      height = 10,
      barWidth = 2,
      showDates = true,
      fullDates = false,
      width = 90
    } = options;
    
    const dataCount = data.length; // Should be 30 for 30-day chart
    
    // Calculate space per bar to evenly distribute across width
    const spacePerBar = width / dataCount;
    
    // Find max value for scaling (ensure it's not zero)
    const maxValue = Math.max(0.01, Math.max(...data.map(d => d.value)));
    
    // Create chart array
    const chart: string[][] = [];
    for (let i = 0; i < height; i++) {
      chart[i] = new Array(width).fill(' ');
    }
    
    // Draw bars evenly distributed across the width
    data.forEach((item, index) => {
      if (item.value === 0) return; // Skip zero values
      
      const barHeight = Math.max(1, Math.ceil((item.value / maxValue) * (height - 1)));
      
      // Calculate x position for this bar (evenly distributed)
      const centerX = (index + 0.5) * spacePerBar;
      const barStartX = Math.floor(centerX - barWidth / 2);
      
      // Choose color based on value relative to max
      const barChar = '█';
      let coloredBar = '';
      if (item.value > maxValue * 0.8) {
        coloredBar = '{red-fg}█{/red-fg}';
      } else if (item.value > maxValue * 0.5) {
        coloredBar = '{yellow-fg}█{/yellow-fg}';
      } else {
        coloredBar = '{green-fg}█{/green-fg}';
      }
      
      // Draw the bar
      for (let y = 0; y < barHeight; y++) {
        const chartY = height - 1 - y;
        for (let w = 0; w < barWidth; w++) {
          const x = barStartX + w;
          if (x >= 0 && x < width) {
            chart[chartY][x] = coloredBar || barChar;
          }
        }
      }
    });
    
    // Build output lines
    const lines: string[] = [];
    
    // Add Y-axis labels and chart
    for (let i = 0; i < height; i++) {
      // Fixed: Use same scaling as bar height calculation (height - 1)
      const value = Math.round(((height - 1 - i) / (height - 1) * maxValue));
      const label = `$${value}`;
      const paddedLabel = label.padStart(4);
      
      // Join chart characters, handling colored bars
      let chartLine = '';
      for (let j = 0; j < chart[i].length; j++) {
        const char = chart[i][j];
        if (char.includes('{')) {
          // It's a colored bar, add it as-is
          chartLine += char;
        } else {
          // Regular character
          chartLine += char;
        }
      }
      
      lines.push(`{gray-fg}${paddedLabel}{/gray-fg} {gray-fg}│{/gray-fg}${chartLine}`);
    }
    
    // Add X-axis
    lines.push('{gray-fg}     └' + '─'.repeat(width) + '{/gray-fg}');
    
    // Add date labels
    if (showDates) {
      const dateRow = '      '; // 6 spaces for Y-axis alignment
      
      if (fullDates) {
        // Show all dates evenly distributed
        const dateChars: string[] = new Array(width).fill(' ');
        
        // Show all 30 dates
        data.forEach((item, index) => {
          const centerX = (index + 0.5) * spacePerBar;
          const dateX = Math.floor(centerX - 1); // Center the 2-digit date
          
          const dayNum = item.date.substring(8, 10);
          if (dateX >= 0 && dateX < width - 1) {
            dateChars[dateX] = dayNum[0];
            if (dateX + 1 < width) {
              dateChars[dateX + 1] = dayNum[1];
            }
          }
        });
        
        lines.push('{gray-fg}' + dateRow + dateChars.join('') + '{/gray-fg}');
      } else {
        // Show only first and last dates
        const dateChars: string[] = new Array(width).fill(' ');
        
        // First date
        const firstDay = data[0].date.substring(8, 10);
        dateChars[0] = firstDay[0];
        dateChars[1] = firstDay[1];
        
        // Last date
        const lastDay = data[data.length - 1].date.substring(8, 10);
        const lastPos = width - 2;
        if (lastPos > 0) {
          dateChars[lastPos] = lastDay[0];
          dateChars[lastPos + 1] = lastDay[1];
        }
        
        lines.push('{gray-fg}' + dateRow + dateChars.join('') + '{/gray-fg}');
      }
    }
    
    return lines;
  }
}