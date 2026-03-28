import type { Book, FeedbackAction, MeResponse, RecommendationItem, UserPreferences } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const TOKEN_KEY = "devbookpi_token";
const AUTH_STATE_EVENT = "bookpi-auth-state-change";

interface AuthResponse {
  token: string;
  user: { id: string; email: string };
}

interface RecommendationsResponse {
  data: RecommendationItem[];
  nextCursor: string | null;
}

export function saveToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, token);
    window.dispatchEvent(new Event(AUTH_STATE_EVENT));
  }
}

export function clearToken(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event(AUTH_STATE_EVENT));
  }
}

export function hasToken(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(localStorage.getItem(TOKEN_KEY));
}

export function authStateEventName(): string {
  return AUTH_STATE_EVENT;
}

function getToken(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers
    });
  } catch {
    throw new Error(`Cannot reach API at ${API_BASE_URL}. Ensure backend is running.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.toLowerCase().includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    if (isJson && payload && typeof payload === "object" && "error" in payload) {
      throw new Error(String((payload as { error?: unknown }).error ?? "Request failed"));
    }
    throw new Error(typeof payload === "string" && payload.trim().length > 0 ? payload : "Request failed");
  }

  return payload as T;
}

export const apiClient = {
  signup(input: { email: string; password: string }): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },

  login(input: { email: string; password: string }): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },

  me(): Promise<MeResponse> {
    return request<MeResponse>("/api/me");
  },

  updatePreferences(input: UserPreferences): Promise<{ preferences: UserPreferences }> {
    return request<{ preferences: UserPreferences }>("/api/me/preferences", {
      method: "PUT",
      body: JSON.stringify(input)
    });
  },

  recommendations(): Promise<RecommendationsResponse> {
    // Add cache-busting parameter to ensure fresh recommendations
    const timestamp = Date.now();
    return request<RecommendationsResponse>(`/api/recommendations?refresh=${timestamp}`);
  },

  search(query: string): Promise<RecommendationsResponse> {
    return request<RecommendationsResponse>(`/api/books/search?q=${encodeURIComponent(query)}`);
  },

  searchRecommendations(query: string): Promise<RecommendationsResponse> {
    return request<RecommendationsResponse>(`/api/recommendations/search?q=${encodeURIComponent(query)}`);
  },

  feedback(input: { bookId: string; action: FeedbackAction; timestamp: string }): Promise<{ stored: boolean }> {
    return request<{ stored: boolean }>("/api/recommendations/feedback", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },

  bookById(bookId: string): Promise<{ data: Book }> {
    return request<{ data: Book }>(`/api/recommendations/book/${encodeURIComponent(bookId)}`);
  }
};
