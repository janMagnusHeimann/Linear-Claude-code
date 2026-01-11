#!/usr/bin/env node
/**
 * Quick setup script for Linear-Claude
 * Run with: npx ts-node src/setup.ts
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';

import { ConfigManager } from './config';
import { CodebaseAnalyzer } from './analyzer';
import { LinearAPIClient } from './linear';

async function main() {
  console.log(chalk.cyan(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║          🚀 Linear-Claude Setup Wizard 🚀             ║
║                                                       ║
║   Automatically solve Linear issues with Claude Code  ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
  `));

  const configManager = new ConfigManager();

  // Step 1: Linear API Key
  console.log(chalk.bold('\n📋 Step 1: Linear API Configuration\n'));
  console.log(chalk.dim('Get your API key from: https://linear.app/settings/api\n'));

  const { linearApiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'linearApiKey',
      message: 'Enter your Linear API key:',
      validate: async (input) => {
        if (!input) return 'API key is required';
        try {
          const client = new LinearAPIClient(input);
          await client.getTeams();
          return true;
        } catch (error) {
          return 'Invalid API key. Please check and try again.';
        }
      },
    },
  ]);

  configManager.setLinearApiKey(linearApiKey);

  // Step 2: Get teams and select default
  const spinner = ora('Fetching your Linear teams...').start();
  const client = new LinearAPIClient(linearApiKey);
  const teams = await client.getTeams();
  spinner.succeed(`Found ${teams.length} teams`);

  let defaultTeam: string | undefined;
  if (teams.length > 0) {
    const { selectedTeam } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedTeam',
        message: 'Select your default team:',
        choices: [
          ...teams.map(t => ({ name: `${t.name} (${t.key})`, value: t.key })),
          { name: chalk.dim('No default'), value: '' },
        ],
      },
    ]);
    defaultTeam = selectedTeam || undefined;
  }

  // Step 3: Codebase configuration
  console.log(chalk.bold('\n📁 Step 2: Codebase Configuration\n'));

  const { codebasePath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'codebasePath',
      message: 'Path to your main codebase:',
      default: process.cwd(),
      validate: (input) => {
        if (!fs.existsSync(input)) {
          return 'Path does not exist';
        }
        return true;
      },
    },
  ]);

  // Analyze the codebase
  spinner.start('Analyzing codebase structure...');
  const analyzer = new CodebaseAnalyzer(codebasePath);
  const analysis = await analyzer.analyze();
  spinner.succeed(`Analyzed ${analysis.statistics.totalFiles} files`);

  console.log(chalk.bold('\n📊 Detected Configuration:'));
  console.log(`   Languages: ${analysis.config.techStack.languages.join(', ') || 'Unknown'}`);
  console.log(`   Frameworks: ${analysis.config.techStack.frameworks.join(', ') || 'None detected'}`);
  console.log(`   Modules: ${analysis.config.modules.length} detected`);

  if (analysis.config.modules.length > 0) {
    console.log(chalk.dim('\n   Modules found:'));
    for (const mod of analysis.config.modules.slice(0, 5)) {
      console.log(chalk.dim(`   - ${mod.name} (${mod.path})`));
    }
    if (analysis.config.modules.length > 5) {
      console.log(chalk.dim(`   ... and ${analysis.config.modules.length - 5} more`));
    }
  }

  // Step 4: Claude Code options
  console.log(chalk.bold('\n⚙️  Step 3: Claude Code Options\n'));

  const claudeOptions = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'createBranch',
      message: 'Create a git branch for each issue?',
      default: true,
    },
    {
      type: 'input',
      name: 'branchPrefix',
      message: 'Branch name prefix:',
      default: 'fix/',
      when: (answers) => answers.createBranch,
    },
    {
      type: 'confirm',
      name: 'includeTests',
      message: 'Include test context when solving issues?',
      default: true,
    },
  ]);

  // Step 5: Save configuration
  console.log(chalk.bold('\n💾 Step 4: Save Configuration\n'));

  const { saveLocation } = await inquirer.prompt([
    {
      type: 'list',
      name: 'saveLocation',
      message: 'Where to save configuration?',
      choices: [
        { name: `Project directory (${codebasePath})`, value: 'project' },
        { name: 'Home directory (global)', value: 'home' },
      ],
    },
  ]);

  // Build final config
  configManager.updateConfig({
    linear: {
      apiKey: linearApiKey,
      defaultTeamKey: defaultTeam,
    },
    claudeCode: {
      ...configManager.getConfig().claudeCode,
      createBranch: claudeOptions.createBranch,
      branchPrefix: claudeOptions.branchPrefix || 'fix/',
      includeTests: claudeOptions.includeTests,
    },
  });
  configManager.addCodebase(analysis.config);

  // Save
  const configPath = saveLocation === 'project'
    ? path.join(codebasePath, '.linear-claude.json')
    : path.join(require('os').homedir(), '.linear-claude.json');

  await configManager.save(configPath);

  // Done!
  console.log(chalk.green(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║              ✅ Setup Complete! ✅                    ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
  `));

  console.log(chalk.bold('Configuration saved to:'), configPath);
  console.log('');
  console.log(chalk.bold('Next steps:'));
  console.log('');
  console.log('  1. Solve an issue:');
  console.log(chalk.cyan('     linear-claude solve'));
  console.log('');
  console.log('  2. List available issues:');
  console.log(chalk.cyan('     linear-claude list'));
  console.log('');
  console.log('  3. Configure custom mappings:');
  console.log(chalk.cyan('     linear-claude map'));
  console.log('');
  console.log(chalk.dim('Tip: Use --help with any command for more options'));
  console.log('');
}

main().catch(console.error);
