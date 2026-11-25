# Development

Use Node.js 26.

```sh
npm ci --ignore-scripts
npm test
npm run build
```

The build type-checks TypeScript and writes the static site to `dist/`.

With Google Chrome installed, run `npm run test:browser` against the local build or `FLAG_TEST_URL=https://flags.lynas.dev/ npm run test:browser` against production.