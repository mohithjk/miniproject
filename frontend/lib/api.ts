import { getAccessToken } from "@/lib/session";
import {
  acceptMockInvite,
  addMockMember,
  confirmMockNode,
  confirmMockSummary,
  createMockInvite,
  getMockInvite,
  getMockNodeDetail,
  getMockPlan,
  getMockProjectTree,
  getMockSummary,
  getMockSummaryVersions,
  getMockViewerTree,
  listMockInvites,
  mockMembers,
  mockNotifications,
  mockProjects,
  mockShareLinks,
  mockUser,
  regenerateMockSummary,
  removeMockMember,
  resendMockInvite,
  revokeMockInvite,
  saveMockPlan,
  updateMockSummary,
} from "@/lib/mocks";
import type {
  AuthResponse,
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
  ViewerTree,
} from "@/lib/types";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

// Set NEXT_PUBLIC_USE_MOCK=false to use the real API for Phase 1 dashboard data.
export const useMockData = process.env.NEXT_PUBLIC_USE_MOCK === "true";

function apiBaseUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    throw new ApiError("Unable to connect to the project service. Please try again later.", 503);
  }
  return baseUrl;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window === "undefined" ? null : getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers,
    });
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      throw new ApiError("Could not connect to the service. Please check your connection and try again.", 0);
    }
    throw error;
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      // Keep the HTTP status message when the server does not return JSON.
    }
    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export const api = {
  githubLoginUrl(role?: string) {
    const query = role ? `?role=${encodeURIComponent(role)}` : "";
    return `${apiBaseUrl()}/auth/github/login${query}`;
  },

  exchangeGithubCode(code: string) {
    return request<AuthResponse>(`/auth/github/callback?code=${encodeURIComponent(code)}`);
  },

  getProjects() {
    if (useMockData) return Promise.resolve(mockProjects);
    return request<Project[]>("/projects");
  },

  async createProject(repoOwner: string, repoName: string, ownerRole: Role) {
    if (useMockData) {
      // Simulate realistic AI reading README time so the loading state is visible
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const newId = Math.max(0, ...mockProjects.map((item) => item.id)) + 1;
      const project: Project = {
        id: newId,
        owner_id: mockUser.id,
        repo_owner: repoOwner,
        repo_name: repoName,
        plan_status: "draft",
        status: "pending_summary",
        summary_confirmed: false,
        summary_status: "pending_confirmation",
        confirmed_by: null,
        confirmed_at: null,
        created_at: new Date().toISOString(),
      };
      mockProjects.unshift(project);
      addMockMember(project.id, ownerRole);

      // Pre-seed summary for the newly created repo
      getMockSummary(newId);

      return project;
    }
    return request<Project>("/projects", {
      method: "POST",
      body: JSON.stringify({
        repo_owner: repoOwner,
        repo_name: repoName,
        owner_role: ownerRole,
      }),
    });
  },

  async getReadmeSummary(projectId: number) {
    if (useMockData) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return getMockSummary(projectId);
    }
    return request<ReadmeSummary>(`/projects/${projectId}/summary`);
  },

  async regenerateSummary(projectId: number, notes: string) {
    if (useMockData) {
      // 1.5s simulated AI re-reading delay
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return regenerateMockSummary(projectId, notes);
    }
    return request<ReadmeSummary>(`/projects/${projectId}/summary/regenerate`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    });
  },

  async updateSummary(projectId: number, edits: Partial<ReadmeSummary>) {
    if (useMockData) {
      return updateMockSummary(projectId, edits);
    }
    return request<ReadmeSummary>(`/projects/${projectId}/summary`, {
      method: "PATCH",
      body: JSON.stringify(edits),
    });
  },

  async confirmSummary(projectId: number) {
    if (useMockData) {
      // 1.5s simulated plan generation delay
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const res = confirmMockSummary(projectId);

      // Generate the plan only AFTER confirmation
      const existingPlan = getMockPlan(projectId);
      if (!existingPlan || existingPlan.nodes.length === 0) {
        const project = mockProjects.find((p) => p.id === projectId);
        const repoName = project?.repo_name || "project";
        const starterPlan: Plan = {
          nodes: [
            {
              key: "n1",
              title: `Set up ${repoName} foundation`,
              description: "Initialize directory structure, shared types, and build scripts.",
              role: "backend",
              done_criteria: "The project compiles cleanly and team conventions are documented.",
              path_hints: ["src"],
              depends_on: [],
            },
            {
              key: "n2",
              title: "Build core user interface",
              description: "Implement interactive client components and responsive layouts.",
              role: "frontend",
              done_criteria: "UI is responsive and adheres to brand color palette.",
              path_hints: ["frontend"],
              depends_on: ["n1"],
            },
            {
              key: "n3",
              title: "Configure API endpoints and data model",
              description: "Connect services and implement data validation.",
              role: "backend",
              done_criteria: "All CRUD endpoints return correct data contracts.",
              path_hints: ["backend"],
              depends_on: ["n1"],
            },
            {
              key: "n4",
              title: "Security and permission audit",
              description: "Verify role-based access control and sanitize user inputs.",
              role: "security",
              done_criteria: "Audit passes with zero critical vulnerabilities.",
              path_hints: ["security"],
              depends_on: ["n2", "n3"],
            },
          ],
        };
        saveMockPlan(projectId, starterPlan);
      }
      return res;
    }
    return request<{ project_id: number; summary_status: string; confirmed_by: string; confirmed_at: string }>(
      `/projects/${projectId}/summary/confirm`,
      { method: "POST" }
    );
  },

  async getSummaryVersions(projectId: number) {
    if (useMockData) {
      return getMockSummaryVersions(projectId);
    }
    return request<SummaryVersion[]>(`/projects/${projectId}/summary/versions`);
  },

  getProject(projectId: number) {
    if (useMockData) {
      const project = mockProjects.find((item) => item.id === projectId);
      return project
        ? Promise.resolve(project)
        : Promise.reject(new ApiError("Project not found in demo data.", 404));
    }
    return request<Project>(`/projects/${projectId}`);
  },

  getPlan(projectId: number) {
    if (useMockData) return Promise.resolve(getMockPlan(projectId));
    return request<Plan>(`/projects/${projectId}/plan`);
  },

  savePlan(projectId: number, plan: Plan) {
    if (useMockData) return Promise.resolve(saveMockPlan(projectId, plan));
    return request<Plan>(`/projects/${projectId}/plan`, {
      method: "PUT",
      body: JSON.stringify(plan),
    });
  },

  approvePlan(projectId: number) {
    if (useMockData) {
      const project = mockProjects.find((item) => item.id === projectId);
      if (project) project.plan_status = "approved";
      return Promise.resolve({ project_id: projectId, plan_status: "approved" });
    }
    return request<{ project_id: number; plan_status: string }>(`/projects/${projectId}/plan/approve`, {
      method: "POST",
    });
  },

  retryPlan(projectId: number) {
    if (useMockData) return Promise.resolve({ status: "plan_retry_queued", project_id: projectId, job_id: 1 });
    return request<{ status: string; project_id: number; job_id: number }>(`/projects/${projectId}/plan/retry`, {
      method: "POST",
    });
  },

  getMembers(projectId: number) {
    if (useMockData) {
      return Promise.resolve(mockMembers.filter((member) => member.project_id === projectId));
    }
    return request<Member[]>(`/projects/${projectId}/members`);
  },

  joinProject(projectId: number, role: Role) {
    if (useMockData) return Promise.resolve(addMockMember(projectId, role));
    return request<Member>(`/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify({ role }),
    });
  },

  updateMemberRole(projectId: number, userId: number, role: Role) {
    if (useMockData) {
      const member = mockMembers.find((item) => item.project_id === projectId && item.user_id === userId);
      if (!member) return Promise.reject(new ApiError("Member not found in demo data.", 404));
      member.role = role;
      return Promise.resolve(member);
    }
    return request<Member>(`/projects/${projectId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },

  getProjectTree(projectId: number) {
    if (useMockData) return Promise.resolve(getMockProjectTree(projectId));
    return request<ProjectTree>(`/projects/${projectId}/tree`);
  },

  getNodeDetail(nodeId: number) {
    if (useMockData) {
      const detail = getMockNodeDetail(nodeId);
      return detail
        ? Promise.resolve(detail)
        : Promise.reject(new ApiError("Work item not found in demo data.", 404));
    }
    return request<NodeDetail>(`/nodes/${nodeId}`);
  },

  confirmNode(nodeId: number) {
    if (useMockData) {
      return Promise.resolve(confirmMockNode(nodeId));
    }
    return request<{ status: string; node_id: number; node_status: string }>(`/nodes/${nodeId}/confirm`, {
      method: "POST",
    });
  },

  getNotifications() {
    if (useMockData) return Promise.resolve(mockNotifications);
    return request<NotificationItem[]>("/notifications");
  },

  markNotificationRead(notificationId: number) {
    if (useMockData) {
      const notification = mockNotifications.find((item) => item.id === notificationId);
      if (!notification) return Promise.reject(new ApiError("Notification not found in demo data.", 404));
      notification.is_read = true;
      return Promise.resolve(notification);
    }
    return request<NotificationItem>(`/notifications/${notificationId}/read`, {
      method: "POST",
    });
  },

  createShareLink(projectId: number) {
    if (useMockData) {
      const token = `demo-view-${Date.now()}`;
      const link = {
        id: mockShareLinks.length + 1,
        project_id: projectId,
        token,
        revoked: false,
        created_at: new Date().toISOString(),
        share_url: `/view/${token}`,
      };
      mockShareLinks.push(link);
      return Promise.resolve(link);
    }
    return request<ShareLink>(`/projects/${projectId}/share`, {
      method: "POST",
    });
  },

  revokeShareLink(projectId: number, token?: string) {
    if (useMockData) {
      mockShareLinks.forEach((link) => {
        if (link.project_id === projectId && (!token || link.token === token)) link.revoked = true;
      });
      return Promise.resolve({ status: "revoked", project_id: projectId, token: token ?? "all" });
    }
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    return request<{ status: string; project_id: number; token: string }>(
      `/projects/${projectId}/share${query}`,
      { method: "DELETE" },
    );
  },

  getViewerTree(token: string) {
    if (useMockData) {
      const link = mockShareLinks.find((item) => item.token === token && !item.revoked);
      const tree = link ? getMockViewerTree(link.project_id) : undefined;
      return tree
        ? Promise.resolve(tree)
        : Promise.reject(new ApiError("Viewer link is invalid or has been revoked.", 404));
    }
    return request<ViewerTree>(`/view/${encodeURIComponent(token)}`);
  },

  async listInvites(projectId: number) {
    if (useMockData) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return listMockInvites(projectId);
    }
    return request<ProjectInvite[]>(`/projects/${projectId}/invites`);
  },

  async createInvite(
    projectId: number,
    params: {
      type: InviteType;
      githubUsername?: string;
      role?: Role | null;
      expiresIn?: string;
      maxUses?: number;
    }
  ) {
    if (useMockData) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return createMockInvite(projectId, params);
    }
    return request<ProjectInvite>(`/projects/${projectId}/invites`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  },

  async resendInvite(id: number) {
    if (useMockData) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return resendMockInvite(id);
    }
    return request<ProjectInvite>(`/invites/${id}/resend`, {
      method: "POST",
    });
  },

  async revokeInvite(id: number) {
    if (useMockData) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return revokeMockInvite(id);
    }
    return request<ProjectInvite>(`/invites/${id}/revoke`, {
      method: "POST",
    });
  },

  async getInvite(token: string) {
    if (useMockData) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return getMockInvite(token);
    }
    return request<{ invite: ProjectInvite; project: Project; invited_by: string }>(
      `/invites/${encodeURIComponent(token)}`
    );
  },

  async acceptInvite(token: string, role?: Role, username?: string) {
    if (useMockData) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return acceptMockInvite(token, role, username);
    }
    return request<{ project: Project; member: Member; is_mentor?: boolean }>(
      `/invites/${encodeURIComponent(token)}/accept`,
      {
        method: "POST",
        body: JSON.stringify({ role }),
      }
    );
  },

  async removeMember(projectId: number, userId: number) {
    if (useMockData) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return removeMockMember(projectId, userId);
    }
    return request<{ success: boolean }>(`/projects/${projectId}/members/${userId}`, {
      method: "DELETE",
    });
  },
};
