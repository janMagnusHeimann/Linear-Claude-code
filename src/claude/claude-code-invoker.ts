/**
 * Claude Code Invoker
 * Spawns and manages Claude Code sessions with intelligent context injection
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  LinearIssue,
  RouteResult,
  ClaudeCodeSession,
  SessionContext,
  CodebaseAnalysis,
  ClaudeCodeConfig,
} from '../types';

export interface InvokeOptions {
  workingDirectory: string;
  autoCommit?: boolean;
  createBranch?: boolean;
  branchPrefix?: string;
  includeTests?: boolean;
  interactive?: boolean;
  dryRun?: boolean;
  additionalContext?: string;
}

export class ClaudeCodeInvoker {
  private config: ClaudeCodeConfig;
  private sessions: Map<string, ClaudeCodeSession> = new Map();
  private analysis?: CodebaseAnalysis;

  constructor(config?: Partial<ClaudeCodeConfig>) {
    this.config = {
      maxConcurrentSessions: 1,
      autoCommit: false,
      createBranch: true,
      branchPrefix: 'fix/',
      includeTests: true,
      reviewBeforeMerge: true,
      ...config,
    };
  }

  /**
   * Set the codebase analysis for context generation
   */
  setAnalysis(analysis: CodebaseAnalysis): void {
    this.analysis = analysis;
  }

  /**
   * Invoke Claude Code to solve an issue
   */
  async invoke(
    issue: LinearIssue,
    routeResult: RouteResult,
    options: InvokeOptions
  ): Promise<ClaudeCodeSession> {
    const session: ClaudeCodeSession = {
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      workingDirectory: options.workingDirectory,
      context: this.buildSessionContext(issue, routeResult, options),
      status: 'pending',
    };

    this.sessions.set(issue.id, session);

    if (options.dryRun) {
      console.log('\n📋 DRY RUN - Would invoke Claude Code with:');
      console.log(this.formatPrompt(session.context));
      session.status = 'completed';
      return session;
    }

    try {
      // Create branch if configured
      if (options.createBranch || this.config.createBranch) {
        const branchName = this.generateBranchName(issue, options.branchPrefix);
        await this.createGitBranch(options.workingDirectory, branchName);
      }

      // Generate the prompt file
      const promptFile = await this.createPromptFile(session, options.workingDirectory);

      // Invoke Claude Code
      session.status = 'running';
      session.startedAt = new Date();

      if (options.interactive) {
        await this.invokeInteractive(session, promptFile, options.workingDirectory);
      } else {
        await this.invokeNonInteractive(session, promptFile, options.workingDirectory);
      }

      session.status = 'completed';
      session.completedAt = new Date();
    } catch (error) {
      session.status = 'failed';
      session.error = error instanceof Error ? error.message : String(error);
    }

    return session;
  }

  /**
   * Build the context for Claude Code session
   */
  private buildSessionContext(
    issue: LinearIssue,
    routeResult: RouteResult,
    options: InvokeOptions
  ): SessionContext {
    // Format issue details
    const issueDetails = this.formatIssueDetails(issue);

    // Format codebase overview
    const codebaseOverview = this.formatCodebaseOverview(routeResult);

    // Get relevant files
    const relevantFiles = routeResult.suggestedFiles.map(f => f.path);

    // Generate instructions
    const instructions = this.generateInstructions(issue, routeResult, options);

    return {
      issueDetails,
      codebaseOverview,
      relevantFiles,
      instructions,
      additionalContext: options.additionalContext,
    };
  }

  /**
   * Format issue details for the prompt
   */
  private formatIssueDetails(issue: LinearIssue): string {
    const lines: string[] = [
      `## Issue: ${issue.identifier} - ${issue.title}`,
      '',
      `**URL:** ${issue.url}`,
      `**Priority:** ${this.formatPriority(issue.priority)}`,
      `**Status:** ${issue.state.name}`,
    ];

    if (issue.labels.length > 0) {
      lines.push(`**Labels:** ${issue.labels.map(l => l.name).join(', ')}`);
    }

    if (issue.assignee) {
      lines.push(`**Assignee:** ${issue.assignee.name}`);
    }

    if (issue.estimate) {
      lines.push(`**Estimate:** ${issue.estimate} points`);
    }

    lines.push('', '### Description', '');

    if (issue.description) {
      lines.push(issue.description);
    } else {
      lines.push('*No description provided*');
    }

    if (issue.comments.length > 0) {
      lines.push('', '### Comments', '');
      for (const comment of issue.comments.slice(0, 5)) {
        lines.push(`> ${comment.body.split('\n').join('\n> ')}`);
        lines.push('');
      }
    }

    if (issue.parentIssue) {
      lines.push(`**Parent Issue:** ${issue.parentIssue.identifier}`);
    }

    if (issue.subIssues.length > 0) {
      lines.push(`**Sub-issues:** ${issue.subIssues.map(s => s.identifier).join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Format codebase overview for the prompt
   */
  private formatCodebaseOverview(routeResult: RouteResult): string {
    const lines: string[] = [
      '## Codebase Context',
      '',
    ];

    // Relevant modules
    if (routeResult.relevantModules.length > 0) {
      lines.push('### Relevant Modules');
      lines.push('');
      for (const { module, score, matchReasons } of routeResult.relevantModules) {
        lines.push(`**${module.name}** (${module.path}) - Confidence: ${(score * 100).toFixed(0)}%`);
        lines.push(`  - ${module.description}`);
        if (matchReasons.length > 0) {
          lines.push(`  - Matched because: ${matchReasons.slice(0, 2).join('; ')}`);
        }
        lines.push('');
      }
    }

    // Suggested files
    if (routeResult.suggestedFiles.length > 0) {
      lines.push('### Suggested Starting Files');
      lines.push('');
      for (const file of routeResult.suggestedFiles.slice(0, 10)) {
        lines.push(`- \`${file.path}\` - ${file.reason}`);
      }
      lines.push('');
    }

    // Tech stack
    if (this.analysis) {
      lines.push('### Tech Stack');
      lines.push('');
      const { techStack } = this.analysis.config;
      if (techStack.languages.length > 0) {
        lines.push(`- **Languages:** ${techStack.languages.join(', ')}`);
      }
      if (techStack.frameworks.length > 0) {
        lines.push(`- **Frameworks:** ${techStack.frameworks.join(', ')}`);
      }
      if (techStack.testFrameworks.length > 0) {
        lines.push(`- **Testing:** ${techStack.testFrameworks.join(', ')}`);
      }
      lines.push('');
    }

    // Context analysis
    lines.push('### Analysis');
    lines.push('');
    lines.push(`- **Routing Confidence:** ${(routeResult.confidence * 100).toFixed(0)}%`);
    lines.push(`- **Estimated Complexity:** ${routeResult.context.estimatedComplexity}`);
    if (routeResult.context.requiredSkills.length > 0) {
      lines.push(`- **Required Skills:** ${routeResult.context.requiredSkills.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Generate detailed instructions for Claude Code
   */
  private generateInstructions(
    issue: LinearIssue,
    routeResult: RouteResult,
    options: InvokeOptions
  ): string {
    const lines: string[] = [
      '## Instructions',
      '',
      'Please solve the issue described above. Follow these guidelines:',
      '',
      '### Approach',
      '',
      routeResult.context.suggestedApproach,
      '',
      '### Requirements',
      '',
      '1. **Understand First:** Read and understand the relevant code before making changes',
      '2. **Minimal Changes:** Make only the changes necessary to solve the issue',
      '3. **Follow Patterns:** Match the existing code style and patterns in the codebase',
      '4. **No Regressions:** Ensure your changes don\'t break existing functionality',
    ];

    if (options.includeTests || this.config.includeTests) {
      lines.push('5. **Add Tests:** Write tests for your changes if the codebase has tests');
    }

    lines.push('');
    lines.push('### Files to Focus On');
    lines.push('');

    if (routeResult.suggestedFiles.length > 0) {
      lines.push('Start by examining these files:');
      lines.push('');
      for (const file of routeResult.suggestedFiles.slice(0, 5)) {
        lines.push(`- \`${file.path}\``);
      }
    } else {
      lines.push('No specific files identified - explore the codebase structure to find relevant code.');
    }

    if (routeResult.relevantModules.length > 0) {
      lines.push('');
      lines.push('Focus on these modules:');
      lines.push('');
      for (const { module } of routeResult.relevantModules.slice(0, 3)) {
        lines.push(`- **${module.name}** (\`${module.path}\`)`);
      }
    }

    lines.push('');
    lines.push('### Completion');
    lines.push('');
    lines.push('When done:');
    lines.push('1. Verify your changes work as expected');
    lines.push('2. Ensure no linting or type errors');

    if (options.autoCommit || this.config.autoCommit) {
      lines.push(`3. Commit your changes with message: "fix(${issue.identifier}): [brief description]"`);
    }

    if (options.additionalContext) {
      lines.push('');
      lines.push('### Additional Context');
      lines.push('');
      lines.push(options.additionalContext);
    }

    return lines.join('\n');
  }

  /**
   * Create a prompt file for Claude Code
   */
  private async createPromptFile(
    session: ClaudeCodeSession,
    workingDirectory: string
  ): Promise<string> {
    const prompt = this.formatPrompt(session.context);

    // Create .claude directory if it doesn't exist
    const claudeDir = path.join(workingDirectory, '.claude');
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    // Write prompt file
    const promptFile = path.join(claudeDir, `issue-${session.issueIdentifier}.md`);
    fs.writeFileSync(promptFile, prompt);

    return promptFile;
  }

  /**
   * Format the complete prompt
   */
  formatPrompt(context: SessionContext): string {
    return [
      '# Linear Issue Resolution',
      '',
      context.issueDetails,
      '',
      '---',
      '',
      context.codebaseOverview,
      '',
      '---',
      '',
      context.instructions,
      '',
      context.additionalContext ? `---\n\n${context.additionalContext}` : '',
    ].join('\n');
  }

  /**
   * Invoke Claude Code in interactive mode
   */
  private async invokeInteractive(
    session: ClaudeCodeSession,
    promptFile: string,
    workingDirectory: string
  ): Promise<void> {
    const prompt = fs.readFileSync(promptFile, 'utf-8');

    console.log('\n🚀 Launching Claude Code...\n');
    console.log('Working directory:', workingDirectory);
    console.log('Issue:', session.issueIdentifier);
    console.log('\n' + '='.repeat(60) + '\n');

    // Launch Claude Code with the prompt
    return new Promise((resolve, reject) => {
      const child = spawn('claude', [], {
        cwd: workingDirectory,
        stdio: 'inherit',
        shell: true,
      });

      // Pipe the prompt to stdin after a short delay
      setTimeout(() => {
        if (child.stdin) {
          child.stdin.write(prompt);
          child.stdin.end();
        }
      }, 1000);

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Claude Code exited with code ${code}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Invoke Claude Code in non-interactive (print) mode
   */
  private async invokeNonInteractive(
    session: ClaudeCodeSession,
    promptFile: string,
    workingDirectory: string
  ): Promise<void> {
    const prompt = fs.readFileSync(promptFile, 'utf-8');

    console.log('\n🤖 Running Claude Code (non-interactive)...\n');

    return new Promise((resolve, reject) => {
      const child = spawn('claude', ['-p', prompt], {
        cwd: workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      let output = '';
      let errorOutput = '';

      child.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        process.stdout.write(text);
      });

      child.stderr?.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        process.stderr.write(text);
      });

      child.on('close', (code) => {
        session.output = output;
        if (code === 0) {
          resolve();
        } else {
          session.error = errorOutput || `Exit code: ${code}`;
          reject(new Error(session.error));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Generate a git branch name from issue
   */
  private generateBranchName(issue: LinearIssue, prefix?: string): string {
    const branchPrefix = prefix || this.config.branchPrefix;
    const slug = issue.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    return `${branchPrefix}${issue.identifier.toLowerCase()}-${slug}`;
  }

  /**
   * Create a git branch
   */
  private async createGitBranch(workingDirectory: string, branchName: string): Promise<void> {
    try {
      // Check if we're in a git repo
      execSync('git rev-parse --git-dir', { cwd: workingDirectory, stdio: 'pipe' });

      // Check if branch exists
      try {
        execSync(`git rev-parse --verify ${branchName}`, { cwd: workingDirectory, stdio: 'pipe' });
        // Branch exists, checkout
        execSync(`git checkout ${branchName}`, { cwd: workingDirectory, stdio: 'pipe' });
        console.log(`📌 Switched to existing branch: ${branchName}`);
      } catch {
        // Branch doesn't exist, create it
        execSync(`git checkout -b ${branchName}`, { cwd: workingDirectory, stdio: 'pipe' });
        console.log(`🌿 Created new branch: ${branchName}`);
      }
    } catch (error) {
      console.warn('⚠️  Could not create git branch:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Format priority for display
   */
  private formatPriority(priority: number): string {
    const priorities: Record<number, string> = {
      0: 'No priority',
      1: '🔴 Urgent',
      2: '🟠 High',
      3: '🟡 Medium',
      4: '🟢 Low',
    };
    return priorities[priority] || 'Unknown';
  }

  /**
   * Get session by issue ID
   */
  getSession(issueId: string): ClaudeCodeSession | undefined {
    return this.sessions.get(issueId);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): ClaudeCodeSession[] {
    return [...this.sessions.values()];
  }
}

export default ClaudeCodeInvoker;
