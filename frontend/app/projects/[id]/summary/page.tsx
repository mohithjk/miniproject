"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Edit2,
  Eye,
  FileText,
  History,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { ConnectStepper } from "@/components/ConnectStepper";
import { api } from "@/lib/api";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { maskSecrets, sanitizePlainText } from "@/lib/safety";
import type {
  Project,
  ReadmeSummary,
  Role,
  SummaryVersion,
  UncertainItem,
} from "@/lib/types";

function formatDate(isoString?: string | null): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export default function SummaryConfirmationPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [summary, setSummary] = useState<ReadmeSummary | null>(null);
  const [versions, setVersions] = useState<SummaryVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number>(1);

  const [loading, setLoading] = useState(true);
  const [reReading, setReReading] = useState(false);
  const [buildingPlan, setBuildingPlan] = useState(false);
  const [error, setError] = useState("");
  const [showReOpenWarning, setShowReOpenWarning] = useState(false);

  // Notes box state
  const [userNotes, setUserNotes] = useState("");
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  // Bottom scroll and confirmation state
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [isConfirmedCheckbox, setIsConfirmedCheckbox] = useState(false);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);

  // README side drawer state
  const [showReadmeDrawer, setShowReadmeDrawer] = useState(false);
  const [activeHighlightSection, setActiveHighlightSection] = useState<string | null>(null);

  // In-place editing states
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    purpose?: string;
    problem_solved?: string;
    featuresText?: string;
    frameworksText?: string;
    languagesText?: string;
    toolsText?: string;
    frontendRoleText?: string;
    backendRoleText?: string;
    aiRoleText?: string;
    securityRoleText?: string;
    devopsRoleText?: string;
  }>({});

  // Uncertain items user corrections
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Fallback empty README input
  const [pastedReadme, setPastedReadme] = useState("");

  const isMentor = user?.role === "mentor";

  // Load summary and project details
  const loadData = useCallback(async () => {
    if (!Number.isInteger(projectId) || projectId < 1) {
      setError("Invalid project ID.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const [proj, sum, vers] = await Promise.all([
        api.getProject(projectId),
        api.getReadmeSummary(projectId),
        api.getSummaryVersions(projectId).catch(() => []),
      ]);

      setProject(proj);
      setSummary(sum);
      setVersions(vers);
      setSelectedVersion(sum.version);

      // Pre-fill existing user answers
      const ansMap: Record<string, string> = {};
      sum.uncertain_items?.forEach((item) => {
        if (item.user_answer) ansMap[item.id] = item.user_answer;
      });
      setAnswers(ansMap);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "We couldn't read your README right now.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const sessionUser = getCurrentUser();
    if (!sessionUser) {
      router.replace("/login");
      return;
    }
    setUser(sessionUser);
    void loadData();
  }, [loadData, router]);

  // Observer for scrolling to the bottom
  useEffect(() => {
    if (!bottomSentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setHasScrolledToBottom(true);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(bottomSentinelRef.current);
    return () => observer.disconnect();
  }, [loading, summary]);

  // Handle version switch
  function handleVersionChange(versionNum: number) {
    setSelectedVersion(versionNum);
    const target = versions.find((v) => v.version === versionNum);
    if (target) {
      setSummary(target.summary);
      const ansMap: Record<string, string> = {};
      target.summary.uncertain_items?.forEach((item) => {
        if (item.user_answer) ansMap[item.id] = item.user_answer;
      });
      setAnswers(ansMap);
    }
  }

  // Handle Section Edit Start
  function startEditing(section: string) {
    if (!summary || isMentor) return;
    setEditingSection(section);

    if (section === "purpose") {
      setEditValues({ purpose: summary.purpose });
    } else if (section === "problem") {
      setEditValues({ problem_solved: summary.problem_solved });
    } else if (section === "features") {
      setEditValues({ featuresText: summary.features.join("\n") });
    } else if (section === "tech_stack") {
      setEditValues({
        frameworksText: summary.tech_stack.frameworks.join(", "),
        languagesText: summary.tech_stack.languages.join(", "),
        toolsText: summary.tech_stack.tools.join(", "),
      });
    } else if (section === "roles") {
      setEditValues({
        frontendRoleText: summary.work_by_role.frontend.join("\n"),
        backendRoleText: summary.work_by_role.backend.join("\n"),
        aiRoleText: summary.work_by_role.ai_ml.join("\n"),
        securityRoleText: summary.work_by_role.security.join("\n"),
        devopsRoleText: summary.work_by_role.devops.join("\n"),
      });
    }
  }

  // Handle Section Edit Cancel
  function cancelEditing() {
    setEditingSection(null);
    setEditValues({});
  }

  // Handle Section Edit Save
  async function saveSection(section: string) {
    if (!summary) return;
    const edits: Partial<ReadmeSummary> = {
      edited_sections: { ...(summary.edited_sections || {}), [section]: true },
    };

    if (section === "purpose" && editValues.purpose !== undefined) {
      edits.purpose = sanitizePlainText(editValues.purpose);
    } else if (section === "problem" && editValues.problem_solved !== undefined) {
      edits.problem_solved = sanitizePlainText(editValues.problem_solved);
    } else if (section === "features" && editValues.featuresText !== undefined) {
      edits.features = editValues.featuresText
        .split("\n")
        .map((s) => sanitizePlainText(s))
        .filter(Boolean)
        .slice(0, 8);
    } else if (section === "tech_stack") {
      edits.tech_stack = {
        frameworks: (editValues.frameworksText || "").split(",").map((s) => s.trim()).filter(Boolean),
        languages: (editValues.languagesText || "").split(",").map((s) => s.trim()).filter(Boolean),
        tools: (editValues.toolsText || "").split(",").map((s) => s.trim()).filter(Boolean),
      };
    } else if (section === "roles") {
      edits.work_by_role = {
        frontend: (editValues.frontendRoleText || "").split("\n").map((s) => s.trim()).filter(Boolean),
        backend: (editValues.backendRoleText || "").split("\n").map((s) => s.trim()).filter(Boolean),
        ai_ml: (editValues.aiRoleText || "").split("\n").map((s) => s.trim()).filter(Boolean),
        security: (editValues.securityRoleText || "").split("\n").map((s) => s.trim()).filter(Boolean),
        devops: (editValues.devopsRoleText || "").split("\n").map((s) => s.trim()).filter(Boolean),
      };
    }

    try {
      const updated = await api.updateSummary(projectId, edits);
      setSummary(updated);
      setEditingSection(null);
      setEditValues({});
    } catch (saveErr: unknown) {
      setError(saveErr instanceof Error ? saveErr.message : "Could not save edits.");
    }
  }

  // Handle Uncertain Question Answer Change
  async function handleAnswerChange(itemId: string, val: string) {
    setAnswers((prev) => ({ ...prev, [itemId]: val }));
    if (!summary) return;
    const updatedItems = summary.uncertain_items.map((item) =>
      item.id === itemId ? { ...item, user_answer: sanitizePlainText(val) } : item
    );
    try {
      await api.updateSummary(projectId, { uncertain_items: updatedItems });
    } catch {
      // silent background save
    }
  }

  // Re-read with user notes
  async function handleRereadWithNotes() {
    if (!userNotes.trim()) {
      notesRef.current?.focus();
      return;
    }
    setReReading(true);
    setError("");
    try {
      const newSummary = await api.regenerateSummary(projectId, sanitizePlainText(userNotes));
      setSummary(newSummary);
      setSelectedVersion(newSummary.version);
      const vers = await api.getSummaryVersions(projectId);
      setVersions(vers);
      setUserNotes("");
    } catch (rereadErr: unknown) {
      setError(rereadErr instanceof Error ? rereadErr.message : "We couldn't re-read with your notes right now.");
    } finally {
      setReReading(false);
    }
  }

  // Handle Confirmation
  async function handleConfirmSummary() {
    if (isMentor || !isConfirmedCheckbox || !hasScrolledToBottom) return;
    setBuildingPlan(true);
    setError("");
    try {
      await api.confirmSummary(projectId);
      router.push(`/projects/${projectId}/plan`);
    } catch (confirmErr: unknown) {
      setError(confirmErr instanceof Error ? confirmErr.message : "Failed to confirm summary and build plan.");
      setBuildingPlan(false);
    }
  }

  // Re-open summary when already confirmed
  async function handleReOpenSummary() {
    setShowReOpenWarning(true);
  }

  function proceedReOpen() {
    setShowReOpenWarning(false);
    if (project) {
      setProject({
        ...project,
        summary_confirmed: false,
        summary_status: "out_of_date",
      });
    }
  }

  return (
    <main className="summary-page">
      {/* Top Header */}
      <header className="dashboard-header">
        <Brand />
        <Link className="back-link" href="/dashboard">
          <ArrowLeft aria-hidden="true" size={16} /> Dashboard
        </Link>
      </header>

      {/* Progress Stepper */}
      <div className="stepper-wrapper">
        <ConnectStepper currentStep="summary" />
      </div>

      <div className="summary-container">
        {/* Loading Skeleton */}
        {loading && (
          <div aria-busy="true" aria-live="polite" className="summary-skeleton-container">
            <div className="skeleton-title" />
            <div className="skeleton-sub" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        )}

        {/* AI Re-reading State */}
        {reReading && (
          <div aria-live="polite" className="reading-overlay">
            <div className="reading-state">
              <span className="reading-icon">
                <Sparkles aria-hidden="true" size={26} />
              </span>
              <span className="spinner reading-spinner" />
              <h2>AI is re-reading your README with your notes...</h2>
              <p>Refining project scope, role breakdown, and technical assumptions.</p>
            </div>
          </div>
        )}

        {/* Building Plan Loading State */}
        {buildingPlan && (
          <div aria-live="polite" className="reading-overlay">
            <div className="reading-state">
              <span className="reading-icon">
                <CheckCircle2 aria-hidden="true" size={26} />
              </span>
              <span className="spinner reading-spinner" />
              <h2>Building your plan...</h2>
              <p>Mapping out the DAG work nodes and dependencies for your team.</p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && !loading && (
          <div aria-live="assertive" className="summary-alert error-alert">
            <AlertCircle aria-hidden="true" size={20} />
            <div>
              <h3>We encountered an issue</h3>
              <p>{error}</p>
              <button className="secondary-button compact-btn" onClick={loadData} type="button">
                <RefreshCw aria-hidden="true" size={14} /> Try again
              </button>
            </div>
          </div>
        )}

        {/* Re-Open Warning Modal */}
        {showReOpenWarning && (
          <div className="summary-modal-backdrop" role="dialog">
            <div className="summary-modal-card">
              <div className="modal-icon-warning">
                <ShieldAlert aria-hidden="true" size={28} />
              </div>
              <h2>Edit confirmed summary?</h2>
              <p>
                The project plan was already generated. Editing this summary will mark the plan as{" "}
                <strong>Out of date</strong> and your team will need to regenerate and re-approve the plan.
              </p>
              <div className="modal-actions">
                <button
                  className="secondary-button"
                  onClick={() => setShowReOpenWarning(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button className="primary-button" onClick={proceedReOpen} type="button">
                  Edit summary anyway
                </button>
              </div>
            </div>
          </div>
        )}

        {!loading && summary && (
          <>
            {/* Top Page Heading & Status */}
            <div className="summary-header-block">
              <div className="summary-repo-pill">
                <span>
                  {project?.repo_owner} / {project?.repo_name}
                </span>
                {summary.readme_last_updated && (
                  <span className="summary-date-tag">
                    <Clock aria-hidden="true" size={12} /> README updated {summary.readme_last_updated}
                  </span>
                )}
              </div>

              <h1>Here&apos;s what we understood</h1>
              <p className="summary-subtext">
                Our AI read your README. Please check that this matches your project before we build the plan.
              </p>

              {/* Confirmation status banner */}
              {project?.summary_confirmed ? (
                <div className="confirmed-status-banner">
                  <div className="banner-left">
                    <CheckCircle2 aria-hidden="true" className="banner-icon-check" size={20} />
                    <div>
                      <strong>Summary confirmed</strong>
                      <p>
                        Confirmed by {project.confirmed_by || "team member"} on {formatDate(project.confirmed_at)}
                      </p>
                    </div>
                  </div>
                  <div className="banner-right">
                    <Link className="primary-button compact-btn" href={`/projects/${projectId}/plan`}>
                      Go to plan <ArrowRight aria-hidden="true" size={15} />
                    </Link>
                    {!isMentor && (
                      <button
                        className="ghost-button compact-btn"
                        onClick={handleReOpenSummary}
                        type="button"
                      >
                        <Edit2 aria-hidden="true" size={14} /> Edit summary
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                isMentor && (
                  <div className="mentor-status-banner">
                    <Eye aria-hidden="true" size={18} />
                    <span>View only mode: Waiting for the student team to review and confirm the summary.</span>
                  </div>
                )
              )}

              {/* Edge Case Banners */}
              {summary.is_truncated && (
                <div className="summary-alert info-alert">
                  <FileText aria-hidden="true" size={18} />
                  <span>We read the first part of your README because it was quite large.</span>
                </div>
              )}
              {summary.detected_language && summary.detected_language !== "English" && (
                <div className="summary-alert info-alert">
                  <span>Original README was in {summary.detected_language}, summarized here in English.</span>
                </div>
              )}
              {summary.confidence === "low" && (
                <div className="summary-alert warning-alert">
                  <AlertCircle aria-hidden="true" size={18} />
                  <span>
                    Your README is quite short. The plan may be less accurate. You can add details in the notes box below.
                  </span>
                </div>
              )}

              {/* Version and Confidence Header Bar */}
              <div className="summary-meta-bar">
                {/* Confidence indicator */}
                <div className={`confidence-pill confidence-${summary.confidence}`}>
                  <span className="confidence-dot" />
                  <span className="confidence-label">
                    {summary.confidence.toUpperCase()} CONFIDENCE
                  </span>
                  <span className="confidence-sep">•</span>
                  <span className="confidence-reason">{summary.confidence_reason}</span>
                </div>

                <div className="meta-actions">
                  {/* Previous versions selector */}
                  {versions.length > 1 && (
                    <div className="version-selector-group">
                      <History aria-hidden="true" size={14} />
                      <label className="sr-only" htmlFor="version-select">
                        Previous versions
                      </label>
                      <select
                        className="version-dropdown"
                        id="version-select"
                        onChange={(e) => handleVersionChange(Number(e.target.value))}
                        value={selectedVersion}
                      >
                        {versions.map((v) => (
                          <option key={v.version} value={v.version}>
                            Version {v.version} {v.version === versions[0].version ? "(Latest)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* See what the AI read */}
                  <button
                    aria-label="See what the AI read"
                    className="see-readme-button"
                    onClick={() => {
                      setShowReadmeDrawer(true);
                      setActiveHighlightSection(null);
                    }}
                    type="button"
                  >
                    <FileText aria-hidden="true" size={15} />
                    See what the AI read
                  </button>
                </div>
              </div>
            </div>

            {/* Empty README handler */}
            {summary.is_empty && (
              <div className="empty-readme-card">
                <h3>We couldn&apos;t find a README</h3>
                <p>Add a short description of your project to your README or paste one here to generate a plan:</p>
                <textarea
                  className="form-control"
                  onChange={(e) => setPastedReadme(e.target.value)}
                  placeholder="Paste your project overview, features, and stack here..."
                  rows={5}
                  value={pastedReadme}
                />
                <button
                  className="primary-button"
                  disabled={!pastedReadme.trim()}
                  onClick={() => {
                    setUserNotes(pastedReadme);
                    void handleRereadWithNotes();
                  }}
                  type="button"
                >
                  Analyze pasted description
                </button>
              </div>
            )}

            {/* SUMMARY CARDS (PLAIN TEXT ONLY) */}
            <div className="summary-cards-grid">
              {/* Card 1: Project Name & Purpose */}
              <section className="summary-card">
                <div className="card-topline">
                  <div>
                    <span className="card-eyebrow">01 • Project Purpose</span>
                    <h2>{summary.project_name}</h2>
                  </div>
                  {!isMentor && !project?.summary_confirmed && (
                    <div className="card-edit-action">
                      {summary.edited_sections?.purpose && (
                        <span className="edited-badge">Edited by you</span>
                      )}
                      {editingSection === "purpose" ? (
                        <div className="inline-edit-buttons">
                          <button className="btn-cancel" onClick={cancelEditing} type="button">
                            Cancel
                          </button>
                          <button
                            className="btn-save"
                            onClick={() => saveSection("purpose")}
                            type="button"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn-edit"
                          onClick={() => startEditing("purpose")}
                          type="button"
                        >
                          <Edit2 aria-hidden="true" size={14} /> Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {editingSection === "purpose" ? (
                  <textarea
                    className="edit-textarea"
                    onChange={(e) => setEditValues({ ...editValues, purpose: e.target.value })}
                    rows={3}
                    value={editValues.purpose ?? ""}
                  />
                ) : (
                  <p className="card-plain-text purpose-text">{maskSecrets(summary.purpose)}</p>
                )}
              </section>

              {/* Card 2: The Problem It Solves */}
              <section className="summary-card">
                <div className="card-topline">
                  <div>
                    <span className="card-eyebrow">02 • Problem Space</span>
                    <h2>The problem it solves</h2>
                  </div>
                  {!isMentor && !project?.summary_confirmed && (
                    <div className="card-edit-action">
                      {summary.edited_sections?.problem && (
                        <span className="edited-badge">Edited by you</span>
                      )}
                      {editingSection === "problem" ? (
                        <div className="inline-edit-buttons">
                          <button className="btn-cancel" onClick={cancelEditing} type="button">
                            Cancel
                          </button>
                          <button
                            className="btn-save"
                            onClick={() => saveSection("problem")}
                            type="button"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn-edit"
                          onClick={() => startEditing("problem")}
                          type="button"
                        >
                          <Edit2 aria-hidden="true" size={14} /> Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {editingSection === "problem" ? (
                  <textarea
                    className="edit-textarea"
                    onChange={(e) => setEditValues({ ...editValues, problem_solved: e.target.value })}
                    rows={4}
                    value={editValues.problem_solved ?? ""}
                  />
                ) : (
                  <p className="card-plain-text">{maskSecrets(summary.problem_solved)}</p>
                )}
              </section>

              {/* Card 3: Main Features */}
              <section className="summary-card">
                <div className="card-topline">
                  <div>
                    <span className="card-eyebrow">03 • Core Capabilities</span>
                    <h2>Main features</h2>
                  </div>
                  {!isMentor && !project?.summary_confirmed && (
                    <div className="card-edit-action">
                      {summary.edited_sections?.features && (
                        <span className="edited-badge">Edited by you</span>
                      )}
                      {editingSection === "features" ? (
                        <div className="inline-edit-buttons">
                          <button className="btn-cancel" onClick={cancelEditing} type="button">
                            Cancel
                          </button>
                          <button
                            className="btn-save"
                            onClick={() => saveSection("features")}
                            type="button"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn-edit"
                          onClick={() => startEditing("features")}
                          type="button"
                        >
                          <Edit2 aria-hidden="true" size={14} /> Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {editingSection === "features" ? (
                  <div>
                    <p className="field-hint">One feature per line (up to 8 features):</p>
                    <textarea
                      className="edit-textarea"
                      onChange={(e) => setEditValues({ ...editValues, featuresText: e.target.value })}
                      rows={6}
                      value={editValues.featuresText ?? ""}
                    />
                  </div>
                ) : (
                  <ul className="plain-bullet-list">
                    {summary.features.map((feat, idx) => (
                      <li key={idx}>
                        <span className="bullet-dot" />
                        <span>{maskSecrets(feat)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Card 4: Tech Stack Found */}
              <section className="summary-card">
                <div className="card-topline">
                  <div>
                    <span className="card-eyebrow">04 • Technologies</span>
                    <h2>Tech stack found</h2>
                  </div>
                  {!isMentor && !project?.summary_confirmed && (
                    <div className="card-edit-action">
                      {summary.edited_sections?.tech_stack && (
                        <span className="edited-badge">Edited by you</span>
                      )}
                      {editingSection === "tech_stack" ? (
                        <div className="inline-edit-buttons">
                          <button className="btn-cancel" onClick={cancelEditing} type="button">
                            Cancel
                          </button>
                          <button
                            className="btn-save"
                            onClick={() => saveSection("tech_stack")}
                            type="button"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn-edit"
                          onClick={() => startEditing("tech_stack")}
                          type="button"
                        >
                          <Edit2 aria-hidden="true" size={14} /> Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {editingSection === "tech_stack" ? (
                  <div className="edit-form-stack">
                    <label>Frameworks (comma separated):</label>
                    <input
                      className="form-control"
                      onChange={(e) => setEditValues({ ...editValues, frameworksText: e.target.value })}
                      value={editValues.frameworksText ?? ""}
                    />
                    <label>Languages (comma separated):</label>
                    <input
                      className="form-control"
                      onChange={(e) => setEditValues({ ...editValues, languagesText: e.target.value })}
                      value={editValues.languagesText ?? ""}
                    />
                    <label>Tools & Platforms (comma separated):</label>
                    <input
                      className="form-control"
                      onChange={(e) => setEditValues({ ...editValues, toolsText: e.target.value })}
                      value={editValues.toolsText ?? ""}
                    />
                  </div>
                ) : (
                  <div className="tech-chip-groups">
                    {summary.tech_stack.frameworks.length > 0 && (
                      <div className="chip-row">
                        <span className="chip-category">Frameworks</span>
                        <div className="chips-wrap">
                          {summary.tech_stack.frameworks.map((t, idx) => (
                            <span className="tech-chip" key={idx}>
                              {maskSecrets(t)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {summary.tech_stack.languages.length > 0 && (
                      <div className="chip-row">
                        <span className="chip-category">Languages</span>
                        <div className="chips-wrap">
                          {summary.tech_stack.languages.map((t, idx) => (
                            <span className="tech-chip" key={idx}>
                              {maskSecrets(t)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {summary.tech_stack.tools.length > 0 && (
                      <div className="chip-row">
                        <span className="chip-category">Tools & Cloud</span>
                        <div className="chips-wrap">
                          {summary.tech_stack.tools.map((t, idx) => (
                            <span className="tech-chip" key={idx}>
                              {maskSecrets(t)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Card 5: Parts of Work Needed Grouped by Role */}
              <section className="summary-card roles-card">
                <div className="card-topline">
                  <div>
                    <span className="card-eyebrow">05 • Team Architecture</span>
                    <h2>Parts of work needed, grouped by role</h2>
                  </div>
                  {!isMentor && !project?.summary_confirmed && (
                    <div className="card-edit-action">
                      {summary.edited_sections?.roles && (
                        <span className="edited-badge">Edited by you</span>
                      )}
                      {editingSection === "roles" ? (
                        <div className="inline-edit-buttons">
                          <button className="btn-cancel" onClick={cancelEditing} type="button">
                            Cancel
                          </button>
                          <button
                            className="btn-save"
                            onClick={() => saveSection("roles")}
                            type="button"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn-edit"
                          onClick={() => startEditing("roles")}
                          type="button"
                        >
                          <Edit2 aria-hidden="true" size={14} /> Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {editingSection === "roles" ? (
                  <div className="edit-roles-form">
                    <label>Frontend tasks (one per line):</label>
                    <textarea
                      className="edit-textarea"
                      onChange={(e) => setEditValues({ ...editValues, frontendRoleText: e.target.value })}
                      rows={3}
                      value={editValues.frontendRoleText ?? ""}
                    />
                    <label>Backend tasks (one per line):</label>
                    <textarea
                      className="edit-textarea"
                      onChange={(e) => setEditValues({ ...editValues, backendRoleText: e.target.value })}
                      rows={3}
                      value={editValues.backendRoleText ?? ""}
                    />
                    <label>AI/ML tasks (one per line):</label>
                    <textarea
                      className="edit-textarea"
                      onChange={(e) => setEditValues({ ...editValues, aiRoleText: e.target.value })}
                      rows={3}
                      value={editValues.aiRoleText ?? ""}
                    />
                    <label>Security tasks (one per line):</label>
                    <textarea
                      className="edit-textarea"
                      onChange={(e) => setEditValues({ ...editValues, securityRoleText: e.target.value })}
                      rows={3}
                      value={editValues.securityRoleText ?? ""}
                    />
                    <label>DevOps tasks (one per line):</label>
                    <textarea
                      className="edit-textarea"
                      onChange={(e) => setEditValues({ ...editValues, devopsRoleText: e.target.value })}
                      rows={3}
                      value={editValues.devopsRoleText ?? ""}
                    />
                  </div>
                ) : (
                  <div className="role-work-groups">
                    {(
                      [
                        { role: "frontend" as Role, label: "Frontend", items: summary.work_by_role.frontend },
                        { role: "backend" as Role, label: "Backend", items: summary.work_by_role.backend },
                        { role: "ai_ml" as Role, label: "AI / ML", items: summary.work_by_role.ai_ml },
                        { role: "security" as Role, label: "Security", items: summary.work_by_role.security },
                        { role: "devops" as Role, label: "DevOps", items: summary.work_by_role.devops },
                      ] as const
                    ).map((grp) => (
                      <div className="role-work-block" key={grp.role}>
                        <div className="role-work-header">
                          <span className={`role-tag role-tag-${grp.role}`}>{grp.label}</span>
                        </div>
                        <ul className="plain-bullet-list">
                          {grp.items.map((item, idx) => (
                            <li key={idx}>
                              <span className="bullet-dot" />
                              <span>{maskSecrets(item)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Card 6: "Things we weren't sure about" (Yellow-tinted card) */}
              <section className="summary-card uncertain-card">
                <div className="card-topline">
                  <div>
                    <span className="uncertain-pill">Clarification Needed</span>
                    <h2>Things we weren&apos;t sure about</h2>
                  </div>
                </div>

                <p className="uncertain-desc">
                  Our AI identified these assumptions while reading the README. You can clarify or correct them here so your plan reflects reality.
                </p>

                <div className="uncertain-items-list">
                  {summary.uncertain_items.map((item: UncertainItem) => (
                    <div className="uncertain-item-box" key={item.id}>
                      <div className="uncertain-item-q">
                        <strong>Question:</strong> {maskSecrets(item.question)}
                      </div>
                      <div className="uncertain-item-a">
                        <strong>AI Assumption:</strong> {maskSecrets(item.assumption)}
                      </div>
                      <div className="uncertain-item-input-wrap">
                        <label htmlFor={`answer-${item.id}`}>Your answer or correction:</label>
                        <input
                          className="form-control"
                          disabled={isMentor || project?.summary_confirmed}
                          id={`answer-${item.id}`}
                          onChange={(e) => handleAnswerChange(item.id, e.target.value)}
                          placeholder="Type your correction or clarify here..."
                          type="text"
                          value={answers[item.id] ?? ""}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Optional notes box: "Something wrong or missing? Tell the AI" */}
            {!isMentor && !project?.summary_confirmed && (
              <section className="summary-notes-card">
                <div className="notes-header">
                  <MessageSquare aria-hidden="true" size={20} />
                  <div>
                    <h3>Something wrong or missing? Tell the AI</h3>
                    <p>
                      Add specific instructions or context. The AI will re-read your README with your notes and create an updated version.
                    </p>
                  </div>
                </div>
                <textarea
                  className="form-control notes-textarea"
                  onChange={(e) => setUserNotes(e.target.value)}
                  placeholder="Example: We aren't building a mobile app yet, focus only on web. The database will use Supabase PostgreSQL..."
                  ref={notesRef}
                  rows={4}
                  value={userNotes}
                />
                <div className="notes-actions">
                  <button
                    className="secondary-button"
                    disabled={!userNotes.trim() || reReading}
                    onClick={handleRereadWithNotes}
                    type="button"
                  >
                    <Sparkles aria-hidden="true" size={16} />
                    Re-read with my notes
                  </button>
                </div>
              </section>
            )}

            {/* Sentinel for bottom-scroll detection */}
            <div className="bottom-sentinel" ref={bottomSentinelRef} />

            {/* Sticky Bottom Bar */}
            <div className="sticky-bottom-bar">
              <div className="bottom-bar-inner">
                {isMentor ? (
                  <div className="bottom-bar-mentor-msg">
                    <Eye aria-hidden="true" size={18} />
                    <span>Mentors have view-only access. Only student team members can confirm and generate the plan.</span>
                  </div>
                ) : project?.summary_confirmed ? (
                  <div className="bottom-bar-confirmed-msg">
                    <CheckCircle2 aria-hidden="true" size={18} />
                    <span>
                      Summary confirmed by {project.confirmed_by || "team member"}.
                    </span>
                    <Link className="primary-button" href={`/projects/${projectId}/plan`}>
                      Proceed to plan review <ArrowRight aria-hidden="true" size={16} />
                    </Link>
                  </div>
                ) : (
                  <>
                    <label className="confirm-checkbox-label">
                      <input
                        checked={isConfirmedCheckbox}
                        className="confirm-checkbox"
                        disabled={!hasScrolledToBottom}
                        onChange={(e) => setIsConfirmedCheckbox(e.target.checked)}
                        type="checkbox"
                      />
                      <span>I&apos;ve read this summary and it matches my project</span>
                      {!hasScrolledToBottom && (
                        <span className="scroll-hint-pill">(Scroll to bottom to enable)</span>
                      )}
                    </label>

                    <div className="bottom-bar-buttons">
                      <button
                        className="secondary-button"
                        onClick={() => notesRef.current?.focus()}
                        type="button"
                      >
                        Re-read with my notes
                      </button>

                      <button
                        className="primary-button confirm-plan-btn"
                        disabled={!isConfirmedCheckbox || !hasScrolledToBottom || buildingPlan}
                        onClick={handleConfirmSummary}
                        type="button"
                      >
                        <Check aria-hidden="true" size={17} />
                        Confirm and build the plan
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* See what the AI read: Slide-out drawer */}
      {showReadmeDrawer && (
        <aside aria-label="Original README text" className="readme-drawer-overlay">
          <div className="readme-drawer">
            <div className="drawer-header">
              <div className="drawer-title">
                <FileText aria-hidden="true" size={18} />
                <h2>What the AI read</h2>
              </div>
              <button
                aria-label="Close drawer"
                className="icon-button"
                onClick={() => setShowReadmeDrawer(false)}
                type="button"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>

            <p className="drawer-subtitle">
              Raw plain text extracted from {project?.repo_owner}/{project?.repo_name} README.md
            </p>

            <div className="drawer-body">
              {activeHighlightSection && (
                <div className="drawer-highlight-hint">
                  Matching passages for: <strong>{activeHighlightSection}</strong>
                </div>
              )}
              <pre className="readme-raw-pre">
                {activeHighlightSection ? (
                  maskSecrets(summary?.readme_raw || "No README text available.")
                    .split("\n")
                    .map((line, idx) => {
                      const isMatch = line.toLowerCase().includes(activeHighlightSection.toLowerCase());
                      return isMatch ? (
                        <mark className="readme-highlight-line" key={idx}>
                          {line}
                          {"\n"}
                        </mark>
                      ) : (
                        <span key={idx}>
                          {line}
                          {"\n"}
                        </span>
                      );
                    })
                ) : (
                  maskSecrets(summary?.readme_raw || "No README text available.")
                )}
              </pre>
            </div>

            <div className="drawer-footer">
              <button
                className="secondary-button"
                onClick={() => setShowReadmeDrawer(false)}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </aside>
      )}
    </main>
  );
}
