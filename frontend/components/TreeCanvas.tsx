"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dagre from "dagre";
import { AnimatePresence } from "framer-motion";
import { HelpCircle, X } from "lucide-react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NodeHoverCard } from "@/components/NodeHoverCard";
import type { ProjectTree, TreeNode } from "@/lib/types";

type TreeNodeData = {
  task: TreeNode;
  onSelect: (node: TreeNode) => void;
  unlockedBy: TreeNode[];
  waitingOn: TreeNode[];
  positionY: number;
  isHighlighted: boolean;
  isDimmed: boolean;
};

type TreeFlowNode = Node<TreeNodeData, "task">;

const NODE_WIDTH = 260;
const NODE_HEIGHT = 128;

function WorkNode({ data }: NodeProps<TreeFlowNode>) {
  const { task, unlockedBy, waitingOn, positionY, isHighlighted, isDimmed } = data;
  const [showPopup, setShowPopup] = useState(false);
  const hoverTimer = useRef<number | null>(null);

  const handleMouseEnter = () => {
    // 150ms delay before showing popup
    hoverTimer.current = window.setTimeout(() => {
      setShowPopup(true);
    }, 150);
  };

  const handleMouseLeave = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setShowPopup(false);
  };

  // Keyboard accessibility: show tooltip when focused
  const handleFocus = () => setShowPopup(true);
  const handleBlur = () => setShowPopup(false);

  // Touch screen support: tap to show/toggle
  const handleTouchStart = () => {
    setShowPopup((prev) => !prev);
  };

  // Flip position if near the top edge of the canvas (less than 180px)
  const placement = positionY < 180 ? "bottom" : "top";

  return (
    <div
      className={`tree-node-wrapper ${isHighlighted ? "highlighted" : ""} ${isDimmed ? "dimmed" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
    >
      <button
        aria-describedby={showPopup ? `hovercard-${task.id}` : undefined}
        className={`tree-node-card tree-node-${task.status}`}
        onBlur={handleBlur}
        onClick={() => data.onSelect(task)}
        onFocus={handleFocus}
        type="button"
      >
        {/* Left handle for incoming target connections */}
        <Handle className="tree-handle tree-handle-target" position={Position.Left} type="target" />
        <span className="tree-node-topline">
          <span className="tree-node-key">{task.key}</span>
          <span className={`tree-status-dot tree-status-dot-${task.status}`} />
        </span>
        <span className="tree-node-title">{task.title}</span>
        <span className="tree-node-role">{task.role.replace("_", " / ")}</span>
        {/* Right handle for outgoing source connections */}
        <Handle className="tree-handle tree-handle-source" position={Position.Right} type="source" />
      </button>

      {/* Hover / Focus popup card */}
      <AnimatePresence>
        {showPopup && (
          <NodeHoverCard
            placement={placement}
            task={task}
            unlockedBy={unlockedBy}
            waitingOn={waitingOn}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const nodeTypes = { task: WorkNode };

const LEGEND_ITEMS: { status: TreeNode["status"]; label: string; dotClass: string }[] = [
  { status: "locked", label: "Locked", dotClass: "locked" },
  { status: "ready", label: "Ready", dotClass: "ready" },
  { status: "in_progress", label: "In progress", dotClass: "progress" },
  { status: "done", label: "Done", dotClass: "done" },
];

type TreeCanvasProps = {
  tree: ProjectTree;
  onSelectNode: (node: TreeNode) => void;
  pollError?: string;
  highlightedStatus?: TreeNode["status"] | null;
  onHighlightStatusChange?: (status: TreeNode["status"] | null) => void;
};

function TreeCanvasInner({
  tree,
  onSelectNode,
  pollError,
  highlightedStatus: controlledHighlightedStatus,
  onHighlightStatusChange,
}: TreeCanvasProps) {
  const [showMobileEdgeLegend, setShowMobileEdgeLegend] = useState(false);
  const [hoveredStatus, setHoveredStatus] = useState<TreeNode["status"] | null>(null);
  const [pinnedStatus, setPinnedStatus] = useState<TreeNode["status"] | null>(null);
  const { fitView } = useReactFlow();

  // Active status preference: controlled prop > hoveredStatus > pinnedStatus
  const activeStatus =
    controlledHighlightedStatus !== undefined
      ? controlledHighlightedStatus
      : (hoveredStatus ?? pinnedStatus);

  const handleTogglePin = (status: TreeNode["status"]) => {
    const nextStatus = pinnedStatus === status ? null : status;
    setPinnedStatus(nextStatus);
    onHighlightStatusChange?.(nextStatus);
  };

  const handleClearPin = () => {
    setPinnedStatus(null);
    setHoveredStatus(null);
    onHighlightStatusChange?.(null);
  };

  const countsByStatus = useMemo(() => {
    const counts: Record<TreeNode["status"], number> = {
      locked: 0,
      ready: 0,
      in_progress: 0,
      done: 0,
    };
    tree.nodes.forEach((node) => {
      if (counts[node.status] !== undefined) {
        counts[node.status] += 1;
      }
    });
    return counts;
  }, [tree.nodes]);

  // Re-run fitView when demo mode adds nodes or edge dependencies change
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, minZoom: 0.15, maxZoom: 1 });
    }, 60);
    return () => clearTimeout(timer);
  }, [tree.nodes.length, tree.edges.length, fitView]);

  // Re-run fitView on window resize
  useEffect(() => {
    const handleResize = () => {
      fitView({ padding: 0.2, minZoom: 0.15, maxZoom: 1 });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [fitView]);

  // Compute positions with Dagre only when tree structure changes
  const layoutPositions = useMemo(() => {
    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    // Horizontal Left-to-Right layout: ranksep 140 (horizontal gap between steps), nodesep 50 (vertical gap between sibling nodes)
    graph.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 140, marginx: 80, marginy: 90 });

    tree.nodes.forEach((node) => graph.setNode(String(node.id), { width: NODE_WIDTH, height: NODE_HEIGHT }));
    tree.edges.forEach((edge) => {
      if (edge.state !== "hidden") graph.setEdge(String(edge.from_node), String(edge.to_node));
    });
    dagre.layout(graph);

    const positions: Record<string, { x: number; y: number }> = {};
    tree.nodes.forEach((node) => {
      const pos = graph.node(String(node.id));
      if (pos) {
        positions[String(node.id)] = {
          x: pos.x - NODE_WIDTH / 2,
          y: pos.y - NODE_HEIGHT / 2,
        };
      }
    });
    return positions;
  }, [tree]);

  const { nodes, edges } = useMemo(() => {
    const flowNodes: TreeFlowNode[] = tree.nodes.map((task) => {
      const pos = layoutPositions[String(task.id)] ?? { x: 0, y: 0 };

      // Calculate parent dependency nodes for hover popup
      const incomingEdges = tree.edges.filter((e) => e.to_node === task.id);
      const parentNodes = incomingEdges
        .map((e) => tree.nodes.find((n) => n.id === e.from_node))
        .filter((n): n is TreeNode => Boolean(n));

      const unlockedBy = parentNodes.filter((p) => p.status === "done");
      const waitingOn = parentNodes.filter((p) => p.status !== "done");

      const isMatching = activeStatus !== null && task.status === activeStatus;
      const isDimmed = activeStatus !== null && !isMatching;

      return {
        id: String(task.id),
        type: "task",
        position: { x: pos.x, y: pos.y },
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
        data: {
          task,
          onSelect: onSelectNode,
          unlockedBy,
          waitingOn,
          positionY: pos.y,
          isHighlighted: isMatching,
          isDimmed,
        },
        draggable: false,
        selectable: false,
      };
    });

    const flowEdges: Edge[] = tree.edges
      .filter((edge) => edge.state !== "hidden")
      .map((edge) => {
        const isSolid = edge.state === "solid";
        // Yellow-gold (#E6B800) for active/open next step, Dark Cocoa (#3D231E) for completed
        const edgeColor = isSolid ? "#3D231E" : "#E6B800";

        // Check if edge touches any matching node
        const fromNode = tree.nodes.find((n) => n.id === edge.from_node);
        const toNode = tree.nodes.find((n) => n.id === edge.to_node);
        const touchesMatching =
          activeStatus !== null &&
          (fromNode?.status === activeStatus || toNode?.status === activeStatus);

        const isDimmedEdge = activeStatus !== null && !touchesMatching;

        return {
          id: String(edge.id),
          source: String(edge.from_node),
          target: String(edge.to_node),
          type: "smoothstep",
          animated: !isSolid,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: edgeColor,
            width: 15,
            height: 15,
          },
          style: {
            stroke: edgeColor,
            strokeWidth: 2.5,
            strokeDasharray: isSolid ? undefined : "6 6",
            opacity: isDimmedEdge ? 0.25 : 1,
            transition: "opacity 200ms ease",
          },
        };
      });

    return { nodes: flowNodes, edges: flowEdges };
  }, [activeStatus, layoutPositions, onSelectNode, tree]);

  return (
    <div className="tree-canvas">
      {/* Interactive Status Legend in Top-Left inside Canvas */}
      <div
        aria-label="Node status filter and legend"
        className="tree-status-legend"
        role="toolbar"
      >
        {LEGEND_ITEMS.map((item) => {
          const count = countsByStatus[item.status];
          const hasNoNodes = count === 0;
          const isItemActive = activeStatus === item.status;
          const isItemPinned = pinnedStatus === item.status;

          return (
            <button
              key={item.status}
              aria-label={`Highlight ${item.label} nodes${hasNoNodes ? " (No nodes in this state)" : ""}`}
              aria-pressed={isItemPinned}
              className={`tree-legend-item ${isItemActive ? "active" : ""} ${isItemPinned ? "pinned" : ""} ${hasNoNodes ? "empty" : ""}`}
              onBlur={() => setHoveredStatus(null)}
              onClick={() => {
                if (hasNoNodes) return;
                handleTogglePin(item.status);
              }}
              onFocus={() => {
                if (!hasNoNodes) setHoveredStatus(item.status);
              }}
              onMouseEnter={() => {
                if (!hasNoNodes) setHoveredStatus(item.status);
              }}
              onMouseLeave={() => setHoveredStatus(null)}
              type="button"
            >
              <i className={`legend-dot legend-${item.dotClass}`} />
              <span>{item.label}</span>
              {hasNoNodes && (
                <span className="legend-empty-tooltip" role="tooltip">
                  No nodes in this state
                </span>
              )}
            </button>
          );
        })}

        {pinnedStatus && (
          <button
            aria-label="Clear pinned highlight"
            className="legend-clear-btn"
            onClick={handleClearPin}
            type="button"
          >
            <X aria-hidden="true" size={11} />
            <span>Clear</span>
          </button>
        )}
      </div>

      {pollError && (
        <p className="tree-poll-error" role="status">
          {pollError}
        </p>
      )}

      {/* Edge Legend in Top-Right inside Canvas */}
      <div className="edge-legend-box">
        <button
          aria-expanded={showMobileEdgeLegend}
          aria-label="Toggle line legend"
          className="edge-legend-toggle"
          onClick={() => setShowMobileEdgeLegend((prev) => !prev)}
          type="button"
        >
          <HelpCircle aria-hidden="true" size={15} />
          <span>How to read lines</span>
        </button>

        <div className={`edge-legend-card ${showMobileEdgeLegend ? "edge-legend-card-mobile-open" : ""}`}>
          <div className="edge-legend-title">How to read the lines</div>
          <div className="edge-legend-rows">
            <div className="edge-legend-row">
              <svg aria-hidden="true" className="edge-sample-svg" height="12" viewBox="0 0 36 12" width="36">
                <line
                  className="edge-sample-animated-line"
                  stroke="#E6B800"
                  strokeDasharray="5 5"
                  strokeLinecap="round"
                  strokeWidth="2.5"
                  x1="2"
                  x2="34"
                  y1="6"
                  y2="6"
                />
              </svg>
              <div className="edge-legend-text">
                <span className="edge-legend-label">Open next step</span>
                <span className="edge-legend-helper">This teammate can start now</span>
              </div>
            </div>
            <div className="edge-legend-row">
              <svg aria-hidden="true" className="edge-sample-svg" height="12" viewBox="0 0 36 12" width="36">
                <line
                  stroke="#3D231E"
                  strokeLinecap="round"
                  strokeWidth="2.5"
                  x1="2"
                  x2="34"
                  y1="6"
                  y2="6"
                />
              </svg>
              <div className="edge-legend-text">
                <span className="edge-legend-label">Completed</span>
                <span className="edge-legend-helper">This work is finished</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Horizontal Flowchart Canvas with fitView and light grey dot-grid */}
      <ReactFlow
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2, minZoom: 0.15, maxZoom: 1 }}
        minZoom={0.1}
        nodeTypes={nodeTypes}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        panOnDrag
        panOnScroll
        proOptions={{ hideAttribution: true }}
        zoomOnPinch
        zoomOnScroll
      >
        {/* Light grey dot-grid pattern on pure white canvas */}
        <Background color="#E2E8F0" gap={24} size={1.5} />
        <Controls position="bottom-left" showInteractive={false} />

        {/* Properly styled minimap with status colors matching horizontal layout */}
        <MiniMap
          ariaLabel="Tree overview minimap"
          bgColor="#F8FAFC"
          maskColor="rgba(185, 229, 236, 0.35)"
          maskStrokeColor="#3D231E"
          maskStrokeWidth={1.5}
          nodeBorderRadius={4}
          nodeColor={(node) => {
            const task = (node.data as TreeNodeData)?.task;
            if (!task) return "#CBD5E1";
            if (task.status === "done") return "#3D231E";
            if (task.status === "in_progress") return "#D7EFF4";
            if (task.status === "ready") return "#FFE066";
            return "#E2E8F0";
          }}
          nodeStrokeColor={(node) => {
            const task = (node.data as TreeNodeData)?.task;
            if (!task) return "#94A3B8";
            if (task.status === "done") return "#1F120F";
            if (task.status === "in_progress") return "#3D231E";
            if (task.status === "ready") return "#D97706";
            return "#94A3B8";
          }}
          nodeStrokeWidth={1.5}
          pannable
          position="bottom-right"
          zoomable
        />
      </ReactFlow>
    </div>
  );
}

export function TreeCanvas(props: TreeCanvasProps) {
  if (props.tree.nodes.length === 0) {
    return (
      <div className="tree-empty">
        <h2>This tree is still taking root.</h2>
        <p>There are no approved work nodes yet. Review and approve the project plan to see its tree.</p>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <TreeCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
