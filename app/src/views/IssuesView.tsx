import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  ChevronRight,
  User,
  Calendar,
  Tag,
} from 'lucide-react';
import { useLinear } from '../contexts/LinearContext';

interface IssuesViewProps {
  onSelectIssue: (issueId: string) => void;
}

export function IssuesView({ onSelectIssue }: IssuesViewProps) {
  const { issues, teams, isLoading, error, fetchIssues, isConnected } = useLinear();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [showMyIssues, setShowMyIssues] = useState(false);

  useEffect(() => {
    if (isConnected) {
      fetchIssues({
        teamKey: selectedTeam || undefined,
        stateType: selectedStatus || undefined,
        searchQuery: searchQuery || undefined,
        assignedToMe: showMyIssues,
      });
    }
  }, [isConnected, selectedTeam, selectedStatus, showMyIssues]);

  const handleSearch = () => {
    fetchIssues({
      teamKey: selectedTeam || undefined,
      stateType: selectedStatus || undefined,
      searchQuery: searchQuery || undefined,
      assignedToMe: showMyIssues,
    });
  };

  const getPriorityConfig = (priority: number) => {
    const configs: Record<number, { label: string; class: string; icon: string }> = {
      1: { label: 'Urgent', class: 'priority-urgent', icon: '🔴' },
      2: { label: 'High', class: 'priority-high', icon: '🟠' },
      3: { label: 'Medium', class: 'priority-medium', icon: '🟡' },
      4: { label: 'Low', class: 'priority-low', icon: '🟢' },
      0: { label: 'None', class: 'priority-none', icon: '⚪' },
    };
    return configs[priority] || configs[0];
  };

  const getStatusClass = (type: string) => {
    const classes: Record<string, string> = {
      backlog: 'status-backlog',
      unstarted: 'status-unstarted',
      started: 'status-started',
      completed: 'status-completed',
      canceled: 'status-canceled',
    };
    return classes[type] || 'status-backlog';
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  if (!isConnected) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-linear-gray-600 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-linear-gray-100 mb-2">Not Connected</h2>
          <p className="text-linear-gray-400">Please connect to Linear in Settings</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-linear-gray-950">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-linear-gray-800">
        <div className="h-12 drag-region" />
        <div className="px-6 pb-4">
          <h1 className="text-2xl font-bold text-linear-gray-100 mb-4">Issues</h1>

          {/* Filters */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-linear-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search issues..."
                className="input pl-10"
              />
            </div>

            {/* Team filter */}
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="input w-40"
            >
              <option value="">All Teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.key}>
                  {team.name}
                </option>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="input w-40"
            >
              <option value="">Active</option>
              <option value="backlog">Backlog</option>
              <option value="unstarted">Todo</option>
              <option value="started">In Progress</option>
              <option value="completed">Done</option>
            </select>

            {/* My issues toggle */}
            <button
              onClick={() => setShowMyIssues(!showMyIssues)}
              className={`btn ${showMyIssues ? 'btn-primary' : 'btn-secondary'}`}
            >
              <User className="w-4 h-4" />
              My Issues
            </button>

            {/* Refresh */}
            <button onClick={handleSearch} className="btn-ghost" disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Issues List */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-4">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-linear-purple/30 border-t-linear-purple rounded-full animate-spin" />
          </div>
        ) : issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-linear-gray-500">
            <Filter className="w-12 h-12 mb-4" />
            <p className="text-lg font-medium">No issues found</p>
            <p className="text-sm">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-2">
            {issues.map((issue, index) => {
              const priorityConfig = getPriorityConfig(issue.priority);

              return (
                <button
                  key={issue.id}
                  onClick={() => onSelectIssue(issue.id)}
                  className="w-full card-hover p-4 text-left group animate-fade-in"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className="flex items-start gap-4">
                    {/* Priority indicator */}
                    <span className="text-lg mt-0.5" title={priorityConfig.label}>
                      {priorityConfig.icon}
                    </span>

                    {/* Issue content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-linear-gray-500 font-mono">
                          {issue.identifier}
                        </span>
                        <span className={`badge ${getStatusClass(issue.state.type)}`}>
                          {issue.state.name}
                        </span>
                      </div>

                      <h3 className="font-medium text-linear-gray-100 truncate mb-2 group-hover:text-linear-purple transition-colors">
                        {issue.title}
                      </h3>

                      {/* Labels */}
                      {issue.labels.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {issue.labels.slice(0, 3).map((label) => (
                            <span
                              key={label.id}
                              className="badge"
                              style={{
                                backgroundColor: `${label.color}20`,
                                color: label.color,
                              }}
                            >
                              {label.name}
                            </span>
                          ))}
                          {issue.labels.length > 3 && (
                            <span className="text-xs text-linear-gray-500">
                              +{issue.labels.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-4 text-sm text-linear-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatDate(issue.updatedAt)}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-linear-gray-600 group-hover:text-linear-purple group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="flex-shrink-0 px-6 py-3 border-t border-linear-gray-800 text-sm text-linear-gray-500">
        {issues.length} issues • Select one to solve with Claude Code
      </footer>
    </div>
  );
}
