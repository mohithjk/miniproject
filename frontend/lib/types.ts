export type User = {
  id: number;
  github_id: number;
  username: string;
  avatar_url: string | null;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

// Keep the project type limited to fields the dashboard actually displays.
export type Project = {
  id: number;
  owner_id?: number;
  repo_owner: string;
  repo_name: string;
  plan_status: string;
  status: string;
  created_at: string;
  summary_confirmed?: boolean;
  summary_status?: "pending_confirmation" | "confirmed" | "out_of_date";
  confirmed_by?: string | null;
  confirmed_at?: string | null;
};

export type SummaryConfidence = "high" | "medium" | "low";

export type RoleWorkItems = {
  frontend: string[];
  backend: string[];
  ai_ml: string[];
  security: string[];
  devops: string[];
};

export type UncertainItem = {
  id: string;
  question: string;
  assumption: string;
  user_answer?: string;
};

export type ReadmeSummary = {
  id: number;
  project_id: number;
  version: number;
  project_name: string;
  purpose: string;
  problem_solved: string;
  features: string[];
  tech_stack: {
    languages: string[];
    frameworks: string[];
    tools: string[];
    databases?: string[];
  };
  work_by_role: RoleWorkItems;
  uncertain_items: UncertainItem[];
  confidence: SummaryConfidence;
  confidence_reason: string;
  readme_raw?: string;
  readme_last_updated?: string;
  is_truncated?: boolean;
  is_empty?: boolean;
  detected_language?: string;
  edited_by_user?: boolean;
  edited_sections?: Record<string, boolean>;
  created_at: string;
};

export type SummaryVersion = {
  version: number;
  created_at: string;
  summary: ReadmeSummary;
  notes?: string;
};

export type InviteType = "username" | "link" | "mentor";

export type ProjectInvite = {
  id: number;
  project_id: number;
  type: InviteType;
  github_username?: string | null;
  role?: Role | null;
  token: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  created_at: string;
  expires_at: string;
  max_uses?: number;
  uses_count?: number;
  invited_by_username: string;
  avatar_url?: string | null;
  last_sent_at?: string;
};

export type Role = "frontend" | "backend" | "ai_ml" | "security" | "devops";

export type PlanNode = {
  key: string;
  title: string;
  description: string;
  role: Role;
  done_criteria: string;
  path_hints: string[];
  depends_on: string[];
};

export type Plan = {
  nodes: PlanNode[];
};

export type Member = {
  id: number;
  project_id: number;
  user_id: number;
  role: Role;
  username: string | null;
};

export type TreeNode = {
  id: number;
  project_id: number;
  key: string;
  title: string;
  description: string;
  role: Role;
  done_criteria: string;
  path_hints: string[];
  status: "locked" | "ready" | "in_progress" | "done";
  owner_id: number | null;
  done_at: string | null;
};

export type TreeEdge = {
  id: number;
  project_id: number;
  from_node: number;
  to_node: number;
  state: "hidden" | "dotted" | "solid";
};

export type ProjectTree = {
  project_id: number;
  nodes: TreeNode[];
  edges: TreeEdge[];
  progress: {
    done: number;
    total: number;
    percentage: number;
  };
  last_event_id: number;
};

export type NodeDetail = {
  node: TreeNode;
  title: string;
  role: Role;
  status: TreeNode["status"];
  done_criteria: string;
  owner: {
    id: number;
    username: string;
    avatar_url: string | null;
  } | null;
  commits: {
    commit_id: number;
    sha: string;
    message: string;
    author_login: string | null;
    confidence: number;
    method: string;
  }[];
  latest_ai_decision: {
    verdict: string;
    confidence: number;
    reason: string;
  } | null;
};

export type NotificationItem = {
  id: number;
  user_id: number;
  project_id: number;
  message: string;
  node_id: number | null;
  is_read: boolean;
  created_at: string;
};

export type ShareLink = {
  id: number;
  project_id: number;
  token: string;
  revoked: boolean;
  created_at: string;
  share_url: string;
};

export type ViewerTree = {
  project: {
    id: number;
    repo_owner: string;
    repo_name: string;
    plan_status: string;
    status: string;
  };
  nodes: TreeNode[];
  edges: TreeEdge[];
};
