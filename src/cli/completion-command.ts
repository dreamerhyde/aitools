import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function setupCompletionCommand(program: Command): void {
  program
    .command('completion')
    .description('Generate shell completion script')
    .option('--shell <type>', 'Shell type (bash, zsh, fish)', 'bash')
    .option('--install', 'Auto-install completion to shell config')
    .action((options) => {
      if (options.install) {
        installCompletion(options.shell);
      } else {
        const completionScript = generateCompletionScript(program, options.shell);
        console.log(completionScript);
        console.log();
        console.log(chalk.green('# To install completion:'));
        
        switch (options.shell) {
          case 'bash':
            console.log(chalk.gray('# Add to ~/.bashrc:'));
            console.log(chalk.cyan('eval "$(ai completion)"'));
            console.log(chalk.gray('# Or auto-install:'));
            console.log(chalk.cyan('ai completion --install'));
            break;
          case 'zsh':
            console.log(chalk.gray('# Add to ~/.zshrc:'));
            console.log(chalk.cyan('eval "$(ai completion --shell zsh)"'));
            console.log(chalk.gray('# Or auto-install:'));
            console.log(chalk.cyan('ai completion --shell zsh --install'));
            break;
          case 'fish':
            console.log(chalk.gray('# Add to ~/.config/fish/config.fish:'));
            console.log(chalk.cyan('ai completion --shell fish | source'));
            console.log(chalk.gray('# Or auto-install:'));
            console.log(chalk.cyan('ai completion --shell fish --install'));
            break;
        }
      }
    });
}

function installCompletion(shell: string): void {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  let configFile: string;
  let marker: string;
  let completionLine: string;
  
  switch (shell) {
    case 'bash':
      configFile = path.join(home, '.bashrc');
      marker = '# AI Tools Completion';
      completionLine = 'eval "$(ai completion)"';
      break;
    case 'zsh':
      configFile = path.join(home, '.zshrc');
      marker = '# AI Tools Completion';
      completionLine = 'eval "$(ai completion --shell zsh)"';
      break;
    case 'fish':
      configFile = path.join(home, '.config', 'fish', 'config.fish');
      marker = '# AI Tools Completion';
      completionLine = 'ai completion --shell fish | source';
      break;
    default:
      console.log(chalk.red('Unsupported shell type'));
      return;
  }
  
  try {
    // Check if config file exists
    if (!fs.existsSync(configFile)) {
      console.log(chalk.yellow(`▪ Config file not found: ${configFile}`));
      console.log(chalk.gray('  Creating new config file...'));
      fs.writeFileSync(configFile, '');
    }
    
    // Read existing content
    const content = fs.readFileSync(configFile, 'utf-8');
    
    // Check if completion is already installed
    if (content.includes(marker)) {
      console.log(chalk.yellow('▪ Completion already installed'));
      console.log(chalk.gray('  To reinstall, first remove the existing completion from:'));
      console.log(chalk.gray(`  ${configFile}`));
      return;
    }
    
    // Add completion with marker
    const newContent = `${content}
${marker}
${completionLine}
`;
    
    // Write back
    fs.writeFileSync(configFile, newContent);
    
    console.log(chalk.green('✓ Completion installed successfully'));
    console.log(chalk.gray(`  Added to: ${configFile}`));
    console.log(chalk.gray('  Restart your shell or run:'));
    console.log(chalk.cyan(`  source ${configFile}`));
    
  } catch (error: any) {
    console.log(chalk.red('✗ Failed to install completion'));
    console.log(chalk.gray(`  Error: ${error.message}`));
    console.log(chalk.gray('  You can manually add to your shell config:'));
    console.log(chalk.cyan(`  ${completionLine}`));
  }
}

function generateCompletionScript(program: Command, shell: string): string {
  const commands = program.commands.map(cmd => cmd.name());
  
  if (shell === 'bash') {
    return `
# AI Tools Bash Completion
_aitools_completions() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    
    # Commands
    local commands="${commands.join(' ')}"
    
    # Sub-commands
    local cost_commands="detail"
    local git_commands="diff stats"
    
    case "\${prev}" in
        ai|aitools)
            COMPREPLY=( $(compgen -W "\${commands}" -- \${cur}) )
            return 0
            ;;
        cost)
            COMPREPLY=( $(compgen -W "\${cost_commands} --help" -- \${cur}) )
            return 0
            ;;
        git)
            COMPREPLY=( $(compgen -W "\${git_commands} --help" -- \${cur}) )
            return 0
            ;;
        *)
            if [[ \${cur} == -* ]] ; then
                COMPREPLY=( $(compgen -W "--help --version" -- \${cur}) )
            fi
            ;;
    esac
}

complete -F _aitools_completions aitools
complete -F _aitools_completions ai
`;
  } else if (shell === 'zsh') {
    return `
# AI Tools Zsh Completion
#compdef ai aitools

_aitools() {
    local commands
    commands=(
        ${commands.map(cmd => `'${cmd}:${cmd} command'`).join('\n        ')}
    )
    
    local cost_commands
    cost_commands=(
        'detail:Show detailed usage report'
    )
    
    case $state in
        (commands)
            _describe 'command' commands
            ;;
        (cost)
            _describe 'cost command' cost_commands
            ;;
    esac
}

compdef _aitools ai
compdef _aitools aitools
`;
  } else if (shell === 'fish') {
    return `
# AI Tools Fish Completion
complete -c ai -f

# Commands
${commands.map(cmd => `complete -c ai -n "__fish_use_subcommand" -a "${cmd}"`).join('\n')}
complete -c aitools -n "__fish_use_subcommand" -a "${commands.join(' ')}"

# Cost sub-commands
complete -c ai -n "__fish_seen_subcommand_from cost" -a "detail"
complete -c aitools -n "__fish_seen_subcommand_from cost" -a "detail"
`;
  }
  
  return '# Unsupported shell type';
}