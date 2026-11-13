import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";

/*
 * Member dashboard: time logged.
 *   - Three stat tiles (Today, This week, This month), each with a sparkline.
 *   - "Hours per day" bars: this week (Mon to Sat) or the last 4 weeks.
 * Data: GET /dashboard/members/:id/time-summary, the member's own time
 * entries for the last 42 days, summed per IST day. Weeks run Monday to
 * Saturday (Sunday is the office day off; it only shows if time was logged).
 */

const DAY_MS = 86400000;
const WEEKS_SHOWN = 4;
const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const WEEK_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const parseDay = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);
const mondayIndex = (ms) => (new Date(ms).getUTCDay() + 6) % 7; // Monday = 0
const isAbort = (e) =>
  e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || e?.name === "AbortError";

function fmt(minutes) {
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

const hoursLabel = (h) => `${Number.isInteger(h) ? h : h.toFixed(1)}h`;

function buildStats(today, days) {
  const byDay = new Map(days.map((d) => [d.day, d.minutes]));
  const mins = (ms) => byDay.get(toIso(ms)) || 0;
  const todayMs = parseDay(today);
  const monday = todayMs - mondayIndex(todayMs) * DAY_MS;

  const weekTotal = (mon) => {
    let sum = 0;
    for (let i = 0; i < 7; i += 1) {
      const ms = mon + i * DAY_MS;
      if (ms <= todayMs) sum += mins(ms);
    }
    return sum;
  };

  // The last working day before today (skips Sunday).
  let prev = todayMs - DAY_MS;
  if (new Date(prev).getUTCDay() === 0) prev -= DAY_MS;

  const d = new Date(todayMs);
  const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  let monthTotal = 0;
  let monthDaysLogged = 0;
  const monthDaily = [];
  for (let ms = monthStart; ms <= todayMs; ms += DAY_MS) {
    if (new Date(ms).getUTCDay() === 0 && mins(ms) === 0) continue;
    const v = mins(ms);
    monthTotal += v;
    if (v > 0) monthDaysLogged += 1;
    monthDaily.push(v);
  }

  // Sparklines: last 7 working days, last 5 weeks, this month day by day.
  const dailySpark = [];
  for (let ms = todayMs; dailySpark.length < 7; ms -= DAY_MS) {
    if (new Date(ms).getUTCDay() === 0 && mins(ms) === 0) continue;
    dailySpark.unshift(mins(ms));
  }
  const weeklySpark = [];
  for (let w = 4; w >= 0; w -= 1) weeklySpark.push(weekTotal(monday - w * 7 * DAY_MS));

  return {
    mins,
    todayMs,
    monday,
    today: mins(todayMs),
    yesterday: mins(prev),
    week: weekTotal(monday),
    lastWeek: weekTotal(monday - 7 * DAY_MS),
    monthTotal,
    monthDaysLogged,
    dailySpark,
    weeklySpark,
    monthSpark: monthDaily,
    anyLogged: days.some((x) => x.minutes > 0),
  };
}

function Sparkline({ values }) {
  const W = 100;
  const H = 28;
  const max = Math.max(...values, 1);
  const n = values.length;
  const pts = values.map((v, i) => ({
    x: n === 1 ? W / 2 : (i / (n - 1)) * W,
    y: H - 3 - (v / max) * (H - 8),
  }));
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <div className="relative mt-2 h-7 w-full" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none">
        <polyline
          points={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {last && (
        <span
          className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--accent)]"
          style={{ left: `${last.x}%`, top: `${(last.y / H) * 100}%` }}
        />
      )}
    </div>
  );
}

function Tile({ label, value, sub, spark }) {
  return (
    <div className="min-w-0 rounded-xl bg-[color:var(--bg-3)] px-3.5 py-3">
      <div className="text-[12px] text-[color:var(--text-2)]">{label}</div>
      <div className="mt-0.5 text-[22px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-[color:var(--text)]">
        {value}
      </div>
      <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-3)]">{sub}</div>
      <Sparkline values={spark} />
    </div>
  );
}

function ModeToggle({ mode, onChange }) {
  const opts = [
    ["week", "This week"],
    ["month", "Last 4 weeks"],
  ];
  return (
    <div className="inline-flex rounded-lg bg-[color:var(--bg-3)] p-0.5" role="group" aria-label="Chart range">
      {opts.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={mode === key}
          className={`cursor-pointer rounded-md border-none px-2.5 py-1 text-[12px] font-medium transition-colors ${
            mode === key
              ? "bg-[color:var(--bg-2)] text-[color:var(--text)] shadow-sm"
              : "bg-transparent text-[color:var(--text-2)] hover:text-[color:var(--text)]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Columns for the bar chart. A column is one day; `future` days stay empty.
function buildColumns(stats, mode) {
  const weeks = mode === "week" ? 1 : WEEKS_SHOWN;
  const firstMonday = stats.monday - (weeks - 1) * 7 * DAY_MS;
  const groups = [];
  for (let w = 0; w < weeks; w += 1) {
    const mon = firstMonday + w * 7 * DAY_MS;
    const sundayLogged = stats.mins(mon + 6 * DAY_MS) > 0;
    const cols = [];
    for (let i = 0; i < (sundayLogged ? 7 : 6); i += 1) {
      const ms = mon + i * DAY_MS;
      cols.push({
        ms,
        i,
        minutes: stats.mins(ms),
        future: ms > stats.todayMs,
        isToday: ms === stats.todayMs,
      });
    }
    groups.push({ mon, cols });
  }
  return groups;
}

const TimeLogCard = memo(function TimeLogCard({ memberId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState("week");
  const [hover, setHover] = useState(null);

  const load = useCallback(
    async (signal) => {
      if (memberId == null) return;
      setError(false);
      try {
        const r = await api.get(`/dashboard/members/${memberId}/time-summary`, { signal });
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

  const stats = useMemo(() => (data?.today ? buildStats(data.today, data.days || []) : null), [data]);
  const groups = useMemo(() => (stats ? buildColumns(stats, mode) : []), [stats, mode]);

  const maxMinutes = useMemo(
    () => Math.max(60, ...groups.flatMap((g) => g.cols.map((c) => c.minutes))),
    [groups],
  );
  const maxHours = Math.max(1, Math.ceil(maxMinutes / 60));
  const ticks = [0, maxHours / 2, maxHours];

  const showTip = (e, col) => {
    const wrap = e.currentTarget.closest("[data-chart]");
    if (!wrap) return;
    const w = wrap.getBoundingClientRect();
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(r.left - w.left + r.width / 2, 80), w.width - 80);
    setHover({ col, x, y: r.top - w.top });
  };

  return (
    <section className="card mb-5" aria-labelledby="timelog-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="timelog-heading" className="m-0 text-[15px] font-semibold tracking-[-0.015em]">
          Time logged
        </h2>
        <Link to="/time-log" className="text-[12px] font-semibold text-[color:var(--accent)] no-underline hover:underline">
          Open Time Log
        </Link>
      </div>

      {error ? (
        <div className="flex items-center gap-3 py-6 text-[13px] text-[color:var(--text-2)]" role="alert">
          Could not load your time log.
          <button
            type="button"
            className="cursor-pointer border-none bg-transparent p-0 text-[13px] font-semibold text-[color:var(--accent)] hover:underline"
            onClick={() => load()}
          >
            Retry
          </button>
        </div>
      ) : !stats ? (
        <div className="h-[260px] animate-pulse rounded-xl bg-[color:var(--bg-3)]" aria-hidden="true" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile
              label="Today"
              value={fmt(stats.today)}
              sub={`Previous working day ${fmt(stats.yesterday)}`}
              spark={stats.dailySpark}
            />
            <Tile
              label="This week"
              value={fmt(stats.week)}
              sub={`Last week ${fmt(stats.lastWeek)}`}
              spark={stats.weeklySpark}
            />
            <Tile
              label="This month"
              value={fmt(stats.monthTotal)}
              sub={`${stats.monthDaysLogged} ${stats.monthDaysLogged === 1 ? "day" : "days"} logged`}
              spark={stats.monthSpark.length ? stats.monthSpark : [0]}
            />
          </div>

          <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-3">
            <h3 className="m-0 text-[13px] font-semibold text-[color:var(--text)]">Hours per day</h3>
            <ModeToggle mode={mode} onChange={(m) => { setMode(m); setHover(null); }} />
          </div>

          {!stats.anyLogged ? (
            <div className="rounded-xl bg-[color:var(--bg-3)] px-4 py-6 text-center text-[13px] text-[color:var(--text-2)]">
              No time logged in the last 6 weeks.{" "}
              <Link to="/time-log" className="font-semibold text-[color:var(--accent)] no-underline hover:underline">
                Log your time
              </Link>
            </div>
          ) : (
            <div data-chart className="relative" onMouseLeave={() => setHover(null)}>
              <div className="flex gap-2">
                {/* y axis */}
                <div className="relative h-[150px] w-9 shrink-0 text-[11px] text-[color:var(--text-3)]" aria-hidden="true">
                  {ticks.map((t) => (
                    <span
                      key={t}
                      className="absolute right-0 -translate-y-1/2 tabular-nums"
                      style={{ bottom: `${(t / maxHours) * 100}%`, transform: `translateY(${t === 0 ? "50%" : "50%"})` }}
                    >
                      {hoursLabel(t)}
                    </span>
                  ))}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="relative h-[150px]">
                    {ticks.map((t) => (
                      <div
                        key={t}
                        className="absolute inset-x-0 border-t border-[color:var(--border)]"
                        style={{ bottom: `${(t / maxHours) * 100}%` }}
                        aria-hidden="true"
                      />
                    ))}
                    <div className="absolute inset-0 flex items-end gap-3 sm:gap-5" role="img" aria-label={`Hours logged per day, ${mode === "week" ? "this week" : "last 4 weeks"}`}>
                      {groups.map((g) => (
                        <div key={g.mon} className="flex h-full min-w-0 flex-1 items-end gap-[3px] sm:gap-1.5">
                          {g.cols.map((c) => {
                            const pct = (c.minutes / 60 / maxHours) * 100;
                            return (
                              <div
                                key={c.ms}
                                className="flex h-full min-w-0 flex-1 items-end"
                                onMouseEnter={(e) => !c.future && showTip(e, c)}
                              >
                                {!c.future && (
                                  <span
                                    data-bar="y"
                                    className="block w-full rounded-t-[4px]"
                                    style={{
                                      height: c.minutes ? `max(${pct}%, 3px)` : "2px",
                                      background: c.minutes
                                        ? c.isToday
                                          ? "var(--accent)"
                                          : "color-mix(in srgb, var(--accent) 60%, var(--bg-3))"
                                        : "var(--border-strong, var(--border))",
                                    }}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* x axis */}
                  <div className="mt-1.5 flex gap-3 sm:gap-5" aria-hidden="true">
                    {groups.map((g) => (
                      <div key={g.mon} className="min-w-0 flex-1">
                        <div className="flex gap-[3px] sm:gap-1.5">
                          {g.cols.map((c) => (
                            <span
                              key={c.ms}
                              className={`min-w-0 flex-1 text-center text-[11px] ${
                                mode === "month" ? "max-sm:invisible" : ""
                              } ${c.isToday ? "font-semibold text-[color:var(--text)]" : "text-[color:var(--text-3)]"}`}
                            >
                              {mode === "week" ? DAY_NAMES[c.i] : DAY_INITIALS[c.i]}
                            </span>
                          ))}
                        </div>
                        {mode === "month" && (
                          <div className="mt-1 text-center text-[11px] text-[color:var(--text-3)]">
                            {WEEK_FORMAT.format(g.mon)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {hover && (
                <div
                  className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-[color:var(--text)] px-2 py-1 text-[11px] text-[color:var(--bg-2)] shadow-lg"
                  style={{ left: hover.x + 44, top: hover.y - 6 }}
                  role="tooltip"
                >
                  <b className="font-semibold">{hover.col.minutes ? fmt(hover.col.minutes) : "Nothing logged"}</b>{" "}
                  on {DAY_FORMAT.format(hover.col.ms)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
});

export default TimeLogCard;
