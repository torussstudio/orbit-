// import { useState, useEffect } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import api from "../api/client";
// import { useAuth } from "../context/AuthContext";
// import Tasks from "./Tasks";
// import Clusters from "./Clusters";
// import Credentials from "./Credentials";
// import Knowledge from "./Knowledge";
// import Loader from "../components/ui/Loader";

// const safeImageUrl = (url) => {
//   if (!url) return "";

//   try {
//     const parsed = new URL(url);

//     if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
//       return "";
//     }

//     return parsed.href;
//   } catch {
//     return "";
//   }
// };

// const TABS = ["Tasks", "Clusters", "Credentials", "Knowledge"];

// export default function ProjectDetail() {
//   const { id } = useParams();
//   const { isManager } = useAuth();
//   const [project, setProject] = useState(null);
//   const [tab, setTab] = useState("Tasks");
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     api
//       .get(`/projects/${id}`)
//       .then((r) => setProject(r.data))
//       .finally(() => setLoading(false));
//   }, [id]);

//   if (loading)
//     return <Loader label="Loading project" size="lg" variant="page" />;
//   if (!project)
//     return (
//       <div className="page-body">
//         <p>Project not found.</p>
//       </div>
//     );

//   return (
//     <>
//       <div className="page-header" style={{ paddingBottom: "16px" }}>
//         <div>
//           <div
//             style={{
//               fontSize: "12px",
//               color: "var(--text-3)",
//               marginBottom: "4px",
//             }}
//           >
//             {project.client_name || "No client"}
//           </div>
//           <div className="page-title">{project.name}</div>
//           {project.description && (
//             <div
//               className="page-subtitle"
//               style={{ marginTop: "4px", maxWidth: "600px" }}
//             >
//               {project.description}
//             </div>
//           )}
//         </div>
//         <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
//           <span className={`badge badge-${project.status}`}>
//             {project.status?.replace("_", " ")}
//           </span>
//           <div style={{ display: "flex", gap: "6px" }}>
//             {project.members?.map((m) => (
//               <div
//                 key={m.id}
//                 className="user-avatar"
//                 title={m.name}
//                 style={{
//                   width: "28px",
//                   height: "28px",
//                   fontSize: "11px",
//                   overflow: "hidden",
//                   padding: 0,
//                 }}
//               >
//                 {safeImageUrl(m.avatar_url) ? (
//                   <img
//                     src={safeImageUrl(m.avatar_url)}
//                     alt={m.name || "User avatar"}
//                     style={{
//                       width: "100%",
//                       height: "100%",
//                       objectFit: "cover",
//                       borderRadius: "50%",
//                       display: "block",
//                     }}
//                   />
//                 ) : (
//                   m.name?.[0] || "?"
//                 )}
//               </div>
//             ))}
//           </div>
//         </div>
//       </div>

//       <div className="project-tabs">
//         {TABS.map((t) => (
//           <button
//             key={t}
//             className={`tab-btn ${tab === t ? "active" : ""}`}
//             onClick={() => setTab(t)}
//           >
//             {t}
//           </button>
//         ))}
//       </div>

//       <div style={{ flex: 1, overflow: "auto" }}>
//         {tab === "Tasks" && <Tasks project={project} />}
//         {tab === "Clusters" && <Clusters project={project} />}
//         {tab === "Credentials" && <Credentials project={project} />}
//         {tab === "Knowledge" && <Knowledge project={project} />}
//       </div>
//     </>
//   );
// }





// import { useState, useEffect } from "react";
// import { useParams } from "react-router-dom";
// import api from "../api/client";
// import Tasks from "./Tasks";
// import Clusters from "./Clusters";
// import Credentials from "./Credentials";
// import Knowledge from "./Knowledge";
// import Loader from "../components/ui/Loader";

// const TABS = ["Tasks", "Clusters", "Credentials", "Knowledge"];

// export default function ProjectDetail() {
//   const { id } = useParams();
//   const [project, setProject] = useState(null);
//   const [tab, setTab] = useState("Tasks");
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     api
//       .get(`/projects/${id}`)
//       .then((r) => setProject(r.data))
//       .finally(() => setLoading(false));
//   }, [id]);

//   if (loading)
//     return <Loader label="Loading project" size="lg" variant="page" />;
//   if (!project)
//     return (
//       <div className="page-body">
//         <p>Project not found.</p>
//       </div>
//     );

//   return (
//     <>
//       <div className="page-header" style={{ paddingBottom: "16px" }}>
//         <div>
//           <div
//             style={{
//               fontSize: "12px",
//               color: "var(--text-3)",
//               marginBottom: "4px",
//             }}
//           >
//             {project.client_name || "No client"}
//           </div>
//           <div className="page-title">{project.name}</div>
//           {project.description && (
//             <div
//               className="page-subtitle"
//               style={{ marginTop: "4px", maxWidth: "600px" }}
//             >
//               {project.description}
//             </div>
//           )}
//         </div>
//       </div>

//       <div className="project-tabs">
//         {TABS.map((t) => (
//           <button
//             key={t}
//             className={`tab-btn ${tab === t ? "active" : ""}`}
//             onClick={() => setTab(t)}
//           >
//             {t}
//           </button>
//         ))}
//       </div>

//       <div style={{ flex: 1, overflow: "auto" }}>
//         {tab === "Tasks" && <Tasks project={project} />}
//         {tab === "Clusters" && <Clusters project={project} />}
//         {tab === "Credentials" && <Credentials project={project} />}
//         {tab === "Knowledge" && <Knowledge project={project} />}
//       </div>
//     </>
//   );
// }



import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import api from "../api/client";
import Tasks from "./Tasks";
import Clusters from "./Clusters";
import Credentials from "./Credentials";
import Knowledge from "./Knowledge";

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

/* ---------- Tailwind class groups ---------- */

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

const TAB_IDLE =
  "text-[var(--text-3)] hover:bg-[var(--accent-glow)] hover:text-[var(--text)]";

const TAB_ACTIVE =
  "font-semibold text-[var(--accent)] " +
  "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full " +
  "after:bg-[color:var(--accent)] after:content-['']";

export default function ProjectDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabRefs = useRef({});

  const [project, setProject] = useState(null);
  const [error, setError] = useState(null); // null | "notfound" | "failed"
  const [reloadKey, setReloadKey] = useState(0);

  const tabParam = searchParams.get("tab");
  const activeKey = TABS.some((t) => t.key === tabParam)
    ? tabParam
    : DEFAULT_TAB;

  const loading = !error && (!project || String(project.id) !== String(id));

  useEffect(() => {
    let cancelled = false;
    setError(null);

    api
      .get(`/projects/${id}`)
      .then((r) => {
        if (!cancelled) setProject(r.data);
      })
      .catch((err) => {
        if (cancelled) return;
        setProject(null);
        setError(err.response?.status === 404 ? "notfound" : "failed");
      });

    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  const selectTab = (key, { focus = false } = {}) => {
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
  };

  const handleTabKeyDown = (e) => {
    const idx = TABS.findIndex((t) => t.key === activeKey);
    let nextIdx = null;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % TABS.length;
    else if (e.key === "ArrowLeft")
      nextIdx = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = TABS.length - 1;

    if (nextIdx !== null) {
      e.preventDefault();
      selectTab(TABS[nextIdx].key, { focus: true });
    }
  };

  if (error) {
    return (
      <div className="page-body px-6 py-16 text-center">
        <div className="mb-3 text-4xl">{error === "failed" ? "⚠️" : "🔍"}</div>
        <h2 className="mb-1.5 text-lg font-semibold">
          {error === "failed"
            ? "Couldn't load this project"
            : "Project not found"}
        </h2>
        <p className="mb-5 text-[13px] text-[var(--text-3)]">
          {error === "failed"
            ? "Something went wrong while fetching the project. Please try again."
            : "It may have been deleted, or the link is incorrect."}
        </p>
        <div className="flex justify-center gap-2">
          {error === "failed" && (
            <button
              className="btn btn-primary"
              onClick={() => setReloadKey((k) => k + 1)}
            >
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

  const initial = (project?.name?.trim()?.[0] || "").toUpperCase();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className={HEADER}>
        <div className="flex items-start gap-4">
          {/* Logo tile */}
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
              <Link
                to="/projects"
                className="text-inherit no-underline hover:text-[var(--accent)]"
              >
                Projects
              </Link>
              <span aria-hidden="true">›</span>
              <span aria-current="page">Details</span>
            </nav>

            {loading ? (
              <div
                className={`h-8 w-[240px] max-w-[60%] rounded-lg ${SKELETON}`}
              />
            ) : (
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
            )}

            {loading ? (
              <div className={`mt-3 h-4 w-[360px] max-w-[80%] rounded-md ${SKELETON}`} />
            ) : (
              project.description && (
                <p className="mb-0 mt-2 line-clamp-2 max-w-2xl text-sm leading-relaxed text-[var(--text-2)]">
                  {project.description}
                </p>
              )
            )}
          </div>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Project sections"
          className="mt-6 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((t) => {
            const selected = t.key === activeKey;
            return (
              <button
                key={t.key}
                ref={(el) => (tabRefs.current[t.key] = el)}
                id={`tab-${t.key}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`panel-${t.key}`}
                tabIndex={selected ? 0 : -1}
                className={`${TAB_BASE} ${selected ? TAB_ACTIVE : TAB_IDLE}`}
                onClick={() => selectTab(t.key)}
                onKeyDown={handleTabKeyDown}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Panels: ALL tabs mount as soon as the project loads (so each one
          finishes its first fetch in the background, no Loader when the
          user clicks it). Only the active one is visible.
          Don't add a display class to the panel divs, or it would override
          the `hidden` attribute. */}
      <div className="flex-1 overflow-auto" key={project?.id}>
        {!loading &&
          TABS.map((t) => {
            const active = t.key === activeKey;
            const Panel = t.Component;
            return (
              <div
                key={t.key}
                id={`panel-${t.key}`}
                role="tabpanel"
                aria-labelledby={`tab-${t.key}`}
                hidden={!active}
              >
                <Panel project={project} active={active} />
              </div>
            );
          })}
      </div>
    </div>
  );
}