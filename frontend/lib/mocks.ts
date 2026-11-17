import type {
  Member,
  NodeDetail,
  NotificationItem,
  Plan,
  Project,
  ProjectTree,
  Role,
  ShareLink,
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
    created_at: "2026-11-10T10:00:00Z",
  },
  {
    id: 2,
    owner_id: 1,
    repo_owner: "demo-user",
    repo_name: "seedling-api",
    plan_status: "approved",
    status: "active",
    created_at: "2026-11-12T10:00:00Z",
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
  { id: 2, project_id: 1, from_node: 1, to_node: 3, state: "solid" },
  { id: 3, project_id: 1, from_node: 2, to_node: 4, state: "hidden" },
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

export const mockShareLinks: ShareLink[] = [];

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

export function getMockProjectNodes(projectId: number) {
  const idOffset = (projectId - 1) * 10;
  return mockNodes.map((node) => ({
    ...node,
    id: node.id + idOffset,
    project_id: projectId,
    owner_id: node.owner_id === null ? null : mockUser.id,
  }));
}

export function getMockProjectEdges(projectId: number) {
  const idOffset = (projectId - 1) * 10;
  return mockEdges.map((edge) => ({
    ...edge,
    id: edge.id + idOffset * 10,
    project_id: projectId,
    from_node: edge.from_node + idOffset,
    to_node: edge.to_node + idOffset,
  }));
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

export function getMockNodeDetail(nodeId: number): NodeDetail | undefined {
  const projectId = Math.floor((nodeId - 1) / 10) + 1;
  const node = getMockProjectNodes(projectId).find((item) => item.id === nodeId);
  if (!node) return undefined;
  return {
    node,
    title: node.title,
    role: node.role,
    status: node.status,
    done_criteria: node.done_criteria,
    owner: node.owner_id === null
      ? null
      : { id: mockUser.id, username: mockUser.githubUsername, avatar_url: mockUser.avatar },
    commits: node.key === "n2" ? mockCommits : [],
    latest_ai_decision: node.key === "n2"
      ? { verdict: "done", confidence: 0.78, reason: "The dashboard changes appear to match the task criteria." }
      : null,
  };
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
