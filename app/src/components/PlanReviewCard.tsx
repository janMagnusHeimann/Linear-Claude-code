import React, { useState } from 'react';
import { CheckCircle, AlertTriangle, Loader2, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

interface Concern {
  severity: 'critical' | 'warning' | 'info';
  type: 'scope' | 'safety' | 'quality' | 'other';
  description: string;
  location?: string;
}

interface ReviewResult {
  approved: boolean;
  confidence: 'high' | 'medium' | 'low';
  concerns: Concern[];
  reasoning: string;
  recommendation: 'approve' | 'reject' | 'manual_review';
}

interface PlanReviewCardProps {
  plan: string;
  reviewResult: ReviewResult | null;
  onApprove: () => void;
  onReject: () => void;
  isReviewing?: boolean;
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'text-red-400';
    case 'warning': return 'text-yellow-400';
    case 'info': return 'text-blue-400';
    default: return 'text-gray-400';
  }
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'critical': return <AlertCircle className="w-4 h-4" />;
    case 'warning': return <AlertTriangle className="w-4 h-4" />;
    default: return <AlertCircle className="w-4 h-4" />;
  }
}

export function PlanReviewCard({
  plan,
  reviewResult,
  onApprove,
  onReject,
  isReviewing = false,
}: PlanReviewCardProps) {
  const [showFullPlan, setShowFullPlan] = useState(false);

  const planPreview = showFullPlan ? plan : plan.slice(0, 800);
  const needsExpansion = plan.length > 800;

  return (
    <div className="card p-6 space-y-4">
      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
        <span>Implementation Plan</span>
        {isReviewing && (
          <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
        )}
      </h3>

      {/* Plan Content */}
      <div className="bg-gray-900 p-4 rounded-lg border border-gray-800 max-h-96 overflow-y-auto">
        <pre className="text-sm text-gray-300 whitespace-pre-wrap break-words font-mono">
          {planPreview}
          {!showFullPlan && needsExpansion && '\n...'}
        </pre>
        {needsExpansion && (
          <button
            onClick={() => setShowFullPlan(!showFullPlan)}
            className="mt-3 flex items-center gap-1 text-purple-400 hover:text-purple-300 text-sm transition-colors"
          >
            {showFullPlan ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Show Full Plan
              </>
            )}
          </button>
        )}
      </div>

      {/* AI Review Result */}
      {reviewResult ? (
        <div
          className={`p-4 rounded-lg border ${
            reviewResult.approved
              ? 'bg-green-900/20 border-green-700'
              : reviewResult.recommendation === 'reject'
              ? 'bg-red-900/20 border-red-700'
              : 'bg-yellow-900/20 border-yellow-700'
          }`}
        >
          <div className="flex items-start gap-3 mb-3">
            {reviewResult.approved ? (
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-white">
                  AI Review: {reviewResult.recommendation.toUpperCase().replace('_', ' ')}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  reviewResult.confidence === 'high'
                    ? 'bg-green-900/30 text-green-300'
                    : reviewResult.confidence === 'medium'
                    ? 'bg-yellow-900/30 text-yellow-300'
                    : 'bg-gray-800 text-gray-400'
                }`}>
                  {reviewResult.confidence} confidence
                </span>
              </div>
              <p className="text-sm text-gray-300">{reviewResult.reasoning}</p>
            </div>
          </div>

          {reviewResult.concerns.length > 0 && (
            <div className="mt-3 space-y-2 pl-8">
              <p className="text-sm font-semibold text-gray-200">Concerns:</p>
              {reviewResult.concerns.map((concern, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 text-sm pl-4 border-l-2 border-gray-600 py-1"
                >
                  <span className={getSeverityColor(concern.severity)}>
                    {getSeverityIcon(concern.severity)}
                  </span>
                  <div className="flex-1">
                    <span className={`font-semibold ${getSeverityColor(concern.severity)}`}>
                      {concern.severity.toUpperCase()}:
                    </span>{' '}
                    <span className="text-gray-300">{concern.description}</span>
                    {concern.location && (
                      <div className="text-xs text-gray-500 mt-1">
                        Location: {concern.location}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : isReviewing ? (
        <div className="flex items-center gap-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <Loader2 className="w-5 h-5 text-purple-400 animate-spin flex-shrink-0" />
          <span className="text-gray-300">AI is reviewing the plan...</span>
        </div>
      ) : null}

      {/* Action Buttons */}
      {reviewResult && !isReviewing && (
        <div className="flex gap-3 pt-2">
          <button
            onClick={onApprove}
            className={`btn flex-1 py-3 rounded-lg font-medium transition-all ${
              reviewResult.approved
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
          >
            {reviewResult.approved ? '✓ Approve & Proceed' : 'Override & Approve Anyway'}
          </button>
          <button
            onClick={onReject}
            className="btn flex-1 py-3 rounded-lg font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-all"
          >
            ✗ Reject & Cancel
          </button>
        </div>
      )}
    </div>
  );
}
