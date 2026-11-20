"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Eye,
  Mail,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { ConnectStepper } from "@/components/ConnectStepper";
import { InviteTeammateModal } from "@/components/InviteTeammateModal";
import { RoleSelect } from "@/components/RoleSelect";
import { ApiError, api } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";
import type { Member, Project, ProjectInvite, Role, User } from "@/lib/types";

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return "";
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

function canResend(lastSentAt?: string): boolean {
  if (!lastSentAt) return true;
  try {
    const elapsed = Date.now() - new Date(lastSentAt).getTime();
    return elapsed > 60000; // 1 minute cooldown
  } catch {
    return true;
  }
}

export default function ProjectMembersPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const projectId = Number(params.id);
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<ProjectInvite[]>([]);
  const [role, setRole] = useState<Role>("frontend");
  const [canJoin, setCanJoin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Modal and toast states
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<number | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);
  const [confirmRemoveUserId, setConfirmRemoveUserId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Check for newly joined toast from query params
  useEffect(() => {
    if (searchParams.get("joined") === "true") {
      setToastMessage("Welcome! You joined the project.");
      setTimeout(() => setToastMessage(null), 5000);
    }
  }, [searchParams]);

  const loadData = useCallback(async () => {
    try {
      const [memberList, projectDetails, inviteList] = await Promise.all([
        api.getMembers(projectId),
        api.getProject(projectId).catch(() => null),
        api.listInvites(projectId).catch(() => []),
      ]);

      setMembers(memberList);
      if (projectDetails) setProject(projectDetails);
      setInvites(inviteList);

      const me = memberList.find((member) => member.user_id === user?.id);
      if (me) setRole(me.role);
    } catch (loadError: unknown) {
      if (loadError instanceof ApiError && loadError.status === 403) {
        setCanJoin(true);
      } else {
        setError(loadError instanceof Error ? loadError.message : "Could not load project members.");
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, user?.id]);

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
    if (user) void loadData();
  }, [loadData, user]);

  const myMembership = members.find((member) => member.user_id === user?.id);
  const isMentor = getCurrentUser()?.role === "mentor";
  const isOwner = project ? project.owner_id === user?.id : myMembership?.id === members[0]?.id;
  const isProjectFull = members.length >= 8;

  const pendingInvites = invites.filter((i) => i.status === "pending");
  const pendingCount = pendingInvites.length;

  async function joinOrSaveRole() {
    if (!user) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (myMembership) {
        await api.updateMemberRole(projectId, user.id, role);
        setMessage("Your role has been updated.");
      } else {
        await api.joinProject(projectId, role);
        setCanJoin(false);
        setMessage("You joined the project.");
      }
      setLoading(true);
      await loadData();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your project role.");
    } finally {
      setBusy(false);
    }
  }

  function handleInviteCreated(newInvite: ProjectInvite) {
    setInvites((prev) => [newInvite, ...prev]);
    const label = newInvite.github_username ? `@${newInvite.github_username}` : "Invite link";
    setToastMessage(`Invite created for ${label}`);
    setTimeout(() => setToastMessage(null), 4000);
  }

  async function handleResendInvite(inviteId: number) {
    try {
      const updated = await api.resendInvite(inviteId);
      setInvites((prev) => prev.map((i) => (i.id === inviteId ? updated : i)));
      setToastMessage("Invite resent.");
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resend invite.");
    }
  }

  async function handleRevokeInvite(inviteId: number) {
    try {
      await api.revokeInvite(inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      setConfirmRevokeId(null);
      setToastMessage("Invite revoked.");
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to revoke invite.");
    }
  }

  async function handleRemoveMember(memberUserId: number, username?: string | null) {
    try {
      await api.removeMember(projectId, memberUserId);
      setMembers((prev) => prev.filter((m) => m.user_id !== memberUserId));
      setConfirmRemoveUserId(null);
      setToastMessage(`Removed ${username || "member"} from project.`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove member.");
    }
  }

  async function copyInviteLink(invite: ProjectInvite) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/invite/${invite.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInviteId(invite.id);
      setTimeout(() => setCopiedInviteId(null), 2000);
    } catch {
      setCopiedInviteId(invite.id);
      setTimeout(() => setCopiedInviteId(null), 2000);
    }
  }

  return (
    <main className="onboarding-page">
      {/* Toast Announcement */}
      {toastMessage && (
        <div aria-live="polite" className="teammate-toast">
          <Check aria-hidden="true" size={16} />
          <span>{toastMessage}</span>
          <button aria-label="Dismiss toast" className="toast-close" onClick={() => setToastMessage(null)} type="button">
            <X aria-hidden="true" size={14} />
          </button>
        </div>
      )}

      <header className="dashboard-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Brand />
          {isMentor && (
            <span className="view-only-badge" title="Logged in as Mentor">
              <Eye aria-hidden="true" size={12} />
              View only
            </span>
          )}
        </div>
        <Link className="back-link" href={isMentor ? `/projects/${projectId}/tree` : `/projects/${projectId}/plan`}>
          <ArrowLeft aria-hidden="true" size={16} /> {isMentor ? "Project tree" : "Project plan"}
        </Link>
      </header>

      <div className="stepper-wrapper">
        <ConnectStepper currentStep="members" />
      </div>

      <section className="members-content">
        <div className="onboarding-step">
          <span>04</span> Invite team &amp; assign roles
        </div>
        <div className="plan-heading">
          <div>
            <p className="eyebrow">Build your team</p>
            <h1>Everyone has a branch to grow.</h1>
            <p>Pick your role. Your teammates can join this project and choose theirs too.</p>
          </div>
          <span className="team-icon">
            <Users aria-hidden="true" size={23} />
          </span>
        </div>

        <div className="members-layout">
          {!isMentor ? (
            <section className="member-role-card">
              <p className="eyebrow">{myMembership ? "Your role" : "Join this project"}</p>
              <h2>{myMembership ? "Where do you fit best?" : "Choose your role to join."}</h2>
              <label className="field-label" htmlFor="member-role">
                Project role
              </label>
              <RoleSelect id="member-role" onChange={setRole} value={role} />
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
              {message && (
                <p className="success-message" role="status">
                  <Check aria-hidden="true" size={16} /> {message}
                </p>
              )}
              <button
                className="primary-button role-save-button"
                disabled={busy || loading}
                onClick={joinOrSaveRole}
                type="button"
              >
                {busy ? "Saving..." : myMembership ? "Save my role" : "Join project"}
                <ArrowRight aria-hidden="true" size={17} />
              </button>
            </section>
          ) : (
            <section className="member-role-card">
              <p className="eyebrow">Mentor Access</p>
              <h2>View-only team roster</h2>
              <p className="login-description" style={{ margin: "10px 0 0" }}>
                You have view-only access to this project. Team memberships and roles are configured by student contributors.
              </p>
            </section>
          )}

          <section className="member-list-card">
            <div className="member-list-heading">
              <div>
                <p className="eyebrow">Project crew</p>
                <h2>Your teammates</h2>
              </div>
              <div className="member-header-actions">
                {!loading && (
                  <span className="project-count">
                    {members.length} {members.length === 1 ? "member" : "members"}
                    {pendingCount > 0 ? `, ${pendingCount} pending` : ""}
                  </span>
                )}
                {!isMentor && (
                  <button
                    aria-label="Invite a teammate"
                    className="invite-teammate-btn"
                    disabled={isProjectFull}
                    onClick={() => setIsInviteModalOpen(true)}
                    title={isProjectFull ? "Project has reached maximum limit of 8 members" : undefined}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={15} />
                    <span>Invite teammate</span>
                  </button>
                )}
              </div>
            </div>

            {/* Member count limit banner */}
            {isProjectFull && (
              <div className="member-limit-note">
                <AlertCircle aria-hidden="true" size={15} />
                <span>This project has reached its maximum limit of 8 members.</span>
              </div>
            )}

            {/* Friendly single-member empty line */}
            {!loading && members.length === 1 && (
              <p className="member-single-note">
                It&apos;s just you so far. Invite your teammates so everyone gets a branch.
              </p>
            )}

            {loading ? (
              <div aria-busy="true" aria-label="Loading project members" className="member-loading" role="status">
                <div className="member-skeleton-list">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ) : canJoin ? (
              <p className="member-empty">You aren&apos;t on this project yet. Choose a role to join the team.</p>
            ) : members.length === 0 ? (
              <p className="member-empty">No team members to show yet.</p>
            ) : (
              <ul className="member-list">
                {members.map((member) => (
                  <li className="member-row" key={member.id}>
                    <span className="avatar avatar-fallback">
                      {member.username?.[0]?.toUpperCase() ?? "?"}
                    </span>
                    <div className="member-info">
                      <span className="member-name">{member.username ?? `Member ${member.user_id}`}</span>
                      {member.user_id === project?.owner_id && (
                        <span className="owner-badge">Owner</span>
                      )}
                    </div>
                    <span className={`role-tag role-tag-${member.role}`}>
                      {member.role.replace("_", " / ")}
                    </span>

                    {/* Owner can remove non-owner members */}
                    {isOwner && member.user_id !== user?.id && member.user_id !== project?.owner_id && (
                      <div className="member-action-cell">
                        {confirmRemoveUserId === member.user_id ? (
                          <div className="confirm-remove-pop">
                            <span>Remove?</span>
                            <button
                              className="btn-confirm-yes"
                              onClick={() => handleRemoveMember(member.user_id, member.username)}
                              type="button"
                            >
                              Yes
                            </button>
                            <button
                              className="btn-confirm-no"
                              onClick={() => setConfirmRemoveUserId(null)}
                              type="button"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            aria-label={`Remove ${member.username || "member"}`}
                            className="member-remove-btn"
                            onClick={() => setConfirmRemoveUserId(member.user_id)}
                            title="Remove member"
                            type="button"
                          >
                            <Trash2 aria-hidden="true" size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* PENDING INVITES LIST */}
            {pendingInvites.length > 0 && (
              <div className="pending-invites-block">
                <div className="pending-invites-heading">
                  <Mail aria-hidden="true" size={15} />
                  <h3>Pending invites</h3>
                </div>

                <ul className="pending-invites-list">
                  {pendingInvites.map((invite) => {
                    const isUsername = invite.type === "username";
                    const label = isUsername ? `@${invite.github_username}` : "Invite link";
                    const isExpired = invite.status === "expired" || new Date() > new Date(invite.expires_at);
                    const resendReady = canResend(invite.last_sent_at);

                    return (
                      <li className="pending-invite-row" key={invite.id}>
                        <span className="avatar avatar-fallback pending-avatar">
                          {isUsername ? invite.github_username?.[0]?.toUpperCase() : "🔗"}
                        </span>

                        <div className="pending-invite-info">
                          <span className="pending-invite-name">{label}</span>
                          <span className="pending-invite-time">{formatRelativeTime(invite.created_at)}</span>
                        </div>

                        {invite.role ? (
                          <span className={`role-tag role-tag-${invite.role}`}>
                            {invite.role.replace("_", " / ")}
                          </span>
                        ) : (
                          <span className="role-tag role-tag-open">Open choice</span>
                        )}

                        <span className={`pending-status-pill ${isExpired ? "expired" : "pending"}`}>
                          {isExpired ? "Expired" : "Pending"}
                        </span>

                        <div className="pending-actions">
                          {isUsername && (
                            <button
                              aria-label="Resend invite"
                              className="pending-action-btn"
                              disabled={!resendReady}
                              onClick={() => handleResendInvite(invite.id)}
                              title={resendReady ? "Resend invite" : "Wait 1 minute before resending"}
                              type="button"
                            >
                              <RefreshCw aria-hidden="true" size={13} />
                              <span>Resend</span>
                            </button>
                          )}

                          <button
                            aria-label="Copy invite link"
                            className="pending-action-btn"
                            onClick={() => copyInviteLink(invite)}
                            type="button"
                          >
                            {copiedInviteId === invite.id ? (
                              <>
                                <Check aria-hidden="true" size={13} />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy aria-hidden="true" size={13} />
                                <span>Copy link</span>
                              </>
                            )}
                          </button>

                          {/* Revoke button with confirm */}
                          {confirmRevokeId === invite.id ? (
                            <div className="confirm-revoke-pop">
                              <span>Revoke?</span>
                              <button
                                className="btn-confirm-yes"
                                onClick={() => handleRevokeInvite(invite.id)}
                                type="button"
                              >
                                Yes
                              </button>
                              <button
                                className="btn-confirm-no"
                                onClick={() => setConfirmRevokeId(null)}
                                type="button"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              aria-label="Revoke invite"
                              className="pending-action-btn revoke-btn"
                              onClick={() => setConfirmRevokeId(invite.id)}
                              type="button"
                            >
                              <X aria-hidden="true" size={14} />
                              <span>Revoke</span>
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>

        <div className="member-invite-note">
          <strong>Bringing teammates in?</strong>
          <span>
            Use the <strong>+ Invite teammate</strong> button above to invite contributors by GitHub username or share a student link.
          </span>
        </div>

        <div className="plan-actions">
          <button className="secondary-button" onClick={() => router.push(`/projects/${projectId}/plan`)} type="button">
            Back to plan
          </button>
          <button className="primary-button" onClick={() => router.push(`/projects/${projectId}/tree`)} type="button">
            View project tree <ArrowRight aria-hidden="true" size={17} />
          </button>
        </div>
      </section>

      {/* Invite Teammate Modal */}
      <InviteTeammateModal
        existingInvites={invites}
        existingMembers={members}
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInviteSent={handleInviteCreated}
        projectId={projectId}
      />
    </main>
  );
}
