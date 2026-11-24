import assert from 'node:assert/strict';
import type { SavedCard } from '../src/engine.ts';

interface ProgressFixture {
  version: number;
  cards: Record<string, SavedCard>;
  reviewLog?: string[];
  reviewCountries?: Record<number, string>;
  retryQueue?: string[];
}

// Inspect exact serialized output without the production reader normalizing it first.
export function parseSavedProgress(raw: string | null): ProgressFixture {
  assert.ok(raw, 'Expected saved progress');
  const data: unknown = JSON.parse(raw);
  assert.ok(data && typeof data === 'object' && 'cards' in data && data.cards);
  return data as ProgressFixture;
}
