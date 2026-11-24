import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { countries } from '../src/countries.js';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const read = (dir, path) => readFileSync(new URL(path, dir));
const manifest = () => {
  const files = readdirSync(dist, { recursive: true, withFileTypes: true });
  return Object.fromEntries(files.filter(file => file.isFile()).map(file => {
    const path = `${file.parentPath}/${file.name}`;
    return [path, readFileSync(path)];
  }));
};

test('production builds repeat byte-for-byte and ship all 197 flags and license notices', () => {
  const build = () => execFileSync(process.execPath, ['scripts/build.js'], { cwd: root });
  build();
  const first = manifest();
  build();
  assert.deepEqual(manifest(), first);
  const files = readdirSync(new URL('assets/flags/', dist)).sort();
  assert.equal(files.length, 197);
  assert.deepEqual(files, countries.map(country => country.flag.split('/').at(-1)).sort());
  for (const { flag } of countries) assert.deepEqual(read(dist, flag), read(root, flag), flag);
  for (const notice of ['LICENSE', 'ATTRIBUTIONS.md', 'LICENSES/flag-icons-MIT.txt', 'LICENSES/ts-fsrs-MIT.txt']) {
    assert.deepEqual(read(dist, notice), read(root, notice), notice);
  }
  const html = read(dist, 'index.html').toString();
  const script = html.match(/<script[^>]+src="\.\/(assets\/main-[A-Z0-9]+\.js)"/u)?.[1];
  const style = html.match(/<link[^>]+href="\.\/(assets\/style-[A-Z0-9]+\.css)"/u)?.[1];
  assert.ok(script && style, 'Expected bundled script and stylesheet with content-hashed names');
  assert.ok(read(dist, script).length);
  assert.ok(read(dist, style).length);
});
