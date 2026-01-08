import { spawn, ChildProcess, execSync } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { BrowserWindow, Notification } from 'electron';
import Store from 'electron-store';
import { PlanReviewer, ReviewResult } from './plan-reviewer';
import { PromptEnhancer } from './prompt-enhancer';

export type ExecutionState =
  | 'INITIALIZING'
  | 'PLANNING'
  | 'AWAITING_APPROVAL'
  | 'REVIEWING_PLAN'
  | 'IMPLEMENTING'
  | 'COMPLETE'
  | 'ERROR'
  | 'CANCELLED';

export interface ExecutionSession {
  id: string;
  issueId: string;
  issueTitle: string;
  issueDescription?: string;
  issueUrl?: string;
  issueLabels: string[];
  workingDirectory: string;
  prompt: string;
  branchName?: string;
  process: ChildProcess | null;
  state: ExecutionState;
  outputBuffer: string;
  plan?: string;
  reviewResult?: ReviewResult;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface SessionOptions {
  workingDirectory: string;
  prompt: string;
  branchName?: string;
  issueId: string;
  issueTitle: string;
  issueDescription?: string;
  issueUrl?: string;
  issueLabels?: string[];
}

export interface ProgressUpdate {
  sessionId: string;
  stage: ExecutionState;
  output: string;
  plan?: string;
  reviewResult?: ReviewResult;
  error?: string;
}

export class ClaudeCodeExecutor {
  private sessions: Map<string, ExecutionSession> = new Map();
  private planReviewer: PlanReviewer;
  private promptEnhancer: PromptEnhancer | null = null;
  private mainWindow: BrowserWindow | null = null;
  private store: Store;

  constructor(options: {
    anthropicApiKey?: string;
    promptEnhancementEnabled?: boolean;
  }) {
    this.planReviewer = new PlanReviewer({ apiKey: options.anthropicApiKey });
    this.store = new Store({ name: 'linear-claude-settings' });

    // Initialize prompt enhancer if enabled and API key provided
    if (options.promptEnhancementEnabled && options.anthropicApiKey) {
      this.promptEnhancer = new PromptEnhancer(options.anthropicApiKey);
    }
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  async startSession(options: SessionOptions): Promise<string> {
    const sessionId = randomUUID();

    const session: ExecutionSession = {
      id: sessionId,
      issueId: options.issueId,
      issueTitle: options.issueTitle,
      issueDescription: options.issueDescription,
      issueUrl: options.issueUrl,
      issueLabels: options.issueLabels || [],
      workingDirectory: options.workingDirectory,
      prompt: options.prompt,
      branchName: options.branchName,
      process: null,
      state: 'INITIALIZING',
      outputBuffer: '',
      startedAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    // Start execution asynchronously
    this.executeSession(session).catch((error) => {
      console.error('Session execution error:', error);
      session.state = 'ERROR';
      session.error = error.message;
      this.sendProgress(sessionId, { output: `\nError: ${error.message}\n` });
    });

    return sessionId;
  }

  private async executeSession(session: ExecutionSession): Promise<void> {
    try {
      // Check if claude.md exists (optional, not required)
      const claudeMdPath = path.join(session.workingDirectory, 'claude.md');
      const claudeMdExists = fs.existsSync(claudeMdPath);
      let claudeMdContent: string | undefined;

      if (claudeMdExists) {
        this.sendProgress(session.id, {
          output: '✓ Found existing claude.md\n'
        });
        claudeMdContent = fs.readFileSync(claudeMdPath, 'utf-8');
      } else {
        this.sendProgress(session.id, {
          output: 'ℹ️  No claude.md found. For better results, run `claude` and type `/init` in your project.\n'
        });
      }

      // NEW: Enhance prompt if enabled
      let finalPrompt = session.prompt;

      if (this.promptEnhancer && claudeMdContent) {
        this.sendProgress(session.id, {
          output: '🤖 Enhancing prompt with AI...\n'
        });

        finalPrompt = await this.promptEnhancer.enhancePrompt({
          issueTitle: session.issueTitle,
          issueDescription: session.prompt,
          issueLabels: session.issueLabels,
          claudeMdContent: claudeMdContent,
        });

        this.sendProgress(session.id, {
          output: '✓ Prompt enhanced\n'
        });
      }

      // Write enhanced/original prompt file
      const promptFile = path.join(session.workingDirectory, '.claude', 'current-issue.md');
      const claudeDir = path.dirname(promptFile);

      if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
      }
      fs.writeFileSync(promptFile, finalPrompt);

      // Update session with final prompt
      session.prompt = finalPrompt;

      // Create git branch if specified
      if (session.branchName) {
        try {
          execSync(`git checkout -b ${session.branchName}`, {
            cwd: session.workingDirectory,
            stdio: 'pipe'
          });
        } catch (error) {
          // Branch might already exist, try to checkout
          try {
            execSync(`git checkout ${session.branchName}`, {
              cwd: session.workingDirectory,
              stdio: 'pipe'
            });
          } catch {
            // Ignore branch errors
          }
        }
      }

      // Spawn Claude Code
      session.state = 'PLANNING';
      this.sendProgress(session.id, { output: 'Starting Claude Code...\n' });

      const claudeProcess = this.spawnClaudeCode(session);
      session.process = claudeProcess;

    } catch (error: any) {
      session.state = 'ERROR';
      session.error = error.message;
      this.sendProgress(session.id, { output: `\nFatal error: ${error.message}\n` });
    }
  }

  private spawnClaudeCode(session: ExecutionSession): ChildProcess {
    // Spawn Claude Code with plan mode
    const claudeProcess = spawn('claude', ['--permission-mode', 'plan'], {
      cwd: session.workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env },
    });

    // Handle stdout
    claudeProcess.stdout?.on('data', (data: Buffer) => {
      this.handleStdout(session.id, data);
    });

    // Handle stderr
    claudeProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      session.outputBuffer += output;
      this.sendProgress(session.id, { output });
    });

    // Handle process exit
    claudeProcess.on('exit', (code: number | null, signal: string | null) => {
      if (code === 0 && session.state !== 'ERROR' && session.state !== 'CANCELLED') {
        session.state = 'COMPLETE';
        session.completedAt = new Date();
        this.sendProgress(session.id, { output: '\n✓ Claude Code completed successfully!\n' });

        // Commit changes before pushing
        if (session.branchName) {
          this.commitChanges(session);
        }

        // Push branch to remote if one was created
        if (session.branchName) {
          this.pushBranch(session).catch(error => {
            console.error('Error in pushBranch:', error);
          });
        }

        this.sendNotification(session);
      } else if (session.state !== 'CANCELLED') {
        session.state = 'ERROR';
        session.error = `Process exited with code ${code}, signal ${signal}`;
        this.sendProgress(session.id, { output: `\nError: Process exited unexpectedly (code: ${code})\n` });
      }
    });

    // Handle errors
    claudeProcess.on('error', (error: Error) => {
      session.state = 'ERROR';
      session.error = error.message;
      this.sendProgress(session.id, {
        output: `\nError spawning Claude Code: ${error.message}\n` +
                'Make sure Claude Code is installed (npm install -g claude-code)\n'
      });
    });

    // Add stdin error handling
    claudeProcess.stdin?.on('error', (error: Error) => {
      console.error('stdin write error:', error);
      session.state = 'ERROR';
      session.error = `Failed to send prompt: ${error.message}`;
      this.sendProgress(session.id, { output: `\nError writing to stdin: ${error.message}\n` });
    });

    // Send initial prompt after a delay
    setTimeout(() => {
      if (claudeProcess.stdin && !claudeProcess.stdin.destroyed) {
        claudeProcess.stdin.write(session.prompt + '\n');
        claudeProcess.stdin.end(); // Signal EOF - important for Claude Code to start processing
      }
    }, 1000);

    return claudeProcess;
  }

  private handleStdout(sessionId: string, data: Buffer): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const output = data.toString();
    session.outputBuffer += output;

    // Send output to renderer
    this.sendProgress(sessionId, { output });

    // Detect state transitions
    const newState = this.detectState(session.outputBuffer, session.state);
    if (newState !== session.state) {
      const oldState = session.state;
      session.state = newState;

      // Handle state-specific logic
      if (newState === 'AWAITING_APPROVAL') {
        this.handlePlanReady(session);
      }
    }
  }

  private detectState(output: string, currentState: ExecutionState): ExecutionState {
    const lowerOutput = output.toLowerCase();

    // Check for plan-related patterns
    if (lowerOutput.includes('implementation plan') ||
        lowerOutput.includes('## plan') ||
        (lowerOutput.includes('plan:') && lowerOutput.includes('step'))) {

      // Check if waiting for approval
      if (lowerOutput.includes('approve') ||
          lowerOutput.includes('proceed') ||
          lowerOutput.includes('continue') ||
          lowerOutput.includes('ready to')) {
        return 'AWAITING_APPROVAL';
      }

      return 'PLANNING';
    }

    // Check for implementation phase
    if (currentState === 'IMPLEMENTING' ||
        lowerOutput.includes('implementing') ||
        lowerOutput.includes('applying changes') ||
        lowerOutput.includes('writing file') ||
        lowerOutput.includes('editing file')) {
      return 'IMPLEMENTING';
    }

    // Default to current state if no clear transition
    return currentState;
  }

  private extractPlan(output: string): string | null {
    // Try to extract plan content
    const planPatterns = [
      /(?:implementation plan|plan:)([\s\S]*?)(?:(?:approve|proceed|ready to)|$)/i,
      /## plan\s+([\s\S]*?)(?:##|$)/i,
      /(?:here'?s? (?:the|my) plan:?)([\s\S]*?)(?:(?:approve|proceed|ready to)|$)/i,
    ];

    for (const pattern of planPatterns) {
      const match = output.match(pattern);
      if (match && match[1] && match[1].trim().length > 50) {
        return match[1].trim();
      }
    }

    // If no specific pattern, look for a large block of text after "plan"
    const planIndex = output.toLowerCase().lastIndexOf('plan');
    if (planIndex !== -1) {
      const afterPlan = output.slice(planIndex);
      if (afterPlan.length > 100) {
        return afterPlan.trim();
      }
    }

    return null;
  }

  private async handlePlanReady(session: ExecutionSession): Promise<void> {
    // Extract plan
    const plan = this.extractPlan(session.outputBuffer);
    if (!plan) {
      console.warn('Could not extract plan from output');
      // Auto-approve if we can't extract plan
      this.approvePlan(session.id);
      return;
    }

    session.plan = plan;
    this.sendProgress(session.id, { plan });

    // Review plan
    session.state = 'REVIEWING_PLAN';
    this.sendProgress(session.id, { output: '\n🤖 Reviewing plan with AI...\n' });

    try {
      const reviewResult = await this.planReviewer.reviewPlan(plan, {
        issueTitle: session.issueTitle,
        issueDescription: session.prompt,
        workingDirectory: session.workingDirectory,
      });

      session.reviewResult = reviewResult;
      this.sendProgress(session.id, { reviewResult });

      // Auto-approve if recommended
      if (reviewResult.recommendation === 'approve') {
        this.sendProgress(session.id, {
          output: `\n✓ Plan approved by AI (${reviewResult.confidence} confidence)\n`
        });
        setTimeout(() => this.approvePlan(session.id), 1000);
      } else if (reviewResult.recommendation === 'reject') {
        this.sendProgress(session.id, {
          output: `\n⚠ Plan rejected by AI: ${reviewResult.reasoning}\n` +
                  'Cancelling execution. Please review manually.\n'
        });
        setTimeout(() => this.cancelSession(session.id), 2000);
      } else {
        // Manual review required
        this.sendProgress(session.id, {
          output: `\n⚠ Manual review recommended: ${reviewResult.reasoning}\n` +
                  'Waiting for user decision...\n'
        });
      }
    } catch (error: any) {
      console.error('Plan review error:', error);
      this.sendProgress(session.id, {
        output: `\n⚠ Plan review failed: ${error.message}\n` +
                'Auto-approving to continue...\n'
      });
      setTimeout(() => this.approvePlan(session.id), 1000);
    }
  }

  async approvePlan(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.process || !session.process.stdin) {
      return;
    }

    session.state = 'IMPLEMENTING';
    this.sendProgress(sessionId, { output: '\n→ Proceeding with implementation...\n' });

    // Send approval to Claude Code
    try {
      session.process.stdin.write('yes\n');
    } catch (error: any) {
      console.error('Error sending approval:', error);
    }
  }

  async cancelSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.state = 'CANCELLED';

    if (session.process) {
      try {
        // Try to send 'no' first
        if (session.process.stdin && !session.process.stdin.destroyed) {
          session.process.stdin.write('no\n');
        }

        // Kill the process
        setTimeout(() => {
          if (session.process && !session.process.killed) {
            session.process.kill('SIGTERM');
          }
        }, 500);
      } catch (error) {
        console.error('Error cancelling session:', error);
      }
    }

    this.sendProgress(sessionId, { output: '\n✗ Execution cancelled by user.\n' });
  }

  getSession(sessionId: string): ExecutionSession | undefined {
    return this.sessions.get(sessionId);
  }

  private sendProgress(sessionId: string, update: Partial<ProgressUpdate>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const progressUpdate: ProgressUpdate = {
      sessionId,
      stage: session.state,
      output: update.output || '',
      plan: update.plan || session.plan,
      reviewResult: update.reviewResult || session.reviewResult,
      error: update.error || session.error,
    };

    // Send to renderer via IPC
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('claude-code:progress', progressUpdate);
    }
  }

  private sendNotification(session: ExecutionSession): void {
    const notification = new Notification({
      title: 'Claude Code Complete',
      body: `Successfully completed ${session.issueId}: ${session.issueTitle}`,
      silent: false,
    });

    notification.on('click', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    });

    notification.show();
  }

  private async pushBranch(session: ExecutionSession): Promise<void> {
    if (!session.branchName) return;

    try {
      this.sendProgress(session.id, { output: `\n📤 Pushing branch to remote...\n` });

      // Push branch with upstream tracking
      execSync(`git push -u origin ${session.branchName}`, {
        cwd: session.workingDirectory,
        stdio: 'pipe'
      });

      this.sendProgress(session.id, {
        output: `✓ Branch pushed to GitHub: ${session.branchName}\n`
      });

      // Get PR settings from store
      const createPR = this.store.get('createPR') as boolean;
      const prBaseBranch = this.store.get('prBaseBranch') as string;

      // Attempt to create PR if enabled
      if (createPR) {
        const prUrl = await this.createPullRequest(session, {
          baseBranch: prBaseBranch || 'main',
          createPR: true,
        });

        // If PR creation failed or was skipped, show branch URL
        if (!prUrl) {
          const branchUrl = this.getGitHubBranchUrl(session.workingDirectory, session.branchName);
          if (branchUrl) {
            this.sendProgress(session.id, {
              output: `🔗 View branch on GitHub: ${branchUrl}\n`
            });
          }
        }
      } else {
        // If PR creation is disabled, show branch URL
        const branchUrl = this.getGitHubBranchUrl(session.workingDirectory, session.branchName);
        if (branchUrl) {
          this.sendProgress(session.id, {
            output: `🔗 View on GitHub: ${branchUrl}\n`
          });
        }
      }
    } catch (error: any) {
      // Don't fail the whole operation if push fails
      console.error('Failed to push branch:', error);
      this.sendProgress(session.id, {
        output: `⚠️  Could not push branch to remote: ${error.message}\n` +
                `You can manually push with: git push -u origin ${session.branchName}\n`
      });
    }
  }

  private commitChanges(session: ExecutionSession): void {
    if (!session.branchName) return;

    try {
      // Check if there are uncommitted changes
      const gitStatus = execSync('git status --porcelain', {
        cwd: session.workingDirectory,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();

      if (!gitStatus) {
        // No changes to commit
        this.sendProgress(session.id, {
          output: 'ℹ️  No changes to commit\n',
        });
        return;
      }

      this.sendProgress(session.id, { output: '\n📝 Committing changes...\n' });

      // Stage all changes
      execSync('git add -A', {
        cwd: session.workingDirectory,
        stdio: 'pipe',
      });

      // Build commit message
      const commitMessage = `${session.issueId}: ${session.issueTitle}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>`;

      // Commit with heredoc for proper formatting
      const commitCommand = `git commit -m "$(cat <<'EOF'
${commitMessage}
EOF
)"`;

      execSync(commitCommand, {
        cwd: session.workingDirectory,
        stdio: 'pipe',
      });

      this.sendProgress(session.id, {
        output: `✓ Changes committed: ${session.issueId}: ${session.issueTitle}\n`,
      });
    } catch (error: any) {
      // Don't fail the whole operation if commit fails
      console.error('Failed to commit changes:', error);
      this.sendProgress(session.id, {
        output:
          `⚠️  Failed to commit changes: ${error.message}\n` +
          'You can manually commit with: git add -A && git commit\n',
      });
    }
  }

  private getGitHubBranchUrl(workingDirectory: string, branchName: string): string | null {
    try {
      // Get the remote URL
      const remoteUrl = execSync('git config --get remote.origin.url', {
        cwd: workingDirectory,
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();

      // Parse GitHub URL (supports both HTTPS and SSH formats)
      // HTTPS: https://github.com/owner/repo.git
      // SSH: git@github.com:owner/repo.git
      const match = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);

      if (match) {
        const owner = match[1];
        const repo = match[2].replace(/\.git$/, '');
        return `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branchName)}`;
      }

      return null;
    } catch (error) {
      console.error('Failed to get GitHub URL:', error);
      return null;
    }
  }

  private async createPullRequest(
    session: ExecutionSession,
    config: { baseBranch: string; createPR: boolean }
  ): Promise<string | null> {
    if (!session.branchName || !config.createPR) {
      return null;
    }

    try {
      this.sendProgress(session.id, { output: '\n📋 Creating pull request...\n' });

      // Check if gh CLI is installed
      try {
        execSync('gh --version', {
          cwd: session.workingDirectory,
          stdio: 'pipe',
        });
      } catch (error) {
        this.sendProgress(session.id, {
          output:
            '⚠️  GitHub CLI (gh) not found. Skipping PR creation.\n' +
            'Install gh CLI: https://cli.github.com/\n',
        });
        return null;
      }

      // Check if authenticated
      try {
        execSync('gh auth status', {
          cwd: session.workingDirectory,
          stdio: 'pipe',
        });
      } catch (error) {
        this.sendProgress(session.id, {
          output:
            '⚠️  Not authenticated with GitHub CLI. Skipping PR creation.\n' +
            'Run: gh auth login\n',
        });
        return null;
      }

      // Build PR title (use Linear issue identifier and title)
      const prTitle = `${session.issueId}: ${session.issueTitle}`;

      // Build PR description
      const prDescription = this.buildPRDescription(session);

      // Create PR using gh CLI
      const ghCommand = `gh pr create --base "${this.escapeShellArg(config.baseBranch)}" --title "${this.escapeShellArg(prTitle)}" --body "${this.escapeShellArg(prDescription)}"`;

      const prOutput = execSync(ghCommand, {
        cwd: session.workingDirectory,
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      // Extract PR URL from output
      // gh pr create returns the PR URL on the last line
      const prUrl = prOutput.trim().split('\n').pop()?.trim();

      if (prUrl && prUrl.startsWith('https://')) {
        this.sendProgress(session.id, {
          output: `✓ Pull request created successfully!\n🔗 View PR: ${prUrl}\n`,
        });
        return prUrl;
      } else {
        this.sendProgress(session.id, {
          output: `✓ Pull request created, but could not parse URL\n${prOutput}\n`,
        });
        return null;
      }
    } catch (error: any) {
      // Don't fail the whole operation if PR creation fails
      console.error('Failed to create PR:', error);

      const errorMessage = error.message || 'Unknown error';
      const stderr = error.stderr?.toString() || '';

      this.sendProgress(session.id, {
        output:
          `⚠️  Failed to create pull request: ${errorMessage}\n` +
          (stderr ? `Details: ${stderr}\n` : '') +
          `You can manually create a PR from: ${this.getGitHubBranchUrl(session.workingDirectory, session.branchName)}\n`,
      });

      return null;
    }
  }

  private buildPRDescription(session: ExecutionSession): string {
    const parts: string[] = [];

    // Add issue description if available
    if (session.issueDescription) {
      parts.push(session.issueDescription);
      parts.push(''); // Blank line
    }

    // Add link to Linear issue
    if (session.issueUrl) {
      parts.push('---');
      parts.push('');
      parts.push(`**Linear Issue:** [${session.issueId}](${session.issueUrl})`);
    }

    // Add labels if available
    if (session.issueLabels && session.issueLabels.length > 0) {
      parts.push(`**Labels:** ${session.issueLabels.join(', ')}`);
    }

    return parts.join('\n');
  }

  private escapeShellArg(arg: string): string {
    // Escape double quotes and backslashes for shell command
    return arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}
