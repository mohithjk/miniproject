import { getAccessToken } from "@/lib/session";
import {
  addMockMember,
  getMockNodeDetail,
  getMockPlan,
  getMockProjectTree,
  getMockViewerTree,
  mockMembers,
  mockNotifications,
  mockProjects,
  mockShareLinks,
  mockUser,
} from "@/lib/mocks";
import type {
  AuthResponse,
  Member,
  NodeDetail,
  NotificationItem,
  Plan,
  Project,
  ProjectTree,
  Role,
  ShareLink,
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
    throw new Error("NEXT_PUBLIC_API_URL is missing. Add it to frontend/.env.local and restart Next.js.");
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
      throw new ApiError("Could not reach the backend. Check that it is running and accessible from this frontend.", 0);
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
  githubLoginUrl() {
    return `${apiBaseUrl()}/auth/github/login`;
  },

  exchangeGithubCode(code: string) {
    return request<AuthResponse>(`/auth/github/callback?code=${encodeURIComponent(code)}`);
  },

  getProjects() {
    if (useMockData) return Promise.resolve(mockProjects);
    return request<Project[]>("/projects");
  },

  createProject(repoOwner: string, repoName: string, ownerRole: Role) {
    if (useMockData) {
      const project: Project = {
        id: Math.max(0, ...mockProjects.map((item) => item.id)) + 1,
        owner_id: mockUser.id,
        repo_owner: repoOwner,
        repo_name: repoName,
        plan_status: "approved",
        status: "active",
        created_at: new Date().toISOString(),
      };
      mockProjects.unshift(project);
      addMockMember(project.id, ownerRole);
      return Promise.resolve(project);
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
    if (useMockData) return Promise.resolve(plan);
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
      return Promise.resolve({ status: "confirmed", node_id: nodeId, node_status: "done" });
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
};
