import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export interface CheckResult {
  exists: boolean;
  content?: string;
  initialized?: boolean;
}

export class ClaudeMdChecker {
  async checkAndInit(workingDirectory: string): Promise<CheckResult> {
    const claudeMdPath = path.join(workingDirectory, 'claude.md');

    // Check if claude.md exists
    const exists = await this.fileExists(claudeMdPath);

    if (exists) {
      const content = await fs.promises.readFile(claudeMdPath, 'utf-8');
      return { exists: true, content };
    }

    // Run claude /init to create it
    try {
      await this.runClaudeInit(workingDirectory);

      // Read the newly created file
      const newExists = await this.fileExists(claudeMdPath);
      if (newExists) {
        const content = await fs.promises.readFile(claudeMdPath, 'utf-8');
        return { exists: true, content, initialized: true };
      }

      // Init didn't create the file
      return { exists: false, initialized: false };
    } catch (error: any) {
      console.error('Failed to run claude /init:', error);
      return { exists: false, initialized: false };
    }
  }

  private async runClaudeInit(cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const claudeProcess = spawn('claude', ['/init'], {
        cwd,
        stdio: 'inherit',
        shell: true,
      });

      claudeProcess.on('exit', (code: number | null) => {
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`claude /init exited with code ${code}`));
        }
      });

      claudeProcess.on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
