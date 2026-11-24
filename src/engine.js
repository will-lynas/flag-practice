import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';

const VERSION = 1;
const STORAGE_KEY = `flag-trainer:progress:v${VERSION}`;
const scheduler = fsrs({ enable_fuzz: false });
const cardNumbers = [
  'stability', 'difficulty', 'elapsed_days', 'scheduled_days',
  'learning_steps', 'reps', 'lapses',
];

function hydrateCard(card) {
  if (!card || typeof card.due !== 'string' ||
      !cardNumbers.every((key) => Number.isFinite(card[key]) && card[key] >= 0) ||
      ![State.New, State.Learning, State.Review, State.Relearning].includes(card.state)) {
    return null;
  }
  const due = new Date(card.due);
  if (!Number.isFinite(due.getTime())) return null;

  let last_review;
  if (card.last_review !== undefined) {
    if (typeof card.last_review !== 'string') return null;
    last_review = new Date(card.last_review);
    if (!Number.isFinite(last_review.getTime())) return null;
  } else if (card.state !== State.New) {
    return null;
  }
  return { ...card, due, last_review };
}

export function loadProgress({ strict = false } = {}) {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw != null) {
      const data = JSON.parse(raw);
      if (data?.version === VERSION && data.cards &&
          typeof data.cards === 'object' && !Array.isArray(data.cards)) {
        const cards = [];
        for (const [code, savedCard] of Object.entries(data.cards)) {
          const card = hydrateCard(savedCard);
          if (card) cards.push([code, card]);
          else if (strict) throw new Error('Invalid saved card');
        }
        const state = { ...data, cards: Object.fromEntries(cards) };
        // Older saves have schedules but no attempt history to backfill.
        if (Array.isArray(data.reviewLog)) {
          state.reviewLog = data.reviewLog.filter((at) =>
            typeof at === 'string' && Number.isFinite(Date.parse(at)));
          if (strict && state.reviewLog.length !== data.reviewLog.length) throw new Error('Invalid review history');
        } else if (strict && data.reviewLog !== undefined) {
          throw new Error('Invalid review history');
        }
        return state;
      }
      if (strict) throw new Error('Invalid or unsupported saved progress');
    }
  } catch (error) {
    if (strict) throw error;
    // Storage can be denied, or the saved JSON can be corrupt.
  }
  return { version: VERSION, cards: {} };
}

// Returns false if storage is unavailable or the write fails (e.g. quota).
export function saveProgress(state) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    const raw = JSON.stringify(state);
    storage.setItem(STORAGE_KEY, raw);
    return storage.getItem(STORAGE_KEY) === raw;
  } catch {
    return false;
  }
}

export function knownCodes(state) {
  return Object.keys(state.cards);
}

// Sort oldest first; stable sort keeps enrollment order when due dates tie.
export function getDue(state, now = new Date(), allowed) {
  return Object.entries(state.cards)
    .filter(([code, card]) => (!allowed || allowed.has(code)) && card.due <= now)
    .sort(([, a], [, b]) => a.due - b.due)
    .map(([code]) => code);
}

export function nextDue(state, allowed) {
  let earliest = null;
  for (const [code, { due }] of Object.entries(state.cards)) {
    if (allowed && !allowed.has(code)) continue;
    if (earliest === null || due < earliest) earliest = due;
  }
  return earliest === null ? null : new Date(earliest);
}

export function getHeatmapData(state) {
  return {
    reviews: (state.reviewLog ?? []).map((at) => ({ at })),
    due: Object.values(state.cards)
      .filter((card) => card.state !== State.New)
      .map((card) => ({ at: new Date(card.due) })),
  };
}

export function addFive(state, orderedCodes, now = new Date()) {
  const cards = new Map(Object.entries(state.cards));
  const startingSize = cards.size;
  for (const code of orderedCodes) {
    if (cards.has(code)) continue;
    cards.set(code, createEmptyCard(new Date(now)));
    if (cards.size - startingSize === 5) break;
  }
  return cards.size === startingSize ? state : { ...state, cards: Object.fromEntries(cards) };
}

export function grade(state, code, correct, now = new Date()) {
  if (!Object.hasOwn(state.cards, code)) return state;
  const rating = correct ? Rating.Good : Rating.Again;
  const { card } = scheduler.next(state.cards[code], new Date(now), rating);
  return {
    ...state,
    cards: { ...state.cards, [code]: card },
    reviewLog: [...(state.reviewLog ?? []), card.last_review.toISOString()],
  };
}
