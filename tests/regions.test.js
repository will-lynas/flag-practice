import assert from 'node:assert/strict';
import test from 'node:test';
import { countries } from '../src/countries.js';
import * as catalog from '../src/countries.js';
import * as engine from '../src/engine.js';

const totals = { africa: 54, asia: 49, europe: 45, 'north-america': 23, oceania: 14, 'south-america': 12 };

test('the six continents partition the exact World catalogue', () => {
  assert.deepEqual(catalog.regions?.map(region => region.id), ['world', ...Object.keys(totals)]);
  const all = [];
  for (const [id, size] of Object.entries(totals)) {
    const codes = catalog.countriesIn(id).map(country => country.code);
    assert.equal(codes.length, size, id);
    all.push(...codes);
  }
  assert.equal(all.length, 197);
  assert.deepEqual(all.sort(), countries.map(country => country.code).sort());
  assert.deepEqual(catalog.countriesIn('world'), countries);
  assert.deepEqual(catalog.countriesIn('north-america').slice(0, 5).map(c => c.code), ['US', 'CA', 'MX', 'JM', 'CU']);
  for (const [region, codes] of Object.entries({ asia: ['CY', 'TR', 'KZ', 'TW'], europe: ['RU', 'XK'], africa: ['EG'] })) {
    const assigned = new Set(catalog.countriesIn(region).map(c => c.code));
    assert.ok(codes.every(code => assigned.has(code)));
  }
});

test('due selection and next wake-up use only the allowed codes', () => {
  const now = new Date('2026-05-01T12:00:00Z');
  const future = new Date('2026-05-02T12:00:00Z');
  const state = { cards: { BR: { due: now }, DE: { due: future }, FR: { due: now }, US: { due: future } } };
  const europe = new Set(['DE', 'FR']);
  assert.deepEqual(engine.getDue(state, now, europe), ['FR']);
  assert.equal(+engine.nextDue(state, new Set(['DE'])), +future);
  assert.equal(engine.nextDue(state, new Set(['JP'])), null);
  assert.deepEqual(engine.getDue(state, now), ['BR', 'FR']);
});
