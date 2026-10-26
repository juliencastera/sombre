# Sombre

Dark mode for every website: no white flash, guaranteed text contrast, instant toggle.

Chromium extension (Chrome, Edge, Brave, Arc, Opera, Vivaldi), MV3. Status: **M0 — foundations**.
Design and roadmap: [docs/SPEC.md](docs/SPEC.md).

## Development

```sh
npm install
npm run dev        # WXT dev mode with hot reload
npm run build      # production build → .output/chrome-mv3
npm run check      # svelte-check + TypeScript
npm test           # unit tests (Vitest)
```

## Benchmark

Sombre is measured against Dark Reader on every change. See [bench/README.md](bench/README.md).

```sh
npm run bench:setup
npm run bench
```

## License

MIT
