import assert from 'node:assert/strict';
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';

export function regionTests(test, { open, heading, button, flag, recall, stored }) {
  const region = page => page.getByLabel('Region', { exact: true });
  const now = new Date('2026-05-03T12:00Z');

  test('region queues ignore other due cards and only enroll from the selection', async t => {
    const page = await open(t);
    await page.clock.setFixedTime(now);
    const start = new Date('2026-04-20T12:00Z');
    const jp = fsrs().next(createEmptyCard(start), start, Rating.Good).card;
    const fr = { ...jp, due: new Date('2026-05-04T12:00Z') };
    await page.evaluate(cards => localStorage.setItem('flag-trainer:progress:v1', JSON.stringify({version: 1, cards})), { JP: jp, FR: fr });
    await page.reload();
    await recall(page, 'jp');
    const before = await stored(page);
    await region(page).focus();
    await region(page).press('Home');
    await region(page).press('ArrowDown');
    await region(page).press('ArrowDown');
    await region(page).press('ArrowDown');
    assert.equal(await region(page).inputValue(), 'europe');
    await heading(page, 'No reviews due');
    assert.ok(await page.locator('time').getAttribute('datetime') === fr.due.toISOString());
    assert.equal(await stored(page), before);
    await button(page, 'Learn 5 more').click();
    await flag(page, 'gb', 'Flag to identify');
    const { cards } = JSON.parse(await stored(page));
    assert.deepEqual(Object.keys(cards), ['JP', 'FR', 'GB', 'DE', 'IT', 'ES', 'CH']);
    await region(page).selectOption('asia');
    await flag(page, 'jp', 'Flag to identify');
    await region(page).selectOption('europe');
    await flag(page, 'gb', 'Flag to identify');
  });

  test('an ungraded v1 batch and new continent batches resume at flag-only recall', async t => {
    const page = await open(t, {viewport: {width: 360, height: 700}, isMobile: true, hasTouch: true});
    await page.clock.setFixedTime(now);
    await page.evaluate(() => localStorage.setItem('flag-trainer.ui.pending.v1',
      JSON.stringify({ codes: ['US', 'GB', 'CA', 'JP', 'FR'], revealed: 1 })));
    await page.reload();
    await flag(page, 'us', 'Flag to identify');
    await region(page).selectOption('africa');
    await button(page, 'Learn 5 flags').tap();
    await flag(page, 'za', 'Flag to identify');
    assert.equal(await button(page, 'Continue').count(), 0);
    await page.getByRole('combobox', { name: 'Country' }).fill('South Africa');
    await button(page, 'Submit').tap();
    await heading(page, 'Correct: South Africa');
    await region(page).selectOption('north-america');
    await flag(page, 'us', 'Flag to identify');
    await page.getByRole('combobox', { name: 'Country' }).fill('United States');
    await button(page, 'Submit').tap();
    await heading(page, 'Correct: United States');
    const graded = await stored(page);
    await region(page).selectOption('africa');
    await page.reload();
    assert.equal(await region(page).inputValue(), 'africa');
    await flag(page, 'eg', 'Flag to identify');
    await region(page).selectOption('europe');
    await flag(page, 'gb', 'Flag to identify');
    await region(page).selectOption('north-america');
    await flag(page, 'ca', 'Flag to identify');
    assert.equal(await stored(page), graded);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
  });
}
