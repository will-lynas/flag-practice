import { renderHeatmap } from './heatmap.ts';
import { completedCalendar, dueCalendar } from './review-calendar-data.ts';
import { getHeatmapData } from './engine.ts';
import { countriesIn } from './countries.ts';
import type { Region } from './countries.ts';
import type { Progress } from './engine.ts';
import type { ActivateCalendar, ClearCalendar } from './heatmap.ts';
import { getStats, statuses } from './stats-data.ts';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string | number | null, className?: string) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}

function table(name: string, columns: readonly string[]) {
  const node = element('table', null, 'stats-table');
  node.createCaption().textContent = name;
  const row = node.createTHead().insertRow();
  for (const label of columns) {
    const header = element('th', label);
    header.scope = 'col';
    row.append(header);
  }
  return { node, body: node.createTBody() };
}

function rowWithHeading(body: HTMLTableSectionElement, name: string) {
  const row = body.insertRow();
  const heading = element('th', name);
  heading.scope = 'row';
  row.append(heading);
  return row;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const progressStages = [...statuses].reverse();

function progressBreakdown({ counts, total, breakdown }: ReturnType<typeof getStats>) {
  const section = element('section', null, 'stats-progress');
  const heading = element('h3', 'Progress breakdown');
  heading.id = 'stats-progress-title';
  section.setAttribute('aria-labelledby', heading.id);
  const continents = element('div', null, 'stats-progress__continents');

  for (const scope of [{ id: 'world', label: 'World', counts, total }, ...breakdown]) {
    const row = element('section', null, 'stats-progress__scope');
    const label = element('h4', scope.label);
    label.id = `stats-progress-${scope.id}`;
    row.setAttribute('aria-labelledby', label.id);
    const bar = element('div', null, 'stats-progress__bar');
    bar.setAttribute('aria-hidden', 'true');
    const values = element('p', null, 'stats-progress__counts');
    for (const status of progressStages) {
      const count = scope.counts[status];
      if (count > 0) {
        const segment = element('span', null, 'stats-progress__segment');
        segment.dataset.status = status;
        segment.style.inlineSize = `${100 * count / scope.total}%`;
        bar.append(segment);
      }
      const value = element('span');
      value.append(element('strong', count), ` ${status}`);
      values.append(value);
    }
    row.append(label, bar, values);
    if (scope.id === 'world') section.append(heading, row);
    else continents.append(row);
  }
  section.append(continents);
  return section;
}

export function renderStats(state: Progress, region: Region, now = new Date()) {
  const scoped = getStats(state, region, now);
  const { rows, counts, total, dueNow, breakdown } = scoped;
  const overview = progressBreakdown(region === 'world' ? scoped : getStats(state, 'world', now));
  const summary = element('dl', null, 'stats-summary');
  const metrics: (readonly [string, number])[] = [['Total', total], ...statuses.map(status => [status, counts[status]] as const), ['Due now', dueNow]];
  for (const [label, value] of metrics) {
    const metric = element('div');
    const name = element('dt', label);
    if (label === 'Learnt') name.title = 'Last scheduled interval was at least 14 days';
    metric.append(name, element('dd', value));
    summary.append(metric);
  }

  const calendars = element('div', null, 'stats-calendars');
  const allowed = new Set(countriesIn(region).map(country => country.code));
  const { reviews, due } = getHeatmapData(state, allowed, { includeUnassigned: region === 'world' });

  const regional = table('Regional breakdown', ['Region', ...statuses, 'Total']);
  regional.node.classList.add('stats-table--breakdown');
  for (const { label, counts, total } of breakdown) {
    const row = rowWithHeading(regional.body, label);
    for (const value of [...statuses.map(status => counts[status]), total]) row.insertCell().textContent = String(value);
  }

  const countries = table('Countries', ['Country', 'Status', 'Next review']);
  countries.node.classList.add('stats-table--countries');
  for (const { country, status, due } of rows) {
    const row = rowWithHeading(countries.body, country.name);
    const image = element('img', null, 'stats-flag');
    image.alt = '';
    image.loading = 'lazy';
    image.src = `/${country.flag}`;
    row.cells[0].prepend(image);
    const stage = element('span', status, 'stats-status');
    stage.dataset.status = status;
    if (status === 'Learnt') stage.title = 'Last scheduled interval was at least 14 days';
    row.insertCell().append(stage);
    const next = row.insertCell();
    if (due) {
      const time = element('time', dateFormat.format(due));
      time.dateTime = due.toISOString();
      next.append(time);
    } else next.textContent = '—';
  }
  const content = element('div', null, 'stats-content');
  content.append(overview, summary, calendars);
  if (region === 'world') content.append(regional.node);
  content.append(countries.node);
  return { content, renderCalendar: () => {
    let clearActive: ClearCalendar | undefined;
    const activate: ActivateCalendar = clear => {
      if (clearActive !== clear) clearActive?.();
      clearActive = clear;
    };
    renderHeatmap(calendars, completedCalendar(reviews, now), activate);
    renderHeatmap(calendars, dueCalendar(due, now), activate);
  } };
}
