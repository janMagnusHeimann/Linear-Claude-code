import React, { useState } from 'react';
import {
  Key,
  FolderOpen,
  GitBranch,
  Save,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useLinear } from '../contexts/LinearContext';

export function SettingsView() {
  const { settings, updateSettings } = useSettings();
  const { isConnected, teams, currentUser, fetchTeams } = useLinear();

  const [formData, setFormData] = useState({
    linearApiKey: settings.linearApiKey,
    defaultTeam: settings.defaultTeam,
    codebasePath: settings.codebasePath,
    createBranch: settings.createBranch,
    branchPrefix: settings.branchPrefix,
    createPR: settings.createPR,
    prBaseBranch: settings.prBaseBranch,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState('');

  const handleChange = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setSaveSuccess(false);
  };

  const selectCodebase = async () => {
    if (window.electronAPI) {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        handleChange('codebasePath', path);
      }
    }
  };

  const validateApiKey = async () => {
    if (!formData.linearApiKey.trim()) {
      setValidationError('Please enter an API key');
      return;
    }

    setIsValidating(true);
    setValidationError('');

    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.testLinearConnection(formData.linearApiKey.trim());
        if (result.success) {
          setValidationError('');
          // Auto-save on successful validation
          await handleSave();
        } else {
          setValidationError(result.error || 'Invalid API key');
        }
      }
    } catch (err) {
      setValidationError('Invalid API key');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings(formData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-linear-gray-950">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-linear-gray-800">
        <div className="h-12 drag-region" />
        <div className="px-6 pb-4">
          <h1 className="text-2xl font-bold text-linear-gray-100">Settings</h1>
          <p className="text-linear-gray-400 text-sm mt-1">
            Configure your Linear Claude integration
          </p>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Connection Status */}
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isConnected ? (
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  </div>
                )}
                <div>
                  <h3 className="font-medium text-linear-gray-100">
                    {isConnected ? 'Connected to Linear' : 'Not Connected'}
                  </h3>
                  {currentUser && (
                    <p className="text-sm text-linear-gray-400">
                      Logged in as {currentUser.name} ({currentUser.email})
                    </p>
                  )}
                </div>
              </div>
              {isConnected && (
                <button onClick={() => fetchTeams()} className="btn-ghost">
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Linear API Key */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Key className="w-5 h-5 text-linear-purple" />
              <h2 className="text-lg font-semibold text-linear-gray-100">Linear API Key</h2>
            </div>
            <p className="text-sm text-linear-gray-400 mb-4">
              Your API key is used to fetch issues from Linear.{' '}
              <button
                onClick={() => window.electronAPI?.openExternal('https://linear.app/settings/api')}
                className="text-linear-purple hover:underline inline-flex items-center gap-1"
              >
                Get your API key
                <ExternalLink className="w-3 h-3" />
              </button>
            </p>

            <div className="flex gap-3">
              <input
                type="password"
                value={formData.linearApiKey}
                onChange={(e) => handleChange('linearApiKey', e.target.value)}
                placeholder="lin_api_xxxxxxxxxxxxxxxx"
                className="input flex-1"
              />
              <button
                onClick={validateApiKey}
                disabled={isValidating}
                className="btn-secondary"
              >
                {isValidating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Validate'
                )}
              </button>
            </div>

            {validationError && (
              <p className="text-red-400 text-sm mt-2">{validationError}</p>
            )}
          </div>

          {/* Anthropic API Key */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Key className="w-5 h-5 text-linear-purple" />
              <h2 className="text-lg font-semibold text-linear-gray-100">Anthropic API Key</h2>
            </div>
            <p className="text-sm text-linear-gray-400 mb-4">
              Used for AI-powered plan review before execution.{' '}
              <button
                onClick={() => window.electronAPI?.openExternal('https://console.anthropic.com')}
                className="text-linear-purple hover:underline inline-flex items-center gap-1"
              >
                Get your API key
                <ExternalLink className="w-3 h-3" />
              </button>
            </p>

            <input
              type="password"
              value={formData.anthropicApiKey || ''}
              onChange={(e) => handleChange('anthropicApiKey', e.target.value)}
              placeholder="sk-ant-api03-..."
              className="input"
            />

            <p className="text-xs text-linear-gray-500 mt-2">
              Optional: If not provided, plans will be auto-approved without AI review.
            </p>

            <label className="flex items-center gap-2 mt-3">
              <input
                type="checkbox"
                checked={formData.promptEnhancementEnabled ?? true}
                onChange={(e) => handleChange('promptEnhancementEnabled', e.target.checked)}
                disabled={!formData.anthropicApiKey}
                className="rounded"
              />
              <span className="text-sm text-linear-gray-300">
                Enable AI prompt enhancement
              </span>
            </label>
            <p className="text-xs text-linear-gray-500 mt-1">
              Uses Claude API to create better prompts based on your issue and claude.md.
              {!formData.anthropicApiKey && ' (Requires API key)'}
            </p>
          </div>

          {/* Default Team */}
          {isConnected && teams.length > 0 && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-linear-gray-100 mb-4">Default Team</h2>
              <p className="text-sm text-linear-gray-400 mb-4">
                Optionally select a default team to filter issues.
              </p>
              <select
                value={formData.defaultTeam}
                onChange={(e) => handleChange('defaultTeam', e.target.value)}
                className="input"
              >
                <option value="">All Teams</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.key}>
                    {team.name} ({team.key})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Codebase Path */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <FolderOpen className="w-5 h-5 text-linear-purple" />
              <h2 className="text-lg font-semibold text-linear-gray-100">Codebase Path</h2>
            </div>
            <p className="text-sm text-linear-gray-400 mb-4">
              The project directory where Claude Code will work on issues.
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={formData.codebasePath}
                onChange={(e) => handleChange('codebasePath', e.target.value)}
                placeholder="/path/to/your/project"
                className="input flex-1 font-mono text-sm"
              />
              <button onClick={selectCodebase} className="btn-secondary">
                Browse
              </button>
            </div>
          </div>

          {/* Git Settings */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <GitBranch className="w-5 h-5 text-linear-purple" />
              <h2 className="text-lg font-semibold text-linear-gray-100">Git Settings</h2>
            </div>

            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.createBranch}
                  onChange={(e) => handleChange('createBranch', e.target.checked)}
                  className="w-5 h-5 rounded border-linear-gray-700 bg-linear-gray-800 text-linear-purple focus:ring-linear-purple focus:ring-offset-linear-gray-900"
                />
                <div>
                  <p className="font-medium text-linear-gray-100">Create branch for each issue</p>
                  <p className="text-sm text-linear-gray-500">
                    Automatically create a git branch when solving an issue
                  </p>
                </div>
              </label>

              {formData.createBranch && (
                <div>
                  <label className="block text-sm font-medium text-linear-gray-400 mb-2">
                    Branch Prefix
                  </label>
                  <input
                    type="text"
                    value={formData.branchPrefix}
                    onChange={(e) => handleChange('branchPrefix', e.target.value)}
                    placeholder="fix/"
                    className="input w-48"
                  />
                  <p className="text-sm text-linear-gray-500 mt-2">
                    Example: <code className="text-linear-purple">{formData.branchPrefix}eng-123-issue-title</code>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* GitHub Pull Request Settings */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <GitBranch className="w-5 h-5 text-linear-purple" />
              <h2 className="text-lg font-semibold text-linear-gray-100">GitHub Pull Request Settings</h2>
            </div>

            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.createPR}
                  onChange={(e) => handleChange('createPR', e.target.checked)}
                  disabled={!formData.createBranch}
                  className="w-5 h-5 rounded border-linear-gray-700 bg-linear-gray-800 text-linear-purple focus:ring-linear-purple focus:ring-offset-linear-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <div>
                  <p className="font-medium text-linear-gray-100">Auto-create Pull Requests</p>
                  <p className="text-sm text-linear-gray-500">
                    Automatically create a GitHub PR after Claude Code completes
                  </p>
                </div>
              </label>

              {formData.createPR && (
                <div className="ml-8 space-y-4 pl-4 border-l-2 border-linear-gray-800">
                  <div>
                    <label className="block text-sm font-medium text-linear-gray-400 mb-2">
                      Base Branch
                    </label>
                    <input
                      type="text"
                      value={formData.prBaseBranch}
                      onChange={(e) => handleChange('prBaseBranch', e.target.value)}
                      placeholder="main"
                      className="input w-48"
                    />
                    <p className="text-sm text-linear-gray-500 mt-2">
                      PRs will be created against this branch
                    </p>
                  </div>

                  <div className="bg-linear-gray-900 p-4 rounded-lg">
                    <h3 className="text-sm font-medium text-linear-gray-300 mb-2">Requirements:</h3>
                    <ul className="text-sm text-linear-gray-400 space-y-1 list-disc list-inside">
                      <li>GitHub CLI (gh) must be installed</li>
                      <li>Must be authenticated with <code className="text-linear-purple">gh auth login</code></li>
                      <li>Repository must be a GitHub repository</li>
                    </ul>
                  </div>
                </div>
              )}

              {!formData.createBranch && formData.createPR && (
                <div className="flex items-center gap-2 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                  <p className="text-sm text-yellow-400">
                    PR creation requires branch creation to be enabled
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-end gap-4">
            {saveSuccess && (
              <span className="text-green-400 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Settings saved!
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="btn-primary"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Settings
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
