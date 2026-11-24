import { countriesIn, regions } from './countries.ts';
import type { Country, Region } from './countries.ts';
import type { ProgressData } from './engine.ts';

export const statuses = Object.freeze(['Not started', 'Learning', 'Learnt'] as const);

type Status = (typeof statuses)[number];
type CountryRow = { country: Country } & (
  | { status: 'Not started'; due: null }
  | { status: 'Learning' | 'Learnt'; due: Date }
);

function summarize(rows: readonly CountryRow[]) {
  const counts: Record<Status, number> = { 'Not started': 0, Learning: 0, Learnt: 0 };
  for (const row of rows) counts[row.status]++;
  return { counts, total: rows.length };
}

export function getStats(state: Pick<ProgressData, 'cards'>, region: Region, now = new Date()) {
  const rows = countriesIn(region).map((country): CountryRow => {
    const card = state.cards[country.code];
    if (!card?.last_review) return { country, status: 'Not started', due: null };
    return { country, status: card.scheduled_days >= 14 ? 'Learnt' : 'Learning', due: card.due };
  }).sort((a, b) => a.country.name.localeCompare(b.country.name, 'en'));
  const byCode = new Map(rows.map(row => [row.country.code, row]));
  return {
    ...summarize(rows),
    rows,
    dueNow: rows.filter(row => row.due && row.due <= now).length,
    breakdown: regions.slice(1).map(({ id, label }) => ({ id, label,
      ...summarize(countriesIn(id).map(country => byCode.get(country.code)).filter(row => row !== undefined)),
    })).filter(row => row.total),
  };
}
