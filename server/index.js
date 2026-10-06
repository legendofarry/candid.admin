import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import dotenv from "dotenv";
import express from "express";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const app = express();
const port = Number(process.env.PORT || 4176);
let firestore;

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "same-origin");
  res.setHeader("x-frame-options", "DENY");
  next();
});
app.use(express.json({ limit: "64kb" }));

function db() {
  if (firestore) return firestore;
  let serviceAccount;
  const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawCredentials) {
    try {
      serviceAccount = JSON.parse(rawCredentials);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON.");
    }
  } else {
    const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialPath) {
      throw new Error("Set FIREBASE_SERVICE_ACCOUNT_JSON in the owner app's .env.local file.");
    }
    const fullPath = resolve(process.cwd(), credentialPath);
    if (!existsSync(fullPath)) throw new Error("Firebase service-account file was not found.");
    try {
      serviceAccount = JSON.parse(readFileSync(fullPath, "utf8"));
    } catch {
      throw new Error("Firebase service-account file is invalid or unreadable.");
    }
  }
  const admin = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
  firestore = getFirestore(admin);
  return firestore;
}

function pageParams(url) {
  const limitValue = Number(url.searchParams.get("limit") || 50);
  const offsetValue = Number(url.searchParams.get("offset") || 0);
  return {
    limit: Number.isFinite(limitValue) ? Math.min(Math.max(limitValue, 1), 200) : 50,
    offset: Number.isFinite(offsetValue) ? Math.max(offsetValue, 0) : 0,
  };
}

async function collection(name) {
  const snapshot = await db().collection(name).get();
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
}

async function document(name, id) {
  const snapshot = await db().collection(name).doc(id).get();
  return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null;
}

async function audit(action, targetType = null, targetId = null, payload = null) {
  const ref = db().collection("owner_audit_log").doc();
  await ref.set({
    id: ref.id,
    action,
    target_type: targetType,
    target_id: targetId,
    payload,
    created_at: new Date().toISOString(),
  });
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/api/owner/stats", async (_req, res) => {
  const [stories, companies, users, comments, reports, salaries, ratings] = await Promise.all([
    collection("stories"), collection("companies"), collection("profiles"),
    collection("comments"), collection("reports"), collection("salary_reports"),
    collection("company_ratings"),
  ]);
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  res.json({
    stories: {
      total: stories.length,
      published: stories.filter((item) => item.status === "published").length,
      pending: stories.filter((item) => item.status === "pending").length,
      hidden: stories.filter((item) => item.status === "hidden").length,
      last7Days: stories.filter((item) => (item.created_at || "") >= since).length,
    },
    companies: companies.length,
    users: { total: users.length, banned: users.filter((item) => item.banned).length },
    comments: comments.length,
    reportsOpen: reports.filter((item) => item.status === "open").length,
    salaryReports: salaries.length,
    companyRatings: ratings.length,
    generatedAt: new Date().toISOString(),
  });
});

app.get("/api/owner/stories", async (req, res) => {
  const { limit, offset } = pageParams(new URL(req.url, "http://owner.local"));
  const status = req.query.status;
  const query = String(req.query.q || "").toLowerCase();
  const [stories, companies, profiles] = await Promise.all([
    collection("stories"), collection("companies"), collection("profiles"),
  ]);
  const companyById = new Map(companies.map((item) => [item.id, item]));
  const profileById = new Map(profiles.map((item) => [item.id, item]));
  const filtered = stories
    .filter((item) => !status || item.status === status)
    .filter((item) => !query || `${item.title || ""} ${item.body || ""} ${item.company_name || companyById.get(item.company_id)?.name || ""}`.toLowerCase().includes(query))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  res.json({
    total: filtered.length, limit, offset,
    stories: filtered.slice(offset, offset + limit).map((item) => ({
      ...item,
      company_name: item.company_name || companyById.get(item.company_id)?.name || null,
      industry: item.industry || companyById.get(item.company_id)?.industry || null,
      county: item.county || companyById.get(item.company_id)?.county || null,
      reasons: Array.isArray(item.reasons) ? item.reasons : [],
      profiles: item.author_id ? profileById.get(item.author_id) || null : null,
    })),
  });
});

app.get("/api/owner/reports", async (req, res) => {
  const { limit, offset } = pageParams(new URL(req.url, "http://owner.local"));
  const status = String(req.query.status || "open");
  const [reports, stories, comments] = await Promise.all([
    collection("reports"), collection("stories"), collection("comments"),
  ]);
  const storyById = new Map(stories.map((item) => [item.id, item]));
  const commentById = new Map(comments.map((item) => [item.id, item]));
  const filtered = reports
    .filter((item) => status === "all" || item.status === status)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  res.json({
    total: filtered.length, limit, offset,
    reports: filtered.slice(offset, offset + limit).map((item) => ({
      ...item,
      target: item.target_type === "story" ? storyById.get(item.target_id) || null : commentById.get(item.target_id) || null,
    })),
  });
});

app.get("/api/owner/comments", async (req, res) => {
  const { limit, offset } = pageParams(new URL(req.url, "http://owner.local"));
  const query = String(req.query.q || "").toLowerCase();
  const [comments, stories] = await Promise.all([collection("comments"), collection("stories")]);
  const storyById = new Map(stories.map((item) => [item.id, item]));
  const filtered = comments
    .filter((item) => !req.query.status || item.status === req.query.status)
    .filter((item) => !query || `${item.body || ""} ${item.author_handle || ""} ${storyById.get(item.story_id)?.title || ""}`.toLowerCase().includes(query))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  res.json({
    total: filtered.length, limit, offset,
    comments: filtered.slice(offset, offset + limit).map((item) => ({ ...item, story: storyById.get(item.story_id) || null })),
  });
});

app.get("/api/owner/companies", async (req, res) => {
  const { limit, offset } = pageParams(new URL(req.url, "http://owner.local"));
  const query = String(req.query.q || "").toLowerCase();
  const [companies, profiles] = await Promise.all([collection("companies"), collection("company_ai_profiles")]);
  const profileByCompany = new Map(profiles.map((item) => [item.company_id, item]));
  const filtered = companies
    .filter((item) => !query || String(item.name || "").toLowerCase().includes(query))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  res.json({
    total: filtered.length, limit, offset,
    companies: filtered.slice(offset, offset + limit).map((item) => ({
      ...item, company_ai_profiles: profileByCompany.get(item.id) || null,
    })),
  });
});

app.get("/api/owner/users", async (req, res) => {
  const { limit, offset } = pageParams(new URL(req.url, "http://owner.local"));
  const query = String(req.query.q || "").toLowerCase();
  const users = await collection("profiles");
  const filtered = users
    .filter((item) => !query || `${item.handle || ""} ${item.username || ""} ${item.id}`.toLowerCase().includes(query))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  res.json({ total: filtered.length, limit, offset, users: filtered.slice(offset, offset + limit) });
});

app.get("/api/owner/contact", async (_req, res) => {
  const snapshot = await db().collection("site_settings").doc("contact").get();
  res.json({
    email: null, phone: null, whatsapp: null, x: null, instagram: null, note: null, updated_at: null,
    ...(snapshot.exists ? snapshot.data() : {}),
  });
});

app.post("/api/owner/contact", async (req, res) => {
  const fields = ["email", "phone", "whatsapp", "x", "instagram", "note"];
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Invalid contact payload" });
  }
  const patch = {};
  for (const field of fields) {
    if (!(field in req.body)) continue;
    const value = req.body[field];
    if (value !== null && typeof value !== "string") return res.status(400).json({ error: "Invalid contact payload" });
    if (typeof value === "string" && value.length > (field === "note" ? 600 : 160)) {
      return res.status(400).json({ error: "Contact field is too long" });
    }
    patch[field] = value;
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: "No contact changes supplied" });
  patch.updated_at = new Date().toISOString();
  await db().collection("site_settings").doc("contact").set(patch, { merge: true });
  await audit("contact.updated", "site_settings", "contact", { fields: Object.keys(patch).filter((field) => field !== "updated_at") });
  const saved = await db().collection("site_settings").doc("contact").get();
  res.json({
    email: null, phone: null, whatsapp: null, x: null, instagram: null, note: null, updated_at: null,
    ...(saved.data() || {}),
  });
});

app.get("/api/owner/audit", async (req, res) => {
  const { limit, offset } = pageParams(new URL(req.url, "http://owner.local"));
  const entries = (await collection("owner_audit_log"))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  res.json({ total: entries.length, limit, offset, entries: entries.slice(offset, offset + limit) });
});

const CANDID_USER_ID = "candid-official";

async function ensureCandidProfile(database) {
  const profileRef = database.collection("profiles").doc(CANDID_USER_ID);
  const profileSnap = await profileRef.get();
  if (!profileSnap.exists) {
    const timestamp = new Date().toISOString();
    await profileRef.set({
      id: CANDID_USER_ID,
      handle: "candid",
      username: "candid",
      county: null,
      banned: false,
      created_at: timestamp,
      role_label: "Candid team",
      account_type: "company",
      onboarded_at: timestamp,
    });
    await database.collection("usernames").doc("candid").set({
      username: "candid", user_id: CANDID_USER_ID, created_at: timestamp,
    });
    await database.collection("verifications").doc(CANDID_USER_ID).set({
      user_id: CANDID_USER_ID,
      account_type: "company",
      badge_status: "claimed",
      owner_verified: true,
      claimed_at: timestamp,
      checked_at: timestamp,
    }, { merge: true });
  }
  return profileRef;
}

function validId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 180 && !value.includes("/");
}

async function inboxProfiles(database, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const snapshots = await Promise.all(unique.map((id) => database.collection("profiles").doc(id).get()));
  return new Map(snapshots.map((snapshot) => {
    const profile = snapshot.exists ? snapshot.data() : {};
    return [snapshot.id, {
      id: snapshot.id,
      username: profile.username || profile.handle || "member",
      photo_url: profile.photo_url || null,
    }];
  }));
}

app.get("/api/owner/inbox", async (req, res) => {
  const channel = req.query.channel === "support" ? "support" : "direct";
  const database = db();
  if (channel === "direct") {
    const [conversationSnapshot, profileSnapshot] = await Promise.all([
      database.collection("conversations").get(),
      database.collection("profiles").get(),
    ]);
    const profiles = new Map(profileSnapshot.docs.map((doc) => [doc.id, doc.data()]));
    const conversations = conversationSnapshot.docs
      .map((doc) => ({ ...doc.data(), id: doc.id }))
      .filter((item) => Array.isArray(item.participant_ids) && item.participant_ids.length === 2)
      .sort((a, b) => String(b.last_message_at || "").localeCompare(String(a.last_message_at || "")))
      .map((item) => ({
        id: item.id,
        channel: "direct",
        kind: "direct",
        preview: item.last_message || "Conversation started",
        last_message_at: item.last_message_at || item.created_at || null,
        unread: Number(item.unread?.[CANDID_USER_ID] || 0),
        status: "open",
        participants: item.participant_ids.map((id) => ({
          id,
          username: profiles.get(id)?.username || profiles.get(id)?.handle || (id === CANDID_USER_ID ? "candid" : "member"),
          photo_url: profiles.get(id)?.photo_url || null,
        })),
        can_reply_as_candid: item.participant_ids.includes(CANDID_USER_ID),
      }));
    await audit("message.inbox_viewed", "conversation", null, { conversations: conversations.length });
    return res.json({ threads: conversations });
  }

  const [conversationSnapshot, ticketSnapshot, profiles] = await Promise.all([
    database.collection("support_conversations").get(),
    database.collection("support_tickets").get(),
    database.collection("profiles").get(),
  ]);
  const profileById = new Map(profiles.docs.map((doc) => [doc.id, doc.data()]));
  const chats = conversationSnapshot.docs.map((doc) => {
    const item = doc.data();
    const profile = profileById.get(item.user_id || doc.id);
    return {
      id: doc.id,
      channel: "support",
      kind: "support_chat",
      subject: `@${profile?.username || profile?.handle || "member"}`,
      user_id: item.user_id || doc.id,
      preview: item.last_message || "Conversation started",
      last_message_at: item.last_message_at || item.created_at || null,
      unread: item.last_sender === "user" && (!item.staff_read_at || item.staff_read_at < item.last_message_at) ? 1 : 0,
      status: item.status || "open",
      contact: null,
    };
  });
  const tickets = ticketSnapshot.docs.map((doc) => {
    const item = doc.data();
    return {
      id: doc.id,
      channel: "support",
      kind: "support_ticket",
      subject: item.full_name || "Support ticket",
      user_id: null,
      preview: item.message || "",
      last_message_at: item.created_at || null,
      unread: 0,
      status: item.status || "open",
      contact: item.contact || null,
      category: item.category || "other",
    };
  });
  await audit("support.inbox_viewed", "support", null, { chats: chats.length, tickets: tickets.length });
  res.json({
    threads: [...chats, ...tickets].sort((a, b) => String(b.last_message_at || "").localeCompare(String(a.last_message_at || ""))),
  });
});

app.get("/api/owner/inbox/thread", async (req, res) => {
  const { channel, kind, id } = req.query;
  if (!validId(id) || !["direct", "support"].includes(channel) || typeof kind !== "string") {
    return res.status(400).json({ error: "Invalid inbox thread" });
  }
  const database = db();
  if (channel === "direct" && kind === "direct") {
    const ref = database.collection("conversations").doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return res.status(404).json({ error: "Conversation not found" });
    const conversation = snapshot.data();
    if (!Array.isArray(conversation.participant_ids) || conversation.participant_ids.length !== 2) {
      return res.status(400).json({ error: "Conversation is not a supported direct message" });
    }
    const [messagesSnapshot, participants] = await Promise.all([
      database.collection("messages").where("conversation_id", "==", id).get(),
      inboxProfiles(database, conversation.participant_ids),
    ]);
    const messages = messagesSnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }))
      .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
    if (conversation.participant_ids.includes(CANDID_USER_ID)) {
      const batch = database.batch();
      batch.update(ref, { [`unread.${CANDID_USER_ID}`]: 0 });
      for (const message of messages) {
        if (message.sender_id !== CANDID_USER_ID && !message.read_at) {
          batch.update(database.collection("messages").doc(message.id), { read_at: new Date().toISOString() });
        }
      }
      await batch.commit();
    }
    await audit("message.thread_viewed", "conversation", id, { participant_ids: conversation.participant_ids });
    return res.json({
      thread: {
        id,
        channel: "direct",
        kind: "direct",
        participants: conversation.participant_ids.map((userId) => participants.get(userId)),
        can_reply_as_candid: conversation.participant_ids.includes(CANDID_USER_ID),
      },
      messages,
    });
  }

  if (channel === "support" && kind === "support_chat") {
    const ref = database.collection("support_conversations").doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return res.status(404).json({ error: "Support conversation not found" });
    const conversation = snapshot.data();
    const [messagesSnapshot, participants] = await Promise.all([
      database.collection("support_messages").where("conversation_id", "==", id).get(),
      inboxProfiles(database, [conversation.user_id || id]),
    ]);
    const messages = messagesSnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }))
      .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
    const batch = database.batch();
    for (const message of messages) {
      if (message.sender_type === "user" && !message.read_at) {
        batch.update(database.collection("support_messages").doc(message.id), { read_at: new Date().toISOString() });
      }
    }
    if (messages.some((message) => message.sender_type === "user" && !message.read_at)) await batch.commit();
    if (messages.some((message) => message.sender_type === "user" && !message.read_at)) {
      await ref.set({ staff_read_at: new Date().toISOString() }, { merge: true });
    }
    await audit("support.thread_viewed", "support_conversation", id);
    const profile = participants.get(conversation.user_id || id);
    return res.json({
      thread: {
        id,
        channel: "support",
        kind: "support_chat",
        subject: `@${profile?.username || "member"}`,
        user_id: conversation.user_id || id,
        status: conversation.status || "open",
      },
      messages,
    });
  }

  if (channel === "support" && kind === "support_ticket") {
    const snapshot = await database.collection("support_tickets").doc(id).get();
    if (!snapshot.exists) return res.status(404).json({ error: "Support ticket not found" });
    const ticket = { ...snapshot.data(), id: snapshot.id };
    await audit("support.ticket_viewed", "support_ticket", id);
    return res.json({
      thread: { id, channel: "support", kind: "support_ticket", subject: ticket.full_name || "Support ticket", status: ticket.status || "open" },
      messages: [{ id, sender_type: "user", body: ticket.message || "", created_at: ticket.created_at || null }],
      ticket: { contact: ticket.contact || null, category: ticket.category || "other", full_name: ticket.full_name || "" },
    });
  }
  return res.status(400).json({ error: "Invalid inbox thread type" });
});

app.post("/api/owner/inbox/direct-start", async (req, res) => {
  const userId = req.body?.user_id;
  if (!validId(userId) || userId === CANDID_USER_ID) return res.status(400).json({ error: "Invalid user" });
  const database = db();
  const profileSnap = await database.collection("profiles").doc(userId).get();
  if (!profileSnap.exists || profileSnap.data()?.banned) return res.status(404).json({ error: "User not found or unavailable" });
  await ensureCandidProfile(database);
  const id = [CANDID_USER_ID, userId].sort().join("__");
  const ref = database.collection("conversations").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    const timestamp = new Date().toISOString();
    await ref.set({
      id,
      participant_ids: [CANDID_USER_ID, userId].sort(),
      created_at: timestamp,
      last_message_at: timestamp,
      last_message: "",
      last_sender_id: null,
      unread: { [CANDID_USER_ID]: 0, [userId]: 0 },
    });
    await audit("message.official_thread_started", "conversation", id, { user_id: userId });
  }
  res.json({ id });
});

app.post("/api/owner/inbox/reply", async (req, res) => {
  const { channel, kind, id } = req.body || {};
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!validId(id) || !["direct", "support"].includes(channel) || !["direct", "support_chat"].includes(kind) || body.length < 1 || body.length > 4000) {
    return res.status(400).json({ error: "Invalid reply" });
  }
  const database = db();
  const timestamp = new Date().toISOString();
  const messageRef = database.collection(channel === "direct" ? "messages" : "support_messages").doc();

  if (channel === "direct" && kind === "direct") {
    await ensureCandidProfile(database);
    const conversationRef = database.collection("conversations").doc(id);
    const conversationSnap = await conversationRef.get();
    if (!conversationSnap.exists) return res.status(404).json({ error: "Conversation not found" });
    const conversation = conversationSnap.data();
    if (!conversation.participant_ids?.includes(CANDID_USER_ID) || conversation.participant_ids.length !== 2) {
      return res.status(409).json({ error: "Start a separate Candid conversation before replying to this private thread." });
    }
    const userId = conversation.participant_ids.find((participant) => participant !== CANDID_USER_ID);
    if (!userId) return res.status(409).json({ error: "This conversation has no member participant." });
    const batch = database.batch();
    batch.set(messageRef, {
      id: messageRef.id,
      conversation_id: id,
      sender_id: CANDID_USER_ID,
      body,
      created_at: timestamp,
      read_at: null,
      reactions: {},
    });
    batch.update(conversationRef, {
      last_message: body,
      last_message_at: timestamp,
      last_sender_id: CANDID_USER_ID,
      [`unread.${userId}`]: FieldValue.increment(1),
    });
    const notificationRef = database.collection("notifications").doc();
    batch.set(notificationRef, {
      id: notificationRef.id,
      user_id: userId,
      kind: "info",
      title: "New message from @candid",
      description: body.slice(0, 140),
      link: `/messages/${encodeURIComponent(id)}`,
      created_at: timestamp,
      read_at: null,
    });
    await batch.commit();
    await audit("message.official_reply_sent", "conversation", id, { user_id: userId });
    return res.json({ id: messageRef.id, created_at: timestamp });
  }

  if (channel === "support" && kind === "support_chat") {
    const conversationRef = database.collection("support_conversations").doc(id);
    const conversationSnap = await conversationRef.get();
    if (!conversationSnap.exists) return res.status(404).json({ error: "Support conversation not found" });
    const conversation = conversationSnap.data();
    const userId = conversation.user_id || id;
    const batch = database.batch();
    batch.set(messageRef, {
      id: messageRef.id,
      conversation_id: id,
      sender_id: CANDID_USER_ID,
      sender_type: "support",
      body,
      created_at: timestamp,
      read_at: null,
    });
    batch.set(conversationRef, {
      updated_at: timestamp,
      last_message_at: timestamp,
      last_message: body,
      last_sender: "support",
      staff_read_at: timestamp,
      status: "open",
    }, { merge: true });
    const notificationRef = database.collection("notifications").doc();
    batch.set(notificationRef, {
      id: notificationRef.id,
      user_id: userId,
      kind: "info",
      title: "Candid support replied",
      description: body.slice(0, 140),
      link: "/support",
      created_at: timestamp,
      read_at: null,
    });
    await batch.commit();
    await audit("support.reply_sent", "support_conversation", id, { user_id: userId });
    return res.json({ id: messageRef.id, created_at: timestamp });
  }

  return res.status(400).json({ error: "Tickets cannot be replied to from this inbox. Use the contact supplied." });
});

app.post("/api/owner/inbox/status", async (req, res) => {
  const { channel, kind, id, status } = req.body || {};
  if (!validId(id) || channel !== "support" || !["support_chat", "support_ticket"].includes(kind)) {
    return res.status(400).json({ error: "Invalid support thread" });
  }
  const allowed = kind === "support_chat" ? ["open", "closed"] : ["open", "resolved"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid support status" });
  const collectionName = kind === "support_chat" ? "support_conversations" : "support_tickets";
  const ref = db().collection(collectionName).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return res.status(404).json({ error: "Support thread not found" });
  await ref.set({ status, updated_at: new Date().toISOString() }, { merge: true });
  await audit(kind === "support_chat" ? `support.thread_${status}` : `support.ticket_${status}`, kind === "support_chat" ? "support_conversation" : "support_ticket", id);
  res.json({ ok: true, status });
});

app.post("/api/owner/actions", async (req, res) => {
  const input = req.body;
  if (!input || typeof input !== "object" || typeof input.id !== "string" || !input.id || input.id.length > 180 || input.id.includes("/")) {
    return res.status(400).json({ error: "Invalid owner action" });
  }
  const timestamp = new Date().toISOString();
  const database = db();

  if (input.entity === "story" && ["pending", "published", "hidden"].includes(input.status)) {
    const story = await document("stories", input.id);
    if (!story) return res.status(404).json({ error: "Story not found" });
    if (input.moderation_note !== undefined && input.moderation_note !== null && (typeof input.moderation_note !== "string" || input.moderation_note.length > 1000)) {
      return res.status(400).json({ error: "Invalid moderation note" });
    }
    await database.collection("stories").doc(input.id).update({
      status: input.status,
      moderation_note: input.moderation_note === undefined
        ? input.status === "published" ? null : story.moderation_note ?? null
        : input.moderation_note,
      moderated_at: timestamp,
    });
    await audit(`story.${input.status}`, "story", input.id, { moderation_note: input.moderation_note ?? null });
  } else if (input.entity === "comment" && ["published", "hidden"].includes(input.status)) {
    const comments = await collection("comments");
    const selected = comments.find((item) => item.id === input.id);
    if (!selected) return res.status(404).json({ error: "Comment not found" });
    const targets = new Set([input.id]);
    if (input.status === "hidden") {
      const byParent = new Map();
      for (const comment of comments) {
        if (!comment.parent_id) continue;
        const children = byParent.get(comment.parent_id) || [];
        children.push(comment.id);
        byParent.set(comment.parent_id, children);
      }
      const frontier = [input.id];
      while (frontier.length) {
        const parent = frontier.pop();
        for (const child of byParent.get(parent) || []) {
          if (!targets.has(child)) { targets.add(child); frontier.push(child); }
        }
      }
    }
    const changed = comments.filter((item) => targets.has(item.id) && item.status !== input.status);
    const countDelta = changed.reduce((delta, item) => delta + (input.status === "hidden"
      ? item.status === "published" ? -1 : 0
      : item.status === "published" ? 0 : 1), 0);
    for (let start = 0; start < changed.length; start += 450) {
      const batch = database.batch();
      for (const comment of changed.slice(start, start + 450)) {
        batch.update(database.collection("comments").doc(comment.id), { status: input.status });
      }
      if (start === 0 && countDelta !== 0) {
        batch.update(database.collection("stories").doc(selected.story_id), { comment_count: FieldValue.increment(countDelta) });
      }
      await batch.commit();
    }
    await audit(`comment.${input.status}`, "comment", input.id, { affected: changed.length });
  } else if (input.entity === "report" && ["open", "resolved", "dismissed"].includes(input.status)) {
    if (!(await document("reports", input.id))) return res.status(404).json({ error: "Report not found" });
    await database.collection("reports").doc(input.id).update({ status: input.status, reviewed_at: timestamp });
    await audit(`report.${input.status}`, "report", input.id);
  } else if (input.entity === "user" && typeof input.banned === "boolean") {
    if (!(await document("profiles", input.id))) return res.status(404).json({ error: "User not found" });
    await database.collection("profiles").doc(input.id).update({ banned: input.banned });
    await audit(input.banned ? "user.banned" : "user.unbanned", "user", input.id);
  } else if (input.entity === "company") {
    if (!(await document("companies", input.id))) return res.status(404).json({ error: "Company not found" });
    const patch = {};
    for (const [field, maxLength] of [["industry", 80], ["county", 60]]) {
      if (!(field in input)) continue;
      if (input[field] !== null && (typeof input[field] !== "string" || input[field].length > maxLength)) {
        return res.status(400).json({ error: "Invalid company field" });
      }
      patch[field] = input[field];
    }
    if ("verified" in input) {
      if (typeof input.verified !== "boolean") return res.status(400).json({ error: "Invalid verification value" });
      patch.verified = input.verified;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: "No company changes supplied" });
    await database.collection("companies").doc(input.id).update(patch);
    await audit("company.updated", "company", input.id, patch);
  } else {
    return res.status(400).json({ error: "Invalid owner action" });
  }
  res.json({ ok: true });
});

app.use((error, _req, res, _next) => {
  if (error?.type === "entity.too.large") return res.status(413).json({ error: "Request is too large" });
  if (error instanceof SyntaxError) return res.status(400).json({ error: "Invalid JSON body" });
  const message = error?.message || "unknown error";
  console.error("[owner server] Request failed:", message);
  if (message.includes("FIREBASE_SERVICE_ACCOUNT_JSON")) {
    return res.status(503).json({ error: "Firebase credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON in the owner app's .env.local file, then restart the server." });
  }
  if (message.includes("service-account file was not found")) {
    return res.status(503).json({ error: "The Firebase credential file was not found. Check GOOGLE_APPLICATION_CREDENTIALS in the owner app's .env.local file." });
  }
  if (message.includes("service-account file is invalid or unreadable")) {
    return res.status(503).json({ error: "The Firebase credential file could not be read. Check that it is a valid service-account JSON file." });
  }
  res.status(500).json({ error: "Owner server could not complete the request" });
});

const dist = resolve(process.cwd(), "dist");
if (existsSync(resolve(dist, "index.html"))) {
  app.use(express.static(dist, { index: false }));
  app.get(/.*/, (_req, res) => res.sendFile(resolve(dist, "index.html")));
}

const host = "127.0.0.1";
if (!process.env.NETLIFY && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  createServer(app).listen(port, host, () => {
    console.log(`Candid Owner server listening on http://${host}:${port}`);
  });
}

export { app };
