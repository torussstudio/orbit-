import { useEffect, useState } from "react";
import axios from "../lib/axios";
import Modal from "../components/Modal";
import ConfirmModal from "../components/ConfirmModal";
import Select from "../components/Select";
import { Loader } from "../components/Loader";

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

export default function Credentials({ projectId, user }) {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);

  const [revealed, setRevealed] = useState({});

  const [clusterModalOpen, setClusterModalOpen] = useState(false);
  const [entryModalOpen, setEntryModalOpen] = useState(false);

  const [editingCluster, setEditingCluster] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);

  const [clusterForm, setClusterForm] = useState(INITIAL_CLUSTER_FORM);
  const [entryForm, setEntryForm] = useState(INITIAL_ENTRY_FORM);

  const [savingCluster, setSavingCluster] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);

  const [confirmModal, setConfirmModal] = useState(
    INITIAL_CONFIRM_MODAL
  );

  const isManager = user?.role === "manager";

  /* -------------------------------------------------------------------------- */
  /* LOAD CREDENTIALS                                                           */
  /* -------------------------------------------------------------------------- */

  const loadCredentials = async () => {
    if (!projectId) return;

    setLoading(true);

    try {
      const response = await axios.get(
        `/credentials/project/${projectId}`
      );

      const data = response?.data;

      setClusters(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load credentials:", error);
      setClusters([]);

      alert(
        error?.response?.data?.message ||
          "Failed to load credentials"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCredentials();
  }, [projectId]);

  /*
   * Revealed credentials are intentionally kept only in React memory.
   * Reset them whenever project changes.
   */
  useEffect(() => {
    setRevealed({});
  }, [projectId]);

  /* -------------------------------------------------------------------------- */
  /* VALIDATION                                                                 */
  /* -------------------------------------------------------------------------- */

  const validateClusterForm = () => {
    const name = clusterForm.name.trim();

    if (!name) {
      alert("Cluster name is required.");
      return false;
    }

    if (name.length > MAX_CLUSTER_NAME_LENGTH) {
      alert(
        `Cluster name must be ${MAX_CLUSTER_NAME_LENGTH} characters or less.`
      );
      return false;
    }

    if (!VALID_VISIBILITIES.includes(clusterForm.visibility)) {
      alert("Invalid visibility.");
      return false;
    }

    return true;
  };

  const validateEntryForm = () => {
    const label = entryForm.label.trim();
    const value = entryForm.value.trim();

    if (!label) {
      alert("Credential label is required.");
      return false;
    }

    if (label.length > MAX_ENTRY_LABEL_LENGTH) {
      alert(
        `Credential label must be ${MAX_ENTRY_LABEL_LENGTH} characters or less.`
      );
      return false;
    }

    if (!value) {
      alert("Credential value is required.");
      return false;
    }

    if (!entryForm.cluster_id) {
      alert("Please select a credential cluster.");
      return false;
    }

    return true;
  };

  /* -------------------------------------------------------------------------- */
  /* CLUSTER MODAL                                                              */
  /* -------------------------------------------------------------------------- */

  const openCreateCluster = () => {
    setEditingCluster(null);
    setClusterForm(INITIAL_CLUSTER_FORM);
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

    setClusterModalOpen(true);
  };

  const closeClusterModal = () => {
    if (savingCluster) return;

    setClusterModalOpen(false);
    setEditingCluster(null);
    setClusterForm(INITIAL_CLUSTER_FORM);
  };

  /* -------------------------------------------------------------------------- */
  /* SAVE CLUSTER                                                               */
  /* -------------------------------------------------------------------------- */

  const saveCluster = async (event) => {
    event?.preventDefault();

    if (savingCluster) return;

    if (!validateClusterForm()) return;

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

      closeClusterModal();
      await loadCredentials();
    } catch (error) {
      console.error("Failed to save cluster:", error);

      alert(
        error?.response?.data?.message ||
          "Failed to save credential cluster"
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

    setEntryModalOpen(true);
  };

  const openEditEntry = (entry, clusterId) => {
    setEditingEntry(entry);

    setEntryForm({
      label: entry?.label || "",
      value: entry?.value || "",
      cluster_id: clusterId || entry?.cluster_id || "",
    });

    setEntryModalOpen(true);
  };

  const closeEntryModal = () => {
    if (savingEntry) return;

    setEntryModalOpen(false);
    setEditingEntry(null);
    setEntryForm(INITIAL_ENTRY_FORM);
  };

  /* -------------------------------------------------------------------------- */
  /* SAVE ENTRY                                                                 */
  /* -------------------------------------------------------------------------- */

  const saveEntry = async (event) => {
    event?.preventDefault();

    if (savingEntry) return;

    if (!validateEntryForm()) return;

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

      closeEntryModal();
      await loadCredentials();
    } catch (error) {
      console.error("Failed to save credential entry:", error);

      alert(
        error?.response?.data?.message ||
          "Failed to save credential"
      );
    } finally {
      setSavingEntry(false);
    }
  };

  /* -------------------------------------------------------------------------- */
  /* DELETE CLUSTER                                                             */
  /* -------------------------------------------------------------------------- */

  const requestDeleteCluster = (cluster) => {
    setConfirmModal({
      open: true,
      title: "Delete credential cluster",
      message: `Are you sure you want to delete "${cluster?.name || "this cluster"}"? This action cannot be undone.`,
      action: async () => {
        try {
          await axios.delete(
            `/credentials/clusters/${cluster.id}`
          );

          await loadCredentials();
        } catch (error) {
          console.error("Failed to delete cluster:", error);

          alert(
            error?.response?.data?.message ||
              "Failed to delete credential cluster"
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
      message: `Are you sure you want to delete "${entry?.label || "this credential"}"? This action cannot be undone.`,
      action: async () => {
        try {
          await axios.delete(
            `/credentials/entries/${entry.id}`
          );

          await loadCredentials();
        } catch (error) {
          console.error("Failed to delete credential:", error);

          alert(
            error?.response?.data?.message ||
              "Failed to delete credential"
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
  /* REVEAL / HIDE                                                              */
  /* -------------------------------------------------------------------------- */

  const toggleReveal = (entryId) => {
    setRevealed((previous) => ({
      ...previous,
      [entryId]: !previous[entryId],
    }));
  };

  /* -------------------------------------------------------------------------- */
  /* CLUSTER OPTIONS                                                            */
  /* -------------------------------------------------------------------------- */

  const clusterOptions = clusters.map((cluster) => ({
    value: cluster.id,
    label: cluster.name,
  }));

  /* -------------------------------------------------------------------------- */
  /* LOADING                                                                    */
  /* -------------------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="flex min-h-[240px] w-full items-center justify-center">
        <Loader label="Loading credentials..." />
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* MAIN                                                                        */
  /* -------------------------------------------------------------------------- */

  return (
    <>
      <div className="w-full space-y-5">
        {/* ------------------------------------------------------------------ */}
        {/* HEADER                                                             */}
        {/* ------------------------------------------------------------------ */}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--text)]">
              Credentials
            </h2>

            <p className="mt-1 text-xs text-[var(--text-3)]">
              Manage project credentials and sensitive configuration.
            </p>
          </div>

          {isManager && (
            <button
              type="button"
              onClick={openCreateCluster}
              className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              + Add Cluster
            </button>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* EMPTY STATE                                                        */}
        {/* ------------------------------------------------------------------ */}

        {clusters.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-2)] px-5 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg)] text-lg text-[var(--text-3)]">
              🔐
            </div>

            <h3 className="mt-4 text-sm font-semibold text-[var(--text)]">
              No credentials yet
            </h3>

            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[var(--text-3)]">
              Create a credential cluster to securely organize
              project credentials.
            </p>

            {isManager && (
              <button
                type="button"
                onClick={openCreateCluster}
                className="mt-5 inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-3)]"
              >
                Create your first cluster
              </button>
            )}
          </div>
        ) : (
          /* ---------------------------------------------------------------- */
          /* CLUSTERS                                                         */
          /* ---------------------------------------------------------------- */
          <div className="space-y-4">
            {clusters.map((cluster) => {
              const entries = Array.isArray(cluster.entries)
                ? cluster.entries
                : [];

              return (
                <section
                  key={cluster.id}
                  className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-2)]"
                >
                  {/* ------------------------------------------------------ */}
                  {/* CLUSTER HEADER                                         */}
                  {/* ------------------------------------------------------ */}

                  <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-[var(--text)]">
                          {cluster.name}
                        </h3>

                        <span className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                          {cluster.visibility || "private"}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-[var(--text-3)]">
                        {entries.length}{" "}
                        {entries.length === 1
                          ? "credential"
                          : "credentials"}
                      </p>
                    </div>

                    {isManager && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openCreateEntry(cluster.id)
                          }
                          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
                        >
                          + Credential
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            openEditCluster(cluster)
                          }
                          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-3)]"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            requestDeleteCluster(cluster)
                          }
                          className="rounded-lg border border-[var(--danger)]/40 bg-transparent px-3 py-2 text-xs font-medium text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ------------------------------------------------------ */}
                  {/* CREDENTIALS                                            */}
                  {/* ------------------------------------------------------ */}

                  {entries.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <p className="text-xs text-[var(--text-3)]">
                        No credentials in this cluster.
                      </p>

                      {isManager && (
                        <button
                          type="button"
                          onClick={() =>
                            openCreateEntry(cluster.id)
                          }
                          className="mt-3 text-xs font-medium text-[var(--accent)] hover:underline"
                        >
                          Add a credential
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--border)]">
                      {entries.map((entry) => {
                        const isRevealed = Boolean(
                          revealed[entry.id]
                        );

                        const displayValue = isRevealed
                          ? entry.value
                          : "••••••••";

                        return (
                          <div
                            key={entry.id}
                            className="flex flex-col gap-3 p-4 transition-colors hover:bg-[var(--bg-3)]/40 sm:flex-row sm:items-start sm:justify-between"
                          >
                            {/* ------------------------------------------------ */}
                            {/* ENTRY CONTENT                                  */}
                            {/* ------------------------------------------------ */}

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-[var(--text)]">
                                  {entry.label}
                                </span>
                              </div>

                              <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                                <code
                                  className={`block break-all text-xs ${
                                    isRevealed
                                      ? "font-mono text-[var(--text)]"
                                      : "font-mono tracking-[0.15em] text-[var(--text-3)]"
                                  }`}
                                >
                                  {displayValue}
                                </code>
                              </div>
                            </div>

                            {/* ------------------------------------------------ */}
                            {/* ENTRY ACTIONS                                  */}
                            {/* ------------------------------------------------ */}

                            <div className="flex shrink-0 items-center gap-2">
                              {isManager && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleReveal(entry.id)
                                    }
                                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-3)]"
                                  >
                                    {isRevealed
                                      ? "Hide"
                                      : "Reveal"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      openEditEntry(
                                        entry,
                                        cluster.id
                                      )
                                    }
                                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-3)]"
                                  >
                                    Edit
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      requestDeleteEntry(entry)
                                    }
                                    className="rounded-lg border border-[var(--danger)]/40 bg-transparent px-3 py-2 text-xs font-medium text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
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

      <Modal
        title={
          editingCluster
            ? "Edit Credential Cluster"
            : "Create Credential Cluster"
        }
        open={clusterModalOpen}
        onClose={closeClusterModal}
      >
        <form
          onSubmit={saveCluster}
          className="space-y-5"
        >
          <div>
            <label
              htmlFor="credential-cluster-name"
              className="mb-1.5 block text-xs font-medium text-[var(--text-2)]"
            >
              Cluster Name
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
              placeholder="e.g. Production"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-3)] focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
            />

            <p className="mt-1.5 text-[10px] text-[var(--text-3)]">
              Maximum {MAX_CLUSTER_NAME_LENGTH} characters.
            </p>
          </div>

          <div>
            <label
              htmlFor="credential-cluster-visibility"
              className="mb-1.5 block text-xs font-medium text-[var(--text-2)]"
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
                {
                  value: "private",
                  label: "Private",
                },
                {
                  value: "public",
                  label: "Public",
                },
              ]}
              disabled={savingCluster}
            />
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeClusterModal}
              disabled={savingCluster}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-3)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={savingCluster}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingCluster && (
                <Loader
                  size="sm"
                  variant="inline"
                />
              )}

              {editingCluster
                ? "Save Changes"
                : "Create Cluster"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ====================================================================== */}
      {/* CREATE / EDIT ENTRY MODAL                                              */}
      {/* ====================================================================== */}

      <Modal
        title={
          editingEntry
            ? "Edit Credential"
            : "Add Credential"
        }
        open={entryModalOpen}
        onClose={closeEntryModal}
      >
        <form
          onSubmit={saveEntry}
          className="space-y-5"
        >
          <div>
            <label
              htmlFor="credential-entry-cluster"
              className="mb-1.5 block text-xs font-medium text-[var(--text-2)]"
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
              className="mb-1.5 block text-xs font-medium text-[var(--text-2)]"
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
              placeholder="e.g. Database Password"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-3)] focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
            />

            <p className="mt-1.5 text-[10px] text-[var(--text-3)]">
              Maximum {MAX_ENTRY_LABEL_LENGTH} characters.
            </p>
          </div>

          <div>
            <label
              htmlFor="credential-entry-value"
              className="mb-1.5 block text-xs font-medium text-[var(--text-2)]"
            >
              Credential Value
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
              placeholder="Enter credential value"
              spellCheck={false}
              className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 font-mono text-xs text-[var(--text)] outline-none transition-colors placeholder:font-sans placeholder:text-[var(--text-3)] focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
            />

            <p className="mt-1.5 text-[10px] leading-4 text-[var(--text-3)]">
              Sensitive values are kept in component memory and are
              not persisted in browser storage by this page.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeEntryModal}
              disabled={savingEntry}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-3)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={savingEntry}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingEntry && (
                <Loader
                  size="sm"
                  variant="inline"
                />
              )}

              {editingEntry
                ? "Save Changes"
                : "Add Credential"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ====================================================================== */}
      {/* CONFIRM DELETE                                                         */}
      {/* ====================================================================== */}

      <ConfirmModal
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={executeConfirmAction}
        onCancel={closeConfirmModal}
      />
    </>
  );
}