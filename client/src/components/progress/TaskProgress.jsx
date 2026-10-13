import { memo } from "react";

/*
 * Task progress pieces shared by the member dashboard ("My Task Progress")
 * and the admin Members page ("Task progress").
 *
 * A progress object (from dashboardService.summarizeTaskProgress) looks like:
 *   { done, review, in_progress, todo, rework, overdue, due_today }
 * Open tasks sit in their stage; Done counts tasks approved in the period.
 * Overdue and due_today are open tasks already counted in their stage.
 *
 * Colours come from --tp-* in index.css (checked for colour-blind separation).
 */

const cx = (...parts) => parts.filter(Boolean).join(" ");

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]";

export const TP_STAGES = [
  { key: "done", label: "Done", color: "var(--tp-done)" },
  { key: "review", label: "In Review", color: "var(--tp-review)" },
  { key: "in_progress", label: "In Progress", color: "var(--tp-progress)" },
  { key: "todo", label: "Todo", color: "var(--tp-todo)" },
  { key: "rework", label: "Rework", color: "var(--tp-rework)" },
];

export const progressTotal = (p) => TP_STAGES.reduce((sum, s) => sum + (Number(p?.[s.key]) || 0), 0);

export const progressPct = (p) => {
  const total = progressTotal(p);
  return total ? Math.round(((Number(p?.done) || 0) / total) * 100) : 0;
};

const plural = (n, one, many) => (n === 1 ? one : many);
export { plural };

const ICONS = {
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3",
  alert: "M12 9v4M12 17h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z",
  loop: "M3 12a9 9 0 0 1 15.3-6.4L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.3 6.4L3 16M3 21v-5h5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  star: "m12 3 2.6 5.3 5.9.9-4.3 4.2 1 5.8L12 16.4l-5.2 2.8 1-5.8-4.2-4.2 5.9-.9z",
  calendar: "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2ZM8 2v4M16 2v4M3 10h18",
  dot: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v6M12 16.5h.01",
  team: "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8",
};

export function TpIcon({ name, size = 16, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cx("shrink-0", className)}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

const TONES = {
  ok: "bg-[color:color-mix(in_srgb,var(--success)_12%,transparent)] text-[color:color-mix(in_srgb,var(--success)_75%,var(--text))]",
  bad: "bg-[color:color-mix(in_srgb,var(--danger)_11%,transparent)] text-[color:color-mix(in_srgb,var(--danger)_80%,var(--text))]",
  warn: "bg-[color:color-mix(in_srgb,var(--warning)_14%,transparent)] text-[color:color-mix(in_srgb,var(--warning)_55%,var(--text))]",
  info: "bg-[color:color-mix(in_srgb,var(--accent-2)_13%,transparent)] text-[color:color-mix(in_srgb,var(--accent-2)_75%,var(--text))]",
};

/* Week / Month switch */
export const PeriodToggle = memo(function PeriodToggle({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg bg-[color:var(--bg-3)] p-0.5" role="group" aria-label="Period">
      {["week", "month"].map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={cx(
            "cursor-pointer rounded-md border-0 px-2.5 py-1 text-xs font-semibold capitalize transition-colors duration-150 motion-reduce:transition-none max-[640px]:min-h-9",
            FOCUS,
            value === k
              ? "bg-[color:var(--bg-2)] text-[color:var(--text)] shadow-sm"
              : "bg-transparent text-[color:var(--text-3)] hover:text-[color:var(--text)]",
          )}
        >
          {k}
        </button>
      ))}
    </div>
  );
});

/* Due today / overdue / to review chips */
export function ProgressChips({ p, showReview = false }) {
  const chip = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold";
  return (
    <div className="flex flex-wrap gap-2">
      {p.due_today ? (
        <span className={cx(chip, "bg-[color:color-mix(in_srgb,var(--warning)_14%,transparent)] text-[color:color-mix(in_srgb,var(--warning)_55%,var(--text))]")}>
          <TpIcon name="calendar" size={14} />
          {p.due_today} due today
        </span>
      ) : (
        <span className={cx(chip, "bg-[color:var(--bg-3)] text-[color:var(--text-3)]")}>
          <TpIcon name="calendar" size={14} />
          Nothing due today
        </span>
      )}
      {p.overdue > 0 && (
        <span className={cx(chip, "bg-[color:color-mix(in_srgb,var(--danger)_11%,transparent)] text-[color:var(--danger)]")}>
          <TpIcon name="dot" size={14} />
          {p.overdue} overdue
        </span>
      )}
      {showReview && p.review > 0 && (
        <span className={cx(chip, "bg-[color:color-mix(in_srgb,var(--accent-2)_13%,transparent)] text-[color:color-mix(in_srgb,var(--accent-2)_75%,var(--text))]")}>
          <TpIcon name="clock" size={14} />
          {p.review} to review
        </span>
      )}
    </div>
  );
}

/* Big donut with "done / total" in the middle */
export function ProgressDonut({ p, active, onActive, size = 170 }) {
  const total = progressTotal(p);
  const R = 66;
  const C = 2 * Math.PI * R;
  const gap = total > 1 ? 3 : 0;
  let offset = 0;
  const arcs = TP_STAGES.filter((s) => p[s.key] > 0).map((s) => {
    const len = (p[s.key] / total) * C;
    const shown = Math.max(len - gap, 1);
    const arc = { ...s, value: p[s.key], dash: `${shown} ${C - shown}`, offset: -offset };
    offset += len;
    return arc;
  });

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} onMouseLeave={() => onActive?.(null)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 170 170"
        className="block -rotate-90"
        role="img"
        aria-label={`${p.done} of ${total} tasks done`}
      >
        <circle cx="85" cy="85" r={R} fill="none" stroke="var(--bg-4)" strokeWidth="18" />
        {arcs.map((a) => (
          <circle
            key={a.key}
            cx="85"
            cy="85"
            r={R}
            fill="none"
            stroke={a.color}
            strokeWidth={active === a.key ? 22 : 18}
            strokeDasharray={a.dash}
            strokeDashoffset={a.offset}
            opacity={active && active !== a.key ? 0.35 : 1}
            onMouseEnter={() => onActive?.(a.key)}
            className="cursor-pointer transition-[stroke-width,opacity] duration-150 motion-reduce:transition-none"
          >
            <title>{`${a.label}: ${a.value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular-nums text-[color:var(--text)]">
            {p.done}
            <span className="text-lg font-bold tracking-normal text-[color:var(--text-3)]"> / {total}</span>
          </div>
          <div className="mt-1.5 text-xs text-[color:var(--text-2)]">tasks done · {progressPct(p)}%</div>
        </div>
      </div>
    </div>
  );
}

/* Stage list with counts and %, plus the separate Overdue row */
export function ProgressLegend({ p, active, onActive }) {
  const total = progressTotal(p);
  const open = total - p.done;
  return (
    <ul className="m-0 grid w-full list-none gap-1 p-0" onMouseLeave={() => onActive?.(null)}>
      {TP_STAGES.map((s) => {
        const v = p[s.key] || 0;
        return (
          <li
            key={s.key}
            onMouseEnter={() => onActive?.(s.key)}
            className={cx(
              "grid grid-cols-[12px_minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-150 motion-reduce:transition-none",
              active === s.key && "bg-[color:var(--bg-3)]",
            )}
          >
            <span className="size-[11px] rounded-full" style={{ background: s.color }} aria-hidden="true" />
            <span className="text-[13.5px] text-[color:var(--text)]">{s.label}</span>
            <span className="text-xs tabular-nums text-[color:var(--text-3)]">
              {v} {plural(v, "task", "tasks")}
            </span>
            <span className="min-w-9 text-right text-[13.5px] font-semibold tabular-nums text-[color:var(--text)]">
              {total ? Math.round((v / total) * 100) : 0}%
            </span>
          </li>
        );
      })}
      <li
        className="mt-1.5 grid grid-cols-[12px_minmax(0,1fr)_auto_auto] items-center gap-2.5 border-t border-dashed border-[color:var(--border)] px-2 pb-1.5 pt-2.5"
        title="Overdue tasks are already counted in their stage above"
      >
        <TpIcon name="dot" size={12} className="text-[color:var(--danger)]" />
        <span className="text-[13.5px] font-semibold text-[color:var(--danger)]">Overdue</span>
        <span className="text-xs tabular-nums text-[color:var(--text-3)]">
          {p.overdue} {plural(p.overdue, "task", "tasks")}
        </span>
        <span className="text-right text-[11px] font-semibold tabular-nums text-[color:var(--danger)]">
          {open ? Math.round((p.overdue / open) * 100) : 0}% of open
        </span>
      </li>
    </ul>
  );
}

/* Coloured message strip under the donut */
export function ProgressNote({ tone, icon, title, text, stacked = false }) {
  if (stacked) {
    // Tall version for when the note sits beside the donut and legend.
    return (
      <div className={cx("flex h-full flex-col justify-center gap-2.5 rounded-xl p-4", TONES[tone])} role="status">
        <TpIcon name={icon} size={26} />
        <div className="text-[15px] font-semibold leading-snug [text-wrap:balance]">{title}</div>
        <div className="text-[12.5px] leading-relaxed opacity-90 [text-wrap:pretty]">{text}</div>
      </div>
    );
  }
  return (
    <div className={cx("grid grid-cols-[30px_minmax(0,1fr)] items-center gap-3 rounded-xl px-3.5 py-3", TONES[tone])} role="status">
      <TpIcon name={icon} size={24} />
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[12.5px] opacity-90">{text}</div>
      </div>
    </div>
  );
}

/* Small ring for lists and table cells */
export function MiniRing({ p, size = 40, children }) {
  const total = progressTotal(p);
  const r = 16;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 40 40" className="block -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--bg-4)" strokeWidth="4" />
        {total > 0 &&
          TP_STAGES.filter((s) => p[s.key] > 0).map((s) => {
            const len = (p[s.key] / total) * c;
            const el = (
              <circle
                key={s.key}
                cx="20"
                cy="20"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="4"
                strokeDasharray={`${Math.max(len - 1.2, 0.5)} ${c}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      {children && <span className="absolute inset-0 grid place-items-center text-xs font-bold">{children}</span>}
    </span>
  );
}
