import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { countries, searchCountries } from '../src/countries.js';

const codesFor = query => searchCountries(query).map(country => country.code);

test('blank, punctuation-only, and non-string inputs produce no suggestions', () => {
  for (const query of ['', ' \n\t ', '… --', '&', null, undefined, 42]) {
    assert.deepEqual(searchCountries(query), [], String(query));
  }
});

test('common answers come first in the beginner ordering', () => {
  assert.deepEqual(countries.slice(0, 6).map(country => country.code),
    ['US', 'GB', 'CA', 'JP', 'FR', 'DE']);
});

test('case, diacritics, typographic apostrophes, and repeated spaces are ignored', () => {
  for (const query of ['CÔTE D’IVOIRE', "  cote  d'ivoire  ", 'Co\u0302te dIvoire']) {
    assert.equal(codesFor(query)[0], 'CI');
  }
  assert.equal(codesFor('TURKIYE')[0], 'TR');
  assert.equal(codesFor('sao tome')[0], 'ST');
});

test('normalized names, aliases, and country codes support real-world inputs', () => {
  for (const [query, expected] of [
    ['u.s.a.', 'US'], ['  UK ', 'GB'], ['holland', 'NL'], ['Ivory Co', 'CI'],
    ['Burma', 'MM'], ['East Timor', 'TL'], ['D R C', 'CD'], ['South-Kor', 'KR'],
    ['U.A.E.', 'AE'], ['vatican', 'VA'], ['State of Palestine', 'PS'],
    ['taiw', 'TW'], ['xk', 'XK'], ['viet nam', 'VN'], ['Guinea Biss', 'GW'],
    ['Trinidad & T', 'TT'], ['st. lucia', 'LC'],
  ]) {
    assert.equal(codesFor(query)[0], expected, query);
  }
});

test('exact answers precede prefixes, then word starts, then infixes', () => {
  assert.deepEqual(codesFor('niger').slice(0, 2), ['NE', 'NG']);
  assert.deepEqual(codesFor('dominica').slice(0, 2), ['DM', 'DO']);
  assert.deepEqual(codesFor('guinea'), ['GN', 'GW', 'GQ', 'PG']);
  assert.deepEqual(codesFor('africa'), ['ZA', 'CF']);
  assert.deepEqual(codesFor('land').slice(0, 2), ['CH', 'NL']);
  assert.deepEqual(codesFor('Korea'), ['KR', 'KP']);
  assert.equal(codesFor('ca')[0], 'CA');
});

test('matches return the original country records once; unrelated text returns none', () => {
  const results = searchCountries('united');
  assert.ok(results.length >= 3);
  for (const item of results) assert.ok(countries.includes(item));
  assert.equal(new Set(results).size, results.length);
  assert.deepEqual(searchCountries('not a country xyz'), []);
});

test('codes cover the 193 UN members, both UN observers, Taiwan and Kosovo exactly once', () => {
  const expected = `
    AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH
    BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM
    CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES
    ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HN
    HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI
    KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA
    MC MD ME MG MH MK ML MM MN MR MT MU MV MW MX MY MZ NA
    NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW
    PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO
    SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TZ
    UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW
  `.trim().split(/\s+/u);
  assert.equal(expected.length, 195);
  assert.deepEqual(countries.map(country => country.code).sort(), [...expected, 'TW', 'XK'].sort());
});

test('country records contain only scrubbed names, aliases, codes and relative flag paths', () => {
  const label = /^(?:\p{L}[\p{L}\p{M}]*)(?:[ ’-]\p{L}[\p{L}\p{M}]*)*$/u;
  for (const country of countries) {
    const { code, name, aliases, flag } = country;
    assert.deepEqual(Object.keys(country).sort(), ['aliases', 'code', 'flag', 'name']);
    assert.match(code, /^[A-Z]{2}$/u);
    assert.ok(Array.isArray(aliases), code);
    assert.equal(new Set(aliases).size, aliases.length, code);
    for (const entry of [name, ...aliases]) {
      assert.equal(typeof entry, 'string', code);
      assert.match(entry, label, code);
      assert.equal(entry, entry.normalize('NFC'), code);
    }
    assert.equal(flag, `assets/flags/${code.toLowerCase()}.svg`);
    assert.equal(searchCountries(name)[0], country);
    assert.equal(searchCountries(code)[0], country);
  }
});

test('one regular local SVG per country is shipped with no unused assets', () => {
  const directory = new URL('../assets/flags/', import.meta.url);
  const expected = countries.map(country => `${country.code.toLowerCase()}.svg`).sort();
  assert.deepEqual(readdirSync(directory).sort(), expected);
  for (const filename of expected) {
    const url = new URL(filename, directory);
    assert.ok(lstatSync(url).isFile(), filename);
    assert.match(readFileSync(url, 'utf8'), /^<svg\s[^>]*\bviewBox="[^"]+"/u, filename);
  }
});

test('vendored flags match the audited variable-proportion upstream snapshot', () => {
  const directory = new URL('../assets/flags/', import.meta.url);
  const flags = createHash('sha256');
  for (const filename of readdirSync(directory).sort()) {
    flags.update(`${filename}\0`);
    flags.update(readFileSync(new URL(filename, directory)));
    flags.update('\0');
  }
  assert.equal(flags.digest('hex'), '32505029e0a4be481311028c4d271c1e9d72785efa683e04ab6fc7f0aecdde1b');
});

test('flag artwork retains square, wide and non-rectangular proportions', () => {
  const flag = code => readFileSync(new URL(`../assets/flags/${code}.svg`, import.meta.url), 'utf8');
  const ratio = code => {
    const [, , width, height] = flag(code).match(/\bviewBox="([^"]+)"/u)[1].split(/\s+/u).map(Number);
    return width / height;
  };
  assert.equal(ratio('ch'), 1);
  assert.equal(ratio('us'), 1.9);
  assert.ok(ratio('qa') > 2.5);
  assert.ok(ratio('np') < 1);
});
