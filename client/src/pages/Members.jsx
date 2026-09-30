import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../utils/helpers";
import ConfirmModal from "../components/ui/ConfirmModal";
import Select from "../components/ui/Select";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const EMPTY_FORM = { name: "", email: "", password: "", role: "member" };

const CLOSED_CONFIRM = {
  show: false,
  title: "",
  message: "",
  confirmText: "Confirm",
  action: null,
  loading: false,
  isDangerous: false,
};

const ROLE_FILTERS = [
  { value: "all", label: "All roles" },
  { value: "member", label: "Member" },
  { value: "manager", label: "Manager" },
];

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

// First click on a column sorts in this direction; second click reverses; third clears.
const FIRST_SORT_DIR = { name: "asc", tasks: "desc", joined: "desc" };

const MENU_HEIGHT_GUESS = 110;

const initial = (name) => (name || "?").trim().charAt(0).toUpperCase();

// Stable hue per member so each avatar gets its own tint.
const avatarHue = (seed) => {
  const s = String(seed ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

/* Shared class strings (kept as full literals so Tailwind can see them). */
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]";
const BARE = "cursor-pointer border-0 bg-transparent";
const SHADOW_POP =
  "shadow-[0_12px_32px_-8px_color-mix(in_srgb,var(--text)_22%,transparent),0_2px_6px_color-mix(in_srgb,var(--text)_8%,transparent)]";
const TH =
  "sticky top-0 z-10 bg-[color:var(--bg-2)] text-xs font-medium normal-case tracking-[0.02em] text-[color:var(--text-3)] shadow-[inset_0_-1px_0_var(--border)]";
// Cells collapse into a flowing card on small screens.
const TD = "max-md:!border-0 max-md:!p-0";

/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

function SearchIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function SortIcon({ dir }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="shrink-0">
      <path d="M5 1 8 4H2z" fill="currentColor" opacity={dir === "asc" ? 1 : 0.3} />
      <path d="M5 9 2 6h6z" fill="currentColor" opacity={dir === "desc" ? 1 : 0.3} />
    </svg>
  );
}

function SortTh({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={ariaSort} className={TH}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`${BARE} -mx-1 inline-flex items-center gap-1 rounded px-1 text-inherit transition-colors [font:inherit] hover:text-[color:var(--text)] ${FOCUS} ${
          active ? "text-[color:var(--text)]" : ""
        }`}
      >
        {label}
        <SortIcon dir={active ? sort.dir : null} />
      </button>
    </th>
  );
}

function Segmented({ label, value, onChange, options }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-lg bg-[color:var(--bg-3)] p-0.5"
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`cursor-pointer whitespace-nowrap rounded-md border-0 px-3 py-1 text-xs font-medium transition-colors ${FOCUS} ${
              on
                ? "bg-[color:var(--bg-2)] text-[color:var(--text)] shadow-sm"
                : "bg-transparent text-[color:var(--text-2)] hover:text-[color:var(--text)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ title, body, action, alert }) {
  return (
    <div
      role={alert ? "alert" : undefined}
      className="flex flex-col items-center gap-2 px-4 py-14 text-center text-[13px] text-[color:var(--text-3)]"
    >
      <strong className="text-[15px] font-semibold text-[color:var(--text-2)]">{title}</strong>
      {body && <span>{body}</span>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* Row overflow menu — rendered in a portal and positioned with fixed coords so
   the card's overflow never clips it. */
function RowMenu({ label, items }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const close = () => setPos(null);

  const toggle = () => {
    if (pos) return close();
    const r = btnRef.current.getBoundingClientRect();
    const right = window.innerWidth - r.right;
    // Flip above the button when there isn't room below (last rows).
    if (r.bottom + MENU_HEIGHT_GUESS > window.innerHeight) {
      setPos({ bottom: window.innerHeight - r.top + 6, right });
    } else {
      setPos({ top: r.bottom + 6, right });
    }
  };

  useEffect(() => {
    if (!pos) return;
    menuRef.current?.querySelector("button")?.focus();
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        close();
        btnRef.current?.focus();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [pos]);

  const onMenuKeyDown = (e) => {
    const nodes = Array.from(menuRef.current.querySelectorAll("button"));
    const i = nodes.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      nodes[(i + 1) % nodes.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nodes[(i - 1 + nodes.length) % nodes.length].focus();
    } else if (e.key === "Tab") {
      close();
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-ghost btn-sm !px-2"
        aria-haspopup="menu"
        aria-expanded={!!pos}
        aria-label={label}
        onClick={toggle}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            style={pos}
            onKeyDown={onMenuKeyDown}
            className={`fixed z-50 min-w-[168px] origin-top-right rounded-[10px] border border-[color:var(--border)] bg-[color:var(--bg-2)] p-1 motion-safe:animate-mb-menu-in ${SHADOW_POP}`}
          >
            {items.map((item) => (
              <Fragment key={item.label}>
                {item.separatorBefore && (
                  <div role="separator" className="mx-1.5 my-1 h-px bg-[color:var(--border)]" />
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    item.onSelect();
                  }}
                  className={`${BARE} block w-full rounded-md px-2.5 py-2 text-left text-[13px] transition-colors focus-visible:outline-none ${
                    item.danger
                      ? "text-[color:var(--danger)] hover:bg-[color:color-mix(in_srgb,var(--danger)_10%,transparent)] focus-visible:bg-[color:color-mix(in_srgb,var(--danger)_10%,transparent)]"
                      : "text-[color:var(--text)] hover:bg-[color:var(--bg-3)] focus-visible:bg-[color:var(--bg-3)]"
                  }`}
                >
                  {item.label}
                </button>
              </Fragment>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/* Right-hand slide-over used for add / edit. */
function SlideOver({ title, onClose, children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      if (opener && typeof opener.focus === "function") opener.focus();
    };
  }, []);

  const trapTab = (e) => {
    if (e.key !== "Tab") return;
    const focusables = panelRef.current.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text)_45%,transparent)] motion-safe:animate-mb-fade-in"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mb-panel-title"
        onKeyDown={trapTab}
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-[color:var(--bg-2)] shadow-[-16px_0_48px_-12px_color-mix(in_srgb,var(--text)_30%,transparent)] motion-safe:animate-mb-slide-in"
      >
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-6 py-4">
          <h2
            id="mb-panel-title"
            className="m-0 text-base font-semibold tracking-tight text-[color:var(--text)]"
          >
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`${BARE} rounded-md p-1 text-lg leading-none text-[color:var(--text-3)] transition hover:text-[color:var(--text)] active:scale-90 ${FOCUS}`}
          >
            ✕
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/* Member tasks panel                                                         */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86400000;
const DONE_RE = /done|complete|closed/i;
const FOCUS_INSET =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--accent)]";

// Relative due-date info; finished tasks are never flagged.
function dueInfo(due, stage) {
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / DAY_MS);
  const info = { tone: "normal", label: "", full: formatDate(due) };
  if (DONE_RE.test(stage || "")) return info;
  if (diff < 0) return { ...info, tone: "overdue", label: `${Math.abs(diff)}d overdue` };
  if (diff === 0) return { ...info, tone: "soon", label: "Due today" };
  if (diff === 1) return { ...info, tone: "soon", label: "Due tomorrow" };
  if (diff <= 3) return { ...info, tone: "soon", label: `Due in ${diff}d` };
  return info;
}

function stageTone(stage) {
  const s = String(stage || "").toLowerCase();
  if (/done|complete|closed/.test(s)) return "done";
  if (/block|hold|stuck/.test(s)) return "blocked";
  if (/review|qa|test|approv/.test(s)) return "review";
  if (/progress|doing|active|develop|design|working/.test(s)) return "progress";
  return "todo";
}

const STAGE_STYLES = {
  todo: {
    pill: "bg-[color:var(--bg-3)] text-[color:var(--text-2)]",
    dot: "bg-[color:var(--text-3)]",
  },
  progress: {
    pill: "bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] text-[color:var(--accent)]",
    dot: "bg-[color:var(--accent)]",
  },
  review: {
    pill: "bg-[hsl(38_90%_48%/0.14)] text-[hsl(32_80%_36%)]",
    dot: "bg-[hsl(38_90%_48%)]",
  },
  done: {
    pill: "bg-[color:color-mix(in_srgb,var(--success)_12%,transparent)] text-[color:var(--success)]",
    dot: "bg-[color:var(--success)]",
  },
  blocked: {
    pill: "bg-[color:color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)]",
    dot: "bg-[color:var(--danger)]",
  },
};

// Self-contained on purpose: the shared StageBadge only gets its styles when the
// Dashboard page has been mounted, so it rendered as plain text here.
function StagePill({ stage }) {
  const s = STAGE_STYLES[stageTone(stage)];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${s.pill}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {String(stage || "Todo").replace(/[_-]+/g, " ")}
    </span>
  );
}

function MemberTasksPanel({ id, member, tasks, loading, error, onRetry }) {
  // Soonest due first; tasks without a due date go last.
  const sorted = useMemo(() => {
    if (!tasks) return [];
    const at = (x) => {
      const t = x.due_date ? new Date(x.due_date).getTime() : NaN;
      return Number.isNaN(t) ? Infinity : t;
    };
    return [...tasks].sort((a, b) => {
      const ta = at(a);
      const tb = at(b);
      return ta === tb ? 0 : ta < tb ? -1 : 1;
    });
  }, [tasks]);

  const overdueCount = sorted.filter(
    (t) => dueInfo(t.due_date, t.stage)?.tone === "overdue",
  ).length;

  return (
    <div
      id={id}
      className="origin-top overflow-hidden rounded-[10px] border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--bg-3)_55%,var(--bg-2))] motion-safe:animate-mb-panel-in md:ml-[42px] md:max-w-[860px]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] bg-[color:var(--bg-3)] px-3.5 py-2 text-[11px] font-medium text-[color:var(--text-3)]">
        <span>
          Active tasks
          {!loading && !error && tasks ? (
            <span className="tabular-nums"> · {sorted.length}</span>
          ) : null}
        </span>
        {overdueCount > 0 && (
          <span className="tabular-nums text-[color:var(--danger)]">{overdueCount} overdue</span>
        )}
      </div>

      {loading ? (
        <div aria-hidden="true" className="divide-y divide-[color:var(--border)]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 px-3.5 py-3.5 motion-safe:animate-pulse">
              <div className="h-3 w-1/3 rounded bg-[color:var(--bg-3)]" />
              <div className="ml-auto h-3 w-16 rounded bg-[color:var(--bg-3)]" />
              <div className="h-4 w-14 rounded bg-[color:var(--bg-3)]" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="px-3.5 py-4 text-xs text-[color:var(--text-3)]">
          We couldn't load these tasks.
          <button type="button" className="btn btn-ghost btn-sm ml-2" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-1 px-4 py-7 text-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[color:var(--success)]">
            <circle cx="12" cy="12" r="9" />
            <path d="m8 12.5 2.8 2.8L16 9.8" />
          </svg>
          <div className="text-[13px] font-medium text-[color:var(--text-2)]">All clear</div>
          <div className="text-xs text-[color:var(--text-3)]">
            No active tasks assigned to {member.name}.
          </div>
        </div>
      ) : (
        <div className="max-h-[320px] divide-y divide-[color:var(--border)] overflow-y-auto [scrollbar-width:thin]">
          {sorted.map((t, i) => {
            const due = dueInfo(t.due_date, t.stage);
            const overdue = due?.tone === "overdue";
            return (
              <Link
                key={t.id}
                to={`/projects/${t.project_id}/tasks/${t.id}`}
                style={{ animationDelay: `${Math.min(i, 5) * 30}ms` }}
                className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-l-2 border-solid px-3.5 py-2.5 no-underline transition-colors hover:bg-[color:color-mix(in_srgb,var(--accent)_5%,transparent)] focus-visible:bg-[color:color-mix(in_srgb,var(--accent)_5%,transparent)] motion-safe:animate-mb-task-in md:grid-cols-[minmax(0,1fr)_8rem_7rem_1rem] ${FOCUS_INSET} ${
                  overdue ? "border-l-[color:var(--danger)]" : "border-l-transparent"
                }`}
              >
                <div className="min-w-0 max-md:col-span-2">
                  <div className="text-[13px] font-medium leading-snug text-[color:var(--text)] [overflow-wrap:anywhere]">
                    {t.title}
                  </div>
                  {t.project_name && (
                    <div className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded bg-[color:var(--bg-3)] px-1.5 py-px text-[11px] text-[color:var(--text-2)]">
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: `hsl(${avatarHue(t.project_name)} 55% 50%)` }}
                      />
                      <span className="truncate">{t.project_name}</span>
                    </div>
                  )}
                </div>

                <div className="text-xs leading-tight tabular-nums">
                  {due ? (
                    <>
                      <div className="text-[color:var(--text-2)]">{due.full}</div>
                      {due.tone !== "normal" && (
                        <div
                          className={`mt-0.5 text-[11px] font-medium ${
                            overdue
                              ? "text-[color:var(--danger)]"
                              : "text-[hsl(32_80%_36%)]"
                          }`}
                        >
                          {due.label}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-[color:var(--text-3)]">No due date</span>
                  )}
                </div>

                <div className="justify-self-end md:justify-self-start">
                  <StagePill stage={t.stage} />
                </div>

                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="hidden -translate-x-1 text-[color:var(--text-3)] opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none md:block"
                >
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function Members() {
  const auth = useAuth();
  const { isManager } = auth;
  const me = auth.user || auth.currentUser || null;

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState("");
  const [toast, setToast] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmModal, setConfirmModal] = useState(CLOSED_CONFIRM);
  const hasLoaded = useRef(false);

  // Toolbar
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState({ key: null, dir: "asc" });

  // Expandable per-member task list (managers only).
  const [expandedId, setExpandedId] = useState(null);
  const [memberTasks, setMemberTasks] = useState({});
  const [memberErrors, setMemberErrors] = useState({});
  const [loadingMember, setLoadingMember] = useState(null);

  const isSelf = (m) =>
    !!me &&
    ((me.id != null && m.id === me.id) ||
      (me.email && m.email && m.email.toLowerCase() === String(me.email).toLowerCase()));

  const load = () =>
    api
      .get("/members")
      .then((r) => {
        hasLoaded.current = true;
        setLoadError(false);
        setMembers(r.data);
      })
      .catch(() => {
        if (!hasLoaded.current) setLoadError(true);
        else setNotice("We couldn't refresh the member list. Reload the page to see the latest.");
      })
      .finally(() => setLoading(false));

  // silent = we already have cached tasks to show, so refresh in the background.
  const loadMemberTasks = async (id, silent = false) => {
    if (!silent) setLoadingMember(id);
    setMemberErrors((prev) => ({ ...prev, [id]: false }));
    try {
      const r = await api.get(`/dashboard/members/${id}/tasks`);
      setMemberTasks((prev) => ({ ...prev, [id]: r.data.tasks || [] }));
    } catch {
      // Keep whatever is cached on a silent refresh; otherwise show Retry.
      if (!silent) setMemberErrors((prev) => ({ ...prev, [id]: true }));
    } finally {
      if (!silent) setLoadingMember(null);
    }
  };

  const toggleMember = (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    // Always refetch so the list never goes stale; show cached tasks meanwhile.
    loadMemberTasks(id, Boolean(memberTasks[id]));
  };

  // After any change, drop task caches (counts and assignments may have moved).
  const afterChange = async (message) => {
    setExpandedId(null);
    setMemberTasks({});
    setMemberErrors({});
    await load();
    if (message) setToast({ id: Date.now(), text: message });
  };

  useEffect(() => {
    load();
  }, []);

  // Auto-dismiss the inline error notice.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // Auto-dismiss the success toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const retry = () => {
    setLoadError(false);
    setLoading(true);
    load();
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setShowPassword(false);
    setError("");
    setShowPanel(true);
  };

  const openEdit = (m) => {
    setEditing(m);
    setForm({
      name: m.name,
      email: m.email,
      password: "",
      role: m.role,
    });
    setFieldErrors({});
    setShowPassword(false);
    setError("");
    setShowPanel(true);
  };

  const closePanel = () => setShowPanel(false);

  const setField = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Enter a name.";
    if (!form.email.trim()) errs.email = "Enter an email address.";
    else if (!/^\S+@\S+\.\S+$/.test(form.email.trim()))
      errs.email = "Enter a valid email address.";
    if (!editing && !form.password) errs.password = "Enter a password.";
    return errs;
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (saving) return;
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    const payload = { ...form, name: form.name.trim(), email: form.email.trim() };
    setSaving(true);
    setError("");
    try {
      if (editing) await api.put(`/members/${editing.id}`, payload);
      else await api.post("/members", payload);
      setShowPanel(false);
      await afterChange(editing ? "Member updated" : "Member added");
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "We couldn't save this member. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = (id) => {
    setConfirmModal({
      show: true,
      title: "Deactivate member",
      message: "Deactivate this member? They will no longer be able to log in.",
      confirmText: "Deactivate",
      isDangerous: true,
      action: async () => {
        await api.patch(`/members/${id}/deactivate`);
        await afterChange("Member deactivated");
      },
      loading: false,
    });
  };

  const handleActivate = (id) => {
    setConfirmModal({
      show: true,
      title: "Activate member",
      message: "Activate this member? They will be able to log in again.",
      confirmText: "Activate",
      isDangerous: false,
      action: async () => {
        await api.patch(`/members/${id}/activate`);
        await afterChange("Member activated");
      },
      loading: false,
    });
  };

  const handleDelete = (id) => {
    setConfirmModal({
      show: true,
      title: "Delete member",
      message:
        "Are you sure you want to permanently delete this member? All their data will be removed.",
      confirmText: "Delete",
      isDangerous: true,
      action: async () => {
        await api.delete(`/members/${id}`);
        await afterChange("Member deleted");
      },
      loading: false,
    });
  };

  const executeConfirmAction = async () => {
    if (!confirmModal.action) return;
    setConfirmModal((prev) => ({ ...prev, loading: true }));
    try {
      await confirmModal.action();
    } catch (err) {
      setNotice(
        err?.response?.data?.error ||
          "We couldn't complete that action. Please try again.",
      );
    } finally {
      setConfirmModal(CLOSED_CONFIRM);
    }
  };

  const toggleSort = (key) =>
    setSort((s) => {
      const first = FIRST_SORT_DIR[key];
      const second = first === "asc" ? "desc" : "asc";
      if (s.key !== key) return { key, dir: first };
      if (s.dir === first) return { key, dir: second };
      return { key: null, dir: "asc" };
    });

  const clearFilters = () => {
    setQuery("");
    setRoleFilter("all");
    setStatusFilter("all");
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = members.filter((m) => {
      if (roleFilter !== "all" && m.role !== roleFilter) return false;
      if (statusFilter === "active" && !m.active) return false;
      if (statusFilter === "inactive" && m.active) return false;
      if (q && !`${m.name} ${m.email}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (!sort.key) return list;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort.key === "name") return dir * (a.name || "").localeCompare(b.name || "");
      if (sort.key === "tasks") return dir * ((Number(a.task_count) || 0) - (Number(b.task_count) || 0));
      return dir * (new Date(a.created_at) - new Date(b.created_at));
    });
  }, [members, query, roleFilter, statusFilter, sort]);

  const filtersActive = query.trim() !== "" || roleFilter !== "all" || statusFilter !== "all";
  const activeCount = members.filter((m) => m.active).length;
  const colCount = isManager ? 7 : 6;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Team members</h1>
          {!loading && !loadError && (
            <div className="page-subtitle">
              {activeCount} active member{activeCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>
        {isManager && !loading && !loadError && (
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + Add member
          </button>
        )}
      </div>

      <div className="page-body" aria-busy={loading}>
        {notice && (
          <div
            role="alert"
            className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-[color:color-mix(in_srgb,var(--danger)_9%,var(--bg-2))] px-3.5 py-2.5 text-[13px] leading-[1.45] text-[color:var(--danger)]"
          >
            <span>{notice}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setNotice("")}
              className={`${BARE} px-0.5 py-0 leading-none text-inherit opacity-70 transition hover:opacity-100 active:scale-90 ${FOCUS}`}
            >
              ✕
            </button>
          </div>
        )}

        {loading ? (
          <div className="card overflow-hidden !p-0" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3.5 motion-safe:animate-pulse [&+&]:border-t [&+&]:border-[color:var(--border)]"
              >
                <div className="h-8 w-8 shrink-0 rounded-[10px] bg-[color:var(--bg-3)]" />
                <div className="h-3 w-[22%] rounded-md bg-[color:var(--bg-3)]" />
                <div className="h-3 w-[30%] rounded-md bg-[color:var(--bg-3)]" />
                <div className="h-3 w-[10%] rounded-md bg-[color:var(--bg-3)]" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="card overflow-hidden !p-0">
            <EmptyState
              alert
              title="We couldn't load members"
              body="Check your connection and try again."
              action={
                <button type="button" className="btn btn-ghost btn-sm" onClick={retry}>
                  Try again
                </button>
              }
            />
          </div>
        ) : members.length === 0 ? (
          <div className="card overflow-hidden !p-0">
            <EmptyState
              title="No members yet"
              body={
                isManager
                  ? "Add your first team member to start assigning tasks."
                  : "Members will appear here once they are added."
              }
              action={
                isManager && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
                    + Add member
                  </button>
                )
              }
            />
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-72">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-3)]" />
                <input
                  type="search"
                  className="form-input w-full !pl-9"
                  placeholder="Search by name or email"
                  aria-label="Search members"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Segmented
                label="Filter by status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={STATUS_FILTERS}
              />
              <Segmented
                label="Filter by role"
                value={roleFilter}
                onChange={setRoleFilter}
                options={ROLE_FILTERS}
              />
              <div
                className="text-xs tabular-nums text-[color:var(--text-3)] md:ml-auto"
                aria-live="polite"
              >
                {filtersActive
                  ? `${visible.length} of ${members.length} members`
                  : `${members.length} member${members.length !== 1 ? "s" : ""}`}
              </div>
            </div>

            <div className="card overflow-hidden !p-0">
              {visible.length === 0 ? (
                <EmptyState
                  title="No members match"
                  body="Try a different search or clear the filters."
                  action={
                    <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
                      Clear filters
                    </button>
                  }
                />
              ) : (
                <div className="table-wrap overflow-auto md:max-h-[calc(100dvh-17rem)]">
                  <table className="w-full md:min-w-[760px] max-md:block">
                    <thead className="max-md:hidden">
                      <tr>
                        <SortTh label="Member" sortKey="name" sort={sort} onSort={toggleSort} />
                        <th scope="col" className={TH}>Email</th>
                        <th scope="col" className={TH}>Role</th>
                        <SortTh label="Tasks" sortKey="tasks" sort={sort} onSort={toggleSort} />
                        <SortTh label="Joined" sortKey="joined" sort={sort} onSort={toggleSort} />
                        <th scope="col" className={TH}>Status</th>
                        {isManager && (
                          <th scope="col" className={`${TH} text-right`}>Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="max-md:block">
                      {visible.map((m) => {
                        const count = Number(m.task_count) || 0;
                        const countLabel = `${count} task${count !== 1 ? "s" : ""}`;
                        const isOpen = expandedId === m.id;
                        const tasks = memberTasks[m.id];
                        const panelId = `mb-tasks-${m.id}`;
                        const self = isSelf(m);
                        const hue = avatarHue(m.email || m.name);
                        const menuItems = [
                          m.active
                            ? { label: "Deactivate", onSelect: () => handleDeactivate(m.id) }
                            : { label: "Activate", onSelect: () => handleActivate(m.id) },
                          {
                            label: "Delete",
                            danger: true,
                            separatorBefore: true,
                            onSelect: () => handleDelete(m.id),
                          },
                        ];
                        return (
                          <Fragment key={m.id}>
                            <tr className="transition-colors hover:bg-[color:var(--bg-3)] motion-reduce:transition-none max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-2 max-md:border-b max-md:border-[color:var(--border)] max-md:px-4 max-md:py-3">
                              <td className={`${TD} max-md:w-full`}>
                                <div className="flex items-center gap-2.5 whitespace-nowrap">
                                  <div
                                    aria-hidden="true"
                                    className={`user-avatar shrink-0 overflow-hidden !rounded-[10px] !p-0 font-semibold ${
                                      m.active ? "" : "opacity-60 grayscale"
                                    }`}
                                    style={{
                                      color: `hsl(${hue} 50% 40%)`,
                                      background: `color-mix(in srgb, hsl(${hue} 60% 50%) 16%, var(--bg-3))`,
                                    }}
                                  >
                                    {m.avatar_url ? (
                                      <img
                                        src={m.avatar_url}
                                        alt=""
                                        className="block h-full w-full rounded-[10px] object-cover"
                                      />
                                    ) : (
                                      initial(m.name)
                                    )}
                                  </div>
                                  <span
                                    className={
                                      m.active
                                        ? "font-medium"
                                        : "font-normal text-[color:var(--text-2)]"
                                    }
                                  >
                                    {m.name}
                                  </span>
                                  {self && (
                                    <span className="rounded bg-[color:var(--bg-3)] px-1.5 py-px text-[10px] font-semibold text-[color:var(--text-3)]">
                                      You
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td
                                className={`${TD} whitespace-nowrap text-[color:var(--text-2)] max-md:w-full max-md:whitespace-normal max-md:break-all`}
                              >
                                {m.email}
                              </td>
                              <td className={TD}>
                                <span
                                  className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${
                                    m.role === "manager"
                                      ? "bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] text-[color:var(--accent)]"
                                      : "bg-[color:var(--bg-3)] text-[color:var(--text-2)]"
                                  } ${m.active ? "" : "opacity-75"}`}
                                >
                                  {m.role}
                                </span>
                              </td>
                              <td className={TD}>
                                {isManager ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleMember(m.id)}
                                    aria-expanded={isOpen}
                                    aria-controls={panelId}
                                    aria-label={`${countLabel} for ${m.name}`}
                                    className={`${BARE} -mx-2 -my-[3px] inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-[3px] font-[family-name:var(--font-mono)] text-[13px] tabular-nums transition hover:bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 ${FOCUS} ${
                                      count === 0
                                        ? "text-[color:var(--text-3)]"
                                        : "text-[color:var(--accent)]"
                                    }`}
                                  >
                                    {countLabel}
                                    <svg
                                      width="9"
                                      height="9"
                                      viewBox="0 0 10 10"
                                      aria-hidden="true"
                                      className={`text-[color:var(--text-3)] transition-transform motion-reduce:transition-none ${
                                        isOpen ? "rotate-180" : ""
                                      }`}
                                    >
                                      <path d="M1 3l4 4 4-4z" fill="currentColor" />
                                    </svg>
                                  </button>
                                ) : (
                                  <span
                                    className={`whitespace-nowrap font-[family-name:var(--font-mono)] text-[13px] tabular-nums ${
                                      count === 0
                                        ? "text-[color:var(--text-3)]"
                                        : "text-[color:var(--accent)]"
                                    }`}
                                  >
                                    {countLabel}
                                  </span>
                                )}
                              </td>
                              <td
                                className={`${TD} whitespace-nowrap text-xs tabular-nums text-[color:var(--text-3)]`}
                              >
                                {formatDate(m.created_at)}
                              </td>
                              <td className={TD}>
                                <span
                                  className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs ${
                                    m.active
                                      ? "text-[color:var(--success)]"
                                      : "text-[color:var(--text-2)]"
                                  }`}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`h-[7px] w-[7px] rounded-full ${
                                      m.active
                                        ? "bg-[color:var(--success)]"
                                        : "bg-[color:var(--text-3)]"
                                    }`}
                                  />
                                  {m.active ? "Active" : "Inactive"}
                                </span>
                              </td>
                              {isManager && (
                                <td className={`${TD} text-right max-md:ml-auto`}>
                                  <div className="flex flex-wrap justify-end gap-0.5">
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      onClick={() => openEdit(m)}
                                      aria-label={`Edit ${m.name}`}
                                    >
                                      Edit
                                    </button>
                                    {!self && (
                                      <RowMenu
                                        label={`More actions for ${m.name}`}
                                        items={menuItems}
                                      />
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>

                            {isManager && isOpen && (
                              <tr className="bg-[color:var(--bg-2)] hover:bg-[color:var(--bg-2)] max-md:block">
                                <td
                                  colSpan={colCount}
                                  className="!pb-4 !pt-1.5 max-md:block max-md:!px-4"
                                >
                                  <MemberTasksPanel
                                    id={panelId}
                                    member={m}
                                    tasks={tasks}
                                    loading={loadingMember === m.id || (!tasks && !memberErrors[m.id])}
                                    error={!!memberErrors[m.id]}
                                    onRetry={() => loadMemberTasks(m.id)}
                                  />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showPanel && (
        <SlideOver title={editing ? "Edit member" : "Add member"} onClose={closePanel}>
          <form onSubmit={handleSave} noValidate className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div>
                <label className="form-label" htmlFor="mb-name">Full name</label>
                <input
                  id="mb-name"
                  className="form-input w-full"
                  value={form.name}
                  onChange={setField("name")}
                  placeholder="e.g. Anjali Menon"
                  aria-invalid={!!fieldErrors.name}
                  aria-describedby={fieldErrors.name ? "mb-name-error" : undefined}
                  autoFocus
                />
                {fieldErrors.name && (
                  <div
                    id="mb-name-error"
                    role="alert"
                    className="mt-1.5 text-xs text-[color:var(--danger)]"
                  >
                    {fieldErrors.name}
                  </div>
                )}
              </div>

              <div>
                <label className="form-label" htmlFor="mb-email">Email</label>
                <input
                  id="mb-email"
                  className="form-input w-full"
                  type="email"
                  value={form.email}
                  onChange={setField("email")}
                  placeholder="name@company.com"
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? "mb-email-error" : undefined}
                />
                {fieldErrors.email && (
                  <div
                    id="mb-email-error"
                    role="alert"
                    className="mt-1.5 text-xs text-[color:var(--danger)]"
                  >
                    {fieldErrors.email}
                  </div>
                )}
              </div>

              <div>
                <span className="form-label">Role</span>
                <Select
                  value={form.role}
                  onChange={(val) => setForm((f) => ({ ...f, role: val }))}
                >
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                </Select>
              </div>

              <div>
                <label className="form-label" htmlFor="mb-password">
                  {editing ? "New password (leave blank to keep current)" : "Password"}
                </label>
                <div className="relative">
                  <input
                    id="mb-password"
                    className="form-input w-full !pr-10"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={setField("password")}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby={fieldErrors.password ? "mb-password-error" : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    title={showPassword ? "Hide password" : "Show password"}
                    className={`${BARE} absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-md p-1 text-[color:var(--text-3)] transition hover:text-[color:var(--text)] active:scale-90 motion-reduce:transition-none ${FOCUS}`}
                  >
                    {showPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {fieldErrors.password && (
                  <div
                    id="mb-password-error"
                    role="alert"
                    className="mt-1.5 text-xs text-[color:var(--danger)]"
                  >
                    {fieldErrors.password}
                  </div>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-md bg-[color:color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[13px] text-[color:var(--danger)]"
                >
                  {error}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-[color:var(--border)] px-6 py-4">
              <button type="button" className="btn btn-ghost" onClick={closePanel} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save member"}
              </button>
            </div>
          </form>
        </SlideOver>
      )}

      <ConfirmModal
        isOpen={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        isDangerous={confirmModal.isDangerous}
        onConfirm={executeConfirmAction}
        onCancel={() => setConfirmModal(CLOSED_CONFIRM)}
        loading={confirmModal.loading}
      />

      {toast &&
        createPortal(
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className={`fixed bottom-5 right-5 z-[60] flex items-center gap-2.5 rounded-[10px] border border-[color:var(--border)] bg-[color:var(--bg-2)] px-4 py-3 text-[13px] font-medium text-[color:var(--text)] motion-safe:animate-mb-toast-in ${SHADOW_POP}`}
          >
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[color:var(--success)]" />
            {toast.text}
          </div>,
          document.body,
        )}
    </>
  );
}