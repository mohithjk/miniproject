"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Github, Sprout } from "lucide-react";
import { Brand } from "@/components/Brand";
import { RoleSelect } from "@/components/RoleSelect";
import { api } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import type { Role } from "@/lib/types";

export default function ConnectRepositoryPage() {
  const router = useRouter();
  const [repo, setRepo] = useState("");
  const [role, setRole] = useState<Role>("frontend");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getSessionUser()) router.replace("/login");
  }, [router]);

  async function connectRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const parts = repo.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "").split("/");
    if (parts.length !== 2 || parts.some((part) => !part)) {
      setError("Enter a repository as owner/name, or paste its github.com URL.");
      return;
    }

    setConnecting(true);
    try {
      const project = await api.createProject(parts[0], parts[1], role);
      router.push(`/projects/${project.id}/plan`);
    } catch (connectError: unknown) {
      setConnecting(false);
      setError(connectError instanceof Error ? connectError.message : "Could not connect this repository.");
    }
  }

  return (
    <main className="onboarding-page">
      <header className="dashboard-header">
        <Brand />
        <Link className="back-link" href="/dashboard"><ArrowLeft aria-hidden="true" size={16} /> Dashboard</Link>
      </header>

      <section className="onboarding-content">
        <div className="onboarding-step"><span>01</span> Connect a repository</div>
        <div className="onboarding-card">
          {connecting ? (
            <div aria-live="polite" className="reading-state">
              <span className="reading-icon"><Sprout aria-hidden="true" size={26} /></span>
              <span className="spinner reading-spinner" />
              <h1>AI is reading your README...</h1>
              <p>We&apos;re connecting your repository and preparing a first draft of the work tree.</p>
            </div>
          ) : (
            <>
              <span className="onboarding-icon"><Github aria-hidden="true" size={23} /></span>
              <p className="eyebrow">Start with your code</p>
              <h1>Which repo are we growing?</h1>
              <p className="onboarding-intro">
                Paste a GitHub repository you can access. We&apos;ll read its README and set up commit tracking.
              </p>
              <form className="onboarding-form" onSubmit={connectRepository}>
                <label htmlFor="repository">GitHub repository</label>
                <input
                  autoComplete="url"
                  className="form-control"
                  id="repository"
                  onChange={(event) => setRepo(event.target.value)}
                  placeholder="octocat/hello-world"
                  required
                  value={repo}
                />
                <p className="field-hint">Use owner/repo or a github.com repository URL.</p>
                <label htmlFor="your-role">Your role on this project</label>
                <RoleSelect id="your-role" onChange={setRole} value={role} />
                {error && <p aria-live="polite" className="error-message">{error}</p>}
                <button className="primary-button form-submit" type="submit">
                  Connect repository
                  <ArrowLeft aria-hidden="true" className="button-arrow" size={17} />
                </button>
              </form>
              <p className="privacy-note">CodeCanopy reads your repository to build a plan. It never changes your code.</p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
