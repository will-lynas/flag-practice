import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { addFive, grade } from '../src/engine.js';
import { regionTests } from './regions.browser.js';

const progressKey = 'flag-trainer:progress:v1';
const pendingKey = 'flag-trainer.ui.pending.v1';
const firstFive = ['US', 'GB', 'CA', 'JP', 'FR'];
const firstFiveNames = ['United States', 'United Kingdom', 'Canada', 'Japan', 'France'];
const base = process.env.FLAG_TEST_URL;
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml' };
let browser, server, url;

test.before(async () => {
  if (base) url = new URL(base).href;
  else {
    server = createServer(async (request, response) => {
      const path = new URL(request.url, 'http://localhost').pathname;
      const asset = /^\/assets\/(?:flags\/[a-z]{2}\.svg|[\w-]+\.(?:js|css))$/u.test(path);
      const file = path === '/' ? 'index.html' : asset ? path.slice(1) : '';
      const type = file && types[file.split('.').at(-1)];
      try {
        if (!type) throw new Error('Not a site asset');
        const body = await readFile(new URL(`../dist/${file}`, import.meta.url));
        response.writeHead(200, { 'Content-Type': type }).end(body);
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}/`;
  }
  browser = await chromium.launch({ channel: process.env.CHROMIUM_PATH ? undefined : 'chrome',
    executablePath: process.env.CHROMIUM_PATH, headless: true });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function open(t, contextOptions) {
  const context = await browser.newContext(contextOptions);
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  const response = await page.goto(url);
  assert.ok(response.ok(), `Page returned ${response.status()}: ${url}`);
  assert.equal(new URL(page.url()).origin, new URL(url).origin);
  return page;
}

const button = (page, name) => page.getByRole('button', { name, exact: true });
const heading = (page, name) => page.getByRole('heading', { name, exact: true }).waitFor();
const stored = page => page.evaluate(key => localStorage.getItem(key), progressKey);

async function flag(page, code, alt) {
  const img = page.getByRole('img', { name: alt, exact: true });
  await img.waitFor();
  await page.waitForFunction(c => {
    const img = document.querySelector('main img');
    return img?.complete && img.naturalWidth > 0 && new URL(img.src).pathname === `/assets/flags/${c}.svg`;
  }, code);
}

async function recall(page, code) {
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
  // Keep incorrect cards from becoming due mid-batch while the browser runs.
  await page.clock.setFixedTime(new Date('2026-05-03T12:00:00Z'));
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
  assert.equal(JSON.parse(await stored(page)).reviewLog, undefined);
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
  const afterSkip = JSON.parse(await stored(page));
  assert.equal(afterSkip.reviewLog.length, 4);
  // Both fresh cards were graded at the same instant: Skip must match a wrong guess.
  assert.deepEqual(afterSkip.cards.JP, afterSkip.cards.GB);
  await page.keyboard.press('Enter');
  input = await recall(page, 'fr');
  await input.fill('France');
  await input.press('Enter');
  await heading(page, 'Correct: France');
  await page.keyboard.press('Enter');
  await heading(page, 'No reviews due');
  await button(page, 'Learn 5 more').waitFor();
  const finished = await stored(page);
  const { cards, reviewLog } = JSON.parse(finished);
  assert.deepEqual(Object.keys(cards), firstFive);
  assert.equal(reviewLog.length, 5);
  assert.ok(Date.parse(cards.GB.due) < Date.parse(cards.US.due));
  assert.equal(await page.getByRole('link', { name: /stats|regions/i }).count(), 0);
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
  assert.equal(JSON.parse(await stored(page)).reviewLog, undefined);

  await page.keyboard.down('Enter');
  await heading(page, 'Correct: United States');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await heading(page, 'Correct: United States');
  assert.equal(JSON.parse(await stored(page)).reviewLog.length, 1);
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
  assert.equal(JSON.parse(await stored(page)).reviewLog, undefined);
});

test('submits an exact normalized country code without needing a suggestion', async t => {
  const page = await open(t);
  await button(page, 'Learn 5 flags').click();
  const input = await recall(page, 'us');
  await input.fill('U.S.');
  await input.press('Enter');
  await heading(page, 'Correct: United States');
});

test('a failed progress write does not advance or double-count a review on retry', { skip: !!base }, async t => {
  const page = await open(t);
  await button(page, 'Learn 5 flags').click();
  const input = await recall(page, 'us');
  const before = await stored(page);
  await page.evaluate(key => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) {
        Storage.prototype.setItem = setItem;
        throw new DOMException('Test write refusal', 'QuotaExceededError');
      }
      return setItem.call(this, name, value);
    };
  }, progressKey);
  await input.fill('United States');
  await input.press('Enter');
  await heading(page, 'Couldn’t save progress');
  assert.equal(await stored(page), before);
  await button(page, 'Try again').click();
  await heading(page, 'Correct: United States');
  await page.reload();
  await recall(page, 'gb');
  assert.equal(JSON.parse(await stored(page)).reviewLog.length, 1);
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
  assert.equal(JSON.parse(await stored(page)).reviewLog.length, 1);
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
  assert.deepEqual(JSON.parse(await stored(page)).reviewLog, [earlier.toISOString(), now.toISOString()]);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), pendingKey), JSON.stringify(batch));
});

test('a legacy pending batch saved before enrolment adds only its original five, once', async t => {
  const page = await open(t);
  const batch = JSON.stringify({ codes: firstFive, revealed: 0 });
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [pendingKey, batch]);
  await page.reload();
  await recall(page, 'us');
  const enrolled = await stored(page);
  const { cards, reviewLog } = JSON.parse(enrolled);
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

regionTests(test, { open, heading, button, flag, recall, stored });
