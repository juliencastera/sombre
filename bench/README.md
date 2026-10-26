# Benchmark

Measures Sombre against Dark Reader (and a no-extension control) on the metrics
from [SPEC §11](../docs/SPEC.md#11-benchmark-success-criteria-vs-dark-reader).
Every milestone exits on these numbers.

## Setup

```sh
npm install
npm run bench:setup   # downloads Dark Reader (pinned) + Playwright Chromium
npm run build         # builds Sombre into .output/chrome-mv3
```

Requires `openssl` on the PATH (ships with Git for Windows, macOS, Linux) to
generate the fixture servers' self-signed certificate on first run.

## Run

```sh
npm run bench                                  # fixtures, all targets
npm run bench -- --sites all                   # fixtures + real sites
npm run bench -- --sites real --har live       # real sites, no archives
npm run bench -- --sites github,hackernews --targets control,darkreader
npm run bench -- --scheme light --headed       # OS in light mode, visible browser
```

| Option | Default | Values |
|---|---|---|
| `--sites` | `fixtures` | `all`, `fixtures`, `real`, or comma-separated ids from `corpus.ts` |
| `--targets` | `control,darkreader,sombre` | any subset |
| `--scheme` | `dark` | emulated OS color scheme (`dark` matches Sombre's default "Auto" user) |
| `--har` | `replay` | `replay` uses archives when present, `live` always hits the network |
| `--headed` | off | show the browser |

Output goes to `bench/results/<timestamp>/`: `report.html` (tables + screenshots),
`report.md`, `results.json`.

## Archiving real sites

Real sites change daily; archives make runs comparable.

```sh
npm run bench:record                      # record every real site as HAR (headed)
npm run bench:record -- --sites amazon    # selected sites
npm run bench:record -- --login           # log into TEST accounts, saves cookies
```

Archives (`bench/.cache/har/`) and the session (`bench/profiles/auth.json`) stay
local and gitignored: they contain cookies. Never log in with a personal account.
Banking sites are never part of the corpus.

## What each metric means

| Metric | How |
|---|---|
| Light frames (1st / 2nd visit) | CDP screencast during navigation; frames painted after the new document commits whose mean OKLab L > 0.5. 2nd visit = same tab, warm caches |
| Toggle | Command → last change of computed colors on a fixed set of elements (viewport grid + root), polled every animation frame |
| Texts below Lc 45 / median \|Lc\| | Every visible, unobscured text element in the top document and open shadow roots; APCA between its color and its effective background resolved through ancestors |
| Bright area | % of sampled viewport pixels with OKLab L > 0.8, excluding images, video, canvas and CSS background images |
| Script time / JS heap | `Performance.getMetrics` after the 1st visit (includes content scripts) |

## Known limitations

- **Fixtures use HTTPS on public-looking hostnames** (`sombre-bench.dev`,
  `cdn.sombre-assets.dev`) mapped to local servers by `--host-resolver-rules`.
  Extensions refuse or special-case `http:`, ports, IPs and local hostnames —
  Dark Reader will not fetch a cross-origin stylesheet from `http://127.0.0.1:4101`.
- **Bot protection**: some sites (Leboncoin's DataDome) block headless Chromium
  with a fresh profile. Record them with `bench:record` (headed) and replay.
- **Extension workers bypass HAR replay**: stylesheets an extension fetches
  itself go to the live network.
- **Contrast probe**: text inside iframes is not sampled; backgrounds behind
  images, gradients, filters or blend modes are flagged `uncertain` and excluded.
- **Native dark sites** (GitHub…) can fail Lc 45 on their own muted text
  (GitHub ≈ Lc 44). The contrast criterion judges pages rendered by an engine,
  not native themes that are deliberately left untouched.
- Toggle time is n/a when a target leaves the page untouched (e.g. Dark Reader
  on a native dark site): the run waits for the 10 s timeout twice.
