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
      // Enable colors
      colors: true,
      fullcolor: true,
      terminal: process.env.TERM || 'xterm-256color',
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
    
    // Immediately set up exit handlers after screen creation
    this.screen.key(['C-c', 'q'], () => {
      process.exit(0);
    });
    
    // ESC key handler - immediate exit
    const handleEscPress = () => {
      // Clean exit immediately
      try {
        process.exit(0);
      } catch (e) {
        // If normal exit fails, force it
        process.kill(process.pid, 'SIGKILL');
      }
    };
    
    // ESC key needs multiple bindings for different terminals
    this.screen.key(['escape'], handleEscPress);
    this.screen.key(['C-['], handleEscPress);
    this.screen.key(['\u001b'], handleEscPress);
    
    // Override SIGINT for immediate exit
    process.on('SIGINT', () => {
      process.exit(0);
    });
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

    // Don't rebind exit keys - they're already set in initialize()
    // Only bind custom handlers (not quit-related)
    Object.entries(handlers).forEach(([key, handler]) => {
      if (key !== 'quit' && key !== 'q' && key !== 'escape' && key !== 'C-c') {
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