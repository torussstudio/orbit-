'use strict';

/*
 * Safety cap for list endpoints that return full lists to the UI
 * (no pagination). It is set far above today's data so the UI shows
 * exactly the same rows. It only stops one request from loading an
 * unbounded number of rows if the data ever grows that large.
 *
 * The real total is sent back in the X-Total-Count response header.
 */

const DEFAULT_LIST_SAFETY_LIMIT = 1000;

function readLimit() {
  const value = Number.parseInt(process.env.LIST_SAFETY_LIMIT, 10);
  return Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_LIST_SAFETY_LIMIT;
}

const LIST_SAFETY_LIMIT = readLimit();

// Name of the extra column the capped queries add with
// COUNT(*) OVER() (computed before LIMIT, so it is the real total).
const TOTAL_COLUMN = '_list_total';

// Strips the helper column and returns { rows, total }.
function splitTotal(rows) {
  const total = rows.length ? Number(rows[0][TOTAL_COLUMN]) : 0;
  return {
    rows: rows.map(({ [TOTAL_COLUMN]: _ignored, ...row }) => row),
    total,
  };
}

function setTotalHeader(res, total) {
  res.set('X-Total-Count', String(total));
}

module.exports = {
  LIST_SAFETY_LIMIT,
  TOTAL_COLUMN,
  splitTotal,
  setTotalHeader,
};
