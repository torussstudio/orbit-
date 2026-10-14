// import { useEffect } from 'react';

// export const attachmentDownloadUrl = (url) => String(url || '').replace('/upload/', '/upload/fl_attachment/');

// export function ChatAttachmentCard({ file, onOpen }) {
//   const image = file?.resource_type === 'image';
//   const name = file?.original_filename || (image ? 'Chat image' : 'PDF file');
//   return (
//     <div className="mt-2 w-[min(68vw,248px)] overflow-hidden rounded-xl bg-black/10">
//       <button type="button" onClick={() => onOpen(file)} aria-label={`Open ${name}`} className="block aspect-[4/3] w-full overflow-hidden bg-black/10 text-left">
//         {image ? <img src={file.secure_url} alt={name} loading="lazy" className="h-full w-full object-cover" /> : (
//           <span className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center text-[color:var(--text-2)]">
//             <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--bg-2)] text-2xl">📄</span>
//             <span className="line-clamp-2 max-w-full break-all text-xs font-medium">{name}</span>
//             <span className="text-[10px] opacity-70">Tap to preview PDF</span>
//           </span>
//         )}
//       </button>
//       <a href={attachmentDownloadUrl(file.secure_url)} download={name} className="block truncate px-2.5 py-1.5 text-[10px] underline opacity-80">Download · {name}</a>
//     </div>
//   );
// }

// export function ChatMediaPreview({ file, onClose }) {
//   useEffect(() => {
//     if (!file) return undefined;
//     const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
//     document.addEventListener('keydown', onKeyDown);
//     return () => document.removeEventListener('keydown', onKeyDown);
//   }, [file, onClose]);
//   if (!file) return null;
//   const image = file.resource_type === 'image';
//   const name = file.original_filename || (image ? 'Chat image' : 'PDF file');
//   return (
//     <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
//       <section role="dialog" aria-modal="true" aria-label={`Preview ${name}`} className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-[var(--bg-2)] shadow-2xl">
//         <header className="flex min-w-0 items-center gap-3 border-b border-[color:var(--border)] px-3 py-2.5 sm:px-4">
//           <span className="min-w-0 flex-1 truncate text-sm font-medium text-[color:var(--text)]">{name}</span>
//           <a href={attachmentDownloadUrl(file.secure_url)} download={name} className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white">Download</a>
//           <button type="button" onClick={onClose} aria-label="Close preview" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xl text-[color:var(--text-2)] hover:bg-[var(--bg-3)]">×</button>
//         </header>
//         <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-black/90 p-2 sm:p-4">
//           {image ? <img src={file.secure_url} alt={name} className="max-h-[calc(92dvh-90px)] max-w-full object-contain" /> : <iframe title={name} src={file.secure_url} className="h-[78dvh] w-full max-w-4xl rounded-lg bg-white" />}
//         </div>
//       </section>
//     </div>
//   );
// }



import { useEffect, useRef } from 'react';

export const attachmentDownloadUrl = (url) => String(url || '').replace('/upload/', '/upload/fl_attachment/');

const ICON_PATHS = {
  file: <><path d="M14 3H7a1 1 0 00-1 1v16a1 1 0 001 1h10a1 1 0 001-1V7l-4-4z" /><path d="M14 3v4h4" /></>,
  download: <><path d="M12 4v11" /><path d="M7 11l5 5 5-5" /><path d="M5 20h14" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
};

function Icon({ name, className = 'h-4 w-4' }) {
  return (
    <svg className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

export function ChatAttachmentCard({ file, onOpen }) {
  const image = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file?.mime_type) || (!file?.mime_type && ['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(file?.format));
  const pdf = file?.mime_type === 'application/pdf' || file?.format === 'pdf';
  const name = file?.original_filename || (image ? 'Chat image' : 'PDF file');
  return (
    <div className="mt-2 w-[min(68vw,248px)] overflow-hidden rounded-xl border border-black/10 bg-black/10">
      <button
        type="button"
        onClick={() => onOpen(file)}
        aria-label={`Open ${name}`}
        className="group/preview block aspect-[4/3] w-full overflow-hidden bg-black/10 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-current"
      >
        {image ? (
          <img src={file.secure_url} alt={name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover/preview:scale-[1.03]" />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center text-[color:var(--text-2)] transition duration-200 group-hover/preview:bg-black/5">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--bg-2)] text-[color:var(--accent)] shadow-[0_10px_22px_-14px_var(--accent)]">
              <Icon name="file" className="h-6 w-6" />
            </span>
            <span className="line-clamp-2 max-w-full break-all text-xs font-medium tracking-tight">{name}</span>
            <span className="text-[10px] opacity-70">{pdf ? 'Tap to preview PDF' : 'Tap for file details'}</span>
          </span>
        )}
      </button>
      <a
        href={attachmentDownloadUrl(file.secure_url)}
        download={name}
        className="flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-medium opacity-90 transition duration-200 hover:bg-black/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-current"
      >
        <Icon name="download" className="h-3.5 w-3.5" />
        <span className="truncate">Download · {name}</span>
      </a>
    </div>
  );
}

export function ChatMediaPreview({ file, onClose }) {
  const closeButton = useRef(null);

  useEffect(() => {
    if (!file) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    closeButton.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [file, onClose]);

  if (!file) return null;
  const image = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.mime_type) || (!file.mime_type && ['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(file.format));
  const pdf = file.mime_type === 'application/pdf' || (!file.mime_type && file.format === 'pdf');
  const name = file.original_filename || (image ? 'Chat image' : 'PDF file');
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={`Preview ${name}`} className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--bg-2)] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.7)]">
        <header className="flex min-w-0 items-center gap-3 border-b border-[color:var(--border)] px-3 py-3 sm:px-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-light)] text-[color:var(--accent)]"><Icon name="file" className="h-[18px] w-[18px]" /></span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-[color:var(--text)]">{name}</span>
          <a
            href={attachmentDownloadUrl(file.secure_url)}
            download={name}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 text-xs font-semibold text-white shadow-[0_8px_18px_-8px_var(--accent)] transition duration-200 hover:-translate-y-px hover:brightness-110 active:translate-y-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg-2)]"
          >
            <Icon name="download" className="h-3.5 w-3.5" />Download
          </a>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[color:var(--text-2)] transition duration-200 hover:bg-[var(--bg-3)] hover:text-[color:var(--text)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
          >
            <Icon name="close" className="h-[18px] w-[18px]" />
          </button>
        </header>
        <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-black/90 p-2 sm:p-4">
          {image
            ? <img src={file.secure_url} alt={name} className="max-h-[calc(92dvh-90px)] max-w-full rounded-lg object-contain" />
            : pdf
              ? <iframe title={name} src={file.secure_url} className="h-[78dvh] w-full max-w-4xl rounded-xl bg-white" />
              : <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl bg-[var(--bg-2)] p-8 text-center text-[color:var(--text)]"><Icon name="file" className="h-12 w-12 text-[color:var(--accent)]" /><h2 className="break-all font-semibold">{name}</h2><p className="text-sm text-[color:var(--text-3)]">This design file needs a compatible app to open. Download it to view or edit.</p></div>}
        </div>
      </section>
    </div>
  );
}
