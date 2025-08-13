# AI Tools CLI

> Essential toolkit for Vibe Coding - Keep your AI-assisted development flow smooth by managing processes, debugging stuck operations, and optimizing your coding environment when using Claude Code, GitHub Copilot, Cursor, and other AI tools

## 🎵 What is Vibe Coding?

Vibe Coding is the state of flow when you're pair programming with AI - ideas flowing seamlessly from thought to implementation. But nothing kills the vibe faster than stuck processes, frozen hooks, or mysterious CPU spikes. That's where `aitools` comes in.

## ✨ Features

- 🎵 **Keep Your Vibe**: Don't let technical issues interrupt your coding flow
- 🤖 **AI Development Focused**: Optimized for managing processes spawned by AI coding assistants
- 🔍 **Smart Detection**: Automatically identifies stuck hooks, long-running processes, and performance issues
- 💻 **Clean Interface**: Modern CLI with readable time formats and dynamic column sizing
- ⚡ **Quick Fixes**: One-command resolution for common development environment issues
- 📊 **System Health**: Real-time monitoring of CPU, memory, and process states
- 🎯 **Precise Control**: Interactive mode for selective process management

## 🚀 Installation

```bash
# Global installation with bun
bun install -g aitools

# Or run directly with bunx
bunx aitools

# Local development
git clone https://github.com/yourusername/aitools.git
cd aitools
bun install
bun run build
```

After installation, you can use either `aitools` or the shorter `ai` alias:
```bash
aitools status   # Full command
ai status        # Short alias - same thing!
```

## 📖 Usage

### Core Commands

Both `aitools` and `ai` work identically - use whichever feels better!

```bash
# 🔍 Check system health
ai status                          # Quick overview of AI development environment

# 🪝 Manage AI development hooks
ai hooks                           # View all active hooks
ai hooks -i                        # Interactive hook management
ai hooks -k                        # Kill all detected hooks

# ⚡ Fix common issues automatically
ai fix                             # Standard fix for stuck processes
ai fix --aggressive                # More aggressive cleanup

# 📊 Monitor system performance
ai monitor                         # One-time system check
ai monitor -w                      # Continuous monitoring mode
ai monitor -i                      # Interactive process selection

# 🔎 View processes
ai processes                       # All system processes
ai processes --hooks               # Only hook-related processes
ai processes --cpu 10              # Processes using >10% CPU

# 🔪 Terminate processes
ai kill -p 1234                   # Kill by PID
ai kill --hooks                   # Kill all hook processes
ai kill -i                        # Interactive selection
```

### Common Workflows

#### 🎵 Keep the vibe going when things get stuck:
```bash
# Quick vibe check and fix
ai status      # Check what's killing your vibe
ai fix         # Auto-fix to get back in the flow
```

#### When Claude Code or Cursor gets stuck:
```bash
# Quick diagnosis and fix
ai hooks       # See what's hanging
ai fix         # Auto-fix common issues
```

#### Managing runaway development servers:
```bash
# Find and kill stuck dev servers
ai processes --cpu 20    # Find high CPU processes
ai kill -i               # Interactively select what to kill
```

#### Clean up after intense vibe coding session:
```bash
# Remove all AI tool hooks
ai hooks -k              # Kill all hooks at once
```

## 🎯 Use Cases

### For Claude Code Users
- Resolve stuck hooks when Claude Code becomes unresponsive
- Clean up orphaned processes after closing the browser
- Monitor resource usage during long coding sessions

### For Cursor/Copilot Users
- Manage background processes spawned by AI assistants
- Debug performance issues caused by language servers
- Clean up after crashed development environments

### For General AI Development
- Monitor system health during AI-assisted coding
- Quickly identify and resolve process bottlenecks
- Maintain optimal performance across multiple AI tools

## 🔧 Advanced Options

### Process Monitoring
```bash
# Custom CPU threshold
aitools monitor -c 15             # Alert on >15% CPU usage

# Memory monitoring
aitools monitor -m 5              # Alert on >5% memory usage

# Auto-kill mode
aitools monitor -a                # Automatically kill suspicious processes
```

### Process Filtering
```bash
# Sort by different metrics
aitools processes --sort memory   # Sort by memory usage
aitools processes --sort time     # Sort by runtime

# Limit output
aitools processes --limit 20      # Show only top 20 processes
```

## 📝 Configuration

The tool uses sensible defaults but can be customized:

- **CPU Threshold**: 5% (adjustable via `-c` flag)
- **Memory Threshold**: 1% (adjustable via `-m` flag)
- **Long-running**: 5 minutes (processes running longer are flagged)

## 🏗️ Architecture

Built with:
- **Bun** - Fast JavaScript runtime and bundler
- **TypeScript** - Type-safe development
- **Commander.js** - CLI framework
- **Chalk & Ora** - Beautiful terminal output

Optimized for macOS with platform-specific process management.

## 🤝 Contributing

Contributions are welcome! This tool is designed to evolve with the AI development ecosystem.

```bash
# Development setup
bun install
bun run dev [command]      # Run in development mode
bun run build             # Build for production
bun run typecheck         # Type checking
```

## 📄 License

MIT

## 🙏 Acknowledgments

Created for the Vibe Coding community - developers who live in the flow state with their AI pair programmers. May your vibes stay high and your processes stay responsive.

> "Don't let stuck processes kill your vibe" - Every developer using AI tools