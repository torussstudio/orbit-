import { format, isAfter, parseISO } from 'date-fns';

export const formatDate = (d, formatStr = 'MMM d, yyyy') => {
  if (!d) return '—';
  try {
    const date = typeof d === 'string' ? parseISO(d) : d;
    return format(date, formatStr);
  } catch (e) {
    console.warn('Date format error:', e);
    return '—';
  }
};

export const isOverdue = (d, stage) => {
  if (!d || ['Done', 'Deployed'].includes(stage)) return false;
  try {
    return isAfter(new Date(), typeof d === 'string' ? parseISO(d) : d);
  } catch {
    return false;
  }
};

export const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

// Stage-based color mapping for consistent UI
export const getStageColor = (stage) => {
  const colors = {
    'Todo': 'var(--accent)',
    'In Progress': 'var(--warning)',
    'In Review': 'var(--accent-2)',
    'Done': 'var(--success)',
    'Deployed': 'var(--success)',
    'Blocked': 'var(--danger)',
  };
  return colors[stage] || 'var(--text-2)';
};

// Priority-based color mapping
export const getPriorityColor = (priority) => {
  const colors = {
    critical: 'var(--critical)',
    high: 'var(--danger)',
    medium: 'var(--warning)',
    low: 'var(--accent)'
  };
  return colors[priority] || 'var(--text-2)';
};
