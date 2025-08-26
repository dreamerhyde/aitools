import * as figlet from 'figlet';

export class ScreenManager {
  private screen: any;
  private blessed: any;
  private contrib: any;
  private currentFontIndex: number = 0;
  private allFonts: figlet.Fonts[] = ['ANSI Shadow', 'Big', 'Standard', 'Small', 'Slant'];

  async initialize(): Promise<void> {
    // Dynamically import blessed modules
    this.blessed = await import('blessed');
    this.contrib = await import('blessed-contrib');

    // Create screen
    this.screen = this.blessed.screen({
      smartCSR: true,
      title: 'AI Tools Monitor',
      fullUnicode: true,
      dockBorders: true,
      autoPadding: false,
      warnings: false,
      // Enhance rendering
      forceUnicode: true,
      cursor: {
        artificial: false,
        shape: 'line',
        blink: false,
        color: 'white'
      }
    });

    // Set up base styling
    this.screen.style = {
      bg: 'black'
    };
  }

  createGrid(rows: number, cols: number): any {
    if (!this.contrib) {
      throw new Error('Screen not initialized');
    }
    return new this.contrib.grid({ rows, cols, screen: this.screen });
  }

  createBox(options: any): any {
    if (!this.blessed) {
      throw new Error('Screen not initialized');
    }
    return this.blessed.box(options);
  }

  createGridBox(grid: any, row: number, col: number, rowSpan: number, colSpan: number, options: any): any {
    if (!this.blessed) {
      throw new Error('Screen not initialized');
    }
    return grid.set(row, col, rowSpan, colSpan, this.blessed.box, options);
  }

  generateTitle(text: string): string {
    try {
      const font = this.allFonts[this.currentFontIndex];
      return figlet.textSync(text, { font });
    } catch (error) {
      return text;
    }
  }

  rotateFont(): void {
    this.currentFontIndex = (this.currentFontIndex + 1) % this.allFonts.length;
  }

  getCurrentFont(): string {
    return this.allFonts[this.currentFontIndex];
  }

  setupKeyBindings(handlers: { [key: string]: () => void }): void {
    if (!this.screen) {
      throw new Error('Screen not initialized');
    }

    // Default handlers - immediate exit on Ctrl+C
    this.screen.key(['C-c'], () => {
      // Immediate cleanup and exit
      this.screen.destroy();
      process.exit(0);
    });
    
    // Graceful exit on 'q' or 'escape'
    this.screen.key(['escape', 'q'], () => {
      if (handlers.quit) {
        handlers.quit();
      }
      process.exit(0);
    });

    // Custom handlers
    Object.entries(handlers).forEach(([key, handler]) => {
      if (key !== 'quit') {
        this.screen.key(key, handler);
      }
    });
  }

  render(): void {
    if (this.screen) {
      this.screen.render();
    }
  }

  destroy(): void {
    if (this.screen) {
      this.screen.destroy();
    }
  }

  getScreen(): any {
    return this.screen;
  }

  getBlessed(): any {
    return this.blessed;
  }

  getContrib(): any {
    return this.contrib;
  }
}