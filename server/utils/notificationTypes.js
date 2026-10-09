'use strict';

/*
 * The kinds of notification a member can set preferences for
 * (Account settings -> Notifications), in the order the card shows them.
 *
 * key        saved in member_notification_type_prefs.type. Where the app
 *            already saved a `type` on its notifications, the key is that
 *            same value.
 * group      which heading the row sits under (GROUPS below).
 * label      what the member reads.
 * audience   'manager' = only managers ever receive it, so only managers
 *            see the row. Left out = everyone.
 * canDisable false = a security alert: it has no off switch and is not
 *            stopped by "Pause all". Its delivery can still be chosen.
 * listed     false = nothing sends it today, so the card does not show a
 *            switch that would do nothing. It stays registered: the day it
 *            is sent again, pause / defaults already apply to it.
 */

const GROUPS = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'projects', label: 'Projects' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'security', label: 'Security' },
];

const TYPES = [
  { key: 'task_assigned', group: 'tasks', label: 'Task assigned to you' },
  { key: 'task_unassigned', group: 'tasks', label: 'Removed from a task' },
  { key: 'task_done', group: 'tasks', label: 'Your task marked Done' },
  { key: 'task_rework', group: 'tasks', label: 'Task sent back for rework' },
  { key: 'task_due_date_updated', group: 'tasks', label: 'Due date changed' },
  { key: 'task_in_review', group: 'tasks', label: 'Task submitted for review', audience: 'manager' },
  { key: 'task_request', group: 'tasks', label: 'New task request', audience: 'manager' },

  { key: 'project_member_added', group: 'projects', label: 'Added to a project' },
  { key: 'project_member_removed', group: 'projects', label: 'Removed from a project' },
  // POST /calendar/notify-guest exists, but the client never calls it.
  { key: 'calendar_invitation', group: 'projects', label: 'Calendar invitation', listed: false },

  { key: 'task_due_reminder', group: 'reminders', label: 'Task due soon (tomorrow or today)' },
  { key: 'task_overdue', group: 'reminders', label: 'Task overdue' },
  // utils/dailyReminder.js: its sends are switched off.
  { key: 'daily_digest', group: 'reminders', label: 'Daily summary', listed: false },

  { key: 'new_sign_in', group: 'security', label: 'New sign-in to your account', canDisable: false },
];

/*
 * Saved `type` values that share another type's switch: a sub task is
 * assigned / unassigned with the same switch as a main task. The value saved
 * on the notification itself is not changed.
 */
const SHARED_SWITCH = {
  subtask_assigned: 'task_assigned',
  subtask_unassigned: 'task_unassigned',
};

const DELIVERIES = ['both', 'push', 'in_app'];

const byKey = new Map(TYPES.map((type) => [type.key, type]));

// The preference key a notification's `type` is looked up under.
function prefKey(type) {
  return SHARED_SWITCH[type] || type;
}

// The registered type for a notification's `type`, or null (unknown types,
// 'general').
function findType(type) {
  return byKey.get(prefKey(type)) || null;
}

// Security alerts are always sent: no off switch, not stopped by "Pause all".
function isSecurity(type) {
  return findType(type)?.canDisable === false;
}

// The rows a member with this role sees and may save.
function typesFor(role) {
  return TYPES.filter(
    (type) =>
      type.listed !== false &&
      (type.audience !== 'manager' || role === 'manager'),
  );
}

module.exports = {
  GROUPS,
  TYPES,
  DELIVERIES,
  prefKey,
  findType,
  isSecurity,
  typesFor,
};
