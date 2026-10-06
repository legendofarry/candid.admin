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

export async function ownerRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${apiRoot}${path}`, { ...options, headers });
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
