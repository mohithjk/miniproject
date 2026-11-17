"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Users } from "lucide-react";
import { Brand } from "@/components/Brand";
import { RoleSelect } from "@/components/RoleSelect";
import { ApiError, api } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import type { Member, Role, User } from "@/lib/types";

export default function ProjectMembersPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [role, setRole] = useState<Role>("frontend");
  const [canJoin, setCanJoin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadMembers = useCallback(async () => {
    try {
      const list = await api.getMembers(projectId);
      setMembers(list);
      const me = list.find((member) => member.user_id === user?.id);
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
    if (user) void loadMembers();
  }, [loadMembers, user]);

  const myMembership = members.find((member) => member.user_id === user?.id);

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
      await loadMembers();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your project role.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding-page">
      <header className="dashboard-header">
        <Brand />
        <Link className="back-link" href={`/projects/${projectId}/plan`}><ArrowLeft aria-hidden="true" size={16} /> Project plan</Link>
      </header>

      <section className="members-content">
        <div className="onboarding-step"><span>03</span> Members &amp; roles</div>
        <div className="plan-heading">
          <div>
            <p className="eyebrow">Build your team</p>
            <h1>Everyone has a branch to grow.</h1>
            <p>Pick your role. Your teammates can join this project and choose theirs too.</p>
          </div>
          <span className="team-icon"><Users aria-hidden="true" size={23} /></span>
        </div>

        <div className="members-layout">
          <section className="member-role-card">
            <p className="eyebrow">{myMembership ? "Your role" : "Join this project"}</p>
            <h2>{myMembership ? "Where do you fit best?" : "Choose your role to join."}</h2>
            <label className="field-label" htmlFor="member-role">Project role</label>
            <RoleSelect id="member-role" onChange={setRole} value={role} />
            {error && <p className="error-message" role="alert">{error}</p>}
            {message && <p className="success-message" role="status"><Check aria-hidden="true" size={16} /> {message}</p>}
            <button className="primary-button role-save-button" disabled={busy || loading} onClick={joinOrSaveRole} type="button">
              {busy ? "Saving..." : myMembership ? "Save my role" : "Join project"}
              <ArrowRight aria-hidden="true" size={17} />
            </button>
          </section>

          <section className="member-list-card">
            <div className="member-list-heading">
              <div>
                <p className="eyebrow">Project crew</p>
                <h2>Your teammates</h2>
              </div>
              {!loading && <span className="project-count">{members.length} {members.length === 1 ? "member" : "members"}</span>}
            </div>
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
                    <span className="avatar avatar-fallback">{member.username?.[0]?.toUpperCase() ?? "?"}</span>
                    <span className="member-name">{member.username ?? `Member ${member.user_id}`}</span>
                    <span className="role-tag">{member.role.replace("_", " / ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="member-invite-note">
          <strong>Bringing teammates in?</strong>
          <span>Ask them to sign in, then open this project&apos;s members page to join with their own role.</span>
        </div>
        <div className="plan-actions">
          <button className="secondary-button" onClick={() => router.push("/dashboard")} type="button">Back to dashboard</button>
          <button className="primary-button" onClick={() => router.push(`/projects/${projectId}/plan`)} type="button">
            Back to plan <ArrowRight aria-hidden="true" size={17} />
          </button>
        </div>
      </section>
    </main>
  );
}
