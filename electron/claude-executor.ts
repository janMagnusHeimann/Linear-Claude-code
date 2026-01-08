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
  fullOutput: string;
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
  prUrl?: string;
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
      fullOutput: '',
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

        // Extract PR URL from Claude Code output (if any)
        const prUrl = this.extractPrUrl(session.fullOutput);

        this.sendProgress(session.id, {
          output: '\n✓ Claude Code completed successfully!\n',
          prUrl: prUrl || undefined,
        });

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
    session.fullOutput += output; // Track full output for PR URL extraction

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

  /**
   * Extract PR URL from Claude Code output
   * Looks for patterns like:
   * - "Created PR: https://github.com/..."
   * - "Pull request created: https://github.com/..."
   * - "https://github.com/.../pull/123"
   */
  private extractPrUrl(output: string): string | null {
    // Pattern 1: "Created PR: <url>" or "Pull request: <url>"
    const prPattern1 = /(?:created pr|pull request|pr created|view pr):\s*(https:\/\/github\.com\/[^\s]+)/i;
    const match1 = output.match(prPattern1);
    if (match1) return match1[1];

    // Pattern 2: Direct GitHub PR URL
    const prPattern2 = /(https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/\d+)/g;
    const matches = output.match(prPattern2);
    if (matches && matches.length > 0) {
      // Return the last PR URL found (most likely the one just created)
      return matches[matches.length - 1];
    }

    return null;
  }
}
