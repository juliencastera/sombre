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

## Configuration

Optional, in a `.env` file before building:

```sh
WXT_REPO_URL=https://github.com/<owner>/sombre   # enables "Report this site"
WXT_FIXES_URL=https://raw.githubusercontent.com/<owner>/sombre/main/fixes/fixes.signed.json
```

## Shared fixes

Edit `fixes/fixes.json`, then `npm run fixes:sign` (needs the private key created once by
`npm run fixes:keygen`, kept outside the repository). Users can export their own fixes from
the options page in the same format.

## Benchmark

Sombre is measured against Dark Reader on every change. See [bench/README.md](bench/README.md).

```sh
npm run bench:setup
npm run bench
```

## License

MIT
