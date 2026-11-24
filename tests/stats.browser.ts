import assert from 'node:assert/strict';
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
import type { test as nodeTest } from 'node:test';
import type { Locator } from 'playwright-core';
import type { BrowserHarness } from './browser.smoke.ts';
import { parseSavedProgress } from './saved-progress.ts';

export function statsTests(test: typeof nodeTest, { open, heading, stored, statsUrl }: Pick<BrowserHarness, 'open' | 'heading' | 'stored'> & { statsUrl: () => string }) {
  test('both Stats calendars show exact counts beside the active day on hover, focus and tap', async t => {
    const now = new Date('2026-05-03T12:00Z');
    const card = fsrs().next(createEmptyCard(now), now, Rating.Good).card;
    for (const touch of [false, true]) {
      const page = await open(t, { viewport: { width: 320, height: 760 }, hasTouch: touch, timezoneId: 'UTC' });
      await page.clock.setFixedTime(now);
      await page.evaluate(card => localStorage.setItem('flag-trainer:progress:v1', JSON.stringify({
        version: 1, cards: { JP: card, BR: card }, reviewLog: Array(3).fill('2026-05-03T11:00:00.000Z'),
      })), { ...card, due: now });
      await page.goto(statsUrl());
      const tooltip = page.getByRole('tooltip');
      assert.equal(await tooltip.count(), 0);
      const cases = [
        ['Completed reviews', '2026-05-03', 'Sunday, May 3, 2026: 3 completed'],
        ['Completed reviews', '2026-05-02', 'Saturday, May 2, 2026: 0 completed'],
        ['Reviews due', '2026-05-03', 'Sunday, May 3, 2026: 2 due (0 overdue)'],
        ['Reviews due', '2026-05-04', 'Monday, May 4, 2026: 0 due'],
      ];
      for (const [name, date, text] of cases) {
        const grid = page.getByRole('grid', { name, exact: true });
        const cell = grid.locator(`button[data-date="${date}"]`);
        if (touch) await cell.tap();
        else await cell.hover();
        await tooltip.waitFor({ timeout: 1500 });
        assert.equal(await tooltip.textContent(), text);
        const anchor = await cell.boundingBox();
        const tip = await tooltip.boundingBox();
        assert.ok(anchor && tip);
        const gap = Math.max(tip.y - (anchor.y + anchor.height), anchor.y - (tip.y + tip.height));
        assert.ok(gap >= 0 && gap <= 10, 'tooltip should be just above or below the tile');
        assert.ok(tip.x >= 0 && tip.x + tip.width <= 320);
        assert.ok(tip.x < anchor.x + anchor.width && tip.x + tip.width > anchor.x);
      }
      if (!touch) {
        const due = page.getByRole('region', { name: 'Reviews due', exact: true });
        await due.getByRole('heading').hover();
        await tooltip.waitFor({ state: 'hidden' });
        await due.getByRole('button', { name: 'Today', exact: true }).click();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await tooltip.waitFor();
        assert.match((await tooltip.textContent()) ?? '', /May 3, 2026: 2 due/);
        await page.keyboard.press('Escape');
        await tooltip.waitFor({ state: 'hidden' });
        await page.keyboard.press('ArrowRight');
        await tooltip.waitFor();
        assert.match((await tooltip.textContent()) ?? '', /May 10, 2026: 0 due/);
      }
      await page.getByRole('link', { name: 'Practice', exact: true }).click();
      await heading(page, 'Which country uses this flag?');
      await tooltip.waitFor({ state: 'hidden' });
    }
  });

  test('Stats is shareable, keeps the Practice selection, and separates legacy and per-country history', async t => {
    const page = await open(t, { viewport: { width: 320, height: 760 }, isMobile: true, hasTouch: true, timezoneId: 'UTC' });
    const now = new Date('2026-05-03T12:00Z');
    await page.clock.setFixedTime(now);
    const old = new Date('2026-05-01T12:00Z');
    const first = fsrs().next(createEmptyCard(old), old, Rating.Good).card;
    const cards = { JP: { ...first, scheduled_days: 14, due: old },
      BR: { ...first, scheduled_days: 13, due: new Date('2026-05-04T12:00Z') } };
    await page.evaluate(cards => localStorage.setItem('flag-trainer:progress:v1', JSON.stringify({ version: 1, cards,
      reviewLog: Array(3).fill('2026-05-03T11:00:00.000Z'), reviewCountries: { 1: 'JP', 2: 'BR' },
    })), cards);
    const before = await stored(page);
    await page.goto(statsUrl());
    await heading(page, 'Stats');
    const countryTable = page.getByRole('table', { name: 'Countries', exact: true });
    const breakdown = page.getByRole('table', { name: 'Regional breakdown' });
    assert.equal(await countryTable.locator('tbody tr').count(), 197);
    assert.equal(await breakdown.locator('tbody tr').count(), 6);
    const jp = countryTable.getByRole('row', { name: /Japan/ });
    assert.match((await jp.textContent()) ?? '', /Learnt/);
    assert.equal(await jp.locator('time').getAttribute('datetime'), old.toISOString());
    assert.match((await countryTable.getByRole('row', { name: /Brazil/ }).textContent()) ?? '', /Learning/);
    assert.match((await countryTable.getByRole('row', { name: /Zimbabwe/ }).textContent()) ?? '', /Not started.*—/);
    const completed = page.getByRole('grid', { name: 'Completed reviews', exact: true });
    const due = page.getByRole('grid', { name: 'Reviews due', exact: true });
    const tile = (grid: Locator, date: string) => grid.locator(`button[data-date="${date}"]`);
    const today = tile(completed, '2026-05-03');
    const todayDue = tile(due, '2026-05-03');
    const tomorrow = tile(due, '2026-05-04');
    await heading(page, 'Completed reviews');
    await heading(page, 'Reviews due');
    assert.match((await today.getAttribute('aria-label')) ?? '', /: 3 attempts$/);
    assert.match((await todayDue.getAttribute('aria-label')) ?? '', /: 1 card due \(1 overdue\)$/);
    assert.match((await tomorrow.getAttribute('aria-label')) ?? '', /1 card due/);
    assert.equal(await tile(completed, '2026-05-04').count(), 0);
    assert.equal(await tile(due, '2026-05-02').count(), 0);
    const region = page.getByLabel('Region', { exact: true });
    await region.selectOption('africa');
    await page.getByText('No completed reviews recorded.', { exact: true }).waitFor();
    await page.getByText('No reviews due.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('grid').count(), 0);
    await region.selectOption('asia');
    assert.equal(await countryTable.locator('tbody tr').count(), 49);
    assert.equal(await breakdown.count(), 0);
    assert.match((await today.getAttribute('aria-label')) ?? '', /: 1 attempt$/);
    assert.match((await todayDue.getAttribute('aria-label')) ?? '', /: 1 card due \(1 overdue\)$/);
    assert.match((await tomorrow.getAttribute('aria-label')) ?? '', /0 cards due/);
    const detail = page.getByRole('region', { name: 'Completed reviews', exact: true }).locator('.flag-heatmap__detail');
    await today.focus();
    await page.keyboard.press('ArrowUp');
    assert.equal(await tile(completed, '2026-05-02').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert.equal(await today.evaluate(el => el === document.activeElement), true);
    const yesterday = tile(completed, '2026-05-02');
    await yesterday.tap();
    assert.match((await detail.textContent()) ?? '', /0 attempts/);
    assert.equal(await yesterday.getAttribute('aria-pressed'), 'true');
    await tomorrow.tap();
    assert.equal(await yesterday.getAttribute('aria-pressed'), 'false');
    assert.equal(await today.evaluate(el => el instanceof HTMLElement && Math.abs(el.offsetWidth - el.offsetHeight) < 2), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
    await page.getByRole('link', { name: 'Practice', exact: true }).tap();
    assert.equal(await region.inputValue(), 'asia');
    await heading(page, 'Which country uses this flag?');
    await page.goBack();
    await heading(page, 'Stats');
    await page.reload();
    assert.equal(await region.inputValue(), 'asia');
    assert.equal(await stored(page), before);
    await page.getByRole('link', { name: 'Practice', exact: true }).tap();
    await page.getByRole('combobox', { name: 'Country', exact: true }).fill('Japa');
    await page.getByRole('combobox', { name: 'Country', exact: true }).press('Enter');
    await heading(page, 'Correct: Japan');
    await page.getByRole('link', { name: 'Stats', exact: true }).tap();
    assert.match((await today.getAttribute('aria-label')) ?? '', /: 2 attempts$/);
    assert.match((await todayDue.getAttribute('aria-label')) ?? '', /: 0 cards due \(0 overdue\)$/);
    await region.selectOption('south-america');
    assert.match((await today.getAttribute('aria-label')) ?? '', /: 1 attempt$/);
    assert.match((await todayDue.getAttribute('aria-label')) ?? '', /: 0 cards due \(0 overdue\)$/);
    assert.match((await tomorrow.getAttribute('aria-label')) ?? '', /1 card due/);
  });

  test('Stats leaves pending Practice recovery untouched and shows independent empty states', async t => {
    const page = await open(t);
    const pending = '{"codes":["JP"],"revealed":0}';
    await page.evaluate(pending => localStorage.setItem('flag-trainer.ui.pending.v1', pending), pending);
    await page.goto(statsUrl());
    await heading(page, 'Completed reviews');
    await heading(page, 'Reviews due');
    await page.getByText('No completed reviews recorded.', { exact: true }).waitFor();
    await page.getByText('No reviews due.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('grid').count(), 0);
    assert.equal(await stored(page), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('flag-trainer.ui.pending.v1')), pending);
    await page.getByRole('link', { name: 'Practice', exact: true }).click();
    await heading(page, 'Which country uses this flag?');
    assert.deepEqual(Object.keys(parseSavedProgress(await stored(page)).cards), ['JP']);
  });

  test('Stats calendars page and scroll independently with local dates, native Tab and hover', async t => {
    const page = await open(t, { viewport: { width: 320, height: 760 }, timezoneId: 'America/New_York' });
    await page.clock.setFixedTime(new Date('2025-01-01T17:00:00Z'));
    const old = new Date('2024-09-01T16:00:00Z');
    const card = fsrs().next(createEmptyCard(old), old, Rating.Good).card;
    await page.evaluate(state => localStorage.setItem('flag-trainer:progress:v1', JSON.stringify(state)), {
      version: 1,
      cards: {
        JP: { ...card, due: '2025-01-01T04:59:59Z' },
        GB: { ...card, due: '2025-01-02T04:59:59Z' },
        BR: { ...card, due: '2025-04-10T16:00:00Z' },
      },
      reviewLog: [old.toISOString(), '2025-01-01T04:59:59Z', '2025-01-01T05:00:00Z', '2025-01-01T17:00:01Z'],
    });
    await page.addInitScript(() => {
      window.statsWrites = [];
      for (const method of ['setItem', 'removeItem', 'clear'] as const) {
        const mutate: (...args: string[]) => void = Storage.prototype[method];
        Storage.prototype[method] = function (this: Storage, ...args: string[]) {
          window.statsWrites.push([method, args[0]]);
          return mutate.apply(this, args);
        };
      }
    });
    const before = await stored(page);
    await page.goto(statsUrl());
    const completed = page.getByRole('region', { name: 'Completed reviews', exact: true });
    const due = page.getByRole('region', { name: 'Reviews due', exact: true });
    const today = (region: Locator) => region.locator('[aria-current="date"]');
    const tile = (region: Locator, date: string) => region.locator(`button[data-date="${date}"]`);
    const detail = (region: Locator) => region.locator('.flag-heatmap__detail');
    const scroll = (region: Locator) => region.locator('.flag-heatmap__viewport').evaluate(el => el.scrollLeft);
    const focused = (locator: Locator) => locator.evaluate(el => el === document.activeElement);
    assert.match((await today(completed).getAttribute('aria-label')) ?? '', /January 1, 2025: 1 attempt$/);
    assert.match((await today(due).getAttribute('aria-label')) ?? '', /January 1, 2025: 2 cards due \(1 overdue\)$/);
    assert.match((await detail(due).textContent()) ?? '', /Today: 2 cards due \(1 overdue\)/);
    const palette = (locator: Locator) => locator.evaluate(el => {
      const css = getComputedStyle(el);
      return [css.backgroundImage, css.backgroundColor];
    });
    const [completedPaint, duePaint] = await Promise.all([palette(today(completed)), palette(today(due))]);
    assert.equal(completedPaint[0], 'none');
    assert.equal(duePaint[0], 'none');
    assert.notEqual(completedPaint[1], duePaint[1]);
    for (const grid of [completed, due]) {
      assert.equal(await grid.locator('tbody th').first().getAttribute('aria-label'), 'Monday');
      assert.equal(await grid.locator('tbody tr').count(), 7);
      assert.equal(await grid.locator('button[data-date][tabindex="0"]').count(), 1);
    }

    const previous = completed.getByRole('button', { name: 'Previous 13 weeks' });
    await previous.click();
    assert.equal(await focused(previous), true);
    assert.match((await tile(completed, '2024-09-01').getAttribute('aria-label')) ?? '', /1 attempt$/);
    assert.equal(await today(completed).count(), 0);
    assert.equal(await today(due).count(), 1);
    await completed.getByRole('button', { name: 'Today', exact: true }).click();
    await page.keyboard.press('Tab'); // Page button → boundary button → the single grid tab stop
    await page.keyboard.press('Tab');
    assert.equal(await focused(today(completed)), true);
    const dueScroll = await scroll(due);
    assert.ok(await scroll(completed) > 0);
    await page.keyboard.press('ArrowUp');
    const lastYear = tile(completed, '2024-12-31');
    assert.equal(await focused(lastYear), true);
    assert.match((await detail(completed).textContent()) ?? '', /December 31, 2024: 1 attempt$/);
    await page.keyboard.press('Control+Home');
    assert.ok(await scroll(completed) <= 1);
    assert.equal(await scroll(due), dueScroll);
    const inView = await page.locator(':focus').evaluate(el => {
      const tile = el.getBoundingClientRect();
      const view = el.closest('.flag-heatmap__viewport')?.getBoundingClientRect();
      return !!view && tile.left >= view.left && tile.right <= view.right && el.matches(':focus-visible');
    });
    assert.equal(inView, true);
    await page.keyboard.press('PageUp');
    assert.equal(await today(completed).count(), 0);
    assert.equal(await completed.locator('button[data-date]:focus').count(), 1);
    await page.keyboard.press('PageDown');
    assert.equal(await today(completed).count(), 1);
    await lastYear.hover();
    assert.match((await detail(completed).textContent()) ?? '', /December 31, 2024: 1 attempt$/);
    await lastYear.click();
    await completed.getByRole('heading').hover();
    assert.equal(await detail(completed).textContent(), 'Today: 1 attempt');
    const next = due.getByRole('button', { name: 'Next 13 weeks' });
    await next.click();
    assert.equal(await focused(next), true);
    assert.match((await tile(due, '2025-04-10').getAttribute('aria-label')) ?? '', /1 card due$/);
    assert.match((await tile(due, '2025-04-11').getAttribute('aria-label')) ?? '', /0 cards due$/);
    await due.getByRole('button', { name: 'Today', exact: true }).click();
    assert.equal(await today(due).getAttribute('tabindex'), '0');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
    assert.equal(await stored(page), before);
    assert.deepEqual(await page.evaluate(() => window.statsWrites), []);
  });
}
