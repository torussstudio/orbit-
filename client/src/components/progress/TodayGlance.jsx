import { memo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { computeStreaks, milestoneFor, nextMilestone } from "./ActivityHeatmap";

const isAbort = (e) =>
  e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || e?.name === "AbortError";

function fmt(minutes) {
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

const TILE = "rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-2)] p-4";
const LABEL = "text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--text-3)]";

/**
 * Two compact tiles for the dashboard hero row: time logged today and the
 * current work streak. Reads the same endpoints as TimeLogCard / ActivityHeatmap.
 */
const TodayGlance = memo(function TodayGlance({ memberId }) {
  const [time, setTime] = useState(null);
  const [heat, setHeat] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!memberId) return undefined;
    const c = new AbortController();
    setFailed(false);
    api
      .get(`/dashboard/members/${memberId}/time-summary`, { signal: c.signal })
      .then((r) => setTime(r.data))
      .catch((e) => !isAbort(e) && setFailed(true));
    api
      .get(`/dashboard/members/${memberId}/activity-heatmap`, { signal: c.signal })
      .then((r) => setHeat(r.data))
      .catch((e) => !isAbort(e) && setFailed(true));
    return () => c.abort();
  }, [memberId]);

  const todayMinutes = time
    ? Number(time.days?.find((d) => d.day === time.today)?.minutes || 0)
    : null;
  const streak = heat ? computeStreaks(heat.today, heat.days) : null;
  const badge = streak ? milestoneFor(streak.current) : 0;
  const next = streak ? nextMilestone(streak.current) : null;

  return (
    <>
      <div className={TILE}>
        <div className={LABEL}>Time today</div>
        <div className="mt-2 text-[26px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-[color:var(--text)]">
          {todayMinutes === null ? (failed ? "–" : "…") : todayMinutes > 0 ? fmt(todayMinutes) : "0m"}
        </div>
        <Link
          to="/time-log"
          className="mt-2.5 inline-block text-xs font-semibold text-[color:var(--accent)] no-underline hover:underline"
        >
          {todayMinutes > 0 ? "Open time log →" : "Log your time →"}
        </Link>
      </div>

      <div className={TILE}>
        <div className={LABEL}>Work streak</div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-[26px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-[color:var(--text)]">
            {streak ? streak.current : failed ? "–" : "…"}
          </span>
          <span className="text-xs text-[color:var(--text-3)]">
            {streak?.current === 1 ? "day" : "days"}
          </span>
          {badge > 0 && (
            <span className="ml-auto rounded-full bg-[color:var(--accent-light)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--accent)]">
              ★ {badge}
            </span>
          )}
        </div>
        <div className="mt-2.5 text-xs text-[color:var(--text-3)]">
          {streak
            ? next
              ? `Best ${streak.longest} · next badge at ${next} days`
              : `Best ${streak.longest} days`
            : "Task updates and comments"}
        </div>
      </div>
    </>
  );
});

export default TodayGlance;
