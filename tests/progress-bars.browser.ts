import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
import type { test as nodeTest } from 'node:test';
import type { BrowserHarness } from './browser.smoke.ts';

const key = 'flag-trainer:progress:v1';
const scopes = [
  ['World', 197, 2, 2], ['Africa', 54, 0, 0], ['Asia', 49, 1, 1],
  ['Europe', 45, 1, 0], ['North America', 23, 0, 0],
  ['Oceania', 14, 0, 0], ['South America', 12, 0, 1],
] as const;

export function progressBarsTests(test: typeof nodeTest, { open, stored, statsUrl }: Pick<BrowserHarness, 'open' | 'stored'> & { statsUrl: () => string }) {
  test('Stats shows empty progress for World and every continent before any practice', async t => {
    const page = await open(t);
    assert.ok((await page.goto(statsUrl()))?.ok());
    const overview = page.getByRole('region', { name: 'Progress breakdown', exact: true });
    assert.equal(await overview.count(), 1, 'expected a progress breakdown above the existing stats');
    assert.deepEqual(await overview.getByRole('heading', { level: 4 }).allTextContents(), scopes.map(([name]) => name));
    for (const [name, total] of scopes) {
      const scope = overview.getByRole('region', { name, exact: true });
      assert.equal(await scope.getByText(`${total} Not started`, { exact: true }).isVisible(), true);
      assert.equal(await scope.getByText('0 Learnt', { exact: true }).isVisible(), true);
      assert.equal(await scope.getByText('0 Learning', { exact: true }).isVisible(), true);
      assert.deepEqual(await scope.locator('.stats-progress__segment').evaluateAll(segments =>
        segments.map(segment => segment.getBoundingClientRect().width)),
      [await scope.locator('.stats-progress__bar').evaluate(bar => bar.getBoundingClientRect().width)]);
    }
    assert.equal(await stored(page), null);
  });

  test('Stats progress bars use the roster and saved stages independently of the region picker', async t => {
    const at = new Date('2026-05-01T12:00Z');
    const newCard = createEmptyCard(at);
    const reviewed = fsrs().next(newCard, at, Rating.Good).card;
    const learnt = { ...reviewed, scheduled_days: 14 };
    const learning = { ...reviewed, scheduled_days: 13 };
    const bytes = JSON.stringify({ version: 1, cards: {
      JP: learnt, KR: learning, BR: learnt, FR: learning, CN: newCard, ZZ: learnt,
    }, reviewLog: [at.toISOString(), at.toISOString()], reviewCountries: { 0: 'JP', 1: 'BR' } });
    for (const [colorScheme, width, height] of [['light', 900, 840], ['dark', 320, 760]] as const) {
      const page = await open(t, { colorScheme, viewport: { width, height }, isMobile: width === 320, hasTouch: width === 320, timezoneId: 'UTC' });
      await page.clock.setFixedTime(new Date('2026-05-03T12:00Z'));
      await page.evaluate(([key, bytes]) => localStorage.setItem(key, bytes), [key, bytes]);
      assert.ok((await page.goto(statsUrl()))?.ok());
      const overview = page.getByRole('region', { name: 'Progress breakdown', exact: true });
      assert.equal(await overview.count(), 1);
      const table = page.getByRole('table', { name: 'Countries', exact: true });
      const completed = page.getByRole('grid', { name: 'Completed reviews', exact: true });
      const tile = completed.locator('button[data-date="2026-05-01"]');
      const picker = page.getByLabel('Region', { exact: true });
      const content = await overview.textContent();
      assert.match(await tile.getAttribute('aria-label') ?? '', /2 attempts$/);
      for (const [name, total, learning, learnt] of scopes) {
        const scope = overview.getByRole('region', { name, exact: true });
        const counts = [[learnt, 'Learnt'], [learning, 'Learning'], [total - learnt - learning, 'Not started']] as const;
        for (const [count, label] of counts) assert.equal(await scope.getByText(`${count} ${label}`, { exact: true }).isVisible(), true);
        const bar = scope.locator('.stats-progress__bar');
        const width = await bar.evaluate(el => el.getBoundingClientRect().width);
        const widths = await bar.locator('.stats-progress__segment').evaluateAll(parts => parts.map(el => el.getBoundingClientRect().width));
        const expected = counts.flatMap(([count]) => count ? [width * count / total] : []);
        assert.equal(widths.length, expected.length);
        widths.forEach((width, index) => assert.ok(Math.abs(width - expected[index]) < .1, `${name}: segment should be proportional`));
        assert.ok(Math.abs(widths.reduce((sum, part) => sum + part, 0) - width) < .1);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      const world = overview.getByRole('region', { name: 'World', exact: true }).locator('.stats-progress__bar');
      const asia = overview.getByRole('region', { name: 'Asia', exact: true }).locator('.stats-progress__bar');
      const worldBox = await world.boundingBox();
      const asiaBox = await asia.boundingBox();
      assert.ok(worldBox && asiaBox && worldBox.height > asiaBox.height && worldBox.y < asiaBox.y);
      assert.equal(await overview.evaluate(el => getComputedStyle(el).colorScheme), colorScheme);
      if (process.env.FLAG_PROGRESS_SCREENSHOTS) {
        await page.screenshot({ path: join(process.env.FLAG_PROGRESS_SCREENSHOTS, `progress-${colorScheme}.png`) });
      }
      await picker.selectOption('asia');
      assert.equal(await table.locator('tbody tr').count(), 49);
      assert.match(await tile.getAttribute('aria-label') ?? '', /1 attempt$/);
      assert.equal(await overview.textContent(), content);
      await page.reload();
      assert.equal(await picker.inputValue(), 'asia');
      assert.equal(await overview.textContent(), content);
      assert.equal(await stored(page), bytes);
    }
  });
}
