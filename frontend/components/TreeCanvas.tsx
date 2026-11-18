"use client";

import { useMemo, useRef, useState } from "react";
import dagre from "dagre";
import { AnimatePresence } from "framer-motion";
import { HelpCircle } from "lucide-react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
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
};

type TreeFlowNode = Node<TreeNodeData, "task">;

const NODE_WIDTH = 260;
const NODE_HEIGHT = 128;

function WorkNode({ data }: NodeProps<TreeFlowNode>) {
  const { task, unlockedBy, waitingOn, positionY } = data;
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
      className="tree-node-wrapper"
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
        <Handle className="tree-handle" position={Position.Top} type="target" />
        <span className="tree-node-topline">
          <span className="tree-node-key">{task.key}</span>
          <span className={`tree-status-dot tree-status-dot-${task.status}`} />
        </span>
        <span className="tree-node-title">{task.title}</span>
        <span className="tree-node-role">{task.role.replace("_", " / ")}</span>
        <Handle className="tree-handle" position={Position.Bottom} type="source" />
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

type TreeCanvasProps = {
  tree: ProjectTree;
  onSelectNode: (node: TreeNode) => void;
  pollError?: string;
};

export function TreeCanvas({ tree, onSelectNode, pollError }: TreeCanvasProps) {
  const [showMobileEdgeLegend, setShowMobileEdgeLegend] = useState(false);

  const { nodes, edges } = useMemo(() => {
    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    // Generous marginy (110) prevents top node N1 from clipping under legends or the progress bar
    graph.setGraph({ rankdir: "TB", nodesep: 48, ranksep: 84, marginx: 48, marginy: 110 });

    tree.nodes.forEach((node) => graph.setNode(String(node.id), { width: NODE_WIDTH, height: NODE_HEIGHT }));
    tree.edges.forEach((edge) => {
      if (edge.state !== "hidden") graph.setEdge(String(edge.from_node), String(edge.to_node));
    });
    dagre.layout(graph);

    const flowNodes: TreeFlowNode[] = tree.nodes.map((task) => {
      const position = graph.node(String(task.id));

      // Calculate parent dependency nodes for hover popup
      const incomingEdges = tree.edges.filter((e) => e.to_node === task.id);
      const parentNodes = incomingEdges
        .map((e) => tree.nodes.find((n) => n.id === e.from_node))
        .filter((n): n is TreeNode => Boolean(n));

      const unlockedBy = parentNodes.filter((p) => p.status === "done");
      const waitingOn = parentNodes.filter((p) => p.status !== "done");

      const posX = position ? position.x - NODE_WIDTH / 2 : 0;
      const posY = position ? position.y - NODE_HEIGHT / 2 : 0;

      return {
        id: String(task.id),
        type: "task",
        position: { x: posX, y: posY },
        data: {
          task,
          onSelect: onSelectNode,
          unlockedBy,
          waitingOn,
          positionY: posY,
        },
        draggable: false,
        selectable: false,
      };
    });

    const flowEdges: Edge[] = tree.edges
      .filter((edge) => edge.state !== "hidden")
      .map((edge) => {
        const isSolid = edge.state === "solid";
        // Deeper Solar Yellow-gold (#E6B800) for sharp visibility on white background
        const edgeColor = isSolid ? "#3D231E" : "#E6B800";
        return {
          id: String(edge.id),
          source: String(edge.from_node),
          target: String(edge.to_node),
          type: "smoothstep",
          animated: !isSolid,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: edgeColor,
          },
          style: {
            stroke: edgeColor,
            strokeWidth: 2.5,
            strokeDasharray: isSolid ? undefined : "6 6",
          },
        };
      });

    return { nodes: flowNodes, edges: flowEdges };
  }, [onSelectNode, tree]);

  if (tree.nodes.length === 0) {
    return (
      <div className="tree-empty">
        <h2>This tree is still taking root.</h2>
        <p>There are no approved work nodes yet. Review and approve the project plan to see its tree.</p>
      </div>
    );
  }

  return (
    <div className="tree-canvas">
      {/* CHANGE 1: Status Legend in Top-Left inside Canvas */}
      <div className="tree-status-legend" aria-label="Node status legend">
        <span><i className="legend-dot legend-locked" /> Locked</span>
        <span><i className="legend-dot legend-ready" /> Ready</span>
        <span><i className="legend-dot legend-progress" /> In progress</span>
        <span><i className="legend-dot legend-done" /> Done</span>
      </div>

      {pollError && (
        <p className="tree-poll-error" role="status">
          {pollError}
        </p>
      )}

      {/* CHANGE 2: Edge Legend in Top-Right inside Canvas */}
      <div className="edge-legend-box">
        <button
          type="button"
          className="edge-legend-toggle"
          onClick={() => setShowMobileEdgeLegend((prev) => !prev)}
          aria-label="Toggle line legend"
          aria-expanded={showMobileEdgeLegend}
        >
          <HelpCircle aria-hidden="true" size={15} />
          <span>How to read lines</span>
        </button>

        <div className={`edge-legend-card ${showMobileEdgeLegend ? "edge-legend-card-mobile-open" : ""}`}>
          <div className="edge-legend-title">How to read the lines</div>
          <div className="edge-legend-rows">
            <div className="edge-legend-row">
              <svg className="edge-sample-svg" width="36" height="12" viewBox="0 0 36 12" aria-hidden="true">
                <line
                  x1="2"
                  y1="6"
                  x2="34"
                  y2="6"
                  stroke="#E6B800"
                  strokeWidth="2.5"
                  strokeDasharray="5 5"
                  strokeLinecap="round"
                  className="edge-sample-animated-line"
                />
              </svg>
              <div className="edge-legend-text">
                <span className="edge-legend-label">Open next step</span>
                <span className="edge-legend-helper">This teammate can start now</span>
              </div>
            </div>
            <div className="edge-legend-row">
              <svg className="edge-sample-svg" width="36" height="12" viewBox="0 0 36 12" aria-hidden="true">
                <line
                  x1="2"
                  y1="6"
                  x2="34"
                  y2="6"
                  stroke="#3D231E"
                  strokeWidth="2.5"
                  strokeLinecap="round"
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

      {/* CHANGE 3: White Flowchart Canvas with fitView and light grey dot-grid */}
      <ReactFlow
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.28, minZoom: 0.25, maxZoom: 1 }}
        minZoom={0.15}
        nodeTypes={nodeTypes}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        proOptions={{ hideAttribution: true }}
      >
        {/* Light grey dot-grid pattern on pure white canvas */}
        <Background color="#E2E8F0" gap={24} size={1.5} />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          maskColor="rgba(255, 255, 255, 0.75)"
          nodeColor={(node) => {
            const task = (node.data as TreeNodeData).task;
            if (task.status === "done") return "#3D231E";
            if (task.status === "in_progress") return "#D7EFF4";
            if (task.status === "ready") return "#FFD33D";
            return "#EDF5F7";
          }}
          position="bottom-right"
          zoomable
          pannable
        />
      </ReactFlow>
    </div>
  );
}
