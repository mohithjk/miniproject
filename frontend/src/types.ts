export type Role = "frontend" | "backend" | "ai_ml" | "security" | "devops";
export type NodeStatus = "locked" | "ready" | "in_progress" | "done";
export type EdgeState = "hidden" | "dotted" | "solid";

export interface NodeSchema {
  id: number;
  project_id: number;
  key: string;
  title: string;
  description: string;
  role: Role;
  done_criteria: string;
  path_hints: string[];
  status: NodeStatus;
  owner_id: number | null;
  done_at: string | null;
}

export interface EdgeSchema {
  id: number;
  project_id: number;
  from_node: number;
  to_node: number;
  state: EdgeState;
}

export interface ProgressSchema {
  done: number;
  total: number;
  percentage: number;
}

export interface TreeResponse {
  project_id: number;
  nodes: NodeSchema[];
  edges: EdgeSchema[];
  progress: ProgressSchema;
  last_event_id: number;
}

export interface MatchedCommit {
  commit_id: number;
  sha: string;
  message: string;
  author_login: string | null;
  confidence: number;
  method: string;
}

export interface NodeOwner {
  id: number;
  username: string;
  avatar_url?: string | null;
}

export interface AIDecision {
  verdict: string;
  confidence: number;
  reason: string;
}

export interface NodeDetailResponse {
  node: NodeSchema;
  title: string;
  role: string;
  status: NodeStatus;
  done_criteria: string;
  owner: NodeOwner | null;
  commits: MatchedCommit[];
  latest_ai_decision: AIDecision | null;
}

export interface ProjectResponse {
  id: number;
  repo_owner: string;
  repo_name: string;
  readme_text: string | null;
  webhook_secret: string;
  plan_status: string;
  status: string;
  owner_id: number;
  created_at: string;
}
