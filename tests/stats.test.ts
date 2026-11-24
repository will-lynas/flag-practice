import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyCard } from 'ts-fsrs';
import { addFive, getHeatmapData, grade, loadProgress } from '../src/engine.ts';

const now = new Date('2026-05-03T12:00Z');
const regional = new Set(['JP', 'KR']);

test('country history excludes anonymous legacy attempts without deleting or assigning them', () => {
  const prior = '2026-05-02T12:00:00.000Z';
  const enrolled = addFive({ version: 1, cards: {}, reviewLog: [prior] }, ['JP', 'BR', 'KR'], now);
  const state = grade(grade(grade(enrolled, 'JP', false, now), 'BR', true, now), 'JP', true, now);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify(state) } });
    const loaded = loadProgress({ strict: true });
    assert.deepEqual(loaded.reviewLog, [prior, ...Array(3).fill(now.toISOString())]);
    assert.deepEqual(getHeatmapData(loaded).reviews.map(r => r.at), [prior, ...Array(3).fill(now.toISOString())]);
    const data = getHeatmapData(loaded, regional);
    assert.equal(data.reviews.length, 2);
    const jp = loaded.cards.JP;
    assert.ok(jp);
    assert.deepEqual(data.due.map(r => +r.at), [+jp.due]);
    assert.equal(getHeatmapData({ cards: { JP: jp } }, regional).reviews.length, 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('status uses the scheduled interval, including for overdue cards', async () => {
  const { getStats, statuses } = await import('../src/stats-data.ts');
  const newCard = createEmptyCard(now);
  const state = { cards: {
    JP: { ...newCard, last_review: now, scheduled_days: 14, due: new Date(+now - 1000) },
    KR: { ...newCard, last_review: now, scheduled_days: 13, due: new Date(+now + 30 * 86400000) },
    CN: newCard,
  } };
  const world = getStats(state, 'world', now);
  const asia = getStats(state, 'asia', now);
  assert.deepEqual(world.counts, { 'Not started': 195, Learning: 1, Learnt: 1 });
  assert.equal(world.rows.length, 197);
  assert.equal(asia.rows.length, 49);
  assert.deepEqual(asia.counts, { 'Not started': 47, Learning: 1, Learnt: 1 });
  assert.equal(asia.dueNow, 1);
  assert.deepEqual(asia.rows.filter(row => ['CN', 'JP', 'KR'].includes(row.country.code)).map(row => [row.country.code, row.status, row.due]), [
    ['CN', 'Not started', null], ['JP', 'Learnt', state.cards.JP.due], ['KR', 'Learning', state.cards.KR.due],
  ]);
  for (const status of statuses) {
    assert.equal(world.breakdown.reduce((sum, row) => sum + row.counts[status], 0), world.counts[status]);
  }
  assert.equal(world.breakdown.reduce((sum, row) => sum + row.total, 0), world.rows.length);
});

test('invalid attribution indexes or code shapes fail strict loading', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    for (const reviewCountries of [[], { 1: 'JP' }, { '00': 'JP' }, { 0: 'Japan' }]) {
      const bytes = JSON.stringify({ version: 1, cards: {}, reviewLog: [now.toISOString()], reviewCountries });
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => bytes } });
      assert.throws(() => loadProgress({ strict: true }), /Invalid review attribution/);
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
