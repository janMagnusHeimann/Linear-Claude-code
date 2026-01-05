import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Zap,
  GitBranch,
  FolderOpen,
  FileCode,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Play,
  Copy,
  Check,
} from 'lucide-react';
import { useLinear } from '../contexts/LinearContext';
import { useSettings } from '../contexts/SettingsContext';

interface SolveViewProps {
  issueId: string | null;
  onBack: () => void;
}

interface AnalysisResult {
  modules: { name: string; path: string; score: number }[];
  suggestedFiles: { path: string; reason: string }[];
  confidence: number;
  complexity: string;
}

export function SolveView({ issueId, onBack }: SolveViewProps) {
  const { getIssueById } = useLinear();
  const { settings } = useSettings();
  const [step, setStep] = useState<'analyze' | 'review' | 'solve'>('analyze');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [copied, setCopied] = useState(false);

  const issue = issueId ? getIssueById(issueId) : null;

  useEffect(() => {
    if (issue && settings.codebasePath) {
      analyzeIssue();
    }
  }, [issue, settings.codebasePath]);

  const analyzeIssue = async () => {
    setIsAnalyzing(true);

    // Simulate analysis (in real app, this would call the codebase analyzer)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mock analysis result
    setAnalysis({
      modules: [
        { name: 'Components', path: 'src/components', score: 0.85 },
        { name: 'API', path: 'src/api', score: 0.65 },
        { name: 'Utils', path: 'src/utils', score: 0.45 },
      ],
      suggestedFiles: [
        { path: 'src/components/Button.tsx', reason: 'Related component' },
        { path: 'src/api/endpoints.ts', reason: 'API endpoint definition' },
        { path: 'src/utils/helpers.ts', reason: 'Utility functions' },
      ],
      confidence: 0.78,
      complexity: 'Medium',
    });

    setIsAnalyzing(false);
    setStep('review');
  };

  const generatePrompt = () => {
    if (!issue || !analysis) return '';

    return `# Issue: ${issue.identifier} - ${issue.title}

## Description
${issue.description || 'No description provided'}

## Labels
${issue.labels.map((l) => l.name).join(', ') || 'None'}

## Analysis Results

### Relevant Modules
${analysis.modules.map((m) => `- ${m.name} (${m.path}) - ${(m.score * 100).toFixed(0)}% relevance`).join('\n')}

### Suggested Files to Start
${analysis.suggestedFiles.map((f) => `- ${f.path}: ${f.reason}`).join('\n')}

## Instructions
1. Understand the issue thoroughly before making changes
2. Start with the suggested files above
3. Make minimal, focused changes
4. Follow existing code patterns
5. Add tests if applicable

Please solve this issue following the guidelines above.`;
  };

  const copyPrompt = async () => {
    const prompt = generatePrompt();
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const launchClaudeCode = async () => {
    if (!settings.codebasePath) {
      alert('Please set a codebase path in Settings');
      return;
    }

    setIsSolving(true);

    try {
      const branchName = settings.createBranch
        ? `${settings.branchPrefix}${issue?.identifier.toLowerCase()}-${issue?.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .substring(0, 30)}`
        : undefined;

      if (window.electronAPI) {
        await window.electronAPI.invokeClaudeCode({
          workingDirectory: settings.codebasePath,
          prompt: generatePrompt(),
          branchName,
        });
      }

      setStep('solve');
    } catch (error) {
      console.error('Failed to launch Claude Code:', error);
      alert('Failed to launch Claude Code. Make sure it\'s installed.');
    } finally {
      setIsSolving(false);
    }
  };

  if (!issue) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-linear-gray-400">Issue not found</p>
      </div>
    );
  }

  const getPriorityLabel = (priority: number) => {
    const labels: Record<number, string> = {
      1: '🔴 Urgent',
      2: '🟠 High',
      3: '🟡 Medium',
      4: '🟢 Low',
      0: '⚪ None',
    };
    return labels[priority] || labels[0];
  };

  return (
    <div className="h-full flex flex-col bg-linear-gray-950">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-linear-gray-800">
        <div className="h-12 drag-region" />
        <div className="px-6 pb-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-linear-gray-400 hover:text-linear-gray-100 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Issues
          </button>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm text-linear-gray-500 font-mono">{issue.identifier}</span>
                <span className="badge bg-linear-gray-700 text-linear-gray-300">
                  {issue.state.name}
                </span>
                <span className="text-sm text-linear-gray-500">
                  {getPriorityLabel(issue.priority)}
                </span>
              </div>
              <h1 className="text-xl font-semibold text-linear-gray-100">{issue.title}</h1>
            </div>

            <button
              onClick={() => window.electronAPI?.openExternal(issue.url)}
              className="btn-ghost text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              Open in Linear
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          {/* Steps indicator */}
          <div className="flex items-center gap-4 mb-8">
            {[
              { id: 'analyze', label: 'Analyze' },
              { id: 'review', label: 'Review' },
              { id: 'solve', label: 'Solve' },
            ].map((s, i) => {
              const isActive = step === s.id;
              const isPast = ['analyze', 'review', 'solve'].indexOf(step) > i;

              return (
                <React.Fragment key={s.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        isPast
                          ? 'bg-linear-green text-white'
                          : isActive
                          ? 'bg-linear-purple text-white'
                          : 'bg-linear-gray-800 text-linear-gray-500'
                      }`}
                    >
                      {isPast ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        isActive ? 'text-linear-gray-100' : 'text-linear-gray-500'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < 2 && (
                    <div
                      className={`flex-1 h-0.5 ${
                        isPast ? 'bg-linear-green' : 'bg-linear-gray-800'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Description */}
          <div className="card p-6 mb-6">
            <h2 className="text-sm font-medium text-linear-gray-400 mb-3">Description</h2>
            <p className="text-linear-gray-100 whitespace-pre-wrap">
              {issue.description || 'No description provided'}
            </p>

            {issue.labels.length > 0 && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-linear-gray-800">
                {issue.labels.map((label) => (
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
              </div>
            )}
          </div>

          {/* Analysis Results */}
          {isAnalyzing ? (
            <div className="card p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-linear-purple/20 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-linear-purple animate-spin" />
              </div>
              <h3 className="text-lg font-medium text-linear-gray-100 mb-2">
                Analyzing Codebase...
              </h3>
              <p className="text-linear-gray-400">
                Finding relevant files and modules for this issue
              </p>
            </div>
          ) : analysis ? (
            <div className="space-y-6">
              {/* Confidence */}
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-medium text-linear-gray-400">Routing Confidence</h2>
                  <span className="text-lg font-semibold text-linear-green">
                    {(analysis.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-linear-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-linear-purple to-linear-green rounded-full transition-all"
                    style={{ width: `${analysis.confidence * 100}%` }}
                  />
                </div>
                <p className="text-sm text-linear-gray-500 mt-2">
                  Estimated Complexity: <span className="text-linear-gray-300">{analysis.complexity}</span>
                </p>
              </div>

              {/* Relevant Modules */}
              <div className="card p-6">
                <h2 className="text-sm font-medium text-linear-gray-400 mb-4 flex items-center gap-2">
                  <FolderOpen className="w-4 h-4" />
                  Relevant Modules
                </h2>
                <div className="space-y-3">
                  {analysis.modules.map((module) => (
                    <div
                      key={module.path}
                      className="flex items-center justify-between p-3 bg-linear-gray-800/50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-linear-gray-100">{module.name}</p>
                        <p className="text-sm text-linear-gray-500 font-mono">{module.path}</p>
                      </div>
                      <span className="text-sm text-linear-gray-400">
                        {(module.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Suggested Files */}
              <div className="card p-6">
                <h2 className="text-sm font-medium text-linear-gray-400 mb-4 flex items-center gap-2">
                  <FileCode className="w-4 h-4" />
                  Suggested Starting Files
                </h2>
                <div className="space-y-2">
                  {analysis.suggestedFiles.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center justify-between p-3 bg-linear-gray-800/50 rounded-lg"
                    >
                      <p className="font-mono text-sm text-linear-gray-100">{file.path}</p>
                      <p className="text-sm text-linear-gray-500">{file.reason}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Codebase Path */}
              <div className="card p-6">
                <h2 className="text-sm font-medium text-linear-gray-400 mb-3 flex items-center gap-2">
                  <GitBranch className="w-4 h-4" />
                  Working Directory
                </h2>
                <p className="font-mono text-sm text-linear-gray-100 bg-linear-gray-800 px-4 py-3 rounded-lg">
                  {settings.codebasePath || 'Not set - configure in Settings'}
                </p>
                {settings.createBranch && (
                  <p className="text-sm text-linear-gray-500 mt-2">
                    Will create branch:{' '}
                    <code className="text-linear-purple">
                      {settings.branchPrefix}
                      {issue.identifier.toLowerCase()}
                    </code>
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-4">
                <button onClick={copyPrompt} className="btn-secondary flex-1">
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Prompt
                    </>
                  )}
                </button>
                <button
                  onClick={launchClaudeCode}
                  disabled={isSolving || !settings.codebasePath}
                  className="btn-primary flex-1"
                >
                  {isSolving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Launching...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Launch Claude Code
                    </>
                  )}
                </button>
              </div>

              {!settings.codebasePath && (
                <div className="flex items-center gap-2 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  <p className="text-sm text-yellow-400">
                    Please configure your codebase path in Settings before solving issues.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {/* Success state */}
          {step === 'solve' && (
            <div className="card p-12 text-center animate-fade-in">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-linear-green/20 flex items-center justify-center">
                <Zap className="w-8 h-8 text-linear-green" />
              </div>
              <h3 className="text-lg font-medium text-linear-gray-100 mb-2">
                Claude Code Launched!
              </h3>
              <p className="text-linear-gray-400 mb-6">
                Claude Code is now working on your issue. Check your terminal for progress.
              </p>
              <button onClick={onBack} className="btn-secondary">
                Back to Issues
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
