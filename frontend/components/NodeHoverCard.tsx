"use client";

import { motion } from "framer-motion";
import { Check, Clock, Lock, Sparkles } from "lucide-react";
import type { TreeNode } from "@/lib/types";

type NodeHoverCardProps = {
  task: TreeNode;
  unlockedBy: TreeNode[];
  waitingOn: TreeNode[];
  placement?: "top" | "bottom";
};

function formatRole(role: string) {
  switch (role) {
    case "frontend":
      return "Frontend";
    case "backend":
      return "Backend";
    case "ai_ml":
      return "AI / ML";
    case "security":
      return "Security";
    case "devops":
      return "DevOps";
    default:
      return role.replace("_", " ");
  }
}

export function NodeHoverCard({
  task,
  unlockedBy,
  waitingOn,
  placement = "top",
}: NodeHoverCardProps) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      aria-live="polite"
      className={`node-hover-card node-hover-card-${placement}`}
      exit={{ opacity: 0, y: placement === "top" ? -4 : 4, scale: 0.96 }}
      id={`hovercard-${task.id}`}
      initial={{ opacity: 0, y: placement === "top" ? 6 : -6, scale: 0.96 }}
      role="tooltip"
      transition={{ duration: 0.16, ease: "easeOut" }}
    >
      <div className="hover-accent-line" />

      {/* 1. LOCKED NODES */}
      {task.status === "locked" && (
        <div className="hover-card-content">
          <div className="hover-header">
            <span className="hover-badge hover-badge-locked">
              <Lock aria-hidden="true" size={12} /> Locked
            </span>
            <span className="hover-key">{task.key.toUpperCase()}</span>
          </div>

          <div className="hover-section">
            <p className="hover-label">Waiting on:</p>
            {waitingOn.length > 0 ? (
              <ul className="hover-dependency-list">
                {waitingOn.map((dep) => (
                  <li key={dep.id} className="hover-dep-item">
                    <span className="hover-dep-title">
                      {dep.key.toUpperCase()} {dep.title}
                    </span>
                    <span className={`hover-status-pill hover-status-${dep.status}`}>
                      {dep.status.replace("_", " ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hover-subtext">Waiting on preceding project tasks to complete.</p>
            )}
          </div>

          <p className="hover-note">Will unlock when all of these are done.</p>
          <p className="hover-footer-notify">
            {formatRole(task.role)} will be notified
          </p>
        </div>
      )}

      {/* 2. READY NODES */}
      {task.status === "ready" && (
        <div className="hover-card-content">
          <div className="hover-header">
            <span className="hover-badge hover-badge-ready">
              <Sparkles aria-hidden="true" size={12} /> Ready to start
            </span>
            <span className="hover-key">{task.key.toUpperCase()}</span>
          </div>

          <div className="hover-section">
            <p className="hover-label">Unlocked by:</p>
            <p className="hover-unlocked-text">
              {unlockedBy.length > 0
                ? unlockedBy.map((n) => `${n.key.toUpperCase()} ${n.title}`).join(", ")
                : "Initial project plan"}
            </p>
          </div>

          <div className="hover-section">
            <p className="hover-label">Role to start:</p>
            <p className="hover-role-text">{formatRole(task.role)}</p>
          </div>

          <div className="hover-section">
            <p className="hover-label">Done criteria:</p>
            <p className="hover-criteria-text">
              {task.done_criteria || "All task objectives verified and functional."}
            </p>
          </div>

          <p className="hover-hint">Click the node for full details.</p>
        </div>
      )}

      {/* 3. IN PROGRESS NODES */}
      {task.status === "in_progress" && (
        <div className="hover-card-content">
          <div className="hover-header">
            <span className="hover-badge hover-badge-progress">
              <Clock aria-hidden="true" size={12} /> In progress
            </span>
            <span className="hover-key">{task.key.toUpperCase()}</span>
          </div>

          <div className="hover-section">
            <p className="hover-label">Role:</p>
            <p className="hover-role-text">{formatRole(task.role)}</p>
          </div>

          <div className="hover-section">
            <p className="hover-label">Active assignee:</p>
            <p className="hover-subtext">
              {task.owner_id ? "demo-user (GitHub)" : `${formatRole(task.role)} team`}
            </p>
          </div>

          <p className="hover-hint">Click to view commits and AI checks.</p>
        </div>
      )}

      {/* 4. DONE NODES */}
      {task.status === "done" && (
        <div className="hover-card-content">
          <div className="hover-header">
            <span className="hover-badge hover-badge-done">
              <Check aria-hidden="true" size={12} /> Done
            </span>
            <span className="hover-key">{task.key.toUpperCase()}</span>
          </div>

          <div className="hover-section">
            <p className="hover-label">Role:</p>
            <p className="hover-role-text">{formatRole(task.role)}</p>
          </div>

          <div className="hover-section">
            <p className="hover-label">Completed by:</p>
            <p className="hover-subtext">
              {task.owner_id ? "demo-user (GitHub)" : `${formatRole(task.role)} team`}
            </p>
          </div>

          <p className="hover-hint">Click to inspect verification report.</p>
        </div>
      )}
    </motion.div>
  );
}
