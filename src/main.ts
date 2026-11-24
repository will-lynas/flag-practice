import { loadProgress, saveProgress, getDue, nextDue, addFive, getPracticeQueues, recordAttempt, isRecord } from './engine.ts';
import { countries, countriesIn, regions, resolveCountry, searchCountries } from './countries.ts';
import { renderStats } from './stats.ts';
import type { Progress } from './engine.ts';
import type { Country, Region } from './countries.ts';

const app = requiredElement('#trainer');
const byCode = new Map(countries.map(country => [country.code, country]));
const pendingKey = 'flag-trainer.ui.pending.v1';
const regionKey = 'flag-trainer.ui.region';
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

type Question = { country: Country; stage: string };
type Outcome = 'correct' | 'incorrect' | 'skipped';
type Screen = { kind: 'idle' | 'stats' | 'error' }
  | { kind: 'recall'; question: Question }
  | { kind: 'feedback'; question: Question; outcome: Outcome };

let state: Progress | undefined;
let practiceRestored = false;
let screen: Screen | undefined;
let wakeTimer: number | undefined;
let region: Region = 'world';
let inScope = new Set(byCode.keys());

function requiredElement(selector: string): HTMLElement {
  const node = document.querySelector(selector);
  if (!(node instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
  return node;
}

function progress(): Progress {
  if (!state) throw new Error('Progress has not been loaded');
  return state;
}

function readPending() {
  const raw = localStorage.getItem(pendingKey);
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!isRecord(value) || !Array.isArray(value.codes)) return null;
  const codes: unknown[] = value.codes;
  if (codes.length > 5 || new Set(codes).size !== codes.length) return null;
  // Legacy batches also have a teaching cursor; only saved grades mark completion.
  return { codes: codes.filter((code): code is string => typeof code === 'string' && byCode.has(code)) };
}

function saveState(value: Progress) {
  if (!saveProgress(value)) throw new Error('Progress write failed');
  state = value;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const picker = element('select', '', 'region-picker');
picker.setAttribute('aria-label', 'Region');
for (const { id, label } of regions) picker.add(new Option(label, id));
const nav = element('nav', '', 'site-nav');
const links: HTMLAnchorElement[] = [];
nav.setAttribute('aria-label', 'Main');
for (const [label, path] of [['Practice', '/'], ['Stats', '/stats']] as const) {
  const link = element('a', label);
  link.href = path;
  link.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    if (currentPath() === path) return;
    history.pushState(null, '', path);
    renderView(true);
  });
  links.push(link);
  nav.append(link);
}
const header = requiredElement('.site-header');
const tools = element('div', '', 'site-tools');
tools.append(nav, picker);
header.append(tools);
const currentPath = () => /^\/stats\/?$/.test(location.pathname) ? '/stats' : '/';
window.addEventListener('popstate', () => renderView(true));

function selectRegion(id: string | null) {
  region = regions.find(item => item.id === id)?.id ?? 'world';
  picker.value = region;
  inScope = new Set(countriesIn(region).map(country => country.code));
}

picker.addEventListener('change', () => {
  const selected = picker.value;
  function apply() {
    try { localStorage.setItem(regionKey, selected); }
    catch {
      picker.value = region;
      return storageError(apply);
    }
    selectRegion(selected);
    renderView(false);
  }
  apply();
});

function button(label: string, action: () => void, className?: string) {
  const node = element('button', label, className);
  node.type = 'button';
  if (action) node.addEventListener('click', action);
  return node;
}

function mount(view: Screen, title: string, ...content: Node[]) {
  window.clearTimeout(wakeTimer);
  screen = view;
  app.dataset.screen = view.kind;
  const stage = 'question' in view ? view.question.stage : '';
  const heading = element('h2', title);
  heading.id = 'screen-title';
  heading.tabIndex = -1;
  const status = element('p', stage, 'stage');
  if (!stage) status.hidden = true;
  app.replaceChildren(status, heading, ...content);
  return heading;
}

function focusHeading(heading: HTMLHeadingElement) {
  heading.focus();
}

function storageError(action: () => void, load = false) {
  const retry = button('Try again', () => { if (retry.isConnected) action(); });
  focusHeading(mount({ kind: 'error' }, load ? 'Couldn’t load progress' : 'Couldn’t save progress', retryRow(retry)));
}

function retryRow(control: HTMLButtonElement) {
  const row = element('div', '', 'controls');
  row.append(control);
  return row;
}

function flagTray(country: Country, revealed: boolean, controls: HTMLButtonElement[] = []) {
  const tray = element('div', '', 'flag-tray');
  const image = element('img', '', 'flag');
  image.alt = revealed ? `Flag of ${country.name}` : 'Flag to identify';
  const error = element('div', '', 'image-error');
  const message = element('p', 'Flag image unavailable.');
  message.setAttribute('role', 'status');
  const retry = button('Retry image', () => {
    image.removeAttribute('src');
    image.src = country.flag;
  }, 'secondary');
  error.append(message, retry);
  error.hidden = true;
  image.addEventListener('load', () => {
    image.hidden = false;
    error.hidden = true;
    for (const control of controls) control.disabled = false;
    if (document.activeElement === retry) app.querySelector('h2')?.focus();
  });
  image.addEventListener('error', () => {
    image.hidden = true;
    error.hidden = false;
    for (const control of controls) control.disabled = true;
  });
  tray.append(image, error);
  image.src = country.flag;
  return tray;
}

function showIdle(focus: boolean, now: Date) {
  const state = progress();
  const unseen = [...inScope].filter(code => !Object.hasOwn(state.cards, code));
  const started = unseen.length < inScope.size;
  const count = Math.min(5, unseen.length);
  const due = nextDue(state, inScope);
  const upcoming = due instanceof Date && due > now;
  const content: HTMLElement[] = [];
  if (upcoming) {
    const detail = element('p', 'Next review: ', 'detail');
    const time = element('time', dateFormat.format(due));
    time.dateTime = due.toISOString();
    detail.append(time);
    content.push(detail);
  }
  if (count) {
    const label = !started ? `Learn ${count} ${count === 1 ? 'flag' : 'flags'}` : `Learn ${count} more`;
    content.push(retryRow(button(label, () => {
      function start() {
        const now = new Date();
        const current = progress();
        if (getDue(current, now, inScope).length) return showNext();
        try { saveState(addFive(current, unseen, now)); } catch { return storageError(start); }
        showNext();
      }
      start();
    })));
  }
  const heading = mount({ kind: 'idle' }, !started && count ? 'Start learning' : 'No reviews due', ...content);
  if (!started && count) heading.classList.add('sr-only');
  if (focus) focusHeading(heading);
  if (upcoming) wakeTimer = window.setTimeout(() => {
    if (+new Date() >= +due) refreshIdle();
    else showIdle(false, new Date());
  }, Math.min(due.getTime() - now.getTime() + 10, 2 ** 31 - 1));
}

function showFeedback(view: Extract<Screen, { kind: 'feedback' }>) {
  const { country } = view.question;
  const label = view.outcome === 'correct' ? 'Correct' : view.outcome === 'incorrect' ? 'Not quite' : 'Skipped';
  const next = button('Next', () => showNext(), 'answer-action');
  const tray = flagTray(country, true);
  const panel = element('div', '', 'answer-panel');
  const heading = mount(view, `${label}: ${country.name}`, tray, panel);
  heading.classList.add('result');
  heading.dataset.outcome = view.outcome;
  heading.replaceChildren(element('span', `${label}:`, 'outcome'), ` ${country.name}`);
  panel.append(heading, retryRow(next));
  next.setAttribute('aria-describedby', heading.id);
  next.focus();
}

function record(question: Question, answer: string | null) {
  const correct = answer === question.country.code;
  const updated = recordAttempt(progress(), question.country.code, correct);
  function save() {
    try { saveState(updated); }
    catch { return storageError(save); }
    showFeedback({ kind: 'feedback', question, outcome: correct ? 'correct' : answer ? 'incorrect' : 'skipped' });
  }
  save();
}

function showRecall(question: Question, focus: boolean) {
  const { country } = question;
  const form = element('div', '', 'answer-panel');
  const label = element('label', 'Country', 'sr-only');
  label.htmlFor = 'country';
  const input = element('input');
  input.id = 'country';
  input.placeholder = 'Country name';
  input.autocomplete = 'off';
  input.setAttribute('data-1p-ignore', '');
  input.spellcheck = false;
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'none');
  input.setAttribute('enterkeyhint', 'go');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', 'country-options');
  input.setAttribute('aria-describedby', 'screen-title answer-message');

  const list = element('ul', '', 'suggestions');
  list.id = 'country-options';
  list.hidden = true;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Country suggestions');
  const message = element('p', '', 'message');
  message.id = 'answer-message';
  message.setAttribute('role', 'status');
  const announcement = element('p', '', 'sr-only');
  announcement.setAttribute('role', 'status');
  const submit = button('Submit', () => submitAnswer(), 'answer-action');
  const skip = button('Don’t know', () => {
    if (!skip.disabled) answer(null);
  }, 'secondary');
  const actions = retryRow(submit);
  actions.append(skip);
  const combobox = element('div', '', 'country-control');
  combobox.append(label, input, list);
  form.append(combobox, actions, message, announcement);

  let matches: Country[] = [];
  let options: HTMLLIElement[] = [];
  let active = -1;
  let composing = false;

  function answer(code: string | null) {
    if (form.isConnected) record(question, code);
  }

  function highlight(index: number) {
    if (active >= 0) options[active].setAttribute('aria-selected', 'false');
    active = index;
    if (active < 0) {
      input.removeAttribute('aria-activedescendant');
    } else {
      const option = options[active];
      option.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', option.id);
      const top = option.offsetTop;
      const bottom = top + option.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    }
  }

  function close() {
    highlight(-1);
    input.setAttribute('aria-expanded', 'false');
    list.hidden = true;
    list.replaceChildren();
    matches = [];
    options = [];
    announcement.textContent = '';
  }

  function clearMessage() {
    message.textContent = '';
    input.removeAttribute('aria-invalid');
  }

  function choose(option: Country) {
    if (!submit.disabled && !composing) answer(option.code);
  }

  function suggest() {
    close();
    const query = input.value.trim();
    if (!/[\p{L}\p{N}]/u.test(query)) return;
    matches = searchCountries(query).slice(0, 8);
    if (!matches.length) {
      announcement.textContent = 'No suggestions.';
      return;
    }
    options = matches.map((country, i) => {
      const option = element('li', country.name);
      option.id = `country-option-${i}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.addEventListener('mousedown', event => event.preventDefault());
      option.addEventListener('click', () => choose(country));
      return option;
    });
    list.append(...options);
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    announcement.textContent = `${matches.length} ${matches.length === 1 ? 'suggestion' : 'suggestions'} available.`;
  }

  input.addEventListener('input', event => {
    clearMessage();
    if (!composing && !('isComposing' in event && event.isComposing)) suggest();
  });
  input.addEventListener('compositionstart', () => { composing = true; close(); });
  input.addEventListener('compositionend', () => { composing = false; suggest(); });
  input.addEventListener('click', () => { if (list.hidden && !composing) suggest(); });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', event => {
    if (composing || !plainKey(event)) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (list.hidden) suggest();
      if (!matches.length) return;
      event.preventDefault();
      const last = matches.length - 1;
      highlight(event.key === 'ArrowDown' ? Math.min(active + 1, last) : (active <= 0 ? last : active - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!event.repeat) {
        if (active >= 0) choose(matches[active]);
        else submitAnswer(!list.hidden && matches.length === 1 ? matches[0] : undefined);
      }
    } else if (event.key === 'Escape' && !list.hidden) {
      event.preventDefault();
      close();
    }
  });

  function submitAnswer(visibleFallback?: Country) {
    if (composing || submit.disabled) return;
    const chosen = resolveCountry(input.value) ?? visibleFallback;
    if (chosen) return answer(chosen.code);
    input.focus();
    if (list.hidden) suggest();
    input.setAttribute('aria-invalid', 'true');
    message.textContent = input.value.trim() ? 'Enter a full country name or choose a suggestion.' : 'Enter a country or choose Don’t know.';
  }

  const tray = flagTray(country, false, [submit, skip]);
  mount({ kind: 'recall', question }, 'Which country uses this flag?', tray, form).classList.add('sr-only');
  if (focus) input.focus();
}

function showNext(focus = true) {
  const now = new Date();
  const state = progress();
  const { due, retries } = getPracticeQueues(state, now, inScope);
  const reviews = due.filter(code => state.cards[code]?.last_review);
  const code = reviews[0] ?? due[0] ?? retries[0];
  if (code !== undefined) {
    // The queues were filtered to the selected region of this catalogue.
    const country = byCode.get(code);
    if (!country) throw new Error(`Unknown flag ${code}`);
    const stage = reviews.length ? `Review · ${reviews.length} due`
      : due.length ? `New · ${due.length} remaining` : `Retry · ${retries.length} remaining`;
    return showRecall({ country, stage }, focus);
  }
  showIdle(focus, now);
}

function renderView(focus: boolean) {
  const path = currentPath();
  for (const link of links) {
    if (link.pathname === path) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = path === '/stats' ? 'Stats | Flag Practice' : 'Flag Practice';
  if (!state) return init(focus);
  if (path === '/stats') {
    const { content, renderCalendar } = renderStats(state, region);
    const heading = mount({ kind: 'stats' }, 'Stats', content);
    renderCalendar();
    if (focus) focusHeading(heading);
    return;
  }
  if (!practiceRestored) {
    let legacy;
    try { legacy = readPending(); }
    catch { return storageError(() => renderView(true), true); }
    // A v1 batch could be saved before its cards were enrolled. Only Practice owns recovery.
    const restored = addFive(state, legacy?.codes ?? []);
    if (restored !== state) {
      try { saveState(restored); }
      catch { return storageError(() => init(true)); }
    }
    practiceRestored = true;
  }
  showNext(focus);
}

function init(focus = true) {
  try {
    selectRegion(localStorage.getItem(regionKey));
    state = undefined;
    state = loadProgress({ strict: true });
  } catch { return storageError(() => init(true), true); }
  practiceRestored = false;
  renderView(focus);
}

function plainKey(event: KeyboardEvent) {
  return !event.defaultPrevented && !event.isComposing && event.keyCode !== 229 &&
    !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

app.addEventListener('keydown', event => {
  if (screen?.kind !== 'stats' && event.key === 'Enter' && event.repeat && plainKey(event)) event.preventDefault();
});

function refreshIdle() {
  if (screen?.kind === 'idle' && getDue(progress(), new Date(), inScope).length) {
    showNext(document.activeElement !== picker);
  }
}

window.addEventListener('focus', refreshIdle);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshIdle();
});
init();
