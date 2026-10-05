import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import api from "../api/client";
import { takePrefetched } from "../api/prefetch";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../utils/helpers";
import Modal from "../components/ui/Modal";
import ConfirmModal from "../components/ui/ConfirmModal";
import Loader from "../components/ui/Loader";

const safeFileUrl = (url) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "#";
    }
    return parsed.href;
  } catch {
    return "#";
  }
};

const formatSize = (bytes) => {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fileExt = (f) => {
  const fromName = f.name?.includes(".") ? f.name.split(".").pop() : "";
  return (fromName || f.mime_type?.split("/")[1] || "file").slice(0, 4);
};

// Same list as the <input accept> — the accept attribute is NOT enforced on drop,
// so dropped files are checked against this manually.
const ACCEPTED_EXTS = ["pdf", "doc", "docx", "png", "jpg", "jpeg", "txt", "csv", "zip"];
const ACCEPT_ATTR = ACCEPTED_EXTS.map((e) => `.${e}`).join(",");

const isAccepted = (file) =>
  ACCEPTED_EXTS.includes(file.name.split(".").pop().toLowerCase());

const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");

const EMPTY_CONFIRM = {
  show: false,
  title: "",
  message: "",
  action: null,
  loading: false,
  isDangerous: false,
};

/* ---------- icons ---------- */

const Svg = ({ children, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="shrink-0"
  >
    {children}
  </svg>
);

const FolderIcon = () => (
  <Svg>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
);
const UploadIcon = () => (
  <Svg>
    <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
  </Svg>
);
const NoteIcon = () => (
  <Svg>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6M8 13h8M8 17h5" />
  </Svg>
);
const PlusIcon = () => (
  <Svg>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
const CloseIcon = () => (
  <Svg size={14}>
    <path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

/* ---------- class groups ---------- */

const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3.5 py-2 " +
  "text-[13px] font-medium text-white transition-opacity hover:opacity-90 " +
  "disabled:cursor-not-allowed disabled:opacity-60";
const BTN_SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] " +
  "bg-[var(--bg)] px-3.5 py-2 text-[13px] font-medium text-[var(--text)] transition-colors " +
  "hover:bg-[var(--bg-3)] disabled:cursor-not-allowed disabled:opacity-60";
const LINK_BTN =
  "rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--bg-3)]";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-[color:var(--accent)]";
const SKEL = "rounded-md bg-[color:var(--bg-4,var(--border))] opacity-50";

export default function Knowledge({ project: propProject, active = true }) {
  const params = useParams();
  const projectId = propProject?.id || params.id;
  const { isManager } = useAuth();
  const [data, setData] = useState({ folders: [], files: [], notes: [] });
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteForm, setNoteForm] = useState({ title: "", content: "" });
  const [editingNote, setEditingNote] = useState(null);
  const [folderName, setFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [savingFolder, setSavingFolder] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [confirmModal, setConfirmModal] = useState(EMPTY_CONFIRM);
  const fileRef = useRef();
  // Counts nested dragenter/dragleave events so the overlay doesn't flicker
  // when the cursor crosses child elements.
  const dragDepth = useRef(0);

  // The first load picks up the request Project Detail already started from
  // the URL id (api/prefetch.js); every later load sends its own.
  const load = () => {
    const url = `/knowledge/project/${projectId}`;
    return (takePrefetched(url) || api.get(url))
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  };

  // Fetch on mount and every time this tab becomes active (silent refetch)
  useEffect(() => {
    if (projectId && active) load();
  }, [projectId, active]);

  const createFolder = async () => {
    setSavingFolder(true);
    try {
      await api.post("/knowledge/folders", {
        project_id: projectId,
        name: folderName,
      });
      setShowFolderModal(false);
      setFolderName("");
      load();
    } finally {
      setSavingFolder(false);
    }
  };

  const askConfirm = (title, message, action) =>
    setConfirmModal({
      show: true,
      title,
      message,
      isDangerous: true,
      action,
      loading: false,
    });

  const deleteFolder = (id) =>
    askConfirm("Delete folder", "Delete this folder and all its contents?", async () => {
      await api.delete(`/knowledge/folders/${id}`);
      if (selectedFolder === id) setSelectedFolder(null);
      load();
    });

  const deleteFile = (id) =>
    askConfirm("Delete file", "Delete this file? This can't be undone.", async () => {
      await api.delete(`/knowledge/files/${id}`);
      load();
    });

  const deleteNote = (id) =>
    askConfirm("Delete note", "Delete this note? This can't be undone.", async () => {
      await api.delete(`/knowledge/notes/${id}`);
      load();
    });

  // Shared by the file picker and drag-and-drop. Uploads sequentially.
  const uploadFiles = async (fileList) => {
    const all = Array.from(fileList || []);
    if (all.length === 0) return;

    const valid = all.filter(isAccepted);
    const rejected = all.filter((f) => !isAccepted(f));
    if (rejected.length > 0) {
      alert(
        `Unsupported file type: ${rejected.map((f) => f.name).join(", ")}\n` +
          `Allowed: ${ACCEPTED_EXTS.join(", ")}`,
      );
    }
    if (valid.length === 0) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setUploading(true);
    const errors = [];
    for (const file of valid) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("project_id", projectId);
      if (selectedFolder) fd.append("folder_id", selectedFolder);
      try {
        await api.post("/knowledge/files/upload", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } catch (err) {
        errors.push(`${file.name}: ${err.response?.data?.error || err.message}`);
      }
    }
    if (errors.length > 0) alert("Upload failed:\n" + errors.join("\n"));
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    load();
  };

  const handleUpload = (e) => uploadFiles(e.target.files);

  /* ---------- drag & drop ---------- */

  const onDragEnter = (e) => {
    if (uploading || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragOver = (e) => {
    if (uploading || !hasFiles(e)) return;
    e.preventDefault(); // required so the drop event fires
    e.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (e) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDrop = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (uploading) return;
    uploadFiles(e.dataTransfer.files);
  };

  const openNewNote = () => {
    setEditingNote(null);
    setNoteForm({ title: "", content: "" });
    setShowNoteModal(true);
  };

  const openEditNote = (n) => {
    setEditingNote(n);
    setNoteForm({ title: n.title, content: n.content || "" });
    setShowNoteModal(true);
  };

  const saveNote = async () => {
    setSavingNote(true);
    try {
      if (editingNote)
        await api.put(`/knowledge/notes/${editingNote.id}`, noteForm);
      else
        await api.post("/knowledge/notes", {
          ...noteForm,
          project_id: projectId,
          folder_id: selectedFolder || null,
        });
      setShowNoteModal(false);
      setNoteForm({ title: "", content: "" });
      setEditingNote(null);
      load();
    } finally {
      setSavingNote(false);
    }
  };

  const executeConfirmAction = async () => {
    if (!confirmModal.action) return;
    setConfirmModal((prev) => ({ ...prev, loading: true }));
    try {
      await confirmModal.action();
    } finally {
      setConfirmModal(EMPTY_CONFIRM);
    }
  };

  const filteredFiles = data.files.filter((f) =>
    selectedFolder ? f.folder_id === selectedFolder : !f.folder_id,
  );
  const filteredNotes = data.notes.filter((n) =>
    selectedFolder ? n.folder_id === selectedFolder : !n.folder_id,
  );

  const countIn = (folderId) =>
    data.files.filter((f) => (folderId ? f.folder_id === folderId : !f.folder_id)).length +
    data.notes.filter((n) => (folderId ? n.folder_id === folderId : !n.folder_id)).length;

  const currentFolderName = selectedFolder
    ? data.folders.find((f) => f.id === selectedFolder)?.name || "Folder"
    : "General";

  if (loading) {
    return (
      <div
        className="grid gap-5 p-4 sm:px-8 sm:py-6 lg:grid-cols-[240px_1fr]"
        aria-busy="true"
        aria-label="Loading knowledge"
      >
        <div className={`h-56 ${SKEL}`} />
        <div className="space-y-3">
          <div className={`h-8 w-56 ${SKEL}`} />
          <div className={`h-16 ${SKEL}`} />
          <div className={`h-16 ${SKEL}`} />
          <div className={`h-16 ${SKEL}`} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-5 p-4 sm:px-8 sm:py-6 lg:grid-cols-[240px_1fr]">
      {/* ---------- Folder sidebar ---------- */}
      <aside className="rounded-xl border border-[var(--border)] bg-[var(--bg-2,var(--bg))] p-2 lg:sticky lg:top-4">
        <div className="flex items-center justify-between px-2 pb-1 pt-1.5">
          <h2 className="m-0 text-xs font-semibold text-[var(--text-3)]">
            Folders
          </h2>
          {isManager && (
            <button
              type="button"
              aria-label="New folder"
              title="New folder"
              onClick={() => setShowFolderModal(true)}
              className={`grid h-7 w-7 place-items-center rounded-md text-[var(--accent)] transition-colors hover:bg-[var(--accent-glow)] ${FOCUS}`}
            >
              <PlusIcon />
            </button>
          )}
        </div>

        <nav className="flex flex-col gap-0.5">
          {[{ id: null, name: "General" }, ...data.folders].map((f) => {
            const selected = (selectedFolder ?? null) === f.id;
            return (
              <div key={f.id ?? "root"} className="group relative">
                <button
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => setSelectedFolder(f.id)}
                  className={
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors " +
                    FOCUS +
                    " " +
                    (selected
                      ? "bg-[var(--accent-glow)] font-semibold text-[var(--accent)]"
                      : "text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-[var(--text)]")
                  }
                >
                  <FolderIcon />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="text-[11px] tabular-nums text-[var(--text-3)]">
                    {countIn(f.id)}
                  </span>
                </button>
                {isManager && f.id !== null && (
                  <button
                    type="button"
                    aria-label={`Delete folder ${f.name}`}
                    onClick={() => deleteFolder(f.id)}
                    className={
                      "absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md " +
                      "bg-[var(--bg)] text-[var(--text-3)] hover:text-[var(--danger)] " +
                      "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 " +
                      "focus-visible:opacity-100 " +
                      FOCUS
                    }
                  >
                    <CloseIcon />
                  </button>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ---------- Content ---------- */}
      <section className="min-w-0">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="m-0 truncate text-lg font-semibold text-[var(--text)]">
              {currentFolderName}
            </h2>
            <p className="m-0 mt-0.5 text-xs text-[var(--text-3)]">
              {filteredFiles.length} file{filteredFiles.length !== 1 ? "s" : ""} ·{" "}
              {filteredNotes.length} note{filteredNotes.length !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleUpload}
              accept={ACCEPT_ATTR}
            />
            {isManager && (
              <button type="button" className={`${BTN_SECONDARY} ${FOCUS}`} onClick={openNewNote}>
                <NoteIcon /> New note
              </button>
            )}
            <button
              type="button"
              className={`${BTN_PRIMARY} ${FOCUS}`}
              onClick={() => fileRef.current.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader label="Uploading..." size="sm" variant="button" />
              ) : (
                <>
                  <UploadIcon /> Upload file
                </>
              )}
            </button>
          </div>
        </div>

        {/* Notes */}
        {filteredNotes.length > 0 && (
          <div className="mb-7">
            <h3 className="m-0 mb-3 text-sm font-semibold text-[var(--text)]">
              Notes
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredNotes.map((n) => (
                <article
                  key={n.id}
                  className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-2,var(--bg))] p-4 transition-colors hover:border-[var(--accent)]"
                >
                  <h4 className="m-0 truncate text-sm font-semibold text-[var(--text)]">
                    {n.title}
                  </h4>
                  {n.content ? (
                    <p className="mb-0 mt-1.5 line-clamp-4 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-2)]">
                      {n.content}
                    </p>
                  ) : (
                    <p className="mb-0 mt-1.5 text-[13px] italic text-[var(--text-3)]">
                      No content
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                    <span className="min-w-0 truncate text-[11px] text-[var(--text-3)]">
                      {n.created_by_name} · {formatDate(n.created_at)}
                    </span>
                    {isManager && (
                      <div className="flex shrink-0 gap-0.5">
                        <button
                          type="button"
                          className={`${LINK_BTN} text-[var(--text-2)] ${FOCUS}`}
                          onClick={() => openEditNote(n)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={`${LINK_BTN} text-[var(--danger)] ${FOCUS}`}
                          onClick={() => deleteNote(n.id)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {/* Files (drop zone) */}
        <div
          className="relative min-h-40"
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <h3 className="m-0 mb-3 text-sm font-semibold text-[var(--text)]">
            Files
          </h3>
          {filteredFiles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-12 text-center">
              <h4 className="m-0 text-sm font-semibold text-[var(--text)]">
                No files in {currentFolderName}
              </h4>
              <p className="mx-auto mb-4 mt-1 max-w-xs text-[13px] text-[var(--text-3)]">
                Drag and drop files here, or upload PDFs, documents, images, or archives to share them with the team.
              </p>
              <button
                type="button"
                className={`${BTN_PRIMARY} ${FOCUS}`}
                onClick={() => fileRef.current.click()}
                disabled={uploading}
              >
                <UploadIcon /> Upload file
              </button>
            </div>
          ) : (
            <ul className="m-0 list-none divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-2,var(--bg))] p-0">
              {filteredFiles.map((f) => {
                const meta = [formatSize(f.file_size), f.uploaded_by_name, formatDate(f.created_at)]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li
                    key={f.id}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-3)]"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--accent-glow)] text-[11px] font-bold uppercase text-[var(--accent)]">
                      {fileExt(f)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={safeFileUrl(f.file_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`block truncate text-sm font-medium text-[var(--text)] no-underline hover:text-[var(--accent)] ${FOCUS}`}
                      >
                        {f.name}
                      </a>
                      <div className="mt-0.5 truncate text-xs text-[var(--text-3)]">
                        {meta}
                      </div>
                    </div>
                    {isManager && (
                      <button
                        type="button"
                        className={`${LINK_BTN} shrink-0 text-[var(--danger)] ${FOCUS}`}
                        onClick={() => deleteFile(f.id)}
                      >
                        Delete
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Drag overlay — pointer-events-none so it never triggers dragleave */}
          {dragging && (
            <div
              className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent-glow)]"
              aria-hidden="true"
            >
              <div className="flex flex-col items-center gap-2 text-[var(--accent)]">
                <UploadIcon />
                <span className="text-sm font-semibold">
                  Drop to upload to {currentFolderName}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---------- Modals ---------- */}
      {showFolderModal && (
        <Modal title="New folder" onClose={() => setShowFolderModal(false)}>
          <div className="form-group">
            <label className="form-label">Folder name</label>
            <input
              className="form-input"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="e.g. Design assets, API docs"
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowFolderModal(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={createFolder}
              disabled={savingFolder}
            >
              {savingFolder ? "Creating..." : "Create folder"}
            </button>
          </div>
        </Modal>
      )}

      {showNoteModal && (
        <Modal
          title={editingNote ? "Edit note" : "New note"}
          onClose={() => setShowNoteModal(false)}
        >
          <div className="form-group">
            <label className="form-label">Title</label>
            <input
              className="form-input"
              value={noteForm.title}
              onChange={(e) => setNoteForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Note title"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Content</label>
            <textarea
              className="form-textarea"
              rows={8}
              value={noteForm.content}
              onChange={(e) => setNoteForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Write your note here..."
            />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowNoteModal(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={saveNote}
              disabled={savingNote}
            >
              {savingNote ? (
                <Loader label="Saving..." size="sm" variant="button" />
              ) : (
                "Save note"
              )}
            </button>
          </div>
        </Modal>
      )}

      <ConfirmModal
        isOpen={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.isDangerous ? "Delete" : "Confirm"}
        isDangerous={confirmModal.isDangerous}
        onConfirm={executeConfirmAction}
        onCancel={() => setConfirmModal(EMPTY_CONFIRM)}
        loading={confirmModal.loading}
      />
    </div>
  );
}