'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isStoredDateEcho, keepStoredDate } = require('../utils/dateInput');
const { splitTotal, TOTAL_COLUMN } = require('../utils/listLimit');

test('date fields preserve their stored value when the request leaves them unchanged', () => {
  const stored = new Date('2026-10-16T09:30:00.000Z');

  assert.equal(keepStoredDate(undefined, stored), true);
  assert.equal(isStoredDateEcho(stored.toISOString(), stored), true);
  assert.equal(keepStoredDate('2026-10-16T00:00:00.000Z', stored), false);
  assert.equal(isStoredDateEcho(stored.toISOString(), '2026-10-16T09:30:00.000Z'), false);
});

test('list totals are separated from rows without mutating the database results', () => {
  const rows = [
    { id: 1, title: 'First', [TOTAL_COLUMN]: '8' },
    { id: 2, title: 'Second', [TOTAL_COLUMN]: '8' },
  ];

  assert.deepEqual(splitTotal(rows), {
    rows: [{ id: 1, title: 'First' }, { id: 2, title: 'Second' }],
    total: 8,
  });
  assert.equal(rows[0][TOTAL_COLUMN], '8');
  assert.deepEqual(splitTotal([]), { rows: [], total: 0 });
});
