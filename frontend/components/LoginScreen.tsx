"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Eye, Github, GraduationCap } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Brand } from "@/components/Brand";
import { TreeIllustration } from "@/components/TreeIllustration";
import {
  getLastChosenRole,
  saveChosenRole,
  signInWithGitHub,
  type UserRole,
} from "@/lib/auth";

export function LoginScreen() {
  const [selectedRole, setSelectedRole] = useState<UserRole>("student");
  const [step, setStep] = useState<1 | 2>(1);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReduceMotion = useReducedMotion();

  // Load preselected role from localStorage on mount
  useEffect(() => {
    const saved = getLastChosenRole();
    if (saved) setSelectedRole(saved);
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    };
  }, []);

  function handleSelectRole(role: UserRole) {
    setSelectedRole(role);
    saveChosenRole(role);
    setError("");

    // Auto-advance after 300ms for a smooth one-click flow
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = setTimeout(() => {
      setStep(2);
    }, 300);
  }

  function handleContinue() {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    if (selectedRole) {
      saveChosenRole(selectedRole);
      setStep(2);
    }
  }

  function handleBackToStep1() {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    setError("");
    setStep(1);
  }

  function handleKeyDown(e: React.KeyboardEvent, role: UserRole) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSelectRole(role);
    } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      handleSelectRole("mentor");
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      handleSelectRole("student");
    }
  }

  async function startLogin() {
    setConnecting(true);
    setError("");

    try {
      const redirectUrl =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("redirect") || undefined
          : undefined;
      await signInWithGitHub(selectedRole, redirectUrl);
    } catch (loginError) {
      setConnecting(false);
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Could not start GitHub login."
      );
    }
  }

  const slideVariants = {
    enter: (direction: number) => ({
      x: shouldReduceMotion ? 0 : direction > 0 ? 25 : -25,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
      transition: { duration: 0.25, ease: "easeInOut" },
    },
    exit: (direction: number) => ({
      x: shouldReduceMotion ? 0 : direction > 0 ? -25 : 25,
      opacity: 0,
      transition: { duration: 0.2, ease: "easeInOut" },
    }),
  };

  return (
    <main className="login-layout">
      {/* Left side remains completely unchanged */}
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

      {/* Right side: 2-step card */}
      <section className="login-panel">
        <div className="login-card">
          <AnimatePresence custom={step === 2 ? 1 : -1} mode="wait">
            {step === 1 ? (
              <motion.div
                key="step-1"
                animate="center"
                custom={1}
                exit="exit"
                initial="enter"
                variants={slideVariants}
              >
                <p className="eyebrow">Who are you?</p>
                <h2>Welcome to CodeCanopy</h2>
                <p className="login-description" style={{ marginBottom: "20px" }}>
                  First, tell us who you are.
                </p>

                <div
                  aria-label="Select your role"
                  className="role-radiogroup"
                  role="radiogroup"
                >
                  {/* Student Card */}
                  <div
                    aria-checked={selectedRole === "student"}
                    aria-label="I'm a student"
                    className={`role-card ${selectedRole === "student" ? "selected" : ""}`}
                    onClick={() => handleSelectRole("student")}
                    onKeyDown={(e) => handleKeyDown(e, "student")}
                    role="radio"
                    tabIndex={0}
                  >
                    <span aria-hidden="true" className="role-card-icon">
                      <GraduationCap size={22} />
                    </span>
                    <div className="role-card-content">
                      <div className="role-card-title">I&apos;m a student</div>
                      <p className="role-card-desc">
                        Build your project and see your team&apos;s tree grow.
                      </p>
                    </div>
                    {selectedRole === "student" ? (
                      <span aria-hidden="true" className="role-card-check">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    ) : (
                      <span aria-hidden="true" className="role-card-circle" />
                    )}
                  </div>

                  {/* Mentor Card */}
                  <div
                    aria-checked={selectedRole === "mentor"}
                    aria-label="I'm a mentor"
                    className={`role-card ${selectedRole === "mentor" ? "selected" : ""}`}
                    onClick={() => handleSelectRole("mentor")}
                    onKeyDown={(e) => handleKeyDown(e, "mentor")}
                    role="radio"
                    tabIndex={0}
                  >
                    <span aria-hidden="true" className="role-card-icon">
                      <Eye size={22} />
                    </span>
                    <div className="role-card-content">
                      <div className="role-card-title">I&apos;m a mentor</div>
                      <p className="role-card-desc">
                        Watch your team&apos;s progress. View only, no changes.
                      </p>
                    </div>
                    {selectedRole === "mentor" ? (
                      <span aria-hidden="true" className="role-card-check">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    ) : (
                      <span aria-hidden="true" className="role-card-circle" />
                    )}
                  </div>
                </div>

                <button
                  className="continue-role-button"
                  disabled={!selectedRole}
                  onClick={handleContinue}
                  type="button"
                >
                  Continue
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="step-2"
                animate="center"
                custom={-1}
                exit="exit"
                initial="enter"
                variants={slideVariants}
              >
                {/* Role Chip */}
                <div className="role-chip-container">
                  <span className="role-chip">
                    {selectedRole === "mentor" ? (
                      <Eye aria-hidden="true" size={13} />
                    ) : (
                      <GraduationCap aria-hidden="true" size={13} />
                    )}
                    Signing in as a {selectedRole === "mentor" ? "Mentor" : "Student"}
                  </span>
                  <button
                    className="role-chip-change"
                    onClick={handleBackToStep1}
                    type="button"
                  >
                    Change
                  </button>
                </div>

                <h2>Sign in with GitHub</h2>
                <p className="login-description">
                  {selectedRole === "mentor"
                    ? "We use GitHub only to confirm who you are. You'll get a view-only dashboard."
                    : "We only read your repository to build your project plan. We never change your code."}
                </p>

                <button
                  className="github-button"
                  disabled={connecting}
                  onClick={startLogin}
                  type="button"
                >
                  {connecting ? <span className="spinner" /> : <Github aria-hidden="true" size={20} />}
                  {connecting ? "Connecting..." : "Continue with GitHub"}
                </button>

                {error && (
                  <p aria-live="polite" className="error-message">
                    {error}
                  </p>
                )}

                <p className="login-footer">Made for teams that grow better together.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </main>
  );
}
