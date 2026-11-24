import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium } from 'playwright-core';

const progressKey = 'flag-trainer:progress:v1';
const firstFive = [
  ['us', 'United States'], ['gb', 'United Kingdom'], ['ca', 'Canada'],
  ['jp', 'Japan'], ['fr', 'France'],
];
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

async function open(t) {
  const context = await browser.newContext();
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

async function teach(page, reload = false) {
  await button(page, 'Learn 5 flags').click();
  for (const [i, [code, name]] of firstFive.entries()) {
    await heading(page, name);
    await flag(page, code, `Flag of ${name}`);
    assert.equal(await page.getByRole('combobox').count(), 0);
    if (i === 1 && reload) {
      await page.reload();
      await heading(page, name);
      await flag(page, code, `Flag of ${name}`);
    }
    await page.keyboard.press('Enter');
  }
}

async function recall(page, code) {
  await heading(page, 'Which country uses this flag?');
  await flag(page, code, 'Flag to identify');
  const input = page.getByRole('combobox', { name: 'Country' });
  assert.equal(await input.evaluate(el => document.activeElement === el), true);
  return input;
}

test('teaches the real first five, resumes on reload, accepts keyboard autocomplete and keeps FSRS history', async t => {
  const page = await open(t);
  // Let the real scheduler and browser run, but prevent animation/time-zone and
  // wall-clock delays from accidentally making an incorrect card due mid-batch.
  await page.clock.setFixedTime(new Date('2026-05-03T12:00:00Z'));
  await teach(page, true);
  let input = await recall(page, 'us');
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
  await input.press('Enter');
  await heading(page, 'Correct: United States');
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
  assert.deepEqual(Object.keys(cards), firstFive.map(([code]) => code.toUpperCase()));
  assert.equal(reviewLog.length, 5);
  assert.ok(Date.parse(cards.GB.due) < Date.parse(cards.US.due));
  assert.equal(await page.getByRole('link', { name: /stats|regions/i }).count(), 0);
  await page.reload();
  await heading(page, 'No reviews due');
  assert.equal(await stored(page), finished);
  await page.clock.setFixedTime(new Date(cards.GB.due));
  await page.reload();
  await recall(page, 'gb');
  assert.equal(await button(page, 'Learn 5 more').count(), 0);
});

test('submits an exact normalized country code without needing a suggestion', async t => {
  const page = await open(t);
  await teach(page);
  const input = await recall(page, 'us');
  await input.fill('U.S.');
  await input.press('Enter');
  await heading(page, 'Correct: United States');
});

test('a failed progress write does not advance or double-count a review on retry', { skip: !!base }, async t => {
  const page = await open(t);
  await teach(page);
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

test('reload resumes from saved grades even if the new-batch cursor write is interrupted', { skip: !!base }, async t => {
  const page = await open(t);
  await teach(page);
  const input = await recall(page, 'us');
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === 'flag-trainer.ui.pending.v1') throw new DOMException('Test write refusal', 'QuotaExceededError');
      return setItem.call(this, name, value);
    };
  });
  await input.fill('United States');
  await input.press('Enter');
  await heading(page, 'Correct: United States');
  assert.equal(JSON.parse(await stored(page)).reviewLog.length, 1);
  await page.reload();
  await recall(page, 'gb');
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
