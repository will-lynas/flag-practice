const DAY_MS = 86_400_000;
const WEEKS = 13;
const DAYS = WEEKS * 7;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const fullDate = new Intl.DateTimeFormat('en', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
});
const monthName = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });
const rangeDate = new Intl.DateTimeFormat('en', {
  year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
});

// Represent each local calendar date as a UTC civil-day ordinal, not an elapsed local day.
const civilDate = day => new Date(day * DAY_MS);
function civilDay(year, month, date) {
  return new Date(0).setUTCFullYear(year, month, date) / DAY_MS;
}
const localDay = date => civilDay(date.getFullYear(), date.getMonth(), date.getDate());

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

function level(count) {
  return count === 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : count < 30 ? 3 : 4;
}

/**
 * Render into a dedicated container. Load heatmap.css separately in the parent.
 * Call again with the latest snapshot after grading or rescheduling, or at local midnight.
 * `reviews` contains one row per graded attempt; `due` contains one current row per card.
 * Dates or ISO timestamps are bucketed in the browser's local calendar; a due date before
 * today counts toward today's remaining and overdue, not any historical cell.
 */
export function renderHeatmap(container, { reviews, due }, now = new Date()) {
  const today = localDay(now);
  const attempts = countDays(reviews, ({ day, time }) =>
    day <= today && (time === null || time <= +now) ? day : null);
  const scheduled = countDays(due, ({ day }) => day);
  let overdue = 0;
  for (const [day, count] of scheduled) if (day < today) overdue += count;

  const doc = container.ownerDocument;
  function el(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = `flag-heatmap__${className}`;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, className, label) {
    const node = el('button', className, text);
    node.type = 'button';
    if (label) node.setAttribute('aria-label', label);
    return node;
  }
  function counts(day) {
    const done = attempts.get(day) ?? 0;
    const pending = day < today ? 0 : (scheduled.get(day) ?? 0) + (day === today ? overdue : 0);
    const text = day < today ? `${done} ${done === 1 ? 'attempt' : 'attempts'}`
      : day > today ? `${pending} ${pending === 1 ? 'card' : 'cards'} due`
      : `${done} completed · ${pending} remaining (${overdue} overdue)`;
    return { done, pending, text };
  }

  const root = el('section');
  root.className = 'flag-heatmap';
  const header = el('header', 'header');
  const title = el('h2', 'title', 'Review activity');
  const range = el('div', 'range');
  range.setAttribute('role', 'status');
  const heading = el('div');
  heading.append(title, range);
  const nav = el('div', 'nav');
  const prev = button('‹', 'page', `Previous ${WEEKS} weeks`);
  const reset = button('Today', 'page');
  const next = button('›', 'page', `Next ${WEEKS} weeks`);
  nav.append(prev, reset, next);
  header.append(heading, nav);

  const viewport = el('div', 'viewport');
  viewport.tabIndex = -1;
  const grid = el('table', 'grid');
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Review calendar');
  grid.setAttribute('aria-description', 'Arrow keys move by day or week. Page Up and Page Down change the range.');
  viewport.append(grid);
  const detail = el('div', 'detail');
  const legend = el('ul', 'legend');
  for (const [label, scale] of [['Completed', 'completed'], ['Due', 'due'], ['Today', 'today']]) {
    const item = el('li', 'key', label);
    const swatches = el('span', 'swatches');
    swatches.setAttribute('aria-hidden', 'true');
    for (let intensity = 1; intensity <= (scale === 'today' ? 1 : 4); intensity++) {
      const swatch = el('span', 'swatch');
      swatch.dataset[scale] = intensity;
      swatch.title = scale === 'today' ? 'Today' : ['1–4', '5–14', '15–29', '30+'][intensity - 1];
      swatches.append(swatch);
    }
    if (scale !== 'today') swatches.title = 'Lighter to darker: fewer to more';
    item.append(swatches);
    legend.append(item);
  }
  root.append(header, viewport, detail, legend);

  const home = today - (civilDate(today).getUTCDay() + 6) % 7 - 8 * 7;
  const tiles = new Map();
  let first = home;
  let active = today;
  let hovered, focused, pinned;

  function showDetail() {
    const day = hovered ?? focused ?? pinned ?? (first === home ? today : undefined);
    detail.textContent = day === undefined ? ''
      : `${day === today ? 'Today' : fullDate.format(civilDate(day))}: ${counts(day).text}`;
  }

  function setActive(day) {
    if (day === active) return;
    tiles.get(active).tabIndex = -1;
    tiles.get(day).tabIndex = 0;
    active = day;
  }

  function reveal(tile) {
    const { left, right } = viewport.getBoundingClientRect();
    const box = tile.getBoundingClientRect();
    if (box.left < left + 3) viewport.scrollLeft -= left + 3 - box.left;
    else if (box.right > right - 3) viewport.scrollLeft += box.right - right + 3;
  }

  function clearPin() {
    if (pinned !== undefined) tiles.get(pinned).setAttribute('aria-pressed', 'false');
    pinned = undefined;
  }

  function renderPage() {
    const head = el('thead');
    const monthRow = el('tr');
    head.setAttribute('aria-hidden', 'true');
    monthRow.append(el('td', 'weekday'));
    let month;
    for (let week = 0; week < WEEKS; week++) {
      // A week that contains the start of a new month carries that month's label.
      const date = civilDate(first + week * 7 + (week === 0 ? 0 : 6));
      const changed = date.getUTCMonth() !== month;
      monthRow.append(el('td', 'month', changed ? monthName.format(date) : ''));
      month = date.getUTCMonth();
    }
    head.append(monthRow);
    const body = el('tbody');
    tiles.clear();
    for (const [weekday, name] of WEEKDAYS.entries()) {
      const row = el('tr');
      const heading = el('th', 'weekday', [0, 2, 4, 6].includes(weekday) ? name.slice(0, 3) : '');
      heading.scope = 'row';
      heading.setAttribute('aria-label', name);
      row.append(heading);
      for (let week = 0; week < WEEKS; week++) {
        const day = first + week * 7 + weekday;
        const date = civilDate(day);
        const { done, pending, text } = counts(day);
        const tile = button('', 'tile', `${fullDate.format(date)}: ${text}`);
        tile.dataset.date = date.toISOString().split('T')[0];
        tile.dataset.completed = level(done);
        tile.dataset.due = level(pending);
        tile.dataset.period = day < today ? 'past' : day > today ? 'future' : 'today';
        tile.tabIndex = day === active ? 0 : -1;
        tile.setAttribute('aria-pressed', 'false');
        if (day === today) tile.setAttribute('aria-current', 'date');
        const cell = el('td');
        cell.append(tile);
        row.append(cell);
        tiles.set(day, tile);

        tile.addEventListener('pointerover', event => {
          if (event.pointerType === 'touch') return;
          hovered = day;
          showDetail();
        });
        tile.addEventListener('pointerout', () => {
          if (hovered === day) hovered = undefined;
          showDetail();
        });
        tile.addEventListener('pointerdown', () => { focused = undefined; });
        tile.addEventListener('focus', () => {
          setActive(day);
          if (tile.matches(':focus-visible')) {
            hovered = undefined;
            focused = day;
            showDetail();
          }
        });
        tile.addEventListener('blur', () => {
          focused = undefined;
          showDetail();
        });
        tile.addEventListener('click', () => {
          setActive(day);
          const toggleOff = pinned === day;
          clearPin();
          if (!toggleOff) {
            pinned = day;
            tile.setAttribute('aria-pressed', 'true');
          }
          if (!tile.matches(':focus-visible')) focused = undefined;
          showDetail();
        });
      }
      body.append(row);
    }
    grid.replaceChildren(head, body);
    range.textContent = rangeDate.formatRange(civilDate(first), civilDate(first + DAYS - 1));
    showDetail();
  }

  function showDay(day, moveFocus = false) {
    const start = home + Math.floor((day - home) / DAYS) * DAYS;
    if (start !== first) {
      first = start;
      active = day;
      hovered = focused = pinned = undefined;
      renderPage();
    } else {
      setActive(day);
    }
    const tile = tiles.get(day);
    if (moveFocus) {
      tile.focus({ preventScroll: true });
      hovered = undefined;
      focused = day;
      showDetail();
    }
    reveal(tile);
  }

  prev.addEventListener('click', () => showDay(active - DAYS));
  next.addEventListener('click', () => showDay(active + DAYS));
  reset.addEventListener('click', () => {
    clearPin();
    hovered = focused = undefined;
    showDay(today);
    showDetail();
  });
  grid.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.metaKey || event.shiftKey) return;
    if (event.ctrlKey && !['Home', 'End'].includes(event.key)) return;
    const weekday = (active - first) % 7;
    const moves = {
      ArrowUp: active - 1, ArrowDown: active + 1, ArrowLeft: active - 7, ArrowRight: active + 7,
      Home: first + (event.ctrlKey ? 0 : weekday),
      End: first + (event.ctrlKey ? DAYS - 1 : DAYS - 7 + weekday),
      PageUp: active - DAYS, PageDown: active + DAYS,
    };
    if (Object.hasOwn(moves, event.key)) {
      event.preventDefault();
      showDay(moves[event.key], true);
    } else if (event.key === 'Escape' && (pinned !== undefined || focused !== undefined || hovered !== undefined)) {
      event.preventDefault();
      clearPin();
      hovered = focused = undefined;
      showDetail();
    }
  });

  renderPage();
  container.replaceChildren(root);
  reveal(tiles.get(today));
}
