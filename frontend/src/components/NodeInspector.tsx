import React, { useState } from "react";
import { NodeDetailResponse } from "../types";

interface NodeInspectorProps {
  detail: NodeDetailResponse | null;
  onConfirmNode: (nodeId: number) => Promise<void>;
  isConfirming: boolean;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  detail,
  onConfirmNode,
  isConfirming,
}) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!detail) {
    return (
      <div className="border border-[#0E1013] bg-[#FFFFFF] p-8 text-left shadow-[4px_4px_0px_#0E1013]">
        <h3 className="font-display font-bold text-lg text-[#0E1013] mb-2">
          Node Inspector
        </h3>
        <p className="text-sm text-[#78716C]">
          Select any task node in the dependency graph to inspect its evaluation state, matched commits, and criteria.
        </p>
      </div>
    );
  }

  const handleConfirm = async () => {
    setErrorMessage(null);
    try {
      await onConfirmNode(detail.node.id);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to confirm node completion");
    }
  };

  const isCompleted = detail.status === "done";
  const isLocked = detail.status === "locked";
  const canConfirm = !isCompleted && !isLocked;

  return (
    <div className="border border-[#0E1013] bg-[#FFFFFF] shadow-[6px_6px_0px_#0E1013] text-left">
      {/* Header */}
      <div className="border-b border-[#E5E2DC] px-6 py-4 bg-[#F4F3EF] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-display font-bold text-lg text-[#C2410C]">
            [{detail.node.key}]
          </span>
          <h3 className="font-display font-bold text-lg text-[#0E1013]">
            {detail.title}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 border border-[#0E1013] bg-[#FFFFFF]">
            Role: {detail.role}
          </span>
          <span
            className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 border ${
              detail.status === "done"
                ? "bg-[#D1FAE5] border-[#059669] text-[#047857]"
                : detail.status === "in_progress"
                ? "bg-[#FEF3C7] border-[#D97706] text-[#B45309]"
                : detail.status === "ready"
                ? "bg-[#E0F2FE] border-[#0284C7] text-[#0369A1]"
                : "bg-[#F4F3EF] border-[#E5E2DC] text-[#78716C]"
            }`}
          >
            {detail.status}
          </span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Verification Criteria */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#78716C] mb-1">
            Satisfaction Criteria
          </h4>
          <p className="text-sm font-medium text-[#0E1013] bg-[#FBFBF9] p-3 border border-[#E5E2DC]">
            {detail.done_criteria || "No explicit criteria specified."}
          </p>
        </div>

        {/* Ownership & Path hints */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#78716C] mb-1">
              Assigned Role Owner
            </h4>
            <div className="text-sm font-medium text-[#0E1013] bg-[#FBFBF9] p-2 border border-[#E5E2DC]">
              {detail.owner ? (
                <span>@{detail.owner.username} (ID: #{detail.owner.id})</span>
              ) : (
                <span className="text-[#78716C]">Awaiting role assignment</span>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#78716C] mb-1">
              Tracked Path Hints
            </h4>
            <div className="text-xs text-[#0E1013] bg-[#FBFBF9] p-2 border border-[#E5E2DC] font-mono truncate">
              {detail.node.path_hints && detail.node.path_hints.length > 0
                ? detail.node.path_hints.join(", ")
                : "None registered"}
            </div>
          </div>
        </div>

        {/* Latest AI Evaluation Decision */}
        {detail.latest_ai_decision && (
          <div className="border border-[#E5E2DC] bg-[#FBFBF9] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0E1013]">
                AI Decision Signal
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 border border-[#0E1013] bg-[#FFFFFF]">
                Verdict: {detail.latest_ai_decision.verdict} ({(detail.latest_ai_decision.confidence * 100).toFixed(0)}% confidence)
              </span>
            </div>
            <p className="text-xs text-[#57534E] leading-relaxed">
              {detail.latest_ai_decision.reason}
            </p>
          </div>
        )}

        {/* Matched Git Commits */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#78716C] mb-2">
            Matched Git Commits ({detail.commits.length})
          </h4>
          {detail.commits.length === 0 ? (
            <div className="p-4 border border-dashed border-[#E5E2DC] text-xs text-[#78716C] text-center">
              No commits matched yet. Incoming push webhooks with explicit tags or matching path hints will link here.
            </div>
          ) : (
            <div className="space-y-2">
              {detail.commits.map((c) => (
                <div
                  key={c.commit_id}
                  className="p-3 border border-[#E5E2DC] bg-[#FFFFFF] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-[#0E1013]">
                      {c.message}
                    </span>
                    <span className="text-[11px] text-[#78716C] font-mono">
                      sha: {c.sha.slice(0, 7)} by @{c.author_login || "unknown"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 bg-[#F4F3EF] border border-[#E5E2DC] text-[#57534E]">
                      Method: {c.method}
                    </span>
                    <span className="font-semibold text-[#0E1013]">
                      {(c.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Controls & Error banner */}
        {errorMessage && (
          <div className="p-3 bg-[#FEE2E2] border border-[#DC2626] text-xs text-[#B91C1C] font-medium">
            {errorMessage}
          </div>
        )}

        <div className="pt-4 border-t border-[#E5E2DC] flex items-center justify-between">
          <span className="text-xs text-[#78716C]">
            {isCompleted
              ? "This task is satisfied and all outgoing dependency paths have activated."
              : isLocked
              ? "Locked until upstream parent criteria are fulfilled."
              : "Review changes and execute manual sign-off to cascade downstream dependencies."}
          </span>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || isConfirming}
            className={`px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all shadow-[2px_2px_0px_#000000] border border-[#000000] ${
              canConfirm
                ? "bg-[#059669] text-[#FFFFFF] hover:bg-[#047857] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                : "bg-[#E5E2DC] text-[#78716C] cursor-not-allowed opacity-75 shadow-none"
            }`}
          >
            {isConfirming
              ? "Executing Unlock Cascade..."
              : isCompleted
              ? "Task Complete"
              : "Confirm Completion"}
          </button>
        </div>
      </div>
    </div>
  );
};
