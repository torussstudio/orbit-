import { useEffect, useRef, useState } from "react";
import axios from "../api/client";
import Modal from "../components/ui/Modal";
import ConfirmModal from "../components/ui/ConfirmModal";
import Select from "../components/ui/Select";
import { Loader } from "../components/ui/Loader";
import { useAuth } from "../context/AuthContext";

const INITIAL_CLUSTER_FORM = {
  name: "",
  visibility: "private",
};

const INITIAL_ENTRY_FORM = {
  label: "",
  value: "",
  cluster_id: "",
};

const INITIAL_CONFIRM_MODAL = {
  open: false,
  title: "",
  message: "",
  action: null,
};

const MAX_CLUSTER_NAME_LENGTH = 100;
const MAX_ENTRY_LABEL_LENGTH = 100;

const VALID_VISIBILITIES = ["private", "public"];

const VISIBILITY_LABELS = {
  private: "Private",
  public: "Public",
};

const COPIED_FEEDBACK_MS = 1500;

/* -------------------------------------------------------------------------- */
/* SHARED STYLES                                                              */
/* -------------------------------------------------------------------------- */

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]";

const buttonBase = `inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,opacity,transform] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

const primaryButton = `${buttonBase} bg-[var(--accent)] px-4 py-2.5 text-sm text-white hover:opacity-90`;

const modalPrimaryButton = `${buttonBase} bg-[var(--accent)] px-4 py-2.5 text-xs text-white hover:opacity-90`;

const modalSecondaryButton = `${buttonBase} border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-xs text-[var(--text)] hover:bg-[var(--bg-3)]`;

const secondaryButton = `${buttonBase} border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--bg-3)]`;

const textButton = `${buttonBase} rounded-md px-2 py-1.5 text-xs text-[var(--accent)] hover:bg-[var(--bg-3)]`;

const iconButton = `inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-3)] transition-[background-color,color,transform] duration-200 hover:bg-[var(--bg-3)] hover:text-[var(--text)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

const dangerIconButton = `inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-3)] transition-[background-color,color,transform] duration-200 hover:bg-[var(--danger)]/10 hover:text-[var(--danger)] active:scale-95 ${focusRing}`;

const fieldLabel = "mb-1.5 block text-xs font-medium text-[var(--text-2)]";

const fieldInput =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none transition-colors duration-200 placeholder:text-[var(--text-3)] focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60";

/* -------------------------------------------------------------------------- */
/* ICONS (one stroke weight, no icon library)                                 */
/* -------------------------------------------------------------------------- */

function Icon({ size = 16, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const PlusIcon = () => (
  <Icon>
    <path d="M10 4.5v11M4.5 10h11" />
  </Icon>
);

const EyeIcon = () => (
  <Icon>
    <path d="M1.5 10s3-5.5 8.5-5.5S18.5 10 18.5 10 15 15.5 10 15.5 1.5 10 1.5 10Z" />
    <circle cx="10" cy="10" r="2.5" />
  </Icon>
);

const EyeOffIcon = () => (
  <Icon>
    <path d="M1.5 10s3-5.5 8.5-5.5S18.5 10 18.5 10 15 15.5 10 15.5 1.5 10 1.5 10Z" />
    <circle cx="10" cy="10" r="2.5" />
    <path d="M3.5 3.5l13 13" />
  </Icon>
);

const CopyIcon = () => (
  <Icon>
    <rect x="7" y="7" width="9" height="9" rx="2" />
    <path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" />
  </Icon>
);

const CheckIcon = () => (
  <Icon>
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </Icon>
);

const PencilIcon = () => (
  <Icon>
    <path d="M12.5 4.5l3 3L7 16H4v-3l8.5-8.5Z" />
  </Icon>
);

const TrashIcon = () => (
  <Icon>
    <path d="M4 6h12M8 6V4.5h4V6M6 6l.6 9.5h6.8L14 6" />
  </Icon>
);

const LockIcon = ({ size = 14 }) => (
  <Icon size={size}>
    <rect x="4.5" y="9" width="11" height="7.5" rx="2" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </Icon>
);

const GlobeIcon = ({ size = 14 }) => (
  <Icon size={size}>
    <circle cx="10" cy="10" r="7" />
    <path d="M3 10h14M10 3c2 2 3 4.5 3 7s-1 5-3 7c-2-2-3-4.5-3-7s1-5 3-7Z" />
  </Icon>
);

const VaultIcon = () => (
  <Icon size={22}>
    <rect x="3" y="4" width="14" height="12" rx="2.5" />
    <circle cx="10" cy="10" r="2.5" />
    <path d="M10 7.5V6M10 14v-1.5M12.5 10H14M6 10h1.5" />
  </Icon>
);

/* -------------------------------------------------------------------------- */
/* SMALL PRESENTATIONAL PIECES                                                */
/* -------------------------------------------------------------------------- */

function ErrorBanner({ message, onRetry, onDismiss }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-xs leading-5 text-[var(--danger)]">{message}</p>

      <div className="flex shrink-0 items-center gap-1">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={`${buttonBase} rounded-md px-2.5 py-1.5 text-xs text-[var(--danger)] hover:bg-[var(--danger)]/10`}
          >
            Try again
          </button>
        )}

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={`${buttonBase} rounded-md px-2.5 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--bg-3)]`}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyPreview() {
  const rows = [
    "Database password",
    "Payment gateway key",
    "SMTP password",
  ];

  return (
    <div
      aria-hidden="true"
      className="hidden select-none overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] [mask-image:linear-gradient(to_bottom,black_55%,transparent)] lg:block"
    >
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="text-xs font-semibold text-[var(--text)]">
          Production
        </div>

        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
          <LockIcon size={12} />
          Private
          <span>·</span>
          <span className="tabular-nums">3 credentials</span>
        </div>
      </div>

      <div className="divide-y divide-[var(--border)]">
        {rows.map((label) => (
          <div
            key={label}
            className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-3 px-4 py-3"
          >
            <span className="truncate text-xs font-medium text-[var(--text-2)]">
              {label}
            </span>

            <span className="rounded-md bg-[var(--bg-2)] px-2.5 py-1.5 font-mono text-[11px] tracking-[0.2em] text-[var(--text-3)]">
              ••••••••••••
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CredentialsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <span className="sr-only" role="status">
        Loading credentials
      </span>

      {[0, 1].map((index) => (
        <div
          key={index}
          className="animate-pulse overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-2)]"
        >
          <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] p-4">
            <div className="space-y-2">
              <div className="h-3.5 w-36 rounded bg-[var(--bg-3)]" />
              <div className="h-3 w-20 rounded bg-[var(--bg-3)]" />
            </div>
            <div className="h-7 w-24 rounded-md bg-[var(--bg-3)]" />
          </div>

          <div className="space-y-4 p-4">
            {[0, 1].map((row) => (
              <div
                key={row}
                className="flex items-center gap-4"
              >
                <div className="h-3 w-28 rounded bg-[var(--bg-3)]" />
                <div className="h-8 flex-1 rounded-md bg-[var(--bg-3)]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function Credentials({ project, active = true }) {
  const projectId = project?.id;
  const { isManager } = useAuth();

  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  const [revealed, setRevealed] = useState({});
  const [copiedId, setCopiedId] = useState(null);

  const [clusterModalOpen, setClusterModalOpen] = useState(false);
  const [entryModalOpen, setEntryModalOpen] = useState(false);

  const [editingCluster, setEditingCluster] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);

  const [clusterForm, setClusterForm] = useState(INITIAL_CLUSTER_FORM);
  const [entryForm, setEntryForm] = useState(INITIAL_ENTRY_FORM);

  const [clusterError, setClusterError] = useState("");
  const [entryError, setEntryError] = useState("");

  const [savingCluster, setSavingCluster] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);

  const [confirmModal, setConfirmModal] = useState(INITIAL_CONFIRM_MODAL);

  // Guards against a slow response from a previous project overwriting
  // the current project's data.
  const requestIdRef = useRef(0);
  const copyTimerRef = useRef(null);

  useEffect(() => {
    return () => clearTimeout(copyTimerRef.current);
  }, []);

  /* -------------------------------------------------------------------------- */
  /* LOAD CREDENTIALS                                                           */
  /* -------------------------------------------------------------------------- */

  const loadCredentials = async () => {
    if (!projectId) return;

    const requestId = ++requestIdRef.current;

    try {
      const response = await axios.get(
        `/credentials/project/${projectId}`
      );

      if (requestId !== requestIdRef.current) return;

      const data = response?.data;

      setClusters(Array.isArray(data) ? data : []);
      setLoadError("");
    } catch (error) {
      if (requestId !== requestIdRef.current) return;

      console.error("Failed to load credentials:", error);

      setLoadError(
        error?.response?.data?.message ||
          "We couldn't load credentials. Check your connection and try again."
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  // Start clean whenever the project changes so the previous project's
  // credentials are never shown under the new one.
  useEffect(() => {
    requestIdRef.current += 1;
    setClusters([]);
    setLoading(true);
    setLoadError("");
    setActionError("");
    setRevealed({});
  }, [projectId]);

  // Fetch on mount and every time this tab becomes active (silent refetch)
  useEffect(() => {
    if (active) loadCredentials();
  }, [projectId, active]);

  /*
   * Revealed credentials are kept only in React memory. Hide them again
   * whenever the tab is left or the project changes, since the tab now
   * stays mounted in the background.
   */
  useEffect(() => {
    if (!active) setRevealed({});
  }, [projectId, active]);

  /* -------------------------------------------------------------------------- */
  /* VALIDATION                                                                 */
  /* -------------------------------------------------------------------------- */

  const getClusterFormError = () => {
    const name = clusterForm.name.trim();

    if (!name) return "Enter a cluster name.";

    if (name.length > MAX_CLUSTER_NAME_LENGTH) {
      return `Cluster name must be ${MAX_CLUSTER_NAME_LENGTH} characters or fewer.`;
    }

    if (!VALID_VISIBILITIES.includes(clusterForm.visibility)) {
      return "Choose a valid visibility.";
    }

    return "";
  };

  const getEntryFormError = () => {
    const label = entryForm.label.trim();
    const value = entryForm.value.trim();

    if (!label) return "Enter a label for this credential.";

    if (label.length > MAX_ENTRY_LABEL_LENGTH) {
      return `Label must be ${MAX_ENTRY_LABEL_LENGTH} characters or fewer.`;
    }

    if (!value) return "Enter the credential value.";

    if (!entryForm.cluster_id) return "Choose a cluster.";

    return "";
  };

  /* -------------------------------------------------------------------------- */
  /* CLUSTER MODAL                                                              */
  /* -------------------------------------------------------------------------- */

  const openCreateCluster = () => {
    setEditingCluster(null);
    setClusterForm(INITIAL_CLUSTER_FORM);
    setClusterError("");
    setClusterModalOpen(true);
  };

  const openEditCluster = (cluster) => {
    setEditingCluster(cluster);

    setClusterForm({
      name: cluster?.name || "",
      visibility: VALID_VISIBILITIES.includes(cluster?.visibility)
        ? cluster.visibility
        : "private",
    });

    setClusterError("");
    setClusterModalOpen(true);
  };

  const closeClusterModal = () => {
    if (savingCluster) return;

    setClusterModalOpen(false);
    setEditingCluster(null);
    setClusterForm(INITIAL_CLUSTER_FORM);
    setClusterError("");
  };

  /* -------------------------------------------------------------------------- */
  /* SAVE CLUSTER                                                               */
  /* -------------------------------------------------------------------------- */

  const saveCluster = async (event) => {
    event?.preventDefault();

    if (savingCluster) return;

    const validationError = getClusterFormError();

    if (validationError) {
      setClusterError(validationError);
      return;
    }

    setClusterError("");
    setSavingCluster(true);

    const payload = {
      name: clusterForm.name.trim(),
      visibility: clusterForm.visibility,
      project_id: projectId,
    };

    try {
      if (editingCluster?.id) {
        await axios.put(
          `/credentials/clusters/${editingCluster.id}`,
          payload
        );
      } else {
        await axios.post("/credentials/clusters", payload);
      }

      setSavingCluster(false);
      closeClusterModal();
      await loadCredentials();
    } catch (error) {
      console.error("Failed to save cluster:", error);

      setClusterError(
        error?.response?.data?.message ||
          "We couldn't save this cluster. Please try again."
      );
    } finally {
      setSavingCluster(false);
    }
  };

  /* -------------------------------------------------------------------------- */
  /* ENTRY MODAL                                                                */
  /* -------------------------------------------------------------------------- */

  const openCreateEntry = (clusterId = "") => {
    setEditingEntry(null);

    setEntryForm({
      ...INITIAL_ENTRY_FORM,
      cluster_id: clusterId || "",
    });

    setEntryError("");
    setEntryModalOpen(true);
  };

  const openEditEntry = (entry, clusterId) => {
    setEditingEntry(entry);

    setEntryForm({
      label: entry?.label || "",
      value: entry?.value || "",
      cluster_id: clusterId || entry?.cluster_id || "",
    });

    setEntryError("");
    setEntryModalOpen(true);
  };

  const closeEntryModal = () => {
    if (savingEntry) return;

    setEntryModalOpen(false);
    setEditingEntry(null);
    setEntryForm(INITIAL_ENTRY_FORM);
    setEntryError("");
  };

  /* -------------------------------------------------------------------------- */
  /* SAVE ENTRY                                                                 */
  /* -------------------------------------------------------------------------- */

  const saveEntry = async (event) => {
    event?.preventDefault();

    if (savingEntry) return;

    const validationError = getEntryFormError();

    if (validationError) {
      setEntryError(validationError);
      return;
    }

    setEntryError("");
    setSavingEntry(true);

    const payload = {
      label: entryForm.label.trim(),
      value: entryForm.value.trim(),
      cluster_id: entryForm.cluster_id,
    };

    try {
      if (editingEntry?.id) {
        await axios.put(
          `/credentials/entries/${editingEntry.id}`,
          payload
        );
      } else {
        await axios.post("/credentials/entries", payload);
      }

      setSavingEntry(false);
      closeEntryModal();
      await loadCredentials();
    } catch (error) {
      console.error("Failed to save credential entry:", error);

      setEntryError(
        error?.response?.data?.message ||
          "We couldn't save this credential. Please try again."
      );
    } finally {
      setSavingEntry(false);
    }
  };

  /* -------------------------------------------------------------------------- */
  /* DELETE CLUSTER                                                             */
  /* -------------------------------------------------------------------------- */

  const requestDeleteCluster = (cluster) => {
    const count = Array.isArray(cluster?.entries)
      ? cluster.entries.length
      : 0;

    setConfirmModal({
      open: true,
      title: "Delete credential cluster",
      message: `Delete "${cluster?.name || "this cluster"}"?${
        count > 0
          ? ` It contains ${count} ${
              count === 1 ? "credential" : "credentials"
            }.`
          : ""
      } This can't be undone.`,
      action: async () => {
        try {
          await axios.delete(
            `/credentials/clusters/${cluster.id}`
          );

          await loadCredentials();
        } catch (error) {
          console.error("Failed to delete cluster:", error);

          setActionError(
            error?.response?.data?.message ||
              "We couldn't delete this cluster. Please try again."
          );
        }
      },
    });
  };

  /* -------------------------------------------------------------------------- */
  /* DELETE ENTRY                                                               */
  /* -------------------------------------------------------------------------- */

  const requestDeleteEntry = (entry) => {
    setConfirmModal({
      open: true,
      title: "Delete credential",
      message: `Delete "${entry?.label || "this credential"}"? This can't be undone.`,
      action: async () => {
        try {
          await axios.delete(
            `/credentials/entries/${entry.id}`
          );

          await loadCredentials();
        } catch (error) {
          console.error("Failed to delete credential:", error);

          setActionError(
            error?.response?.data?.message ||
              "We couldn't delete this credential. Please try again."
          );
        }
      },
    });
  };

  /* -------------------------------------------------------------------------- */
  /* CONFIRM ACTION                                                             */
  /* -------------------------------------------------------------------------- */

  const executeConfirmAction = async () => {
    if (!confirmModal.action) return;

    const action = confirmModal.action;

    setActionError("");
    setConfirmModal(INITIAL_CONFIRM_MODAL);

    try {
      await action();
    } catch (error) {
      console.error("Confirmation action failed:", error);
    }
  };

  const closeConfirmModal = () => {
    setConfirmModal(INITIAL_CONFIRM_MODAL);
  };

  /* -------------------------------------------------------------------------- */
  /* REVEAL / COPY                                                              */
  /* -------------------------------------------------------------------------- */

  const toggleReveal = (entryId) => {
    setRevealed((previous) => ({
      ...previous,
      [entryId]: !previous[entryId],
    }));
  };

  const copyValue = async (entry) => {
    try {
      await navigator.clipboard.writeText(entry?.value ?? "");

      setCopiedId(entry.id);

      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(
        () => setCopiedId(null),
        COPIED_FEEDBACK_MS
      );
    } catch (error) {
      console.error("Failed to copy credential:", error);

      setActionError(
        "We couldn't copy to the clipboard. Reveal the value and copy it manually."
      );
    }
  };

  /* -------------------------------------------------------------------------- */
  /* CLUSTER OPTIONS                                                            */
  /* -------------------------------------------------------------------------- */

  const clusterOptions = clusters.map((cluster) => ({
    value: cluster.id,
    label: cluster.name,
  }));

  /* -------------------------------------------------------------------------- */
  /* MAIN                                                                       */
  /* -------------------------------------------------------------------------- */

  return (
    <>
      <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-10">
        {/* Screen reader announcement for copy feedback */}
        <span className="sr-only" role="status">
          {copiedId ? "Copied to clipboard" : ""}
        </span>

        {/* ------------------------------------------------------------------ */}
        {/* HEADER                                                             */}
        {/* ------------------------------------------------------------------ */}

        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-tight tracking-tight text-[var(--text)]">
              Credentials
            </h2>

            <p className="mt-1.5 max-w-xl text-sm leading-6 text-[var(--text-3)] [text-wrap:pretty]">
              Keep this project's secrets in one place, grouped by
              environment or service.
            </p>
          </div>

          {isManager && (
            <button
              type="button"
              onClick={openCreateCluster}
              className={`${primaryButton} w-full sm:w-auto`}
            >
              <PlusIcon />
              Add cluster
            </button>
          )}
        </header>

        {/* ------------------------------------------------------------------ */}
        {/* ERRORS                                                             */}
        {/* ------------------------------------------------------------------ */}

        {loadError && (
          <ErrorBanner
            message={loadError}
            onRetry={() => {
              setLoadError("");
              loadCredentials();
            }}
          />
        )}

        {actionError && (
          <ErrorBanner
            message={actionError}
            onDismiss={() => setActionError("")}
          />
        )}

        {/* ------------------------------------------------------------------ */}
        {/* BODY                                                               */}
        {/* ------------------------------------------------------------------ */}

        {loading ? (
          <CredentialsSkeleton />
        ) : clusters.length === 0 ? (
          loadError ? null : (
            <div className="grid items-center gap-8 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-2)] p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16 lg:p-12">
              <div className="min-w-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-3)]">
                  <VaultIcon />
                </div>

                <h3 className="mt-5 text-base font-semibold tracking-tight text-[var(--text)]">
                  No credentials yet
                </h3>

                <p className="mt-1.5 max-w-md text-sm leading-6 text-[var(--text-3)] [text-wrap:pretty]">
                  {isManager
                    ? "A cluster groups related credentials, such as Production or Staging. Create one, then add the first credential to it."
                    : "A manager needs to create the first cluster before credentials appear here."}
                </p>

                {isManager && (
                  <button
                    type="button"
                    onClick={openCreateCluster}
                    className={`${secondaryButton} mt-6`}
                  >
                    <PlusIcon />
                    Create your first cluster
                  </button>
                )}
              </div>

              <EmptyPreview />
            </div>
          )
        ) : (
          <div className="space-y-5">
            {clusters.map((cluster) => {
              const entries = Array.isArray(cluster.entries)
                ? cluster.entries
                : [];

              const visibility = VALID_VISIBILITIES.includes(
                cluster.visibility
              )
                ? cluster.visibility
                : "private";

              const headingId = `credential-cluster-${cluster.id}`;

              return (
                <section
                  key={cluster.id}
                  aria-labelledby={headingId}
                  className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-2)]"
                >
                  {/* ------------------------------------------------------ */}
                  {/* CLUSTER HEADER                                         */}
                  {/* ------------------------------------------------------ */}

                  <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3
                        id={headingId}
                        className="truncate text-sm font-semibold tracking-tight text-[var(--text)]"
                      >
                        {cluster.name}
                      </h3>

                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-3)]">
                        <span className="inline-flex items-center gap-1">
                          {visibility === "public" ? (
                            <GlobeIcon />
                          ) : (
                            <LockIcon />
                          )}
                          {VISIBILITY_LABELS[visibility]}
                        </span>

                        <span aria-hidden="true">·</span>

                        <span className="tabular-nums">
                          {entries.length}{" "}
                          {entries.length === 1
                            ? "credential"
                            : "credentials"}
                        </span>
                      </p>
                    </div>

                    {isManager && (
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            openCreateEntry(cluster.id)
                          }
                          className={textButton}
                        >
                          <PlusIcon />
                          Add credential
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            openEditCluster(cluster)
                          }
                          aria-label={`Edit cluster ${cluster.name}`}
                          title="Edit cluster"
                          className={iconButton}
                        >
                          <PencilIcon />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            requestDeleteCluster(cluster)
                          }
                          aria-label={`Delete cluster ${cluster.name}`}
                          title="Delete cluster"
                          className={dangerIconButton}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ------------------------------------------------------ */}
                  {/* CREDENTIALS                                            */}
                  {/* ------------------------------------------------------ */}

                  {entries.length === 0 ? (
                    <div className="flex flex-col items-start gap-1 px-4 py-6 sm:flex-row sm:items-center sm:gap-3">
                      <p className="text-xs text-[var(--text-3)]">
                        Nothing stored in this cluster yet.
                      </p>

                      {isManager && (
                        <button
                          type="button"
                          onClick={() =>
                            openCreateEntry(cluster.id)
                          }
                          className={`${textButton} -ml-2 sm:ml-0`}
                        >
                          Add the first credential
                        </button>
                      )}
                    </div>
                  ) : (
                    <ul className="divide-y divide-[var(--border)]">
                      {entries.map((entry) => {
                        const isRevealed = Boolean(
                          revealed[entry.id]
                        );

                        const isCopied = copiedId === entry.id;

                        const displayValue = isRevealed
                          ? entry.value
                          : "••••••••••••";

                        return (
                          <li
                            key={entry.id}
                            className="flex flex-col gap-2 px-4 py-3.5 transition-colors duration-200 hover:bg-[var(--bg-3)]/40 sm:grid sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                          >
                            {/* -------------------------------------------- */}
                            {/* LABEL                                        */}
                            {/* -------------------------------------------- */}

                            <span className="break-words text-sm font-medium text-[var(--text)]">
                              {entry.label}
                            </span>

                            {/* -------------------------------------------- */}
                            {/* VALUE                                        */}
                            {/* -------------------------------------------- */}

                            <div className="min-w-0 rounded-md bg-[var(--bg)] px-3 py-2">
                              <code
                                className={`block break-all font-mono text-xs ${
                                  isRevealed
                                    ? "text-[var(--text)]"
                                    : "tracking-[0.2em] text-[var(--text-3)]"
                                }`}
                              >
                                {displayValue}
                              </code>
                            </div>

                            {/* -------------------------------------------- */}
                            {/* ACTIONS                                      */}
                            {/* -------------------------------------------- */}

                            {isManager && (
                              <div className="flex shrink-0 items-center gap-0.5 sm:justify-end">
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleReveal(entry.id)
                                  }
                                  aria-pressed={isRevealed}
                                  aria-label={`${
                                    isRevealed ? "Hide" : "Reveal"
                                  } ${entry.label}`}
                                  title={
                                    isRevealed ? "Hide" : "Reveal"
                                  }
                                  className={iconButton}
                                >
                                  {isRevealed ? (
                                    <EyeOffIcon />
                                  ) : (
                                    <EyeIcon />
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => copyValue(entry)}
                                  aria-label={`Copy ${entry.label}`}
                                  title={isCopied ? "Copied" : "Copy"}
                                  className={`${iconButton} ${
                                    isCopied
                                      ? "text-[var(--accent)]"
                                      : ""
                                  }`}
                                >
                                  {isCopied ? (
                                    <CheckIcon />
                                  ) : (
                                    <CopyIcon />
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    openEditEntry(
                                      entry,
                                      cluster.id
                                    )
                                  }
                                  aria-label={`Edit ${entry.label}`}
                                  title="Edit"
                                  className={iconButton}
                                >
                                  <PencilIcon />
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    requestDeleteEntry(entry)
                                  }
                                  aria-label={`Delete ${entry.label}`}
                                  title="Delete"
                                  className={dangerIconButton}
                                >
                                  <TrashIcon />
                                </button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* ====================================================================== */}
      {/* CREATE / EDIT CLUSTER MODAL                                            */}
      {/* ====================================================================== */}

      {clusterModalOpen && (
        <Modal
          title={
            editingCluster
              ? "Edit credential cluster"
              : "Create credential cluster"
          }
          onClose={closeClusterModal}
        >
          <form onSubmit={saveCluster} className="space-y-5" noValidate>
            <div>
              <label
                htmlFor="credential-cluster-name"
                className={fieldLabel}
              >
                Cluster name
              </label>

              <input
                id="credential-cluster-name"
                type="text"
                value={clusterForm.name}
                onChange={(event) =>
                  setClusterForm((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
                maxLength={MAX_CLUSTER_NAME_LENGTH}
                disabled={savingCluster}
                autoComplete="off"
                autoFocus
                placeholder="e.g. Production"
                className={fieldInput}
              />

              <p className="mt-1.5 text-[10px] text-[var(--text-3)]">
                Up to {MAX_CLUSTER_NAME_LENGTH} characters.
              </p>
            </div>

            <div>
              <label
                htmlFor="credential-cluster-visibility"
                className={fieldLabel}
              >
                Visibility
              </label>

              <Select
                id="credential-cluster-visibility"
                value={clusterForm.visibility}
                onChange={(value) =>
                  setClusterForm((previous) => ({
                    ...previous,
                    visibility: value,
                  }))
                }
                options={[
                  { value: "private", label: "Private" },
                  { value: "public", label: "Public" },
                ]}
                disabled={savingCluster}
              />
            </div>

            {clusterError && (
              <p
                role="alert"
                className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs leading-5 text-[var(--danger)]"
              >
                {clusterError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeClusterModal}
                disabled={savingCluster}
                className={modalSecondaryButton}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={savingCluster}
                className={modalPrimaryButton}
              >
                {savingCluster && (
                  <Loader size="sm" variant="inline" />
                )}

                {editingCluster ? "Save changes" : "Create cluster"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ====================================================================== */}
      {/* CREATE / EDIT ENTRY MODAL                                              */}
      {/* ====================================================================== */}

      {entryModalOpen && (
        <Modal
          title={
            editingEntry ? "Edit credential" : "Add credential"
          }
          onClose={closeEntryModal}
        >
          <form onSubmit={saveEntry} className="space-y-5" noValidate>
            <div>
              <label
                htmlFor="credential-entry-cluster"
                className={fieldLabel}
              >
                Cluster
              </label>

              <Select
                id="credential-entry-cluster"
                value={entryForm.cluster_id}
                onChange={(value) =>
                  setEntryForm((previous) => ({
                    ...previous,
                    cluster_id: value,
                  }))
                }
                options={clusterOptions}
                disabled={savingEntry}
              />
            </div>

            <div>
              <label
                htmlFor="credential-entry-label"
                className={fieldLabel}
              >
                Label
              </label>

              <input
                id="credential-entry-label"
                type="text"
                value={entryForm.label}
                onChange={(event) =>
                  setEntryForm((previous) => ({
                    ...previous,
                    label: event.target.value,
                  }))
                }
                maxLength={MAX_ENTRY_LABEL_LENGTH}
                disabled={savingEntry}
                autoComplete="off"
                autoFocus
                placeholder="e.g. Database password"
                className={fieldInput}
              />

              <p className="mt-1.5 text-[10px] text-[var(--text-3)]">
                Up to {MAX_ENTRY_LABEL_LENGTH} characters.
              </p>
            </div>

            <div>
              <label
                htmlFor="credential-entry-value"
                className={fieldLabel}
              >
                Credential value
              </label>

              <textarea
                id="credential-entry-value"
                value={entryForm.value}
                onChange={(event) =>
                  setEntryForm((previous) => ({
                    ...previous,
                    value: event.target.value,
                  }))
                }
                disabled={savingEntry}
                autoComplete="off"
                rows={5}
                placeholder="Paste the secret here"
                spellCheck={false}
                className={`${fieldInput} resize-y font-mono text-xs placeholder:font-sans`}
              />

              <p className="mt-1.5 text-[10px] leading-4 text-[var(--text-3)]">
                Sensitive values are kept in component memory and are
                not persisted in browser storage by this page.
              </p>
            </div>

            {entryError && (
              <p
                role="alert"
                className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs leading-5 text-[var(--danger)]"
              >
                {entryError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeEntryModal}
                disabled={savingEntry}
                className={modalSecondaryButton}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={savingEntry}
                className={modalPrimaryButton}
              >
                {savingEntry && (
                  <Loader size="sm" variant="inline" />
                )}

                {editingEntry ? "Save changes" : "Add credential"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ====================================================================== */}
      {/* CONFIRM DELETE                                                         */}
      {/* ====================================================================== */}

      <ConfirmModal
        isOpen={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="Delete"
        isDangerous
        onConfirm={executeConfirmAction}
        onCancel={closeConfirmModal}
      />
    </>
  );
}