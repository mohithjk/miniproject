"use client";

import { useState } from "react";
import { Github } from "lucide-react";
import { Brand } from "@/components/Brand";
import { TreeIllustration } from "@/components/TreeIllustration";
import { signInWithGitHub } from "@/lib/auth";

export function LoginScreen() {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  async function startLogin() {
    setConnecting(true);
    setError("");

    try {
      await signInWithGitHub();
    } catch (loginError) {
      setConnecting(false);
      setError(loginError instanceof Error ? loginError.message : "Could not start GitHub login.");
    }
  }

  return (
    <main className="login-layout">
      <section className="login-story">
        <div className="story-content">
          <Brand />
          <div className="story-copy">
            <p className="eyebrow">A calmer way to build together</p>
            <h1>Watch your project&apos;s canopy grow.</h1>
            <p>
              Your project, branch by branch. Connect your GitHub repo and our AI builds the plan,
              tracks every commit, and tells your team when it&apos;s their turn.
            </p>
          </div>
          <TreeIllustration />
          <p className="story-footnote">Small steps. Shared progress. Room to grow.</p>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Welcome back</p>
          <h2>Welcome to CodeCanopy</h2>
          <p className="login-description">Your next great thing starts with your GitHub.</p>
          <button className="github-button" disabled={connecting} onClick={startLogin} type="button">
            {connecting ? <span className="spinner" /> : <Github aria-hidden="true" size={20} />}
            {connecting ? "Connecting..." : "Continue with GitHub"}
          </button>
          {error && <p aria-live="polite" className="error-message">{error}</p>}
          {/* Tagline placed below the GitHub button with dedicated spacing */}
          <p className="login-footer">Made for teams that grow better together.</p>
          <p className="privacy-note">
            We only read your repository to build your project plan. We never change your code.
          </p>
        </div>
      </section>
    </main>
  );
}
