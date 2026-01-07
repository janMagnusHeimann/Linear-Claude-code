# Linear Claude 🚀

**Automatically solve Linear issues with Claude Code** - A beautiful desktop app that fetches issues from Linear, intelligently routes them to relevant code areas in your codebase, and invokes Claude Code with rich context to solve them.

![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=for-the-badge)
![Electron](https://img.shields.io/badge/Electron-28-47848F?style=for-the-badge&logo=electron)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript)

## Features

- 🖥️ **Beautiful Desktop App**: Modern UI with dark mode, built with React and Tailwind CSS
- 📝 **claude.md Integration**: Leverages Claude Code's native project context
- 🚀 **Auto-Initialization**: Automatically runs `claude /init` for new projects
- 🤖 **AI Prompt Enhancement**: Optional Claude API integration to create detailed prompts (cheap single call)
- 🧠 **Intelligent Plan Review**: AI reviews implementation plans before execution
- 📊 **Real-time Monitoring**: Live terminal output and progress tracking
- 🔧 **Flexible Filtering**: Filter issues by team, status, labels, assignee, and more
- 🌿 **Git Integration**: Automatically creates branches for each issue
- 🔔 **macOS Notifications**: Get notified when Claude Code completes

## Installation

### Option 1: Download Pre-built App (Recommended)

Download the latest release for your platform:
- **macOS**: `Linear-Claude-1.0.0.dmg` (Intel & Apple Silicon)
- **Windows**: `Linear-Claude-Setup-1.0.0.exe`
- **Linux**: `Linear-Claude-1.0.0.AppImage`

### Option 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/janMagnusHeimann/Linear-Claude-code.git
cd Linear-Claude-code

# Install dependencies
npm install

# Build the app
npm run app:build

# Package for your platform
npm run app:package        # macOS
npm run app:package:all    # All platforms
```

### Option 3: CLI Only

```bash
# Install dependencies
npm install

# Build CLI
npm run build

# Use globally
npm link
```

## Quick Start

### Desktop App

1. **Launch** the app and complete the setup wizard
2. **Enter** your Linear API key (get it from [Linear Settings → API](https://linear.app/settings/api))
3. **Select** your project directory
4. **Browse** your issues, filter by team/status/labels
5. **Select** an issue and click **Launch Claude Code**!

### CLI

```bash
# Setup
export LINEAR_API_KEY=your-linear-api-key

# Interactive issue selection
linear-claude solve

# Filter by team
linear-claude solve --team ENG --me

# List issues
linear-claude list --status started
```

## How It Works

```
1. User selects Linear issue
          ↓
2. Check if claude.md exists in project root
          ↓
    ┌─────┴─────┐
    │           │
   NO          YES
    │           │
    ↓           ↓
Run claude     Read existing
   /init       claude.md
    │           │
    └─────┬─────┘
          ↓
3. AI Enhancement Enabled? (Settings + API Key)
          ↓
    ┌─────┴─────┐
    │           │
   YES          NO
    │           │
    ↓           ↓
 Enhance      Use basic
 prompt       prompt
 (Claude API) (ticket only)
    │           │
    └─────┬─────┘
          ↓
4. Send prompt to Claude Code
          ↓
5. Monitor execution + AI plan review
          ↓
6. Complete → macOS notification
```

### Key Features

| Feature | Description |
|---------|-------------|
| **claude.md Integration** | Leverages Claude Code's native project context instead of custom analysis |
| **Auto-Initialization** | Automatically runs `claude /init` for new projects |
| **AI Prompt Enhancement** | Optional: Uses Claude API to create detailed prompts from tickets + claude.md |
| **Plan Review** | AI reviews Claude Code's implementation plans before execution |
| **Real-time Monitoring** | Live terminal output and progress tracking in the app |

## App Screenshots

### Issues View
Beautiful issue list with priority indicators, labels, and quick filters.

### Solve View
Intelligent code routing with confidence scores and suggested files.

### Settings
Easy configuration of API keys, codebase paths, and git settings.

## Configuration

### Via Desktop App

1. Go to **Settings**
2. Configure:
   - Linear API Key
   - Anthropic API Key (optional, for AI features)
   - Enable/Disable AI prompt enhancement
   - Default Team
   - Codebase Path
   - Git branch creation
   - Branch prefix

### Via Config File

Create `.linear-claude.json`:

```json
{
  "linear": {
    "apiKey": "lin_api_xxx",
    "defaultTeamKey": "ENG"
  },
  "codebases": [{
    "rootPath": "/path/to/project",
    "customMappings": [{
      "labelPatterns": ["frontend"],
      "modulePaths": ["src/components"]
    }]
  }],
  "claudeCode": {
    "createBranch": true,
    "branchPrefix": "fix/"
  }
}
```

## CLI Reference

```bash
linear-claude solve [options]    # Solve an issue
linear-claude list [options]     # List issues
linear-claude analyze [options]  # Analyze codebase
linear-claude setup              # Setup wizard
linear-claude map                # Configure mappings
linear-claude info               # Show config
```

### Options

| Option | Description |
|--------|-------------|
| `-t, --team <key>` | Filter by team |
| `-s, --status <status>` | Filter by status |
| `-l, --label <label>` | Filter by label |
| `-m, --me` | My issues only |
| `-q, --search <query>` | Search text |
| `-d, --dry-run` | Preview only |

## Development

```bash
# Install dependencies
npm install

# Run desktop app in development
npm run app:dev

# Build CLI
npm run build

# Build desktop app
npm run app:build

# Package for distribution
npm run app:package
```

## Tech Stack

- **Desktop App**: Electron 28, React 18, Tailwind CSS
- **Core Logic**: TypeScript, Linear SDK
- **Build Tools**: Vite, electron-builder

## Requirements

- Node.js 18+
- Claude Code installed ([Install Claude Code](https://claude.ai/code))
- Linear account with API key
- Anthropic API key (optional, for AI prompt enhancement and plan review)

## Troubleshooting

### "Not Connected" in app
- Check your API key in Settings
- Ensure you have internet connection
- Verify the key at [linear.app/settings/api](https://linear.app/settings/api)

### Low routing confidence
- Add more descriptive labels to your issues
- Use the `linear-claude map` command to create custom mappings
- Include file paths in issue descriptions

### Claude Code not launching
- Ensure Claude Code is installed and in PATH
- Check `which claude` in terminal

## Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Built with Claude for developers who love automation ⚡
