# Linear Claude 🚀

**Automatically solve Linear issues with Claude Code** - A beautiful desktop app that fetches issues from Linear, intelligently routes them to relevant code areas in your codebase, and invokes Claude Code with rich context to solve them.

![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=for-the-badge)
![Electron](https://img.shields.io/badge/Electron-28-47848F?style=for-the-badge&logo=electron)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript)

## Features

- 🖥️ **Beautiful Desktop App**: Modern UI with dark mode, built with React and Tailwind CSS
- 🎯 **Smart Issue Routing**: AI identifies which parts of your codebase are relevant to each issue
- 📊 **Codebase Analysis**: Understands your project structure, tech stack, and modules
- 🔍 **Multiple Routing Strategies**: Label mapping, keyword extraction, file mentions, and component detection
- 🤖 **One-Click Solve**: Launch Claude Code with full context about the issue
- 🔧 **Flexible Filtering**: Filter issues by team, status, labels, assignee, and more
- 🌿 **Git Integration**: Automatically creates branches for each issue

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
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Linear API    │────▶│  Issue Router    │────▶│   Claude Code   │
│  Fetch Issues   │     │  Find Relevant   │     │  Solve Issue    │
│                 │     │  Code Areas      │     │  with Context   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                      │                        │
         ▼                      ▼                        ▼
   ┌───────────┐         ┌───────────┐           ┌───────────┐
   │  Filters  │         │  Analyze  │           │  Branch   │
   │  - Team   │         │  Codebase │           │  Created  │
   │  - Status │         │  - Modules│           │  Context  │
   │  - Labels │         │  - Stack  │           │  Provided │
   └───────────┘         └───────────┘           └───────────┘
```

### Routing Strategies

| Strategy | How It Works |
|----------|--------------|
| **Label Mapping** | Maps Linear labels to code modules (e.g., "frontend" → `src/components`) |
| **Keyword Extraction** | Finds keywords in issue title/description and matches to code |
| **File Mention** | Detects file paths mentioned in issues |
| **Component Detection** | Identifies UI components and features referenced |

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
