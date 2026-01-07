import React from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

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

interface ExecutionProgressProps {
  state: ExecutionState;
}

interface Stage {
  id: string;
  label: string;
  states: ExecutionState[];
}

const stages: Stage[] = [
  { id: 'init', label: 'Initializing', states: ['INITIALIZING'] },
  { id: 'plan', label: 'Creating Plan', states: ['PLANNING'] },
  { id: 'review', label: 'Reviewing Plan', states: ['AWAITING_APPROVAL', 'REVIEWING_PLAN'] },
  { id: 'implement', label: 'Implementing', states: ['IMPLEMENTING'] },
  { id: 'complete', label: 'Complete', states: ['COMPLETE'] },
];

function getStageStatus(stage: Stage, currentState: ExecutionState): 'pending' | 'active' | 'complete' | 'error' {
  if (currentState === 'ERROR') return 'error';
  if (currentState === 'CANCELLED') return 'error';

  // COMPLETE state should always show all stages as complete
  if (currentState === 'COMPLETE') return 'complete';

  if (stage.states.includes(currentState)) return 'active';

  const currentStageIndex = stages.findIndex(s => s.states.includes(currentState));
  const stageIndex = stages.indexOf(stage);

  if (currentStageIndex === -1) return 'pending';
  if (stageIndex < currentStageIndex) return 'complete';
  return 'pending';
}

function StageIndicator({ stage, status }: { stage: Stage; status: 'pending' | 'active' | 'complete' | 'error' }) {
  const getIcon = () => {
    if (status === 'complete') {
      return <CheckCircle2 className="w-5 h-5 text-green-400" />;
    }
    if (status === 'error') {
      return <AlertCircle className="w-5 h-5 text-red-400" />;
    }
    if (status === 'active') {
      return <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />;
    }
    return <div className="w-5 h-5 rounded-full border-2 border-gray-600" />;
  };

  const getTextColor = () => {
    if (status === 'complete') return 'text-green-400';
    if (status === 'error') return 'text-red-400';
    if (status === 'active') return 'text-purple-400';
    return 'text-gray-500';
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-800/50">
        {getIcon()}
      </div>
      <span className={`text-sm font-medium ${getTextColor()}`}>
        {stage.label}
      </span>
    </div>
  );
}

function Separator({ active }: { active: boolean }) {
  return (
    <div className="flex-1 h-0.5 bg-gray-700 relative" style={{ marginTop: '20px' }}>
      {active && (
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-purple-500/0 animate-pulse" />
      )}
    </div>
  );
}

export function ExecutionProgress({ state }: ExecutionProgressProps) {
  if (state === 'idle') return null;

  return (
    <div className="card p-6">
      <div className="flex items-start gap-4">
        {stages.map((stage, idx) => {
          const status = getStageStatus(stage, state);
          const nextStage = stages[idx + 1];
          const nextStatus = nextStage ? getStageStatus(nextStage, state) : 'pending';

          return (
            <React.Fragment key={stage.id}>
              <StageIndicator stage={stage} status={status} />
              {idx < stages.length - 1 && (
                <Separator active={status === 'complete' && nextStatus === 'active'} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {state === 'ERROR' && (
        <div className="mt-4 p-3 bg-red-900/20 border border-red-700 rounded-lg text-sm text-red-300">
          Execution failed. Check the output for details.
        </div>
      )}

      {state === 'CANCELLED' && (
        <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700 rounded-lg text-sm text-yellow-300">
          Execution cancelled by user.
        </div>
      )}

      {state === 'COMPLETE' && (
        <div className="mt-4 p-3 bg-green-900/20 border border-green-700 rounded-lg text-sm text-green-300">
          ✓ Claude Code completed successfully!
        </div>
      )}
    </div>
  );
}
