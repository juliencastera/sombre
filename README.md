# Sombre

[![CI](https://github.com/juliencastera/sombre/actions/workflows/ci.yml/badge.svg)](https://github.com/juliencastera/sombre/actions/workflows/ci.yml)

Dark mode for every website: no white flash, guaranteed text contrast, instant toggle.

Chromium extension (Chrome, Edge, Brave, Arc, Opera, Vivaldi), MV3, English and French.
Design and roadmap: [docs/SPEC.md](docs/SPEC.md). Privacy: [PRIVACY.md](PRIVACY.md). Store listing, images and
submission guide: [store/](store/README.md).

## Development

```sh
npm install
npm run dev        # WXT dev mode with hot reload
npm run build      # production build → .output/chrome-mv3
npm run check      # svelte-check + TypeScript
npm run lint       # ESLint (npm run format to apply Prettier)
npm test           # unit tests (Vitest)
npm run test:e2e   # builds, then end-to-end tests of popup, options, shortcut (Playwright)
```

The same actions are available through `make` (`make` alone lists them), for example
`make verify` before a commit (what CI runs on every push and pull request), or
`make bench SITES=real HAR=live`.

## Releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
[release-please](https://github.com/googleapis/release-please) keeps a release pull request
up to date on `main` (version bump and [CHANGELOG.md](CHANGELOG.md)): `fix:` makes a patch
release, `feat:` a minor one, a `!` or `BREAKING CHANGE:` a major one. Merging it tags the
version and publishes a GitHub release with the extension zip for the Chrome Web Store
attached. Running the *Release* workflow by hand attaches the zip to an existing tag.

## Try it

`npm run build`, then in `chrome://extensions` enable Developer mode and *Load unpacked* `.output/chrome-mv3`.
Disable Dark Reader first: both use Alt+Shift+D.

## Configuration

Builds point at this repository by default: "Report this site" opens an issue here, and the
signed shared fix list is refreshed daily from `fixes/fixes.signed.json` on `main`. A fork
overrides them in a `.env` file before building (an empty value turns the feature off):

```sh
WXT_REPO_URL=https://github.com/<owner>/sombre
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
