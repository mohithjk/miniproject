"use client";

import { useMemo } from "react";
import dagre from "dagre";
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
import type { ProjectTree, TreeNode } from "@/lib/types";

type TreeNodeData = {
  task: TreeNode;
  onSelect: (node: TreeNode) => void;
};

type TreeFlowNode = Node<TreeNodeData, "task">;

const NODE_WIDTH = 260;
const NODE_HEIGHT = 128;

function WorkNode({ data }: NodeProps<TreeFlowNode>) {
  const { task } = data;
  return (
    <button
      className={`tree-node-card tree-node-${task.status}`}
      onClick={() => data.onSelect(task)}
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
  );
}

const nodeTypes = { task: WorkNode };

type TreeCanvasProps = {
  tree: ProjectTree;
  onSelectNode: (node: TreeNode) => void;
};

export function TreeCanvas({ tree, onSelectNode }: TreeCanvasProps) {
  const { nodes, edges } = useMemo(() => {
    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: "TB", nodesep: 44, ranksep: 76, marginx: 40, marginy: 45 });

    tree.nodes.forEach((node) => graph.setNode(String(node.id), { width: NODE_WIDTH, height: NODE_HEIGHT }));
    tree.edges.forEach((edge) => {
      if (edge.state !== "hidden") graph.setEdge(String(edge.from_node), String(edge.to_node));
    });
    dagre.layout(graph);

    const flowNodes: TreeFlowNode[] = tree.nodes.map((task) => {
      const position = graph.node(String(task.id));
      return {
        id: String(task.id),
        type: "task",
        position: {
          x: position.x - NODE_WIDTH / 2,
          y: position.y - NODE_HEIGHT / 2,
        },
        data: { task, onSelect: onSelectNode },
        draggable: false,
        selectable: false,
      };
    });

    const flowEdges: Edge[] = tree.edges
      .filter((edge) => edge.state !== "hidden")
      .map((edge) => ({
        id: String(edge.id),
        source: String(edge.from_node),
        target: String(edge.to_node),
        type: "smoothstep",
        animated: edge.state === "dotted",
        markerEnd: { type: MarkerType.ArrowClosed, color: edge.state === "solid" ? "#3d231e" : "#c28b00" },
        style: {
          stroke: edge.state === "solid" ? "#3d231e" : "#c28b00",
          strokeWidth: edge.state === "solid" ? 2.5 : 2,
          strokeDasharray: edge.state === "dotted" ? "6 7" : undefined,
        },
      }));

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
      <ReactFlow
        fitView
        fitViewOptions={{ padding: 0.18, minZoom: 0.25, maxZoom: 1 }}
        minZoom={0.15}
        nodes={nodes}
        nodeTypes={nodeTypes}
        edges={edges}
        nodesConnectable={false}
        nodesDraggable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#dfd5cf" gap={24} size={1} />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          maskColor="rgba(247, 245, 242, 0.75)"
          nodeColor={(node) => {
            const task = (node.data as TreeNodeData).task;
            if (task.status === "done") return "#3d231e";
            if (task.status === "in_progress") return "#b9e5ec";
            if (task.status === "ready") return "#ffd33d";
            return "#d9d4d0";
          }}
          position="bottom-right"
          zoomable
          pannable
        />
      </ReactFlow>
    </div>
  );
}
