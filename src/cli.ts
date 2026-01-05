#!/usr/bin/env node
/**
 * Linear-Claude Code CLI
 * Interactive CLI for fetching Linear issues and solving them with Claude Code
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

import { LinearAPIClient } from './linear';
import { CodebaseAnalyzer } from './analyzer';
import { IssueRouter } from './router';
import { ClaudeCodeInvoker, ContextBuilder } from './claude';
import { ConfigManager } from './config';
import { LinearIssue, IssueFilter, RouteResult, CodebaseAnalysis } from './types';

// Load environment variables
dotenv.config();

const program = new Command();
const configManager = new ConfigManager();

// Cache for analysis results
let cachedAnalysis: CodebaseAnalysis | null = null;

program
  .name('linear-claude')
  .description('Solve Linear issues with Claude Code - intelligently routes issues to relevant code')
  .version('1.0.0');

// ============ Main Solve Command ============

program
  .command('solve')
  .description('Fetch issues from Linear and solve them with Claude Code')
  .option('-t, --team <key>', 'Filter by team key (e.g., ENG)')
  .option('-p, --project <name>', 'Filter by project name')
  .option('-s, --status <status>', 'Filter by status (backlog, unstarted, started)')
  .option('-l, --label <label>', 'Filter by label')
  .option('-a, --assignee <email>', 'Filter by assignee email')
  .option('-m, --me', 'Show only issues assigned to me')
  .option('-q, --search <query>', 'Search issues by text')
  .option('-n, --limit <number>', 'Limit number of issues', '20')
  .option('-c, --codebase <path>', 'Path to codebase (defaults to current directory)')
  .option('-i, --interactive', 'Run Claude Code in interactive mode', false)
  .option('-d, --dry-run', 'Show what would be done without executing', false)
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (options) => {
    try {
      await loadConfig();

      const linearClient = new LinearAPIClient();
      const codebasePath = options.codebase || process.cwd();

      // Build filter from options
      const filter = buildFilter(options);

      // Fetch issues
      const spinner = ora('Fetching issues from Linear...').start();
      const issues = await linearClient.fetchIssues(filter);
      spinner.succeed(`Found ${issues.length} issues`);

      if (issues.length === 0) {
        console.log(chalk.yellow('\nNo issues found matching your criteria.'));
        return;
      }

      // Let user select an issue
      const selectedIssue = await selectIssue(issues);
      if (!selectedIssue) return;

      // Analyze codebase
      spinner.start('Analyzing codebase...');
      const analysis = await getOrAnalyzeCodebase(codebasePath);
      spinner.succeed(`Codebase analyzed: ${analysis.statistics.totalFiles} files`);

      // Route issue to code
      spinner.start('Routing issue to relevant code...');
      const router = new IssueRouter(analysis);
      const routeResult = await router.routeIssue(selectedIssue);
      spinner.succeed(`Found ${routeResult.relevantModules.length} relevant modules, ${routeResult.suggestedFiles.length} suggested files`);

      // Display routing results
      displayRouteResult(routeResult, options.verbose);

      // Confirm before proceeding
      const proceed = await confirmProceed(routeResult);
      if (!proceed) return;

      // Build rich context
      spinner.start('Building context for Claude Code...');
      const contextBuilder = new ContextBuilder(analysis);
      const fullContext = await contextBuilder.buildContext(selectedIssue, routeResult);
      spinner.succeed('Context built');

      // Invoke Claude Code
      const invoker = new ClaudeCodeInvoker();
      invoker.setAnalysis(analysis);

      console.log(chalk.cyan('\n🚀 Launching Claude Code...\n'));

      const session = await invoker.invoke(selectedIssue, routeResult, {
        workingDirectory: codebasePath,
        interactive: options.interactive,
        dryRun: options.dryRun,
        additionalContext: fullContext,
      });

      if (session.status === 'completed') {
        console.log(chalk.green('\n✅ Claude Code session completed successfully!'));
      } else if (session.error) {
        console.log(chalk.red(`\n❌ Session failed: ${session.error}`));
      }

    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============ List Issues Command ============

program
  .command('list')
  .description('List issues from Linear without solving')
  .option('-t, --team <key>', 'Filter by team key')
  .option('-s, --status <status>', 'Filter by status')
  .option('-l, --label <label>', 'Filter by label')
  .option('-m, --me', 'Show only issues assigned to me')
  .option('-n, --limit <number>', 'Limit number of issues', '20')
  .option('-v, --verbose', 'Show full details')
  .action(async (options) => {
    try {
      await loadConfig();
      const linearClient = new LinearAPIClient();
      const filter = buildFilter(options);

      const spinner = ora('Fetching issues...').start();
      const issues = await linearClient.fetchIssues(filter);
      spinner.succeed(`Found ${issues.length} issues`);

      displayIssueList(issues, options.verbose);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============ Analyze Command ============

program
  .command('analyze')
  .description('Analyze a codebase and show its structure')
  .option('-p, --path <path>', 'Path to codebase', process.cwd())
  .option('-s, --save', 'Save analysis to config')
  .action(async (options) => {
    try {
      const spinner = ora('Analyzing codebase...').start();
      const analyzer = new CodebaseAnalyzer(options.path);
      const analysis = await analyzer.analyze();
      spinner.succeed('Analysis complete');

      displayAnalysis(analysis);

      if (options.save) {
        configManager.addCodebase(analysis.config);
        await configManager.save();
        console.log(chalk.green('\n✅ Configuration saved'));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// ============ Setup Command ============

program
  .command('setup')
  .description('Interactive setup wizard')
  .action(async () => {
    console.log(chalk.cyan('\n🔧 Linear-Claude Setup Wizard\n'));

    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'linearApiKey',
        message: 'Enter your Linear API key:',
        validate: (input) => input.length > 0 || 'API key is required',
      },
      {
        type: 'input',
        name: 'defaultTeam',
        message: 'Default team key (optional, e.g., ENG):',
      },
      {
        type: 'input',
        name: 'codebasePath',
        message: 'Path to your main codebase:',
        default: process.cwd(),
      },
      {
        type: 'confirm',
        name: 'createBranch',
        message: 'Create git branch for each issue?',
        default: true,
      },
      {
        type: 'input',
        name: 'branchPrefix',
        message: 'Git branch prefix:',
        default: 'fix/',
        when: (answers) => answers.createBranch,
      },
    ]);

    // Save configuration
    configManager.setLinearApiKey(answers.linearApiKey);
    configManager.updateConfig({
      linear: {
        apiKey: answers.linearApiKey,
        defaultTeamKey: answers.defaultTeam || undefined,
      },
      claudeCode: {
        ...configManager.getConfig().claudeCode,
        createBranch: answers.createBranch,
        branchPrefix: answers.branchPrefix || 'fix/',
      },
    });

    // Analyze codebase
    if (answers.codebasePath) {
      const spinner = ora('Analyzing codebase...').start();
      try {
        const analyzer = new CodebaseAnalyzer(answers.codebasePath);
        const analysis = await analyzer.analyze();
        configManager.addCodebase(analysis.config);
        spinner.succeed('Codebase analyzed and saved');
      } catch (error) {
        spinner.fail('Could not analyze codebase');
      }
    }

    await configManager.save();
    console.log(chalk.green('\n✅ Setup complete! Configuration saved.'));
    console.log(chalk.dim(`\nRun 'linear-claude solve' to start solving issues.\n`));
  });

// ============ Configure Mapping Command ============

program
  .command('map')
  .description('Create custom issue-to-code mappings')
  .option('-p, --path <path>', 'Path to codebase', process.cwd())
  .action(async (options) => {
    await loadConfig();

    console.log(chalk.cyan('\n📍 Issue-to-Code Mapping Configuration\n'));

    const linearClient = new LinearAPIClient();

    // Get labels and teams
    const spinner = ora('Fetching Linear data...').start();
    const [teams, labels] = await Promise.all([
      linearClient.getTeams(),
      linearClient.getLabels(),
    ]);
    spinner.succeed('Loaded Linear data');

    // Analyze codebase for modules
    spinner.start('Analyzing codebase...');
    const analysis = await getOrAnalyzeCodebase(options.path);
    spinner.succeed('Codebase analyzed');

    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'labels',
        message: 'Select labels to map:',
        choices: labels.map(l => ({ name: l.name, value: l.name })),
      },
      {
        type: 'checkbox',
        name: 'modules',
        message: 'Select modules these labels should map to:',
        choices: analysis.config.modules.map(m => ({ name: `${m.name} (${m.path})`, value: m.path })),
      },
      {
        type: 'input',
        name: 'keywords',
        message: 'Additional keywords (comma-separated):',
      },
      {
        type: 'input',
        name: 'instructions',
        message: 'Special instructions for these issues:',
      },
    ]);

    if (answers.labels.length > 0 && answers.modules.length > 0) {
      configManager.addMapping(options.path, {
        labelPatterns: answers.labels,
        modulePaths: answers.modules,
        keywordPatterns: answers.keywords ? answers.keywords.split(',').map((k: string) => k.trim()) : undefined,
        instructions: answers.instructions || undefined,
      });

      await configManager.save();
      console.log(chalk.green('\n✅ Mapping saved!'));
    }
  });

// ============ Info Command ============

program
  .command('info')
  .description('Show current configuration and status')
  .action(async () => {
    await loadConfig();
    const config = configManager.getConfig();
    const validation = configManager.validate();

    console.log(chalk.cyan('\n📊 Linear-Claude Status\n'));

    console.log(chalk.bold('Configuration:'));
    console.log(`  Linear API Key: ${config.linear.apiKey ? chalk.green('✓ Set') : chalk.red('✗ Not set')}`);
    console.log(`  Default Team: ${config.linear.defaultTeamKey || chalk.dim('Not set')}`);
    console.log(`  Codebases: ${config.codebases.length}`);

    if (config.codebases.length > 0) {
      console.log(chalk.bold('\nConfigured Codebases:'));
      for (const cb of config.codebases) {
        console.log(`  - ${cb.name} (${cb.rootPath})`);
        console.log(`    Languages: ${cb.techStack.languages.join(', ') || 'Unknown'}`);
        console.log(`    Modules: ${cb.modules.length}`);
      }
    }

    console.log(chalk.bold('\nRouting Settings:'));
    console.log(`  Strategies: ${config.routing.strategies.join(', ')}`);
    console.log(`  Confidence Threshold: ${(config.routing.confidenceThreshold * 100).toFixed(0)}%`);

    console.log(chalk.bold('\nClaude Code Settings:'));
    console.log(`  Create Branch: ${config.claudeCode.createBranch ? 'Yes' : 'No'}`);
    console.log(`  Branch Prefix: ${config.claudeCode.branchPrefix}`);
    console.log(`  Auto Commit: ${config.claudeCode.autoCommit ? 'Yes' : 'No'}`);

    if (!validation.valid) {
      console.log(chalk.bold('\n⚠️  Configuration Issues:'));
      for (const error of validation.errors) {
        console.log(chalk.yellow(`  - ${error}`));
      }
    }

    console.log('');
  });

// ============ Helper Functions ============

async function loadConfig(): Promise<void> {
  await configManager.load();
}

function buildFilter(options: any): IssueFilter {
  const filter: IssueFilter = {
    limit: parseInt(options.limit, 10),
  };

  if (options.team) {
    filter.teamKeys = [options.team];
  }

  if (options.status) {
    const statusMap: Record<string, IssueFilter['stateTypes']> = {
      'backlog': ['backlog'],
      'unstarted': ['unstarted'],
      'started': ['started'],
      'completed': ['completed'],
      'canceled': ['canceled'],
      'todo': ['unstarted'],
      'in-progress': ['started'],
      'done': ['completed'],
    };
    filter.stateTypes = statusMap[options.status.toLowerCase()] || undefined;
  } else {
    // Default to active issues
    filter.stateTypes = ['unstarted', 'started'];
  }

  if (options.label) {
    filter.labelNames = [options.label];
  }

  if (options.me) {
    filter.assignedToMe = true;
  }

  if (options.search) {
    filter.searchQuery = options.search;
  }

  return filter;
}

async function getOrAnalyzeCodebase(codebasePath: string): Promise<CodebaseAnalysis> {
  const config = configManager.getConfig();
  const existing = config.codebases.find(c => c.rootPath === codebasePath);

  if (existing && cachedAnalysis && cachedAnalysis.config.rootPath === codebasePath) {
    return cachedAnalysis;
  }

  const analyzer = new CodebaseAnalyzer(codebasePath);
  cachedAnalysis = await analyzer.analyze();
  return cachedAnalysis;
}

async function selectIssue(issues: LinearIssue[]): Promise<LinearIssue | null> {
  const choices = issues.map(issue => ({
    name: formatIssueChoice(issue),
    value: issue.id,
    short: issue.identifier,
  }));

  choices.push({
    name: chalk.dim('Cancel'),
    value: 'cancel',
    short: 'Cancel',
  });

  const { selectedId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedId',
      message: 'Select an issue to solve:',
      choices,
      pageSize: 15,
    },
  ]);

  if (selectedId === 'cancel') {
    console.log(chalk.dim('Cancelled.'));
    return null;
  }

  return issues.find(i => i.id === selectedId) || null;
}

function formatIssueChoice(issue: LinearIssue): string {
  const priority = getPriorityIndicator(issue.priority);
  const labels = issue.labels.length > 0
    ? chalk.dim(` [${issue.labels.map(l => l.name).join(', ')}]`)
    : '';
  const state = chalk.cyan(`(${issue.state.name})`);

  return `${priority} ${chalk.bold(issue.identifier)} ${issue.title} ${state}${labels}`;
}

function getPriorityIndicator(priority: number): string {
  const indicators: Record<number, string> = {
    1: '🔴',
    2: '🟠',
    3: '🟡',
    4: '🟢',
  };
  return indicators[priority] || '⚪';
}

function displayRouteResult(result: RouteResult, verbose: boolean): void {
  console.log(chalk.bold('\n📍 Routing Results:\n'));

  console.log(`Confidence: ${chalk.cyan((result.confidence * 100).toFixed(0)}%`)}`);
  console.log(`Complexity: ${chalk.cyan(result.context.estimatedComplexity)}`);

  if (result.relevantModules.length > 0) {
    console.log(chalk.bold('\nRelevant Modules:'));
    for (const { module, score, matchReasons } of result.relevantModules.slice(0, 5)) {
      console.log(`  ${chalk.green('●')} ${module.name} (${module.path}) - ${(score * 100).toFixed(0)}%`);
      if (verbose && matchReasons.length > 0) {
        console.log(chalk.dim(`    ${matchReasons.slice(0, 2).join(', ')}`));
      }
    }
  }

  if (result.suggestedFiles.length > 0) {
    console.log(chalk.bold('\nSuggested Files:'));
    for (const file of result.suggestedFiles.slice(0, 8)) {
      console.log(`  ${chalk.blue('●')} ${file.path}`);
      if (verbose) {
        console.log(chalk.dim(`    ${file.reason}`));
      }
    }
  }

  console.log('');
}

async function confirmProceed(result: RouteResult): Promise<boolean> {
  if (result.confidence < 0.3) {
    console.log(chalk.yellow('\n⚠️  Low confidence routing. Claude Code may need more exploration.'));
  }

  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: 'Proceed with Claude Code?',
      default: true,
    },
  ]);

  return proceed;
}

function displayIssueList(issues: LinearIssue[], verbose: boolean): void {
  console.log('');

  for (const issue of issues) {
    const priority = getPriorityIndicator(issue.priority);
    const state = chalk.cyan(`[${issue.state.name}]`);
    const labels = issue.labels.length > 0
      ? chalk.dim(` (${issue.labels.map(l => l.name).join(', ')})`)
      : '';

    console.log(`${priority} ${chalk.bold(issue.identifier)} ${state} ${issue.title}${labels}`);

    if (verbose && issue.description) {
      const desc = issue.description.split('\n')[0].substring(0, 100);
      console.log(chalk.dim(`   ${desc}${issue.description.length > 100 ? '...' : ''}`));
    }
  }

  console.log('');
}

function displayAnalysis(analysis: CodebaseAnalysis): void {
  console.log(chalk.bold('\n📊 Codebase Analysis\n'));

  console.log(chalk.bold('Overview:'));
  console.log(`  Name: ${analysis.config.name}`);
  console.log(`  Files: ${analysis.statistics.totalFiles}`);
  console.log(`  Directories: ${analysis.statistics.totalDirectories}`);

  console.log(chalk.bold('\nTech Stack:'));
  console.log(`  Languages: ${analysis.config.techStack.languages.join(', ') || 'Unknown'}`);
  console.log(`  Frameworks: ${analysis.config.techStack.frameworks.join(', ') || 'None detected'}`);
  console.log(`  Build Tools: ${analysis.config.techStack.buildTools.join(', ') || 'None detected'}`);
  console.log(`  Testing: ${analysis.config.techStack.testFrameworks.join(', ') || 'None detected'}`);

  if (analysis.config.modules.length > 0) {
    console.log(chalk.bold('\nDetected Modules:'));
    for (const module of analysis.config.modules) {
      console.log(`  ${chalk.green('●')} ${module.name} (${module.path})`);
      if (module.keywords.length > 0) {
        console.log(chalk.dim(`    Keywords: ${module.keywords.slice(0, 5).join(', ')}`));
      }
    }
  }

  if (Object.keys(analysis.statistics.languageBreakdown).length > 0) {
    console.log(chalk.bold('\nFile Types:'));
    const sorted = Object.entries(analysis.statistics.filesByExtension)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
    for (const [ext, count] of sorted) {
      console.log(`  ${ext || '(no ext)'}: ${count} files`);
    }
  }

  console.log('');
}

// Parse and run
program.parse();
