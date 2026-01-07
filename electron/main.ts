/**
 * Electron Main Process
 * Handles window creation and IPC communication with the renderer
 */

import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Store from 'electron-store';
import { LinearClient } from '@linear/sdk';
import { ClaudeCodeExecutor } from './claude-executor';

// Linear client instance (created when API key is set)
let linearClient: LinearClient | null = null;

// Claude Code executor instance
let claudeExecutor: ClaudeCodeExecutor | null = null;

// Initialize electron store for persistent settings
const store = new Store({
  name: 'linear-claude-settings',
  defaults: {
    linearApiKey: '',
    anthropicApiKey: '',
    defaultTeam: '',
    codebasePath: '',
    theme: 'dark',
    createBranch: true,
    branchPrefix: 'fix/',
    autoApprovePlans: false,
    planReviewEnabled: true,
    promptEnhancementEnabled: true,
    createPR: false,
    prBaseBranch: 'main',
  },
});

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    backgroundColor: '#09090B',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Initialize Claude Code executor with API key from settings
  const anthropicApiKey = store.get('anthropicApiKey') as string;
  const promptEnhancementEnabled = store.get('promptEnhancementEnabled') as boolean;
  claudeExecutor = new ClaudeCodeExecutor({
    anthropicApiKey,
    promptEnhancementEnabled,
  });
  claudeExecutor.setMainWindow(mainWindow);
}

// Fix PATH for spawned processes on macOS
// Electron apps don't get the full shell PATH, so we manually add common bin directories
if (process.platform === 'darwin' || process.platform === 'linux') {
  const homeDir = process.env.HOME || '';
  const additionalPaths = [
    `${homeDir}/.local/bin`,           // Common user bin (where claude is often installed)
    '/usr/local/bin',                   // Homebrew Intel
    '/opt/homebrew/bin',                // Homebrew Apple Silicon
    `${homeDir}/.npm-global/bin`,      // npm global (custom prefix)
    '/usr/local/opt/node/bin',         // Node via Homebrew
    '/opt/local/bin',                   // MacPorts
  ].filter(p => p); // Remove empty paths

  const currentPath = process.env.PATH || '';
  const pathsToAdd = additionalPaths.filter(p => !currentPath.includes(p));

  if (pathsToAdd.length > 0) {
    process.env.PATH = [...pathsToAdd, currentPath].join(':');
    console.log('Augmented PATH with:', pathsToAdd.join(', '));
  }
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============ IPC Handlers ============

// Settings
ipcMain.handle('get-settings', () => {
  return store.store;
});

ipcMain.handle('set-setting', (_, key: string, value: any) => {
  store.set(key, value);
  return true;
});

ipcMain.handle('get-setting', (_, key: string) => {
  return store.get(key);
});

// File system
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('check-path-exists', (_, filePath: string) => {
  return fs.existsSync(filePath);
});

// Linear API - These will be handled by the renderer's Linear client
ipcMain.handle('open-external', (_, url: string) => {
  shell.openExternal(url);
});

// Claude Code invocation
ipcMain.handle('invoke-claude-code', async (_, options: {
  workingDirectory: string;
  prompt: string;
  branchName?: string;
  issueId: string;
  issueTitle: string;
  issueDescription?: string;
  issueUrl?: string;
}) => {
  if (!claudeExecutor) {
    return { success: false, error: 'Claude Code executor not initialized' };
  }

  try {
    const sessionId = await claudeExecutor.startSession({
      workingDirectory: options.workingDirectory,
      prompt: options.prompt,
      branchName: options.branchName,
      issueId: options.issueId,
      issueTitle: options.issueTitle,
      issueDescription: options.issueDescription,
      issueUrl: options.issueUrl,
    });

    return { success: true, sessionId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Approve Claude Code plan
ipcMain.handle('claude-code:approve-plan', async (_, options: {
  sessionId: string;
  approved: boolean;
}) => {
  if (!claudeExecutor) {
    return { success: false, error: 'Claude Code executor not initialized' };
  }

  try {
    if (options.approved) {
      await claudeExecutor.approvePlan(options.sessionId);
    } else {
      await claudeExecutor.cancelSession(options.sessionId);
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Cancel Claude Code execution
ipcMain.handle('claude-code:cancel', async (_, options: { sessionId: string }) => {
  if (!claudeExecutor) {
    return { success: false, error: 'Claude Code executor not initialized' };
  }

  try {
    await claudeExecutor.cancelSession(options.sessionId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Get Claude Code session status
ipcMain.handle('claude-code:get-session', async (_, options: { sessionId: string }) => {
  if (!claudeExecutor) {
    return { success: false, error: 'Claude Code executor not initialized' };
  }

  try {
    const session = claudeExecutor.getSession(options.sessionId);
    return { success: true, session };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// App info
ipcMain.handle('get-app-info', () => {
  return {
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
    arch: process.arch,
  };
});

// ============ Linear API Handlers ============

// Test Linear connection and get user info
ipcMain.handle('linear-test-connection', async (_, apiKey: string) => {
  try {
    linearClient = new LinearClient({ apiKey });
    const user = await linearClient.viewer;
    return {
      success: true,
      user: { id: user.id, name: user.name, email: user.email },
    };
  } catch (error) {
    linearClient = null;
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to connect',
    };
  }
});

// Fetch teams
ipcMain.handle('linear-fetch-teams', async (_, apiKey: string) => {
  try {
    const client = new LinearClient({ apiKey });
    const teamsData = await client.teams();
    return {
      success: true,
      teams: teamsData.nodes.map((t) => ({
        id: t.id,
        name: t.name,
        key: t.key,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch teams',
    };
  }
});

// Fetch issues with filters
ipcMain.handle('linear-fetch-issues', async (_, apiKey: string, filter: {
  teamKey?: string;
  stateType?: string;
  labelName?: string;
  searchQuery?: string;
  assignedToMe?: boolean;
  currentUserId?: string;
}) => {
  try {
    const client = new LinearClient({ apiKey });
    const queryFilter: any = {};

    // Default to active issues
    if (filter.stateType) {
      queryFilter.state = { type: { eq: filter.stateType } };
    } else {
      queryFilter.state = { type: { in: ['unstarted', 'started'] } };
    }

    if (filter.teamKey) {
      queryFilter.team = { key: { eq: filter.teamKey } };
    }

    if (filter.labelName) {
      queryFilter.labels = { name: { eq: filter.labelName } };
    }

    if (filter.assignedToMe && filter.currentUserId) {
      queryFilter.assignee = { id: { eq: filter.currentUserId } };
    }

    if (filter.searchQuery) {
      queryFilter.or = [
        { title: { containsIgnoreCase: filter.searchQuery } },
        { description: { containsIgnoreCase: filter.searchQuery } },
      ];
    }

    const issuesData = await client.issues({
      filter: queryFilter,
      first: 50,
    });

    const transformedIssues = await Promise.all(
      issuesData.nodes.map(async (issue) => {
        const [state, labels, team] = await Promise.all([
          issue.state,
          issue.labels(),
          issue.team,
        ]);

        return {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description || null,
          priority: issue.priority,
          state: state
            ? {
                id: state.id,
                name: state.name,
                type: state.type,
                color: state.color,
              }
            : { id: '', name: 'Unknown', type: 'backlog', color: '#888' },
          labels: labels.nodes.map((l) => ({
            id: l.id,
            name: l.name,
            color: l.color,
          })),
          team: team
            ? { id: team.id, name: team.name, key: team.key }
            : { id: '', name: 'Unknown', key: 'UNK' },
          url: issue.url,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
        };
      })
    );

    return { success: true, issues: transformedIssues };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch issues',
    };
  }
});
