import assert from 'node:assert/strict';
import { test } from 'node:test';
import { civilDate, completedCalendar, dueCalendar } from '../src/review-calendar-data.js';

process.env.TZ = 'America/New_York';
const rows = (...dates) => dates.map(at => Object.freeze({ at }));
const iso = day => civilDate(day).toISOString().slice(0, 10);
const daily = calendar => Object.fromEntries([...calendar.counts].map(([day, count]) => [iso(day), count]));

test('today can have real attempts and a separate backlog with overdue cards', () => {
  const now = new Date('2025-01-01T17:00Z');
  const completed = completedCalendar(rows('2024-12-30', '2024-12-30', new Date('2025-01-01T02:30Z'),
    '2025-01-01T10:00:00-05:00', now.toISOString(), '2025-01-01T17:00:00.001Z',
    '2025-01-02', 'bad-date', '2024-12-32'), now);
  const due = dueCalendar(rows('2024-12-29', '2024-12-30', '2025-01-01T00:15:00-05:00', '2025-01-01',
    '2025-01-01T23:45:00-05:00', '2025-01-02T03:00:00-05:00', '2025-01-02T03:00:00-05:00'), now);
  assert.deepEqual(daily(completed), { '2024-12-30': 2, '2024-12-31': 1, '2025-01-01': 2 });
  assert.deepEqual(daily(due), { '2025-01-01': 5, '2025-01-02': 2 });
  assert.equal(due.overdue, 2);
  assert.equal(iso(completed.today), '2025-01-01');
  assert.equal(completed.today, due.today);
});

test('civil dates honor midnight and both DST transitions', () => {
  const spring = new Date('2024-03-11T18:00Z');
  assert.deepEqual(daily(completedCalendar(rows('2024-03-10T06:59Z', '2024-03-10T07:00Z',
    '2024-03-11T03:59Z', '2024-03-11T04:00Z'), spring)), { '2024-03-10': 3, '2024-03-11': 1 });
  const due = rows('2024-03-13T03:59:59.999Z', '2024-03-13T04:00Z');
  assert.deepEqual(daily(dueCalendar(due, spring)), { '2024-03-12': 1, '2024-03-13': 1 });
  const atMidnight = dueCalendar(due, new Date('2024-03-13T04:00Z'));
  assert.deepEqual(daily(atMidnight), { '2024-03-13': 2 });
  assert.equal(atMidnight.overdue, 1);
  assert.deepEqual(daily(completedCalendar(rows('2024-11-03T05:30Z', '2024-11-03T06:30Z',
    '2024-11-04T04:59Z', '2024-11-04T05:00Z'), new Date('2024-11-04T18:00Z'))),
  { '2024-11-03': 3, '2024-11-04': 1 });
});

test('a replacement schedule cannot backfill attempts or keep stale due dates', () => {
  const now = new Date('2025-01-01T17:00Z');
  const before = Object.freeze(rows('2024-12-28', '2025-01-02'));
  assert.deepEqual(daily(dueCalendar(before, now)), { '2025-01-01': 1, '2025-01-02': 1 });
  const after = dueCalendar(Object.freeze(rows('2025-01-04', '2025-01-05')), now);
  assert.deepEqual(daily(after), { '2025-01-04': 1, '2025-01-05': 1 });
  assert.equal(after.overdue, 0);
  assert.deepEqual(daily(completedCalendar([], now)), {});
});
