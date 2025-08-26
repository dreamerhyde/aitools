import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class LogWatcher {
  private tailProcess: any = null;
  private logFilePath: string;
  private onLogEntry: (entry: any) => void;

  constructor(logFileName: string = '.claude_logs.jsonl', onLogEntry: (entry: any) => void) {
    this.logFilePath = path.join(os.homedir(), logFileName);
    this.onLogEntry = onLogEntry;
  }

  start(): void {
    // Ensure log file exists
    if (!fs.existsSync(this.logFilePath)) {
      fs.writeFileSync(this.logFilePath, '');
    }

    // Use tail to watch the file
    this.tailProcess = spawn('tail', ['-f', '-n', '100', this.logFilePath]);
    
    let buffer = '';
    
    this.tailProcess.stdout.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      lines.forEach(line => {
        if (line.trim()) {
          try {
            const entry = JSON.parse(line);
            this.onLogEntry(entry);
          } catch (error) {
            // Ignore malformed JSON lines
          }
        }
      });
    });

    this.tailProcess.on('error', (error: Error) => {
      console.error('Tail process error:', error);
    });
  }

  stop(): void {
    if (this.tailProcess) {
      this.tailProcess.kill();
      this.tailProcess = null;
    }
  }

  getLogFilePath(): string {
    return this.logFilePath;
  }
}