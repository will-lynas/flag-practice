import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';
import {
  addFive, getDue, getHeatmapData, grade, knownCodes, loadProgress, nextDue, saveProgress,
} from '../src/engine.js';

const now = new Date('2026-01-01T12:00:00Z');

test('starts with no enrolled flags when browser storage is empty', () => {
  withStorage(() => {
    const state = loadProgress();
    assert.deepEqual(knownCodes(state), []);
    assert.deepEqual(getDue(state, now), []);
    assert.equal(nextDue(state), null);
  });
});

test('adds up to five unseen flags in the given order and makes them due immediately', () => {
  withStorage(() => {
    const start = loadProgress();
    const codes = ['JP', 'JP', 'BR', 'FR', 'ZA', 'NZ', 'CA', 'DE'];
    const first = addFive(start, codes, now);
    assert.deepEqual(knownCodes(start), []);
    assert.deepEqual(knownCodes(first), ['JP', 'BR', 'FR', 'ZA', 'NZ']);
    assert.deepEqual(getDue(first, now), ['JP', 'BR', 'FR', 'ZA', 'NZ']);
    assert.deepEqual(getDue(first, new Date(now.getTime() - 1)), []);
    assert.deepEqual(nextDue(first), now);

    const later = new Date('2026-01-02T12:00:00Z');
    const second = addFive(first, codes, later);
    assert.deepEqual(knownCodes(second), ['JP', 'BR', 'FR', 'ZA', 'NZ', 'CA', 'DE']);
    assert.deepEqual(getDue(second, now), knownCodes(first));
    assert.deepEqual(getDue(second, later), knownCodes(second));
    assert.deepEqual(addFive(second, codes, later), second);
  });
});

test('grades with FSRS Again and Good, and orders the queue by due time', () => {
  withStorage(() => {
    const start = addFive(loadProgress(), ['JP', 'BR'], now);
    const good = grade(start, 'JP', true, now);
    const reviewed = grade(good, 'BR', false, now);
    const scheduler = fsrs({ enable_fuzz: false });
    const expectedGood = scheduler.next(createEmptyCard(now), now, Rating.Good).card;
    const expectedAgain = scheduler.next(createEmptyCard(now), now, Rating.Again).card;
    assert.deepEqual(reviewed.cards.JP, expectedGood);
    assert.deepEqual(reviewed.cards.BR, expectedAgain);
    assert.deepEqual(getDue(start, now), ['JP', 'BR']);
    assert.deepEqual(getDue(good, now), ['BR']);
    assert.deepEqual(getDue(reviewed, now), []);
    assert.ok(now < expectedAgain.due && expectedAgain.due < expectedGood.due);
    assert.deepEqual(nextDue(reviewed), expectedAgain.due);
    assert.deepEqual(getDue(reviewed, expectedAgain.due), ['BR']);
    assert.deepEqual(getDue(reviewed, expectedGood.due), ['BR', 'JP']);

    const graduated = grade(reviewed, 'JP', true, expectedGood.due);
    assert.deepEqual(graduated.cards.JP, scheduler.next(expectedGood, expectedGood.due, Rating.Good).card);
    assert.equal(graduated.cards.JP.state, State.Review);
    assert.ok(graduated.cards.JP.due > expectedGood.due);
    assert.strictEqual(grade(graduated, 'CA', false, now), graduated);
  });
});

test('reloads versioned browser progress and hydrates both FSRS dates', () => {
  withStorage((entries) => {
    const enrolled = addFive(loadProgress(), ['JP', 'BR'], now);
    const reviewed = grade(enrolled, 'JP', true, now);
    assert.deepEqual(knownCodes(loadProgress()), []); // Updates are not writes.
    assert.equal(saveProgress(reviewed), true);
    assert.equal(entries.size, 1);
    const [raw] = entries.values();
    const saved = JSON.parse(raw);
    assert.equal(saved.version, 1);
    assert.equal(saved.cards.JP.last_review, now.toISOString());
    assert.equal(saved.cards.JP.due, reviewed.cards.JP.due.toISOString());

    const reloaded = loadProgress();
    assert.deepEqual(reloaded, reviewed);
    assert.notStrictEqual(reloaded.cards.JP.due, reviewed.cards.JP.due);
    assert.deepEqual(getDue(reloaded, now), ['BR']);
    const reviewTime = reloaded.cards.JP.due;
    assert.deepEqual(grade(reloaded, 'JP', true, reviewTime), grade(reviewed, 'JP', true, reviewTime));
  });
});

test('ignores unsupported or malformed progress without rewriting storage', () => {
  withStorage((entries) => {
    saveProgress(addFive(loadProgress(), ['JP', 'BR'], now));
    const [[key, raw]] = entries;
    const data = JSON.parse(raw);
    for (const invalid of ['{', JSON.stringify({ ...data, version: 99 })]) {
      entries.set(key, invalid);
      assert.deepEqual(knownCodes(loadProgress()), []);
      assert.equal(entries.get(key), invalid);
    }

    data.cards.JP.due = 'not a date';
    entries.set(key, JSON.stringify(data));
    assert.deepEqual(knownCodes(loadProgress()), ['BR']);
    assert.deepEqual(getDue(loadProgress(), now), ['BR']);
  });
});

test('can initialize progress when browser storage is denied', () => {
  withStorage(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('Storage denied'); },
    });
    const state = loadProgress();
    assert.deepEqual(knownCodes(state), []);
    assert.equal(saveProgress(state), false);
  });
});

test('heatmap counts wrong and repeated same-day grades but not enrollment', () => {
  withStorage(() => {
    const enrolled = addFive(loadProgress(), ['JP', 'BR'], now);
    assert.equal(saveProgress(enrolled), true);
    assert.deepEqual(getHeatmapData(loadProgress()), { reviews: [], due: [] });

    const later = new Date('2026-01-01T12:01:00Z');
    const wrong = grade(enrolled, 'JP', false, now);
    const right = grade(wrong, 'JP', true, later);
    const repeated = grade(right, 'JP', false, later);
    const unchanged = grade(repeated, 'CA', false, later);
    assert.equal(saveProgress(unchanged), true);
    assert.deepEqual(getHeatmapData(wrong).reviews.map(isoTimestamp), [now.toISOString()]);
    assert.deepEqual(getHeatmapData(unchanged).reviews.map(isoTimestamp), [
      now.toISOString(), later.toISOString(), later.toISOString(),
    ]);
  });
});

test('heatmap history survives reload without duplicating same-time attempts', () => {
  withStorage(() => {
    const enrolled = addFive(loadProgress(), ['JP', 'BR'], now);
    const reviewed = grade(grade(enrolled, 'JP', false, now), 'JP', true, now);
    assert.equal(saveProgress(reviewed), true);
    const reloaded = loadProgress();
    assert.deepEqual(getHeatmapData(reloaded), getHeatmapData(reviewed));
    assert.equal(saveProgress(reloaded), true);
    assert.deepEqual(getHeatmapData(loadProgress()).reviews.map(isoTimestamp), [
      now.toISOString(), now.toISOString(),
    ]);

    const later = reloaded.cards.JP.due;
    assert.equal(saveProgress(grade(reloaded, 'JP', true, later)), true);
    assert.deepEqual(getHeatmapData(loadProgress()).reviews.map(isoTimestamp), [
      now.toISOString(), now.toISOString(), later.toISOString(),
    ]);
  });
});

test('heatmap reports one current FSRS due per graded flag after a future reschedule', () => {
  withStorage(() => {
    const enrolled = addFive(loadProgress(), ['JP', 'BR', 'FR'], now);
    const scheduled = grade(grade(enrolled, 'JP', true, now), 'BR', true, now);
    const originalDue = scheduled.cards.JP.due;
    assert.ok(originalDue > now);
    assert.deepEqual(getHeatmapData(scheduled).due.map(isoTimestamp), [
      originalDue.toISOString(), originalDue.toISOString(),
    ]);

    const rescheduled = grade(scheduled, 'JP', true, originalDue);
    const newDue = rescheduled.cards.JP.due;
    assert.ok(newDue > originalDue);
    assert.deepEqual(getHeatmapData(rescheduled).due.map(isoTimestamp).sort(), [
      originalDue.toISOString(), newDue.toISOString(),
    ]);
  });
});

test('legacy saves keep their due dates without inventing review history', () => {
  withStorage(() => {
    const scheduler = fsrs({ enable_fuzz: false });
    const first = scheduler.next(createEmptyCard(now), now, Rating.Good).card;
    const second = scheduler.next(first, first.due, Rating.Good).card;
    assert.equal(saveProgress({ version: 1, cards: { JP: second, BR: createEmptyCard(now) } }), true);

    const legacy = loadProgress();
    assert.deepEqual(getHeatmapData(legacy).reviews, []);
    assert.deepEqual(getHeatmapData(legacy).due.map(isoTimestamp), [second.due.toISOString()]);
    assert.equal(saveProgress(grade(legacy, 'JP', true, second.due)), true);
    assert.deepEqual(getHeatmapData(loadProgress()).reviews.map(isoTimestamp), [second.due.toISOString()]);
  });
});

function isoTimestamp({ at }) {
  return new Date(at).toISOString();
}

function withStorage(run) {
  const entries = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, String(value)),
    },
  });
  try {
    return run(entries);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
}
