"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Github,
  Sprout,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { RoleSelect } from "@/components/RoleSelect";
import { api } from "@/lib/api";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import type { Project, ProjectInvite, Role } from "@/lib/types";

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [invite, setInvite] = useState<ProjectInvite | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [invitedBy, setInvitedBy] = useState("");
  const [chosenRole, setChosenRole] = useState<Role>("frontend");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyMember, setAlreadyMember] = useState(false);
  const [isWrongAccount, setIsWrongAccount] = useState<string | null>(null);

  const loadInvite = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const data = await api.getInvite(token);
      setInvite(data.invite);
      setProject(data.project);
      setInvitedBy(data.invited_by);

      if (data.invite.role) {
        setChosenRole(data.invite.role);
      }

      // If mentor invite, route directly to viewer
      if (data.invite.type === "mentor") {
        router.replace(`/view/${data.invite.token}`);
        return;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "This invite link is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  }, [router, token]);

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);
    void loadInvite();
  }, [loadInvite]);

  // Handle Join Project
  async function handleJoinProject() {
    if (!token || !invite) return;

    if (!currentUser) {
      // Redirect to login and return back
      router.push(`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await api.acceptInvite(
        token,
        invite.role || chosenRole,
        currentUser.githubUsername
      );

      // Redirect to members page with query param for toast
      router.push(`/projects/${result.project.id}/members?joined=true`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not join project.";
      if (message.includes("already in this project")) {
        setAlreadyMember(true);
      } else if (message.includes("Please sign in with that account")) {
        setIsWrongAccount(invite.github_username || null);
      } else {
        setError(message);
      }
      setBusy(false);
    }
  }

  return (
    <main className="invite-page">
      <header className="dashboard-header">
        <Brand />
        {currentUser ? (
          <div className="account-menu">
            <span className="account-name">@{currentUser.githubUsername}</span>
          </div>
        ) : (
          <Link className="back-link" href="/login">
            Sign in
          </Link>
        )}
      </header>

      <section className="invite-container">
        <div className="invite-card">
          {loading ? (
            <div className="invite-loading">
              <span className="spinner reading-spinner" />
              <p>Checking your invitation...</p>
            </div>
          ) : error ? (
            <div className="invite-error-state">
              <div className="invite-icon-error">
                <AlertCircle aria-hidden="true" size={32} />
              </div>
              <h1>Invite link unavailable</h1>
              <p className="invite-error-msg">{error}</p>
              <Link className="primary-button" href="/dashboard">
                Go to Dashboard
              </Link>
            </div>
          ) : alreadyMember ? (
            <div className="invite-success-state">
              <div className="invite-icon-success">
                <Check aria-hidden="true" size={32} />
              </div>
              <h1>You&apos;re already in this project</h1>
              <p>You are already a member of {project?.repo_name}. Open the project canopy anytime.</p>
              <Link className="primary-button" href={`/projects/${project?.id}/members`}>
                Open project <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </div>
          ) : isWrongAccount ? (
            <div className="invite-error-state">
              <div className="invite-icon-error">
                <AlertCircle aria-hidden="true" size={32} />
              </div>
              <h1>Wrong GitHub account</h1>
              <p className="invite-error-msg">
                This invite was sent to <strong>@{isWrongAccount}</strong>. You are currently signed in as{" "}
                <strong>@{currentUser?.githubUsername}</strong>.
              </p>
              <div className="invite-action-buttons">
                <Link
                  className="secondary-button"
                  href={`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`}
                >
                  Sign in with @{isWrongAccount}
                </Link>
                <Link className="ghost-button" href="/dashboard">
                  Go to Dashboard
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="invite-card-top">
                <span className="invite-sprout-bubble">
                  <Sprout aria-hidden="true" size={24} />
                </span>
                <span className="invite-badge">Project Invitation</span>
              </div>

              <h1>Join {project?.repo_name}</h1>
              <p className="invite-intro">
                <strong>@{invitedBy || "A teammate"}</strong> has invited you to grow their project canopy on CodeCanopy.
              </p>

              {/* Role selection if not preset */}
              {!invite?.role ? (
                <div className="invite-role-selector">
                  <label className="field-label" htmlFor="choose-role">
                    Choose your role on this team
                  </label>
                  <RoleSelect id="choose-role" onChange={setChosenRole} value={chosenRole} />
                </div>
              ) : (
                <div className="preset-role-pill">
                  <span>Assigned role:</span>
                  <span className={`role-tag role-tag-${invite.role}`}>
                    {invite.role.replace("_", " / ")}
                  </span>
                </div>
              )}

              {/* Action button */}
              <div className="invite-action-area">
                {!currentUser ? (
                  <button
                    className="primary-button form-submit"
                    onClick={handleJoinProject}
                    type="button"
                  >
                    <Github aria-hidden="true" size={18} />
                    Continue with GitHub to join
                  </button>
                ) : (
                  <button
                    className="primary-button form-submit"
                    disabled={busy}
                    onClick={handleJoinProject}
                    type="button"
                  >
                    {busy ? "Joining team..." : "Join project"}
                    <ArrowRight aria-hidden="true" size={17} />
                  </button>
                )}
              </div>

              <p className="privacy-note">
                Joining connects your GitHub commits on this repo to project work items.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
