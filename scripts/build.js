import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });

const { metafile } = await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['src/main.js', 'src/style.css'],
  outdir: 'dist/assets',
  entryNames: '[name]-[hash]',
  format: 'esm',
  bundle: true,
  minify: true,
  metafile: true,
});

let html = await readFile(new URL('index.html', root), 'utf8');
for (const [path, { entryPoint }] of Object.entries(metafile.outputs)) {
  if (!entryPoint || !html.includes(`"./${entryPoint}"`)) {
    throw new Error(`Missing HTML reference for ${entryPoint ?? path}`);
  }
  html = html.replace(`"./${entryPoint}"`, `"./${path.slice('dist/'.length)}"`);
}
await writeFile(new URL('index.html', dist), html);
for (const path of ['assets/flags', 'LICENSE', 'LICENSES', 'ATTRIBUTIONS.md']) {
  await cp(new URL(path, root), new URL(path, dist), { recursive: true });
}
