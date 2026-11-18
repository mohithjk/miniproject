import type { User } from "@/lib/types";

const TOKEN_KEY = "codecanopy.access_token";
const USER_KEY = "codecanopy.user";

export function saveSession(token: string, user: User) {
  // The backend returns a bearer token in JSON, so keep it only for this browser tab.
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getAccessToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getSessionUser(): User | null {
  // In mock mode, fall back to the mock user saved in localStorage
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCK === "true") {
    const savedMock = localStorage.getItem("codecanopy.mock-user");
    if (savedMock) {
      try {
        const u = JSON.parse(savedMock);
        return {
          id: u.id ?? 1,
          github_id: u.github_id ?? 123456,
          username: u.githubUsername || u.name || "demo-user",
          avatar_url: u.avatar || null,
        };
      } catch {
        return null;
      }
    }
  }

  const savedUser = sessionStorage.getItem(USER_KEY);
  if (!savedUser) return null;

  try {
    return JSON.parse(savedUser) as User;
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  if (typeof window !== "undefined") {
    localStorage.removeItem("codecanopy.mock-user");
  }
}
