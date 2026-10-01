import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import api from "../api/client";
import Tasks from "./Tasks";
import Clusters from "./Clusters";
import Credentials from "./Credentials";
import Knowledge from "./Knowledge";

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

const Icon = ({ children }) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const TABS = [
  {
    key: "tasks",
    label: "Tasks",
    Component: Tasks,
    icon: (
      <Icon>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </Icon>
    ),
  },
  {
    key: "clusters",
    label: "Clusters",
    Component: Clusters,
    icon: (
      <Icon>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <path d="M3.3 7L12 12l8.7-5M12 22V12" />
      </Icon>
    ),
  },
  {
    key: "credentials",
    label: "Credentials",
    Component: Credentials,
    icon: (
      <Icon>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </Icon>
    ),
  },
  {
    key: "knowledge",
    label: "Knowledge",
    Component: Knowledge,
    icon: (
      <Icon>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </Icon>
    ),
  },
];

const DEFAULT_TAB = TABS[0].key;
const TAB_KEYS = TABS.map((t) => t.key);

/* -------------------------------------------------------------------------- */
/* Tailwind class groups                                                      */
/* -------------------------------------------------------------------------- */

const SKELETON = "bg-[color:var(--bg-4,var(--border))] opacity-50";

// Full-bleed header with a soft accent wash fading into the page.
const HEADER =
  "border-b border-[var(--border)] px-4 pt-6 sm:px-8 sm:pt-8 " +
  "bg-[image:linear-gradient(to_bottom,var(--accent-glow),transparent_90%)]";

const TAB_BASE =
  "relative inline-flex cursor-pointer items-center gap-2 whitespace-nowrap " +
  "rounded-t-lg border-0 bg-transparent px-3.5 pb-3 pt-2 text-[13.5px] font-medium " +
  "transition-colors duration-150 motion-reduce:transition-none " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--accent)] " +
  "focus-visible:outline-offset-[-2px]";

const TAB_IDLE = "text-[var(--text-3)] hover:bg-[var(--accent-glow)] hover:text-[var(--text)]";

const TAB_ACTIVE =
  "font-semibold text-[var(--accent)] " +
  "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full " +
  "after:bg-[color:var(--accent)] after:content-['']";

/* -------------------------------------------------------------------------- */
/* Data                                                                       */
/* -------------------------------------------------------------------------- */

const isAbort = (e) =>
  e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || e?.name === "AbortError";

// Loads the project for `id`. A request for a previous project is cancelled
// when the id changes, so a slow response can never overwrite the current one.
function useProject(id) {
  const [project, setProject] = useState(null);
  const [error, setError] = useState(null); // null | "notfound" | "failed"
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);

    api
      .get(`/projects/${id}`, { signal: controller.signal })
      .then((r) => {
        if (!controller.signal.aborted) setProject(r.data);
      })
      .catch((err) => {
        if (isAbort(err) || controller.signal.aborted) return;
        setProject(null);
        setError(err.response?.status === 404 ? "notfound" : "failed");
      });

    return () => controller.abort();
  }, [id, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  // Until the project for *this* id has arrived, show the skeleton.
  const loading = !error && (!project || String(project.id) !== String(id));

  return { project, error, loading, retry };
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

function ErrorState({ kind, onRetry }) {
  const failed = kind === "failed";
  return (
    <div className="page-body px-6 py-16 text-center">
      <div className="mb-3 text-4xl">{failed ? "⚠️" : "🔍"}</div>
      <h2 className="mb-1.5 text-lg font-semibold">
        {failed ? "Couldn't load this project" : "Project not found"}
      </h2>
      <p className="mb-5 text-[13px] text-[var(--text-3)]">
        {failed
          ? "Something went wrong while fetching the project. Please try again."
          : "It may have been deleted, or the link is incorrect."}
      </p>
      <div className="flex justify-center gap-2">
        {failed && (
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Retry
          </button>
        )}
        <Link to="/projects" className="btn btn-ghost">
          Back to projects
        </Link>
      </div>
    </div>
  );
}

// Logo tile, breadcrumb, name, client and description. `project` is null while loading.
const ProjectSummary = memo(function ProjectSummary({ project }) {
  const loading = !project;
  const initial = (project?.name?.trim()?.[0] || "").toUpperCase();

  return (
    <div className="flex items-start gap-4">
      <div
        aria-hidden="true"
        className={
          "grid h-12 w-12 shrink-0 place-items-center rounded-xl text-xl font-bold " +
          (loading
            ? SKELETON
            : "border border-[var(--border)] bg-[var(--bg)] text-[var(--accent)] shadow-sm")
        }
      >
        {!loading && initial}
      </div>

      <div className="min-w-0 flex-1">
        <nav
          aria-label="Breadcrumb"
          className="mb-1 flex items-center gap-1.5 text-xs text-[var(--text-3)]"
        >
          <Link to="/projects" className="text-inherit no-underline hover:text-[var(--accent)]">
            Projects
          </Link>
          <span aria-hidden="true">›</span>
          <span aria-current="page">Details</span>
        </nav>

        {loading ? (
          <>
            <div className={`h-8 w-[240px] max-w-[60%] rounded-lg ${SKELETON}`} />
            <div className={`mt-3 h-4 w-[360px] max-w-[80%] rounded-md ${SKELETON}`} />
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="m-0 min-w-0 truncate text-2xl font-semibold leading-tight tracking-tight text-[var(--text)] sm:text-[28px]">
                {project.name}
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)]">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
                </svg>
                {project.client_name || "No client"}
              </span>
            </div>
            {project.description && (
              <p className="mb-0 mt-2 line-clamp-2 max-w-2xl text-sm leading-relaxed text-[var(--text-2)]">
                {project.description}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
});

const TabButton = memo(function TabButton({ tab, selected, onSelect, onKeyDown, registerRef }) {
  return (
    <button
      ref={(el) => registerRef(tab.key, el)}
      id={`tab-${tab.key}`}
      role="tab"
      type="button"
      aria-selected={selected}
      aria-controls={`panel-${tab.key}`}
      tabIndex={selected ? 0 : -1}
      className={`${TAB_BASE} ${selected ? TAB_ACTIVE : TAB_IDLE}`}
      onClick={() => onSelect(tab.key)}
      onKeyDown={onKeyDown}
    >
      {tab.icon}
      <span>{tab.label}</span>
    </button>
  );
});

// Memoized so switching tabs only re-renders the two panels whose `active` flag changed.
const TabPanel = memo(function TabPanel({ tabKey, Component, project, active }) {
  return (
    // Don't add a display class here, or it would override the `hidden` attribute.
    <div id={`panel-${tabKey}`} role="tabpanel" aria-labelledby={`tab-${tabKey}`} hidden={!active}>
      <Component project={project} active={active} />
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function ProjectDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabRefs = useRef({});

  const { project, error, loading, retry } = useProject(id);

  const tabParam = searchParams.get("tab");
  const activeKey = TAB_KEYS.includes(tabParam) ? tabParam : DEFAULT_TAB;

  const registerRef = useCallback((key, el) => {
    tabRefs.current[key] = el;
  }, []);

  const selectTab = useCallback(
    (key, { focus = false } = {}) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (key === DEFAULT_TAB) next.delete("tab");
          else next.set("tab", key);
          return next;
        },
        { replace: true },
      );
      if (focus) tabRefs.current[key]?.focus();
    },
    [setSearchParams],
  );

  // Arrow keys / Home / End move between tabs (roving tabindex).
  const handleTabKeyDown = useCallback(
    (e) => {
      const idx = TAB_KEYS.indexOf(activeKey);
      let nextIdx = null;
      if (e.key === "ArrowRight") nextIdx = (idx + 1) % TAB_KEYS.length;
      else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + TAB_KEYS.length) % TAB_KEYS.length;
      else if (e.key === "Home") nextIdx = 0;
      else if (e.key === "End") nextIdx = TAB_KEYS.length - 1;

      if (nextIdx !== null) {
        e.preventDefault();
        selectTab(TAB_KEYS[nextIdx], { focus: true });
      }
    },
    [activeKey, selectTab],
  );

  // Keeps the summary from re-rendering on tab changes.
  const summaryProject = useMemo(() => (loading ? null : project), [loading, project]);

  if (error) return <ErrorState kind={error} onRetry={retry} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className={HEADER}>
        <ProjectSummary project={summaryProject} />

        <div
          role="tablist"
          aria-label="Project sections"
          className="mt-6 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((t) => (
            <TabButton
              key={t.key}
              tab={t}
              selected={t.key === activeKey}
              onSelect={selectTab}
              onKeyDown={handleTabKeyDown}
              registerRef={registerRef}
            />
          ))}
        </div>
      </header>

      {/* ALL tabs mount as soon as the project loads, so each one finishes its
          first fetch in the background and there's no Loader when the user
          clicks it. Only the active one is visible. */}
      <div className="flex-1 overflow-auto" key={project?.id}>
        {!loading &&
          TABS.map((t) => (
            <TabPanel
              key={t.key}
              tabKey={t.key}
              Component={t.Component}
              project={project}
              active={t.key === activeKey}
            />
          ))}
      </div>
    </div>
  );
}