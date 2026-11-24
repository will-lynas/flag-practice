const DAY_MS = 86_400_000;

// Represent each local calendar date as a UTC civil-day ordinal, not an elapsed local day.
export const civilDate = day => new Date(day * DAY_MS);
function civilDay(year, month, date) {
  return new Date(0).setUTCFullYear(year, month, date) / DAY_MS;
}
export const localDay = date => civilDay(date.getFullYear(), date.getMonth(), date.getDate());

function parseEntry(at) {
  if (typeof at !== 'string' && Object.prototype.toString.call(at) !== '[object Date]') return null;
  if (typeof at === 'string') {
    const parts = /^(\d{4})-(\d{2})-(\d{2})(?=$|T)/.exec(at);
    if (parts) {
      const [, year, month, date] = parts;
      const day = civilDay(+year, month - 1, +date);
      if (civilDate(day).toISOString().slice(0, 10) !== parts[0]) return null;
      // A bare YYYY-MM-DD is already a local calendar date, not midnight UTC.
      if (at === parts[0]) return { day, time: null };
    }
  }
  const date = new Date(at);
  return Number.isFinite(+date) ? { day: localDay(date), time: +date } : null;
}

function countDays(entries, bucket) {
  const counts = new Map();
  for (const entry of entries) {
    const value = parseEntry(entry?.at);
    if (!value) continue;
    const day = bucket(value);
    if (day !== null) counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return counts;
}

// These are two independent snapshots, not two series on a shared axis.
export function completedCalendar(reviews, now) {
  const today = localDay(now);
  const counts = countDays(reviews, ({ day, time }) =>
    day <= today && (time === null || time <= +now) ? day : null);
  return { kind: 'completed', today, counts };
}

export function dueCalendar(due, now) {
  const today = localDay(now);
  let overdue = 0;
  const counts = countDays(due, ({ day }) => {
    if (day < today) overdue++;
    return Math.max(today, day);
  });
  return { kind: 'due', today, counts, overdue };
}
