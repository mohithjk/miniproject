import { api, useMockData } from "@/lib/api";
import { clearSession, getSessionUser } from "@/lib/session";
import { mockUser } from "@/lib/mocks";
import type { User } from "@/lib/types";

const MOCK_USER_KEY = "codecanopy.mock-user";
const LAST_ROLE_KEY = "codecanopy.last-role";

export type UserRole = "student" | "mentor";

export type CurrentUser = {
  name: string;
  avatar: string | null;
  githubUsername: string;
  role: UserRole;
};

export function getLastChosenRole(): UserRole {
  if (typeof window === "undefined") return "student";
  const saved = window.localStorage.getItem(LAST_ROLE_KEY);
  return saved === "mentor" ? "mentor" : "student";
}

export function saveChosenRole(role: UserRole) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LAST_ROLE_KEY, role);
  }
}

export async function signInWithGitHub(
  role: UserRole = "student",
  redirectTo?: string,
  customUsername?: string
) {
  saveChosenRole(role);

  if (useMockData) {
    // Wait long enough for the login button's Connecting state to be visible.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 1000));

    const username = customUsername || (role === "mentor" ? "demo-mentor" : "demo-student");
    const fakeUser: CurrentUser = {
      name: role === "mentor" ? "Demo Mentor" : username,
      avatar: mockUser.avatar,
      githubUsername: username,
      role,
    };
    window.localStorage.setItem(MOCK_USER_KEY, JSON.stringify(fakeUser));
    window.location.assign(redirectTo || "/dashboard");
    return;
  }

  // Real GitHub OAuth remains available when NEXT_PUBLIC_USE_MOCK is false.
  // Pass chosen role and redirect as query parameters so backend can associate or record it.
  const redirectQuery = redirectTo ? `&redirect=${encodeURIComponent(redirectTo)}` : "";
  window.location.assign(`${api.githubLoginUrl(role)}${redirectQuery}`);
}

export function getCurrentUser(): CurrentUser | null {
  if (useMockData) {
    const savedUser = typeof window !== "undefined" ? window.localStorage.getItem(MOCK_USER_KEY) : null;
    if (!savedUser) return null;

    try {
      const parsed = JSON.parse(savedUser) as Partial<CurrentUser>;
      const role: UserRole = parsed.role === "mentor" ? "mentor" : "student";
      return {
        name: parsed.name || (role === "mentor" ? "Demo Mentor" : "Demo Student"),
        avatar: parsed.avatar || mockUser.avatar,
        githubUsername: parsed.githubUsername || (role === "mentor" ? "demo-mentor" : "demo-student"),
        role,
      };
    } catch {
      window.localStorage.removeItem(MOCK_USER_KEY);
      return null;
    }
  }

  const user: User | null = getSessionUser();
  if (!user) return null;

  const role: UserRole = getLastChosenRole();
  return {
    name: user.username,
    avatar: user.avatar_url,
    githubUsername: user.username,
    role,
  };
}

export function signOut() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(MOCK_USER_KEY);
  }
  clearSession();
  window.location.assign("/login");
}
