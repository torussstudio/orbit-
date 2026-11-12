import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import Modal from '../ui/Modal';
import { TASK_AND_PROJECT_EVENTS, useLiveRefetch } from '../../hooks/useLiveEvents';

/*
 * "Why is this overdue?" prompt for the person a task is assigned to.
 *
 * Soft on purpose: nothing is blocked. When someone opens Orbit with overdue
 * tasks that have no reason yet, this pops up once per page load, one task at
 * a time. "Later" closes it, and a slim bar at the top of the page keeps
 * reminding them until they answer. The admin sees every reason in
 * Member Activity -> Overdue and decides what to do.
 */

const IST = 'Asia/Kolkata';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toast = (type, message) =>
  window.dispatchEvent(new CustomEvent('orbit:toast', { detail: { type, message } }));

const istToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const formatDay = (ymd) =>
  DATE_RE.test(ymd || '')
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' }).format(new Date(`${ymd}T00:00:00Z`))
    : '';

const daysText = (n) => `${n} ${n === 1 ? 'day' : 'days'} overdue`;

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]';
const BTN =
  'inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-[12.5px] font-medium transition-[background-color,opacity,border-color] duration-200 disabled:cursor-not-allowed disabled:opacity-50';
const GHOST = `${BTN} border border-[color:var(--border)] bg-[color:var(--bg-2)] text-[color:var(--text-2)] hover:bg-[color:var(--bg-3)] hover:text-[color:var(--text)] ${FOCUS}`;
const PRIMARY = `${BTN} border-0 bg-[color:var(--accent)] text-white hover:opacity-90 ${FOCUS}`;
const FIELD =
  'w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-2)] px-3 text-[13px] text-[color:var(--text)] transition-[border-color,box-shadow] duration-200 placeholder:text-[color:var(--text-3)] hover:border-[color:var(--border-bright)] focus-visible:border-[color:var(--accent)] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)] focus-visible:outline-none';

export default function OverdueReasonPrompt() {
  const [data, setData] = useState({ reasons: [], items: [] });
  const [open, setOpen] = useState(false);
  const [skipped, setSkipped] = useState(() => new Set());
  const [form, setForm] = useState({ reason: '', note: '', date: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const autoOpened = useRef(false);

  const load = useCallback(() => {
    api
      .get('/overdue-reasons/mine')
      .then((res) => {
        setData({ reasons: res.data?.reasons || [], items: res.data?.items || [] });
      })
      .catch(() => {
        // The prompt is a nicety: if it cannot load, stay out of the way.
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefetch(TASK_AND_PROJECT_EVENTS, load);

  const pending = useMemo(() => data.items.filter((i) => i.pending), [data.items]);
  const queue = useMemo(() => pending.filter((i) => !skipped.has(String(i.task_id))), [pending, skipped]);
  const current = queue[0] || null;
  const currentKey = current ? `${current.task_id}:${current.due_day}:${current.decision || ''}` : '';

  // Pop up once per page load, the first time something needs an answer.
  useEffect(() => {
    if (!autoOpened.current && pending.length > 0) {
      autoOpened.current = true;
      setOpen(true);
    }
  }, [pending.length]);

  // Close when there is nothing left to answer.
  useEffect(() => {
    if (open && !current) setOpen(false);
  }, [open, current]);

  // Fresh form for each task (an "ask again" keeps the earlier answer to edit).
  useEffect(() => {
    setForm({
      reason: current?.reason || '',
      note: current?.note || '',
      date: current?.new_due_date || '',
    });
    setError('');
  }, [currentKey]);

  const submit = async () => {
    if (!current || saving) return;
    if (!form.reason) return setError('Pick what held it up');
    if (form.reason === 'other' && !form.note.trim()) return setError('Add a short note for Other');

    setSaving(true);
    setError('');
    try {
      await api.put(`/overdue-reasons/tasks/${current.task_id}`, {
        reason: form.reason,
        note: form.note.trim() || null,
        new_due_date: form.date || null,
      });
      toast('success', 'Sent to your admin');
      load();
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not send. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    if (!current) return;
    setSkipped((cur) => new Set([...cur, String(current.task_id)]));
  };

  if (!pending.length) return null;

  const total = pending.length;
  const position = pending.length - queue.length + 1;

  return (
    <>
      {!open && (
        <div
          role="status"
          className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-amber-500/25 bg-amber-500/10 px-4 py-2 text-[13px] text-[color:var(--text)] sm:px-6"
        >
          <span>
            <b className="font-semibold">{total}</b> overdue {total === 1 ? 'task needs' : 'tasks need'} a reason for your admin.
          </span>
          <button
            type="button"
            onClick={() => {
              setSkipped(new Set());
              setOpen(true);
            }}
            className={`cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline ${FOCUS}`}
          >
            Tell why
          </button>
        </div>
      )}

      {open && current && (
        <Modal title="Why is this task overdue?" onClose={() => setOpen(false)} size="lg">
          <div className="flex flex-col gap-5">
            <p className="m-0 text-[13px] leading-6 text-[color:var(--text-2)]">
              A quick note helps your admin plan. Nothing is blocked, and it takes a few seconds.
            </p>

            {current.decision === 'ask_again' && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[13px] text-[color:var(--text)]">
                <b className="font-semibold">Your admin asked for more detail.</b>
                {current.decision_note && <span className="mt-0.5 block text-[color:var(--text-2)]">{current.decision_note}</span>}
              </div>
            )}

            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-3)] px-4 py-3">
              <Link
                to={`/projects/${current.project_id}/tasks/${current.task_id}`}
                onClick={() => setOpen(false)}
                className="block truncate text-[14px] font-semibold text-[color:var(--text)] no-underline hover:underline"
              >
                {current.title}
              </Link>
              <div className="mt-0.5 text-[12px] text-[color:var(--text-3)]">
                {current.project_name} · Due {formatDay(current.due_day)} ·{' '}
                <span className="font-medium text-[color:var(--danger,#e11d48)]">{daysText(current.days_overdue)}</span>
              </div>
            </div>

            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 p-0 text-[12px] font-medium text-[color:var(--text-2)]">What held it up?</legend>
              <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {data.reasons.map((r) => {
                  const on = form.reason === r.code;
                  return (
                    <button
                      key={r.code}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setForm((f) => ({ ...f, reason: r.code }))}
                      className={`flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[13px] transition-[background-color,border-color] duration-150 ${FOCUS} ${
                        on
                          ? 'border-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_9%,var(--bg-2))] text-[color:var(--text)]'
                          : 'border-[color:var(--border)] bg-[color:var(--bg-2)] text-[color:var(--text-2)] hover:border-[color:var(--border-bright)] hover:bg-[color:var(--bg-3)]'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`h-3.5 w-3.5 shrink-0 rounded-full border ${
                          on ? 'border-[5px] border-[color:var(--accent)]' : 'border-[color:var(--border-bright)]'
                        }`}
                      />
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[color:var(--text-2)]">
                Note {form.reason === 'other' ? '(needed)' : '(optional)'}
              </span>
              <textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                maxLength={500}
                rows={2}
                placeholder="Anything your admin should know"
                className={`${FIELD} resize-y py-2`}
              />
            </label>

            <label className="flex flex-col gap-1.5 sm:max-w-[240px]">
              <span className="text-[12px] font-medium text-[color:var(--text-2)]">When can you finish it? (optional)</span>
              <input
                type="date"
                value={form.date}
                min={istToday()}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className={`${FIELD} h-9`}
              />
            </label>

            {error && (
              <div role="alert" className="text-[12.5px] text-[color:var(--danger,#e11d48)]">
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--border)] pt-4">
              <span className="text-[12px] text-[color:var(--text-3)]">
                Task {position} of {total}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={GHOST} onClick={() => setOpen(false)} disabled={saving}>
                  Later
                </button>
                {queue.length > 1 && (
                  <button type="button" className={GHOST} onClick={skip} disabled={saving}>
                    Skip
                  </button>
                )}
                <button type="button" className={PRIMARY} onClick={submit} disabled={saving} aria-busy={saving}>
                  {saving ? 'Sending…' : 'Send to admin'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
