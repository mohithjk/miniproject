import type {
  InviteType,
  Member,
  NodeDetail,
  NotificationItem,
  Plan,
  Project,
  ProjectInvite,
  ProjectTree,
  ReadmeSummary,
  Role,
  ShareLink,
  SummaryVersion,
  TreeEdge,
  TreeNode,
  ViewerTree,
} from "@/lib/types";

const demoAvatarSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="48" fill="#B9E5EC"/>
  <circle cx="48" cy="37" r="18" fill="#3D231E"/>
  <path d="M17 91c3-20 15-31 31-31s28 11 31 31" fill="#3D231E"/>
  <circle cx="73" cy="23" r="8" fill="#FFD33D"/>
</svg>`;

export const mockUser = {
  id: 1,
  name: "Demo User",
  avatar: `data:image/svg+xml,${encodeURIComponent(demoAvatarSvg)}`,
  githubUsername: "demo-user",
};

export const mockProjects: Project[] = [
  {
    id: 1,
    owner_id: 1,
    repo_owner: "demo-user",
    repo_name: "codecanopy-garden",
    plan_status: "approved",
    status: "active",
    summary_confirmed: true,
    summary_status: "confirmed",
    confirmed_by: "demo-user",
    confirmed_at: "2026-11-10T10:05:00Z",
    created_at: "2026-11-10T10:00:00Z",
  },
  {
    id: 2,
    owner_id: 1,
    repo_owner: "demo-user",
    repo_name: "seedling-api",
    plan_status: "approved",
    status: "active",
    summary_confirmed: true,
    summary_status: "confirmed",
    confirmed_by: "demo-user",
    confirmed_at: "2026-11-12T10:05:00Z",
    created_at: "2026-11-12T10:00:00Z",
  },
  {
    id: 3,
    owner_id: 1,
    repo_owner: "demo-user",
    repo_name: "bloom-service",
    plan_status: "draft",
    status: "pending_summary",
    summary_confirmed: false,
    summary_status: "pending_confirmation",
    confirmed_by: null,
    confirmed_at: null,
    created_at: "2026-11-19T06:00:00Z",
  },
];

export const mockNodes: TreeNode[] = [
  {
    id: 1,
    project_id: 1,
    key: "n1",
    title: "Set up the project foundation",
    description: "Create the initial app structure and shared project conventions.",
    role: "backend",
    done_criteria: "The project runs locally and the team can build on the shared structure.",
    path_hints: ["src"],
    status: "done",
    owner_id: 1,
    done_at: "2026-11-11T12:00:00Z",
  },
  {
    id: 2,
    project_id: 1,
    key: "n2",
    title: "Build the welcoming dashboard",
    description: "Create the signed-in project dashboard for the team.",
    role: "frontend",
    done_criteria: "The dashboard shows the user's projects and works on mobile.",
    path_hints: ["frontend"],
    status: "in_progress",
    owner_id: 1,
    done_at: null,
  },
  {
    id: 3,
    project_id: 1,
    key: "n3",
    title: "Connect the project data",
    description: "Connect project screens to the service layer.",
    role: "backend",
    done_criteria: "Project data is available to the dashboard.",
    path_hints: ["backend"],
    status: "ready",
    owner_id: null,
    done_at: null,
  },
  {
    id: 4,
    project_id: 1,
    key: "n4",
    title: "Review access and permissions",
    description: "Check that project access is handled consistently.",
    role: "security",
    done_criteria: "The team can verify access rules for shared projects.",
    path_hints: ["security"],
    status: "locked",
    owner_id: null,
    done_at: null,
  },
];

export const mockEdges: TreeEdge[] = [
  { id: 1, project_id: 1, from_node: 1, to_node: 2, state: "solid" },
  { id: 2, project_id: 1, from_node: 1, to_node: 3, state: "dotted" },
  { id: 3, project_id: 1, from_node: 2, to_node: 4, state: "dotted" },
  { id: 4, project_id: 1, from_node: 3, to_node: 4, state: "hidden" },
];

export const mockNotifications: NotificationItem[] = [
  {
    id: 1,
    user_id: 1,
    project_id: 1,
    message: "Frontend started the welcoming dashboard. Backend, the project data work is ready to begin.",
    node_id: 3,
    is_read: false,
    created_at: "2026-11-16T14:30:00Z",
  },
  {
    id: 2,
    user_id: 1,
    project_id: 1,
    message: "The project foundation is complete. Nice work, team!",
    node_id: 1,
    is_read: true,
    created_at: "2026-11-15T09:10:00Z",
  },
];

export const mockMembers: Member[] = [
  { id: 1, project_id: 1, user_id: 1, role: "frontend", username: "demo-user" },
  { id: 2, project_id: 1, user_id: 2, role: "backend", username: "teammate-dev" },
];

export const mockShareLinks: ShareLink[] = [
  {
    id: 1,
    project_id: 1,
    token: "demo-share-token",
    revoked: false,
    created_at: "2026-11-15T12:00:00Z",
    share_url: "/view/demo-share-token",
  },
];

const mockCommits = [
  {
    commit_id: 1,
    sha: "a1b2c3d4e5f67890123456789abcdef012345678",
    message: "feat(frontend): add the first dashboard view",
    author_login: "demo-user",
    confidence: 0.92,
    method: "path",
  },
];

// In-memory mutable store for projects, nodes, and edges
export const projectNodesStore: Record<number, TreeNode[]> = {
  1: mockNodes.map((n) => ({ ...n })),
  2: mockNodes.map((n) => ({ ...n, id: n.id + 10, project_id: 2 })),
};

export const projectEdgesStore: Record<number, TreeEdge[]> = {
  1: mockEdges.map((e) => ({ ...e })),
  2: mockEdges.map((e) => ({ ...e, id: e.id + 10, project_id: 2, from_node: e.from_node + 10, to_node: e.to_node + 10 })),
};

export function getMockProjectNodes(projectId: number): TreeNode[] {
  if (!projectNodesStore[projectId]) {
    const idOffset = (projectId - 1) * 10;
    projectNodesStore[projectId] = mockNodes.map((node) => ({
      ...node,
      id: node.id + idOffset,
      project_id: projectId,
      owner_id: node.owner_id === null ? null : mockUser.id,
    }));
  }
  return projectNodesStore[projectId];
}

export function getMockProjectEdges(projectId: number): TreeEdge[] {
  if (!projectEdgesStore[projectId]) {
    const idOffset = (projectId - 1) * 10;
    projectEdgesStore[projectId] = mockEdges.map((edge) => ({
      ...edge,
      id: edge.id + idOffset * 10,
      project_id: projectId,
      from_node: edge.from_node + idOffset,
      to_node: edge.to_node + idOffset,
    }));
  }
  return projectEdgesStore[projectId];
}

export function getMockProjectTree(projectId: number): ProjectTree {
  const nodes = getMockProjectNodes(projectId);
  const edges = getMockProjectEdges(projectId);
  const done = nodes.filter((node) => node.status === "done").length;
  return {
    project_id: projectId,
    nodes,
    edges,
    progress: {
      done,
      total: nodes.length,
      percentage: nodes.length ? Math.round((done / nodes.length) * 1000) / 10 : 0,
    },
    last_event_id: 1,
  };
}

export function getMockPlan(projectId: number): Plan {
  const nodes = getMockProjectNodes(projectId);
  const edges = getMockProjectEdges(projectId);
  const idToKey = new Map(nodes.map((node) => [node.id, node.key]));
  return {
    nodes: nodes.map((node) => ({
      key: node.key,
      title: node.title,
      description: node.description,
      role: node.role,
      done_criteria: node.done_criteria,
      path_hints: node.path_hints,
      depends_on: edges
        .filter((edge) => edge.to_node === node.id)
        .map((edge) => idToKey.get(edge.from_node))
        .filter((key): key is string => key !== undefined),
    })),
  };
}

export function saveMockPlan(projectId: number, plan: Plan): Plan {
  const currentNodes = getMockProjectNodes(projectId);
  const baseId = (projectId - 1) * 10;

  const keyToId = new Map<string, number>();
  const updatedNodes: TreeNode[] = plan.nodes.map((pNode, index) => {
    const existing = currentNodes.find((n) => n.key === pNode.key);
    const id = existing ? existing.id : baseId + index + 1;
    keyToId.set(pNode.key, id);
    return {
      id,
      project_id: projectId,
      key: pNode.key,
      title: pNode.title,
      description: pNode.description,
      role: pNode.role,
      done_criteria: pNode.done_criteria,
      path_hints: pNode.path_hints || [],
      status: existing ? existing.status : (index === 0 ? "ready" : "locked"),
      owner_id: existing ? existing.owner_id : mockUser.id,
      done_at: existing ? existing.done_at : null,
    };
  });

  let edgeId = projectId * 100;
  const updatedEdges: TreeEdge[] = [];
  plan.nodes.forEach((pNode) => {
    const toId = keyToId.get(pNode.key);
    if (!toId) return;
    pNode.depends_on.forEach((depKey) => {
      const fromId = keyToId.get(depKey);
      if (fromId) {
        edgeId += 1;
        const fromNode = updatedNodes.find((n) => n.id === fromId);
        const state = fromNode?.status === "done" ? "solid" : "dotted";
        updatedEdges.push({
          id: edgeId,
          project_id: projectId,
          from_node: fromId,
          to_node: toId,
          state,
        });
      }
    });
  });

  projectNodesStore[projectId] = updatedNodes;
  projectEdgesStore[projectId] = updatedEdges;
  return plan;
}

export function confirmMockNode(nodeId: number) {
  for (const [pIdStr, nodes] of Object.entries(projectNodesStore)) {
    const projectId = Number(pIdStr);
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      node.status = "done";
      node.done_at = new Date().toISOString();

      const edges = getMockProjectEdges(projectId);
      edges.forEach((edge) => {
        if (edge.from_node === nodeId) {
          edge.state = "solid";
          const target = nodes.find((n) => n.id === edge.to_node);
          if (target && target.status === "locked") {
            const incomingEdges = edges.filter((e) => e.to_node === target.id);
            const allIncomingDone = incomingEdges.every((e) => {
              const src = nodes.find((n) => n.id === e.from_node);
              return src?.status === "done";
            });
            if (allIncomingDone) {
              target.status = "ready";
            }
          }
        }
      });

      const newNotif: NotificationItem = {
        id: Math.max(0, ...mockNotifications.map((n) => n.id)) + 1,
        user_id: mockUser.id,
        project_id: projectId,
        message: `${node.role.replace("_", " ")} confirmed "${node.title}". Next work items are unlocked!`,
        node_id: node.id,
        is_read: false,
        created_at: new Date().toISOString(),
      };
      mockNotifications.unshift(newNotif);

      return { status: "confirmed", node_id: nodeId, node_status: "done" };
    }
  }
  return { status: "confirmed", node_id: nodeId, node_status: "done" };
}

export function getMockNodeDetail(nodeId: number): NodeDetail | undefined {
  for (const [, nodes] of Object.entries(projectNodesStore)) {
    const node = nodes.find((item) => item.id === nodeId);
    if (node) {
      const isDone = node.status === "done";
      const hasAiVerdict = node.status === "in_progress" || isDone;
      return {
        node,
        title: node.title,
        role: node.role,
        status: node.status,
        done_criteria: node.done_criteria,
        owner: node.owner_id === null
          ? null
          : { id: mockUser.id, username: mockUser.githubUsername, avatar_url: mockUser.avatar },
        commits: (node.key === "n2" || isDone) ? mockCommits : [],
        latest_ai_decision: hasAiVerdict
          ? {
              verdict: "done",
              confidence: isDone ? 0.98 : 0.78,
              reason: isDone
                ? "All criteria verified through automated checks and user confirmation."
                : "The changes appear to match the task criteria, but need team confirmation.",
            }
          : null,
      };
    }
  }
  return undefined;
}

export function addMockMember(projectId: number, role: Role): Member {
  const existing = mockMembers.find((member) => member.project_id === projectId && member.user_id === mockUser.id);
  if (existing) {
    existing.role = role;
    return existing;
  }
  const member = {
    id: Math.max(0, ...mockMembers.map((item) => item.id)) + 1,
    project_id: projectId,
    user_id: mockUser.id,
    role,
    username: mockUser.githubUsername,
  };
  mockMembers.push(member);
  return member;
}

export function getMockViewerTree(projectId: number): ViewerTree | undefined {
  const project = mockProjects.find((item) => item.id === projectId);
  if (!project) return undefined;
  const tree = getMockProjectTree(projectId);
  return {
    project: {
      id: project.id,
      repo_owner: project.repo_owner,
      repo_name: project.repo_name,
      plan_status: project.plan_status,
      status: project.status,
    },
    nodes: tree.nodes,
    edges: tree.edges,
  };
}

export const mockRawReadme = `# Bloom Service

Collaborative project tree planner and commit tracking platform for student developer teams.

## Problem Statement
Student developer teams often struggle with invisible blockers, unequal work distribution, and difficulty visualizing project progress across branches. Traditional issue trackers feel disconnected from active Git commits. CodeCanopy turns git branches and tasks into a living visual garden that updates in real time.

## Key Features
- Interactive DAG work-tree with left-to-right milestone progression
- Autonomous AI verification of git commits against task acceptance criteria
- Role-based task assignment across frontend, backend, AI/ML, security, and devops
- Real-time task state transitions (Locked, Ready, In Progress, Done)
- Visual legend filtering and in-progress heartbeat pulse rings
- Shareable read-only viewer links for external mentors and evaluators
- Automated README parsing and collaborative plan review before kickoff

## Tech Stack
- Frontend: Next.js 14, React 18, TypeScript, Tailwind CSS, ReactFlow
- Backend: FastAPI, Python 3.11, PostgreSQL, SQLAlchemy
- AI & Testing: Google Gemini API, Docker, GitHub Actions, Pytest

## Architecture & Work Breakdown
- Frontend: Responsive canvas, animated rope, custom node cards, and modal hovercards
- Backend: REST endpoints, webhook listener for commit tracking, and database migrations
- AI/ML: Prompt engineering pipeline to parse README markdown and evaluate diffs
- Security: GitHub OAuth token exchange, role-based access checks, and secret sanitization
- DevOps: Containerized compose setup and automated continuous integration pipeline

## Notes & Assumptions
- GitHub OAuth handles student and mentor logins.
- Default database runs on PostgreSQL container.`;

function createDefaultSummary(projectId: number, repoName = "bloom-service"): ReadmeSummary {
  return {
    id: projectId,
    project_id: projectId,
    version: 1,
    project_name: repoName,
    purpose: "Collaborative project tree planner and commit tracking platform for student developer teams.",
    problem_solved:
      "Student developer teams often struggle with invisible blockers, unequal work distribution, and difficulty visualizing project progress across branches. Traditional issue trackers feel disconnected from active Git commits. CodeCanopy turns git branches and tasks into a living visual garden that updates in real time.",
    features: [
      "Interactive DAG work-tree with left-to-right milestone progression",
      "Autonomous AI verification of git commits against task acceptance criteria",
      "Role-based task assignment across frontend, backend, AI/ML, security, and devops",
      "Real-time task state transitions (Locked, Ready, In Progress, Done)",
      "Visual legend filtering and in-progress heartbeat pulse rings",
      "Shareable read-only viewer links for external mentors and evaluators",
      "Automated README parsing and collaborative plan review before kickoff",
    ],
    tech_stack: {
      frameworks: ["Next.js 14", "React 18", "FastAPI"],
      languages: ["TypeScript", "Python 3.11", "CSS3 / Tailwind"],
      tools: ["ReactFlow", "Dagre", "GitHub OAuth", "Docker", "Pytest"],
      databases: ["PostgreSQL", "SQLAlchemy"],
    },
    work_by_role: {
      frontend: [
        "Design and build interactive horizontal canvas with ReactFlow and custom node cards",
        "Implement status legend highlighting with dimming, pulsing borders, and responsive controls",
        "Develop multi-step onboarding wizard: Connect, Summary Review, Plan Review, and Team Invites",
      ],
      backend: [
        "Create REST API endpoints for project registration, README extraction, and plan approval",
        "Implement GitHub webhook listener for real-time commit ingestion and branch matching",
        "Set up PostgreSQL database schema with migrations and session management",
      ],
      ai_ml: [
        "Develop Gemini API prompt pipeline to parse README markdown into structured project nodes",
        "Build commit evaluation agent to verify diffs against node done criteria",
      ],
      security: [
        "Audit GitHub OAuth token exchange and session cookie encryption",
        "Implement role-based permissions separating student collaborators from mentor view-only access",
        "Sanitize user inputs and mask API keys / tokens extracted from repository files",
      ],
      devops: [
        "Configure containerized local dev environment with docker-compose",
        "Set up CI/CD GitHub Actions workflow for linting, type checks, and automated tests",
      ],
    },
    uncertain_items: [
      {
        id: "u1",
        question: "The README does not explicitly state how user authentication will be handled.",
        assumption: "We assumed GitHub OAuth with role selection (Student vs Mentor).",
        user_answer: "Yes, GitHub OAuth for all team members.",
      },
      {
        id: "u2",
        question: "The database setup instructions mention both SQLite and PostgreSQL.",
        assumption: "We assumed PostgreSQL for production deployment and SQLite/memory for testing.",
        user_answer: "",
      },
    ],
    confidence: "medium",
    confidence_reason:
      "Medium confidence: README has clear architectural objectives and feature lists, but database migrations and deployment targets were partially unspecified.",
    readme_raw: mockRawReadme,
    readme_last_updated: "18 Nov, 2026",
    is_truncated: false,
    is_empty: false,
    detected_language: "English",
    created_at: new Date().toISOString(),
  };
}

export const mockSummaries: Record<number, ReadmeSummary> = {
  1: createDefaultSummary(1, "codecanopy-garden"),
  2: createDefaultSummary(2, "seedling-api"),
  3: createDefaultSummary(3, "bloom-service"),
};

export const mockSummaryVersions: Record<number, SummaryVersion[]> = {
  1: [{ version: 1, created_at: "2026-11-10T10:02:00Z", summary: mockSummaries[1] }],
  2: [{ version: 1, created_at: "2026-11-12T10:02:00Z", summary: mockSummaries[2] }],
  3: [{ version: 1, created_at: "2026-11-19T06:01:00Z", summary: mockSummaries[3] }],
};

export function getMockSummary(projectId: number): ReadmeSummary {
  if (!mockSummaries[projectId]) {
    const project = mockProjects.find((p) => p.id === projectId);
    mockSummaries[projectId] = createDefaultSummary(projectId, project?.repo_name || "new-project");
    mockSummaryVersions[projectId] = [
      { version: 1, created_at: new Date().toISOString(), summary: mockSummaries[projectId] },
    ];
  }
  return mockSummaries[projectId];
}

export function getMockSummaryVersions(projectId: number): SummaryVersion[] {
  if (!mockSummaryVersions[projectId]) {
    getMockSummary(projectId);
  }
  return mockSummaryVersions[projectId] || [];
}

export function updateMockSummary(projectId: number, edits: Partial<ReadmeSummary>): ReadmeSummary {
  const current = getMockSummary(projectId);
  const updated: ReadmeSummary = {
    ...current,
    ...edits,
    edited_by_user: true,
    edited_sections: {
      ...(current.edited_sections || {}),
      ...(edits.edited_sections || {}),
    },
  };
  mockSummaries[projectId] = updated;
  return updated;
}

export function regenerateMockSummary(projectId: number, notes: string): ReadmeSummary {
  const current = getMockSummary(projectId);
  const nextVersion = current.version + 1;
  const noteSnippet = notes.trim().slice(0, 60);

  const updated: ReadmeSummary = {
    ...current,
    version: nextVersion,
    purpose: notes.trim()
      ? `${current.purpose} (Refined with user notes: "${noteSnippet}...")`
      : current.purpose,
    problem_solved: notes.trim()
      ? `${current.problem_solved} Specifically tailored to: ${notes.trim()}.`
      : current.problem_solved,
    confidence: "high",
    confidence_reason: notes.trim()
      ? "High confidence: Re-evaluated with user notes incorporated."
      : current.confidence_reason,
    created_at: new Date().toISOString(),
  };

  mockSummaries[projectId] = updated;
  if (!mockSummaryVersions[projectId]) {
    mockSummaryVersions[projectId] = [];
  }
  mockSummaryVersions[projectId].unshift({
    version: nextVersion,
    created_at: new Date().toISOString(),
    summary: updated,
    notes,
  });

  return updated;
}

export function confirmMockSummary(projectId: number, username = "demo-user") {
  const project = mockProjects.find((p) => p.id === projectId);
  const now = new Date().toISOString();
  if (project) {
    project.summary_confirmed = true;
    project.summary_status = "confirmed";
    project.confirmed_by = username;
    project.confirmed_at = now;
  }
  return {
    project_id: projectId,
    summary_status: "confirmed",
    confirmed_by: username,
    confirmed_at: now,
  };
}

// ---------------------------------------------------------------------------
// Mock Invites Store & Functions
// ---------------------------------------------------------------------------

export const mockInvites: ProjectInvite[] = [
  {
    id: 1,
    project_id: 1,
    type: "username",
    github_username: "alex-chen",
    role: "devops",
    token: "mock-token-123",
    status: "pending",
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 5 * 86400 * 1000).toISOString(),
    max_uses: 1,
    uses_count: 0,
    invited_by_username: "demo-user",
    last_sent_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    id: 2,
    project_id: 3,
    type: "username",
    github_username: "sam-taylor",
    role: "ai_ml",
    token: "mock-token-456",
    status: "pending",
    created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
    max_uses: 1,
    uses_count: 0,
    invited_by_username: "demo-user",
    last_sent_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  },
];

export function listMockInvites(projectId: number): ProjectInvite[] {
  return mockInvites.filter((invite) => invite.project_id === projectId);
}

export function createMockInvite(
  projectId: number,
  params: {
    type: InviteType;
    githubUsername?: string;
    role?: Role | null;
    expiresIn?: string;
    maxUses?: number;
  }
): ProjectInvite {
  let durationMs = 7 * 86400 * 1000;
  if (params.expiresIn === "24h") durationMs = 24 * 3600 * 1000;
  else if (params.expiresIn === "30d") durationMs = 30 * 86400 * 1000;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMs);

  const cleanUsername = params.githubUsername
    ? params.githubUsername.replace(/^@/, "").trim()
    : null;

  const token =
    params.type === "mentor"
      ? `mentor-invite-${Math.random().toString(36).slice(2, 10)}`
      : params.type === "username"
        ? `invite-user-${cleanUsername || "dev"}-${Math.random().toString(36).slice(2, 8)}`
        : `invite-link-${Math.random().toString(36).slice(2, 10)}`;

  const newInvite: ProjectInvite = {
    id: Math.max(0, ...mockInvites.map((i) => i.id)) + 1,
    project_id: projectId,
    type: params.type,
    github_username: cleanUsername,
    role: params.role || null,
    token,
    status: "pending",
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    max_uses: params.type === "username" ? 1 : params.maxUses || 5,
    uses_count: 0,
    invited_by_username: mockUser.githubUsername,
    last_sent_at: now.toISOString(),
  };

  mockInvites.unshift(newInvite);
  return newInvite;
}

export function resendMockInvite(id: number): ProjectInvite {
  const target = mockInvites.find((i) => i.id === id);
  if (!target) {
    throw new Error("Invite not found.");
  }
  target.last_sent_at = new Date().toISOString();
  return target;
}

export function revokeMockInvite(id: number): ProjectInvite {
  const target = mockInvites.find((i) => i.id === id);
  if (!target) {
    throw new Error("Invite not found.");
  }
  target.status = "revoked";
  return target;
}

export function getMockInvite(token: string): {
  invite: ProjectInvite;
  project: Project;
  invited_by: string;
} {
  const invite = mockInvites.find((i) => i.token === token);
  if (!invite) {
    // Check if token matches standard demo token
    if (token === "mock-token-123" || token === "demo-token") {
      const demoInvite: ProjectInvite = {
        id: 99,
        project_id: 1,
        type: "link",
        github_username: null,
        role: "devops",
        token: "mock-token-123",
        status: "pending",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
        max_uses: 5,
        uses_count: 0,
        invited_by_username: "demo-user",
        last_sent_at: new Date().toISOString(),
      };
      const project = mockProjects.find((p) => p.id === 1) || mockProjects[0];
      return { invite: demoInvite, project, invited_by: demoInvite.invited_by_username };
    }
    throw new Error("Invite link not found or expired.");
  }

  const project = mockProjects.find((p) => p.id === invite.project_id);
  if (!project) {
    throw new Error("Project not found.");
  }

  return {
    invite,
    project,
    invited_by: invite.invited_by_username,
  };
}

export function acceptMockInvite(
  token: string,
  chosenRole?: Role,
  currentUsername?: string
): { project: Project; member: Member; is_mentor?: boolean } {
  const { invite, project } = getMockInvite(token);

  if (invite.status === "revoked") {
    throw new Error("This invite link has been revoked.");
  }
  if (invite.status === "expired" || new Date() > new Date(invite.expires_at)) {
    throw new Error("This invite link has expired. Ask your team for a new link.");
  }
  if (invite.max_uses && (invite.uses_count || 0) >= invite.max_uses) {
    throw new Error("This invite link has reached its maximum number of uses.");
  }

  const existingMembers = mockMembers.filter((m) => m.project_id === invite.project_id);
  if (existingMembers.length >= 8) {
    throw new Error("This project has reached its maximum of 8 members.");
  }

  const username = currentUsername || (invite.github_username ?? "alex-chen");

  if (invite.github_username && currentUsername && invite.github_username.toLowerCase() !== currentUsername.toLowerCase()) {
    throw new Error(`This invite was sent to @${invite.github_username}. Please sign in with that account.`);
  }

  const alreadyMember = existingMembers.find(
    (m) => m.username?.toLowerCase() === username.toLowerCase()
  );
  if (alreadyMember) {
    throw new Error("You're already in this project.");
  }

  const finalRole = chosenRole || invite.role || "frontend";

  const newMember: Member = {
    id: Math.max(0, ...mockMembers.map((m) => m.id)) + 1,
    project_id: invite.project_id,
    user_id: Math.max(0, ...mockMembers.map((m) => m.user_id)) + 1,
    role: finalRole,
    username,
  };
  mockMembers.push(newMember);

  invite.uses_count = (invite.uses_count || 0) + 1;
  if (invite.type === "username" || invite.uses_count >= (invite.max_uses || 1)) {
    invite.status = "accepted";
  }

  return {
    project,
    member: newMember,
    is_mentor: invite.type === "mentor",
  };
}

export function removeMockMember(projectId: number, userId: number): { success: boolean } {
  const project = mockProjects.find((p) => p.id === projectId);
  if (project?.owner_id === userId) {
    throw new Error("The project owner cannot be removed.");
  }
  const idx = mockMembers.findIndex((m) => m.project_id === projectId && m.user_id === userId);
  if (idx !== -1) {
    mockMembers.splice(idx, 1);
    return { success: true };
  }
  throw new Error("Member not found in this project.");
}
