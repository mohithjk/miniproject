import React from "react";
import { EdgeSchema, NodeSchema, Role } from "../types";

interface InteractiveTreeProps {
  nodes: NodeSchema[];
  edges: EdgeSchema[];
  selectedNodeId: number | null;
  onSelectNode: (nodeId: number) => void;
  progress: {
    done: number;
    total: number;
    percentage: number;
  };
  lastEventId: number;
}

const ROLE_COLORS: Record<Role, { text: string; bg: string; border: string }> = {
  frontend: { text: "#0369A1", bg: "#E0F2FE", border: "#0284C7" },
  backend: { text: "#047857", bg: "#D1FAE5", border: "#059669" },
  ai_ml: { text: "#B45309", bg: "#FEF3C7", border: "#D97706" },
  security: { text: "#B91C1C", bg: "#FEE2E2", border: "#DC2626" },
  devops: { text: "#334155", bg: "#F1F5F9", border: "#475569" },
};

export const InteractiveTree: React.FC<InteractiveTreeProps> = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  progress,
  lastEventId,
}) => {
  return (
    <div className="border border-[#0E1013] bg-[#FFFFFF] shadow-[6px_6px_0px_#0E1013]">
      {/* Visual Canvas Header */}
      <div className="border-b border-[#E5E2DC] px-6 py-4 bg-[#F4F3EF] flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-lg text-[#0E1013]">
            Repository Dependency Graph
          </h2>
          <span className="text-xs text-[#57534E]">
            Click any task tile to inspect matched commits, criteria, and decision signals.
          </span>
        </div>

        {/* Real-time Progress Bar */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold text-[#0E1013]">
              {progress.done} of {progress.total} Tasks Completed ({progress.percentage.toFixed(0)}%)
            </span>
            <span className="text-[11px] text-[#78716C]">
              Last Event ID: #{lastEventId}
            </span>
          </div>
          <div className="w-32 h-3 bg-[#E5E2DC] border border-[#0E1013] overflow-hidden">
            <div
              className="h-full bg-[#059669] transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Graph Visual Canvas */}
      <div className="p-8 bg-[#FBFBF9] overflow-x-auto min-h-[460px] flex flex-col justify-between">
        {/* Visual Edge Connection Flow Description */}
        <div className="flex items-center gap-6 mb-8 text-xs font-medium text-[#57534E]">
          <div className="flex items-center gap-2">
            <span className="w-6 h-0.5 bg-[#059669]" />
            <span>Solid Line: Criteria Satisfied</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-0.5 border-t-2 border-dashed border-[#D97706]" />
            <span>Dotted Line: Active Dependency Path</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-0.5 border-t-2 border-dotted border-[#E5E2DC]" />
            <span>Muted: Upstream Incomplete</span>
          </div>
        </div>

        {/* Nodes Grid organized by DAG depth */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {/* Level 0: Root nodes */}
          <div className="flex flex-col gap-4">
            <div className="text-xs font-bold uppercase tracking-wider text-[#78716C]">
              Stage 1: Architecture Core
            </div>
            {nodes
              .filter((n) => n.key === "n1")
              .map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  isSelected={selectedNodeId === node.id}
                  onClick={() => onSelectNode(node.id)}
                />
              ))}
          </div>

          {/* Level 1: Intermediate nodes */}
          <div className="flex flex-col gap-4">
            <div className="text-xs font-bold uppercase tracking-wider text-[#78716C]">
              Stage 2: Interface &amp; Security
            </div>
            {nodes
              .filter((n) => n.key === "n2" || n.key === "n3")
              .map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  isSelected={selectedNodeId === node.id}
                  onClick={() => onSelectNode(node.id)}
                />
              ))}
          </div>

          {/* Level 2: Downstream convergence */}
          <div className="flex flex-col gap-4">
            <div className="text-xs font-bold uppercase tracking-wider text-[#78716C]">
              Stage 3: Deployment Pipeline
            </div>
            {nodes
              .filter((n) => n.key === "n4")
              .map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  isSelected={selectedNodeId === node.id}
                  onClick={() => onSelectNode(node.id)}
                />
              ))}
          </div>
        </div>

        {/* Edge relations inspector footer */}
        <div className="mt-8 pt-4 border-t border-[#E5E2DC] flex flex-wrap gap-4 text-xs text-[#57534E]">
          <span className="font-semibold text-[#0E1013]">Registered DAG Edges:</span>
          {edges.map((e) => (
            <span
              key={e.id}
              className={`px-2 py-0.5 border ${
                e.state === "solid"
                  ? "bg-[#D1FAE5] border-[#059669] text-[#047857]"
                  : e.state === "dotted"
                  ? "bg-[#FEF3C7] border-[#D97706] text-[#B45309]"
                  : "bg-[#F4F3EF] border-[#E5E2DC] text-[#78716C]"
              }`}
            >
              Edge #{e.id}: Node {e.from_node} &rarr; Node {e.to_node} ({e.state})
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

interface NodeCardProps {
  node: NodeSchema;
  isSelected: boolean;
  onClick: () => void;
}

const NodeCard: React.FC<NodeCardProps> = ({ node, isSelected, onClick }) => {
  const roleStyle = ROLE_COLORS[node.role] || ROLE_COLORS.backend;

  const statusBadge = {
    done: { text: "Completed", bg: "#D1FAE5", color: "#047857", border: "#059669" },
    in_progress: { text: "In Progress", bg: "#FEF3C7", color: "#B45309", border: "#D97706" },
    ready: { text: "Ready for Work", bg: "#E0F2FE", color: "#0369A1", border: "#0284C7" },
    locked: { text: "Locked (Waiting)", bg: "#F4F3EF", color: "#78716C", border: "#E5E2DC" },
  }[node.status];

  return (
    <div
      onClick={onClick}
      className={`p-4 border text-left cursor-pointer transition-all ${
        isSelected
          ? "border-[#000000] bg-[#FFFFFF] shadow-[4px_4px_0px_#C2410C] ring-2 ring-[#C2410C]"
          : "border-[#0E1013] bg-[#FFFFFF] hover:border-[#C2410C] shadow-[3px_3px_0px_#0E1013]"
      }`}
    >
      {/* Header row: key tag + role badge */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-display font-bold text-sm text-[#0E1013] uppercase tracking-wider">
          [{node.key}]
        </span>
        <span
          className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 border"
          style={{
            color: roleStyle.text,
            backgroundColor: roleStyle.bg,
            borderColor: roleStyle.border,
          }}
        >
          {node.role.replace("_", "/")}
        </span>
      </div>

      <h3 className="font-display font-bold text-base text-[#0E1013] mb-2 leading-snug">
        {node.title}
      </h3>

      <p className="text-xs text-[#57534E] mb-3 line-clamp-2 leading-relaxed">
        {node.description}
      </p>

      {/* Footer status row */}
      <div className="pt-2 border-t border-[#E5E2DC] flex items-center justify-between">
        <span
          className="text-[11px] font-bold px-2 py-0.5 border"
          style={{
            color: statusBadge.color,
            backgroundColor: statusBadge.bg,
            borderColor: statusBadge.border,
          }}
        >
          {statusBadge.text}
        </span>

        {node.owner_id ? (
          <span className="text-[11px] font-medium text-[#0E1013]">
            Owner #{node.owner_id}
          </span>
        ) : (
          <span className="text-[11px] text-[#78716C]">Unassigned</span>
        )}
      </div>
    </div>
  );
};
