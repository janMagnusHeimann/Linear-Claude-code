# Linear-Claude Code 🚀

**Automatically solve Linear issues with Claude Code** - This tool fetches issues from Linear, intelligently routes them to relevant code areas in your codebase, and invokes Claude Code with rich context to solve them.

## Features

- 🎯 **Smart Issue Routing**: Automatically identifies which parts of your codebase are relevant to each issue
- 📊 **Codebase Analysis**: Understands your project structure, tech stack, and module organization
- 🔍 **Multiple Routing Strategies**: Uses label mapping, keyword extraction, file mentions, and component detection
- 🤖 **Context-Rich Claude Code Sessions**: Provides Claude Code with detailed context about the issue and relevant code
- 🔧 **Flexible Filtering**: Filter issues by team, status, labels, assignee, and more
- ⚙️ **Configurable**: Customize routing rules, branch naming, and more

## Installation

```bash
# Clone the repository
git clone https://github.com/janMagnusHeimann/Linear-Claude-code.git
cd Linear-Claude-code

# Install dependencies
npm install

# Build the project
npm run build

# Link globally (optional)
npm link
```

## Quick Start

### 1. Setup

First, run the setup wizard to configure your Linear API key and codebase:

```bash
linear-claude setup
```

Or set environment variables:

```bash
export LINEAR_API_KEY=your-linear-api-key
```

### 2. Solve an Issue

```bash
# Interactive mode - select from available issues
linear-claude solve

# Filter by team
linear-claude solve --team ENG

# Filter by status
linear-claude solve --status started

# Show only your assigned issues
linear-claude solve --me

# Search for specific issues
linear-claude solve --search "authentication bug"
```

### 3. List Issues

```bash
# List all active issues
linear-claude list

# List with filters
linear-claude list --team ENG --status started --label bug
```

## How It Works

### 1. Issue Fetching

The tool connects to Linear's API and fetches issues based on your filters:

```bash
linear-claude solve --team ENG --status unstarted --label bug
```

### 2. Codebase Analysis

It analyzes your codebase to understand:
- **Project structure**: Directories, files, and their organization
- **Tech stack**: Languages, frameworks, build tools, and test frameworks
- **Modules**: Logical components like API, components, services, utils
- **Entry points**: Main files and application entry points

### 3. Intelligent Routing

The tool uses multiple strategies to map issues to relevant code:

| Strategy | Description |
|----------|-------------|
| **Label Mapping** | Maps Linear labels to code modules (e.g., "frontend" → `src/components`) |
| **Keyword Extraction** | Extracts keywords from issue title/description and matches to code |
| **File Mention** | Detects file paths mentioned in the issue |
| **Component Detection** | Identifies UI components and features referenced |

### 4. Context Building

For each issue, it builds rich context including:
- Issue details (title, description, comments, labels)
- Relevant modules and their purposes
- Suggested files to start with
- Related tests and type definitions
- Implementation guidelines specific to the issue type
- Tech stack-specific best practices

### 5. Claude Code Invocation

Finally, it launches Claude Code with all this context, optionally:
- Creating a feature branch
- Running in interactive or non-interactive mode
- Providing a dry-run preview

## Configuration

### Configuration File

Create `.linear-claude.json` in your project or home directory:

```json
{
  "linear": {
    "apiKey": "your-api-key",
    "defaultTeamKey": "ENG"
  },
  "codebases": [
    {
      "rootPath": "/path/to/your/project",
      "name": "My Project",
      "customMappings": [
        {
          "labelPatterns": ["frontend", "ui"],
          "modulePaths": ["src/components", "src/pages"],
          "instructions": "Follow React best practices"
        },
        {
          "labelPatterns": ["api", "backend"],
          "modulePaths": ["src/api", "src/services"],
          "instructions": "Ensure proper error handling"
        }
      ]
    }
  ],
  "routing": {
    "strategies": ["label-mapping", "keyword-extraction", "file-mention", "component-detection"],
    "confidenceThreshold": 0.3,
    "maxSuggestedFiles": 10
  },
  "claudeCode": {
    "createBranch": true,
    "branchPrefix": "fix/",
    "autoCommit": false,
    "includeTests": true
  }
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `LINEAR_API_KEY` | Your Linear API key |
| `LINEAR_TEAM_KEY` | Default team key |
| `LINEAR_CLAUDE_BRANCH_PREFIX` | Git branch prefix (default: `fix/`) |
| `LINEAR_CLAUDE_AUTO_COMMIT` | Auto-commit changes (default: `false`) |
| `LINEAR_CLAUDE_CREATE_BRANCH` | Create git branches (default: `true`) |

### Custom Issue-to-Code Mappings

You can teach the tool which code areas are relevant for different types of issues:

```bash
linear-claude map
```

This interactive wizard lets you:
1. Select Linear labels to map
2. Choose corresponding code modules
3. Add custom keywords
4. Provide special instructions

Example mapping:

```json
{
  "labelPatterns": ["authentication", "auth"],
  "keywordPatterns": ["login", "signup", "password", "session"],
  "modulePaths": ["src/auth", "src/middleware/auth"],
  "entryFiles": ["src/auth/index.ts"],
  "instructions": "Ensure all auth changes include proper security testing"
}
```

## CLI Reference

### Commands

| Command | Description |
|---------|-------------|
| `solve` | Fetch issues and solve with Claude Code |
| `list` | List issues without solving |
| `analyze` | Analyze codebase structure |
| `setup` | Interactive setup wizard |
| `map` | Configure issue-to-code mappings |
| `info` | Show current configuration |

### Solve Options

```bash
linear-claude solve [options]

Options:
  -t, --team <key>       Filter by team key (e.g., ENG)
  -p, --project <name>   Filter by project name
  -s, --status <status>  Filter by status (backlog, unstarted, started, completed)
  -l, --label <label>    Filter by label
  -a, --assignee <email> Filter by assignee email
  -m, --me               Show only issues assigned to me
  -q, --search <query>   Search issues by text
  -n, --limit <number>   Limit number of issues (default: 20)
  -c, --codebase <path>  Path to codebase (default: current directory)
  -i, --interactive      Run Claude Code in interactive mode
  -d, --dry-run          Preview without executing
  -v, --verbose          Verbose output
```

## Programmatic Usage

You can also use this as a library in your own tools:

```typescript
import {
  solveIssue,
  fetchIssues,
  analyzeCodebase,
  routeIssue,
} from 'linear-claude-code';

// Solve an issue by identifier
await solveIssue('ENG-123', {
  codebasePath: '/path/to/project',
  interactive: true,
});

// Fetch issues with filtering
const issues = await fetchIssues({
  teamKeys: ['ENG'],
  stateTypes: ['started'],
  labelNames: ['bug'],
  limit: 10,
});

// Analyze a codebase
const analysis = await analyzeCodebase('/path/to/project');
console.log('Tech stack:', analysis.config.techStack);
console.log('Modules:', analysis.config.modules);

// Route an issue to code
const route = await routeIssue(issues[0], analysis);
console.log('Relevant modules:', route.relevantModules);
console.log('Suggested files:', route.suggestedFiles);
console.log('Confidence:', route.confidence);
```

## Best Practices

### 1. Label Your Issues Well

The tool works best when issues have descriptive labels:
- Use labels like `frontend`, `backend`, `api`, `database`
- Add component-specific labels like `auth`, `payments`, `dashboard`
- Include issue type labels like `bug`, `feature`, `refactor`

### 2. Write Descriptive Issues

Include in your issue descriptions:
- Specific file paths when known
- Component or feature names
- Acceptance criteria as checkboxes
- Technical details about the expected behavior

### 3. Configure Custom Mappings

For your specific project, set up custom mappings:

```bash
linear-claude map
```

This teaches the tool your project's structure and conventions.

### 4. Use Team Filters

If you work on multiple projects:

```bash
linear-claude solve --team FRONTEND
linear-claude solve --team BACKEND
```

### 5. Review Before Proceeding

The tool shows routing results before invoking Claude Code. Review:
- The confidence score (higher is better)
- Suggested files (are they relevant?)
- Detected modules (does it make sense?)

## Troubleshooting

### "Linear API key not configured"

Set your API key:
```bash
export LINEAR_API_KEY=your-key
# or
linear-claude setup
```

### Low Confidence Routing

If routing confidence is low:
1. Add custom mappings with `linear-claude map`
2. Use more descriptive issue labels
3. Mention specific file paths in issue descriptions

### Claude Code Not Found

Ensure Claude Code is installed and in your PATH:
```bash
which claude
```

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Built with ❤️ for developers who love automation.
