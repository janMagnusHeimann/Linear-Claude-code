// Type definitions for Electron API exposed via preload

export interface IssueFilter {
  teamKey?: string;
  stateType?: string;
  labelName?: string;
  searchQuery?: string;
  assignedToMe?: boolean;
  currentUserId?: string;
}

export interface LinearUser {
  id: string;
  name: string;
  email: string;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

export interface LinearIssue {
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
}

export interface ElectronAPI {
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
  // Linear API
  testLinearConnection: (apiKey: string) => Promise<{
    success: boolean;
    user?: LinearUser;
    error?: string;
  }>;
  fetchTeams: (apiKey: string) => Promise<{
    success: boolean;
    teams?: LinearTeam[];
    error?: string;
  }>;
  fetchIssues: (apiKey: string, filter: IssueFilter) => Promise<{
    success: boolean;
    issues?: LinearIssue[];
    error?: string;
  }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
