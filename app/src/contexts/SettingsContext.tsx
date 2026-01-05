import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Settings {
  linearApiKey: string;
  defaultTeam: string;
  codebasePath: string;
  theme: 'dark' | 'light';
  createBranch: boolean;
  branchPrefix: string;
}

interface SettingsContextType {
  settings: Settings;
  isLoading: boolean;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
}

const defaultSettings: Settings = {
  linearApiKey: '',
  defaultTeam: '',
  codebasePath: '',
  theme: 'dark',
  createBranch: true,
  branchPrefix: 'fix/',
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      if (window.electronAPI) {
        const stored = await window.electronAPI.getSettings();
        setSettings({ ...defaultSettings, ...stored });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSetting = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    if (window.electronAPI) {
      await window.electronAPI.setSetting(key, value);
    }
  };

  const updateSettings = async (updates: Partial<Settings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    if (window.electronAPI) {
      for (const [key, value] of Object.entries(updates)) {
        await window.electronAPI.setSetting(key, value);
      }
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, isLoading, updateSetting, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
