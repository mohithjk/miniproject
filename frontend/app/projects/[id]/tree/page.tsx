"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Clock3, GitBranch, GitCommitHorizontal, RefreshCw, UsersRound, X } from "lucide-react";
import { Brand } from "@/components/Brand";
import { NotificationBell } from "@/components/NotificationBell";
import { ShareControls } from "@/components/ShareControls";
import { TreeCanvas } from "@/components/TreeCanvas";
import { ApiError, api } from "@/lib/api";
import { clearSession, getSessionUser } from "@/lib/session";
import type { NodeDetail, Project, ProjectTree, TreeNode, User } from "@/lib/types";

function formatConfidence(confidence: number) {
  return `${Math.round(confidence * 100)}%`;
}

export default function ProjectTreePage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [tree, setTree] = useState<ProjectTree | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const polling = useRef(false);
  const selectedNodeId = useRef<number | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const detailPanel = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);

  const handleAuthError = useCallback((requestError: unknown) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      clearSession();
      router.replace("/login");
      return true;
    }
    return false;
  }, [router]);

  const loadNodeDetail = useCallback(async (nodeId: number) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const nodeDetail = await api.getNodeDetail(nodeId);
      setDetail(nodeDetail);
    } catch (requestError: unknown) {
      if (!handleAuthError(requestError)) {
        setPollError(requestError instanceof Error ? requestError.message : "Could not load this work item.");
      }
    } finally {
      setDetailLoading(false);
    }
  }, [handleAuthError]);

  const closeDetails = useCallback(() => {
    selectedNodeId.current = null;
    setSelectedNode(null);
    setDetail(null);
  }, []);

  const refreshTree = useCallback(async (includeDetail = false) => {
    if (polling.current) return;
    polling.current = true;
    try {
      const nextTree = await api.getProjectTree(projectId);
      setTree(nextTree);
      setPollError("");
      if (includeDetail && selectedNodeId.current !== null) {
        const nextDetail = await api.getNodeDetail(selectedNodeId.current);
        setDetail(nextDetail);
      }
    } catch (requestError: unknown) {
      if (!handleAuthError(requestError)) {
        setPollError(requestError instanceof Error ? requestError.message : "Could not refresh the project tree.");
      }
    } finally {
      polling.current = false;
    }
  }, [handleAuthError, projectId]);

  useEffect(() => {
    const sessionUser = getSessionUser();
    if (!sessionUser) {
      router.replace("/login");
      return;
    }
    if (!Number.isInteger(projectId) || projectId < 1) {
      setError("That project link is not valid.");
      setLoading(false);
      return;
    }
    setUser(sessionUser);
  }, [projectId, router]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    Promise.all([api.getProject(projectId), api.getProjectTree(projectId)])
      .then(([projectDetails, projectTree]) => {
        if (!active) return;
        setProject(projectDetails);
        setTree(projectTree);
        setError("");
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (!handleAuthError(requestError)) {
          setError(requestError instanceof Error ? requestError.message : "Could not load this project's tree.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const interval = window.setInterval(() => {
      void refreshTree(true);
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [handleAuthError, projectId, refreshTree, user]);

  useEffect(() => {
    if (!selectedNode) return;
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
      if (focusable.length === 0) return;
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
  }, [selectedNode, closeDetails]);

  const selectNode = useCallback((node: TreeNode) => {
    if (document.activeElement instanceof HTMLElement) {
      returnFocus.current = document.activeElement;
    }
    selectedNodeId.current = node.id;
    setSelectedNode(node);
    void loadNodeDetail(node.id);
  }, [loadNodeDetail]);

  async function confirmCompletion() {
    if (!detail) return;
    setConfirming(true);
    setPollError("");
    try {
      await api.confirmNode(detail.node.id);
      await refreshTree(true);
    } catch (requestError: unknown) {
      if (!handleAuthError(requestError)) {
        setPollError(requestError instanceof Error ? requestError.message : "Could not confirm this work item.");
      }
    } finally {
      setConfirming(false);
    }
  }

  const canConfirm = Boolean(
    detail
    && project
    && user
    && (project.owner_id === user.id || detail.node.owner_id === user.id)
    && (detail.status === "ready" || detail.status === "in_progress"),
  );
  const aiDecision = detail?.latest_ai_decision;
  const aiNeedsConfirmation = aiDecision?.verdict === "done" && aiDecision.confidence < 0.8;

  return (
    <main className="tree-page">
      <header className="dashboard-header">
        <Brand />
        <nav aria-label="Project navigation" className="tree-nav">
          <Link className="back-link" href="/dashboard"><ArrowLeft aria-hidden="true" size={16} /> Projects</Link>
          <Link aria-label="Project plan" className="back-link" href={`/projects/${projectId}/plan`}>
            <GitBranch aria-hidden="true" className="mobile-nav-icon" size={16} /><span>Plan</span>
          </Link>
          <Link aria-label="Project team" className="back-link" href={`/projects/${projectId}/members`}>
            <UsersRound aria-hidden="true" className="mobile-nav-icon" size={16} /><span>Team</span>
          </Link>
          <ShareControls projectId={projectId} />
          <NotificationBell />
        </nav>
      </header>

      <section className="tree-content">
        {loading ? (
          <div aria-live="polite" className="tree-loading">
            <span className="spinner reading-spinner" />
            <p>Growing your project tree...</p>
          </div>
        ) : error ? (
          <div className="tree-load-error" role="alert">
            <h1>We couldn&apos;t load this project.</h1>
            <p>{error}</p>
            <Link className="primary-button" href="/dashboard">Back to dashboard</Link>
          </div>
        ) : tree && project ? (
          <>
            <div className="tree-heading">
              <div>
                <p className="eyebrow">{project.repo_owner}/{project.repo_name}</p>
                <h1>Watch your canopy grow.</h1>
                <p>Each branch is a piece of work. Finish a step and the next teammate can begin.</p>
              </div>
              <button
                aria-label="Refresh project tree"
                className="refresh-button"
                onClick={() => void refreshTree(true)}
                title="Refresh now"
                type="button"
              >
                <RefreshCw aria-hidden="true" size={16} /> <span>Refresh</span>
              </button>
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

            <div className="tree-workspace">
              <div className="tree-legend" aria-label="Node status legend">
                <span><i className="legend-dot legend-locked" /> Locked</span>
                <span><i className="legend-dot legend-ready" /> Ready</span>
                <span><i className="legend-dot legend-progress" /> In progress</span>
                <span><i className="legend-dot legend-done" /> Done</span>
              </div>
              {pollError && <p className="tree-poll-error" role="status">{pollError}</p>}
              <TreeCanvas onSelectNode={selectNode} tree={tree} />
              <div className="edge-legend"><span className="edge-sample edge-sample-dotted" /> Open next step <span className="edge-sample edge-sample-solid" /> Completed dependency</div>
            </div>

            {selectedNode && (
              <>
                <button aria-label="Close work item details" className="detail-backdrop" onClick={closeDetails} type="button" />
                <aside
                  aria-label="Work item details"
                  aria-modal="true"
                  className="node-detail-panel"
                  ref={detailPanel}
                  role="dialog"
                >
                  <div className="detail-header">
                    <div>
                      <p className="eyebrow">{detail?.node.key ?? selectedNode.key} · {detail?.role ?? selectedNode.role.replace("_", " / ")}</p>
                      <h2>{detail?.title ?? selectedNode.title}</h2>
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

                  {detailLoading ? (
                    <div aria-live="polite" className="detail-loading"><span className="spinner reading-spinner" /> Loading work item...</div>
                  ) : detail ? (
                    <div className="detail-body">
                      <span className={`detail-status detail-status-${detail.status}`}>{detail.status.replace("_", " ")}</span>
                      <section>
                        <h3>Description</h3>
                        <p>{detail.node.description || "No description provided."}</p>
                      </section>
                      <section>
                        <h3>Done criteria</h3>
                        <p>{detail.done_criteria || "No done criteria provided."}</p>
                      </section>
                      <section>
                        <h3>Owner</h3>
                        <p>{detail.owner?.username ?? "Unassigned"}</p>
                      </section>
                      <section>
                        <h3>Commits ({detail.commits.length})</h3>
                        {detail.commits.length ? (
                          <ul className="commit-list">
                            {detail.commits.map((commit) => (
                              <li key={commit.commit_id}>
                                <GitCommitHorizontal aria-hidden="true" size={15} />
                                <div>
                                  <p>{commit.message || "Commit"}</p>
                                  <span>{commit.author_login ?? "Unknown author"} · {commit.sha.slice(0, 7)} · {commit.method} ({formatConfidence(commit.confidence)})</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : <p>No matched commits yet.</p>}
                      </section>
                      <section>
                        <h3>AI assessment</h3>
                        {aiDecision ? (
                          <div className={`ai-decision${aiNeedsConfirmation ? " ai-decision-prompt" : ""}`}>
                            <strong>
                              {aiNeedsConfirmation
                                ? `AI thinks this is done (${formatConfidence(aiDecision.confidence)}). Confirm?`
                                : `${aiDecision.verdict.replace("_", " ")} · ${formatConfidence(aiDecision.confidence)}`}
                            </strong>
                            <p>{aiDecision.reason || "No explanation provided."}</p>
                          </div>
                        ) : <p>The AI hasn&apos;t made a completion assessment yet.</p>}
                      </section>
                      {canConfirm && (
                        <button className="primary-button confirm-button" disabled={confirming} onClick={confirmCompletion} type="button">
                          <Check aria-hidden="true" size={17} />
                          {confirming ? "Confirming..." : "Confirm completion"}
                        </button>
                      )}
                      {!canConfirm && aiNeedsConfirmation && (
                        <p className="confirm-owner-note">Only this work item&apos;s owner or the project owner can confirm completion.</p>
                      )}
                    </div>
                  ) : (
                    <p className="error-message" role="alert">{pollError || "Could not load work item details."}</p>
                  )}
                </aside>
              </>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}
