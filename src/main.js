import { loadProgress, saveProgress, getDue, nextDue, addFive, grade, knownCodes } from './engine.js';
import { countries, resolveCountry, searchCountries } from './countries.js';

const app = document.querySelector('#trainer');
const byCode = new Map(countries.map(country => [country.code, country]));
const codes = [...byCode.keys()];
const pendingKey = 'flag-trainer.ui.pending.v1';
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

let state;
let pending;
let screen;
let wakeTimer;

function readPending() {
  const raw = localStorage.getItem(pendingKey);
  if (!raw) return null;
  let value;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(value?.codes) || value.codes.length > 5 || new Set(value.codes).size !== value.codes.length ||
      !Number.isInteger(value.revealed) || value.revealed < 0 || value.revealed > value.codes.length) return null;
  return {
    codes: value.codes.filter(code => byCode.has(code)),
    revealed: value.codes.slice(0, value.revealed).filter(code => byCode.has(code)).length,
  };
}

function setPending(value) {
  localStorage.setItem(pendingKey, JSON.stringify(value));
  pending = value;
}

function saveState(value) {
  if (!saveProgress(value)) throw new Error('Progress write failed');
  state = value;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(label, action, className) {
  const node = element('button', label, className);
  node.type = 'button';
  if (action) node.addEventListener('click', action);
  return node;
}

function mount(kind, title, stage, ...content) {
  clearTimeout(wakeTimer);
  screen = kind;
  const heading = element('h2', title);
  heading.id = 'screen-title';
  heading.tabIndex = -1;
  const status = element('p', stage, 'stage');
  if (!stage) status.hidden = true;
  app.replaceChildren(status, heading, ...content);
  return heading;
}

function focusHeading(heading) {
  heading.focus();
}

function storageError(action, load = false) {
  const retry = button('Try again', action);
  focusHeading(mount('error', load ? 'Couldn’t load progress' : 'Couldn’t save progress', '', retryRow(retry)));
}

function retryRow(control) {
  const row = element('div', '', 'controls');
  row.append(control);
  return row;
}

function flagTray(country, revealed, controls = []) {
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
    if (document.activeElement === retry) app.querySelector('h2').focus();
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

function showIdle(focus, now) {
  const known = new Set(knownCodes(state));
  const unseen = codes.filter(code => !known.has(code));
  const count = Math.min(5, unseen.length);
  const due = nextDue(state);
  const upcoming = due instanceof Date && due > now;
  const content = [];
  if (upcoming) {
    const detail = element('p', 'Next review: ', 'detail');
    const time = element('time', dateFormat.format(due));
    time.dateTime = due.toISOString();
    detail.append(time);
    content.push(detail);
  }
  if (count) {
    const label = !known.size ? `Learn ${count} ${count === 1 ? 'flag' : 'flags'}` : `Learn ${count} more`;
    content.push(retryRow(button(label, () => {
      const now = new Date();
      if (getDue(state, now).some(code => byCode.has(code))) return showNext();
      const batch = { codes: unseen.slice(0, count), revealed: 0 };
      function start() {
        try { setPending(batch); } catch { return storageError(start); }
        showNext();
      }
      start();
    })));
  }
  const heading = mount('idle', !known.size && count ? 'Start learning' : 'No reviews due', '', ...content);
  if (focus) focusHeading(heading);
  if (upcoming) wakeTimer = setTimeout(() => {
    if (+new Date() >= +due) refreshIdle();
    else showIdle(false, new Date());
  }, Math.min(due - now + 10, 2 ** 31 - 1));
}

function showTeaching(country, focus) {
  function advance() {
    try { setPending({ ...pending, revealed: pending.revealed + 1 }); }
    catch { return storageError(advance); }
    showNext();
  }
  const next = button('Continue', advance);
  const tray = flagTray(country, true, [next]);
  const heading = mount('teach', country.name, `Learn ${pending.revealed + 1} of ${pending.codes.length}`, tray, retryRow(next));
  next.setAttribute('aria-describedby', heading.id);
  if (focus) next.focus();
}

function showFeedback(country, stage, answer, correct) {
  const label = correct ? 'Correct' : answer ? 'Not quite' : 'Skipped';
  const next = button('Next', () => showNext());
  const heading = mount('feedback', `${label}: ${country.name}`, stage,
    flagTray(country, true), retryRow(next));
  heading.classList.add('result');
  heading.dataset.outcome = correct ? 'correct' : answer ? 'incorrect' : 'skipped';
  next.setAttribute('aria-describedby', heading.id);
  next.focus();
}

function record(country, stage, answer) {
  const correct = answer === country.code;
  const now = new Date();
  function save() {
    try { saveState(grade(state, country.code, correct, now)); }
    catch { return storageError(save); }
    showFeedback(country, stage, answer, correct);
  }
  save();
}

function showRecall(country, stage, focus) {
  const form = element('div');
  const label = element('label', 'Country', 'sr-only');
  label.htmlFor = 'country';
  const input = element('input');
  input.id = 'country';
  input.placeholder = 'Country name';
  input.autocomplete = 'off';
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
  const submit = button('Submit', () => submitAnswer());
  const skip = button('Don’t know', () => {
    if (!skip.disabled) record(country, stage, null);
  }, 'secondary');
  const actions = retryRow(submit);
  actions.append(skip);
  const combobox = element('div', '', 'country-control');
  combobox.append(label, input, list);
  form.append(combobox, message, announcement, actions);

  let matches = [];
  let active = -1;
  let composing = false;

  function highlight(index) {
    if (active >= 0) list.children[active].setAttribute('aria-selected', 'false');
    active = index;
    if (active < 0) {
      input.removeAttribute('aria-activedescendant');
    } else {
      const option = list.children[active];
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
    announcement.textContent = '';
  }

  function clearMessage() {
    message.textContent = '';
    input.removeAttribute('aria-invalid');
  }

  function choose(option) {
    if (!submit.disabled && !composing) record(country, stage, option.code);
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
    list.append(...matches.map((country, i) => {
      const option = element('li', country.name);
      option.id = `country-option-${i}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.addEventListener('mousedown', event => event.preventDefault());
      option.addEventListener('click', () => choose(country));
      return option;
    }));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    announcement.textContent = `${matches.length} ${matches.length === 1 ? 'suggestion' : 'suggestions'} available.`;
  }

  input.addEventListener('input', event => {
    clearMessage();
    if (!composing && !event.isComposing) suggest();
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
        else submitAnswer();
      }
    } else if (event.key === 'Escape' && !list.hidden) {
      event.preventDefault();
      close();
    }
  });

  function submitAnswer() {
    if (composing || submit.disabled) return;
    const chosen = resolveCountry(input.value);
    if (chosen) return record(country, stage, chosen.code);
    input.focus();
    if (list.hidden) suggest();
    input.setAttribute('aria-invalid', 'true');
    message.textContent = input.value.trim() ? 'Enter a full country name or choose a suggestion.' : 'Enter a country or choose Don’t know.';
  }

  const tray = flagTray(country, false, [submit, skip]);
  mount('recall', 'Which country uses this flag?', stage, tray, form);
  if (focus) input.focus();
}

function showNext(focus = true) {
  const now = new Date();
  // The durable FSRS grade is also the batch completion record. A separate
  // answer cursor could otherwise lag behind a saved grade after a reload.
  const newCodes = new Set(pending?.codes.filter(code => !state.cards[code]?.last_review));
  const due = getDue(state, now).filter(code => byCode.has(code) && !newCodes.has(code));
  if (due.length) return showRecall(byCode.get(due[0]), `Review · ${due.length} due`, focus);
  if (newCodes.size) {
    // Save the UI batch before adding it so a reload can resume ungraded teaching.
    const known = new Set(knownCodes(state));
    const missing = [...newCodes].filter(code => !known.has(code));
    if (missing.length) {
      try { saveState(addFive(state, missing, now)); }
      catch { return storageError(() => showNext()); }
    }
    if (pending.revealed < pending.codes.length) return showTeaching(byCode.get(pending.codes[pending.revealed]), focus);
    const code = newCodes.values().next().value;
    return showRecall(byCode.get(code), `New flags · ${pending.codes.length - newCodes.size + 1} of ${pending.codes.length}`, focus);
  }
  showIdle(focus, now);
}

function init(focus = true) {
  try {
    state = loadProgress({ strict: true });
    pending = readPending();
  } catch { return storageError(() => init(true), true); }
  showNext(focus);
}

function plainKey(event) {
  return !event.defaultPrevented && !event.isComposing && event.keyCode !== 229 &&
    !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

app.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.repeat && plainKey(event)) event.preventDefault();
});

function refreshIdle() {
  if (screen === 'idle' && getDue(state).some(code => byCode.has(code))) showNext();
}

window.addEventListener('focus', refreshIdle);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshIdle();
});
init();
