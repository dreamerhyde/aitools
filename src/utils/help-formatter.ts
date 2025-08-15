import chalk from 'chalk';
import { Command } from 'commander';

export class HelpFormatter {
  // Strip ANSI color codes to calculate real string length
  private static stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }
  
  // Generate tree-structured help with proper alignment
  static formatRootHelpAligned(program?: Command): string {
    const output: string[] = [];
    
    // Header
    output.push('');
    output.push(chalk.bold.cyan('AI Tools CLI') + chalk.gray(' - Vibe Coding Toolkit'));
    output.push('');
    
    if (program) {
      output.push(chalk.bold('Commands:'));
      output.push('');
      
      const commands = program.commands.filter(cmd => cmd.name() !== 'help');
      const descStartCol = 45; // Fixed column for descriptions
      
      commands.forEach((cmd, index) => {
        const isLast = false; // Never make commands the last item since we add help manually
        const prefix = isLast ? '└─' : '├─';
        
        // Build command with aliases
        const cmdName = cmd.name();
        const aliases = cmd.aliases();
        
        // Build colored left part
        let leftColored = `${prefix} ${chalk.cyan(cmdName)}`;
        if (aliases && aliases.length > 0) {
          leftColored += chalk.gray(` (${aliases.join(', ')})`);
        }
        
        // Calculate real visible length (without ANSI codes)
        const leftPlain = this.stripAnsi(leftColored);
        const visibleLength = leftPlain.length;
        
        // Add leader line and description
        const desc = cmd.description() || '';
        const spaceNeeded = descStartCol - visibleLength;
        let leader = '';
        
        if (spaceNeeded > 2) {
          // Use very dim gray for the leader line
          leader = ' ' + chalk.gray.dim('─'.repeat(spaceNeeded - 2)) + ' ';
        } else if (spaceNeeded > 0) {
          leader = ' '.repeat(spaceNeeded);
        }
        
        const cmdLine = `${leftColored}${leader}${chalk.gray(desc)}`;
        output.push(cmdLine);
        
        // Add subcommands with better alignment
        const subcommands = cmd.commands;
        if (subcommands && subcommands.length > 0) {
          subcommands.forEach((sub, subIndex) => {
            const isLastSub = subIndex === subcommands.length - 1;
            const subPrefix = isLast ? '   ' : '│  ';
            const subBranch = isLastSub ? '└─' : '├─';
            
            const subName = sub.name();
            const subLeftColored = `${subPrefix}${subBranch} ${chalk.yellow(subName)}`;
            const subLeftPlain = this.stripAnsi(subLeftColored);
            const subVisibleLength = subLeftPlain.length;
            
            const subDesc = sub.description() || '';
            const subSpaceNeeded = descStartCol - subVisibleLength;
            let subLeader = '';
            
            if (subSpaceNeeded > 2) {
              subLeader = ' ' + chalk.gray.dim('─'.repeat(subSpaceNeeded - 2)) + ' ';
            } else if (subSpaceNeeded > 0) {
              subLeader = ' '.repeat(subSpaceNeeded);
            }
            
            const subLine = `${subLeftColored}${subLeader}${chalk.gray(subDesc)}`;
            output.push(subLine);
          });
        }
        
        // Add important options with alignment
        const importantOptions = cmd.options.filter(opt => {
          const flags = opt.flags;
          return flags.includes('-i') || flags.includes('-k') || flags.includes('-w') || 
                 flags.includes('--aggressive') || flags.includes('--hooks') ||
                 flags.includes('--ignore');
        });
        
        if (importantOptions.length > 0 && subcommands.length === 0) {
          importantOptions.forEach((opt, optIndex) => {
            const isLastOpt = optIndex === importantOptions.length - 1;
            const optPrefix = isLast ? '   ' : '│  ';
            const optBranch = isLastOpt ? '└─' : '├─';
            
            // Extract flags
            const flagParts = opt.flags.split(/,\s*/);
            const shortFlag = flagParts.find(f => f.startsWith('-') && !f.startsWith('--'));
            const longFlag = flagParts.find(f => f.startsWith('--'));
            
            let displayFlag = '';
            if (shortFlag && longFlag) {
              displayFlag = `${shortFlag.split(' ')[0]}, ${longFlag.split(' ')[0]}`;
            } else if (longFlag) {
              displayFlag = longFlag.split(' ')[0];
            } else if (shortFlag) {
              displayFlag = shortFlag.split(' ')[0];
            }
            
            if (displayFlag) {
              const optLeftColored = `${optPrefix}${optBranch} ${chalk.yellow(displayFlag)}`;
              const optLeftPlain = this.stripAnsi(optLeftColored);
              const optVisibleLength = optLeftPlain.length;
              
              const optDesc = opt.description;
              const optSpaceNeeded = descStartCol - optVisibleLength;
              let optLeader = '';
              
              if (optSpaceNeeded > 2) {
                optLeader = ' ' + chalk.gray.dim('─'.repeat(optSpaceNeeded - 2)) + ' ';
              } else if (optSpaceNeeded > 0) {
                optLeader = ' '.repeat(optSpaceNeeded);
              }
              
              const optLine = `${optLeftColored}${optLeader}${chalk.gray(optDesc)}`;
              output.push(optLine);
            }
          });
        }
      });
      
      // Add help command
      const helpLeftColored = `└─ ${chalk.cyan('help')}`;
      const helpLeftPlain = this.stripAnsi(helpLeftColored);
      const helpVisibleLength = helpLeftPlain.length;
      const helpSpaceNeeded = descStartCol - helpVisibleLength;
      let helpLeader = '';
      
      if (helpSpaceNeeded > 2) {
        helpLeader = ' ' + chalk.gray.dim('─'.repeat(helpSpaceNeeded - 2)) + ' ';
      } else if (helpSpaceNeeded > 0) {
        helpLeader = ' '.repeat(helpSpaceNeeded);
      }
      
      output.push(`${helpLeftColored}${helpLeader}${chalk.gray('Show command help')}`);
      
      const subHelpLeftColored = `   └─ ${chalk.yellow('<command>')}`;
      const subHelpLeftPlain = this.stripAnsi(subHelpLeftColored);
      const subHelpVisibleLength = subHelpLeftPlain.length;
      const subHelpSpaceNeeded = descStartCol - subHelpVisibleLength;
      let subHelpLeader = '';
      
      if (subHelpSpaceNeeded > 2) {
        subHelpLeader = ' ' + chalk.gray.dim('─'.repeat(subHelpSpaceNeeded - 2)) + ' ';
      } else if (subHelpSpaceNeeded > 0) {
        subHelpLeader = ' '.repeat(subHelpSpaceNeeded);
      }
      
      output.push(`${subHelpLeftColored}${subHelpLeader}${chalk.gray('Detailed command help')}`);
    }
    
    output.push('');
    output.push(chalk.bold('Quick Start:'));
    output.push('');
    output.push('  ' + chalk.green('ai status') + '         ' + chalk.gray('# Check system health'));
    output.push('  ' + chalk.green('ai hooks -k') + '       ' + chalk.gray('# Kill stuck hooks'));
    output.push('  ' + chalk.green('ai git') + '            ' + chalk.gray('# View git changes'));
    output.push('  ' + chalk.green('ai claude hooks --info') + '  ' + chalk.gray('# Setup Claude Code hooks'));
    output.push('');
    output.push(chalk.gray('For detailed help: ') + chalk.cyan('ai help <command>'));
    output.push(chalk.gray('Interactive mode: ') + chalk.cyan('ai hooks -i'));
    output.push('');
    
    return output.join('\n');
  }
}