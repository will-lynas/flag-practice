import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';
import type { TestContext } from 'node:test';
import type { Server } from 'node:http';
import type { Browser, BrowserContextOptions, Page } from 'playwright-core';
import { parseSavedProgress } from './saved-progress.ts';
import { chromium } from 'playwright-core';
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';
import { addFive, grade } from '../src/engine.ts';
import { regionTests } from './regions.browser.ts';
import { statsTests } from './stats.browser.ts';
import { progressBarsTests } from './progress-bars.browser.ts';

declare global {
  interface Window {
    progressWrites: number;
    statsWrites: [method: 'setItem' | 'removeItem' | 'clear', key?: string][];
  }
}

const progressKey = 'flag-trainer:progress:v1';
const pendingKey = 'flag-trainer.ui.pending.v1';
const firstFive = ['US', 'GB', 'CA', 'JP', 'FR'];
const firstFiveNames = ['United States', 'United Kingdom', 'Canada', 'Japan', 'France'];
const base = process.env.FLAG_TEST_URL;
const types: Readonly<Partial<Record<string, string>>> = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml' };
let browser: Browser;
let server: Server | undefined;
let url: string;

test.before(async () => {
  if (base) url = new URL(base).href;
  else {
    const listener = createServer(async (request, response) => {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      const asset = /^\/assets\/(?:flags\/[a-z]{2}\.svg|[\w-]+\.(?:js|css))$/u.test(path);
      const file = ['/', '/stats', '/stats/'].includes(path) ? 'index.html' : asset ? path.slice(1) : '';
      const extension = file.split('.').at(-1);
      const type = extension && types[extension];
      try {
        if (!type) throw new Error('Not a site asset');
        const body = await readFile(new URL(`../dist/${file}`, import.meta.url));
        response.writeHead(200, { 'Content-Type': type }).end(body);
      } catch {
        response.writeHead(404).end();
      }
    });
    server = listener;
    await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
    const address = listener.address();
    assert.ok(address && typeof address !== 'string');
    url = `http://127.0.0.1:${address.port}/`;
  }
  browser = await chromium.launch({ channel: process.env.CHROMIUM_PATH ? undefined : 'chrome',
    executablePath: process.env.CHROMIUM_PATH, headless: true });
});

test.after(async () => {
  await browser?.close();
  const listener = server;
  if (listener) await new Promise<void>(resolve => listener.close(() => resolve()));
});

async function open(t: TestContext, contextOptions?: BrowserContextOptions) {
  const context = await browser.newContext(contextOptions);
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  const response = await page.goto(url);
  assert.ok(response?.ok(), `Page returned ${response?.status()}: ${url}`);
  assert.equal(new URL(page.url()).origin, new URL(url).origin);
  return page;
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const heading = (page: Page, name: string) => page.getByRole('heading', { name, exact: true }).waitFor();
const stored = (page: Page) => page.evaluate(key => localStorage.getItem(key), progressKey);

test('the compact phone layout holds the flag and primary action in place across a guess', async t => {
  const page = await open(t, { viewport: { width: 390, height: 382 }, isMobile: true, hasTouch: true });
  const title = page.getByRole('heading', { name: 'Flag Practice', exact: true });
  assert.equal(await page.title(), 'Flag Practice');
  assert.equal(await title.evaluate(el => getComputedStyle(el).clipPath), 'inset(50%)');
  assert.equal(await page.locator('.site-header').evaluate(el => getComputedStyle(el).borderBottomWidth), '0px');
  await button(page, 'Learn 5 flags').tap();
  const input = await recall(page, 'us');
  const stage = page.locator('.flag-tray');
  const originalStage = await stage.boundingBox();
  const submit = await button(page, 'Submit').boundingBox();
  const { naturalWidth, naturalHeight } = await page.locator('.flag').evaluate(img => {
    if (!(img instanceof HTMLImageElement)) throw new Error('Expected a flag image');
    return { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
  });
  assert.ok(Math.abs(naturalWidth / naturalHeight - 1.9) < .03);
  assert.equal(await input.evaluate(el => getComputedStyle(el).fontSize), '16px');
  await input.fill('un');
  const menu = await page.getByRole('listbox', { name: 'Country suggestions' }).boundingBox();
  const field = await input.boundingBox();
  assert.ok(menu && field);
  assert.ok(menu.y >= 0 && menu.y + menu.height < field.y);
  assert.ok(menu.height <= 112 && field.y + field.height <= 382);
  const option = page.getByRole('option', { name: 'United States', exact: true });
  await option.tap();
  const nextButton = button(page, 'Next');
  assert.deepEqual(await stage.boundingBox(), originalStage);
  assert.deepEqual(await nextButton.boundingBox(), submit);
  assert.equal(await nextButton.evaluate(el => el === document.activeElement), true);
});

async function flag(page: Page, code: string, alt: string) {
  const img = page.getByRole('img', { name: alt, exact: true });
  await img.waitFor();
  await page.waitForFunction(c => {
    const img = document.querySelector<HTMLImageElement>('main img');
    return img?.complete && img.naturalWidth > 0 && new URL(img.src).pathname === `/assets/flags/${c}.svg`;
  }, code);
}

async function recall(page: Page, code: string) {
  await heading(page, 'Which country uses this flag?');
  await flag(page, code, 'Flag to identify');
  const answer = firstFiveNames[firstFive.indexOf(code.toUpperCase())];
  if (answer) assert.equal(await page.locator('main').getByText(answer, { exact: true }).count(), 0);
  assert.equal(await page.locator('#country-options [role=option]').count(), 0);
  assert.equal(await button(page, 'Continue').count(), 0);
  const input = page.getByRole('combobox', { name: 'Country' });
  assert.equal(await input.inputValue(), '');
  assert.equal(await input.evaluate(el => document.activeElement === el), true);
  return input;
}

test('guesses the first five without revealing answers, resumes on reload, and keeps FSRS history', async t => {
  const page = await open(t);
  const now = new Date('2026-05-03T12:00:00Z');
  await page.clock.setFixedTime(now);
  await button(page, 'Learn 5 flags').click();
  let input = await recall(page, 'us');
  const beforeFirstGuess = await stored(page);
  await page.reload();
  input = await recall(page, 'us');
  assert.equal(await stored(page), beforeFirstGuess);
  await input.fill('United');
  await page.getByRole('option', { name: 'United States', exact: true }).waitFor();
  await input.press('Enter');
  await page.getByText('Enter a full country name or choose a suggestion.').waitFor();
  assert.equal(parseSavedProgress(await stored(page)).reviewLog, undefined);
  await input.press('ArrowDown');
  assert.equal(await page.locator('[role=option][aria-selected=true]').textContent(), 'United States');
  await input.press('ArrowDown');
  assert.equal(await page.locator('[role=option][aria-selected=true]').textContent(), 'United Kingdom');
  await input.press('Escape');
  assert.equal(await input.getAttribute('aria-expanded'), 'false');
  await input.press('ArrowDown');
  await page.keyboard.down('Enter');
  await heading(page, 'Correct: United States');
  await page.keyboard.down('Enter'); // An auto-repeat cannot activate the focused Next button.
  await page.keyboard.up('Enter');
  await flag(page, 'us', 'Flag of United States');
  const afterOne = await stored(page);
  await page.reload();
  input = await recall(page, 'gb');
  assert.equal(await stored(page), afterOne);
  await input.fill('Canada');
  await input.press('Enter');
  await heading(page, 'Not quite: United Kingdom');
  await page.keyboard.press('Enter');
  input = await recall(page, 'ca');
  await input.fill('Canada');
  await input.press('Enter');
  await heading(page, 'Correct: Canada');
  await page.keyboard.press('Enter');
  input = await recall(page, 'jp');
  await button(page, 'Don’t know').focus();
  await page.keyboard.press('Enter');
  await heading(page, 'Skipped: Japan');
  await flag(page, 'jp', 'Flag of Japan');
  const afterSkip = parseSavedProgress(await stored(page));
  assert.equal(afterSkip.reviewLog?.length, 4);
  // Both fresh cards were graded at the same instant: Skip must match a wrong guess.
  assert.deepEqual(afterSkip.cards.JP, afterSkip.cards.GB);
  await page.keyboard.press('Enter');
  input = await recall(page, 'fr');
  await input.fill('France');
  await input.press('Enter');
  await heading(page, 'Correct: France');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#trainer').getAttribute('data-screen'), 'recall',
    'missed flags must come back without advancing the clock');
  assert.equal(await button(page, 'Learn 5 more').count(), 0);
  await recall(page, 'gb');
  await page.reload();
  input = await recall(page, 'gb');
  await button(page, 'Don’t know').click();
  await heading(page, 'Skipped: United Kingdom');
  await page.keyboard.press('Enter');
  input = await recall(page, 'jp');
  await input.fill('Japan');
  await input.press('Enter');
  await heading(page, 'Correct: Japan');
  await page.keyboard.press('Enter');
  input = await recall(page, 'gb');
  await input.fill('United Kingdom');
  await input.press('Enter');
  await heading(page, 'Correct: United Kingdom');
  await page.keyboard.press('Enter');
  await heading(page, 'No reviews due');
  await button(page, 'Learn 5 more').waitFor();
  const finished = await stored(page);
  const { cards, reviewLog, reviewCountries } = parseSavedProgress(finished);
  assert.deepEqual(Object.keys(cards), firstFive);
  assert.deepEqual(reviewLog, Array(8).fill(now.toISOString()));
  assert.ok(reviewCountries);
  assert.deepEqual(Object.values(reviewCountries), [...firstFive, 'GB', 'JP', 'GB']);
  assert.deepEqual(cards.GB, afterSkip.cards.GB);
  assert.deepEqual(cards.JP, afterSkip.cards.JP);
  assert.ok(Date.parse(cards.GB.due) < Date.parse(cards.US.due));
  assert.equal(await page.getByRole('link', { name: 'Stats', exact: true }).count(), 1);
  await page.reload();
  await heading(page, 'No reviews due');
  assert.equal(await stored(page), finished);
  await button(page, 'Learn 5 more').click();
  await recall(page, 'de');
  assert.equal(await page.locator('.stage').textContent(), 'New · 5 remaining');
  await page.clock.setFixedTime(new Date(cards.GB.due));
  await page.reload();
  await recall(page, 'gb');
  assert.equal(await button(page, 'Learn 5 more').count(), 0);
});

const retryClock = new Date('2026-05-03T12:00:00Z');
const scheduler = fsrs({ enable_fuzz: false });

async function dueFixture(page: Page, cards: Record<string, Date>) {
  await page.clock.setFixedTime(retryClock);
  const learned = new Date('2026-04-01T12:00:00Z');
  const initial = scheduler.next(createEmptyCard(learned), learned, Rating.Good).card;
  const review = scheduler.next(initial, initial.due, Rating.Good).card;
  assert.equal(review.state, State.Review);
  const bytes = JSON.stringify({ version: 1, cards: Object.fromEntries(
    Object.entries(cards).map(([code, due]) => [code, { ...review, due }])) });
  await page.evaluate(([key, value]) => {
    localStorage.setItem(key, value);
    localStorage.setItem('flag-trainer.ui.region', 'europe');
  }, [progressKey, bytes]);
  await page.reload();
  return review;
}

test('due reviews retry after the remaining due flags without leaking across regions or pulling future flags', async t => {
  const page = await open(t);
  const futureDue = new Date('2026-05-10T12:00:00Z');
  const review = await dueFixture(page, { GB: retryClock, FR: retryClock, JP: retryClock, DE: futureDue });
  const picker = page.getByLabel('Region');
  await recall(page, 'gb');
  await button(page, 'Don’t know').click();
  await heading(page, 'Skipped: United Kingdom');
  const missed = parseSavedProgress(await stored(page));
  const lapse = scheduler.next({ ...review, due: retryClock }, retryClock, Rating.Again).card;
  assert.equal(lapse.state, State.Relearning);
  assert.equal(lapse.lapses, review.lapses + 1);
  assert.deepEqual(missed.cards.GB, JSON.parse(JSON.stringify(lapse)));
  assert.deepEqual(missed.reviewLog, [retryClock.toISOString()]);

  await picker.selectOption('asia');
  await flag(page, 'jp', 'Flag to identify');
  await picker.selectOption('europe');
  await flag(page, 'fr', 'Flag to identify');
  await page.reload();
  let input = await recall(page, 'fr');
  await input.fill('France');
  await input.press('Enter');
  await heading(page, 'Correct: France');
  await button(page, 'Next').click();
  assert.equal(await page.locator('#trainer').getAttribute('data-screen'), 'recall');
  assert.equal(await button(page, 'Learn 5 more').count(), 0);
  input = await recall(page, 'gb');

  const beforeRetry = new Date(lapse.due.getTime() - 1);
  await page.clock.setFixedTime(beforeRetry);
  await input.fill('United Kingdom');
  await input.press('Enter');
  await heading(page, 'Correct: United Kingdom');
  await button(page, 'Next').click();
  await heading(page, 'No reviews due');
  const finished = parseSavedProgress(await stored(page));
  assert.deepEqual(finished.cards.GB, missed.cards.GB);
  assert.deepEqual(finished.cards.DE, missed.cards.DE);
  assert.deepEqual(finished.cards.JP, missed.cards.JP);
  assert.deepEqual(finished.reviewLog, [retryClock, retryClock, beforeRetry].map(at => at.toISOString()));
  assert.ok(finished.reviewCountries);
  assert.deepEqual(Object.values(finished.reviewCountries), ['GB', 'FR', 'GB']);
});

test('a singleton retry is immediate and an already-due retry is graded just once', async t => {
  const page = await open(t);
  await dueFixture(page, { GB: retryClock });
  let input = await recall(page, 'gb');
  await input.fill('France');
  await input.press('Enter');
  await heading(page, 'Not quite: United Kingdom');
  const missed = parseSavedProgress(await stored(page)).cards.GB;
  await button(page, 'Next').click();
  assert.equal(await page.locator('#trainer').getAttribute('data-screen'), 'recall');
  await recall(page, 'gb');
  await button(page, 'Don’t know').click();
  await heading(page, 'Skipped: United Kingdom');
  await page.reload(); // Persisted even before pressing Next on the miss.
  await recall(page, 'gb');
  assert.deepEqual(parseSavedProgress(await stored(page)).cards.GB, missed);

  const due = new Date(missed.due);
  await page.clock.setFixedTime(due);
  await page.reload();
  input = await recall(page, 'gb');
  assert.equal(await page.locator('.stage').textContent(), 'Retry · 1 remaining');
  await input.fill('United Kingdom');
  await input.press('Enter');
  await heading(page, 'Correct: United Kingdom');
  await button(page, 'Next').click();
  await heading(page, 'No reviews due');
  const finished = parseSavedProgress(await stored(page));
  const expected = scheduler.next({ ...missed, due, last_review: retryClock }, due, Rating.Good).card;
  assert.deepEqual(finished.cards.GB, JSON.parse(JSON.stringify(expected)));
  assert.equal(finished.cards.GB.reps, missed.reps + 1);
  assert.equal(finished.cards.GB.lapses, missed.lapses);
  assert.deepEqual(finished.reviewLog, [retryClock, retryClock, due].map(at => at.toISOString()));
  assert.ok(finished.reviewCountries);
  assert.deepEqual(Object.values(finished.reviewCountries), ['GB', 'GB', 'GB']);
});

test('Enter submits the only visible partial match without highlighting it', async t => {
  const page = await open(t);
  await button(page, 'Learn 5 flags').click();
  const input = await recall(page, 'us');
  const options = page.locator('#country-options').getByRole('option');
  for (const value of ['', 'zzzzzz']) {
    await input.fill(value);
    await input.press('Enter');
    assert.equal(await options.count(), 0);
    assert.equal(await input.getAttribute('aria-invalid'), 'true');
  }
  await input.fill('United St');
  assert.deepEqual(await options.allTextContents(), ['United States']);
  assert.equal(await input.getAttribute('aria-activedescendant'), null);
  await input.press('Escape');
  assert.equal(await options.count(), 0);
  await input.press('Enter');
  assert.equal(await input.getAttribute('aria-invalid'), 'true');
  assert.deepEqual(await options.allTextContents(), ['United States']);

  await input.dispatchEvent('compositionstart');
  await input.press('Enter');
  await input.dispatchEvent('compositionend');
  for (const init of [{ isComposing: true }, { keyCode: 229 }]) {
    await input.dispatchEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
  }
  assert.equal(parseSavedProgress(await stored(page)).reviewLog, undefined);

  await page.keyboard.down('Enter');
  await heading(page, 'Correct: United States');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await heading(page, 'Correct: United States');
  assert.equal(parseSavedProgress(await stored(page)).reviewLog?.length, 1);
  await page.keyboard.press('Enter');
  await recall(page, 'gb');
});

test('opts only the answer input out of 1Password while keeping app suggestions', async t => {
  const page = await open(t);
  await button(page, 'Learn 5 flags').click();
  const input = await recall(page, 'us');
  assert.equal(await input.evaluate(el => el instanceof HTMLInputElement && el.hasAttribute('data-1p-ignore')), true);
  assert.equal(await page.locator('[data-1p-ignore]').count(), 1);
  assert.equal(await input.getAttribute('autocomplete'), 'off');
  assert.equal(await input.getAttribute('aria-autocomplete'), 'list');
  await input.fill('United St');
  const list = page.getByRole('listbox', { name: 'Country suggestions' });
  assert.equal(await input.getAttribute('aria-expanded'), 'true');
  assert.equal(await input.getAttribute('aria-controls'), await list.getAttribute('id'));
  const option = list.getByRole('option', { name: 'United States', exact: true });
  await input.press('ArrowDown');
  assert.equal(await input.getAttribute('aria-activedescendant'), await option.getAttribute('id'));
  await input.press('Enter');
  await heading(page, 'Correct: United States');
});

test('does not submit a unique match when the answer controls are disabled', { skip: !!base }, async t => {
  const page = await open(t);
  await page.route('**/assets/flags/us.svg', route => route.abort());
  await button(page, 'Learn 5 flags').click();
  await page.getByText('Flag image unavailable.').waitFor();
  assert.equal(await button(page, 'Submit').isDisabled(), true);
  const input = page.getByRole('combobox', { name: 'Country' });
  await input.fill('United St');
  await page.getByRole('option', { name: 'United States', exact: true }).waitFor();
  await input.press('Enter');
  await heading(page, 'Which country uses this flag?');
  assert.equal(parseSavedProgress(await stored(page)).reviewLog, undefined);
});

test('submits an exact normalized country code without needing a suggestion', async t => {
  const page = await open(t);
  await button(page, 'Learn 5 flags').click();
  const input = await recall(page, 'us');
  await input.fill('U.S.');
  await input.press('Enter');
  await heading(page, 'Correct: United States');
});

test('a failed miss write saves the grade, retry and history together exactly once', { skip: !!base }, async t => {
  const page = await open(t);
  await button(page, 'Learn 5 flags').click();
  const input = await recall(page, 'us');
  const before = await stored(page);
  await page.evaluate(key => {
    const setItem = Storage.prototype.setItem;
    let failOnce = true;
    window.progressWrites = 0;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) {
        if (failOnce) {
          failOnce = false;
          throw new DOMException('Test write refusal', 'QuotaExceededError');
        }
        window.progressWrites++;
      }
      return setItem.call(this, name, value);
    };
  }, progressKey);
  await input.fill('Canada');
  await input.press('Enter');
  await heading(page, 'Couldn’t save progress');
  assert.equal(await stored(page), before);
  await button(page, 'Try again').evaluate(control => {
    if (!(control instanceof HTMLButtonElement)) throw new Error('Expected a retry button');
    control.click();
    control.click();
  });
  await heading(page, 'Not quite: United States');
  assert.equal(await page.evaluate(() => window.progressWrites), 1);
  const saved = parseSavedProgress(await stored(page));
  assert.equal(saved.cards.US.reps, 1);
  assert.deepEqual(saved.retryQueue, ['US']);
  assert.equal(saved.reviewLog?.length, 1);
  await page.reload();
  await recall(page, 'gb');
  assert.deepEqual(parseSavedProgress(await stored(page)), saved);
});

test('reload resumes from saved grades without writing a separate batch cursor', { skip: !!base }, async t => {
  const page = await open(t);
  await button(page, 'Learn 5 flags').click();
  const input = await recall(page, 'us');
  await page.evaluate(key => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Test write refusal', 'QuotaExceededError');
      return setItem.call(this, name, value);
    };
  }, pendingKey);
  await input.fill('United States');
  await input.press('Enter');
  await heading(page, 'Correct: United States');
  assert.equal(parseSavedProgress(await stored(page)).reviewLog?.length, 1);
  await page.reload();
  await recall(page, 'gb');
});

test('an in-flight teaching batch resumes as guesses after due reviews, preserving saved progress', async t => {
  const page = await open(t);
  const now = new Date('2026-05-03T12:00:00Z');
  const earlier = new Date('2026-05-02T12:00:00Z');
  await page.clock.setFixedTime(now);
  const batch = { codes: firstFive, revealed: 1 };
  const enrolled = addFive({ version: 1, cards: {} }, batch.codes, now);
  const withReview = addFive(enrolled, ['DE'], earlier);
  const bytes = JSON.stringify(grade(withReview, 'DE', false, earlier));
  await page.evaluate(entries => {
    for (const [key, value] of entries) localStorage.setItem(key, value);
  }, [[progressKey, bytes], [pendingKey, JSON.stringify(batch)]]);
  await page.reload();
  const input = await recall(page, 'de');
  assert.equal(await stored(page), bytes);
  await input.fill('Germany');
  await input.press('Enter');
  await heading(page, 'Correct: Germany');
  await button(page, 'Next').click();
  await recall(page, 'us');
  assert.equal(await page.locator('.stage').textContent(), 'New · 5 remaining');
  assert.deepEqual(parseSavedProgress(await stored(page)).reviewLog, [earlier.toISOString(), now.toISOString()]);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), pendingKey), JSON.stringify(batch));
});

test('a legacy pending batch saved before enrolment adds only its original five, once', async t => {
  const page = await open(t);
  const batch = JSON.stringify({ codes: firstFive, revealed: 0 });
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [pendingKey, batch]);
  await page.reload();
  await recall(page, 'us');
  const enrolled = await stored(page);
  const { cards, reviewLog } = parseSavedProgress(enrolled);
  assert.deepEqual(Object.keys(cards), firstFive);
  assert.equal(reviewLog, undefined);
  await page.reload();
  await recall(page, 'us');
  assert.equal(await stored(page), enrolled);
});

test('refuses to start over when progress was written by a newer version', { skip: !!base }, async t => {
  const page = await open(t);
  const bytes = '{"version":99,"cards":{}}';
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [progressKey, bytes]);
  await page.reload();
  await heading(page, 'Couldn’t load progress');
  assert.equal(await stored(page), bytes);
  assert.equal(await button(page, 'Learn 5 flags').count(), 0);
});

export type BrowserHarness = {
  open: typeof open;
  heading: typeof heading;
  button: typeof button;
  flag: typeof flag;
  recall: typeof recall;
  stored: typeof stored;
};

regionTests(test, { open, heading, button, flag, recall, stored });
statsTests(test, { open, heading, stored, statsUrl: () => new URL('/stats', url).href });
progressBarsTests(test, { open, stored, statsUrl: () => new URL('/stats', url).href });
