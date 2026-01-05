import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { LinearClient } from '@linear/sdk';
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
  client: LinearClient | null;
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
  const [client, setClient] = useState<LinearClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email: string } | null>(null);

  // Initialize client when API key changes
  useEffect(() => {
    if (settings.linearApiKey) {
      const newClient = new LinearClient({ apiKey: settings.linearApiKey });
      setClient(newClient);

      // Test connection
      newClient.viewer
        .then((user) => {
          setCurrentUser({ id: user.id, name: user.name, email: user.email });
          setIsConnected(true);
          setError(null);
        })
        .catch((err) => {
          setIsConnected(false);
          setError('Failed to connect to Linear. Check your API key.');
          console.error('Linear connection error:', err);
        });
    } else {
      setClient(null);
      setIsConnected(false);
      setCurrentUser(null);
    }
  }, [settings.linearApiKey]);

  const fetchTeams = useCallback(async () => {
    if (!client) return;

    try {
      const teamsData = await client.teams();
      setTeams(
        teamsData.nodes.map((t) => ({
          id: t.id,
          name: t.name,
          key: t.key,
        }))
      );
    } catch (err) {
      console.error('Failed to fetch teams:', err);
      setError('Failed to fetch teams');
    }
  }, [client]);

  const fetchIssues = useCallback(async (filter: IssueFilter = {}) => {
    if (!client) return;

    setIsLoading(true);
    setError(null);

    try {
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

      if (filter.assignedToMe && currentUser) {
        queryFilter.assignee = { id: { eq: currentUser.id } };
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

      const transformedIssues: Issue[] = await Promise.all(
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
            createdAt: new Date(issue.createdAt),
            updatedAt: new Date(issue.updatedAt),
          };
        })
      );

      setIssues(transformedIssues);
    } catch (err) {
      console.error('Failed to fetch issues:', err);
      setError('Failed to fetch issues');
    } finally {
      setIsLoading(false);
    }
  }, [client, currentUser]);

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
        client,
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
