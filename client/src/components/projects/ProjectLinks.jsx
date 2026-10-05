import { memo } from 'react';

/* -------------------------------------------------------------------------- */
/* URL helper (shared by ProjectForm)                                         */
/* -------------------------------------------------------------------------- */

// "" -> { url: '' } (empty is fine, link is optional)
// "docs.google.com/x" -> { url: 'https://docs.google.com/x' }
// "javascript:alert(1)" / "foo" -> { error }
export function normalizeUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { url: '' };
  if (raw.length > 2000) return { error: 'That link is too long.' };

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) {
      return { error: 'Enter a valid link, e.g. https://…' };
    }
    return { url: u.href };
  } catch {
    return { error: 'Enter a valid link, e.g. https://…' };
  }
}

const isSafe = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);

/* -------------------------------------------------------------------------- */
/* Icons                                                                      */
/* -------------------------------------------------------------------------- */

const Svg = ({ children }) => (
  <svg
    width="13"
    height="13"
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

const MilanoteIcon = () => (
  <Svg>
    <rect x="3" y="3" width="8" height="10" rx="1.5" />
    <rect x="13" y="3" width="8" height="6" rx="1.5" />
    <rect x="13" y="11" width="8" height="10" rx="1.5" />
    <rect x="3" y="15" width="8" height="6" rx="1.5" />
  </Svg>
);

const DocsIcon = () => (
  <Svg>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Svg>
);

export const PROJECT_LINKS = [
  { key: 'milanote_url', label: 'Milanote', Icon: MilanoteIcon },
  { key: 'docs_url', label: 'Docs', Icon: DocsIcon },
];

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

const CHIP =
  'inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-3,var(--bg-2))] font-medium text-[color:var(--text-2)] no-underline ' +
  'transition-[border-color,color,background-color,transform] duration-150 motion-reduce:transition-none ' +
  'hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] active:scale-[0.97] ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)] ' +
  // Phones: at least a 40px tap target. No effect above 640px.
  'max-[640px]:min-h-10';

const SIZES = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1.5 text-[13px]',
};

// Renders a button for every link the project has. Nothing if it has none.
// `relative z-[1]` keeps the buttons above the project card's full-card link overlay,
// so clicking one opens the link instead of navigating to the project.
const ProjectLinks = memo(function ProjectLinks({ project, size = 'sm', className = '' }) {
  const items = PROJECT_LINKS.filter((l) => isSafe(project?.[l.key]));
  if (items.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Project links"
      className={`relative z-[1] flex flex-wrap items-center gap-1.5 ${className}`}
    >
      {items.map(({ key, label, Icon }) => (
        <a
          key={key}
          href={project[key]}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${label} for ${project.name} (opens in a new tab)`}
          className={`${CHIP} ${SIZES[size] || SIZES.sm}`}
        >
          <Icon />
          {label}
        </a>
      ))}
    </div>
  );
});

export default ProjectLinks;