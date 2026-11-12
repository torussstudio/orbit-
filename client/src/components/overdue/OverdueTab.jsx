import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import Modal from '../ui/Modal';
import { TASK_AND_PROJECT_EVENTS, useLiveRefetch } from '../../hooks/useLiveEvents';

/*
 * Member Activity -> Overdue (managers only).
 *
 * Every overdue task with the reason its assignee gave, and what to do about
 * it: accept the reason, extend the due date, give it to someone else, or ask
 * for more detail. Updates live: no refresh needed.
 */

const IST = 'Asia/Kolkata';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const cx = (...parts) => parts.filter(Boolean).join(' ');
const toast = (type, message) =>
  window.dispatchEvent(new CustomEvent('orbit:toast', { detail: { type, message } }));
const isAbort = (e) => e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';

const istToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const formatDay = (ymd) =>
  DATE_RE.test(ymd || '')
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' }).format(new Date(`${ymd}T00:00:00Z`))
    : '';

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]';
const SURFACE =
  'rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-2)] shadow-[0_1px_1px_rgba(30,32,71,0.03),0_16px_40px_-28px_rgba(30,32,71,0.22)]';
const NUM = 'tabular-nums [font-feature-settings:"tnum","cv11"]';
const LABEL = 'text-[11px] font-medium uppercase tracking-[0.06em] text-[color:var(--text-3)]';
const INPUT =
  'h-9 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-2)] px-3 text-[13px] text-[color:var(--text)] transition-[border-color,box-shadow] duration-200 placeholder:text-[color:var(--text-3)] hover:border-[color:var(--border-bright)] focus-visible:border-[color:var(--accent)] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)] focus-visible:outline-none';
const BTN =
  'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-medium no-underline transition-[background-color,color,border-color,opacity] duration-200 disabled:cursor-not-allowed disabled:opacity-50';
const QUIET_BTN = `${BTN} border-[color:var(--border)] bg-[color:var(--bg-2)] text-[color:var(--text-2)] hover:border-[color:var(--border-bright)] hover:bg-[color:var(--bg-3)] hover:text-[color:var(--text)] ${FOCUS}`;
const DARK_BTN = `${BTN} border-[color:var(--text)] bg-[color:var(--text)] text-[color:var(--bg-2)] hover:opacity-90 ${FOCUS}`;
const SKELETON = 'animate-pulse rounded-md bg-[color:var(--bg-4)] motion-reduce:animate-none';

// external = outside the team's control, team = inside it.
const KIND = {
  external: { dot: 'bg-sky-500', chip: 'bg-sky-500/10 text-sky-600', bar: 'bg-sky-500' },
  team: { dot: 'bg-amber-500', chip: 'bg-amber-500/10 text-amber-600', bar: 'bg-amber-500' },
  other: { dot: 'bg-slate-400', chip: 'bg-[color:var(--bg-3)] text-[color:var(--text-2)]', bar: 'bg-slate-400' },
};

const DECISION_LABEL = {
  acknowledged: 'Accepted',
  extend: 'Date extended',
  reassign: 'Reassigned',
  ask_again: 'Waiting for more detail',
};

/* ------------------------------------------------------------------ */
/* Data: one fetch, shared by the tab badge and the tab itself           */
/* ------------------------------------------------------------------ */

export function useOverdueData() {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [reload, setReload] = useState(0);
  const silentRef = useRef(false);

  const retry = useCallback(() => {
    silentRef.current = false;
    setReload((n) => n + 1);
  }, []);
  const refreshSilently = useCallback(() => {
    silentRef.current = true;
    setReload((n) => n + 1);
  }, []);
  useLiveRefetch(TASK_AND_PROJECT_EVENTS, refreshSilently);

  useEffect(() => {
    const c = new AbortController();
    const silent = silentRef.current;
    silentRef.current = false;
    if (!silent) setState((s) => ({ ...s, loading: true, error: '' }));
    api
      .get('/overdue-reasons', { signal: c.signal })
      .then((res) => {
        if (c.signal.aborted) return;
        setState({ loading: false, error: '', data: res.data });
      })
      .catch((e) => {
        if (isAbort(e) || c.signal.aborted || silent) return;
        setState({ loading: false, error: e?.response?.data?.error || 'Could not load overdue tasks.', data: null });
      });
    return () => c.abort();
  }, [reload]);

  return { ...state, retry, refresh: refreshSilently };
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                         */
/* ------------------------------------------------------------------ */

function Avatar({ name, url, size = 28 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (url) return <img src={url} alt="" style={style} className="shrink-0 rounded-full object-cover" />;
  return (
    <span
      aria-hidden="true"
      style={style}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--bg-3))] font-semibold text-[color:var(--accent)]"
    >
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Segmented({ label, value, onChange, options }) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-full bg-[color:var(--bg-3)] p-1">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'h-8 cursor-pointer whitespace-nowrap rounded-full border-0 px-3.5 text-[12.5px] font-medium transition-[background-color,color,box-shadow] duration-200 max-[640px]:min-h-10',
              FOCUS,
              on
                ? 'bg-[color:var(--bg-2)] text-[color:var(--text)] shadow-[0_1px_3px_rgba(30,32,71,0.14)]'
                : 'bg-transparent text-[color:var(--text-2)] hover:text-[color:var(--text)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Summary({ summary, loading }) {
  const cells = [
    { key: 'total', label: 'Overdue', value: summary?.total, dot: 'bg-rose-500' },
    { key: 'no_reason', label: 'No reason yet', value: summary?.no_reason, dot: 'bg-amber-500' },
    { key: 'awaiting_decision', label: 'Needs your decision', value: summary?.awaiting_decision, dot: 'bg-sky-500' },
    { key: 'external', label: 'Outside the team', value: summary?.external, dot: 'bg-slate-400' },
  ];
  return (
    <div className={cx(SURFACE, 'grid grid-cols-2 lg:grid-cols-4')}>
      {cells.map((c, i) => (
        <div
          key={c.key}
          className={cx(
            'px-5 py-4',
            i % 2 === 1 && 'border-l border-[color:var(--border)]',
            i > 1 && 'border-t border-[color:var(--border)] lg:border-t-0',
            i > 0 && 'lg:border-l lg:border-[color:var(--border)]',
          )}
        >
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className={cx('h-2 w-2 shrink-0 rounded-full', c.dot)} />
            <span className={LABEL}>{c.label}</span>
          </div>
          {loading ? (
            <div className={cx(SKELETON, 'mt-3 h-8 w-12')} />
          ) : (
            <div className={cx(NUM, 'mt-2 text-[32px] font-semibold leading-none tracking-[-0.03em] text-[color:var(--text)]')}>
              {c.value || 0}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Why tasks are late: one bar per reason, plus the ones nobody answered.
function Breakdown({ data }) {
  const { reasons, summary } = data;
  const rows = reasons
    .map((r) => ({ ...r, count: summary.by_reason[r.code] || 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const max = Math.max(summary.no_reason, ...rows.map((r) => r.count), 1);
  const answered = rows.reduce((n, r) => n + r.count, 0);

  return (
    <section className={cx(SURFACE, 'px-5 py-4')} aria-label="Why tasks are late">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[14px] font-semibold text-[color:var(--text)]">Why tasks are late</h2>
        {answered > 0 && (
          <span className="text-[12px] text-[color:var(--text-3)]">
            <span className="text-sky-600">{summary.external} outside the team</span>
            {' · '}
            <span className="text-amber-600">{summary.team} within the team</span>
          </span>
        )}
      </div>

      {answered === 0 && summary.no_reason === 0 ? (
        <p className="m-0 mt-3 text-[13px] text-[color:var(--text-3)]">No overdue tasks.</p>
      ) : (
        <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
          {rows.map((r) => (
            <li key={r.code} className="grid grid-cols-[minmax(0,180px)_1fr_28px] items-center gap-3 max-[560px]:grid-cols-[minmax(0,1fr)_28px]">
              <span className="truncate text-[12.5px] text-[color:var(--text-2)]">{r.label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-4)] max-[560px]:hidden">
                <span
                  className={cx('block h-full rounded-full', (KIND[r.kind] || KIND.other).bar)}
                  style={{ width: `${Math.max(6, Math.round((r.count / max) * 100))}%` }}
                />
              </span>
              <span className={cx(NUM, 'text-right text-[13px] font-semibold text-[color:var(--text)]')}>{r.count}</span>
            </li>
          ))}
          {summary.no_reason > 0 && (
            <li className="grid grid-cols-[minmax(0,180px)_1fr_28px] items-center gap-3 max-[560px]:grid-cols-[minmax(0,1fr)_28px]">
              <span className="truncate text-[12.5px] text-[color:var(--text-3)]">No reason yet</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-4)] max-[560px]:hidden">
                <span
                  className="block h-full rounded-full bg-[color:var(--border-bright)]"
                  style={{ width: `${Math.max(6, Math.round((summary.no_reason / max) * 100))}%` }}
                />
              </span>
              <span className={cx(NUM, 'text-right text-[13px] font-semibold text-[color:var(--text-3)]')}>{summary.no_reason}</span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Decision modal                                                       */
/* ------------------------------------------------------------------ */

function DecisionModal({ item, onClose, onDone }) {
  const today = istToday();
  const suggested = item.new_due_date && item.new_due_date >= today ? item.new_due_date : addDays(today, 3);

  const [choice, setChoice] = useState('acknowledged');
  const [date, setDate] = useState(suggested);
  const [assignee, setAssignee] = useState('');
  const [note, setNote] = useState('');
  const [members, setMembers] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (choice !== 'reassign' || members) return undefined;
    const c = new AbortController();
    api
      .get('/members', { signal: c.signal })
      .then((res) => {
        if (c.signal.aborted) return;
        const list = (Array.isArray(res.data) ? res.data : res.data?.members || [])
          .filter((m) => m.active !== false && String(m.id) !== String(item.member_id))
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setMembers(list);
      })
      .catch((e) => {
        if (!isAbort(e)) setError('Could not load members.');
      });
    return () => c.abort();
  }, [choice, members, item.member_id]);

  const OPTIONS = [
    { value: 'acknowledged', title: 'Accept the reason', text: 'Keep the date. The member is told you saw it.' },
    { value: 'extend', title: 'Extend the due date', text: 'Move the deadline. The member is notified.' },
    { value: 'reassign', title: 'Give it to someone else', text: 'Replaces this member on the task.' },
    { value: 'ask_again', title: 'Ask for more detail', text: 'Sends the member a request to explain.' },
  ];

  const submit = async () => {
    if (saving) return;
    if (choice === 'extend' && !date) return setError('Pick the new due date');
    if (choice === 'reassign' && !assignee) return setError('Pick who should take it');
    if (choice === 'ask_again' && !note.trim()) return setError('Write what you want to know');

    setSaving(true);
    setError('');
    try {
      await api.post(`/overdue-reasons/${item.reason_id}/decision`, {
        decision: choice,
        note: note.trim() || null,
        new_due_date: choice === 'extend' ? date : undefined,
        assignee_id: choice === 'reassign' ? assignee : undefined,
      });
      toast('success', 'Done');
      onDone();
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Decide" onClose={() => !saving && onClose()} size="lg">
      <div className="flex flex-col gap-5">
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-3)] px-4 py-3">
          <div className="truncate text-[14px] font-semibold text-[color:var(--text)]">{item.title}</div>
          <div className="mt-0.5 text-[12px] text-[color:var(--text-3)]">
            {item.member_name} · {item.project_name} · {item.days_overdue} {item.days_overdue === 1 ? 'day' : 'days'} overdue
          </div>
          <div className="mt-2 text-[13px] text-[color:var(--text)]">
            <b className="font-semibold">{item.reason_label}</b>
            {item.note && <span className="text-[color:var(--text-2)]"> · {item.note}</span>}
            {item.new_due_date && <span className="text-[color:var(--text-3)]"> · can finish by {formatDay(item.new_due_date)}</span>}
          </div>
        </div>

        <div role="radiogroup" aria-label="Decision" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {OPTIONS.map((o) => {
            const on = choice === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setChoice(o.value);
                  setError('');
                }}
                className={cx(
                  'cursor-pointer rounded-xl border px-3.5 py-3 text-left transition-[background-color,border-color] duration-150',
                  FOCUS,
                  on
                    ? 'border-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_9%,var(--bg-2))]'
                    : 'border-[color:var(--border)] bg-[color:var(--bg-2)] hover:border-[color:var(--border-bright)] hover:bg-[color:var(--bg-3)]',
                )}
              >
                <span className="block text-[13px] font-semibold text-[color:var(--text)]">{o.title}</span>
                <span className="mt-0.5 block text-[12px] text-[color:var(--text-3)]">{o.text}</span>
              </button>
            );
          })}
        </div>

        {choice === 'extend' && (
          <label className="flex flex-col gap-1.5 sm:max-w-[240px]">
            <span className={LABEL}>New due date</span>
            <input type="date" className={INPUT} value={date} min={today} onChange={(e) => setDate(e.target.value)} />
          </label>
        )}

        {choice === 'reassign' && (
          <label className="flex flex-col gap-1.5 sm:max-w-[320px]">
            <span className={LABEL}>New assignee</span>
            <select className={cx(INPUT, 'cursor-pointer')} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">{members ? 'Choose a member' : 'Loading…'}</option>
              {(members || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {typeof m.task_count === 'number' ? ` · ${m.task_count} open` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{choice === 'ask_again' ? 'What do you want to know?' : 'Note to the member (optional)'}</span>
          <textarea
            className={cx(INPUT, 'h-auto resize-y py-2')}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {error && (
          <div role="alert" className="text-[12.5px] text-[color:var(--danger,#e11d48)]">
            {error}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-[color:var(--border)] pt-4">
          <button type="button" className={QUIET_BTN} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className={DARK_BTN} onClick={submit} disabled={saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* The tab                                                              */
/* ------------------------------------------------------------------ */

const VIEWS = [
  { value: 'all', label: 'All' },
  { value: 'no_reason', label: 'No reason yet' },
  { value: 'decide', label: 'Needs decision' },
  { value: 'decided', label: 'Decided' },
];

export default function OverdueTab({ state, retry, refresh }) {
  const { loading, error, data } = state;
  const [view, setView] = useState('all');
  const [member, setMember] = useState('');
  const [query, setQuery] = useState('');
  const [deciding, setDeciding] = useState(null);
  const [asking, setAsking] = useState(false);

  const reasonLabel = useMemo(() => new Map((data?.reasons || []).map((r) => [r.code, r.label])), [data]);
  const reasonKind = useMemo(() => new Map((data?.reasons || []).map((r) => [r.code, r.kind])), [data]);

  const items = useMemo(
    () => (data?.items || []).map((i) => ({ ...i, reason_label: i.reason ? reasonLabel.get(i.reason) || i.reason : '' })),
    [data, reasonLabel],
  );

  const people = useMemo(() => {
    const seen = new Map();
    items.forEach((i) => seen.set(String(i.member_id), i.member_name));
    return [...seen.entries()].sort((a, b) => (a[1] || '').localeCompare(b[1] || ''));
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (member && String(i.member_id) !== member) return false;
      if (q && !`${i.title} ${i.project_name} ${i.member_name}`.toLowerCase().includes(q)) return false;
      if (view === 'no_reason') return !i.reason_id;
      if (view === 'decide') return Boolean(i.reason_id) && !i.decision;
      if (view === 'decided') return Boolean(i.decision);
      return true;
    });
  }, [items, view, member, query]);

  const askable = visible.filter((i) => !i.reason_id);

  const askAll = async () => {
    if (!askable.length || asking) return;
    setAsking(true);
    try {
      const { data: res } = await api.post('/overdue-reasons/ask', {
        items: askable.slice(0, 100).map((i) => ({ task_id: i.task_id, member_id: i.member_id })),
      });
      if (res.sent > 0) toast('success', res.sent === 1 ? 'Asked 1 member' : `Asked ${res.sent} members`);
      if (res.recent > 0) toast('error', `${res.recent} already asked today`);
      if (res.sent === 0 && res.recent === 0) toast('error', 'Could not send the request');
    } catch (e) {
      toast('error', e?.response?.data?.error || 'Could not send the request');
    } finally {
      setAsking(false);
    }
  };

  const askOne = async (i) => {
    try {
      const { data: res } = await api.post('/overdue-reasons/ask', { items: [{ task_id: i.task_id, member_id: i.member_id }] });
      if (res.sent > 0) toast('success', `Asked ${i.member_name}`);
      else if (res.recent > 0) toast('error', `${i.member_name} was already asked today`);
      else toast('error', 'Could not send the request');
    } catch (e) {
      toast('error', e?.response?.data?.error || 'Could not send the request');
    }
  };

  if (error) {
    return (
      <div className={cx(SURFACE, 'flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px] text-[color:var(--text-2)]')}>
        <span>{error}</span>
        <button type="button" onClick={retry} className={QUIET_BTN}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Summary summary={data?.summary} loading={loading && !data} />
      {data && <Breakdown data={data} />}

      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented label="Filter" value={view} onChange={setView} options={VIEWS} />
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search task or member"
                aria-label="Search overdue tasks"
                className={cx(INPUT, 'w-[210px] !rounded-full')}
              />
              <select
                value={member}
                onChange={(e) => setMember(e.target.value)}
                aria-label="Filter by member"
                className={cx(INPUT, 'cursor-pointer !rounded-full pr-8')}
              >
                <option value="">All members</option>
                {people.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              {askable.length > 0 && (
                <button type="button" className={QUIET_BTN} onClick={askAll} disabled={asking}>
                  {asking ? 'Sending…' : `Ask ${askable.length} for a reason`}
                </button>
              )}
            </div>
          </div>

          {!items.length ? (
            <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[color:var(--border)] px-4 py-14 text-center">
              <div className="text-[14px] font-semibold text-[color:var(--text)]">Nothing is overdue</div>
              <div className="max-w-[360px] text-[12.5px] text-[color:var(--text-3)]">Tasks past their due date show up here.</div>
            </div>
          ) : !visible.length ? (
            <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[color:var(--border)] px-4 py-14 text-center">
              <div className="text-[14px] font-semibold text-[color:var(--text)]">No tasks match</div>
              <div className="text-[12.5px] text-[color:var(--text-3)]">Try another filter.</div>
            </div>
          ) : (
            <ul className={cx(SURFACE, 'm-0 list-none divide-y divide-[color:var(--border)] overflow-hidden p-0')}>
              {visible.map((i) => {
                const kind = KIND[reasonKind.get(i.reason)] || KIND.other;
                return (
                  <li
                    key={`${i.task_id}-${i.member_id}`}
                    className="flex flex-wrap items-start gap-x-5 gap-y-3 px-5 py-4"
                  >
                    <div className="min-w-0 flex-[1_1_260px]">
                      <Link
                        to={`/projects/${i.project_id}/tasks/${i.task_id}`}
                        className="block truncate text-[13.5px] font-medium text-[color:var(--text)] no-underline hover:underline"
                      >
                        {i.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[color:var(--text-3)]">
                        <Avatar name={i.member_name} url={i.avatar_url} size={18} />
                        <span className="text-[color:var(--text-2)]">{i.member_name}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{i.project_name}</span>
                      </div>
                    </div>

                    <div className="w-[104px] shrink-0">
                      <div className={cx(NUM, 'text-[13px] font-semibold', i.days_overdue >= 3 ? 'text-rose-600' : 'text-amber-600')}>
                        {i.days_overdue} {i.days_overdue === 1 ? 'day' : 'days'}
                      </div>
                      <div className="text-[11.5px] text-[color:var(--text-3)]">Due {formatDay(i.due_day)}</div>
                    </div>

                    <div className="min-w-0 flex-[1_1_240px]">
                      {i.reason_id ? (
                        <>
                          <span className={cx('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-medium', kind.chip)}>
                            <span aria-hidden="true" className={cx('h-1.5 w-1.5 rounded-full', kind.dot)} />
                            {i.reason_label}
                          </span>
                          {i.note && <div className="mt-1 line-clamp-2 break-words text-[12.5px] text-[color:var(--text-2)]">{i.note}</div>}
                          {i.new_due_date && (
                            <div className="mt-0.5 text-[11.5px] text-[color:var(--text-3)]">Can finish by {formatDay(i.new_due_date)}</div>
                          )}
                          {i.decision && (
                            <div className="mt-1.5 text-[11.5px] text-[color:var(--text-3)]">
                              <span className="font-medium text-[color:var(--text-2)]">{DECISION_LABEL[i.decision] || i.decision}</span>
                              {i.decision_note && <> · {i.decision_note}</>}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-[12.5px] text-amber-600">No reason yet</span>
                      )}
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      {!i.reason_id && (
                        <button type="button" className={QUIET_BTN} onClick={() => askOne(i)}>
                          Ask reason
                        </button>
                      )}
                      {i.reason_id && (!i.decision || i.decision !== 'ask_again') && (
                        <button type="button" className={i.decision ? QUIET_BTN : DARK_BTN} onClick={() => setDeciding(i)}>
                          {i.decision ? 'Change' : 'Decide'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {data.truncated && (
            <p className="m-0 text-[11.5px] text-[color:var(--text-3)]">Showing the most overdue 1000 tasks.</p>
          )}
        </>
      )}

      {deciding && (
        <DecisionModal
          item={deciding}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
