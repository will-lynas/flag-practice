import { civilDate } from './review-calendar-data.js';

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
const level = count => count === 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : count < 30 ? 3 : 4;

export function renderHeatmap(container, { kind, today, counts, overdue }, activate) {
  const isDue = kind === 'due';
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
  function countLabel(day) {
    const count = counts.get(day) ?? 0;
    if (!isDue) return `${count} ${count === 1 ? 'attempt' : 'attempts'}`;
    const label = `${count} ${count === 1 ? 'card' : 'cards'} due`;
    return day === today ? `${label} (${overdue} overdue)` : label;
  }

  const root = el('section');
  root.className = 'flag-heatmap';
  root.dataset.calendar = kind;
  const header = el('header', 'header');
  const title = el('h3', 'title', isDue ? 'Reviews due' : 'Completed reviews');
  title.id = `reviews-${kind}-title`;
  root.setAttribute('aria-labelledby', title.id);
  root.append(header);
  container.append(root);
  if (!counts.size) {
    header.append(title);
    root.append(el('p', 'empty', isDue ? 'No reviews due.' : 'No completed reviews recorded.'));
    root.addEventListener('pointerover', () => activate());
    return;
  }

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
  const grid = el('table', 'grid');
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-labelledby', title.id);
  grid.setAttribute('aria-description', 'Arrow keys move by day or week. Page Up and Page Down change the range.');
  viewport.append(grid);
  const detail = el('div', 'detail');
  const legend = el('div', 'legend');
  const key = el('span', 'key', 'Fewer');
  const swatches = el('span', 'swatches');
  swatches.setAttribute('aria-hidden', 'true');
  for (const [index, label] of ['1–4', '5–14', '15–29', '30+'].entries()) {
    const swatch = el('span', 'swatch');
    swatch.dataset.level = index + 1;
    swatch.title = label;
    swatches.append(swatch);
  }
  key.append(swatches, 'More');
  const todayKey = el('span', 'key', 'Today');
  const todaySwatch = el('span', 'swatch');
  todaySwatch.dataset.today = '';
  todaySwatch.setAttribute('aria-hidden', 'true');
  todayKey.prepend(todaySwatch);
  legend.append(key, todayKey);
  root.append(viewport, detail, legend);

  // Put today in the last week of history and the first week of the schedule.
  const monday = today - (civilDate(today).getUTCDay() + 6) % 7;
  const home = isDue ? monday : monday - (WEEKS - 1) * 7;
  const pageStart = day => home + Math.floor((day - home) / DAYS) * DAYS;
  let edge = today;
  for (const day of counts.keys()) edge = isDue ? Math.max(edge, day) : Math.min(edge, day);
  const earliest = isDue ? today : pageStart(edge);
  const latest = isDue ? pageStart(edge) + DAYS - 1 : today;
  const tiles = new Map();
  let first = home;
  let active = today;
  let hovered, focused, pinned;

  function showDetail() {
    const day = hovered ?? focused ?? pinned ?? (first === home ? today : undefined);
    detail.textContent = day === undefined ? ''
      : `${day === today ? 'Today' : fullDate.format(civilDate(day))}: ${countLabel(day)}`;
  }

  function setActive(day) {
    if (day === active) return;
    tiles.get(active).tabIndex = -1;
    tiles.get(day).tabIndex = 0;
    active = day;
  }

  function reveal(tile) {
    if (tile.parentElement.cellIndex === 1) {
      viewport.scrollLeft = 0;
      return;
    }
    const { left, right } = viewport.getBoundingClientRect();
    const box = tile.getBoundingClientRect();
    if (box.left < left + 3) viewport.scrollLeft -= Math.ceil(left + 3 - box.left);
    else if (box.right > right - 3) viewport.scrollLeft += Math.ceil(box.right - right + 3);
  }

  function clearPin() {
    if (pinned !== undefined) tiles.get(pinned).setAttribute('aria-pressed', 'false');
    pinned = undefined;
  }

  function clearDetail() {
    clearPin();
    hovered = focused = undefined;
    showDetail();
  }

  root.addEventListener('pointerover', event => {
    if (event.pointerType !== 'touch') activate(clearDetail);
  });
  root.addEventListener('focusin', () => activate(clearDetail));
  root.addEventListener('focusout', event => {
    if (!root.contains(event.relatedTarget)) clearDetail();
  });

  function renderPage() {
    const head = el('thead');
    const monthRow = el('tr');
    head.setAttribute('aria-hidden', 'true');
    monthRow.append(el('td', 'weekday'));
    let month;
    for (let week = 0; week < WEEKS; week++) {
      const start = Math.max(first + week * 7, earliest);
      const end = Math.min(first + week * 7 + 6, latest);
      // A week that contains a month boundary carries the new month's label.
      const date = civilDate(month === undefined ? start : end);
      const changed = start <= end && date.getUTCMonth() !== month;
      monthRow.append(el('td', 'month', changed ? monthName.format(date) : ''));
      if (start <= end) month = date.getUTCMonth();
    }
    head.append(monthRow);
    const body = el('tbody');
    tiles.clear();
    for (const [weekday, name] of WEEKDAYS.entries()) {
      const row = el('tr');
      const label = el('th', 'weekday', [0, 2, 4, 6].includes(weekday) ? name.slice(0, 3) : '');
      label.scope = 'row';
      label.setAttribute('aria-label', name);
      row.append(label);
      for (let week = 0; week < WEEKS; week++) {
        const day = first + week * 7 + weekday;
        const cell = el('td');
        row.append(cell);
        if (day < earliest || day > latest) continue;
        const date = civilDate(day);
        const tile = button('', 'tile', `${fullDate.format(date)}: ${countLabel(day)}`);
        tile.dataset.date = date.toISOString().split('T')[0];
        tile.dataset.level = level(counts.get(day) ?? 0);
        tile.tabIndex = day === active ? 0 : -1;
        tile.setAttribute('aria-pressed', 'false');
        if (day === today) tile.setAttribute('aria-current', 'date');
        cell.append(tile);
        tiles.set(day, tile);

        let pointerType;
        tile.addEventListener('pointerdown', event => { pointerType = event.pointerType; });
        tile.addEventListener('pointerover', event => {
          if (event.pointerType === 'touch') return;
          focused = undefined;
          hovered = day;
          showDetail();
        });
        tile.addEventListener('pointerout', () => {
          if (hovered === day) hovered = undefined;
          showDetail();
        });
        tile.addEventListener('focus', () => {
          setActive(day);
          if (tile.matches(':focus-visible')) {
            reveal(tile);
            hovered = undefined;
            focused = day;
            showDetail();
          }
        });
        tile.addEventListener('blur', () => {
          focused = undefined;
          showDetail();
        });
        tile.addEventListener('click', event => {
          activate(clearDetail);
          setActive(day);
          const toggleOff = pinned === day;
          clearPin();
          // Mouse details follow the pointer; tap or keyboard activation can pin a date.
          if (!toggleOff && ((event.pointerType || pointerType) === 'touch' || event.detail === 0)) {
            pinned = day;
            tile.setAttribute('aria-pressed', 'true');
          }
          pointerType = undefined;
          if (!tile.matches(':focus-visible')) focused = undefined;
          showDetail();
        });
      }
      body.append(row);
    }
    grid.replaceChildren(head, body);
    const start = Math.max(first, earliest);
    const end = Math.min(first + DAYS - 1, latest);
    range.textContent = rangeDate.formatRange(civilDate(start), civilDate(end));
    prev.setAttribute('aria-disabled', String(start === earliest));
    next.setAttribute('aria-disabled', String(end === latest));
    showDetail();
  }

  function showDay(day, moveFocus = false) {
    day = Math.min(latest, Math.max(earliest, day));
    if (day === active && moveFocus) return;
    const start = pageStart(day);
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

  prev.addEventListener('click', () => {
    if (prev.getAttribute('aria-disabled') === 'false') showDay(active - DAYS);
  });
  next.addEventListener('click', () => {
    if (next.getAttribute('aria-disabled') === 'false') showDay(active + DAYS);
  });
  reset.addEventListener('click', () => {
    clearDetail();
    showDay(today);
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
      clearDetail();
    }
  });

  renderPage();
  reveal(tiles.get(today));
}
