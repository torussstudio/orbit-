// import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
// import { Link, useNavigate, useParams } from 'react-router-dom';
// import api from '../api/client';
// import { useAuth } from '../context/AuthContext';
// import { useLiveRefetch, MESSAGE_EVENTS } from '../hooks/useLiveEvents';
// import { ChatAttachmentCard, ChatMediaPreview } from '../components/messages/ChatMediaPreview';

// /*
//  * Messages: members <-> admin team (shared inbox).
//  *
//  * Manager: inbox of every active member on the left, the open thread on the
//  *   right (/messages/:memberId). Phones show one pane at a time.
//  * Member: one thread with "the admin team". Any manager can reply; their
//  *   name is shown on their messages.
//  *
//  * Live updates arrive as "message.created" / "message.read" events that
//  * only carry the conversationId. The thread then fetches just the messages
//  * after the newest one it has (?after=), never the whole history again.
//  * Without live events the usual 30 s "poll" event does the same.
//  */

// /* -------------------------------------------------------------------------- */
// /* Constants & helpers                                                        */
// /* -------------------------------------------------------------------------- */

// const MAX_LEN = 4000; // same as the server and the DB check
// const IMAGE_LIMIT = 10 * 1024 * 1024;
// const PDF_LIMIT = 50 * 1024 * 1024;
// const DESIGN_FILE_LIMIT = 50 * 1024 * 1024;
// const MAX_ATTACHMENTS = 3;
// const DESIGN_MIMES = ['image/svg+xml', 'application/vnd.adobe.illustrator', 'image/vnd.adobe.illustrator', 'application/postscript', 'image/vnd.adobe.photoshop', 'application/vnd.adobe.photoshop'];
// const fileMime = (file) => {
//   const mime = String(file?.type || '').toLowerCase();
//   const ext = String(file?.name || '').split('.').pop().toLowerCase();
//   if (['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'application/pdf', ...DESIGN_MIMES].includes(mime)) return mime;
//   return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', svg: 'image/svg+xml', ai: 'application/vnd.adobe.illustrator', psd: 'image/vnd.adobe.photoshop' })[ext] || mime;
// };
// const hasDraggedFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');
// const WARN_LEN = 3600; // counter appears from here
// const READ_PING_MS = 45000; // "still reading" while a thread is open
// const NEAR_BOTTOM_PX = 120;
// const LOAD_OLDER_PX = 80;
// const GROUP_GAP_MS = 5 * 60 * 1000; // same sender within this = one group
// const COMPOSER_MAX_PX = 160;

// const FOCUS_RING =
//   'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg-2)]';

// const TIME_FMT = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
// const DAY_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
// const SHORT_DAY_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

// const sameId = (a, b) => a != null && b != null && String(a) === String(b);
// const apiError = (err, fallback) => err?.response?.data?.error || fallback;

// const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
// const daysAgo = (d) => Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);

// function dayLabel(date) {
//   const diff = daysAgo(date);
//   if (diff === 0) return 'Today';
//   if (diff === 1) return 'Yesterday';
//   return DAY_FMT.format(date);
// }

// // Inbox row time: "4:12 pm" today, "Yesterday", else "12 Oct".
// function listTime(value) {
//   const d = new Date(value);
//   if (Number.isNaN(d.getTime())) return '';
//   const diff = daysAgo(d);
//   if (diff === 0) return TIME_FMT.format(d);
//   if (diff === 1) return 'Yesterday';
//   return SHORT_DAY_FMT.format(d);
// }

// const isNearBottom = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;

// // Adds messages that are not on screen yet, keeping order by time.
// function mergeMessages(prev, incoming) {
//   if (!incoming?.length) return prev;
//   const ids = new Set(prev.map((m) => String(m.id)));
//   const fresh = incoming.filter((m) => !ids.has(String(m.id)));
//   if (!fresh.length) return prev;
//   return [...prev, ...fresh].sort(
//     (a, b) => new Date(a.created_at) - new Date(b.created_at) || String(a.id).localeCompare(String(b.id)),
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Icons (one stroke weight)                                                  */
// /* -------------------------------------------------------------------------- */

// const ICON_PATHS = {
//   chat: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
//   send: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></>,
//   back: <path d="M15 18l-6-6 6-6" />,
//   search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></>,
//   down: <path d="M6 9l6 6 6-6" />,
//   alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.1" /></>,
//   team: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></>,
//   lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
//   clip: <path d="M21 11l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9" />,
//   close: <path d="M6 6l12 12M18 6L6 18" />,
//   reply: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 016 6v3" /></>,
//   forward: <><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 00-6 6v3" /></>,
//   trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 12a1 1 0 001 1h8a1 1 0 001-1l1-12" /><path d="M9 7V4h6v3" /></>,
//   file: <><path d="M14 3H7a1 1 0 00-1 1v16a1 1 0 001 1h10a1 1 0 001-1V7l-4-4z" /><path d="M14 3v4h4" /></>,
// };

// function Icon({ name, className = 'h-4 w-4' }) {
//   return (
//     <svg className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
//       {ICON_PATHS[name]}
//     </svg>
//   );
// }

// function Avatar({ name, url, size = 'md' }) {
//   const box = size === 'sm' ? 'h-7 w-7 text-[11px]' : 'h-10 w-10 text-sm';
//   return (
//     <span className={`${box} grid shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--accent-light)] font-semibold text-[color:var(--accent)]`}>
//       {url ? (
//         <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
//       ) : (
//         <span aria-hidden="true">{(name || '?').trim()[0]?.toUpperCase() || '?'}</span>
//       )}
//     </span>
//   );
// }

// // Plain text with http(s) links made clickable. No HTML is ever rendered.
// const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;

// function Linkified({ text }) {
//   return text.split(URL_RE).map((part, i) =>
//     i % 2 === 1 ? (
//       <a
//         key={i}
//         href={part}
//         target="_blank"
//         rel="noopener noreferrer"
//         className="underline decoration-[0.08em] underline-offset-2 [overflow-wrap:anywhere]"
//       >
//         {part}
//       </a>
//     ) : (
//       <Fragment key={i}>{part}</Fragment>
//     ),
//   );
// }

// function Notice({ icon = 'alert', title, children, action }) {
//   return (
//     <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
//       <span className="mb-1 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-light)] text-[color:var(--accent)] shadow-[0_14px_30px_-16px_var(--accent)]">
//         <Icon name={icon} className="h-6 w-6" />
//       </span>
//       <h2 className="text-base font-semibold tracking-tight text-[color:var(--text)]">{title}</h2>
//       {children && (
//         <p className="max-w-[40ch] text-[13px] leading-relaxed text-[color:var(--text-3)] [text-wrap:pretty]">{children}</p>
//       )}
//       {action && <div className="mt-2">{action}</div>}
//     </div>
//   );
// }

// const BTN_NEUTRAL =
//   `inline-flex items-center justify-center gap-1.5 rounded-xl border border-[color:var(--border)] bg-[var(--bg-3)] px-3.5 py-2 text-xs font-semibold text-[color:var(--text-2)] transition duration-200 hover:-translate-y-px hover:text-[color:var(--text)] active:translate-y-0 active:scale-[0.98] ${FOCUS_RING}`;

// const MessageAction = ({ icon, title, text, danger, onClick }) => (
//   <button
//     type="button"
//     title={title}
//     aria-label={title}
//     onClick={onClick}
//     className={`inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition duration-200 hover:bg-black/10 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${danger ? 'md:hover:text-red-500' : ''}`}
//   >
//     <Icon name={icon} className="h-3.5 w-3.5" />{text}
//   </button>
// );

// function ThreadSkeleton() {
//   const rows = [
//     ['w-2/5', false], ['w-1/3', false], ['w-1/2', true], ['w-1/4', true], ['w-3/5', false],
//   ];
//   return (
//     <div className="flex flex-1 flex-col justify-end gap-3 px-4 py-6 sm:px-6" aria-hidden="true">
//       {rows.map(([w, right], i) => (
//         <div key={i} className={`flex ${right ? 'justify-end' : ''}`}>
//           <div className={`h-10 ${w} animate-pulse rounded-2xl bg-[var(--bg-3)] motion-reduce:animate-none`} />
//         </div>
//       ))}
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Thread                                                                     */
// /* -------------------------------------------------------------------------- */

// /*
//  * One conversation.
//  * conversationId  the thread to show
//  * memberId        the member the conversation belongs to (decides sides)
//  * header          { title, subtitle, avatarName, avatarUrl }
//  * onBack          phone "back to inbox" (managers)
//  * onActivity      something was sent or read (manager inbox refreshes)
//  */
// function Thread({ conversationId, memberId, header, onBack, onActivity, forwardTargets = [] }) {
//   const { user, isManager } = useAuth();

//   const [messages, setMessages] = useState([]);
//   const [pending, setPending] = useState([]); // { tempId, body, status, error, created_at }
//   const [hasMore, setHasMore] = useState(false);
//   const [otherReadAt, setOtherReadAt] = useState(null);
//   const [readOnly, setReadOnly] = useState(false);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState('');
//   const [loadingOlder, setLoadingOlder] = useState(false);
//   const [showJump, setShowJump] = useState(false);
//   const [draft, setDraft] = useState('');
//   const [files, setFiles] = useState([]);
//   const [uploading, setUploading] = useState(false);
//   const [dragging, setDragging] = useState(false);
//   const [replyTo, setReplyTo] = useState(null);
//   const [forwarding, setForwarding] = useState(null);
//   const [forwardTarget, setForwardTarget] = useState('');
//   const [previewAttachment, setPreviewAttachment] = useState(null);
//   const [profileOpen, setProfileOpen] = useState(false);

//   const scrollRef = useRef(null);
//   const textareaRef = useRef(null);
//   const fileInputRef = useRef(null);
//   const dragDepthRef = useRef(0);
//   const stickRef = useRef(true); // keep the view pinned to the newest message
//   const restoreRef = useRef(null); // scroll position to keep after loading older
//   const cidRef = useRef(conversationId);
//   const messagesRef = useRef(messages);
//   const lastSeenIdRef = useRef(null);
//   cidRef.current = conversationId;
//   messagesRef.current = messages;

//   // The other side of the conversation is "theirs". For a manager that is the
//   // member; for a member that is the whole admin team.
//   const isTeamMessage = useCallback((m) => !sameId(m.sender_id, memberId), [memberId]);
//   const isOwnSide = useCallback(
//     (m) => (isManager ? isTeamMessage(m) : !isTeamMessage(m)),
//     [isManager, isTeamMessage],
//   );

//   const markRead = useCallback(() => {
//     if (document.hidden) return;
//     const cid = cidRef.current;
//     api
//       .post(`/messages/conversations/${cid}/read`, null, { silent: true })
//       .then(({ data }) => {
//         if (data?.changed) onActivity?.();
//       })
//       .catch(() => {});
//   }, [onActivity]);

//   // Newest page. Shows the skeleton only on the first load of a thread.
//   const loadLatest = useCallback(async ({ silent = false } = {}) => {
//     const cid = conversationId;
//     if (!silent) {
//       setLoading(true);
//       setError('');
//     }
//     try {
//       const { data } = await api.get(`/messages/conversations/${cid}/messages`, { params: { limit: 100 } });
//       if (cidRef.current !== cid) return;
//       stickRef.current = true;
//       setMessages(data.messages || []);
//       setHasMore(Boolean(data.has_more));
//       setOtherReadAt(data.other_read_at || null);
//       setReadOnly(data.conversation?.member_active === false);
//       setError('');
//       markRead();
//     } catch (err) {
//       if (cidRef.current !== cid) return;
//       if (!silent) setError(apiError(err, "We couldn't load this conversation."));
//     } finally {
//       if (cidRef.current === cid && !silent) setLoading(false);
//     }
//   }, [conversationId, markRead]);

//   // Only what is newer than the newest message on screen.
//   const fetchNew = useCallback(async () => {
//     await loadLatest({ silent: true });
//   }, [loadLatest]);

//   // New thread: start clean.
//   useEffect(() => {
//     setMessages([]);
//     setPending([]);
//     setHasMore(false);
//     setOtherReadAt(null);
//     setReadOnly(false);
//     setShowJump(false);
//     setDraft('');
//     setFiles([]);
//     lastSeenIdRef.current = null;
//     stickRef.current = true;
//     loadLatest();
//   }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

//   useLiveRefetch(MESSAGE_EVENTS, fetchNew, {
//     match: (event) => sameId(event.conversationId, cidRef.current),
//     delay: 150,
//   });

//   // While the thread is open and the tab is visible: keep it marked as read,
//   // so the server does not push to this person. Also on coming back to the tab.
//   useEffect(() => {
//     const timer = setInterval(markRead, READ_PING_MS);
//     const onVisible = () => {
//       if (!document.hidden) markRead();
//     };
//     document.addEventListener('visibilitychange', onVisible);
//     return () => {
//       clearInterval(timer);
//       document.removeEventListener('visibilitychange', onVisible);
//     };
//   }, [markRead]);

//   // Escape closes the profile dialog.
//   useEffect(() => {
//     if (!profileOpen) return undefined;
//     const onKey = (event) => { if (event.key === 'Escape') setProfileOpen(false); };
//     window.addEventListener('keydown', onKey);
//     return () => window.removeEventListener('keydown', onKey);
//   }, [profileOpen]);

//   // A new message from the other side: mark read, or offer "New messages".
//   useEffect(() => {
//     const last = messages[messages.length - 1];
//     if (!last) return;
//     const previous = lastSeenIdRef.current;
//     lastSeenIdRef.current = String(last.id);
//     if (previous === null || previous === String(last.id)) return;
//     if (isOwnSide(last)) return;

//     markRead();
//     if (!stickRef.current) setShowJump(true);
//   }, [messages, isOwnSide, markRead]);

//   // Scroll: keep position after loading older, else stay pinned to the bottom.
//   useLayoutEffect(() => {
//     const el = scrollRef.current;
//     if (!el) return;
//     if (restoreRef.current) {
//       const { height, top } = restoreRef.current;
//       el.scrollTop = el.scrollHeight - height + top;
//       restoreRef.current = null;
//       return;
//     }
//     if (stickRef.current) el.scrollTop = el.scrollHeight;
//   }, [messages, pending, loading]);

//   const loadOlder = useCallback(async () => {
//     if (loadingOlder || !hasMore || !messagesRef.current.length) return;
//     const cid = conversationId;
//     setLoadingOlder(true);
//     try {
//       const { data } = await api.get(`/messages/conversations/${cid}/messages`, {
//         params: { before: messagesRef.current[0].id },
//       });
//       if (cidRef.current !== cid) return;
//       const el = scrollRef.current;
//       if (el) restoreRef.current = { height: el.scrollHeight, top: el.scrollTop };
//       setMessages((prev) => mergeMessages(prev, data.messages || []));
//       setHasMore(Boolean(data.has_more));
//     } catch {
//       /* the button stays, the person can try again */
//     } finally {
//       setLoadingOlder(false);
//     }
//   }, [conversationId, hasMore, loadingOlder]);

//   const onScroll = (e) => {
//     const el = e.currentTarget;
//     stickRef.current = isNearBottom(el);
//     if (stickRef.current) setShowJump(false);
//     if (el.scrollTop < LOAD_OLDER_PX) loadOlder();
//   };

//   const jumpToBottom = () => {
//     const el = scrollRef.current;
//     if (!el) return;
//     stickRef.current = true;
//     setShowJump(false);
//     el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
//   };

//   /* ---------- sending ---------- */

//   const addFiles = useCallback((incoming) => {
//     const next = [...files];
//     let validationError = '';
//     for (const file of Array.from(incoming || [])) {
//       if (next.length >= MAX_ATTACHMENTS) { validationError = 'A message can include up to 3 attachments.'; break; }
//       const mime = fileMime(file);
//       const image = ['image/jpeg', 'image/png', 'image/webp'].includes(mime);
//       const designFile = DESIGN_MIMES.includes(mime);
//       if (!image && !designFile && mime !== 'image/svg+xml' && mime !== 'application/pdf') { validationError = 'Attach JPG, PNG, WebP, SVG, AI, PSD, or PDF files.'; continue; }
//       const limit = image ? IMAGE_LIMIT : mime === 'application/pdf' ? PDF_LIMIT : DESIGN_FILE_LIMIT;
//       if (file.size > limit) { validationError = `${image ? 'Images' : mime === 'application/pdf' ? 'PDF files' : 'SVG, AI, and PSD files'} must be ${limit / (1024 * 1024)} MB or smaller.`; continue; }
//       if (!next.some((item) => item.name === file.name && item.size === file.size)) next.push(file);
//     }
//     setFiles(next);
//     setError(validationError);
//   }, [files]);

//   const uploadFile = useCallback(async (file) => {
//     const { data: signed } = await api.post('/messages/uploads/signature', { mime_type: fileMime(file), size: file.size });
//     const form = new FormData();
//     for (const key of ['api_key', 'timestamp', 'signature', 'public_id', 'upload_preset']) if (signed[key] != null) form.append(key, String(signed[key]));
//     form.append('file', file);
//     const response = await fetch(signed.upload_url, { method: 'POST', body: form });
//     const result = await response.json();
//     if (!response.ok) throw new Error(result?.error?.message || 'Cloudinary upload failed.');
//     return { public_id: result.public_id, secure_url: result.secure_url, resource_type: result.resource_type, format: result.format, bytes: result.bytes, original_filename: file.name };
//   }, []);

//   const send = useCallback(async (retry) => {
//     setError('');
//     const body = (retry ? retry.body : draft).trim();
//     const outgoingFiles = retry?.files || files;
//     if ((!body && !outgoingFiles.length) || readOnly || body.length > MAX_LEN || uploading) return;

//     const tempId = retry?.tempId || `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
//     if (retry) {
//       setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, status: 'sending', error: '' } : x)));
//     } else {
//       setPending((p) => [...p, { tempId, body, displayBody: body || outgoingFiles.map((file) => file.name).join(', '), files: outgoingFiles, status: 'sending', error: '', created_at: new Date().toISOString() }]);
//       setDraft('');
//     }
//     stickRef.current = true;
//     setShowJump(false);
//     textareaRef.current?.focus();

//     const cid = conversationId;
//     setUploading(true);
//     try {
//       const attachments = [];
//       for (const file of outgoingFiles) attachments.push(await uploadFile(file));
//       const { data } = await api.post(`/messages/conversations/${cid}/messages`, { body, attachments, reply_to_message_id: replyTo?.id || null }, { silent: true });
//       if (cidRef.current !== cid) return;
//       setPending((p) => p.filter((x) => x.tempId !== tempId));
//       if (data?.message) setMessages((prev) => mergeMessages(prev, [data.message]));
//       setReplyTo(null);
//       setFiles([]);
//       onActivity?.();
//     } catch (err) {
//       if (cidRef.current !== cid) return;
//       setPending((p) =>
//         p.map((x) =>
//           x.tempId === tempId ? { ...x, status: 'failed', error: apiError(err, 'Not sent.') } : x,
//         ),
//       );
//     } finally {
//       setUploading(false);
//     }
//   }, [conversationId, draft, files, onActivity, readOnly, replyTo, uploadFile, uploading]);

//   const deleteMessage = useCallback(async (message, mode) => {
//     if (!window.confirm(mode === 'for-everyone' ? 'Delete this message for everyone?' : 'Delete this message for you?')) return;
//     try {
//       await api.delete(`/messages/conversations/${conversationId}/messages/${message.id}`, { data: { mode } });
//       if (mode === 'for-me') setMessages((old) => old.filter((item) => !sameId(item.id, message.id)));
//       else setMessages((old) => old.map((item) => sameId(item.id, message.id) ? { ...item, body: 'This message was deleted', deleted: true } : item));
//     } catch (err) { setError(apiError(err, 'Could not delete this message.')); }
//   }, [conversationId]);

//   const forwardMessage = useCallback(async () => {
//     if (!forwarding || !forwardTarget) return;
//     try {
//       await api.post(`/messages/conversations/${conversationId}/messages/${forwarding.id}/forward`, { target_conversation_id: forwardTarget });
//       setForwarding(null);
//       setForwardTarget('');
//     } catch (err) { setError(apiError(err, 'Could not forward this message.')); }
//   }, [conversationId, forwarding, forwardTarget]);

//   const discard = (tempId) => setPending((p) => p.filter((x) => x.tempId !== tempId));

//   // Composer grows with its text, up to a limit.
//   useLayoutEffect(() => {
//     const ta = textareaRef.current;
//     if (!ta) return;
//     ta.style.height = 'auto';
//     ta.style.height = `${Math.min(ta.scrollHeight, COMPOSER_MAX_PX)}px`;
//   }, [draft]);

//   const onComposerKey = (e) => {
//     if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
//       e.preventDefault();
//       send();
//     }
//   };

//   const onDragEnter = (e) => {
//     if (!hasDraggedFiles(e)) return;
//     e.preventDefault();
//     dragDepthRef.current += 1;
//     setDragging(true);
//   };
//   const onDragOver = (e) => {
//     if (!hasDraggedFiles(e)) return;
//     e.preventDefault();
//     e.dataTransfer.dropEffect = 'copy';
//   };
//   const onDragLeave = (e) => {
//     if (!hasDraggedFiles(e)) return;
//     dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
//     if (!dragDepthRef.current) setDragging(false);
//   };
//   const onDrop = (e) => {
//     if (!hasDraggedFiles(e)) return;
//     e.preventDefault();
//     dragDepthRef.current = 0;
//     setDragging(false);
//     addFiles(e.dataTransfer.files);
//   };

//   /* ---------- rows ---------- */

//   const rows = useMemo(() => {
//     const all = [
//       ...messages.map((m) => ({ ...m, key: String(m.id) })),
//       ...pending.map((p) => ({
//         id: null,
//         key: p.tempId,
//         sender_id: user?.id,
//         sender_name: user?.name,
//         body: p.displayBody ?? p.body,
//         created_at: p.created_at,
//         pending: p,
//       })),
//     ];

//     const out = [];
//     let prevDay = null;
//     let prev = null;
//     for (const m of all) {
//       const date = new Date(m.created_at);
//       const day = date.toDateString();
//       if (day !== prevDay) {
//         out.push({ type: 'day', key: `day-${day}`, label: dayLabel(date) });
//         prevDay = day;
//         prev = null;
//       }
//       const grouped = Boolean(
//         prev && sameId(prev.sender_id, m.sender_id) && date - new Date(prev.created_at) < GROUP_GAP_MS,
//       );
//       const mine = sameId(m.sender_id, user?.id);
//       const team = isTeamMessage(m);
//       out.push({
//         type: 'msg',
//         key: m.key,
//         m,
//         right: isOwnSide(m),
//         mine,
//         grouped,
//         // Admin names: on the member's screen, and for the other managers'
//         // replies on a manager's screen.
//         name: !grouped && !mine && team ? m.sender_name || 'Admin' : null,
//       });
//       prev = m;
//     }
//     return out;
//   }, [messages, pending, user?.id, user?.name, isOwnSide, isTeamMessage]);

//   // "Seen" / "Sent" under the last message from this side.
//   const lastOwnKey = useMemo(() => {
//     for (let i = rows.length - 1; i >= 0; i -= 1) {
//       const r = rows[i];
//       if (r.type === 'msg' && r.right && !r.m.pending) return r.key;
//     }
//     return null;
//   }, [rows]);

//   const remaining = MAX_LEN - draft.length;

//   return (
//     <section
//       className="relative flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-[var(--bg-2)]"
//       aria-label={`Conversation: ${header.title}`}
//       onDragEnter={onDragEnter}
//       onDragOver={onDragOver}
//       onDragLeave={onDragLeave}
//       onDrop={onDrop}
//     >
//       {/* Header */}
//       <header className="flex min-w-0 shrink-0 items-center gap-2.5 border-b border-[color:var(--border)] bg-[var(--bg-2)] px-3 py-3 sm:px-5">
//         {onBack && (
//           <button
//             type="button"
//             onClick={onBack}
//             aria-label="Back to inbox"
//             className={`-ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[color:var(--text-2)] transition duration-200 hover:bg-[var(--bg-3)] hover:text-[color:var(--text)] active:scale-95 md:hidden ${FOCUS_RING}`}
//           >
//             <Icon name="back" className="h-5 w-5" />
//           </button>
//         )}
//         {header.team ? (
//           <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-light)] text-[color:var(--accent)]">
//             <Icon name="team" className="h-5 w-5" />
//           </span>
//         ) : (
//           <button type="button" onClick={() => setProfileOpen(true)} aria-label={`View ${header.title} profile`} className={`shrink-0 rounded-xl transition duration-200 hover:ring-2 hover:ring-[color:var(--accent)] ${FOCUS_RING}`}>
//             <Avatar name={header.avatarName} url={header.avatarUrl} />
//           </button>
//         )}
//         <button type="button" disabled={header.team} onClick={() => setProfileOpen(true)} className={`min-w-0 flex-1 rounded-lg text-left disabled:cursor-default ${FOCUS_RING}`}>
//           <h2 className="truncate text-sm font-semibold leading-tight tracking-tight text-[color:var(--text)]">{header.title}</h2>
//           {header.subtitle && <p className="mt-0.5 truncate text-[11px] text-[color:var(--text-3)]">{header.subtitle}</p>}
//         </button>
//         {header.action && <div className="ml-auto shrink-0">{header.action}</div>}
//       </header>

//       {/* Messages */}
//       <div className="relative min-h-0 flex-1">
//         <div
//           ref={scrollRef}
//           onScroll={onScroll}
//           className="h-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain bg-[var(--bg)] bg-[radial-gradient(45%_35%_at_100%_0%,var(--accent-light),transparent)] px-3 py-4 sm:px-5"
//           role="log"
//           aria-live="polite"
//           aria-relevant="additions"
//           aria-busy={loading}
//         >
//           {loading ? (
//             <ThreadSkeleton />
//           ) : error ? (
//             <Notice
//               title="We couldn't load this conversation"
//               action={<button type="button" onClick={() => loadLatest()} className={BTN_NEUTRAL}>Try again</button>}
//             >
//               {error}
//             </Notice>
//           ) : rows.length === 0 ? (
//             <Notice icon="chat" title={isManager ? `No messages with ${header.title} yet` : 'No messages yet'}>
//               {isManager
//                 ? 'Write the first message below. Every admin can see this conversation.'
//                 : 'Send a message to the admin team. Any admin can reply.'}
//             </Notice>
//           ) : (
//             <ol className="m-0 flex w-full min-w-0 list-none flex-col p-0">
//               {hasMore && (
//                 <li className="mb-3 flex justify-center">
//                   <button type="button" onClick={loadOlder} disabled={loadingOlder} className={`${BTN_NEUTRAL} disabled:opacity-60`}>
//                     {loadingOlder ? 'Loading…' : 'Load earlier messages'}
//                   </button>
//                 </li>
//               )}

//               {rows.map((row) =>
//                 row.type === 'day' ? (
//                   <li key={row.key} className="my-4 flex items-center gap-3 first:mt-0" aria-label={row.label}>
//                     <span className="h-px flex-1 bg-[var(--border)]" aria-hidden="true" />
//                     <span className="rounded-full bg-[var(--bg-3)] px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--text-3)]">{row.label}</span>
//                     <span className="h-px flex-1 bg-[var(--border)]" aria-hidden="true" />
//                   </li>
//                 ) : (
//                   <MessageRow
//                     key={row.key}
//                     row={row}
//                     status={
//                       row.key === lastOwnKey
//                         ? otherReadAt && new Date(otherReadAt) >= new Date(row.m.created_at)
//                           ? 'Seen'
//                           : 'Sent'
//                         : null
//                     }
//                     onRetry={send}
//                     onDiscard={discard}
//                     onReply={(message) => { setReplyTo(message); textareaRef.current?.focus(); }}
//                     onDelete={deleteMessage}
//                     onForward={(message) => { setForwarding(message); setForwardTarget(''); }}
//                     onOpenAttachment={setPreviewAttachment}
//                     canForward={Boolean(isManager)}
//                   />
//                 ),
//               )}
//             </ol>
//           )}
//         </div>

//         {showJump && (
//           <button
//             type="button"
//             onClick={jumpToBottom}
//             className={`absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_10px_24px_-10px_var(--accent)] transition duration-200 hover:brightness-110 active:scale-95 ${FOCUS_RING}`}
//           >
//             New messages
//             <Icon name="down" className="h-3.5 w-3.5" />
//           </button>
//         )}
//       </div>

//       {/* Composer */}
//       <div className="relative shrink-0 border-t border-[color:var(--border)] bg-[var(--bg-2)] px-3 pb-2.5 pt-3 sm:px-5">
//         {replyTo && (
//           <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border-l-2 border-[color:var(--accent)] bg-[var(--accent-light)] px-3 py-2 text-xs text-[color:var(--text-2)]">
//             <span className="truncate">Replying to {replyTo.sender_name || 'message'}: {replyTo.body}</span>
//             <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className={`grid h-6 w-6 shrink-0 place-items-center rounded-md transition duration-200 hover:bg-black/10 ${FOCUS_RING}`}><Icon name="close" className="h-3.5 w-3.5" /></button>
//           </div>
//         )}
//         {forwarding && (
//           <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--accent-light)] p-2.5">
//             <span className="text-xs font-medium text-[color:var(--text-2)]">Forward to member</span>
//             <select value={forwardTarget} onChange={(e) => setForwardTarget(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-[color:var(--border)] bg-[var(--bg-2)] px-2 py-1.5 text-xs text-[color:var(--text)] outline-none focus:border-[color:var(--accent)]">
//               <option value="">Choose a conversation</option>
//               {forwardTargets.filter((item) => !sameId(item.conversation_id, conversationId)).map((item) => <option key={item.member_id} value={item.conversation_id}>{item.name}</option>)}
//             </select>
//             <button type="button" disabled={!forwardTarget} onClick={forwardMessage} className={`rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition duration-200 hover:brightness-110 active:scale-95 disabled:opacity-50 ${FOCUS_RING}`}>Forward</button>
//             <button type="button" onClick={() => setForwarding(null)} className={`rounded-lg px-2 py-1.5 text-xs text-[color:var(--text-2)] transition duration-200 hover:bg-black/10 ${FOCUS_RING}`}>Cancel</button>
//           </div>
//         )}
//         {readOnly ? (
//           <p className="flex items-center gap-2 rounded-xl bg-[var(--bg-3)] px-3.5 py-2.5 text-xs text-[color:var(--text-3)]">
//             <Icon name="lock" className="h-3.5 w-3.5" />
//             This member is no longer active. The conversation is read-only.
//           </p>
//         ) : (
//           <form
//             onSubmit={(e) => {
//               e.preventDefault();
//               send();
//             }}
//             className="flex min-w-0 items-end gap-1 rounded-2xl border border-[color:var(--border)] bg-[var(--bg-3)] p-1.5 transition duration-200 focus-within:border-[color:var(--accent)] focus-within:ring-4 focus-within:ring-[color:var(--accent-light)]"
//           >
//             <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/svg+xml,application/pdf,.ai,.psd,.svg" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} className="hidden" />
//             {files.length > 0 && (
//               <div className="absolute inset-x-3 bottom-full mb-2 flex flex-wrap gap-1.5 rounded-xl border border-[color:var(--border)] bg-[var(--bg-2)] p-2 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.5)] sm:inset-x-5">
//                 {files.map((file, index) => (
//                   <span key={`${file.name}-${index}`} className="flex max-w-56 items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[var(--bg-3)] py-1 pl-2 pr-1 text-[11px] font-medium text-[color:var(--text-2)]">
//                     <Icon name="file" className="h-3.5 w-3.5" />
//                     <span className="truncate">{file.name}</span>
//                     <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((old) => old.filter((_, i) => i !== index))} className={`grid h-5 w-5 place-items-center rounded-md transition duration-200 hover:bg-black/10 ${FOCUS_RING}`}><Icon name="close" className="h-3 w-3" /></button>
//                   </span>
//                 ))}
//               </div>
//             )}
//             <button
//               type="button"
//               title="Attach image or PDF"
//               aria-label="Attach image or PDF"
//               onClick={() => fileInputRef.current?.click()}
//               disabled={files.length >= MAX_ATTACHMENTS || uploading}
//               className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[color:var(--text-2)] transition duration-200 hover:bg-[var(--bg-2)] hover:text-[color:var(--text)] active:scale-95 disabled:opacity-40 ${FOCUS_RING}`}
//             >
//               <Icon name="clip" className="h-[18px] w-[18px]" />
//             </button>
//             <label htmlFor={`composer-${conversationId}`} className="sr-only">
//               Message
//             </label>
//             <textarea
//               id={`composer-${conversationId}`}
//               ref={textareaRef}
//               rows={1}
//               value={draft}
//               maxLength={MAX_LEN}
//               disabled={loading || Boolean(error)}
//               onChange={(e) => setDraft(e.target.value)}
//               onKeyDown={onComposerKey}
//               placeholder={isManager ? `Message ${header.title}` : 'Message the admin team'}
//               className="min-h-9 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-[16px] leading-5 text-[color:var(--text)] outline-none placeholder:text-[color:var(--text-3)] disabled:opacity-60 sm:text-sm"
//             />
//             <button
//               type="submit"
//               disabled={(!draft.trim() && !files.length) || loading || Boolean(error) || uploading}
//               aria-label="Send message"
//               className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-white shadow-[0_8px_18px_-8px_var(--accent)] transition duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${FOCUS_RING}`}
//             >
//               {uploading ? <span className="animate-pulse text-xs">…</span> : <Icon name="send" className="h-[18px] w-[18px]" />}
//             </button>
//           </form>
//         )}
//         {!readOnly && (
//           <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-[11px] text-[color:var(--text-3)]">
//             <span className="truncate text-[10px]"><span className="sm:hidden">Images 10 MB · files 50 MB</span><span className="hidden sm:inline">Images 10 MB · PDFs, SVG, AI and PSD 50 MB · Enter to send · Shift + Enter for a new line</span></span>
//             {draft.length >= WARN_LEN && (
//               <span className={`ml-auto tabular-nums ${remaining <= 0 ? 'text-[color:var(--danger)]' : ''}`}>
//                 {remaining} characters left
//               </span>
//             )}
//           </div>
//         )}
//       </div>

//       {dragging && (
//         <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-[color:var(--accent)] bg-[var(--bg-2)]" aria-hidden="true">
//           <div className="flex items-center gap-2 rounded-xl bg-[var(--accent-light)] px-5 py-3 text-sm font-semibold text-[color:var(--accent)]"><Icon name="clip" className="h-4 w-4" />Drop images or PDFs to attach</div>
//         </div>
//       )}

//       <ChatMediaPreview file={previewAttachment} onClose={() => setPreviewAttachment(null)} />

//       {profileOpen && !header.team && (
//         <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
//           <section role="dialog" aria-modal="true" aria-label={`${header.title} profile`} className="w-full max-w-sm overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--bg-2)] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.6)]">
//             <div className="relative grid min-h-56 place-items-center bg-[var(--bg-3)] bg-[radial-gradient(70%_80%_at_50%_0%,var(--accent-light),transparent)] p-6">
//               <button type="button" aria-label="Close profile" onClick={() => setProfileOpen(false)} className={`absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl bg-black/35 text-white transition duration-200 hover:bg-black/50 active:scale-95 ${FOCUS_RING}`}><Icon name="close" className="h-4 w-4" /></button>
//               {header.avatarUrl
//                 ? <img src={header.avatarUrl} alt={`${header.title} profile`} className="h-40 w-40 rounded-[2rem] object-cover shadow-[0_24px_50px_-20px_rgba(0,0,0,0.55)]" />
//                 : <span className="grid h-40 w-40 place-items-center rounded-[2rem] bg-[var(--accent-light)] text-5xl font-semibold text-[color:var(--accent)]">{(header.avatarName || header.title || '?').slice(0, 1).toUpperCase()}</span>}
//             </div>
//             <div className="p-6">
//               <h2 className="text-xl font-semibold tracking-tight text-[color:var(--text)]">{header.title}</h2>
//               <p className="mt-1 text-sm text-[color:var(--text-3)]">Member · Orbit</p>
//               {header.subtitle && <p className="mt-4 rounded-xl bg-[var(--bg-3)] px-3.5 py-3 text-xs leading-relaxed text-[color:var(--text-2)]">{header.subtitle}</p>}
//               <button type="button" onClick={() => setProfileOpen(false)} className={`mt-5 w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_22px_-10px_var(--accent)] transition duration-200 hover:brightness-110 active:scale-[0.98] ${FOCUS_RING}`}>Back to chat</button>
//             </div>
//           </section>
//         </div>
//       )}
//     </section>
//   );
// }

// const MessageRow = memo(function MessageRow({ row, status, onRetry, onDiscard, onReply, onDelete, onForward, onOpenAttachment, canForward }) {
//   const { m, right, mine, grouped, name } = row;
//   const p = m.pending;
//   const [showActions, setShowActions] = useState(false);

//   const bubble = right
//     ? mine
//       ? 'rounded-br-md bg-[var(--accent)] text-white shadow-[0_10px_24px_-14px_var(--accent)]'
//       : // Another admin's reply on a manager's screen: team side, softer.
//         'rounded-br-md bg-[var(--accent-light)] text-[color:var(--text)]'
//     : 'rounded-bl-md border border-[color:var(--border)] bg-[var(--bg-2)] text-[color:var(--text)] shadow-[0_8px_20px_-16px_rgba(15,23,42,0.5)]';

//   return (
//     <li className={`group flex w-full min-w-0 flex-col ${right ? 'items-end' : 'items-start'} ${grouped ? 'mt-0.5' : 'mt-3 first:mt-0'}`}>
//       {name && <span className="mb-1 px-1 text-[11px] font-medium text-[color:var(--text-3)]">{name}</span>}
//       <div
//         onClick={() => { if (!p && !m.deleted) setShowActions((v) => !v); }}
//         className={`relative max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed [overflow-wrap:anywhere] sm:max-w-[min(72%,560px)] ${bubble} ${
//           p?.status === 'failed' ? 'opacity-70 ring-1 ring-[color:var(--danger)]' : ''
//         } ${p?.status === 'sending' ? 'opacity-70' : ''}`}
//       >
//         {m.forwarded_from_id && <p className="mb-1 flex items-center gap-1 text-[10px] font-medium italic opacity-75"><Icon name="forward" className="h-3 w-3" />Forwarded</p>}
//         {m.reply_to_message_id && (
//           <div className={`mb-1.5 rounded-lg border-l-2 bg-black/10 px-2.5 py-1.5 text-[11px] ${mine ? 'border-white/60' : 'border-[color:var(--accent)]'}`}>
//             <span className="font-semibold">{m.reply_sender_name || 'Reply'}</span>
//             <p className="truncate opacity-80">{m.reply_body || 'Message'}</p>
//           </div>
//         )}
//         {m.deleted ? <span className="italic opacity-70">This message was deleted</span> : <Linkified text={m.body || ''} />}
//         {!m.deleted && m.attachments?.map((file) => <ChatAttachmentCard key={file.public_id} file={file} onOpen={onOpenAttachment} />)}
//         {!p && !m.deleted && (
//           <div className={`${showActions ? 'mt-2 flex' : 'hidden'} items-center gap-0.5 whitespace-normal rounded-lg bg-black/10 p-0.5 md:absolute md:-top-4 ${right ? 'md:right-2' : 'md:left-2'} md:z-10 md:mt-0 md:flex md:border md:border-[color:var(--border)] md:bg-[var(--bg-2)] md:text-[color:var(--text-2)] md:opacity-0 md:shadow-[0_8px_20px_-12px_rgba(15,23,42,0.5)] md:transition-opacity md:duration-200 md:focus-within:opacity-100 md:group-hover:opacity-100`}>
//             <MessageAction icon="reply" title="Reply" onClick={() => onReply(m)} />
//             {canForward && <MessageAction icon="forward" title="Forward" onClick={() => onForward(m)} />}
//             <MessageAction icon="trash" title="Delete for me" text="For me" onClick={() => onDelete(m, 'for-me')} />
//             {mine && <MessageAction icon="trash" title="Delete for everyone" text="Everyone" danger onClick={() => onDelete(m, 'for-everyone')} />}
//           </div>
//         )}
//       </div>

//       <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[10px] tabular-nums text-[color:var(--text-3)]">
//         {p?.status === 'sending' && <span>Sending…</span>}
//         {p?.status === 'failed' && (
//           <span role="alert" className="flex items-center gap-2 text-[color:var(--danger)]">
//             {p.error || 'Not sent.'}
//             <button type="button" onClick={() => onRetry(p)} className={`rounded font-semibold underline-offset-2 hover:underline ${FOCUS_RING}`}>
//               Retry
//             </button>
//             <button type="button" onClick={() => onDiscard(p.tempId)} className={`rounded text-[color:var(--text-3)] underline-offset-2 hover:underline ${FOCUS_RING}`}>
//               Discard
//             </button>
//           </span>
//         )}
//         {!p && (
//           <time dateTime={m.created_at} title={new Date(m.created_at).toLocaleString('en-IN')}>
//             {TIME_FMT.format(new Date(m.created_at))}
//           </time>
//         )}
//         {!p && status && <span className={status === 'Seen' ? 'font-medium text-[color:var(--accent)]' : ''}>· {status}</span>}
//       </div>
//     </li>
//   );
// });

// /* -------------------------------------------------------------------------- */
// /* Manager: inbox                                                             */
// /* -------------------------------------------------------------------------- */

// function InboxRow({ row, active, meId, onOpen }) {
//   const last = row.last_message;
//   const bodyPreview = last ? (last.body || (last.attachments?.length ? 'Attachment' : '')) : '';
//   const preview = last
//     ? `${sameId(last.sender_id, meId) ? 'You: ' : !sameId(last.sender_id, row.member_id) ? 'Admin: ' : ''}${bodyPreview}`
//     : 'No messages yet';

//   return (
//     <li>
//       <button
//         type="button"
//         onClick={() => onOpen(row.member_id)}
//         aria-current={active ? 'true' : undefined}
//         className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition duration-200 active:scale-[0.99] ${FOCUS_RING} ${
//           active
//             ? 'bg-[var(--bg-3)] before:absolute before:bottom-3 before:left-0 before:top-3 before:w-[3px] before:rounded-full before:bg-[var(--accent)]'
//             : 'hover:bg-[var(--bg-3)]'
//         }`}
//       >
//         <Avatar name={row.name} url={row.avatar_url} />
//         <span className="min-w-0 flex-1">
//           <span className="flex items-baseline justify-between gap-2">
//             <span className={`truncate text-[13px] tracking-tight text-[color:var(--text)] ${row.unread ? 'font-semibold' : 'font-medium'}`}>
//               {row.name}
//             </span>
//             {last && (
//               <span className={`shrink-0 text-[11px] tabular-nums ${row.unread ? 'font-semibold text-[color:var(--accent)]' : 'text-[color:var(--text-3)]'}`}>
//                 {listTime(last.created_at)}
//               </span>
//             )}
//           </span>
//           <span className="mt-0.5 flex items-center justify-between gap-2">
//             <span className={`truncate text-xs ${row.unread ? 'text-[color:var(--text-2)]' : 'text-[color:var(--text-3)]'} ${last ? '' : 'italic'}`}>
//               {preview}
//             </span>
//             {row.unread > 0 && (
//               <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-md bg-[var(--accent)] px-1.5 text-[11px] font-semibold tabular-nums text-white">
//                 <span aria-hidden="true">{row.unread > 99 ? '99+' : row.unread}</span>
//                 <span className="sr-only">{row.unread} unread</span>
//               </span>
//             )}
//           </span>
//         </span>
//       </button>
//     </li>
//   );
// }

// function ManagerInbox() {
//   const { user } = useAuth();
//   const { memberId } = useParams();
//   const navigate = useNavigate();

//   const [rows, setRows] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState('');
//   const [query, setQuery] = useState('');
//   const [open, setOpen] = useState(null); // { conversationId, memberId }
//   const [openError, setOpenError] = useState('');
//   const conversationIds = useRef(new Map()); // memberId -> conversationId

//   const loadList = useCallback(async ({ silent = true } = {}) => {
//     if (!silent) {
//       setLoading(true);
//       setError('');
//     }
//     try {
//       const { data } = await api.get('/messages/conversations');
//       const list = data?.conversations || [];
//       list.forEach((r) => {
//         if (r.conversation_id) conversationIds.current.set(String(r.member_id), r.conversation_id);
//       });
//       setRows(list);
//       setError('');
//     } catch (err) {
//       if (!silent) setError(apiError(err, "We couldn't load your inbox."));
//     } finally {
//       if (!silent) setLoading(false);
//     }
//   }, []);

//   useEffect(() => {
//     loadList({ silent: false });
//   }, [loadList]);

//   useLiveRefetch(MESSAGE_EVENTS, loadList, { delay: 400 });

//   // The thread in the URL: use the known conversation, or create it for a
//   // member who has never been messaged.
//   useEffect(() => {
//     let cancelled = false;
//     setOpenError('');
//     if (!memberId) {
//       setOpen(null);
//       return undefined;
//     }

//     const known = conversationIds.current.get(String(memberId));
//     if (known) {
//       setOpen({ conversationId: known, memberId });
//       return undefined;
//     }

//     setOpen(null);
//     api
//       .post('/messages/conversations', { member_id: memberId }, { silent: true })
//       .then(({ data }) => {
//         if (cancelled || !data?.conversation) return;
//         conversationIds.current.set(String(memberId), data.conversation.id);
//         setOpen({ conversationId: data.conversation.id, memberId });
//       })
//       .catch((err) => {
//         if (!cancelled) setOpenError(apiError(err, "We couldn't open this conversation."));
//       });

//     return () => {
//       cancelled = true;
//     };
//   }, [memberId]);

//   const visible = useMemo(() => {
//     const q = query.trim().toLowerCase();
//     if (!q) return rows;
//     return rows.filter(
//       (r) => (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q),
//     );
//   }, [rows, query]);

//   const selected = rows.find((r) => sameId(r.member_id, memberId));
//   const totalUnread = rows.reduce((sum, r) => sum + (r.unread || 0), 0);
//   const openThread = useCallback((id) => navigate(`/messages/${id}`), [navigate]);
//   const back = useCallback(() => navigate('/messages'), [navigate]);

//   return (
//     <div className="flex h-full min-h-0 bg-[var(--bg)] md:p-5 lg:p-8">
//       <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 overflow-hidden bg-[var(--bg-2)] md:rounded-3xl md:border md:border-[color:var(--border)] md:shadow-[0_30px_70px_-35px_rgba(15,23,42,0.45)]">
//         {/* Inbox */}
//         <aside
//           className={`${memberId ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-[color:var(--border)] md:w-[330px] md:border-r lg:w-[360px]`}
//           aria-label="Inbox"
//         >
//           <div className="shrink-0 px-4 pb-3 pt-4">
//             <div className="flex items-baseline justify-between gap-2">
//               <h1 className="text-[17px] font-semibold tracking-tight text-[color:var(--text)]">Messages</h1>
//               {totalUnread > 0 && (
//                 <span className="rounded-md bg-[var(--accent-light)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[color:var(--accent)]">{totalUnread} unread</span>
//               )}
//             </div>
//             <p className="mt-0.5 text-xs text-[color:var(--text-3)]">Shared inbox. Every admin sees these.</p>
//             <label className="relative mt-3 block">
//               <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)]">
//                 <Icon name="search" className="h-4 w-4" />
//               </span>
//               <input
//                 type="search"
//                 value={query}
//                 onChange={(e) => setQuery(e.target.value)}
//                 placeholder="Search members"
//                 aria-label="Search members"
//                 className="h-10 w-full rounded-xl border border-[color:var(--border)] bg-[var(--bg-3)] pl-9 pr-3 text-[16px] text-[color:var(--text)] outline-none transition duration-200 placeholder:text-[color:var(--text-3)] focus:border-[color:var(--accent)] focus:ring-4 focus:ring-[color:var(--accent-light)] sm:text-sm"
//               />
//             </label>
//           </div>

//           <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
//             {loading ? (
//               <ul className="m-0 list-none space-y-1 p-0" aria-hidden="true">
//                 {[0, 1, 2, 3, 4].map((i) => (
//                   <li key={i} className="flex items-center gap-3 px-3 py-2.5">
//                     <span className="h-10 w-10 animate-pulse rounded-xl bg-[var(--bg-3)] motion-reduce:animate-none" />
//                     <span className="flex-1 space-y-2">
//                       <span className="block h-3 w-1/2 animate-pulse rounded bg-[var(--bg-3)] motion-reduce:animate-none" />
//                       <span className="block h-2.5 w-3/4 animate-pulse rounded bg-[var(--bg-3)] motion-reduce:animate-none" />
//                     </span>
//                   </li>
//                 ))}
//               </ul>
//             ) : error ? (
//               <Notice
//                 title="We couldn't load your inbox"
//                 action={<button type="button" onClick={() => loadList({ silent: false })} className={BTN_NEUTRAL}>Try again</button>}
//               >
//                 {error}
//               </Notice>
//             ) : rows.length === 0 ? (
//               <Notice icon="team" title="No members yet">Active members will show up here.</Notice>
//             ) : visible.length === 0 ? (
//               <p className="px-3 py-8 text-center text-xs text-[color:var(--text-3)]">No members match “{query}”.</p>
//             ) : (
//               <ul className="m-0 list-none space-y-0.5 p-0">
//                 {visible.map((row) => (
//                   <InboxRow
//                     key={row.member_id}
//                     row={row}
//                     active={sameId(row.member_id, memberId)}
//                     meId={user?.id}
//                     onOpen={openThread}
//                   />
//                 ))}
//               </ul>
//             )}
//           </div>
//         </aside>

//         {/* Thread */}
//         <div className={`${memberId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col bg-[var(--bg)]`}>
//           {!memberId ? (
//             <Notice icon="chat" title="Choose a member">
//               Pick someone from the inbox to read and reply. Members can only message the admin team.
//             </Notice>
//           ) : openError ? (
//             <Notice
//               title="We couldn't open this conversation"
//               action={<button type="button" onClick={back} className={BTN_NEUTRAL}>Back to inbox</button>}
//             >
//               {openError}
//             </Notice>
//           ) : !open ? (
//             <ThreadSkeleton />
//           ) : (
//             <Thread
//               conversationId={open.conversationId}
//               memberId={open.memberId}
//               header={{
//                 title: selected?.name || 'Member',
//                 subtitle: selected?.email || '',
//                 avatarName: selected?.name,
//                 avatarUrl: selected?.avatar_url,
//               }}
//               onBack={back}
//               onActivity={loadList}
//               forwardTargets={rows.filter((row) => row.conversation_id)}
//             />
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Member: one thread with the admin team                                     */
// /* -------------------------------------------------------------------------- */

// function MemberThread() {
//   const { user } = useAuth();
//   const [conversation, setConversation] = useState(null);
//   const [error, setError] = useState('');

//   const load = useCallback(async () => {
//     setError('');
//     try {
//       const { data } = await api.get('/messages/conversations/me');
//       setConversation(data?.conversation || null);
//     } catch (err) {
//       setError(apiError(err, "We couldn't open your messages."));
//     }
//   }, []);

//   useEffect(() => {
//     load();
//   }, [load]);

//   return (
//     <div className="flex h-full min-h-0 min-w-0 w-full bg-[var(--bg)] md:p-5 lg:p-8">
//       <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-[920px] flex-1 overflow-hidden bg-[var(--bg-2)] md:rounded-3xl md:border md:border-[color:var(--border)] md:shadow-[0_30px_70px_-35px_rgba(15,23,42,0.45)]">
//         {error ? (
//           <Notice title="We couldn't open your messages" action={<button type="button" onClick={load} className={BTN_NEUTRAL}>Try again</button>}>
//             {error}
//           </Notice>
//         ) : !conversation ? (
//           <div className="flex flex-1 flex-col"><ThreadSkeleton /></div>
//         ) : (
//           <Thread
//             conversationId={conversation.id}
//             memberId={user?.id}
//             header={{
//               title: 'Admin team',
//               subtitle: 'Your messages go to every admin. Any of them can reply.',
//               team: true,
//               action: <Link to="/messages/people" className={`inline-flex items-center rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold text-[color:var(--text-2)] transition duration-200 hover:bg-[var(--bg-3)] hover:text-[color:var(--text)] active:scale-[0.98] ${FOCUS_RING}`}>Member chats</Link>,
//             }}
//             forwardTargets={[]}
//           />
//         )}
//       </div>
//     </div>
//   );
// }

// export default function Messages() {
//   const { isManager } = useAuth();
//   return isManager ? <ManagerInbox /> : <MemberThread />;
// }






import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLiveRefetch, MESSAGE_EVENTS } from '../hooks/useLiveEvents';
import { ChatAttachmentCard, ChatMediaPreview } from '../components/messages/ChatMediaPreview';

/*
 * Messages: members <-> admin team (shared inbox).
 *
 * Manager: inbox of every active member on the left, the open thread on the
 *   right (/messages/:memberId). Phones show one pane at a time.
 * Member: one thread with "the admin team". Any manager can reply; their
 *   name is shown on their messages.
 *
 * Live updates arrive as "message.created" / "message.read" events that
 * only carry the conversationId. The thread then fetches just the messages
 * after the newest one it has (?after=), never the whole history again.
 * Without live events the usual 30 s "poll" event does the same.
 */

/* -------------------------------------------------------------------------- */
/* Constants & helpers                                                        */
/* -------------------------------------------------------------------------- */

const MAX_LEN = 4000; // same as the server and the DB check
const IMAGE_LIMIT = 10 * 1024 * 1024;
const PDF_LIMIT = 50 * 1024 * 1024;
const DESIGN_FILE_LIMIT = 50 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;
const DESIGN_MIMES = ['image/svg+xml', 'application/vnd.adobe.illustrator', 'image/vnd.adobe.illustrator', 'application/postscript', 'image/vnd.adobe.photoshop', 'application/vnd.adobe.photoshop'];
const fileMime = (file) => {
  const mime = String(file?.type || '').toLowerCase();
  const ext = String(file?.name || '').split('.').pop().toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'application/pdf', ...DESIGN_MIMES].includes(mime)) return mime;
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', svg: 'image/svg+xml', ai: 'application/vnd.adobe.illustrator', psd: 'image/vnd.adobe.photoshop' })[ext] || mime;
};
const hasDraggedFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');
const WARN_LEN = 3600; // counter appears from here
const READ_PING_MS = 45000; // "still reading" while a thread is open
const NEAR_BOTTOM_PX = 120;
const LOAD_OLDER_PX = 80;
const GROUP_GAP_MS = 5 * 60 * 1000; // same sender within this = one group
const COMPOSER_MAX_PX = 160;

// UI only: people who get the verified badge. Matched by name (case-insensitive).
const VERIFIED_NAMES = ['mohamed asharaf', 'abhenav', 'abhinav','hari','Hari'];
const isVerifiedName = (name) => {
  const n = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return Boolean(n) && VERIFIED_NAMES.some((v) => n === v || n.startsWith(`${v} `));
};

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg-2)]';

const TIME_FMT = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const DAY_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const SHORT_DAY_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const apiError = (err, fallback) => err?.response?.data?.error || fallback;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysAgo = (d) => Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);

function dayLabel(date) {
  const diff = daysAgo(date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return DAY_FMT.format(date);
}

// Inbox row time: "4:12 pm" today, "Yesterday", else "12 Oct".
function listTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const diff = daysAgo(d);
  if (diff === 0) return TIME_FMT.format(d);
  if (diff === 1) return 'Yesterday';
  return SHORT_DAY_FMT.format(d);
}

const isNearBottom = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;

// Adds messages that are not on screen yet, keeping order by time.
function mergeMessages(prev, incoming) {
  if (!incoming?.length) return prev;
  const ids = new Set(prev.map((m) => String(m.id)));
  const fresh = incoming.filter((m) => !ids.has(String(m.id)));
  if (!fresh.length) return prev;
  return [...prev, ...fresh].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at) || String(a.id).localeCompare(String(b.id)),
  );
}

/* -------------------------------------------------------------------------- */
/* Icons (one stroke weight)                                                  */
/* -------------------------------------------------------------------------- */

const ICON_PATHS = {
  chat: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
  send: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></>,
  back: <path d="M15 18l-6-6 6-6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></>,
  down: <path d="M6 9l6 6 6-6" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.1" /></>,
  team: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
  clip: <path d="M21 11l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  reply: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 016 6v3" /></>,
  forward: <><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 00-6 6v3" /></>,
  trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 12a1 1 0 001 1h8a1 1 0 001-1l1-12" /><path d="M9 7V4h6v3" /></>,
  file: <><path d="M14 3H7a1 1 0 00-1 1v16a1 1 0 001 1h10a1 1 0 001-1V7l-4-4z" /><path d="M14 3v4h4" /></>,
};

function Icon({ name, className = 'h-4 w-4' }) {
  return (
    <svg className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

// Blue scalloped "verified" badge with a white tick (UI only).
function VerifiedBadge({ className = 'h-4 w-4' }) {
  return (
    <svg className={`inline-block shrink-0 ${className}`} viewBox="0 0 24 24" role="img" aria-label="Verified">
      <title>Verified</title>
      <rect x="4" y="4" width="16" height="16" rx="4.5" fill="#0095F6" />
      <rect x="4" y="4" width="16" height="16" rx="4.5" fill="#0095F6" transform="rotate(45 12 12)" />
      <path d="M8.1 12.4l2.6 2.6 5.3-5.5" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Avatar({ name, url, size = 'md' }) {
  const box = size === 'sm' ? 'h-7 w-7 text-[11px]' : 'h-10 w-10 text-sm';
  return (
    <span className={`${box} grid shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--accent-light)] font-semibold text-[color:var(--accent)]`}>
      {url ? (
        <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{(name || '?').trim()[0]?.toUpperCase() || '?'}</span>
      )}
    </span>
  );
}

// Plain text with http(s) links made clickable. No HTML is ever rendered.
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;

function Linkified({ text }) {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-[0.08em] underline-offset-2 [overflow-wrap:anywhere]"
      >
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function Notice({ icon = 'alert', title, children, action }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <span className="mb-1 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-light)] text-[color:var(--accent)] shadow-[0_14px_30px_-16px_var(--accent)]">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <h2 className="text-base font-semibold tracking-tight text-[color:var(--text)]">{title}</h2>
      {children && (
        <p className="max-w-[40ch] text-[13px] leading-relaxed text-[color:var(--text-3)] [text-wrap:pretty]">{children}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const BTN_NEUTRAL =
  `inline-flex items-center justify-center gap-1.5 rounded-xl border border-[color:var(--border)] bg-[var(--bg-3)] px-3.5 py-2 text-xs font-semibold text-[color:var(--text-2)] transition duration-200 hover:-translate-y-px hover:text-[color:var(--text)] active:translate-y-0 active:scale-[0.98] ${FOCUS_RING}`;

const MessageAction = ({ icon, title, text, danger, onClick }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    className={`inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition duration-200 hover:bg-black/10 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${danger ? 'md:hover:text-red-500' : ''}`}
  >
    <Icon name={icon} className="h-3.5 w-3.5" />{text}
  </button>
);

function ThreadSkeleton() {
  const rows = [
    ['w-2/5', false], ['w-1/3', false], ['w-1/2', true], ['w-1/4', true], ['w-3/5', false],
  ];
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 px-4 py-6 sm:px-6" aria-hidden="true">
      {rows.map(([w, right], i) => (
        <div key={i} className={`flex ${right ? 'justify-end' : ''}`}>
          <div className={`h-10 ${w} animate-pulse rounded-2xl bg-[var(--bg-3)] motion-reduce:animate-none`} />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Thread                                                                     */
/* -------------------------------------------------------------------------- */

/*
 * One conversation.
 * conversationId  the thread to show
 * memberId        the member the conversation belongs to (decides sides)
 * header          { title, subtitle, avatarName, avatarUrl }
 * onBack          phone "back to inbox" (managers)
 * onActivity      something was sent or read (manager inbox refreshes)
 */
function Thread({ conversationId, memberId, header, onBack, onActivity, forwardTargets = [] }) {
  const { user, isManager } = useAuth();

  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState([]); // { tempId, body, status, error, created_at }
  const [hasMore, setHasMore] = useState(false);
  const [otherReadAt, setOtherReadAt] = useState(null);
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [forwardTarget, setForwardTarget] = useState('');
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragDepthRef = useRef(0);
  const stickRef = useRef(true); // keep the view pinned to the newest message
  const restoreRef = useRef(null); // scroll position to keep after loading older
  const cidRef = useRef(conversationId);
  const messagesRef = useRef(messages);
  const lastSeenIdRef = useRef(null);
  cidRef.current = conversationId;
  messagesRef.current = messages;

  const headerVerified = !header.team && isVerifiedName(header.title);

  // The other side of the conversation is "theirs". For a manager that is the
  // member; for a member that is the whole admin team.
  const isTeamMessage = useCallback((m) => !sameId(m.sender_id, memberId), [memberId]);
  const isOwnSide = useCallback(
    (m) => (isManager ? isTeamMessage(m) : !isTeamMessage(m)),
    [isManager, isTeamMessage],
  );

  const markRead = useCallback(() => {
    if (document.hidden) return;
    const cid = cidRef.current;
    api
      .post(`/messages/conversations/${cid}/read`, null, { silent: true })
      .then(({ data }) => {
        if (data?.changed) onActivity?.();
      })
      .catch(() => {});
  }, [onActivity]);

  // Newest page. Shows the skeleton only on the first load of a thread.
  const loadLatest = useCallback(async ({ silent = false } = {}) => {
    const cid = conversationId;
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const { data } = await api.get(`/messages/conversations/${cid}/messages`, { params: { limit: 100 } });
      if (cidRef.current !== cid) return;
      stickRef.current = true;
      setMessages(data.messages || []);
      setHasMore(Boolean(data.has_more));
      setOtherReadAt(data.other_read_at || null);
      setReadOnly(data.conversation?.member_active === false);
      setError('');
      markRead();
    } catch (err) {
      if (cidRef.current !== cid) return;
      if (!silent) setError(apiError(err, "We couldn't load this conversation."));
    } finally {
      if (cidRef.current === cid && !silent) setLoading(false);
    }
  }, [conversationId, markRead]);

  // Only what is newer than the newest message on screen.
  const fetchNew = useCallback(async () => {
    await loadLatest({ silent: true });
  }, [loadLatest]);

  // New thread: start clean.
  useEffect(() => {
    setMessages([]);
    setPending([]);
    setHasMore(false);
    setOtherReadAt(null);
    setReadOnly(false);
    setShowJump(false);
    setDraft('');
    setFiles([]);
    lastSeenIdRef.current = null;
    stickRef.current = true;
    loadLatest();
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useLiveRefetch(MESSAGE_EVENTS, fetchNew, {
    match: (event) => sameId(event.conversationId, cidRef.current),
    delay: 150,
  });

  // While the thread is open and the tab is visible: keep it marked as read,
  // so the server does not push to this person. Also on coming back to the tab.
  useEffect(() => {
    const timer = setInterval(markRead, READ_PING_MS);
    const onVisible = () => {
      if (!document.hidden) markRead();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [markRead]);

  // Escape closes the profile dialog.
  useEffect(() => {
    if (!profileOpen) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setProfileOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [profileOpen]);

  // A new message from the other side: mark read, or offer "New messages".
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    const previous = lastSeenIdRef.current;
    lastSeenIdRef.current = String(last.id);
    if (previous === null || previous === String(last.id)) return;
    if (isOwnSide(last)) return;

    markRead();
    if (!stickRef.current) setShowJump(true);
  }, [messages, isOwnSide, markRead]);

  // Scroll: keep position after loading older, else stay pinned to the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (restoreRef.current) {
      const { height, top } = restoreRef.current;
      el.scrollTop = el.scrollHeight - height + top;
      restoreRef.current = null;
      return;
    }
    if (stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, pending, loading]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || !messagesRef.current.length) return;
    const cid = conversationId;
    setLoadingOlder(true);
    try {
      const { data } = await api.get(`/messages/conversations/${cid}/messages`, {
        params: { before: messagesRef.current[0].id },
      });
      if (cidRef.current !== cid) return;
      const el = scrollRef.current;
      if (el) restoreRef.current = { height: el.scrollHeight, top: el.scrollTop };
      setMessages((prev) => mergeMessages(prev, data.messages || []));
      setHasMore(Boolean(data.has_more));
    } catch {
      /* the button stays, the person can try again */
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    stickRef.current = isNearBottom(el);
    if (stickRef.current) setShowJump(false);
    if (el.scrollTop < LOAD_OLDER_PX) loadOlder();
  };

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    setShowJump(false);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  /* ---------- sending ---------- */

  const addFiles = useCallback((incoming) => {
    const next = [...files];
    let validationError = '';
    for (const file of Array.from(incoming || [])) {
      if (next.length >= MAX_ATTACHMENTS) { validationError = 'A message can include up to 3 attachments.'; break; }
      const mime = fileMime(file);
      const image = ['image/jpeg', 'image/png', 'image/webp'].includes(mime);
      const designFile = DESIGN_MIMES.includes(mime);
      if (!image && !designFile && mime !== 'image/svg+xml' && mime !== 'application/pdf') { validationError = 'Attach JPG, PNG, WebP, SVG, AI, PSD, or PDF files.'; continue; }
      const limit = image ? IMAGE_LIMIT : mime === 'application/pdf' ? PDF_LIMIT : DESIGN_FILE_LIMIT;
      if (file.size > limit) { validationError = `${image ? 'Images' : mime === 'application/pdf' ? 'PDF files' : 'SVG, AI, and PSD files'} must be ${limit / (1024 * 1024)} MB or smaller.`; continue; }
      if (!next.some((item) => item.name === file.name && item.size === file.size)) next.push(file);
    }
    setFiles(next);
    setError(validationError);
  }, [files]);

  const uploadFile = useCallback(async (file) => {
    const { data: signed } = await api.post('/messages/uploads/signature', { mime_type: fileMime(file), size: file.size });
    const form = new FormData();
    for (const key of ['api_key', 'timestamp', 'signature', 'public_id', 'upload_preset']) if (signed[key] != null) form.append(key, String(signed[key]));
    form.append('file', file);
    const response = await fetch(signed.upload_url, { method: 'POST', body: form });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message || 'Cloudinary upload failed.');
    return { public_id: result.public_id, secure_url: result.secure_url, resource_type: result.resource_type, format: result.format, bytes: result.bytes, original_filename: file.name };
  }, []);

  const send = useCallback(async (retry) => {
    setError('');
    const body = (retry ? retry.body : draft).trim();
    const outgoingFiles = retry?.files || files;
    if ((!body && !outgoingFiles.length) || readOnly || body.length > MAX_LEN || uploading) return;

    const tempId = retry?.tempId || `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (retry) {
      setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, status: 'sending', error: '' } : x)));
    } else {
      setPending((p) => [...p, { tempId, body, displayBody: body || outgoingFiles.map((file) => file.name).join(', '), files: outgoingFiles, status: 'sending', error: '', created_at: new Date().toISOString() }]);
      setDraft('');
    }
    stickRef.current = true;
    setShowJump(false);
    textareaRef.current?.focus();

    const cid = conversationId;
    setUploading(true);
    try {
      const attachments = [];
      for (const file of outgoingFiles) attachments.push(await uploadFile(file));
      const { data } = await api.post(`/messages/conversations/${cid}/messages`, { body, attachments, reply_to_message_id: replyTo?.id || null }, { silent: true });
      if (cidRef.current !== cid) return;
      setPending((p) => p.filter((x) => x.tempId !== tempId));
      if (data?.message) setMessages((prev) => mergeMessages(prev, [data.message]));
      setReplyTo(null);
      setFiles([]);
      onActivity?.();
    } catch (err) {
      if (cidRef.current !== cid) return;
      setPending((p) =>
        p.map((x) =>
          x.tempId === tempId ? { ...x, status: 'failed', error: apiError(err, 'Not sent.') } : x,
        ),
      );
    } finally {
      setUploading(false);
    }
  }, [conversationId, draft, files, onActivity, readOnly, replyTo, uploadFile, uploading]);

  const deleteMessage = useCallback(async (message, mode) => {
    if (!window.confirm(mode === 'for-everyone' ? 'Delete this message for everyone?' : 'Delete this message for you?')) return;
    try {
      await api.delete(`/messages/conversations/${conversationId}/messages/${message.id}`, { data: { mode } });
      if (mode === 'for-me') setMessages((old) => old.filter((item) => !sameId(item.id, message.id)));
      else setMessages((old) => old.map((item) => sameId(item.id, message.id) ? { ...item, body: 'This message was deleted', deleted: true } : item));
    } catch (err) { setError(apiError(err, 'Could not delete this message.')); }
  }, [conversationId]);

  const forwardMessage = useCallback(async () => {
    if (!forwarding || !forwardTarget) return;
    try {
      await api.post(`/messages/conversations/${conversationId}/messages/${forwarding.id}/forward`, { target_conversation_id: forwardTarget });
      setForwarding(null);
      setForwardTarget('');
    } catch (err) { setError(apiError(err, 'Could not forward this message.')); }
  }, [conversationId, forwarding, forwardTarget]);

  const discard = (tempId) => setPending((p) => p.filter((x) => x.tempId !== tempId));

  // Composer grows with its text, up to a limit.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, COMPOSER_MAX_PX)}px`;
  }, [draft]);

  const onComposerKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const onDragEnter = (e) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragging(true);
  };
  const onDragOver = (e) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e) => {
    if (!hasDraggedFiles(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (!dragDepthRef.current) setDragging(false);
  };
  const onDrop = (e) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  /* ---------- rows ---------- */

  const rows = useMemo(() => {
    const all = [
      ...messages.map((m) => ({ ...m, key: String(m.id) })),
      ...pending.map((p) => ({
        id: null,
        key: p.tempId,
        sender_id: user?.id,
        sender_name: user?.name,
        body: p.displayBody ?? p.body,
        created_at: p.created_at,
        pending: p,
      })),
    ];

    const out = [];
    let prevDay = null;
    let prev = null;
    for (const m of all) {
      const date = new Date(m.created_at);
      const day = date.toDateString();
      if (day !== prevDay) {
        out.push({ type: 'day', key: `day-${day}`, label: dayLabel(date) });
        prevDay = day;
        prev = null;
      }
      const grouped = Boolean(
        prev && sameId(prev.sender_id, m.sender_id) && date - new Date(prev.created_at) < GROUP_GAP_MS,
      );
      const mine = sameId(m.sender_id, user?.id);
      const team = isTeamMessage(m);
      out.push({
        type: 'msg',
        key: m.key,
        m,
        right: isOwnSide(m),
        mine,
        grouped,
        // Admin names: on the member's screen, and for the other managers'
        // replies on a manager's screen.
        name: !grouped && !mine && team ? m.sender_name || 'Admin' : null,
      });
      prev = m;
    }
    return out;
  }, [messages, pending, user?.id, user?.name, isOwnSide, isTeamMessage]);

  // "Seen" / "Sent" under the last message from this side.
  const lastOwnKey = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const r = rows[i];
      if (r.type === 'msg' && r.right && !r.m.pending) return r.key;
    }
    return null;
  }, [rows]);

  const remaining = MAX_LEN - draft.length;

  return (
    <section
      className="relative flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-[var(--bg-2)]"
      aria-label={`Conversation: ${header.title}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Header */}
      <header className="flex min-w-0 shrink-0 items-center gap-2.5 border-b border-[color:var(--border)] bg-[var(--bg-2)] px-3 py-3 sm:px-5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to inbox"
            className={`-ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[color:var(--text-2)] transition duration-200 hover:bg-[var(--bg-3)] hover:text-[color:var(--text)] active:scale-95 md:hidden ${FOCUS_RING}`}
          >
            <Icon name="back" className="h-5 w-5" />
          </button>
        )}
        {header.team ? (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-light)] text-[color:var(--accent)]">
            <Icon name="team" className="h-5 w-5" />
          </span>
        ) : (
          <button type="button" onClick={() => setProfileOpen(true)} aria-label={`View ${header.title} profile`} className={`shrink-0 rounded-xl transition duration-200 hover:ring-2 hover:ring-[color:var(--accent)] ${FOCUS_RING}`}>
            <Avatar name={header.avatarName} url={header.avatarUrl} />
          </button>
        )}
        <button type="button" disabled={header.team} onClick={() => setProfileOpen(true)} className={`min-w-0 flex-1 rounded-lg text-left disabled:cursor-default ${FOCUS_RING}`}>
          <h2 className="flex min-w-0 items-center gap-1 text-sm font-semibold leading-tight tracking-tight text-[color:var(--text)]">
            <span className="truncate">{header.title}</span>
            {headerVerified && <VerifiedBadge className="h-4 w-4" />}
          </h2>
          {header.subtitle && <p className="mt-0.5 truncate text-[11px] text-[color:var(--text-3)]">{header.subtitle}</p>}
        </button>
        {header.action && <div className="ml-auto shrink-0">{header.action}</div>}
      </header>

      {/* Messages */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain bg-[var(--bg)] bg-[radial-gradient(45%_35%_at_100%_0%,var(--accent-light),transparent)] px-3 py-4 sm:px-5"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-busy={loading}
        >
          {loading ? (
            <ThreadSkeleton />
          ) : error ? (
            <Notice
              title="We couldn't load this conversation"
              action={<button type="button" onClick={() => loadLatest()} className={BTN_NEUTRAL}>Try again</button>}
            >
              {error}
            </Notice>
          ) : rows.length === 0 ? (
            <Notice icon="chat" title={isManager ? `No messages with ${header.title} yet` : 'No messages yet'}>
              {isManager
                ? 'Write the first message below. Every admin can see this conversation.'
                : 'Send a message to the admin team. Any admin can reply.'}
            </Notice>
          ) : (
            <ol className="m-0 flex w-full min-w-0 list-none flex-col p-0">
              {hasMore && (
                <li className="mb-3 flex justify-center">
                  <button type="button" onClick={loadOlder} disabled={loadingOlder} className={`${BTN_NEUTRAL} disabled:opacity-60`}>
                    {loadingOlder ? 'Loading…' : 'Load earlier messages'}
                  </button>
                </li>
              )}

              {rows.map((row) =>
                row.type === 'day' ? (
                  <li key={row.key} className="my-4 flex items-center gap-3 first:mt-0" aria-label={row.label}>
                    <span className="h-px flex-1 bg-[var(--border)]" aria-hidden="true" />
                    <span className="rounded-full bg-[var(--bg-3)] px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--text-3)]">{row.label}</span>
                    <span className="h-px flex-1 bg-[var(--border)]" aria-hidden="true" />
                  </li>
                ) : (
                  <MessageRow
                    key={row.key}
                    row={row}
                    status={
                      row.key === lastOwnKey
                        ? otherReadAt && new Date(otherReadAt) >= new Date(row.m.created_at)
                          ? 'Seen'
                          : 'Sent'
                        : null
                    }
                    onRetry={send}
                    onDiscard={discard}
                    onReply={(message) => { setReplyTo(message); textareaRef.current?.focus(); }}
                    onDelete={deleteMessage}
                    onForward={(message) => { setForwarding(message); setForwardTarget(''); }}
                    onOpenAttachment={setPreviewAttachment}
                    canForward={Boolean(isManager)}
                  />
                ),
              )}
            </ol>
          )}
        </div>

        {showJump && (
          <button
            type="button"
            onClick={jumpToBottom}
            className={`absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_10px_24px_-10px_var(--accent)] transition duration-200 hover:brightness-110 active:scale-95 ${FOCUS_RING}`}
          >
            New messages
            <Icon name="down" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="relative shrink-0 border-t border-[color:var(--border)] bg-[var(--bg-2)] px-3 pb-2.5 pt-3 sm:px-5">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border-l-2 border-[color:var(--accent)] bg-[var(--accent-light)] px-3 py-2 text-xs text-[color:var(--text-2)]">
            <span className="truncate">Replying to {replyTo.sender_name || 'message'}: {replyTo.body}</span>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className={`grid h-6 w-6 shrink-0 place-items-center rounded-md transition duration-200 hover:bg-black/10 ${FOCUS_RING}`}><Icon name="close" className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {forwarding && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--accent-light)] p-2.5">
            <span className="text-xs font-medium text-[color:var(--text-2)]">Forward to member</span>
            <select value={forwardTarget} onChange={(e) => setForwardTarget(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-[color:var(--border)] bg-[var(--bg-2)] px-2 py-1.5 text-xs text-[color:var(--text)] outline-none focus:border-[color:var(--accent)]">
              <option value="">Choose a conversation</option>
              {forwardTargets.filter((item) => !sameId(item.conversation_id, conversationId)).map((item) => <option key={item.member_id} value={item.conversation_id}>{item.name}</option>)}
            </select>
            <button type="button" disabled={!forwardTarget} onClick={forwardMessage} className={`rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition duration-200 hover:brightness-110 active:scale-95 disabled:opacity-50 ${FOCUS_RING}`}>Forward</button>
            <button type="button" onClick={() => setForwarding(null)} className={`rounded-lg px-2 py-1.5 text-xs text-[color:var(--text-2)] transition duration-200 hover:bg-black/10 ${FOCUS_RING}`}>Cancel</button>
          </div>
        )}
        {readOnly ? (
          <p className="flex items-center gap-2 rounded-xl bg-[var(--bg-3)] px-3.5 py-2.5 text-xs text-[color:var(--text-3)]">
            <Icon name="lock" className="h-3.5 w-3.5" />
            This member is no longer active. The conversation is read-only.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex min-w-0 items-end gap-1 rounded-2xl border border-[color:var(--border)] bg-[var(--bg-3)] p-1.5 transition duration-200 focus-within:border-[color:var(--accent)] focus-within:ring-4 focus-within:ring-[color:var(--accent-light)]"
          >
            <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/svg+xml,application/pdf,.ai,.psd,.svg" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} className="hidden" />
            {files.length > 0 && (
              <div className="absolute inset-x-3 bottom-full mb-2 flex flex-wrap gap-1.5 rounded-xl border border-[color:var(--border)] bg-[var(--bg-2)] p-2 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.5)] sm:inset-x-5">
                {files.map((file, index) => (
                  <span key={`${file.name}-${index}`} className="flex max-w-56 items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[var(--bg-3)] py-1 pl-2 pr-1 text-[11px] font-medium text-[color:var(--text-2)]">
                    <Icon name="file" className="h-3.5 w-3.5" />
                    <span className="truncate">{file.name}</span>
                    <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((old) => old.filter((_, i) => i !== index))} className={`grid h-5 w-5 place-items-center rounded-md transition duration-200 hover:bg-black/10 ${FOCUS_RING}`}><Icon name="close" className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <button
              type="button"
              title="Attach image or PDF"
              aria-label="Attach image or PDF"
              onClick={() => fileInputRef.current?.click()}
              disabled={files.length >= MAX_ATTACHMENTS || uploading}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[color:var(--text-2)] transition duration-200 hover:bg-[var(--bg-2)] hover:text-[color:var(--text)] active:scale-95 disabled:opacity-40 ${FOCUS_RING}`}
            >
              <Icon name="clip" className="h-[18px] w-[18px]" />
            </button>
            <label htmlFor={`composer-${conversationId}`} className="sr-only">
              Message
            </label>
            <textarea
              id={`composer-${conversationId}`}
              ref={textareaRef}
              rows={1}
              value={draft}
              maxLength={MAX_LEN}
              disabled={loading || Boolean(error)}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onComposerKey}
              placeholder={isManager ? `Message ${header.title}` : 'Message the admin team'}
              className="min-h-9 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-[16px] leading-5 text-[color:var(--text)] outline-none placeholder:text-[color:var(--text-3)] disabled:opacity-60 sm:text-sm"
            />
            <button
              type="submit"
              disabled={(!draft.trim() && !files.length) || loading || Boolean(error) || uploading}
              aria-label="Send message"
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-white shadow-[0_8px_18px_-8px_var(--accent)] transition duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${FOCUS_RING}`}
            >
              {uploading ? <span className="animate-pulse text-xs">…</span> : <Icon name="send" className="h-[18px] w-[18px]" />}
            </button>
          </form>
        )}
        {!readOnly && (
          <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-[11px] text-[color:var(--text-3)]">
            <span className="truncate text-[10px]"><span className="sm:hidden">Images 10 MB · files 50 MB</span><span className="hidden sm:inline">Images 10 MB · PDFs, SVG, AI and PSD 50 MB · Enter to send · Shift + Enter for a new line</span></span>
            {draft.length >= WARN_LEN && (
              <span className={`ml-auto tabular-nums ${remaining <= 0 ? 'text-[color:var(--danger)]' : ''}`}>
                {remaining} characters left
              </span>
            )}
          </div>
        )}
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-[color:var(--accent)] bg-[var(--bg-2)]" aria-hidden="true">
          <div className="flex items-center gap-2 rounded-xl bg-[var(--accent-light)] px-5 py-3 text-sm font-semibold text-[color:var(--accent)]"><Icon name="clip" className="h-4 w-4" />Drop images or PDFs to attach</div>
        </div>
      )}

      <ChatMediaPreview file={previewAttachment} onClose={() => setPreviewAttachment(null)} />

      {profileOpen && !header.team && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-label={`${header.title} profile`} className="w-full max-w-sm overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--bg-2)] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.6)]">
            <div className="relative grid min-h-56 place-items-center bg-[var(--bg-3)] bg-[radial-gradient(70%_80%_at_50%_0%,var(--accent-light),transparent)] p-6">
              <button type="button" aria-label="Close profile" onClick={() => setProfileOpen(false)} className={`absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl bg-black/35 text-white transition duration-200 hover:bg-black/50 active:scale-95 ${FOCUS_RING}`}><Icon name="close" className="h-4 w-4" /></button>
              {header.avatarUrl
                ? <img src={header.avatarUrl} alt={`${header.title} profile`} className="h-40 w-40 rounded-[2rem] object-cover shadow-[0_24px_50px_-20px_rgba(0,0,0,0.55)]" />
                : <span className="grid h-40 w-40 place-items-center rounded-[2rem] bg-[var(--accent-light)] text-5xl font-semibold text-[color:var(--accent)]">{(header.avatarName || header.title || '?').slice(0, 1).toUpperCase()}</span>}
            </div>
            <div className="p-6">
              <h2 className="flex min-w-0 items-center gap-1.5 text-xl font-semibold tracking-tight text-[color:var(--text)]">
                <span className="truncate">{header.title}</span>
                {headerVerified && <VerifiedBadge className="h-5 w-5" />}
              </h2>
              <p className="mt-1 text-sm text-[color:var(--text-3)]">Member · Orbit</p>
              {header.subtitle && <p className="mt-4 rounded-xl bg-[var(--bg-3)] px-3.5 py-3 text-xs leading-relaxed text-[color:var(--text-2)]">{header.subtitle}</p>}
              <button type="button" onClick={() => setProfileOpen(false)} className={`mt-5 w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_22px_-10px_var(--accent)] transition duration-200 hover:brightness-110 active:scale-[0.98] ${FOCUS_RING}`}>Back to chat</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

const MessageRow = memo(function MessageRow({ row, status, onRetry, onDiscard, onReply, onDelete, onForward, onOpenAttachment, canForward }) {
  const { m, right, mine, grouped, name } = row;
  const p = m.pending;
  const [showActions, setShowActions] = useState(false);

  const bubble = right
    ? mine
      ? 'rounded-br-md bg-[var(--accent)] text-white shadow-[0_10px_24px_-14px_var(--accent)]'
      : // Another admin's reply on a manager's screen: team side, softer.
        'rounded-br-md bg-[var(--accent-light)] text-[color:var(--text)]'
    : 'rounded-bl-md border border-[color:var(--border)] bg-[var(--bg-2)] text-[color:var(--text)] shadow-[0_8px_20px_-16px_rgba(15,23,42,0.5)]';

  return (
    <li className={`group flex w-full min-w-0 flex-col ${right ? 'items-end' : 'items-start'} ${grouped ? 'mt-0.5' : 'mt-3 first:mt-0'}`}>
      {name && (
        <span className="mb-1 inline-flex items-center gap-1 px-1 text-[11px] font-medium text-[color:var(--text-3)]">
          {name}
          {isVerifiedName(name) && <VerifiedBadge className="h-3.5 w-3.5" />}
        </span>
      )}
      <div
        onClick={() => { if (!p && !m.deleted) setShowActions((v) => !v); }}
        className={`relative max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed [overflow-wrap:anywhere] sm:max-w-[min(72%,560px)] ${bubble} ${
          p?.status === 'failed' ? 'opacity-70 ring-1 ring-[color:var(--danger)]' : ''
        } ${p?.status === 'sending' ? 'opacity-70' : ''}`}
      >
        {m.forwarded_from_id && <p className="mb-1 flex items-center gap-1 text-[10px] font-medium italic opacity-75"><Icon name="forward" className="h-3 w-3" />Forwarded</p>}
        {m.reply_to_message_id && (
          <div className={`mb-1.5 rounded-lg border-l-2 bg-black/10 px-2.5 py-1.5 text-[11px] ${mine ? 'border-white/60' : 'border-[color:var(--accent)]'}`}>
            <span className="font-semibold">{m.reply_sender_name || 'Reply'}</span>
            <p className="truncate opacity-80">{m.reply_body || 'Message'}</p>
          </div>
        )}
        {m.deleted ? <span className="italic opacity-70">This message was deleted</span> : <Linkified text={m.body || ''} />}
        {!m.deleted && m.attachments?.map((file) => <ChatAttachmentCard key={file.public_id} file={file} onOpen={onOpenAttachment} />)}
        {!p && !m.deleted && (
          <div className={`${showActions ? 'mt-2 flex' : 'hidden'} items-center gap-0.5 whitespace-normal rounded-lg bg-black/10 p-0.5 md:absolute md:-top-4 ${right ? 'md:right-2' : 'md:left-2'} md:z-10 md:mt-0 md:flex md:border md:border-[color:var(--border)] md:bg-[var(--bg-2)] md:text-[color:var(--text-2)] md:opacity-0 md:shadow-[0_8px_20px_-12px_rgba(15,23,42,0.5)] md:transition-opacity md:duration-200 md:focus-within:opacity-100 md:group-hover:opacity-100`}>
            <MessageAction icon="reply" title="Reply" onClick={() => onReply(m)} />
            {canForward && <MessageAction icon="forward" title="Forward" onClick={() => onForward(m)} />}
            <MessageAction icon="trash" title="Delete for me" text="For me" onClick={() => onDelete(m, 'for-me')} />
            {mine && <MessageAction icon="trash" title="Delete for everyone" text="Everyone" danger onClick={() => onDelete(m, 'for-everyone')} />}
          </div>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[10px] tabular-nums text-[color:var(--text-3)]">
        {p?.status === 'sending' && <span>Sending…</span>}
        {p?.status === 'failed' && (
          <span role="alert" className="flex items-center gap-2 text-[color:var(--danger)]">
            {p.error || 'Not sent.'}
            <button type="button" onClick={() => onRetry(p)} className={`rounded font-semibold underline-offset-2 hover:underline ${FOCUS_RING}`}>
              Retry
            </button>
            <button type="button" onClick={() => onDiscard(p.tempId)} className={`rounded text-[color:var(--text-3)] underline-offset-2 hover:underline ${FOCUS_RING}`}>
              Discard
            </button>
          </span>
        )}
        {!p && (
          <time dateTime={m.created_at} title={new Date(m.created_at).toLocaleString('en-IN')}>
            {TIME_FMT.format(new Date(m.created_at))}
          </time>
        )}
        {!p && status && <span className={status === 'Seen' ? 'font-medium text-[color:var(--accent)]' : ''}>· {status}</span>}
      </div>
    </li>
  );
});

/* -------------------------------------------------------------------------- */
/* Manager: inbox                                                             */
/* -------------------------------------------------------------------------- */

function InboxRow({ row, active, meId, onOpen }) {
  const last = row.last_message;
  const bodyPreview = last ? (last.body || (last.attachments?.length ? 'Attachment' : '')) : '';
  const preview = last
    ? `${sameId(last.sender_id, meId) ? 'You: ' : !sameId(last.sender_id, row.member_id) ? 'Admin: ' : ''}${bodyPreview}`
    : 'No messages yet';
  const verified = isVerifiedName(row.name);

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(row.member_id)}
        aria-current={active ? 'true' : undefined}
        className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition duration-200 active:scale-[0.99] ${FOCUS_RING} ${
          active
            ? 'bg-[var(--bg-3)] before:absolute before:bottom-3 before:left-0 before:top-3 before:w-[3px] before:rounded-full before:bg-[var(--accent)]'
            : 'hover:bg-[var(--bg-3)]'
        }`}
      >
        <Avatar name={row.name} url={row.avatar_url} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1">
              <span className={`truncate text-[13px] tracking-tight text-[color:var(--text)] ${row.unread ? 'font-semibold' : 'font-medium'}`}>
                {row.name}
              </span>
              {verified && <VerifiedBadge className="h-3.5 w-3.5" />}
            </span>
            {last && (
              <span className={`shrink-0 text-[11px] tabular-nums ${row.unread ? 'font-semibold text-[color:var(--accent)]' : 'text-[color:var(--text-3)]'}`}>
                {listTime(last.created_at)}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className={`truncate text-xs ${row.unread ? 'text-[color:var(--text-2)]' : 'text-[color:var(--text-3)]'} ${last ? '' : 'italic'}`}>
              {preview}
            </span>
            {row.unread > 0 && (
              <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-md bg-[var(--accent)] px-1.5 text-[11px] font-semibold tabular-nums text-white">
                <span aria-hidden="true">{row.unread > 99 ? '99+' : row.unread}</span>
                <span className="sr-only">{row.unread} unread</span>
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function ManagerInbox() {
  const { user } = useAuth();
  const { memberId } = useParams();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null); // { conversationId, memberId }
  const [openError, setOpenError] = useState('');
  const conversationIds = useRef(new Map()); // memberId -> conversationId

  const loadList = useCallback(async ({ silent = true } = {}) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const { data } = await api.get('/messages/conversations');
      const list = data?.conversations || [];
      list.forEach((r) => {
        if (r.conversation_id) conversationIds.current.set(String(r.member_id), r.conversation_id);
      });
      setRows(list);
      setError('');
    } catch (err) {
      if (!silent) setError(apiError(err, "We couldn't load your inbox."));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList({ silent: false });
  }, [loadList]);

  useLiveRefetch(MESSAGE_EVENTS, loadList, { delay: 400 });

  // The thread in the URL: use the known conversation, or create it for a
  // member who has never been messaged.
  useEffect(() => {
    let cancelled = false;
    setOpenError('');
    if (!memberId) {
      setOpen(null);
      return undefined;
    }

    const known = conversationIds.current.get(String(memberId));
    if (known) {
      setOpen({ conversationId: known, memberId });
      return undefined;
    }

    setOpen(null);
    api
      .post('/messages/conversations', { member_id: memberId }, { silent: true })
      .then(({ data }) => {
        if (cancelled || !data?.conversation) return;
        conversationIds.current.set(String(memberId), data.conversation.id);
        setOpen({ conversationId: data.conversation.id, memberId });
      })
      .catch((err) => {
        if (!cancelled) setOpenError(apiError(err, "We couldn't open this conversation."));
      });

    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  const selected = rows.find((r) => sameId(r.member_id, memberId));
  const totalUnread = rows.reduce((sum, r) => sum + (r.unread || 0), 0);
  const openThread = useCallback((id) => navigate(`/messages/${id}`), [navigate]);
  const back = useCallback(() => navigate('/messages'), [navigate]);

  return (
    <div className="flex h-full min-h-0 bg-[var(--bg)] md:p-5 lg:p-8">
      <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 overflow-hidden bg-[var(--bg-2)] md:rounded-3xl md:border md:border-[color:var(--border)] md:shadow-[0_30px_70px_-35px_rgba(15,23,42,0.45)]">
        {/* Inbox */}
        <aside
          className={`${memberId ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-[color:var(--border)] md:w-[330px] md:border-r lg:w-[360px]`}
          aria-label="Inbox"
        >
          <div className="shrink-0 px-4 pb-3 pt-4">
            <div className="flex items-baseline justify-between gap-2">
              <h1 className="text-[17px] font-semibold tracking-tight text-[color:var(--text)]">Messages</h1>
              {totalUnread > 0 && (
                <span className="rounded-md bg-[var(--accent-light)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[color:var(--accent)]">{totalUnread} unread</span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-[color:var(--text-3)]">Shared inbox. Every admin sees these.</p>
            <label className="relative mt-3 block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)]">
                <Icon name="search" className="h-4 w-4" />
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search members"
                aria-label="Search members"
                className="h-10 w-full rounded-xl border border-[color:var(--border)] bg-[var(--bg-3)] pl-9 pr-3 text-[16px] text-[color:var(--text)] outline-none transition duration-200 placeholder:text-[color:var(--text-3)] focus:border-[color:var(--accent)] focus:ring-4 focus:ring-[color:var(--accent-light)] sm:text-sm"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
            {loading ? (
              <ul className="m-0 list-none space-y-1 p-0" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="h-10 w-10 animate-pulse rounded-xl bg-[var(--bg-3)] motion-reduce:animate-none" />
                    <span className="flex-1 space-y-2">
                      <span className="block h-3 w-1/2 animate-pulse rounded bg-[var(--bg-3)] motion-reduce:animate-none" />
                      <span className="block h-2.5 w-3/4 animate-pulse rounded bg-[var(--bg-3)] motion-reduce:animate-none" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : error ? (
              <Notice
                title="We couldn't load your inbox"
                action={<button type="button" onClick={() => loadList({ silent: false })} className={BTN_NEUTRAL}>Try again</button>}
              >
                {error}
              </Notice>
            ) : rows.length === 0 ? (
              <Notice icon="team" title="No members yet">Active members will show up here.</Notice>
            ) : visible.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-[color:var(--text-3)]">No members match “{query}”.</p>
            ) : (
              <ul className="m-0 list-none space-y-0.5 p-0">
                {visible.map((row) => (
                  <InboxRow
                    key={row.member_id}
                    row={row}
                    active={sameId(row.member_id, memberId)}
                    meId={user?.id}
                    onOpen={openThread}
                  />
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Thread */}
        <div className={`${memberId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col bg-[var(--bg)]`}>
          {!memberId ? (
            <Notice icon="chat" title="Choose a member">
              Pick someone from the inbox to read and reply. Members can only message the admin team.
            </Notice>
          ) : openError ? (
            <Notice
              title="We couldn't open this conversation"
              action={<button type="button" onClick={back} className={BTN_NEUTRAL}>Back to inbox</button>}
            >
              {openError}
            </Notice>
          ) : !open ? (
            <ThreadSkeleton />
          ) : (
            <Thread
              conversationId={open.conversationId}
              memberId={open.memberId}
              header={{
                title: selected?.name || 'Member',
                subtitle: selected?.email || '',
                avatarName: selected?.name,
                avatarUrl: selected?.avatar_url,
              }}
              onBack={back}
              onActivity={loadList}
              forwardTargets={rows.filter((row) => row.conversation_id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Member: one thread with the admin team                                     */
/* -------------------------------------------------------------------------- */

function MemberThread() {
  const { user } = useAuth();
  const [conversation, setConversation] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const { data } = await api.get('/messages/conversations/me');
      setConversation(data?.conversation || null);
    } catch (err) {
      setError(apiError(err, "We couldn't open your messages."));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full bg-[var(--bg)] md:p-5 lg:p-8">
      <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-[920px] flex-1 overflow-hidden bg-[var(--bg-2)] md:rounded-3xl md:border md:border-[color:var(--border)] md:shadow-[0_30px_70px_-35px_rgba(15,23,42,0.45)]">
        {error ? (
          <Notice title="We couldn't open your messages" action={<button type="button" onClick={load} className={BTN_NEUTRAL}>Try again</button>}>
            {error}
          </Notice>
        ) : !conversation ? (
          <div className="flex flex-1 flex-col"><ThreadSkeleton /></div>
        ) : (
          <Thread
            conversationId={conversation.id}
            memberId={user?.id}
            header={{
              title: 'Admin team',
              subtitle: 'Your messages go to every admin. Any of them can reply.',
              team: true,
              action: <Link to="/messages/people" className={`inline-flex items-center rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold text-[color:var(--text-2)] transition duration-200 hover:bg-[var(--bg-3)] hover:text-[color:var(--text)] active:scale-[0.98] ${FOCUS_RING}`}>Member chats</Link>,
            }}
            forwardTargets={[]}
          />
        )}
      </div>
    </div>
  );
}

export default function Messages() {
  const { isManager } = useAuth();
  return isManager ? <ManagerInbox /> : <MemberThread />;
}
