"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Plus } from "lucide-react";
import { Brand } from "@/components/Brand";
import { ProjectList } from "@/components/ProjectList";
import { ApiError, api, useMockData } from "@/lib/api";
import { getCurrentUser, signOut, type CurrentUser } from "@/lib/auth";
import { clearSession } from "@/lib/session";
import type { Project } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProjects(await api.getProjects());
    } catch (loadError: unknown) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        if (useMockData) window.localStorage.removeItem("codecanopy.mock-user");
        else clearSession();
        router.replace("/login");
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Could not load your projects.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const sessionUser = getCurrentUser();
    if (!sessionUser) {
      router.replace("/login");
      return;
    }
    setUser(sessionUser);
    void loadProjects();
  }, [loadProjects, router]);

  function logOut() {
    signOut();
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <Brand />
        {user && (
          <div className="account-menu">
            {user.avatar ? (
              // GitHub provides a remote avatar; a plain img avoids extra domain setup.
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={`${user.name}'s avatar`} className="avatar" src={user.avatar} />
            ) : <span aria-hidden="true" className="avatar avatar-fallback">{user.name[0]?.toUpperCase()}</span>}
            <span className="account-name">{user.name}</span>
            <button aria-label="Log out" className="icon-button" onClick={logOut} title="Log out" type="button">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </div>
        )}
      </header>

      <section className="dashboard-content">
        <div className="dashboard-heading">
          <div>
            <p className="eyebrow">Your workspace</p>
            <h1>Good things are growing.</h1>
            <p className="dashboard-subtitle">Here&apos;s what your team is building together.</p>
          </div>
          <button aria-describedby="connect-help" className="connect-button" onClick={() => router.push("/projects/new")} type="button">
            <Plus aria-hidden="true" size={19} />
            Connect a repo
          </button>
        </div>
        <p className="connect-help" id="connect-help">Choose a repository you can access on GitHub.</p>

        <div className="section-heading">
          <h2>Your projects</h2>
          {!loading && <span className="project-count">{projects.length} {projects.length === 1 ? "project" : "projects"}</span>}
        </div>
        {loading ? (
          <div aria-busy="true" aria-label="Loading projects" className="project-grid" role="status">
            <div className="project-skeleton" />
            <div className="project-skeleton" />
          </div>
        ) : error ? (
          <div className="dashboard-error-state">
            <p role="alert">{error}</p>
            <button className="secondary-button" onClick={() => void loadProjects()} type="button">Try again</button>
          </div>
        ) : (
          <ProjectList projects={projects} />
        )}
      </section>
    </main>
  );
}
