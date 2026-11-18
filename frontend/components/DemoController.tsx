"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { FastForward, Pause, Play, RotateCcw, Sparkles, X } from "lucide-react";
import { mockNotifications, mockUser } from "@/lib/mocks";
import type { NodeDetail, ProjectTree, TreeEdge, TreeNode } from "@/lib/types";

// Base duration for each of the 6 steps at 1x speed (total ~64 seconds)
const STEP_DURATIONS_MS = [10000, 12000, 12000, 14000, 12000, 8000];

type DemoControllerProps = {
  projectId: number;
  isActive: boolean;
  onClose: () => void;
  onUpdateTree: (tree: ProjectTree) => void;
  onSelectNode: (node: TreeNode, detail: NodeDetail) => void;
};

// Generates the deterministic tree and detail snapshot for a given demo step (0 to 5)
function getDemoStepState(projectId: number, stepIndex: number): {
  nodes: TreeNode[];
  edges: TreeEdge[];
  activeNodeId: number;
  detail: NodeDetail;
  notificationMessage?: string;
  stepNarrative: string;
} {
  const baseNodes: TreeNode[] = [
    {
      id: 1,
      project_id: projectId,
      key: "n1",
      title: "Set up the project foundation",
      description: "Initialize directory structure, shared types, and build scripts.",
      role: "backend",
      done_criteria: "The project runs locally and the team can build on the shared structure.",
      path_hints: ["src"],
      status: stepIndex === 0 ? "ready" : "done",
      owner_id: mockUser.id,
      done_at: stepIndex > 0 ? "2026-11-16T10:00:00Z" : null,
    },
    {
      id: 2,
      project_id: projectId,
      key: "n2",
      title: "Build the welcoming dashboard",
      description: "Create the signed-in project dashboard for the team.",
      role: "frontend",
      done_criteria: "The dashboard shows the user's projects and works on mobile.",
      path_hints: ["frontend"],
      status: stepIndex < 1 ? "locked" : stepIndex === 1 ? "ready" : stepIndex === 2 ? "in_progress" : "done",
      owner_id: mockUser.id,
      done_at: stepIndex >= 3 ? "2026-11-16T12:00:00Z" : null,
    },
    {
      id: 3,
      project_id: projectId,
      key: "n3",
      title: "Connect the project data",
      description: "Connect project screens to the service layer and configure authentication APIs.",
      role: "backend",
      done_criteria: "Project data and Auth API endpoints return valid response contracts.",
      path_hints: ["backend"],
      status: stepIndex < 1 ? "locked" : stepIndex < 3 ? "ready" : stepIndex === 3 ? "in_progress" : "done",
      owner_id: null,
      done_at: stepIndex >= 4 ? "2026-11-16T14:00:00Z" : null,
    },
    {
      id: 4,
      project_id: projectId,
      key: "n4",
      title: "Review access and permissions",
      description: "Check that project access, role-based controls, and security rules are verified.",
      role: "security",
      done_criteria: "Security review passes with zero critical access bypasses.",
      path_hints: ["security"],
      status: stepIndex < 4 ? "locked" : stepIndex === 4 ? "ready" : "done",
      owner_id: null,
      done_at: stepIndex >= 5 ? "2026-11-16T16:00:00Z" : null,
    },
  ];

  // Edges transition: hidden -> dotted (open next step) -> solid (completed dependency)
  const edges: TreeEdge[] = [
    {
      id: 1,
      project_id: projectId,
      from_node: 1,
      to_node: 2,
      state: stepIndex === 0 ? "hidden" : stepIndex === 1 ? "dotted" : "solid",
    },
    {
      id: 2,
      project_id: projectId,
      from_node: 1,
      to_node: 3,
      state: stepIndex === 0 ? "hidden" : stepIndex < 4 ? "dotted" : "solid",
    },
    {
      id: 3,
      project_id: projectId,
      from_node: 2,
      to_node: 4,
      state: stepIndex < 2 ? "hidden" : stepIndex < 4 ? "dotted" : "solid",
    },
    {
      id: 4,
      project_id: projectId,
      from_node: 3,
      to_node: 4,
      state: stepIndex < 3 ? "hidden" : stepIndex === 3 ? "dotted" : "solid",
    },
  ];

  // Which node is focused and described in the side panel
  let activeNodeId = 1;
  let narrative = "Step 1 of 5: Backend starting foundation";
  let notificationMessage: string | undefined;

  if (stepIndex === 0) {
    activeNodeId = 1;
    narrative = "Step 1 of 5: Project foundation ready to start";
  } else if (stepIndex === 1) {
    activeNodeId = 2;
    narrative = "Step 2 of 5: Foundation done — Frontend & Backend unlocked!";
    notificationMessage = "Backend completed 'Set up the project foundation'. Frontend and Backend can start now.";
  } else if (stepIndex === 2) {
    activeNodeId = 2;
    narrative = "Step 3 of 5: Frontend building dashboard (in progress)";
  } else if (stepIndex === 3) {
    activeNodeId = 3;
    narrative = "Step 4 of 5: Frontend finished login page — Auth API ready!";
    // User requested notification string:
    notificationMessage = "Frontend finished the login page. Backend, you can start the Auth API now.";
  } else if (stepIndex === 4) {
    activeNodeId = 4;
    narrative = "Step 5 of 5: Backend data complete — Security audit unlocked!";
    notificationMessage = "Backend connected project data. Security, access review is now unlocked.";
  } else {
    activeNodeId = 4;
    narrative = "Canopy Fully Grown — All branches complete (100%)!";
    notificationMessage = "All branches complete! Your CodeCanopy is fully grown and ready for production.";
  }

  const activeNode = baseNodes.find((n) => n.id === activeNodeId) ?? baseNodes[0];

  const detail: NodeDetail = {
    node: activeNode,
    title: activeNode.title,
    role: activeNode.role,
    status: activeNode.status,
    done_criteria: activeNode.done_criteria,
    owner: {
      id: mockUser.id,
      username: mockUser.githubUsername,
      avatar_url: mockUser.avatar,
    },
    commits: stepIndex >= 2 ? [
      {
        commit_id: 100 + stepIndex,
        sha: "e8b2f90123456789abcdef0123456789abcdef01",
        message: activeNode.id === 2
          ? "feat(frontend): complete login page and dashboard layout"
          : `feat(${activeNode.role}): finalize ${activeNode.title.toLowerCase()}`,
        author_login: mockUser.githubUsername,
        confidence: 0.96,
        method: "path",
      },
    ] : [],
    latest_ai_decision: activeNode.status === "done"
      ? {
          verdict: "done",
          confidence: 0.98,
          reason: "Automated checks, test coverage, and role criteria verified.",
        }
      : activeNode.status === "in_progress"
        ? {
            verdict: "done",
            confidence: 0.78,
            reason: "Code changes appear complete. Waiting for team verification.",
          }
        : null,
  };

  return {
    nodes: baseNodes,
    edges,
    activeNodeId,
    detail,
    notificationMessage,
    stepNarrative: narrative,
  };
}

export function DemoController({
  projectId,
  isActive,
  onClose,
  onUpdateTree,
  onSelectNode,
}: DemoControllerProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 2 | 5>(1);
  const [elapsedInStep, setElapsedInStep] = useState(0);

  const postedNotifications = useRef<Set<number>>(new Set());
  const timerRef = useRef<number | null>(null);

  // Apply the current step to the tree and panel
  const applyStep = useCallback((step: number) => {
    const state = getDemoStepState(projectId, step);
    const doneCount = state.nodes.filter((n) => n.status === "done").length;
    const totalCount = state.nodes.length;

    onUpdateTree({
      project_id: projectId,
      nodes: state.nodes,
      edges: state.edges,
      progress: {
        done: doneCount,
        total: totalCount,
        percentage: Math.round((doneCount / totalCount) * 100),
      },
      last_event_id: Date.now(),
    });

    const activeNode = state.nodes.find((n) => n.id === state.activeNodeId) ?? state.nodes[0];
    onSelectNode(activeNode, state.detail);

    // Push notification once per step
    if (state.notificationMessage && !postedNotifications.current.has(step)) {
      postedNotifications.current.add(step);
      mockNotifications.unshift({
        id: Date.now() + step,
        user_id: mockUser.id,
        project_id: projectId,
        message: state.notificationMessage,
        node_id: state.activeNodeId,
        is_read: false,
        created_at: new Date().toISOString(),
      });
    }
  }, [onSelectNode, onUpdateTree, projectId]);

  // Restart the demo from step 0
  const restart = useCallback(() => {
    postedNotifications.current.clear();
    setStepIndex(0);
    setElapsedInStep(0);
    setIsPlaying(true);
    applyStep(0);
  }, [applyStep]);

  // Initial mount: load step 0
  useEffect(() => {
    if (isActive) {
      restart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // Simulation tick loop
  useEffect(() => {
    if (!isActive || !isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const TICK_INTERVAL_MS = 250;

    timerRef.current = window.setInterval(() => {
      setElapsedInStep((prevElapsed) => {
        const nextElapsed = prevElapsed + TICK_INTERVAL_MS * speed;
        const currentStepTarget = STEP_DURATIONS_MS[stepIndex];

        if (nextElapsed >= currentStepTarget) {
          // Advance to next step if available
          setStepIndex((currentStep) => {
            const nextStep = currentStep + 1;
            if (nextStep < STEP_DURATIONS_MS.length) {
              applyStep(nextStep);
              return nextStep;
            } else {
              // Reached the end: pause at 100%
              setIsPlaying(false);
              return currentStep;
            }
          });
          return 0;
        }

        return nextElapsed;
      });
    }, TICK_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [applyStep, isActive, isPlaying, speed, stepIndex]);

  if (!isActive) return null;

  const currentStepDuration = STEP_DURATIONS_MS[stepIndex];
  const stepPercent = Math.min(100, Math.round((elapsedInStep / currentStepDuration) * 100));
  const currentState = getDemoStepState(projectId, stepIndex);

  return (
    <aside aria-label="Demo simulation controls" className="demo-floating-bar" role="region">
      <div className="demo-bar-left">
        <span className="demo-pill">
          <Sparkles aria-hidden="true" size={13} /> Demo presentation mode
        </span>
        <span className="demo-step-text">{currentState.stepNarrative}</span>
      </div>

      <div className="demo-bar-center">
        {/* Play / Pause */}
        <button
          aria-label={isPlaying ? "Pause demo" : "Play demo"}
          className="demo-control-button demo-play-btn"
          onClick={() => setIsPlaying(!isPlaying)}
          type="button"
        >
          {isPlaying ? <Pause aria-hidden="true" size={15} /> : <Play aria-hidden="true" size={15} />}
          <span>{isPlaying ? "Pause" : "Play"}</span>
        </button>

        {/* Restart */}
        <button
          aria-label="Restart demo"
          className="demo-control-button"
          onClick={restart}
          title="Restart demo from beginning"
          type="button"
        >
          <RotateCcw aria-hidden="true" size={15} />
          <span>Restart</span>
        </button>

        {/* Speed toggle group */}
        <div aria-label="Playback speed" className="demo-speed-group" role="group">
          <FastForward aria-hidden="true" className="speed-icon" size={13} />
          {([1, 2, 5] as const).map((spd) => (
            <button
              aria-pressed={speed === spd}
              className={`speed-option-button${speed === spd ? " speed-active" : ""}`}
              key={spd}
              onClick={() => setSpeed(spd)}
              type="button"
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>

      <div className="demo-bar-right">
        <div aria-hidden="true" className="demo-step-track" title={`Step progress: ${stepPercent}%`}>
          <span style={{ width: `${stepPercent}%` }} />
        </div>
        <button
          aria-label="Exit demo mode"
          className="demo-close-btn"
          onClick={onClose}
          title="Exit demo mode"
          type="button"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>
    </aside>
  );
}
