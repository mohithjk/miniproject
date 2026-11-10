import React, { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { InteractiveTree } from "./components/InteractiveTree";
import { NodeInspector } from "./components/NodeInspector";
import { TechnicalSpecsTable } from "./components/TechnicalSpecsTable";
import { ShareViewDemo } from "./components/ShareViewDemo";
import { Footer } from "./components/Footer";
import {
  confirmNodeCompletion,
  getNodeDetail,
  getProjectTree,
  MOCK_NODE_DETAILS,
} from "./api";
import { NodeDetailResponse, TreeResponse } from "./types";

export const App: React.FC = () => {
  const [tree, setTree] = useState<TreeResponse | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(103);
  const [nodeDetail, setNodeDetail] = useState<NodeDetailResponse | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    // Initial fetch of project tree
    getProjectTree(1).then((data) => {
      setTree(data);
    });
  }, []);

  useEffect(() => {
    if (selectedNodeId) {
      getNodeDetail(selectedNodeId).then((detail) => {
        setNodeDetail(detail);
      });
    }
  }, [selectedNodeId]);

  const handleSelectNode = (nodeId: number) => {
    setSelectedNodeId(nodeId);
  };

  const handleConfirmNode = async (nodeId: number) => {
    setIsConfirming(true);
    try {
      await confirmNodeCompletion(nodeId);

      // Optimistically advance node state in UI
      setTree((prev) => {
        if (!prev) return prev;
        const updatedNodes = prev.nodes.map((n) =>
          n.id === nodeId ? { ...n, status: "done" as const } : n
        );

        // Check downstream children (e.g., n4 unlocks if all parents are done)
        const n4 = updatedNodes.find((n) => n.key === "n4");
        if (n4 && (nodeId === 102 || nodeId === 103)) {
          const n2Done = updatedNodes.find((n) => n.key === "n2")?.status === "done";
          const n3Done = updatedNodes.find((n) => n.key === "n3")?.status === "done";
          if (n2Done && n3Done) {
            n4.status = "ready";
          }
        }

        const doneCount = updatedNodes.filter((n) => n.status === "done").length;
        const total = updatedNodes.length;

        const updatedEdges = prev.edges.map((e) => {
          if (e.from_node === nodeId) {
            return { ...e, state: "solid" as const };
          }
          return e;
        });

        return {
          ...prev,
          nodes: updatedNodes,
          edges: updatedEdges,
          progress: {
            done: doneCount,
            total,
            percentage: (doneCount / total) * 100,
          },
          lastEventId: prev.last_event_id + 1,
        };
      });

      // Update detail object
      if (nodeDetail && nodeDetail.node.id === nodeId) {
        setNodeDetail({
          ...nodeDetail,
          status: "done",
          node: { ...nodeDetail.node, status: "done" },
        });
      }
    } finally {
      setIsConfirming(false);
    }
  };

  const handleSimulatePush = () => {
    setIsSimulating(true);
    setTimeout(() => {
      // Simulate incoming matched commit for Node 103
      if (MOCK_NODE_DETAILS[103]) {
        MOCK_NODE_DETAILS[103].commits.push({
          commit_id: Date.now(),
          sha: Math.random().toString(16).slice(2, 9),
          message: "feat(frontend): connect live WebSocket tree refresh [n3]",
          author_login: "sarah-fe",
          confidence: 0.95,
          method: "explicit_tag",
        });
      }

      if (selectedNodeId === 103) {
        getNodeDetail(103).then((d) => setNodeDetail(d));
      }
      setIsSimulating(false);
    }, 800);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FBFBF9] text-[#0E1013]">
      <Header />

      <main className="flex-1">
        <Hero
          onSimulatePush={handleSimulatePush}
          isSimulating={isSimulating}
        />

        {/* Core Interactive Section: Split View of DAG and Inspector */}
        <section className="py-14 px-6 border-b border-[#E5E2DC]">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Graph view (7 cols) */}
            <div className="lg:col-span-7">
              {tree && (
                <InteractiveTree
                  nodes={tree.nodes}
                  edges={tree.edges}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={handleSelectNode}
                  progress={tree.progress}
                  lastEventId={tree.last_event_id}
                />
              )}
            </div>

            {/* Inspector view (5 cols) */}
            <div className="lg:col-span-5 sticky top-24">
              <NodeInspector
                detail={nodeDetail}
                onConfirmNode={handleConfirmNode}
                isConfirming={isConfirming}
              />
            </div>
          </div>
        </section>

        {/* Technical Architecture Table */}
        <TechnicalSpecsTable />

        {/* Share View Security Verification */}
        <ShareViewDemo />
      </main>

      <Footer />
    </div>
  );
};
