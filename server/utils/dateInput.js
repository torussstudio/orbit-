'use strict';

/*
 * Date fields the user did not change.
 *
 * pg reads `timestamp without time zone` and `date` columns as the server's
 * local time, and res.json() sends them as toISOString(): UTC, ending in "Z".
 * When a form sends that string back unchanged, Postgres drops the "Z"
 * (timestamp) or the time (date), so the stored value moves back by the
 * server's UTC offset: 5 h 30 min in Asia/Kolkata, or a whole day for a
 * `date` column.
 *
 * keepStoredDate() is true when a request leaves a date alone: the field is
 * missing, or it is exactly the string the API returned for the stored value.
 * The caller then keeps the stored value instead of writing the string.
 * Anything else (a picked "yyyy-MM-dd", a datetime-local value, "" or null to
 * clear) is written exactly as before.
 */

function isStoredDateEcho(value, stored) {
  return (
    typeof value === 'string' &&
    stored instanceof Date &&
    !Number.isNaN(stored.getTime()) &&
    value === stored.toISOString()
  );
}

function keepStoredDate(value, stored) {
  return value === undefined || isStoredDateEcho(value, stored);
}

module.exports = {
  isStoredDateEcho,
  keepStoredDate,
};
