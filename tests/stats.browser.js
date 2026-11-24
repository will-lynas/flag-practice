import assert from 'node:assert/strict';
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';

export function statsTests(test, { open, heading, stored, statsUrl }) {
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
    assert.match(await jp.textContent(), /Learnt/);
    assert.equal(await jp.locator('time').getAttribute('datetime'), old.toISOString());
    assert.match(await countryTable.getByRole('row', { name: /Brazil/ }).textContent(), /Learning/);
    assert.match(await countryTable.getByRole('row', { name: /Zimbabwe/ }).textContent(), /Not started.*—/);
    const tile = date => page.locator(`button[data-date="${date}"]`);
    const today = tile('2026-05-03');
    const tomorrow = tile('2026-05-04');
    assert.match(await today.getAttribute('aria-label'), /3 completed · 1 remaining \(1 overdue\)/);
    assert.match(await tomorrow.getAttribute('aria-label'), /1 card due/);
    const region = page.getByLabel('Region', { exact: true });
    await region.selectOption('asia');
    assert.equal(await countryTable.locator('tbody tr').count(), 49);
    assert.equal(await breakdown.count(), 0);
    assert.match(await today.getAttribute('aria-label'), /1 completed · 1 remaining \(1 overdue\)/);
    assert.match(await tomorrow.getAttribute('aria-label'), /0 cards due/);
    await today.focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await tomorrow.evaluate(el => el === document.activeElement), true);
    await today.tap();
    assert.match(await page.locator('.flag-heatmap__detail').textContent(), /1 completed/);
    assert.equal(await tile('2026-05-03').getAttribute('aria-pressed'), 'true');
    assert.equal(await today.evaluate(el => Math.abs(el.offsetWidth - el.offsetHeight) < 2), true);
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
    assert.match(await today.getAttribute('aria-label'), /2 completed · 0 remaining \(0 overdue\)/);
    await region.selectOption('south-america');
    assert.match(await today.getAttribute('aria-label'), /1 completed · 0 remaining/);
    assert.match(await tomorrow.getAttribute('aria-label'), /1 card due/);
  });
}
