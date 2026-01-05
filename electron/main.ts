/**
 * Electron Main Process
 * Handles window creation and IPC communication with the renderer
 */

import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Store from 'electron-store';

// Initialize electron store for persistent settings
const store = new Store({
  name: 'linear-claude-settings',
  defaults: {
    linearApiKey: '',
    defaultTeam: '',
    codebasePath: '',
    theme: 'dark',
    createBranch: true,
    branchPrefix: 'fix/',
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
}) => {
  const { spawn } = require('child_process');

  return new Promise((resolve, reject) => {
    // Create the prompt file
    const promptFile = path.join(options.workingDirectory, '.claude', 'current-issue.md');
    const claudeDir = path.dirname(promptFile);

    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }
    fs.writeFileSync(promptFile, options.prompt);

    // If branch name provided, create branch first
    if (options.branchName) {
      try {
        const { execSync } = require('child_process');
        execSync(`git checkout -b ${options.branchName}`, {
          cwd: options.workingDirectory,
          stdio: 'pipe'
        });
      } catch (error) {
        // Branch might already exist, try to checkout
        try {
          const { execSync } = require('child_process');
          execSync(`git checkout ${options.branchName}`, {
            cwd: options.workingDirectory,
            stdio: 'pipe'
          });
        } catch {
          // Ignore branch errors
        }
      }
    }

    // Open terminal with Claude Code
    const terminal = spawn('open', ['-a', 'Terminal', options.workingDirectory], {
      detached: true,
    });

    terminal.on('error', reject);
    terminal.on('close', () => {
      resolve({ success: true, promptFile });
    });
  });
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
