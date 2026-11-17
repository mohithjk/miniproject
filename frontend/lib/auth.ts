import { api, useMockData } from "@/lib/api";
import { clearSession, getSessionUser } from "@/lib/session";
import { mockUser } from "@/lib/mocks";
import type { User } from "@/lib/types";

const MOCK_USER_KEY = "codecanopy.mock-user";

export type CurrentUser = {
  name: string;
  avatar: string | null;
  githubUsername: string;
};

export async function signInWithGitHub() {
  if (useMockData) {
    // Wait long enough for the login button's Connecting state to be visible.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 1000));
    window.localStorage.setItem(MOCK_USER_KEY, JSON.stringify(mockUser));
    window.location.assign("/dashboard");
    return;
  }

  // Real GitHub OAuth remains available when NEXT_PUBLIC_USE_MOCK is false.
  window.location.assign(api.githubLoginUrl());
}

export function getCurrentUser(): CurrentUser | null {
  if (useMockData) {
    const savedUser = window.localStorage.getItem(MOCK_USER_KEY);
    if (!savedUser) return null;

    try {
      return JSON.parse(savedUser) as CurrentUser;
    } catch {
      window.localStorage.removeItem(MOCK_USER_KEY);
      return null;
    }
  }

  const user: User | null = getSessionUser();
  return user
    ? { name: user.username, avatar: user.avatar_url, githubUsername: user.username }
    : null;
}

export function signOut() {
  window.localStorage.removeItem(MOCK_USER_KEY);
  clearSession();
  window.location.assign("/login");
}
