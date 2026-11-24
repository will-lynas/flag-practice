import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';
import type { Card } from 'ts-fsrs';
import type { CalendarEntry } from './review-calendar-data.ts';

const VERSION = 1;
const STORAGE_KEY = `flag-trainer:progress:v${VERSION}`;
const scheduler = fsrs({ enable_fuzz: false });
const cardNumbers = [
  'stability', 'difficulty', 'elapsed_days', 'scheduled_days',
  'learning_steps', 'reps', 'lapses',
] as const satisfies readonly (keyof Card)[];

export type SavedCard = Omit<Card, 'due' | 'last_review'> & { due: string; last_review?: string };
type ReviewCountries = Readonly<Partial<Record<number, string>>>;

export interface ProgressData {
  cards: Readonly<Partial<Record<string, Card>>>;
  reviewLog?: readonly string[];
  reviewCountries?: ReviewCountries;
  retryQueue?: readonly string[];
}

export interface Progress extends ProgressData {
  version: typeof VERSION;
}

// The non-strict reader historically leaves a malformed non-array log untouched.
type LenientProgress = Omit<Progress, 'reviewLog'> & { reviewLog?: unknown };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSavedCard(card: unknown): card is SavedCard {
  if (!isRecord(card) || typeof card.due !== 'string' ||
      !cardNumbers.every(key => {
        const value = card[key];
        return typeof value === 'number' && Number.isFinite(value) && value >= 0;
      })) return false;
  if (card.state !== State.New && card.state !== State.Learning &&
      card.state !== State.Review && card.state !== State.Relearning) return false;
  return card.last_review === undefined ? card.state === State.New : typeof card.last_review === 'string';
}

function hydrateCard(card: unknown): Card | null {
  if (!isSavedCard(card)) return null;
  const due = new Date(card.due);
  if (!Number.isFinite(due.getTime())) return null;
  const last_review = card.last_review === undefined ? undefined : new Date(card.last_review);
  if (last_review && !Number.isFinite(last_review.getTime())) return null;
  return { ...card, due, last_review };
}

function isReviewIndex(index: unknown, length: number): index is ReviewCountries {
  return isRecord(index) && Object.entries(index).every(([i, code]) =>
    /^(0|[1-9]\d*)$/.test(i) && +i < length && typeof code === 'string' && /^[A-Z]{2}$/.test(code));
}

export function loadProgress(options: { strict: true }): Progress;
export function loadProgress(options?: { strict?: boolean }): LenientProgress;
export function loadProgress({ strict = false } = {}): LenientProgress {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw != null) {
      const data: unknown = JSON.parse(raw);
      if (isRecord(data) && data.version === VERSION && isRecord(data.cards)) {
        const cards: [string, Card][] = [];
        for (const [code, savedCard] of Object.entries(data.cards)) {
          const card = hydrateCard(savedCard);
          if (card) cards.push([code, card]);
          else if (strict) throw new Error('Invalid saved card');
        }
        // Spread the saved objects to retain extension fields and the v1 serialization order.
        const state = { ...data, version: VERSION, cards: Object.fromEntries(cards) } satisfies LenientProgress;
        if (data.retryQueue !== undefined) {
          const queue: unknown[] = Array.isArray(data.retryQueue) ? data.retryQueue : [];
          const retryQueue = [...new Set(queue.filter((code): code is string =>
            typeof code === 'string' && Object.hasOwn(state.cards, code) && !!state.cards[code].last_review))];
          if (strict && (!Array.isArray(data.retryQueue) || retryQueue.length !== queue.length)) {
            throw new Error('Invalid retry queue');
          }
          Object.assign(state, { retryQueue });
        }
        // Older saves have schedules but no attempt history to backfill.
        let reviewLog = data.reviewLog;
        let reviewCountries = data.reviewCountries;
        if (Array.isArray(reviewLog)) {
          const entries: unknown[] = reviewLog;
          const filtered = entries.filter(at => typeof at === 'string' && Number.isFinite(Date.parse(at)));
          if (strict && filtered.length !== entries.length) throw new Error('Invalid review history');
          // Filtering invalid timestamps would shift country annotations to the wrong attempts.
          if (filtered.length !== entries.length) reviewCountries = undefined;
          reviewLog = filtered;
          Object.assign(state, { reviewLog });
        } else if (strict && reviewLog !== undefined) {
          throw new Error('Invalid review history');
        }
        if (data.reviewCountries !== undefined) {
          const length = Array.isArray(reviewLog) || typeof reviewLog === 'string' ? reviewLog.length
            : isRecord(reviewLog) ? Number(reviewLog.length ?? 0) : 0;
          if (reviewCountries === undefined || !isReviewIndex(reviewCountries, length)) {
            if (strict) throw new Error('Invalid review attribution');
            Reflect.deleteProperty(state, 'reviewCountries');
          }
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
export function saveProgress(state: LenientProgress) {
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

export function knownCodes(state: Pick<ProgressData, 'cards'>) {
  return Object.keys(state.cards);
}

// Sort oldest first; stable sort keeps enrollment order when due dates tie.
type DueCards = { cards: Readonly<Partial<Record<string, Pick<Card, 'due'>>>> };
type AllowedCodes = ReadonlySet<string>;

export function getDue(state: DueCards, now = new Date(), allowed?: AllowedCodes) {
  return Object.entries(state.cards)
    .filter((entry): entry is [string, Pick<Card, 'due'>] => {
      const [code, card] = entry;
      return card !== undefined && (!allowed || allowed.has(code)) && card.due <= now;
    })
    .sort(([, a], [, b]) => a.due.getTime() - b.due.getTime())
    .map(([code]) => code);
}

export function getPracticeQueues(state: ProgressData, now: Date, allowed?: AllowedCodes) {
  const pending = new Set(state.retryQueue);
  return {
    // A pending retry keeps its FIFO slot even if its scheduled due time arrives.
    due: getDue(state, now, allowed).filter(code => !pending.has(code)),
    retries: [...pending].filter(code => !allowed || allowed.has(code)),
  };
}

export function nextDue(state: DueCards, allowed?: AllowedCodes) {
  let earliest: Date | null = null;
  for (const [code, card] of Object.entries(state.cards)) {
    if (!card || (allowed && !allowed.has(code))) continue;
    const { due } = card;
    if (earliest === null || due < earliest) earliest = due;
  }
  return earliest === null ? null : new Date(earliest);
}

export function getHeatmapData(state: ProgressData, allowed?: AllowedCodes, { includeUnassigned = !allowed } = {}) {
  const reviews: CalendarEntry<string>[] = [];
  for (const [index, at] of (state.reviewLog ?? []).entries()) {
    const code = state.reviewCountries?.[index];
    if (!allowed || (code === undefined ? includeUnassigned : allowed.has(code))) reviews.push({ at });
  }
  return {
    reviews,
    due: Object.entries(state.cards)
      .flatMap(([code, card]) => (!allowed || allowed.has(code)) && card && card.state !== State.New
        ? [{ at: new Date(card.due) }] : []),
  };
}

export function addFive(state: Progress, orderedCodes: Iterable<string>, now = new Date()): Progress {
  const cards = new Map(Object.entries(state.cards));
  const startingSize = cards.size;
  for (const code of orderedCodes) {
    if (cards.has(code)) continue;
    cards.set(code, createEmptyCard(new Date(now)));
    if (cards.size - startingSize === 5) break;
  }
  return cards.size === startingSize ? state : { ...state, cards: Object.fromEntries(cards) };
}

export function grade(state: Progress, code: string, correct: boolean, now = new Date()): Progress {
  if (!Object.hasOwn(state.cards, code)) return state;
  const rating = correct ? Rating.Good : Rating.Again;
  const current = state.cards[code];
  if (!current) return state;
  const { card } = scheduler.next(current, new Date(now), rating);
  return logAttempt({ ...state, cards: { ...state.cards, [code]: card } }, code, now);
}

export function recordAttempt(state: Progress, code: string, correct: boolean, now = new Date()): Progress {
  if (!Object.hasOwn(state.cards, code)) return state;
  const card = state.cards[code];
  if (!card) return state;
  const queue = state.retryQueue ?? [];
  const retry = queue.includes(code);
  // Early retries are practice only. If already due, this one attempt also fulfills
  // the scheduled review; never replace the original Again or grade the click twice.
  const updated = !retry || card.due <= now
    ? grade(state, code, correct, now)
    : logAttempt(state, code, now);
  if (correct && !retry) return updated;
  const retryQueue = queue.filter(item => item !== code);
  if (!correct) retryQueue.push(code);
  return { ...updated, retryQueue };
}

function logAttempt(state: Progress, code: string, now: Date): Progress {
  const log = state.reviewLog ?? [];
  return {
    ...state,
    reviewLog: [...log, new Date(now).toISOString()],
    // Sparse annotations leave v1 timestamps readable by older builds and never guess older countries.
    reviewCountries: { ...state.reviewCountries, [log.length]: code },
  };
}
