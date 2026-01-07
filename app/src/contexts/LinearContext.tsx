import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useSettings } from './SettingsContext';

interface Team {
  id: string;
  name: string;
  key: string;
}

interface Label {
  id: string;
  name: string;
  color: string;
}

interface IssueState {
  id: string;
  name: string;
  type: string;
  color: string;
}

interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number;
  state: IssueState;
  labels: Label[];
  team: Team;
  url: string;
  createdAt: Date;
  updatedAt: Date;
}

interface IssueFilter {
  teamKey?: string;
  stateType?: string;
  labelName?: string;
  searchQuery?: string;
  assignedToMe?: boolean;
}

interface LinearContextType {
  isConnected: boolean;
  teams: Team[];
  issues: Issue[];
  isLoading: boolean;
  error: string | null;
  fetchTeams: () => Promise<void>;
  fetchIssues: (filter?: IssueFilter) => Promise<void>;
  getIssueById: (id: string) => Issue | undefined;
  currentUser: { id: string; name: string; email: string } | null;
}

const LinearContext = createContext<LinearContextType | undefined>(undefined);

export function LinearProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [isConnected, setIsConnected] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email: string } | null>(null);

  // Test connection when API key changes
  useEffect(() => {
    if (settings.linearApiKey && window.electronAPI) {
      window.electronAPI.testLinearConnection(settings.linearApiKey)
        .then((result) => {
          if (result.success && result.user) {
            setCurrentUser(result.user);
            setIsConnected(true);
            setError(null);
          } else {
            setIsConnected(false);
            setError(result.error || 'Failed to connect to Linear. Check your API key.');
          }
        })
        .catch((err) => {
          setIsConnected(false);
          setError('Failed to connect to Linear. Check your API key.');
          console.error('Linear connection error:', err);
        });
    } else {
      setIsConnected(false);
      setCurrentUser(null);
    }
  }, [settings.linearApiKey]);

  const fetchTeams = useCallback(async () => {
    if (!settings.linearApiKey || !window.electronAPI) return;

    try {
      const result = await window.electronAPI.fetchTeams(settings.linearApiKey);
      if (result.success && result.teams) {
        setTeams(result.teams);
      } else {
        console.error('Failed to fetch teams:', result.error);
        setError('Failed to fetch teams');
      }
    } catch (err) {
      console.error('Failed to fetch teams:', err);
      setError('Failed to fetch teams');
    }
  }, [settings.linearApiKey]);

  const fetchIssues = useCallback(async (filter: IssueFilter = {}) => {
    if (!settings.linearApiKey || !window.electronAPI) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.fetchIssues(settings.linearApiKey, {
        ...filter,
        currentUserId: currentUser?.id,
      });

      if (result.success && result.issues) {
        const transformedIssues: Issue[] = result.issues.map((issue) => ({
          ...issue,
          createdAt: new Date(issue.createdAt),
          updatedAt: new Date(issue.updatedAt),
        }));
        setIssues(transformedIssues);
      } else {
        console.error('Failed to fetch issues:', result.error);
        setError('Failed to fetch issues');
      }
    } catch (err) {
      console.error('Failed to fetch issues:', err);
      setError('Failed to fetch issues');
    } finally {
      setIsLoading(false);
    }
  }, [settings.linearApiKey, currentUser]);

  const getIssueById = useCallback((id: string) => {
    return issues.find((issue) => issue.id === id);
  }, [issues]);

  // Auto-fetch teams when connected
  useEffect(() => {
    if (isConnected) {
      fetchTeams();
    }
  }, [isConnected, fetchTeams]);

  return (
    <LinearContext.Provider
      value={{
        isConnected,
        teams,
        issues,
        isLoading,
        error,
        fetchTeams,
        fetchIssues,
        getIssueById,
        currentUser,
      }}
    >
      {children}
    </LinearContext.Provider>
  );
}

export function useLinear() {
  const context = useContext(LinearContext);
  if (!context) {
    throw new Error('useLinear must be used within a LinearProvider');
  }
  return context;
}
