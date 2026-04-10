import { format, isAfter, parseISO } from 'date-fns';

export const formatDate = (d) => {
  if (!d) return '—';
  try { return format(typeof d === 'string' ? parseISO(d) : d, 'MMM d, yyyy'); }
  catch { return d; }
};

export const isOverdue = (d, stage) => {
  if (!d || ['Done','Deployed'].includes(stage)) return false;
  return isAfter(new Date(), typeof d === 'string' ? parseISO(d) : d);
};

export const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

export const stageColor = {
  'Todo': 'var(--accent)',
  'In Progress': 'var(--warning)',
  'In Review': 'var(--accent-2)',
  'Done': 'var(--success)',
  'Deployed': 'var(--success)',
  'Blocked': 'var(--danger)',
};
