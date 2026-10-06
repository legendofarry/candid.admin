export type StoryStatus = "pending" | "published" | "hidden";
export type ReportStatus = "open" | "resolved" | "dismissed";

export type Story = {
  id: string;
  title: string;
  body: string;
  status: StoryStatus;
  moderation_note: string | null;
  company_id: string;
  company_name: string | null;
  county: string | null;
  industry: string | null;
  reasons: string[];
  upvotes: number;
  metoo: number;
  comment_count: number;
  created_at: string;
  profiles: { handle?: string; username?: string | null; banned?: boolean } | null;
};

export type OwnerComment = {
  id: string;
  story_id: string;
  parent_id: string | null;
  body: string;
  status: string;
  author_handle: string;
  author_id: string | null;
  likes?: number;
  created_at: string;
  story: Pick<Story, "id" | "title" | "company_name"> | null;
};

export type OwnerReport = {
  id: string;
  target_type: "story" | "comment";
  target_id: string;
  reason: string;
  detail: string | null;
  reporter_id: string | null;
  status: ReportStatus;
  created_at: string;
  target: (Partial<Story> & Partial<OwnerComment>) | null;
};

export type OwnerCompany = {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  county: string | null;
  verified: boolean;
  created_at: string;
  company_ai_profiles?: { descriptor?: string | null; summary?: string | null } | null;
};

export type OwnerUser = {
  id: string;
  handle: string;
  username?: string | null;
  county: string | null;
  banned: boolean;
  account_type?: string;
  created_at: string;
};

export type OwnerStats = {
  stories: { total: number; published: number; pending: number; hidden: number; last7Days: number };
  companies: number;
  users: { total: number; banned: number };
  comments: number;
  reportsOpen: number;
  salaryReports: number;
  companyRatings: number;
  generatedAt: string;
};

export type SiteContact = {
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  x: string | null;
  instagram: string | null;
  note: string | null;
  updated_at: string | null;
};

export type AuditEntry = {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  payload: unknown;
  created_at: string;
};

export type InboxParticipant = { id: string; username: string; photo_url: string | null };
export type OwnerInboxThread = {
  id: string;
  channel: "direct" | "support";
  kind: "direct" | "support_chat" | "support_ticket";
  subject?: string;
  user_id?: string | null;
  preview: string;
  last_message_at: string | null;
  unread: number;
  status: string;
  contact?: string | null;
  category?: string;
  participants?: InboxParticipant[];
  can_reply_as_candid?: boolean;
};

export type OwnerInboxMessage = {
  id: string;
  sender_id?: string;
  sender_type?: string;
  body: string;
  created_at: string | null;
  read_at?: string | null;
  reactions?: Record<string, string[]>;
};

export type OwnerInboxDetail = {
  thread: OwnerInboxThread;
  messages: OwnerInboxMessage[];
  ticket?: { contact: string | null; category: string; full_name: string };
};

const apiRoot = "/api/owner";

type OwnerSession = { idToken: string; refreshToken: string; expiresAt: number };

const authApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const authSessionKey = "candid-owner-auth-session";

function storedSession(): OwnerSession | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(authSessionKey);
    return value ? (JSON.parse(value) as OwnerSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: OwnerSession | null) {
  if (typeof window === "undefined") return;
  if (session) sessionStorage.setItem(authSessionKey, JSON.stringify(session));
  else sessionStorage.removeItem(authSessionKey);
}

export function hasOwnerSession() {
  return Boolean(storedSession()?.refreshToken);
}

export function clearOwnerSession() {
  saveSession(null);
}

export async function signInOwner(email: string, password: string) {
  if (!authApiKey) throw new Error("Add VITE_FIREBASE_API_KEY to the owner app environment first.");
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(authApiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const result = (await response.json().catch(() => ({}))) as {
    idToken?: string;
    refreshToken?: string;
    expiresIn?: string;
    error?: { message?: string };
  };
  if (!response.ok || !result.idToken || !result.refreshToken) {
    const code = result.error?.message;
    const message = code === "INVALID_LOGIN_CREDENTIALS" || code === "EMAIL_NOT_FOUND" || code === "INVALID_PASSWORD"
      ? "Email or password is incorrect."
      : code === "USER_DISABLED"
        ? "This account is disabled."
        : code === "OPERATION_NOT_ALLOWED"
          ? "Enable Email/Password sign-in for Firebase Authentication."
          : "Could not sign in. Check the Firebase Authentication settings and try again.";
    throw new Error(message);
  }
  const session = {
    idToken: result.idToken,
    refreshToken: result.refreshToken,
    expiresAt: Date.now() + Number(result.expiresIn || 3600) * 1000,
  };
  saveSession(session);
  return session;
}

async function freshIdToken() {
  const session = storedSession();
  if (!session?.refreshToken) throw new Error("Sign in to the owner console.");
  if (session.expiresAt > Date.now() + 60_000) return session.idToken;
  if (!authApiKey) throw new Error("Firebase Authentication is not configured for this site.");
  const response = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(authApiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken }),
    },
  );
  const result = (await response.json().catch(() => ({}))) as {
    id_token?: string;
    refresh_token?: string;
    expires_in?: string;
  };
  if (!response.ok || !result.id_token || !result.refresh_token) {
    clearOwnerSession();
    throw new Error("Your session expired. Sign in again.");
  }
  const refreshed = {
    idToken: result.id_token,
    refreshToken: result.refresh_token,
    expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000,
  };
  saveSession(refreshed);
  return refreshed.idToken;
}

export async function ownerRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  async function send(token: string) {
    const headers = new Headers(options.headers);
    headers.set("authorization", `Bearer ${token}`);
    if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    return fetch(`${apiRoot}${path}`, { ...options, headers });
  }
  let response = await send(await freshIdToken());
  if (response.status === 401) {
    clearOwnerSession();
    throw new Error("Your session expired or is not authorized. Sign in again.");
  }
  const payload = (await response.json().catch(() => ({}))) as T | { error?: string };
  if (!response.ok) {
    const message = (payload as { error?: string }).error;
    throw new Error(message || `Request failed (${response.status})`);
  }
  return payload as T;
}

export function postOwnerAction(action: object) {
  return ownerRequest<{ ok: true }>("/actions", {
    method: "POST",
    body: JSON.stringify(action),
  });
}
