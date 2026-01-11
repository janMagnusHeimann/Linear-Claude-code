/**
 * Electron Preload Script
 * Exposes safe APIs to the renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';

// Type for Claude Code progress updates
export type ExecutionState =
  | 'INITIALIZING'
  | 'PLANNING'
  | 'AWAITING_APPROVAL'
  | 'REVIEWING_PLAN'
  | 'IMPLEMENTING'
  | 'COMPLETE'
  | 'ERROR'
  | 'CANCELLED';

export interface ClaudeCodeProgressUpdate {
  sessionId: string;
  stage: ExecutionState;
  output?: string;
  plan?: string;
  reviewResult?: any;
  prUrl?: string;
  error?: string;
}

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
    issueId: string;
    issueTitle: string;
    issueDescription?: string;
    issueUrl?: string;
  }) => ipcRenderer.invoke('invoke-claude-code', options),

  approveClaudeCodePlan: (options: {
    sessionId: string;
    approved: boolean;
  }) => ipcRenderer.invoke('claude-code:approve-plan', options),

  cancelClaudeCode: (options: {
    sessionId: string;
  }) => ipcRenderer.invoke('claude-code:cancel', options),

  getClaudeCodeSession: (options: {
    sessionId: string;
  }) => ipcRenderer.invoke('claude-code:get-session', options),

  onClaudeCodeProgress: (callback: (update: ClaudeCodeProgressUpdate) => void) => {
    const listener = (_: any, update: ClaudeCodeProgressUpdate) => callback(update);
    ipcRenderer.on('claude-code:progress', listener);
    return () => ipcRenderer.removeListener('claude-code:progress', listener);
  },

  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // Platform detection
  platform: process.platform,

  // Linear API
  testLinearConnection: (apiKey: string) => ipcRenderer.invoke('linear-test-connection', apiKey),
  fetchTeams: (apiKey: string) => ipcRenderer.invoke('linear-fetch-teams', apiKey),
  fetchIssues: (apiKey: string, filter: {
    teamKey?: string;
    stateType?: string;
    labelName?: string;
    searchQuery?: string;
    assignedToMe?: boolean;
    currentUserId?: string;
  }) => ipcRenderer.invoke('linear-fetch-issues', apiKey, filter),
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
        issueId: string;
        issueTitle: string;
        issueDescription?: string;
        issueUrl?: string;
      }) => Promise<{ success: boolean; sessionId?: string; error?: string }>;
      approveClaudeCodePlan: (options: {
        sessionId: string;
        approved: boolean;
      }) => Promise<{ success: boolean; error?: string }>;
      cancelClaudeCode: (options: {
        sessionId: string;
      }) => Promise<{ success: boolean; error?: string }>;
      getClaudeCodeSession: (options: {
        sessionId: string;
      }) => Promise<{ success: boolean; session?: any; error?: string }>;
      onClaudeCodeProgress: (callback: (update: ClaudeCodeProgressUpdate) => void) => () => void;
      getAppInfo: () => Promise<{
        version: string;
        name: string;
        platform: string;
        arch: string;
      }>;
      platform: string;
      // Linear API
      testLinearConnection: (apiKey: string) => Promise<{
        success: boolean;
        user?: { id: string; name: string; email: string };
        error?: string;
      }>;
      fetchTeams: (apiKey: string) => Promise<{
        success: boolean;
        teams?: Array<{ id: string; name: string; key: string }>;
        error?: string;
      }>;
      fetchIssues: (apiKey: string, filter: {
        teamKey?: string;
        stateType?: string;
        labelName?: string;
        searchQuery?: string;
        assignedToMe?: boolean;
        currentUserId?: string;
      }) => Promise<{
        success: boolean;
        issues?: Array<{
          id: string;
          identifier: string;
          title: string;
          description: string | null;
          priority: number;
          state: { id: string; name: string; type: string; color: string };
          labels: Array<{ id: string; name: string; color: string }>;
          team: { id: string; name: string; key: string };
          url: string;
          createdAt: string;
          updatedAt: string;
        }>;
        error?: string;
      }>;
    };
  }
}
