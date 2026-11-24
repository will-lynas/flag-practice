// Run: node --test tests/heatmap.test.js (Chrome/Chromium via CHROME_BIN, default google-chrome).
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { promisify } from 'node:util';

const fixtures = [];
function fixture(name, run) {
  fixtures.push({ name, run });
}

fixture('counts attempts and separates today’s completed, remaining and overdue', () => {
  mount({
    reviews: rows('2024-12-30', '2024-12-30', new Date('2025-01-01T02:30Z'),
      '2025-01-01T10:00:00-05:00', '2025-01-01T11:00:00-05:00', '2025-01-01T18:00:00-05:00',
      '2025-01-02', 'bad-date', '2024-12-32'),
    due: rows('2024-12-29', '2024-12-30', '2025-01-01T00:15:00-05:00', '2025-01-01',
      '2025-01-01T23:45:00-05:00', '2025-01-02T03:00:00-05:00', '2025-01-02T03:00:00-05:00'),
  });
  check(label('2024-12-29').includes('0 attempts'), 'no due cards plotted in the past');
  check(label('2024-12-30').includes('2 attempts'), 'repeated attempts on one day count separately');
  check(label('2024-12-31').includes('1 attempt'), 'UTC Jan 1 is local Dec 31');
  check(label('2025-01-01').includes('2 completed · 5 remaining (2 overdue)'), 'today totals');
  check(label('2025-01-02').includes('2 cards due'), 'same due time can belong to two cards');
  check(label('2025-01-03').includes('0 cards due'), 'no simulated repeats');
  check(day('2025-01-01').getAttribute('aria-current') === 'date', 'today marker');
});

fixture('retains all calendar dates across spring-forward and fall-back', () => {
  check(Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/New_York', 'fixture time zone');
  mount({
    reviews: rows('2024-03-10T06:59Z', '2024-03-10T07:00Z', '2024-03-11T03:59Z', '2024-03-11T04:00Z'),
    due: rows('2024-03-13T03:59Z', '2024-03-13T04:00Z'),
  }, '2024-03-11T18:00Z');
  check(label('2024-03-10').includes('3 attempts'), 'spring-forward Sunday is one local day');
  check(label('2024-03-11').includes('1 completed'), 'local midnight cuts off Sunday');
  check(label('2024-03-12').includes('1 card due'), 'late due date before midnight EDT');
  check(label('2024-03-13').includes('1 card due'), 'due date at midnight EDT');
  mount({
    reviews: rows('2024-11-03T05:30Z', '2024-11-03T06:30Z', '2024-11-04T04:59Z', '2024-11-04T05:00Z'),
    due: [],
  }, '2024-11-04T18:00Z');
  check(label('2024-11-03').includes('3 attempts'), 'both occurrences of 01:30 count on the same day');
  check(label('2024-11-04').includes('1 completed'), 'fall-back Sunday ends at local midnight');
  check(host.querySelectorAll('button[data-date]').length === 91, 'no extra or missing DST tiles');
});

fixture('replaces a due date on reschedule instead of carrying old counts forward', () => {
  const reviews = rows('2025-01-01', '2025-01-01');
  const before = { reviews, due: rows('2025-01-02', '2024-12-28') };
  mount(before);
  check(label('2025-01-02').includes('1 card due'), 'original due');
  mount({ reviews, due: rows('2025-01-04', '2025-01-05') });
  check(label('2025-01-02').includes('0 cards due'), 'old due gone');
  check(label('2025-01-04').includes('1 card due'), 'replacement due');
  check(label('2025-01-01').includes('2 completed · 0 remaining (0 overdue)'), 'regraded overdue work gone');
  check(host.children.length === 1 && before.due[0].at === '2025-01-02', 'remount replaces DOM without mutating input');
});

fixture('navigates beyond the initial window with paging controls', () => {
  mount({ reviews: rows('2024-08-05'), due: rows('2025-03-04') });
  check(!day('2024-08-05') && !day('2025-03-04'), 'fixtures start offscreen');
  control('Previous 13 weeks').focus();
  control('Previous 13 weeks').click();
  check(document.activeElement === control('Previous 13 weeks'), 'page button keeps focus');
  check(label('2024-08-05').includes('1 attempt'), 'past page');
  check(!detail().includes('Today'), 'today not shown when its date is off page');
  control('Today').click();
  check(day('2025-01-01').tabIndex === 0, 'return to today');
  control('Next 13 weeks').click();
  check(label('2025-03-04').includes('1 card due'), 'future page');
  check(host.querySelector('[role="status"]').textContent.includes('2025'), 'range announced');
});

fixture('moves focus in a Monday-first grid with one date tab stop', () => {
  mount();
  const current = () => document.activeElement.dataset.date;
  const tabStops = () => host.querySelectorAll('button[data-date][tabindex="0"]').length;
  check(tabStops() === 1, 'one date in the Tab order');
  day('2025-01-01').focus();
  key('ArrowUp');
  check(current() === '2024-12-31', 'up is previous day across a year boundary');
  key('ArrowRight');
  check(current() === '2025-01-07', 'right is next week');
  check(key('Tab'), 'native Tab is not suppressed');
  check(key('ArrowLeft', { altKey: true }) && current() === '2025-01-07', 'browser shortcuts preserved');
  key('Home', { ctrlKey: true });
  check(current() === '2024-11-04', 'first date is Monday');
  key('ArrowLeft');
  check(current() === '2024-10-28' && tabStops() === 1, 'arrows can cross windows');
  key('PageDown');
  check(current() === '2025-01-27', 'page keyboard navigation preserves the position');
});

fixture('shows exact counts on hover, focus and tap', () => {
  mount({ reviews: rows('2024-12-30', '2024-12-30'), due: rows('2025-01-03') });
  const past = day('2024-12-30');
  const future = day('2025-01-03');
  const pointer = (node, type, pointerType) => node.dispatchEvent(new PointerEvent(type, {
    bubbles: true, pointerType,
  }));
  check(detail().includes('Today:'), 'today is the default readout');
  pointer(past, 'pointerover', 'mouse');
  check(detail().includes('2 attempts'), 'hover');
  pointer(past, 'pointerout', 'mouse');
  check(detail().includes('Today:'), 'hover clears');
  past.focus();
  check(detail().includes('2 attempts'), 'focus');
  past.blur();
  pointer(future, 'pointerdown', 'touch');
  future.click();
  check(detail().includes('1 card due') && future.getAttribute('aria-pressed') === 'true', 'tap pins readout');
  future.focus();
  key('Escape');
  check(detail().includes('Today:') && future.getAttribute('aria-pressed') === 'false', 'Escape clears readout');
});

fixture('lays out square tiles, month labels, palettes and legend in a narrow host', () => {
  host.style.width = '300px';
  mount({ reviews: rows('2024-12-30', '2025-01-01'), due: rows('2025-01-01', '2025-01-02') });
  const grid = host.querySelector('[role="grid"]');
  const rowsInGrid = [...grid.tBodies[0].rows];
  check(rowsInGrid.length === 7 && rowsInGrid.every(row => row.cells.length === 14), 'seven weekday rows');
  check(rowsInGrid[0].querySelector('th').getAttribute('aria-label') === 'Monday', 'Monday is the top row');
  check(grid.tHead.textContent.includes('Dec') && grid.tHead.textContent.includes('Jan'), 'month labels at year crossing');
  const today = day('2025-01-01');
  const tile = today.getBoundingClientRect();
  check(tile.width >= 18 && Math.abs(tile.width - tile.height) < 1, 'square tile geometry');
  check(day('2025-01-08').getBoundingClientRect().x - tile.x >= 24, 'narrow target spacing');
  check(getComputedStyle(today).outlineStyle === 'solid', 'today outline');
  check(getComputedStyle(today).backgroundImage !== 'none', 'today displays both measures');
  check(getComputedStyle(day('2024-12-30')).backgroundColor !== getComputedStyle(day('2025-01-02')).backgroundColor,
    'different past and future palettes at the same count');
  const legend = host.querySelector('.flag-heatmap__legend');
  check(legend && legend.textContent.includes('Completed') && legend.textContent.includes('Due')
    && legend.getBoundingClientRect().width <= 300, 'visible, wrapping legend');
  check(host.scrollWidth === host.clientWidth, 'no overflow outside the internal viewport');
  host.style.width = '';
});

const helpers = String.raw`
  const host = document.querySelector('#heatmap');
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const rows = (...dates) => dates.map(at => ({ at }));
  const mount = (data = { reviews: [], due: [] }, now = '2025-01-01T17:00Z') =>
    renderHeatmap(host, data, new Date(now));
  const day = date => host.querySelector('button[data-date="' + date + '"]');
  const label = date => day(date).getAttribute('aria-label');
  const control = name => [...host.querySelectorAll('button:not([data-date])')]
    .find(button => (button.getAttribute('aria-label') || button.textContent) === name);
  const detail = () => host.querySelector('.flag-heatmap__detail').textContent;
  const key = (name, opts = {}) => document.activeElement.dispatchEvent(new KeyboardEvent(
    'keydown', { key: name, bubbles: true, cancelable: true, ...opts }));
`;

// Keep the fixture inline; the browser loads the exact deliverable files over loopback.
let results;
before(async () => {
  const profile = await mkdtemp(join(tmpdir(), 'flag-heatmap-chrome-'));
  const js = new URL('../src/heatmap.js', import.meta.url);
  const css = new URL('../src/heatmap.css', import.meta.url);
  const script = `import { renderHeatmap } from '/heatmap.js';\n${helpers}\n` +
    `const results = {};\n` + fixtures.map(({ name, run }) => `try {
      (${run})(); results[${JSON.stringify(name)}] = null;
    } catch (error) { results[${JSON.stringify(name)}] = error.stack; }`).join('\n') +
    `\ndocument.querySelector('#results').textContent = encodeURIComponent(JSON.stringify(results));`;
  const html = `<!doctype html><html lang="en"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/heatmap.css"><div id="heatmap"></div><pre id="results"></pre>
    <script type="module">${script}</script>`;
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/heatmap.js') {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(await readFile(js));
      } else if (req.url === '/heatmap.css') {
        res.setHeader('Content-Type', 'text/css');
        res.end(await readFile(css));
      } else {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      }
    } catch {
      res.writeHead(404).end();
    }
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const { stdout } = await promisify(execFile)(process.env.CHROME_BIN || 'google-chrome', [
      '--headless', '--disable-gpu', '--disable-background-networking', '--no-first-run',
      `--user-data-dir=${profile}`, '--dump-dom', `http://127.0.0.1:${server.address().port}/`,
    ], { env: { ...process.env, TZ: 'America/New_York' }, timeout: 20_000 });
    const encoded = stdout.match(/<pre id="results">([^<]+)<\/pre>/)?.[1];
    assert.ok(encoded, 'browser fixture did not run (check the module and stylesheet paths)');
    results = JSON.parse(decodeURIComponent(encoded));
  } finally {
    server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  }
});

for (const { name } of fixtures) test(name, () => assert.equal(results[name], null));

test('imports as Node ESM without a CSS loader', async () => {
  const { renderHeatmap } = await import('../src/heatmap.js');
  assert.equal(typeof renderHeatmap, 'function');
});
