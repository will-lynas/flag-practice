import { countriesIn, regions } from './countries.js';

export const statuses = Object.freeze(['Not started', 'Learning', 'Learnt']);

function summarize(rows) {
  const counts = Object.fromEntries(statuses.map(status => [status, 0]));
  for (const row of rows) counts[row.status]++;
  return { counts, total: rows.length };
}

export function getStats(state, region, now = new Date()) {
  const rows = countriesIn(region).map(country => {
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
      ...summarize(countriesIn(id).map(country => byCode.get(country.code)).filter(Boolean)),
    })).filter(row => row.total),
  };
}
