"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Clock3, Eye, GitBranch, X } from "lucide-react";
import { Brand } from "@/components/Brand";
import { TreeCanvas } from "@/components/TreeCanvas";
import { ApiError, api } from "@/lib/api";
import type { ProjectTree, TreeNode } from "@/lib/types";

export default function SharedTreePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [projectName, setProjectName] = useState("");
  const [tree, setTree] = useState<ProjectTree | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const polling = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const detailPanel = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);

  const closeDetails = useCallback(() => setSelectedNode(null), []);
  const selectedNodeId = selectedNode?.id;

  const loadTree = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const response = await api.getViewerTree(token);
      const done = response.nodes.filter((node) => node.status === "done").length;
      const total = response.nodes.length;
      setProjectName(`${response.project.repo_owner}/${response.project.repo_name}`);
      setTree({
        project_id: response.project.id,
        nodes: response.nodes,
        edges: response.edges,
        progress: {
          done,
          total,
          percentage: total ? Math.round((done / total) * 1000) / 10 : 0,
        },
        last_event_id: 0,
      });
      setSelectedNode((current) => current
        ? response.nodes.find((node) => node.id === current.id) ?? null
        : null);
      setError("");
      setErrorStatus(null);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this shared project tree.");
      setErrorStatus(loadError instanceof ApiError ? loadError.status : null);
    } finally {
      setLoading(false);
      polling.current = false;
    }
  }, [token]);

  useEffect(() => {
    void loadTree();
    const interval = window.setInterval(() => void loadTree(), 5000);
    return () => window.clearInterval(interval);
  }, [loadTree]);

  useEffect(() => {
    if (selectedNodeId === undefined) return;
    closeButton.current?.focus();

    function keepFocusInside(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDetails();
        return;
      }

      if (event.key !== "Tab" || !detailPanel.current) return;
      const focusable = detailPanel.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", keepFocusInside);
    return () => {
      document.removeEventListener("keydown", keepFocusInside);
      returnFocus.current?.focus();
      returnFocus.current = null;
    };
  }, [selectedNodeId, closeDetails]);

  const selectNode = useCallback((node: TreeNode) => {
    if (document.activeElement instanceof HTMLElement) {
      returnFocus.current = document.activeElement;
    }
    setSelectedNode(node);
  }, []);

  return (
    <main className="tree-page viewer-page">
      <header className="dashboard-header">
        <Brand />
        <span className="viewer-mode"><Eye aria-hidden="true" size={15} /> Read-only viewer</span>
      </header>

      <section className="tree-content">
        {loading ? (
          <div aria-live="polite" className="tree-loading">
            <span className="spinner reading-spinner" />
            <p>Loading shared project tree...</p>
          </div>
        ) : error && !tree ? (
          <div className="tree-load-error" role="alert">
            <span className="viewer-error-icon"><GitBranch aria-hidden="true" size={24} /></span>
            <h1>
              {errorStatus === 404
                ? "This viewer link isn't available."
                : errorStatus === 429
                  ? "The viewer is busy right now."
                  : "We couldn't load this project tree."}
            </h1>
            <p>
              {errorStatus === 404
                ? "The link may be invalid or its owner may have revoked it."
                : "Please check your connection or try again later. This page will retry automatically."}
            </p>
          </div>
        ) : tree ? (
          <>
            <div className="tree-heading">
              <div>
                <p className="eyebrow">{projectName}</p>
                <h1>Project progress, in view.</h1>
                <p>This is a read-only view of the team&apos;s growing work tree.</p>
              </div>
              <span className="viewer-mode viewer-heading-mode"><Eye aria-hidden="true" size={15} /> Read-only</span>
            </div>

            <div className="tree-progress-card">
              <div className="tree-progress-copy">
                <span className="tree-progress-number">{tree.progress.percentage}%</span>
                <span><strong>{tree.progress.done} of {tree.progress.total}</strong> work items complete</span>
              </div>
              <div aria-label={`${tree.progress.percentage}% complete`} className="progress-track" role="progressbar" aria-valuenow={tree.progress.percentage} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${Math.min(100, Math.max(0, tree.progress.percentage))}%` }} />
              </div>
              <span className="polling-label"><Clock3 aria-hidden="true" size={13} /> Live updates every 5 seconds</span>
            </div>

            <div className="tree-workspace viewer-workspace">
              <TreeCanvas onSelectNode={selectNode} pollError={error} tree={tree} />
            </div>

            {selectedNode && (
              <>
                <button aria-label="Close work item details" className="detail-backdrop" onClick={closeDetails} type="button" />
                <aside
                  aria-label="Read-only work item details"
                  aria-modal="true"
                  className="node-detail-panel"
                  ref={detailPanel}
                  role="dialog"
                >
                  <div className="detail-header">
                    <div>
                      <p className="eyebrow">{selectedNode.key} · {selectedNode.role.replace("_", " / ")}</p>
                      <h2>{selectedNode.title}</h2>
                    </div>
                    <button
                      aria-label="Close details"
                      className="icon-button"
                      onClick={closeDetails}
                      ref={closeButton}
                      type="button"
                    >
                      <X aria-hidden="true" size={19} />
                    </button>
                  </div>
                  <div className="detail-body">
                    <span className={`detail-status detail-status-${selectedNode.status}`}>{selectedNode.status.replace("_", " ")}</span>
                    <section>
                      <h3>Description</h3>
                      <p>{selectedNode.description || "No description provided."}</p>
                    </section>
                    <section>
                      <h3>Done criteria</h3>
                      <p>{selectedNode.done_criteria || "No done criteria provided."}</p>
                    </section>
                    <section>
                      <h3>Assignment</h3>
                      <p>{selectedNode.owner_id ? "Assigned to a project member." : "Not assigned."}</p>
                    </section>
                    <p className="viewer-limit-note"><Check aria-hidden="true" size={15} /> Read-only: commit details and AI assessments are visible to signed-in project members only.</p>
                  </div>
                </aside>
              </>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}
