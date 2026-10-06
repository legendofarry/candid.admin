import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Ban,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Flame,
  Heart,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  MessageSquareText,
  MessagesSquare,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  ownerRequest,
  postOwnerAction,
  type AuditEntry,
  type OwnerComment,
  type OwnerCompany,
  type OwnerInboxDetail,
  type OwnerInboxThread,
  type OwnerReport,
  type OwnerStats,
  type OwnerUser,
  type SiteContact,
  type Story,
  type StoryStatus,
} from "./api";

type Section =
  | "overview"
  | "inbox"
  | "stories"
  | "reports"
  | "comments"
  | "companies"
  | "people"
  | "contact"
  | "audit";
const PAGE_SIZE = 50;

const navigation: { id: Section; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "Workspace" },
  { id: "inbox", label: "Inbox", icon: Inbox, group: "Workspace" },
  { id: "stories", label: "Stories", icon: FileText, group: "Moderation" },
  { id: "reports", label: "Reports", icon: ShieldAlert, group: "Moderation" },
  { id: "comments", label: "Comments", icon: MessageSquareText, group: "Moderation" },
  { id: "companies", label: "Companies", icon: Building2, group: "Directory" },
  { id: "people", label: "People", icon: UsersRound, group: "Directory" },
  { id: "contact", label: "Site contact", icon: LifeBuoy, group: "Configuration" },
  { id: "audit", label: "Audit log", icon: Activity, group: "Configuration" },
];

function useOwnerData<T>(path: string | null, revision: number) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    setData(null);
    setLoading(true);
    setError("");
    void ownerRequest<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Could not load this section");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);

  return { data, loading, error };
}

function useDebouncedValue(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function App() {
  return <OwnerConsole />;
}

function OwnerConsole() {
  const [section, setSection] = useState<Section>("overview");
  const [revision, setRevision] = useState(0);
  const [inboxThreadToOpen, setInboxThreadToOpen] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const stats = useOwnerData<OwnerStats>("/stats", revision);

  async function runAction(action: object) {
    setBusy(true);
    setActionError("");
    try {
      await postOwnerAction(action);
      setRevision((value) => value + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The change could not be saved");
    } finally {
      setBusy(false);
    }
  }

  const current = navigation.find((item) => item.id === section)!;
  const sectionView = () => {
    const shared = { revision, runAction, busy };
    switch (section) {
      case "overview":
        return (
          <Overview
            stats={stats.data}
            loading={stats.loading}
            error={stats.error}
            onNavigate={setSection}
          />
        );
      case "inbox":
        return <InboxView revision={revision} initialThreadId={inboxThreadToOpen} />;
      case "stories":
        return <StoriesView {...shared} />;
      case "reports":
        return <ReportsView {...shared} />;
      case "comments":
        return <CommentsView {...shared} />;
      case "companies":
        return <CompaniesView {...shared} />;
      case "people":
        return <PeopleView {...shared} onOpenConversation={(id) => {
          setInboxThreadToOpen(id);
          setSection("inbox");
        }} />;
      case "contact":
        return <ContactView {...shared} />;
      case "audit":
        return <AuditView {...shared} />;
    }
  };

  return (
    <div className="console-shell">
      <aside className="side-rail">
        <a
          className="brand"
          href="#overview"
          onClick={(event) => {
            event.preventDefault();
            setSection("overview");
          }}
        >
          <span className="brand-mark">
            <Flame size={18} strokeWidth={2.4} />
          </span>
          <span>
            <strong>Candid</strong>
            <small>Owner console</small>
          </span>
        </a>
        <nav className="side-nav" aria-label="Owner navigation">
          {navigation.map((item, index) => {
            const previous = navigation[index - 1];
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {item.group !== previous?.group ? <p className="nav-label">{item.group}</p> : null}
                <button
                  className={`nav-link ${section === item.id ? "is-active" : ""}`}
                  onClick={() => setSection(item.id)}
                >
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {item.id === "reports" && stats.data?.reportsOpen ? (
                    <span className="nav-count">{stats.data.reportsOpen}</span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </nav>
        <div className="rail-bottom">
          <div className="connection-state">
            <span className="live-dot" /> Owner API connected
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="crumb">
            <span>Owner console</span>
            <ChevronRight size={14} />
            <strong>{current.label}</strong>
          </div>
          <div className="top-actions">
            <span className="secure-label">Owner workspace</span>
            <button
              className="icon-button"
              title="Refresh data"
              aria-label="Refresh data"
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw size={16} />
            </button>
            <span className="owner-avatar">CO</span>
          </div>
        </header>
        <main className="content-area" key={section}>
          {actionError ? (
            <div className="load-error action-error">
              <AlertTriangle size={16} />
              <span>{actionError}</span>
              <button onClick={() => setActionError("")} aria-label="Dismiss error">
                <X size={15} />
              </button>
            </div>
          ) : null}
          <div className="section-enter">{sectionView()}</div>
        </main>
      </div>
    </div>
  );
}

const OFFICIAL_ID = "candid-official";

function inboxKey(thread: OwnerInboxThread) {
  return `${thread.kind}:${thread.id}`;
}

function InboxView({ revision, initialThreadId = "" }: { revision: number; initialThreadId?: string }) {
  const [channel, setChannel] = useState<"direct" | "support">("direct");
  const [selectedKey, setSelectedKey] = useState("");
  const [localRevision, setLocalRevision] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState("");
  const list = useOwnerData<{ threads: OwnerInboxThread[] }>(
    `/inbox?channel=${channel}`,
    revision + localRevision,
  );
  const threads = list.data?.threads ?? [];
  const selected = threads.find((thread) => inboxKey(thread) === selectedKey) ?? null;
  const detailPath = selected
    ? `/inbox/thread?channel=${selected.channel}&kind=${selected.kind}&id=${encodeURIComponent(selected.id)}`
    : null;
  const detail = useOwnerData<OwnerInboxDetail>(detailPath, revision + localRevision);

  useEffect(() => {
    setSelectedKey("");
    setDraft("");
  }, [channel]);

  useEffect(() => {
    if (initialThreadId) {
      setChannel("direct");
      setSelectedKey(`direct:${initialThreadId}`);
    }
  }, [initialThreadId]);

  useEffect(() => {
    if (list.loading || !list.data) return;
    setSelectedKey((current) =>
      threads.some((thread) => inboxKey(thread) === current)
        ? current
        : threads[0]
          ? inboxKey(threads[0])
          : "",
    );
  }, [list.loading, list.data, threads]);

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !canReply || !draft.trim()) return;
    setSending(true);
    setActionError("");
    try {
      await ownerRequest("/inbox/reply", {
        method: "POST",
        body: JSON.stringify({
          channel: selected.channel,
          kind: selected.kind,
          id: selected.id,
          body: draft.trim(),
        }),
      });
      setDraft("");
      setLocalRevision((value) => value + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The reply could not be sent");
    } finally {
      setSending(false);
    }
  }

  const canReply = selected?.kind === "support_chat" ||
    (selected?.kind === "direct" && selected.can_reply_as_candid);

  async function startOfficialThread() {
    const target = selected?.participants?.find((participant) => participant.id !== OFFICIAL_ID);
    if (!target) return;
    setSending(true);
    setActionError("");
    try {
      const result = await ownerRequest<{ id: string }>("/inbox/direct-start", {
        method: "POST",
        body: JSON.stringify({ user_id: target.id }),
      });
      setLocalRevision((value) => value + 1);
      setSelectedKey(`direct:${result.id}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not open a Candid conversation");
    } finally {
      setSending(false);
    }
  }

  async function updateSupportStatus() {
    if (!selected || selected.channel !== "support") return;
    const status = selected.status === "open"
      ? selected.kind === "support_chat" ? "closed" : "resolved"
      : "open";
    setSending(true);
    setActionError("");
    try {
      await ownerRequest("/inbox/status", {
        method: "POST",
        body: JSON.stringify({ channel: selected.channel, kind: selected.kind, id: selected.id, status }),
      });
      setLocalRevision((value) => value + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update support status");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="COMMUNITY / PRIVATE MESSAGES"
        title="Inbox"
        description="Review member conversations and respond to Candid support chats. Opening threads and sending replies are recorded in the audit log."
      />
      <div className="toolbar-row">
        <div className="segmented-filter" role="tablist" aria-label="Inbox type">
          <button className={channel === "direct" ? "active" : ""} onClick={() => setChannel("direct")} role="tab" aria-selected={channel === "direct"}>
            <MessagesSquare size={13} /> Direct messages
          </button>
          <button className={channel === "support" ? "active" : ""} onClick={() => setChannel("support")} role="tab" aria-selected={channel === "support"}>
            <LifeBuoy size={13} /> Help & support
          </button>
        </div>
        <span className="result-count">{threads.length} conversations</span>
      </div>

      {list.error ? <LoadError message={list.error} /> : null}
      {actionError ? <LoadError message={actionError} /> : null}

      <div className="inbox-layout">
        <section className="inbox-list surface-panel">
          <div className="panel-heading">
            <div>
              <h2>{channel === "direct" ? "Member conversations" : "Support conversations"}</h2>
              <p>{channel === "direct" ? "Private one-to-one chats across Candid." : "Live support chats and submitted support tickets."}</p>
            </div>
            <button className="icon-button" title="Refresh inbox" aria-label="Refresh inbox" onClick={() => setLocalRevision((value) => value + 1)}>
              <RefreshCw size={15} />
            </button>
          </div>
          {list.loading && !list.data ? <LoadingRows /> : null}
          {!list.loading && threads.length === 0 ? (
            <EmptyState title="No conversations yet" detail={channel === "direct" ? "Member messages will appear here." : "Support chats and tickets will appear here."} />
          ) : null}
          <div className="inbox-thread-list">
            {threads.map((thread) => (
              <button
                type="button"
                key={inboxKey(thread)}
                className={`record-row ${selectedKey === inboxKey(thread) ? "selected" : ""}`}
                onClick={() => setSelectedKey(inboxKey(thread))}
              >
                <span className="avatar-small">{thread.kind === "support_ticket" ? <Mail size={14} /> : <MessageSquareText size={15} />}</span>
                <span className="record-row-main">
                  <span className="record-title">
                    <span>{thread.subject || thread.participants?.filter((participant) => participant.id !== OFFICIAL_ID).map((participant) => `@${participant.username}`).join(" · ") || "Member conversation"}</span>
                    {thread.unread > 0 ? <span className="inbox-unread">{thread.unread > 99 ? "99+" : thread.unread}</span> : null}
                  </span>
                  <span className="record-excerpt">{thread.preview}</span>
                  <span className="record-subtitle">{thread.kind === "support_ticket" ? `${thread.category} · ticket` : thread.kind === "support_chat" ? "Support chat" : "Direct message"} · {formatDateTime(thread.last_message_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="inbox-detail surface-panel">
          {!selected ? (
            <EmptyState title="Choose a conversation" detail="Select a row to read the full thread." />
          ) : (
            <>
              <div className="panel-heading inbox-detail-heading">
                <div>
                  <p className="eyebrow">{selected.kind === "direct" ? "DIRECT MESSAGE" : selected.kind === "support_chat" ? "SUPPORT CHAT" : "SUPPORT TICKET"}</p>
                  <h2>{selected.subject || selected.participants?.filter((participant) => participant.id !== OFFICIAL_ID).map((participant) => `@${participant.username}`).join(" · ") || "Member conversation"}</h2>
                  <p>{selected.category ? `Category: ${selected.category} · ` : ""}{selected.status}</p>
                </div>
                <div className="inbox-heading-actions">
                  {selected.unread > 0 ? <span className="status-badge status-open"><i />{selected.unread} unread</span> : null}
                  {selected.channel === "support" ? <button className="secondary-button" disabled={sending} onClick={() => void updateSupportStatus()}>{selected.status === "open" ? selected.kind === "support_chat" ? "Close chat" : "Resolve ticket" : "Reopen"}</button> : null}
                </div>
              </div>
              {detail.error ? <LoadError message={detail.error} /> : null}
              {detail.loading && !detail.data ? <LoadingRows /> : null}
              {detail.data?.ticket ? (
                <div className="inbox-contact"><strong>Contact supplied</strong><span>{detail.data.ticket.contact || "Not supplied"}</span></div>
              ) : null}
              <div className="inbox-messages">
                {(detail.data?.messages ?? []).map((message) => {
                  const isOfficial = selected.kind === "direct"
                    ? message.sender_id === OFFICIAL_ID
                    : message.sender_type !== "user";
                  const sender = selected.kind === "direct"
                    ? selected.participants?.find((participant) => participant.id === message.sender_id)?.username || "member"
                    : isOfficial ? "Candid support" : selected.subject || "member";
                  return (
                    <article key={message.id} className={`inbox-message ${isOfficial ? "is-owner" : ""}`}>
                      <div className="inbox-message-meta"><strong>{isOfficial ? "Candid official" : `@${sender}`}</strong><time>{formatDateTime(message.created_at)}</time></div>
                      <p>{message.body}</p>
                    </article>
                  );
                })}
                {detail.data?.messages.length === 0 ? <EmptyState title="No messages yet" detail="Send the first message to start this conversation." /> : null}
              </div>

              {selected.kind === "direct" && !selected.can_reply_as_candid ? (
                <div className="inbox-reply-note">
                  <p>This is a private member-to-member chat. Start a separate conversation if Candid needs to contact one member.</p>
                  <button className="secondary-button" disabled={sending} onClick={() => void startOfficialThread()}><MessageSquareText size={14} /> Start a private Candid conversation</button>
                </div>
              ) : selected.kind === "support_ticket" ? (
                <div className="inbox-reply-note"><p>This is a one-time ticket from the public support form. Reply using the contact supplied by the member.</p></div>
              ) : (
                <form className="inbox-reply" onSubmit={(event) => void reply(event)}>
                  <textarea className="textarea-control" value={draft} maxLength={4000} onChange={(event) => setDraft(event.target.value)} placeholder={selected.kind === "direct" ? "Reply as Candid official…" : "Reply as Candid support…"} aria-label="Write a reply" />
                  <div className="inbox-reply-footer"><span>{selected.kind === "direct" ? "The member receives this in their Candid messages." : "The member receives this in their support chat."}</span><button className="primary-button" disabled={sending || !draft.trim()}><Send size={14} />{sending ? "Sending…" : "Send reply"}</button></div>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

function Overview({
  stats,
  loading,
  error,
  onNavigate,
}: {
  stats: OwnerStats | null;
  loading: boolean;
  error: string;
  onNavigate: (section: Section) => void;
}) {
  if (error) return <LoadError message={error} />;
  const metrics = [
    {
      label: "Published stories",
      value: stats?.stories.published,
      icon: FileText,
      delta: `${stats?.stories.last7Days ?? 0} this week`,
      tone: "green",
    },
    {
      label: "Needs review",
      value: stats?.stories.pending,
      icon: Clock3,
      delta: "Story queue",
      tone: "amber",
      action: "stories" as Section,
    },
    {
      label: "Open reports",
      value: stats?.reportsOpen,
      icon: ShieldAlert,
      delta: "Requires attention",
      tone: "red",
      action: "reports" as Section,
    },
    {
      label: "Community",
      value: stats?.users.total,
      icon: UsersRound,
      delta: `${stats?.users.banned ?? 0} restricted`,
      tone: "cyan",
      action: "people" as Section,
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="OPERATIONS / SNAPSHOT"
        title="Overview"
        description="A live view of Candid content, community health, and moderation workload."
      />
      <div className="metric-grid">
        {metrics.map(({ label, value, icon: Icon, delta, tone, action }) => (
          <button
            key={label}
            className={`metric-card tone-${tone}`}
            onClick={() => action && onNavigate(action)}
          >
            <div className="metric-top">
              <span>{label}</span>
              <span className="metric-icon">
                <Icon size={17} />
              </span>
            </div>
            <strong>{loading ? "—" : (value ?? 0).toLocaleString()}</strong>
            <small>{delta}</small>
            {action ? <ChevronRight className="metric-arrow" size={15} /> : null}
          </button>
        ))}
      </div>
      <div className="overview-grid">
        <section className="surface-panel overview-queues">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">MODERATION</p>
              <h2>Queues at a glance</h2>
            </div>
            <span className="status-tag">Live totals</span>
          </div>
          <button className="queue-row" onClick={() => onNavigate("stories")}>
            <span className="queue-icon amber">
              <FileText size={17} />
            </span>
            <span className="queue-text">
              <strong>Story review</strong>
              <small>Pending publication decisions</small>
            </span>
            <b>{stats?.stories.pending ?? 0}</b>
            <ChevronRight size={16} />
          </button>
          <button className="queue-row" onClick={() => onNavigate("reports")}>
            <span className="queue-icon red">
              <ShieldAlert size={17} />
            </span>
            <span className="queue-text">
              <strong>Reported content</strong>
              <small>Open reports awaiting review</small>
            </span>
            <b>{stats?.reportsOpen ?? 0}</b>
            <ChevronRight size={16} />
          </button>
          <button className="queue-row" onClick={() => onNavigate("comments")}>
            <span className="queue-icon cyan">
              <MessageSquareText size={17} />
            </span>
            <span className="queue-text">
              <strong>Comment moderation</strong>
              <small>Published comments in the shared database</small>
            </span>
            <b>{stats?.comments ?? 0}</b>
            <ChevronRight size={16} />
          </button>
        </section>
        <section className="surface-panel inventory-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">DATABASE</p>
              <h2>Workspace inventory</h2>
            </div>
            <Activity size={18} className="muted-icon" />
          </div>
          <InventoryRow icon={<Building2 size={16} />} label="Companies" value={stats?.companies} />
          <InventoryRow
            icon={<Ban size={16} />}
            label="Restricted accounts"
            value={stats?.users.banned}
          />
          <InventoryRow
            icon={<ArrowUpRight size={16} />}
            label="Salary contributions"
            value={stats?.salaryReports}
          />
          <InventoryRow
            icon={<BadgeCheck size={16} />}
            label="Company ratings"
            value={stats?.companyRatings}
          />
          <p className="updated-note">
            Updated {stats?.generatedAt ? formatDateTime(stats.generatedAt) : "when data loads"}
          </p>
        </section>
      </div>
      <div className="notice-strip">
        <ShieldCheck size={17} />
        <span>All changes made here are recorded in the owner audit log.</span>
        <button onClick={() => onNavigate("audit")}>
          View audit log <ArrowUpRight size={14} />
        </button>
      </div>
    </>
  );
}

function InventoryRow({ icon, label, value }: { icon: ReactNode; label: string; value?: number }) {
  return (
    <div className="inventory-row">
      <span>
        {icon}
        {label}
      </span>
      <strong>{(value ?? 0).toLocaleString()}</strong>
    </div>
  );
}

function StoriesView({ revision, runAction, busy }: ViewProps) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | StoryStatus>("pending");
  const [selectedId, setSelectedId] = useState("");
  const [note, setNote] = useState("");
  const search = useDebouncedValue(query);
  const path = `/stories?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}${filter === "all" ? "" : `&status=${filter}`}${search ? `&q=${encodeURIComponent(search)}` : ""}`;
  const { data, loading, error } = useOwnerData<{ total: number; stories: Story[] }>(
    path,
    revision,
  );
  const stories = data?.stories ?? [];
  const selected = stories.find((story) => story.id === selectedId) ?? stories[0];
  useEffect(
    () => setNote(selected?.moderation_note ?? ""),
    [selected?.id, selected?.moderation_note],
  );
  useEffect(() => setPage(0), [filter, search]);

  return (
    <>
      <PageHeading
        eyebrow="MODERATION / STORIES"
        title="Story review"
        description="Review submissions, update publication status, and keep moderation decisions traceable."
      />
      <div className="toolbar-row">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search titles, employers, or text"
        />
        <select
          className="select-control"
          value={filter}
          onChange={(event) => setFilter(event.target.value as typeof filter)}
        >
          <option value="pending">Pending</option>
          <option value="published">Published</option>
          <option value="hidden">Hidden</option>
          <option value="all">All statuses</option>
        </select>
        <span className="result-count">{data?.total ?? 0} matches</span>
      </div>
      {error ? <LoadError message={error} /> : null}
      <div className="master-detail">
        <div className="list-column">
          <section className="surface-panel record-list">
            {loading && !data ? (
              <LoadingRows />
            ) : stories.length ? (
              stories.map((story) => (
                <button
                  key={story.id}
                  className={`record-row ${selected?.id === story.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(story.id)}
                >
                  <span className="record-row-main">
                    <span className="record-title">{story.title}</span>
                    <span className="record-subtitle">
                      {story.company_name || "Unlinked employer"} ·{" "}
                      {story.county || "Location not set"} · {formatDate(story.created_at)}
                    </span>
                    <span className="record-excerpt">{story.body}</span>
                  </span>
                  <StatusBadge value={story.status} />
                </button>
              ))
            ) : (
              <EmptyState
                title="No stories in this view"
                detail="Try another status or adjust your search."
              />
            )}
          </section>
          <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onChange={setPage} />
        </div>
        {selected ? (
          <aside className="surface-panel inspector">
            <div className="inspector-top">
              <span className="eyebrow">STORY · {selected.id.slice(0, 8)}</span>
              <StatusBadge value={selected.status} />
            </div>
            <h2>{selected.title}</h2>
            <p className="inspector-meta">
              {selected.company_name || "Unlinked employer"} ·{" "}
              {selected.industry || "Industry not set"} · {selected.county || "County not set"}
            </p>
            <div className="story-copy">{selected.body}</div>
            <div className="reason-list">
              {selected.reasons?.map((reason) => (
                <span key={reason}>{reason}</span>
              ))}
            </div>
            <div className="detail-stats">
              <span>
                <ArrowUpRight size={14} /> {selected.upvotes} votes
              </span>
              <span>
                <MessageSquareText size={14} /> {selected.comment_count} comments
              </span>
              <span>
                <UserRound size={14} /> {selected.profiles?.handle || "Anonymous"}
              </span>
            </div>
            <label className="field-label" htmlFor="moderation-note">
              Moderation note
            </label>
            <textarea
              id="moderation-note"
              className="textarea-control"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional internal note"
            />
            <div className="action-row">
              <button
                className="primary-button"
                disabled={busy}
                onClick={() =>
                  void runAction({
                    entity: "story",
                    id: selected.id,
                    status: "published",
                    moderation_note: note || null,
                  })
                }
              >
                <Check size={15} /> Publish
              </button>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  void runAction({
                    entity: "story",
                    id: selected.id,
                    status: "pending",
                    moderation_note: note || null,
                  })
                }
              >
                <Clock3 size={15} /> Return to queue
              </button>
              <button
                className="danger-button"
                disabled={busy}
                onClick={() =>
                  void runAction({
                    entity: "story",
                    id: selected.id,
                    status: "hidden",
                    moderation_note: note || null,
                  })
                }
              >
                <X size={15} /> Hide
              </button>
            </div>
          </aside>
        ) : null}
      </div>
    </>
  );
}

function ReportsView({ revision, runAction, busy }: ViewProps) {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<"open" | "resolved" | "dismissed" | "all">("open");
  const [selectedId, setSelectedId] = useState("");
  const path = `/reports?status=${filter}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
  const { data, loading, error } = useOwnerData<{ total: number; reports: OwnerReport[] }>(
    path,
    revision,
  );
  const reports = data?.reports ?? [];
  const selected = reports.find((report) => report.id === selectedId) ?? reports[0];
  useEffect(() => setPage(0), [filter]);
  return (
    <>
      <PageHeading
        eyebrow="MODERATION / REPORTS"
        title="Report queue"
        description="Investigate user reports, review the linked content, and record a clear outcome."
      />
      <div className="toolbar-row">
        <div className="segmented-filter">
          {(["open", "resolved", "dismissed", "all"] as const).map((value) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? "All" : value[0]!.toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        <span className="result-count">{data?.total ?? 0} reports</span>
      </div>
      {error ? <LoadError message={error} /> : null}
      <div className="master-detail">
        <div className="list-column">
          <section className="surface-panel record-list">
            {loading && !data ? (
              <LoadingRows />
            ) : reports.length ? (
              reports.map((report) => (
                <button
                  key={report.id}
                  className={`record-row ${selected?.id === report.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(report.id)}
                >
                  <span className={`queue-icon ${report.status === "open" ? "red" : "green"}`}>
                    <AlertTriangle size={16} />
                  </span>
                  <span className="record-row-main">
                    <span className="record-title">{report.reason || "Reported content"}</span>
                    <span className="record-subtitle">
                      {report.target_type} ·{" "}
                      {report.target?.title || report.target?.body || "Target unavailable"}
                    </span>
                    <span className="record-excerpt">
                      {report.detail || "No extra details supplied"}
                    </span>
                  </span>
                  <StatusBadge value={report.status} />
                </button>
              ))
            ) : (
              <EmptyState title="Queue is clear" detail="There are no reports with this status." />
            )}
          </section>
          <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onChange={setPage} />
        </div>
        {selected ? (
          <aside className="surface-panel inspector">
            <div className="inspector-top">
              <span className="eyebrow">REPORT · {selected.target_type.toUpperCase()}</span>
              <StatusBadge value={selected.status} />
            </div>
            <h2>{selected.reason}</h2>
            <p className="inspector-meta">
              Received {formatDateTime(selected.created_at)} · Target{" "}
              {selected.target_id.slice(0, 12)}
            </p>
            <div className="report-note">
              <span className="eyebrow">REPORTER CONTEXT</span>
              <p>{selected.detail || "No additional context was provided."}</p>
            </div>
            <div className="report-target">
              <span className="eyebrow">REPORTED CONTENT</span>
              <strong>
                {selected.target?.title || selected.target?.body || "Content unavailable"}
              </strong>
              <p>
                {selected.target?.body ||
                  selected.target?.company_name ||
                  "This content may have been removed."}
              </p>
            </div>
            <div className="action-stack">
              {selected.status === "open" ? (
                <>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() =>
                      void runAction({ entity: "report", id: selected.id, status: "resolved" })
                    }
                  >
                    <Check size={15} /> Resolve report
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() =>
                      void runAction({ entity: "report", id: selected.id, status: "dismissed" })
                    }
                  >
                    Dismiss report
                  </button>
                  <button
                    className="danger-button"
                    disabled={busy}
                    onClick={() =>
                      void runAction(
                        selected.target_type === "story"
                          ? {
                              entity: "story",
                              id: selected.target_id,
                              status: "hidden",
                              moderation_note: `Hidden after report ${selected.id}`,
                            }
                          : { entity: "comment", id: selected.target_id, status: "hidden" },
                      )
                    }
                  >
                    <Ban size={15} /> Hide reported {selected.target_type}
                  </button>
                </>
              ) : (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() =>
                    void runAction({ entity: "report", id: selected.id, status: "open" })
                  }
                >
                  Reopen report
                </button>
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </>
  );
}

function CommentsView({ revision, runAction, busy }: ViewProps) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const search = useDebouncedValue(query);
  const path = `/comments?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}${search ? `&q=${encodeURIComponent(search)}` : ""}`;
  const { data, loading, error } = useOwnerData<{ total: number; comments: OwnerComment[] }>(
    path,
    revision,
  );
  const comments = data?.comments ?? [];
  const selected = comments.find((comment) => comment.id === selectedId) ?? comments[0];
  useEffect(() => setPage(0), [search]);
  return (
    <>
      <PageHeading
        eyebrow="MODERATION / COMMENTS"
        title="Comment review"
        description="Review discussion content and hide or restore a comment thread when necessary."
      />
      <div className="toolbar-row">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search comment, handle, or story"
        />
        <span className="result-count">{comments.length} loaded</span>
      </div>
      {error ? <LoadError message={error} /> : null}
      <div className="master-detail">
        <div className="list-column">
          <section className="surface-panel record-list">
            {loading && !data ? (
              <LoadingRows />
            ) : comments.length ? (
              comments.map((comment) => (
                <button
                  key={comment.id}
                  className={`record-row ${selected?.id === comment.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(comment.id)}
                >
                  <span className="avatar-small">
                    {(comment.author_handle || "A").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="record-row-main">
                    <span className="record-title">
                      {comment.author_handle}{" "}
                      <span className="record-muted">· {formatDateTime(comment.created_at)}</span>
                    </span>
                    <span className="record-subtitle">
                      {comment.story?.title || "Story unavailable"}
                    </span>
                    <span className="record-excerpt">{comment.body}</span>
                  </span>
                  <StatusBadge value={comment.status} />
                </button>
              ))
            ) : (
              <EmptyState title="No matching comments" detail="Try a different search phrase." />
            )}
          </section>
          <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onChange={setPage} />
        </div>
        {selected ? (
          <aside className="surface-panel inspector">
            <div className="inspector-top">
              <span className="eyebrow">COMMENT · {selected.id.slice(0, 8)}</span>
              <StatusBadge value={selected.status} />
            </div>
            <h2>{selected.story?.title || "Story unavailable"}</h2>
            <p className="inspector-meta">
              {selected.story?.company_name || "Anonymous employer"} · {selected.author_handle}
            </p>
            <blockquote className="comment-quote">{selected.body}</blockquote>
            <div className="detail-stats">
              <span>
                <Heart size={14} /> {selected.likes ?? 0} likes
              </span>
              <span>
                <MessageSquareText size={14} /> {selected.parent_id ? "Reply" : "Top-level comment"}
              </span>
            </div>
            {selected.status === "published" ? (
              <button
                className="danger-button wide-button"
                disabled={busy}
                onClick={() =>
                  void runAction({ entity: "comment", id: selected.id, status: "hidden" })
                }
              >
                <Ban size={15} /> Hide comment thread
              </button>
            ) : (
              <button
                className="primary-button wide-button"
                disabled={busy}
                onClick={() =>
                  void runAction({ entity: "comment", id: selected.id, status: "published" })
                }
              >
                <Check size={15} /> Restore comment
              </button>
            )}
            <p className="hint-text">
              Hiding a comment also hides its replies from public story pages.
            </p>
          </aside>
        ) : null}
      </div>
    </>
  );
}

function CompaniesView({ revision, runAction, busy }: ViewProps) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const search = useDebouncedValue(query);
  const path = `/companies?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}${search ? `&q=${encodeURIComponent(search)}` : ""}`;
  const { data, loading, error } = useOwnerData<{ total: number; companies: OwnerCompany[] }>(
    path,
    revision,
  );
  const companies = data?.companies ?? [];
  const selected = companies.find((company) => company.id === selectedId) ?? companies[0];
  const [industry, setIndustry] = useState("");
  const [county, setCounty] = useState("");
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    setIndustry(selected?.industry ?? "");
    setCounty(selected?.county ?? "");
    setVerified(Boolean(selected?.verified));
  }, [selected?.id, selected?.industry, selected?.county, selected?.verified]);
  useEffect(() => setPage(0), [search]);
  return (
    <>
      <PageHeading
        eyebrow="DIRECTORY / COMPANIES"
        title="Company directory"
        description="Maintain company classifications and official verification status."
      />
      <div className="toolbar-row">
        <SearchField value={query} onChange={setQuery} placeholder="Find a company" />
        <span className="result-count">
          {companies.length} of {data?.total ?? 0}
        </span>
      </div>
      {error ? <LoadError message={error} /> : null}
      <div className="master-detail">
        <div className="list-column">
          <section className="surface-panel record-list">
            {loading && !data ? (
              <LoadingRows />
            ) : companies.length ? (
              companies.map((company) => (
                <button
                  key={company.id}
                  className={`record-row ${selected?.id === company.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(company.id)}
                >
                  <span className="queue-icon cyan">
                    <Building2 size={17} />
                  </span>
                  <span className="record-row-main">
                    <span className="record-title">
                      {company.name}
                      {company.verified ? (
                        <BadgeCheck className="verified-inline" size={14} />
                      ) : null}
                    </span>
                    <span className="record-subtitle">
                      {company.industry || "Unclassified"} · {company.county || "County not set"}
                    </span>
                    <span className="record-excerpt">
                      {company.company_ai_profiles?.descriptor ||
                        company.company_ai_profiles?.summary ||
                        company.slug}
                    </span>
                  </span>
                  <ChevronRight size={16} className="row-chevron" />
                </button>
              ))
            ) : (
              <EmptyState title="No companies match" detail="Try changing your search." />
            )}
          </section>
          <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onChange={setPage} />
        </div>
        {selected ? (
          <aside className="surface-panel inspector">
            <div className="inspector-top">
              <span className="eyebrow">COMPANY RECORD</span>
              {selected.verified ? (
                <span className="verified-label">
                  <BadgeCheck size={14} /> Verified
                </span>
              ) : (
                <span className="status-tag">Unverified</span>
              )}
            </div>
            <h2>{selected.name}</h2>
            <p className="inspector-meta">
              /{selected.slug} · Added {formatDate(selected.created_at)}
            </p>
            <label className="field-label" htmlFor="company-industry">
              Industry
            </label>
            <input
              id="company-industry"
              className="input-control"
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
              placeholder="Not classified"
            />
            <label className="field-label" htmlFor="company-county">
              County
            </label>
            <input
              id="company-county"
              className="input-control"
              value={county}
              onChange={(event) => setCounty(event.target.value)}
              placeholder="Not set"
            />
            <label className="switch-row">
              <span>
                <strong>Official company account</strong>
                <small>Show verification across Candid</small>
              </span>
              <input
                type="checkbox"
                checked={verified}
                onChange={(event) => setVerified(event.target.checked)}
              />
            </label>
            <button
              className="primary-button wide-button"
              disabled={busy}
              onClick={() =>
                void runAction({
                  entity: "company",
                  id: selected.id,
                  industry: industry || null,
                  county: county || null,
                  verified,
                })
              }
            >
              <Check size={15} /> Save company changes
            </button>
          </aside>
        ) : null}
      </div>
    </>
  );
}

function PeopleView({
  revision,
  runAction,
  busy,
  onOpenConversation,
}: ViewProps & { onOpenConversation: (id: string) => void }) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [messaging, setMessaging] = useState(false);
  const [messageError, setMessageError] = useState("");
  const search = useDebouncedValue(query);
  const path = `/users?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}${search ? `&q=${encodeURIComponent(search)}` : ""}`;
  const { data, loading, error } = useOwnerData<{ total: number; users: OwnerUser[] }>(
    path,
    revision,
  );
  const people = data?.users ?? [];
  const selected = people.find((person) => person.id === selectedId) ?? people[0];
  useEffect(() => setPage(0), [search]);

  async function startConversation() {
    if (!selected || selected.banned || messaging) return;
    setMessaging(true);
    setMessageError("");
    try {
      const conversation = await ownerRequest<{ id: string }>("/inbox/direct-start", {
        method: "POST",
        body: JSON.stringify({ user_id: selected.id }),
      });
      onOpenConversation(conversation.id);
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : "Could not start a Candid conversation.");
    } finally {
      setMessaging(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="DIRECTORY / PEOPLE"
        title="Community accounts"
        description="Inspect anonymous profiles and restrict accounts when needed."
      />
      <div className="toolbar-row">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search handles or account IDs"
        />
        <span className="result-count">
          {people.length} of {data?.total ?? 0}
        </span>
      </div>
      {error ? <LoadError message={error} /> : null}
      <div className="master-detail">
        <div className="list-column">
          <section className="surface-panel record-list">
            {loading && !data ? (
              <LoadingRows />
            ) : people.length ? (
              people.map((person) => (
                <button
                  key={person.id}
                  className={`record-row ${selected?.id === person.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(person.id)}
                >
                  <span className="avatar-small">
                    {(person.handle || "U").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="record-row-main">
                    <span className="record-title">
                      {person.username ? `@${person.username}` : person.handle}
                    </span>
                    <span className="record-subtitle">
                      {person.account_type || "Member"} · {person.county || "County not set"}
                    </span>
                    <span className="record-excerpt">Joined {formatDate(person.created_at)}</span>
                  </span>
                  {person.banned ? <StatusBadge value="banned" /> : null}
                </button>
              ))
            ) : (
              <EmptyState
                title="No accounts match"
                detail="Try a different handle or account ID."
              />
            )}
          </section>
          <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onChange={setPage} />
        </div>
        {selected ? (
          <aside className="surface-panel inspector">
            <div className="inspector-top">
              <span className="eyebrow">MEMBER PROFILE</span>
              <StatusBadge value={selected.banned ? "banned" : "active"} />
            </div>
            <div className="profile-summary">
              <span className="profile-avatar">
                {(selected.handle || "U").slice(0, 1).toUpperCase()}
              </span>
              <div>
                <h2>{selected.username ? `@${selected.username}` : selected.handle}</h2>
                <p className="inspector-meta">
                  {selected.account_type || "Individual"} · {selected.county || "County not set"}
                </p>
              </div>
            </div>
            <div className="fact-list">
              <Fact label="Account ID" value={selected.id} />
              <Fact label="Joined" value={formatDateTime(selected.created_at)} />
              <Fact label="Status" value={selected.banned ? "Restricted" : "Active"} />
            </div>
            {messageError ? <p className="form-error" role="alert">{messageError}</p> : null}
            <button
              className="primary-button wide-button"
              disabled={selected.banned || messaging}
              onClick={() => void startConversation()}
            >
              <MessageSquareText size={15} /> {messaging ? "Opening conversation…" : "Message as Candid"}
            </button>
            {selected.banned ? (
              <button
                className="primary-button wide-button"
                disabled={busy}
                onClick={() => void runAction({ entity: "user", id: selected.id, banned: false })}
              >
                <Check size={15} /> Restore account
              </button>
            ) : (
              <button
                className="danger-button wide-button"
                disabled={busy}
                onClick={() => void runAction({ entity: "user", id: selected.id, banned: true })}
              >
                <Ban size={15} /> Restrict account
              </button>
            )}
            <p className="hint-text">Restricted accounts can no longer post, comment, or vote.</p>
          </aside>
        ) : null}
      </div>
    </>
  );
}

function ContactView({ revision }: ViewProps) {
  const { data, loading, error } = useOwnerData<SiteContact>("/contact", revision);
  const [form, setForm] = useState<SiteContact>({
    email: null,
    phone: null,
    whatsapp: null,
    x: null,
    instagram: null,
    note: null,
    updated_at: null,
  });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  const fields: { key: keyof SiteContact; label: string; placeholder: string }[] = [
    { key: "email", label: "Support email", placeholder: "support@example.com" },
    { key: "phone", label: "Phone", placeholder: "+254 7xx xxx xxx" },
    { key: "whatsapp", label: "WhatsApp", placeholder: "+254 7xx xxx xxx" },
    { key: "x", label: "X profile", placeholder: "https://x.com/…" },
    { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/…" },
  ];
  async function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback("");
    try {
      await ownerRequest<SiteContact>("/contact", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setFeedback("Contact information saved.");
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "Could not save contact information.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="CONFIGURATION / CONTACT"
        title="Site contact"
        description="Edit the public contact details shown on the Candid site."
      />
      {error ? <LoadError message={error} /> : null}
      <form className="surface-panel contact-form" onSubmit={(event) => void saveContact(event)}>
        {loading && !data ? (
          <LoadingRows />
        ) : (
          <>
            <div className="form-grid">
              {fields.map((field) => (
                <label className="form-field" key={field.key}>
                  <span>{field.label}</span>
                  <input
                    className="input-control"
                    type="text"
                    value={String(form[field.key] ?? "")}
                    placeholder={field.placeholder}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [field.key]: event.target.value || null,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <label className="form-field">
              <span>Public note</span>
              <textarea
                className="textarea-control"
                rows={4}
                maxLength={600}
                value={form.note ?? ""}
                onChange={(event) =>
                  setForm((current) => ({ ...current, note: event.target.value || null }))
                }
                placeholder="A short message shown beside the support contacts."
              />
            </label>
            <div className="form-footer">
              <span className={feedback.includes("saved") ? "success-text" : "muted-text"}>
                {feedback ||
                  (data?.updated_at
                    ? `Last updated ${formatDateTime(data.updated_at)}`
                    : "No contact details saved yet")}
              </span>
              <button className="primary-button" disabled={saving}>
                {saving ? <span className="button-loader" /> : <Check size={15} />}
                {saving ? "Saving" : "Save changes"}
              </button>
            </div>
          </>
        )}
      </form>
    </>
  );
}

function AuditView({ revision }: ViewProps) {
  const [page, setPage] = useState(0);
  const { data, loading, error } = useOwnerData<{ total: number; entries: AuditEntry[] }>(
    `/audit?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
    revision,
  );
  return (
    <>
      <PageHeading
        eyebrow="CONFIGURATION / HISTORY"
        title="Owner audit log"
        description="A chronological record of changes made through the owner console."
      />
      {error ? <LoadError message={error} /> : null}
      <section className="surface-panel audit-list">
        {loading && !data ? (
          <LoadingRows />
        ) : data?.entries.length ? (
          data.entries.map((entry) => (
            <article className="audit-row" key={entry.id}>
              <span className="audit-symbol">
                <Activity size={15} />
              </span>
              <div className="audit-copy">
                <strong>{entry.action.replaceAll(".", " · ")}</strong>
                <span>
                  {entry.target_type || "system"} {entry.target_id ? `· ${entry.target_id}` : ""}
                </span>
                {entry.payload ? <code>{JSON.stringify(entry.payload)}</code> : null}
              </div>
              <time>{formatDateTime(entry.created_at)}</time>
            </article>
          ))
        ) : (
          <EmptyState
            title="No owner actions recorded"
            detail="Changes will appear here as the console is used."
          />
        )}
      </section>
      <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onChange={setPage} />
    </>
  );
}

function Pager({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <span>
        {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of {total}
      </span>
      <div>
        <button disabled={page === 0} onClick={() => onChange(page - 1)} aria-label="Previous page">
          <ChevronLeft size={15} />
        </button>
        <span>
          Page {page + 1} of {pages}
        </span>
        <button
          disabled={page + 1 >= pages}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

type ViewProps = {
  revision: number;
  runAction: (action: object) => Promise<void>;
  busy: boolean;
};

function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      <span className="heading-status">
        <span className="live-dot" /> OWNER API
      </span>
    </div>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search-field">
      <Search size={16} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase().replaceAll(" ", "-");
  return (
    <span className={`status-badge status-${normalized}`}>
      <i />
      {value}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact-row">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <span className="empty-mark">
        <Search size={18} />
      </span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="loading-list">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="load-error">
      <AlertTriangle size={16} />
      <span>{message}</span>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
