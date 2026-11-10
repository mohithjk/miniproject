import { NodeDetailResponse, ProjectResponse, TreeResponse } from "./types";

const API_BASE = "/api";

export const MOCK_PROJECT: ProjectResponse = {
  id: 1,
  repo_owner: "cadence-org",
  repo_name: "core-pipeline",
  readme_text: "Cadence Autonomous DAG Execution Engine",
  webhook_secret: "cadence_sec_9941a8b",
  plan_status: "approved",
  status: "active",
  owner_id: 1,
  created_at: "2026-11-10T12:00:00Z",
};

export const MOCK_TREE: TreeResponse = {
  project_id: 1,
  progress: {
    done: 2,
    total: 4,
    percentage: 50.0,
  },
  last_event_id: 18,
  nodes: [
    {
      id: 101,
      project_id: 1,
      key: "n1",
      title: "FastAPI Core & PostgreSQL Models",
      description: "Initialize SQLAlchemy 2.0 schema, asyncpg pool, and initial migration.",
      role: "backend",
      done_criteria: "Database connected and health endpoint returning 200.",
      path_hints: ["backend/app/db.py", "backend/app/models.py"],
      status: "done",
      owner_id: 1,
      done_at: "2026-11-10T14:20:00Z",
    },
    {
      id: 102,
      project_id: 1,
      key: "n2",
      title: "OAuth & Fernet Security Vault",
      description: "HMAC-SHA256 signature verification and AES token encryption at rest.",
      role: "security",
      done_criteria: "Webhook signatures verified via raw request digest.",
      path_hints: ["backend/app/auth.py", "backend/app/routers/webhooks.py"],
      status: "done",
      owner_id: 2,
      done_at: "2026-11-10T16:45:00Z",
    },
    {
      id: 103,
      project_id: 1,
      key: "n3",
      title: "Interactive Dependency DAG UI",
      description: "Visual state diagram representing ready, in-progress, and completed nodes.",
      role: "frontend",
      done_criteria: "Canvas renders nodes with role badges and handles manual confirmation.",
      path_hints: ["frontend/src/components/InteractiveTree.tsx"],
      status: "in_progress",
      owner_id: 3,
      done_at: null,
    },
    {
      id: 104,
      project_id: 1,
      key: "n4",
      title: "Containerized Worker & SKIP LOCKED Queue",
      description: "Background worker loop consuming jobs with PostgreSQL concurrency safety.",
      role: "devops",
      done_criteria: "Docker Compose deploys api, worker, and postgres with auto migrations.",
      path_hints: ["backend/app/worker.py", "backend/docker-compose.yml"],
      status: "ready",
      owner_id: null,
      done_at: null,
    },
  ],
  edges: [
    { id: 1, project_id: 1, from_node: 101, to_node: 102, state: "solid" },
    { id: 2, project_id: 1, from_node: 101, to_node: 103, state: "solid" },
    { id: 3, project_id: 1, from_node: 102, to_node: 104, state: "dotted" },
    { id: 4, project_id: 1, from_node: 103, to_node: 104, state: "dotted" },
  ],
};

export const MOCK_NODE_DETAILS: Record<number, NodeDetailResponse> = {
  101: {
    node: MOCK_TREE.nodes[0],
    title: MOCK_TREE.nodes[0].title,
    role: MOCK_TREE.nodes[0].role,
    status: "done",
    done_criteria: MOCK_TREE.nodes[0].done_criteria,
    owner: { id: 1, username: "alex-backend" },
    commits: [
      {
        commit_id: 1,
        sha: "a9f82d1c740",
        message: "feat(backend): complete database models and alembic setup closes n1",
        author_login: "alex-backend",
        confidence: 1.0,
        method: "explicit_tag",
      },
    ],
    latest_ai_decision: {
      verdict: "done",
      confidence: 0.98,
      reason: "Health check passing, database schema verified in PostgreSQL 16.",
    },
  },
  102: {
    node: MOCK_TREE.nodes[1],
    title: MOCK_TREE.nodes[1].title,
    role: MOCK_TREE.nodes[1].role,
    status: "done",
    done_criteria: MOCK_TREE.nodes[1].done_criteria,
    owner: { id: 2, username: "elena-sec" },
    commits: [
      {
        commit_id: 2,
        sha: "882b41fc90e",
        message: "sec: add Fernet encryption at rest and raw body HMAC checks [n2]",
        author_login: "elena-sec",
        confidence: 1.0,
        method: "explicit_tag",
      },
    ],
    latest_ai_decision: {
      verdict: "done",
      confidence: 0.95,
      reason: "Raw byte digest verified against GitHub webhook standard.",
    },
  },
  103: {
    node: MOCK_TREE.nodes[2],
    title: MOCK_TREE.nodes[2].title,
    role: MOCK_TREE.nodes[2].role,
    status: "in_progress",
    done_criteria: MOCK_TREE.nodes[2].done_criteria,
    owner: { id: 3, username: "sarah-fe" },
    commits: [
      {
        commit_id: 3,
        sha: "3c299fa410b",
        message: "feat(frontend): scaffold DAG tree canvas with role borders",
        author_login: "sarah-fe",
        confidence: 0.85,
        method: "path_hint",
      },
    ],
    latest_ai_decision: {
      verdict: "not_done",
      confidence: 0.65,
      reason: "Matched commit changes frontend files, awaiting PR merge or manual sign-off.",
    },
  },
  104: {
    node: MOCK_TREE.nodes[3],
    title: MOCK_TREE.nodes[3].title,
    role: MOCK_TREE.nodes[3].role,
    status: "ready",
    done_criteria: MOCK_TREE.nodes[3].done_criteria,
    owner: null,
    commits: [],
    latest_ai_decision: null,
  },
};

export async function getProjectTree(projectId: number): Promise<TreeResponse> {
  try {
    const res = await fetch(`${API_BASE}/projects/${projectId}/tree`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return MOCK_TREE;
  }
}

export async function getNodeDetail(nodeId: number): Promise<NodeDetailResponse> {
  try {
    const res = await fetch(`${API_BASE}/nodes/${nodeId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return MOCK_NODE_DETAILS[nodeId] || MOCK_NODE_DETAILS[103];
  }
}

export async function confirmNodeCompletion(nodeId: number): Promise<{ status: string }> {
  try {
    const res = await fetch(`${API_BASE}/nodes/${nodeId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch {
    // Optimistic fallback for offline demo
    return { status: "confirmed" };
  }
}
