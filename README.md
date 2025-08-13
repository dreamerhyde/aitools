# AI Tools CLI

> Essential toolkit for Vibe Coding - Keep your AI-assisted development flow smooth by managing processes, monitoring code health, and maintaining optimal performance when pair programming with AI assistants.

## What is Vibe Coding?

Vibe Coding is the flow state achieved when pair programming with AI assistants - where ideas transform seamlessly into code. But nothing disrupts this flow faster than stuck processes, bloated code files, or frozen development hooks. AI Tools ensures your vibe stays uninterrupted.

## ✓ Key Features

- **Process Management**: Smart detection and cleanup of stuck hooks and runaway processes
- **Code Health Monitoring**: Identify files needing refactoring with AI-ready prompts
- **System Optimization**: Real-time CPU/memory monitoring with automatic issue resolution
- **Clean CLI Design**: Professional interface without emoji, following international standards
- **Auto-Updates**: Stay current with automatic version checking (Claude Code style)

## Installation

```bash
# Install globally with npm/bun
npm install -g aitools
# or
bun install -g aitools

# Clone for development
git clone https://github.com/yourusername/aitools.git
cd aitools
bun install
bun run build
```

Use either `aitools` or the shorter `ai` alias:
```bash
aitools status   # Full command
ai status        # Short alias
```

## Core Commands

### System Health & Monitoring

```bash
# Quick system overview
ai status                       # Check AI development environment health

# Monitor processes and performance
ai monitor                      # One-time system check
ai monitor -w                   # Continuous monitoring
ai monitor -i                   # Interactive process selection
ai monitor --auto-kill          # Auto-terminate suspicious processes
```

### Process Management

```bash
# View processes with subcommands
ai ps                          # List all processes
ai ps --hooks                  # Show only hook-related processes
ai ps --cpu 10                 # Filter by CPU usage >10%
ai ps clean                    # Clean critical abnormal processes (red circles)
ai ps clean -y                 # Skip confirmation

# Manage hooks specifically
ai hooks                       # View all active hooks
ai hooks -i                    # Interactive hook management
ai hooks -k                    # Terminate all hooks
ai hooks clean                 # Clean abnormal hooks only

# Terminate processes
ai kill -p 1234               # Kill by PID
ai kill --pattern node        # Kill by pattern match
ai kill -i                    # Interactive selection
```

### Code Health Analysis

```bash
# Check code quality
ai check                       # Analyze files >500 lines
ai check -t 300               # Custom threshold (300 lines)
ai check -p ./src             # Specific directory
ai check --ignore "*.test.ts" # Additional ignore patterns

# Output includes:
# - Health score (0-100)
# - Files needing attention
# - Copy-paste ready AI prompts for refactoring
```

### Quick Fixes

```bash
# Automatic issue resolution
ai fix                        # Standard fix for common issues
ai fix --aggressive           # More thorough cleanup
ai fix --dry-run             # Preview without executing
```

### Self-Management

```bash
# Updates and configuration
ai upgrade                    # Upgrade to latest version
ai upgrade --check           # Check for updates only
ai config --disable-updates  # Disable automatic update checks
ai config --enable-updates   # Enable automatic update checks
```

## Code Health Feature

The `ai check` command provides comprehensive code analysis:

### Supported Languages
- JavaScript/TypeScript (`.js`, `.jsx`, `.ts`, `.tsx`)
- Python (`.py`)
- Go (`.go`)
- Java (`.java`)
- C#/NET (`.cs`)
- C/C++ (`.c`, `.cpp`)
- Rust (`.rs`)
- Swift (`.swift`)
- Kotlin (`.kt`)

### Automatic Exclusions
```
node_modules/     # JavaScript dependencies
__pycache__/      # Python cache
venv/, .venv/     # Python virtual environments
vendor/           # Go dependencies
target/           # Rust/Java build
bin/, obj/        # C# build
Pods/, Carthage/  # iOS dependencies
.git/, .idea/     # Version control and IDE
```

### Example Output
```
Overall Health Score
────────────────────────
  Score: 72/100
  Files analyzed: 118
  Files needing attention: 5

Files Needing Attention
────────────────────────
  ● app/components/analytics.tsx
     Lines: 785    Size: 37.6KB   Complexity: 31
     
→ Copy-Paste Ready AI Prompt:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Complete refactoring prompt ready to paste to AI]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Common Workflows

### When Claude Code gets stuck
```bash
ai status          # Check system health
ai hooks           # View problematic hooks
ai fix             # Auto-fix issues
```

### Maintain code quality for AI collaboration
```bash
ai check           # Identify large files
# Copy the generated prompt
# Paste to Claude/ChatGPT/Copilot for refactoring
```

### Clean up after intense coding session
```bash
ai ps clean -y     # Remove all abnormal processes
ai hooks clean -y  # Clean stuck hooks
```

### Debug high CPU usage
```bash
ai monitor         # Find resource hogs
ai ps --cpu 20     # List high CPU processes
ai kill -i         # Select and terminate
```

## Process Status Indicators

- `●` Red circle: Critical/abnormal process (sleeping with high CPU)
- `○` Yellow circle: Warning state (high resource usage)
- `○` Gray circle: Normal idle process
- `●` Green circle: Normal active process

## Advanced Usage

### Custom Monitoring
```bash
ai monitor -c 15 -m 5          # CPU >15%, Memory >5%
ai monitor --cpu-threshold 10  # Custom CPU threshold
```

### Process Filtering
```bash
ai ps --sort memory            # Sort by memory usage
ai ps --sort time              # Sort by runtime
ai ps --limit 20               # Limit output rows
```

### Code Health Options
```bash
ai check --format detailed     # Detailed analysis
ai check --format json        # JSON output for automation
```

## Development

```bash
# Setup
bun install

# Development commands
bun run dev [command]         # Run in development mode
bun run build                # Build distribution
bun run typecheck           # TypeScript checking
bun run lint                # ESLint checking

# Testing
./dist/cli.js [command]      # Test built version
```

## Architecture

- **Runtime**: Bun for fast execution
- **Language**: TypeScript with strict typing
- **CLI Framework**: Commander.js
- **UI Components**: Chalk (colors), Table (formatting), Ora (spinners)
- **Platform**: Optimized for macOS with fallback support

## Project Structure

```
src/
├── cli.ts                   # Main entry point
├── cli/                     # Command modules
│   ├── ps-command.ts       # Process commands
│   ├── hooks-command.ts    # Hook management
│   └── basic-commands.ts   # Core utilities
├── commands/                # Command implementations
├── utils/                   # Shared utilities
│   ├── process-monitor.ts  # Process detection
│   ├── ui.ts              # UI helpers
│   └── health-display.ts  # Code health formatting
└── types/                   # TypeScript definitions
```

## Contributing

Contributions welcome! This tool evolves with the AI development ecosystem.

### Guidelines
- Follow existing code style
- Maintain English documentation
- No emoji in code or output
- Test with multiple AI tools
- Update README for new features

## License

MIT

## Acknowledgments

Created for developers who live in the flow state with AI pair programmers. Keep your vibe high and your processes responsive.

> "Clean code, clear mind, continuous vibe" - The AI Tools Philosophy