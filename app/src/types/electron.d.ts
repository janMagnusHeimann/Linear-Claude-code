// Type definitions for Electron API exposed via preload
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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
