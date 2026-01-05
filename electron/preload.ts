/**
 * Electron Preload Script
 * Exposes safe APIs to the renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key: string, value: any) => ipcRenderer.invoke('set-setting', key, value),
  getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),

  // File system
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  checkPathExists: (path: string) => ipcRenderer.invoke('check-path-exists', path),

  // External links
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  // Claude Code
  invokeClaudeCode: (options: {
    workingDirectory: string;
    prompt: string;
    branchName?: string;
  }) => ipcRenderer.invoke('invoke-claude-code', options),

  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // Platform detection
  platform: process.platform,
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      getSettings: () => Promise<any>;
      setSetting: (key: string, value: any) => Promise<boolean>;
      getSetting: (key: string) => Promise<any>;
      selectDirectory: () => Promise<string | null>;
      checkPathExists: (path: string) => Promise<boolean>;
      openExternal: (url: string) => Promise<void>;
      invokeClaudeCode: (options: {
        workingDirectory: string;
        prompt: string;
        branchName?: string;
      }) => Promise<{ success: boolean; promptFile: string }>;
      getAppInfo: () => Promise<{
        version: string;
        name: string;
        platform: string;
        arch: string;
      }>;
      platform: string;
    };
  }
}
