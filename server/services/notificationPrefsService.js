'use strict';

const db = require('../db');
const { GROUPS, DELIVERIES, typesFor } = require('../utils/notificationTypes');
const {
  readSettings: readReminderSettings,
  readOffDays,
} = require('../utils/deadlineReminder');

/*
 * Notification preferences of one member (Account settings -> Notifications).
 *
 * Two tables (see server/db/index.js):
 *   member_notification_prefs        pause_all, reminder_hour, skip_weekends
 *                                    (skip_weekends = "skip days off": the
 *                                    days in REMINDER_OFF_DAYS, not always
 *                                    Saturday and Sunday)
 *   member_notification_type_prefs   per type: enabled, delivery
 *
 * No row = the default, which is exactly how notifications worked before
 * preferences existed. Reading never creates a row; only a save does.
 *
 * Which types exist, their labels and who may see them come from
 * utils/notificationTypes.js. How a preference is applied when a
 * notification is sent is in utils/pushNotify.js (createNotification) and,
 * for the reminder hour and weekends, utils/deadlineReminder.js.
 */

const GENERAL_DEFAULTS = {
  pause_all: false,
  reminder_hour: null,
  skip_weekends: false,
};

// Far more than the card ever sends; only stops an absurd request body.
const MAX_TYPES_PER_REQUEST = 100;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// ============================================================
// GET PREFERENCES
// ============================================================

/*
 * Everything the card needs: the member's general settings, the server's
 * default reminder hour, and every type this member's role can receive with
 * its group, label, current setting and whether it can be turned off.
 */
async function getPreferences(userId, role) {
  const [general, perType] = await Promise.all([
    db.query(
      `SELECT pause_all, reminder_hour, skip_weekends
         FROM member_notification_prefs
        WHERE member_id = $1`,
      [userId],
    ),
    db.query(
      `SELECT type, enabled, delivery
         FROM member_notification_type_prefs
        WHERE member_id = $1`,
      [userId],
    ),
  ]);

  const settings = general.rows[0] || GENERAL_DEFAULTS;
  const saved = new Map(perType.rows.map((row) => [row.type, row]));
  const types = typesFor(role);
  const usedGroups = new Set(types.map((type) => type.group));

  return {
    pause_all: Boolean(settings.pause_all),
    reminder_hour: settings.reminder_hour ?? null,
    skip_weekends: Boolean(settings.skip_weekends),
    // What reminder_hour = null means (DEADLINE_REMINDER_HOUR, Asia/Kolkata).
    default_reminder_hour: readReminderSettings().hour,
    // The days skip_weekends skips (REMINDER_OFF_DAYS), as weekday names in
    // week order, e.g. ["sun"] or ["sat", "sun"]. The card builds the
    // switch's label from them ("Skip Sundays", "Skip weekends", ...).
    off_days: readOffDays(),
    groups: GROUPS.filter((group) => usedGroups.has(group.id)),
    types: types.map((type) => {
      const row = saved.get(type.key);
      const canDisable = type.canDisable !== false;

      return {
        type: type.key,
        group: type.group,
        label: type.label,
        // A security alert is always on, whatever a row says.
        enabled: canDisable ? row?.enabled !== false : true,
        delivery: DELIVERIES.includes(row?.delivery) ? row.delivery : 'both',
        can_disable: canDisable,
      };
    }),
  };
}

// ============================================================
// SAVE PREFERENCES
// ============================================================

/*
 * Checks the whole body before anything is written. A field that is left
 * out keeps its current value; `reminder_hour: null` means "use the server
 * default". Returns { general, types } with only what the body contained.
 */
function validateBody(body, role) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Invalid preferences');
  }

  const general = {};

  for (const field of ['pause_all', 'skip_weekends']) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'boolean') {
      throw badRequest(`${field} must be true or false`);
    }
    general[field] = body[field];
  }

  if (body.reminder_hour !== undefined) {
    const hour = body.reminder_hour;
    if (hour !== null && !(Number.isInteger(hour) && hour >= 0 && hour <= 23)) {
      throw badRequest('reminder_hour must be a whole hour from 0 to 23, or null for the default');
    }
    general.reminder_hour = hour;
  }

  const types = [];

  if (body.types !== undefined) {
    if (!Array.isArray(body.types) || body.types.length > MAX_TYPES_PER_REQUEST) {
      throw badRequest('types must be a list');
    }

    // Only the types this member's role can receive. Anything else,
    // including a manager-only type sent by a member, is unknown.
    const allowed = new Map(typesFor(role).map((type) => [type.key, type]));
    const seen = new Set();

    for (const item of body.types) {
      const known = item && typeof item === 'object' ? allowed.get(item.type) : null;

      if (!known) {
        throw badRequest(`Unknown notification type: ${String(item?.type)}`);
      }
      if (seen.has(known.key)) {
        throw badRequest(`Notification type sent twice: ${known.key}`);
      }
      seen.add(known.key);

      if (typeof item.enabled !== 'boolean') {
        throw badRequest(`enabled must be true or false for ${known.key}`);
      }
      if (!DELIVERIES.includes(item.delivery)) {
        throw badRequest(`delivery must be one of ${DELIVERIES.join(', ')} for ${known.key}`);
      }
      if (known.canDisable === false && item.enabled === false) {
        throw badRequest('Security alerts cannot be turned off.');
      }

      types.push({
        type: known.key,
        enabled: item.enabled,
        delivery: item.delivery,
      });
    }
  }

  return { general, types };
}

/*
 * Saves the member's own preferences. Everything in one transaction: either
 * the whole card is saved or nothing is. Returns the same shape as
 * getPreferences, read back after the save.
 */
async function savePreferences(userId, role, body) {
  const { general, types } = validateBody(body, role);

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT pause_all, reminder_hour, skip_weekends
         FROM member_notification_prefs
        WHERE member_id = $1`,
      [userId],
    );

    const next = { ...GENERAL_DEFAULTS, ...(rows[0] || {}), ...general };

    await client.query(
      `INSERT INTO member_notification_prefs
         (member_id, pause_all, reminder_hour, skip_weekends, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (member_id) DO UPDATE SET
         pause_all = EXCLUDED.pause_all,
         reminder_hour = EXCLUDED.reminder_hour,
         skip_weekends = EXCLUDED.skip_weekends,
         updated_at = NOW()`,
      [userId, next.pause_all, next.reminder_hour, next.skip_weekends],
    );

    for (const item of types) {
      await client.query(
        `INSERT INTO member_notification_type_prefs
           (member_id, type, enabled, delivery, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (member_id, type) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           delivery = EXCLUDED.delivery,
           updated_at = NOW()`,
        [userId, item.type, item.enabled, item.delivery],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return getPreferences(userId, role);
}

module.exports = {
  getPreferences,
  savePreferences,
};
