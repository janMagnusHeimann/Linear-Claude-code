import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  GitBranch,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Play,
  XCircle,
  CheckCircle,
} from 'lucide-react';
import { useLinear } from '../contexts/LinearContext';
import { useSettings } from '../contexts/SettingsContext';
import { ExecutionProgress } from '../components/ExecutionProgress';
import { LiveTerminal } from '../components/LiveTerminal';
import { PlanReviewCard } from '../components/PlanReviewCard';

interface SolveViewProps {
  issueId: string | null;
  onBack: () => void;
}

type ExecutionState =
  | 'idle'
  | 'INITIALIZING'
  | 'PLANNING'
  | 'AWAITING_APPROVAL'
  | 'REVIEWING_PLAN'
  | 'IMPLEMENTING'
  | 'COMPLETE'
  | 'ERROR'
  | 'CANCELLED';

export function SolveView({ issueId, onBack }: SolveViewProps) {
  const { getIssueById } = useLinear();
  const { settings } = useSettings();
  const [isSolving, setIsSolving] = useState(false);

  // Claude Code execution state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [executionState, setExecutionState] = useState<ExecutionState>('idle');
  const [liveOutput, setLiveOutput] = useState<string>('');
  const [plan, setPlan] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<any>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  const issue = issueId ? getIssueById(issueId) : null;

  // Listen for Claude Code progress updates
  useEffect(() => {
    if (!window.electronAPI || !sessionId) return;

    const unsubscribe = window.electronAPI.onClaudeCodeProgress((update: any) => {
      if (update.sessionId !== sessionId) return;

      setExecutionState(update.stage);
      if (update.output) {
        setLiveOutput((prev) => prev + update.output);
      }
      if (update.plan) {
        setPlan(update.plan);
      }
      if (update.reviewResult) {
        setReviewResult(update.reviewResult);
      }
      if (update.prUrl) {
        setPrUrl(update.prUrl);
      }

      // Update step when complete
      if (update.stage === 'COMPLETE') {
        setIsSolving(false);
      }

      // Handle errors
      if (update.stage === 'ERROR') {
        setIsSolving(false);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [sessionId]);

  const generatePrompt = () => {
    if (!issue) return '';

    return `# Issue: ${issue.identifier} - ${issue.title}

## Description
${issue.description || 'No description provided'}

## Labels
${issue.labels.map((l) => l.name).join(', ') || 'None'}

## Instructions
Please solve this issue following the project's best practices.`;
  };

  const launchClaudeCode = async () => {
    if (!settings.codebasePath || !issue) {
      alert('Please set a codebase path in Settings');
      return;
    }

    setIsSolving(true);
    setExecutionState('INITIALIZING');
    setLiveOutput('');
    setPlan(null);
    setReviewResult(null);

    try {
      const branchName = settings.createBranch
        ? `${settings.branchPrefix}${issue.identifier.toLowerCase()}-${issue.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .substring(0, 30)}`
        : undefined;

      if (window.electronAPI) {
        const result = await window.electronAPI.invokeClaudeCode({
          workingDirectory: settings.codebasePath,
          prompt: generatePrompt(),
          branchName,
          issueId: issue.id,
          issueTitle: issue.title,
          issueDescription: issue.description || undefined,
          issueUrl: issue.url,
          issueLabels: issue.labels.map(l => l.name),
        });

        if (result.success && result.sessionId) {
          setSessionId(result.sessionId);
        } else {
          throw new Error(result.error || 'Failed to start Claude Code');
        }
      }
    } catch (error: any) {
      console.error('Failed to launch Claude Code:', error);
      alert(`Failed to launch Claude Code: ${error.message}`);
      setExecutionState('idle');
      setIsSolving(false);
    }
  };

  const handlePlanDecision = async (approved: boolean) => {
    if (!sessionId || !window.electronAPI) return;

    try {
      await window.electronAPI.approveClaudeCodePlan({
        sessionId,
        approved,
      });
    } catch (error: any) {
      console.error('Failed to approve/reject plan:', error);
      alert(`Failed to ${approved ? 'approve' : 'reject'} plan: ${error.message}`);
    }
  };

  const cancelExecution = async () => {
    if (!sessionId || !window.electronAPI) return;

    try {
      await window.electronAPI.cancelClaudeCode({ sessionId });
      setExecutionState('CANCELLED');
      setIsSolving(false);
    } catch (error: any) {
      console.error('Failed to cancel execution:', error);
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
        <div className="max-w-4xl mx-auto space-y-6">

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

          {/* Execution Monitor */}
          {executionState !== 'idle' && (
            <div className="space-y-6 mt-6">
              {/* Progress Indicator */}
              <ExecutionProgress state={executionState} />

              {/* Live Output Terminal */}
              <LiveTerminal output={liveOutput} />

              {/* Plan Review (when ready) */}
              {plan && (executionState === 'AWAITING_APPROVAL' || executionState === 'REVIEWING_PLAN') && (
                <PlanReviewCard
                  plan={plan}
                  reviewResult={reviewResult}
                  onApprove={() => handlePlanDecision(true)}
                  onReject={() => handlePlanDecision(false)}
                  isReviewing={executionState === 'REVIEWING_PLAN'}
                />
              )}

              {/* Cancel Button */}
              {executionState !== 'COMPLETE' && executionState !== 'ERROR' && executionState !== 'CANCELLED' && (
                <button
                  onClick={cancelExecution}
                  className="btn-secondary w-full"
                >
                  <XCircle className="w-4 h-4" />
                  Cancel Execution
                </button>
              )}
            </div>
          )}

          {/* Completion Status with PR Link */}
          {executionState === 'COMPLETE' && (
            <div className="card p-6 bg-green-500/10 border-green-500/20">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-500" />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-green-400">
                    Issue Solved Successfully!
                  </h3>
                  {prUrl && (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        window.electronAPI?.openExternal(prUrl);
                      }}
                      className="text-sm text-linear-purple hover:underline mt-1 inline-flex items-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View Pull Request
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
