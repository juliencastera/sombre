# Sombre

Dark mode for every website: no white flash, guaranteed text contrast, instant toggle.

Chromium extension (Chrome, Edge, Brave, Arc, Opera, Vivaldi), MV3, English and French.
Design and roadmap: [docs/SPEC.md](docs/SPEC.md).

## Development

```sh
npm install
npm run dev        # WXT dev mode with hot reload
npm run build      # production build → .output/chrome-mv3
npm run check      # svelte-check + TypeScript
npm test           # unit tests (Vitest)
npm run test:e2e   # builds, then end-to-end tests of popup, options, shortcut (Playwright)
```

## Try it

`npm run build`, then in `chrome://extensions` enable Developer mode and *Load unpacked* `.output/chrome-mv3`.
Disable Dark Reader first: both use Alt+Shift+D.

## Benchmark

Sombre is measured against Dark Reader on every change. See [bench/README.md](bench/README.md).

```sh
npm run bench:setup
npm run bench
```

## License

MIT
