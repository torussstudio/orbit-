import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../api/client";

/*
 * GitHub-style daily task-activity heatmap for one member: 53 weeks (Monday to
 * Saturday rows, Sunday is the office day off), one square per IST day, five
 * levels from the member's own counts.
 * Data: GET /dashboard/members/:id/activity-heatmap.
 *
 * Activity = what the member did on tasks: task actions (create, stage
 * change, ...) and task comments.
 */

const WEEKS = 53;
const DAY_MS = 86400000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ROW_LABELS = { 0: "Mon", 2: "Wed", 4: "Fri" };

// Streak milestones. Keep in step with MILESTONES in server/utils/streakMilestones.js.
const MILESTONES = [5, 10, 25, 50, 100, 150, 200, 250, 300];
const CELEBRATE_KEY = "orbit:streak-celebrated";
const CELEBRATE_MS = 9000;

// The biggest milestone a streak has reached (0 = none yet), and the next one.
export const milestoneFor = (n) => MILESTONES.reduce((best, m) => (n >= m ? m : best), 0);
export const nextMilestone = (n) => MILESTONES.find((m) => m > n) || null;

const readCelebrated = (memberId) => {
  try {
    return window.localStorage.getItem(`${CELEBRATE_KEY}:${memberId}`);
  } catch {
    return null;
  }
};
const writeCelebrated = (memberId, value) => {
  try {
    window.localStorage.setItem(`${CELEBRATE_KEY}:${memberId}`, value);
  } catch {
    /* private mode: the celebration may show again, harmless */
  }
};

// Level 0 is an empty day; 1-4 mix in more of the accent colour.
const LEVEL_BG = [
  "var(--bg-3)",
  "color-mix(in srgb, var(--accent) 28%, var(--bg-3))",
  "color-mix(in srgb, var(--accent) 50%, var(--bg-3))",
  "color-mix(in srgb, var(--accent) 75%, var(--bg-3))",
  "var(--accent)",
];

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const parseDay = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);
const isAbort = (e) =>
  e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || e?.name === "AbortError";

function pickLevel(count, q) {
  if (!count) return 0;
  if (count <= q[0]) return 1;
  if (count <= q[1]) return 2;
  if (count <= q[2]) return 3;
  return 4;
}

// Quartiles of the non-zero days, so one very busy day doesn't wash out the rest.
function quartiles(counts) {
  const nz = counts.filter((n) => n > 0).sort((a, b) => a - b);
  if (!nz.length) return [1, 2, 3];
  const at = (p) => nz[Math.floor((nz.length - 1) * p)];
  return [at(0.25), at(0.5), at(0.75)];
}

function buildGrid(today, days) {
  const byDay = new Map(days.map((d) => [d.day, d.count]));
  const todayMs = parseDay(today);
  const dow = (new Date(todayMs).getUTCDay() + 6) % 7; // Monday = 0
  const firstMs = todayMs - dow * DAY_MS - (WEEKS - 1) * 7 * DAY_MS;
  const q = quartiles(days.map((d) => d.count));

  const cells = [];
  const monthLabels = [];
  let prevMonth = -1;

  for (let w = 0; w < WEEKS; w += 1) {
    const monday = firstMs + w * 7 * DAY_MS;
    const month = new Date(monday).getUTCMonth();
    if (month !== prevMonth) monthLabels.push({ w, label: MONTHS[month] });
    prevMonth = month;

    for (let d = 0; d < 6; d += 1) { // Mon..Sat, no Sunday row
      const ms = monday + d * DAY_MS;
      if (ms > todayMs) continue;
      const key = toIso(ms);
      const count = byDay.get(key) || 0;
      cells.push({ key, ms, w, d, count, level: pickLevel(count, q), isToday: ms === todayMs });
    }
  }

  // Keep the labels from running into each other at the left edge.
  if (monthLabels.length > 1 && monthLabels[1].w - monthLabels[0].w < 3) monthLabels.shift();

  return { cells, monthLabels };
}

/*
 * Streaks count working days only: Sunday is the office day off, so it never
 * breaks a streak and never adds to one. Today stays "pending" until the day
 * ends: no activity yet today doesn't reset the current streak.
 */
export function computeStreaks(today, days) {
  const byDay = new Map(days.map((d) => [d.day, d.count]));
  const todayMs = parseDay(today);
  const startMs = todayMs - (WEEKS * 7 - 1) * DAY_MS;

  let longest = 0;
  let run = 0;
  for (let ms = startMs; ms <= todayMs; ms += DAY_MS) {
    if (new Date(ms).getUTCDay() === 0) continue;
    if ((byDay.get(toIso(ms)) || 0) > 0) {
      run += 1;
      if (run > longest) longest = run;
    } else if (ms !== todayMs) {
      run = 0;
    }
  }

  let current = 0;
  let runStart = null;
  for (let ms = todayMs; ms >= startMs; ms -= DAY_MS) {
    if (new Date(ms).getUTCDay() === 0) continue;
    if ((byDay.get(toIso(ms)) || 0) > 0) {
      current += 1;
      runStart = toIso(ms);
    } else if (ms !== todayMs) break;
  }

  return { current, longest, runStart };
}

const plural = (n) => `${n} ${n === 1 ? "day" : "days"}`;

const CELEBRATE_CSS = `
@keyframes orbit-confetti { 0% { transform: translateY(-14px) rotate(0deg); opacity: 0; } 12% { opacity: 1; } 100% { transform: translateY(230px) rotate(540deg); opacity: 0; } }
@keyframes orbit-banner-in { from { transform: translateY(-6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.orbit-confetti { animation: orbit-confetti 2.8s ease-in forwards; }
.orbit-banner-in { animation: orbit-banner-in .35s ease-out both; }
@media (prefers-reduced-motion: reduce) { .orbit-confetti { display: none; } .orbit-banner-in { animation: none; } }
`;

const CONFETTI_COLORS = ["var(--accent)", "var(--accent-2)", "#f59e0b", "#10b981", "#ec4899"];

// A short burst over the card. Positions are fixed per piece, not random per render.
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${((i * 53) % 90) / 100}s`,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  size: 6 + (i % 3) * 2,
  round: i % 3 === 0,
}));

function StarIcon({ className }) {
  return (
    <svg className={className} width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6L2.5 9.5l6.6-.8L12 2.5z" />
    </svg>
  );
}

function Celebration({ milestone, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, CELEBRATE_MS);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <>
      <style>{CELEBRATE_CSS}</style>
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden="true">
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            className="orbit-confetti absolute top-0 opacity-0"
            style={{
              left: c.left,
              width: c.size,
              height: c.round ? c.size : c.size * 1.6,
              borderRadius: c.round ? "9999px" : "2px",
              background: c.color,
              animationDelay: c.delay,
            }}
          />
        ))}
      </div>
      <div
        className="orbit-banner-in mb-4 flex items-center justify-between gap-3 rounded-xl border border-[color:var(--accent)]/25 bg-[color:var(--accent-light)] px-3.5 py-2.5"
        role="status"
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--text)]">
          <StarIcon className="shrink-0 text-[color:var(--accent)]" />
          {milestone}-day streak! That is {milestone} working days in a row. Keep it going.
        </span>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 cursor-pointer border-none bg-transparent p-1 text-[color:var(--text-3)] hover:text-[color:var(--text)]"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-[color:var(--text-3)]" aria-hidden="true">
      <span>Less</span>
      {LEVEL_BG.map((bg, i) => (
        <span key={i} className="size-[11px] rounded-[3px]" style={{ background: bg }} />
      ))}
      <span>More</span>
    </div>
  );
}

const ActivityHeatmap = memo(function ActivityHeatmap({ memberId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState(null);
  const [celebrate, setCelebrate] = useState(null);
  const outerRef = useRef(null);
  const scrollRef = useRef(null);

  const load = useCallback(
    async (signal) => {
      if (memberId == null) return;
      setError(false);
      try {
        const r = await api.get(`/dashboard/members/${memberId}/activity-heatmap`, { signal });
        setData(r.data);
      } catch (e) {
        if (!isAbort(e)) setError(true);
      }
    },
    [memberId],
  );

  useEffect(() => {
    const c = new AbortController();
    load(c.signal);
    return () => c.abort();
  }, [load]);

  const grid = useMemo(() => (data ? buildGrid(data.today, data.days || []) : null), [data]);
  const streaks = useMemo(
    () => (data?.today ? computeStreaks(data.today, data.days || []) : null),
    [data],
  );

  // One-time celebration when the streak reaches a new milestone. What was
  // already celebrated is remembered on this device (run start + milestone),
  // so a reload doesn't repeat it and a new streak later celebrates again.
  useEffect(() => {
    if (!streaks || memberId == null) return;
    const milestone = milestoneFor(streaks.current);
    if (!milestone) return;
    const stamp = `${streaks.runStart}:${milestone}`;
    if (readCelebrated(memberId) === stamp) return;
    writeCelebrated(memberId, stamp);
    setCelebrate(milestone);
  }, [streaks, memberId]);

  const closeCelebration = useCallback(() => setCelebrate(null), []);

  // Start scrolled to today when the grid is wider than the card (phones).
  useEffect(() => {
    const el = scrollRef.current;
    if (el && grid) el.scrollLeft = el.scrollWidth;
  }, [grid]);

  const showTip = (e, cell) => {
    const outer = outerRef.current?.getBoundingClientRect();
    if (!outer) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(r.left - outer.left + r.width / 2, 90), outer.width - 90);
    setHover({ cell, x, y: r.top - outer.top });
  };

  const total = data?.total ?? 0;

  return (
    <section className="card relative mb-5" aria-labelledby="heatmap-heading">
      {celebrate && <Celebration milestone={celebrate} onClose={closeCelebration} />}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="heatmap-heading" className="m-0 text-[15px] font-semibold tracking-[-0.015em]">
          {data ? (
            <>
              <span className="tabular-nums">{total.toLocaleString("en-US")}</span>{" "}
              {total === 1 ? "activity" : "activities"} in the last year
            </>
          ) : (
            "Your activity"
          )}
        </h2>
        <span className="text-[11px] text-[color:var(--text-3)]">
          Task updates and comments, Monday to Saturday
        </span>
      </div>

      {error ? (
        <div className="flex items-center gap-3 py-6 text-[13px] text-[color:var(--text-2)]" role="alert">
          Could not load your activity.
          <button
            type="button"
            className="cursor-pointer border-none bg-transparent p-0 text-[13px] font-semibold text-[color:var(--accent)] hover:underline"
            onClick={() => load()}
          >
            Retry
          </button>
        </div>
      ) : !grid ? (
        <div className="h-[132px] animate-pulse rounded-xl bg-[color:var(--bg-3)]" aria-hidden="true" />
      ) : (
        <div ref={outerRef} className="relative">
          <div ref={scrollRef} className="overflow-x-auto pb-1" onScroll={() => setHover(null)}>
            <div
              className="grid min-w-[700px] gap-[3px]"
              style={{ gridTemplateColumns: `28px repeat(${WEEKS}, minmax(0, 1fr))` }}
              role="img"
              aria-label={`${total} activities in the last year. Darker squares are busier days.`}
              onMouseLeave={() => setHover(null)}
            >
              {grid.monthLabels.map((m) => (
                <span
                  key={`${m.w}-${m.label}`}
                  className="whitespace-nowrap text-[11px] leading-none text-[color:var(--text-2)]"
                  style={{ gridColumn: m.w + 2, gridRow: 1 }}
                >
                  {m.label}
                </span>
              ))}

              {Object.entries(ROW_LABELS).map(([d, label]) => (
                <span
                  key={label}
                  className="flex items-center text-[11px] leading-none text-[color:var(--text-2)]"
                  style={{ gridColumn: 1, gridRow: Number(d) + 2 }}
                >
                  {label}
                </span>
              ))}

              {grid.cells.map((c) => (
                <span
                  key={c.key}
                  data-bar="cell"
                  className="aspect-square w-full rounded-[3px] outline-offset-0"
                  style={{
                    gridColumn: c.w + 2,
                    gridRow: c.d + 2,
                    background: LEVEL_BG[c.level],
                    outline: c.isToday ? "1.5px solid var(--text-3)" : undefined,
                  }}
                  onMouseEnter={(e) => showTip(e, c)}
                />
              ))}
            </div>
          </div>

          {hover && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-[color:var(--text)] px-2 py-1 text-[11px] text-[color:var(--bg-2)] shadow-lg"
              style={{ left: hover.x, top: hover.y - 6 }}
              role="tooltip"
            >
              <b className="font-semibold">
                {hover.cell.count === 0
                  ? "No activity"
                  : `${hover.cell.count} ${hover.cell.count === 1 ? "activity" : "activities"}`}
              </b>{" "}
              on {DAY_FORMAT.format(hover.cell.ms)}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            {streaks && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-[color:var(--text-2)]">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>
                    Current streak{" "}
                    <b className="font-semibold tabular-nums text-[color:var(--text)]">{plural(streaks.current)}</b>
                  </span>
                  {milestoneFor(streaks.current) > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--accent-light)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--accent)]">
                      <StarIcon />
                      {milestoneFor(streaks.current)}-day streak
                    </span>
                  )}
                  {nextMilestone(streaks.current) && (
                    <span className="text-[11px] text-[color:var(--text-3)]">
                      Next badge at {nextMilestone(streaks.current)} days
                    </span>
                  )}
                </span>
                <span>
                  Longest streak{" "}
                  <b className="font-semibold tabular-nums text-[color:var(--text)]">{plural(streaks.longest)}</b>
                </span>
              </div>
            )}
            <Legend />
          </div>
        </div>
      )}
    </section>
  );
});

export default ActivityHeatmap;
