"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { Brand } from "@/components/Brand";
import { RoleSelect } from "@/components/RoleSelect";
import { api } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import type { Plan, PlanNode, Project, Role } from "@/lib/types";

const newNode = (nodes: PlanNode[]): PlanNode => {
  const usedKeys = new Set(nodes.map((node) => node.key));
  let number = 1;
  while (usedKeys.has(`n${number}`)) number += 1;
  return {
    key: `n${number}`,
    title: "",
    description: "",
    role: "frontend",
    done_criteria: "",
    path_hints: [],
    depends_on: [],
  };
};

export default function PlanReviewPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const router = useRouter();
  const [plan, setPlan] = useState<Plan>({ nodes: [] });
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadPlan = useCallback(async () => {
    if (!Number.isInteger(projectId) || projectId < 1) {
      setError("That project link is not valid.");
      setLoading(false);
      return;
    }
    if (!getSessionUser()) {
      router.replace("/login");
      return;
    }

    try {
      const [draft, projectDetails] = await Promise.all([
        api.getPlan(projectId),
        api.getProject(projectId),
      ]);
      setPlan(draft);
      setProject(projectDetails);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the project plan.");
    } finally {
      setLoading(false);
    }
  }, [projectId, router]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  function updateNode(key: string, change: Partial<PlanNode>) {
    setPlan((current) => ({
      nodes: current.nodes.map((node) => node.key === key ? { ...node, ...change } : node),
    }));
  }

  function removeNode(key: string) {
    setPlan((current) => ({
      nodes: current.nodes
        .filter((node) => node.key !== key)
        .map((node) => ({
          ...node,
          depends_on: node.depends_on.filter((dependency) => dependency !== key),
        })),
    }));
  }

  function toggleDependency(node: PlanNode, dependency: string) {
    const dependsOn = node.depends_on.includes(dependency)
      ? node.depends_on.filter((key) => key !== dependency)
      : [...node.depends_on, dependency];
    updateNode(node.key, { depends_on: dependsOn });
  }

  async function saveDraft() {
    if (plan.nodes.some((node) => !node.title.trim())) {
      setError("Give every work item a title before saving.");
      return false;
    }
    if (plan.nodes.length < 3 || plan.nodes.length > 40) {
      setError("A plan needs between 3 and 40 work items.");
      return false;
    }

    setBusy(true);
    setError("");
    try {
      const saved = await api.savePlan(projectId, plan);
      setPlan(saved);
      return true;
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your plan.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function approvePlan() {
    const saved = await saveDraft();
    if (!saved) return;

    setBusy(true);
    try {
      await api.approvePlan(projectId);
      router.push(`/projects/${projectId}/members`);
    } catch (approveError: unknown) {
      setError(approveError instanceof Error ? approveError.message : "Could not approve this plan.");
      setBusy(false);
    }
  }

  async function retryPlan() {
    setBusy(true);
    setError("");
    try {
      await api.retryPlan(projectId);
      setLoading(true);
      await loadPlan();
    } catch (retryError: unknown) {
      setError(retryError instanceof Error ? retryError.message : "Could not retry plan generation.");
    } finally {
      setBusy(false);
    }
  }

  function roleChange(key: string, role: Role) {
    updateNode(key, { role });
  }

  const isApproved = project?.plan_status === "approved";

  return (
    <main className="onboarding-page plan-page">
      <header className="dashboard-header">
        <Brand />
        <Link className="back-link" href="/dashboard"><ArrowLeft aria-hidden="true" size={16} /> Dashboard</Link>
      </header>

      <section className="plan-content">
        <div className="onboarding-step"><span>02</span> Review your plan</div>
        {loading ? (
          <div aria-busy="true" aria-label="Loading project plan" className="plan-loading" role="status">
            <div className="plan-skeleton-heading">
              <span className="skeleton-line skeleton-short" />
              <span className="skeleton-line skeleton-title" />
              <span className="skeleton-line skeleton-medium" />
            </div>
            <div className="plan-skeleton-card">
              <span className="skeleton-line skeleton-title" />
              <span className="skeleton-line" />
              <span className="skeleton-line skeleton-medium" />
            </div>
            <div className="plan-skeleton-card plan-skeleton-card-second">
              <span className="skeleton-line skeleton-title" />
              <span className="skeleton-line" />
              <span className="skeleton-line skeleton-medium" />
            </div>
            <h1>AI is reading your README...</h1>
            <p>We&apos;re turning the project overview into a first draft of team tasks.</p>
          </div>
        ) : (
          <>
            <div className="plan-heading">
              <div>
                <p className="eyebrow">{project ? `${project.repo_owner}/${project.repo_name}` : "Project plan"}</p>
                <h1>{isApproved ? "Your plan is growing." : "Review the first draft."}</h1>
                <p>{isApproved ? "The work tree is approved. You can set up your team roles next." : "Edit tasks, choose roles, and connect the dependencies."}</p>
              </div>
              {isApproved && <span className="approved-badge"><Check aria-hidden="true" size={15} /> Approved</span>}
            </div>

            {error && (
              <div className="error-banner" role="alert">
                <p>{error}</p>
                {error.toLowerCase().includes("plan") && !isApproved && (
                  <button className="text-button" disabled={busy} onClick={retryPlan} type="button">Retry plan generation</button>
                )}
              </div>
            )}

            {!isApproved && (
              <div className="plan-toolbar">
                <span>{plan.nodes.length} work items <span className="toolbar-note">· between 3 and 40</span></span>
                <button
                  className="secondary-button"
                  disabled={plan.nodes.length >= 40}
                  onClick={() => setPlan((current) => ({ nodes: [...current.nodes, newNode(current.nodes)] }))}
                  type="button"
                >
                  <Plus aria-hidden="true" size={17} /> Add work item
                </button>
              </div>
            )}

            <div className="plan-node-list">
              {plan.nodes.map((node, index) => (
                <article className="plan-node-card" key={node.key}>
                  <div className="plan-node-heading">
                    <span className="node-number">{String(index + 1).padStart(2, "0")}</span>
                    <div className="node-title-area">
                      {!isApproved && (
                        <label className="field-label" htmlFor={`title-${node.key}`}>Work item title</label>
                      )}
                      {isApproved ? (
                        <h2>{node.title}</h2>
                      ) : (
                        <input
                          className="form-control node-title-input"
                          id={`title-${node.key}`}
                          onChange={(event) => updateNode(node.key, { title: event.target.value })}
                          placeholder="A clear, actionable task"
                          value={node.title}
                        />
                      )}
                    </div>
                    {!isApproved && (
                      <button
                        aria-label={`Delete ${node.title || node.key}`}
                        className="icon-button delete-node-button"
                        disabled={plan.nodes.length <= 1}
                        onClick={() => removeNode(node.key)}
                        title="Delete work item"
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={17} />
                      </button>
                    )}
                  </div>

                  <div className="plan-node-fields">
                    <div>
                      <label className="field-label" htmlFor={`role-${node.key}`}>Role</label>
                      {isApproved ? (
                        <span className="role-tag">{node.role.replace("_", " / ")}</span>
                      ) : (
                        <RoleSelect id={`role-${node.key}`} onChange={(role) => roleChange(node.key, role)} value={node.role} />
                      )}
                    </div>
                    <div className="node-description-field">
                      <label className="field-label" htmlFor={`description-${node.key}`}>Description</label>
                      {isApproved ? <p>{node.description || "No description provided."}</p> : (
                        <textarea
                          className="form-control"
                          id={`description-${node.key}`}
                          onChange={(event) => updateNode(node.key, { description: event.target.value })}
                          placeholder="What needs to be done?"
                          rows={2}
                          value={node.description}
                        />
                      )}
                    </div>
                    <div className="node-description-field">
                      <label className="field-label" htmlFor={`criteria-${node.key}`}>Done criteria</label>
                      {isApproved ? <p>{node.done_criteria || "No done criteria provided."}</p> : (
                        <textarea
                          className="form-control"
                          id={`criteria-${node.key}`}
                          onChange={(event) => updateNode(node.key, { done_criteria: event.target.value })}
                          placeholder="How will your team know this task is complete?"
                          rows={2}
                          value={node.done_criteria}
                        />
                      )}
                    </div>
                    {!isApproved && plan.nodes.length > 1 && (
                      <fieldset className="dependency-field">
                        <legend className="field-label">Depends on</legend>
                        <div className="dependency-options">
                          {plan.nodes.filter((other) => other.key !== node.key).map((other) => (
                            <label className="dependency-option" key={other.key}>
                              <input
                                checked={node.depends_on.includes(other.key)}
                                onChange={() => toggleDependency(node, other.key)}
                                type="checkbox"
                              />
                              <span>{other.title || other.key}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    )}
                    {isApproved && (
                      <div className="dependency-field">
                        <span className="field-label">Depends on</span>
                        <p>{node.depends_on.length ? node.depends_on.join(", ") : "No dependencies"}</p>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <div className="plan-actions">
              {isApproved ? (
                <button className="primary-button" onClick={() => router.push(`/projects/${projectId}/members`)} type="button">
                  Set up team roles <ArrowRight aria-hidden="true" size={17} />
                </button>
              ) : (
                <>
                  <button className="secondary-button" disabled={busy} onClick={saveDraft} type="button">
                    {busy ? "Saving..." : "Save draft"}
                  </button>
                  <button className="primary-button" disabled={busy} onClick={approvePlan} type="button">
                    {busy ? "Saving plan..." : "Approve plan & continue"}
                    <ArrowRight aria-hidden="true" size={17} />
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
