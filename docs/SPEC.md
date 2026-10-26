# Sombre — Product & Technical Spec

> A dark mode extension for Chromium browsers that aims to beat Dark Reader on
> three measurable points: **no white flash**, **guaranteed text contrast**,
> **instant toggle** — with a simpler UX.

Status: design validated, implementation not started. License: MIT. Price: free.

---

## 1. Goals & scope

| Decision | Choice |
|---|---|
| Audience | Personal use first (dogfooding), then public release on Chrome Web Store |
| Hard constraint | No white flash on page load |
| Browsers | All Chromium (Chrome, Edge, Brave, Arc, Opera, Vivaldi). Firefox deferred to a dedicated port |
| Languages | EN (default locale) + FR via `chrome.i18n`. Code, comments, issues, README in English |
| Telemetry | None. Only network request: signed fix list download |

Out of reach for any extension (documented, not a bug): `chrome://` pages, native
New Tab, Chrome Web Store, built-in PDF viewer, and the blank canvas Chrome paints
between navigations.

---

## 2. Rendering architecture (3 layers + native)

1. **Instant base layer** — static CSS (`public/base-dark.css`, `public/base-auto.css`)
   injected by the browser before first paint: `color-scheme: dark`, dark canvas and
   text, and a "nothing paints light" guard (every element forced dark) until the
   engine marks the page ready (`data-sombre-ready`). Guarantees no white frame even
   before any JS runs. Registered **dynamically** (`chrome.scripting.registerContentScripts`)
   rather than in the manifest, so the browser only injects it where dark mode applies:
   never-sites and known native-dark sites are excluded, and Auto mode uses a
   `prefers-color-scheme` media query — no async settings lookup before the first frame.
2. **Precise theme** — at DOMContentLoaded (max 1 s) once linked stylesheets are loaded
   (max 2 s) and cross-origin ones fetched (max 2.5 s), the engine swaps the guard for the
   generated theme in one frame; later stylesheets are mirrored as they appear.
3. **Per-domain cache** — generated CSS stored and replayed on next visit (see §5).

**Native dark mode first:** if the site ships its own dark theme
(`prefers-color-scheme` media rules, `.dark` / `data-theme` conventions), activate it
and do not run the engine. The popup states this and offers "Use Sombre's engine instead".
M1 detects it by reading the page's own colors with Sombre disabled (synchronously, no
frame painted): the canvas (root/body background, propagated) must be dark and ≥ 85 % of a
3×3 viewport grid must sit on dark backgrounds — a dark hero over white sections is not a
dark theme. Re-checked at `load` for sites that switch theme from script. Verdicts are
stored per site and excluded from the base layer registration.

---

## 3. Color engine & contrast

- **Color space:** OKLCH. Invert perceived lightness (L), keep hue, slightly reduce
  chroma so brand colors stay recognizable. No HSL inversion.
- **Contrast metric:** APCA (accounts for font size/weight, accurate on dark backgrounds).
- **Two-pass contrast guarantee:**
  1. *Rule-level (cheap):* when one rule sets both `color` and `background-color`,
     adjust the pair together to reach the threshold.
  2. *DOM-level (visible only):* `IntersectionObserver` on visible text nodes,
     resolve effective background through ancestors, fix nodes below threshold.
     Budgeted via `requestIdleCallback` + per-frame ms budget.
- **User setting:** contrast level, global only (no per-site override in v1):

  | Level | APCA target |
  |---|---|
  | Soft / Doux | Lc 60 |
  | Standard | Lc 75 |
  | High / Élevé | Lc 90 |

  Replaces Dark Reader's brightness/contrast/sepia/grayscale sliders.
- **Roles:** a color is transformed according to its use — background, text, border,
  shadow. Light backgrounds map into a narrow dark band (white → L 0.20), already-dark
  backgrounds stay dark; dark and mid-grey text maps into a compressed light band
  calibrated with APCA against the page background (#222 → Lc 81, #999 → Lc 56); light
  text on colored surfaces stays light.
- Implementation: in-house OKLCH + APCA (~200 LOC), no color library in the content script.
- CSS parsing: native parser (`new CSSStyleSheet().replaceSync(text)` → walk `cssRules`).

---

## 4. Toggle mechanism

- The engine **mirrors** every page rule that sets a color: same selector (hence same
  specificity), same at-rule structure (`@media`, `@supports`, `@layer`, nesting,
  imports), only color declarations kept and transformed, `!important` preserved.
  Custom properties get one twin per role (`--sombre-bg--x`, `--sombre-fg--x`…) and
  `var(--x)` in a color declaration becomes `var(--sombre-<role>--x, var(--x))`.
- The mirror lives in one `adoptedStyleSheets` entry kept **last**, so it wins every
  specificity tie against page sheets (invisible to the page's DOM, reusable in shadow roots).
  Not an `@layer` and not scoped selectors: layered declarations lose to all unlayered
  page CSS, and a scoping prefix would shift specificities and break selectors that target `:root`.
- Toggle = flip `data-sombre` on `<html>` (base layer) **and** the sheet's `disabled`
  flag in the same frame → single style recalc, no re-analysis.
- Wrapped in `document.startViewTransition()` for a GPU crossfade (~150–200 ms);
  skipped when `prefers-reduced-motion: reduce`.
- Keyboard shortcut via `chrome.commands` (default `Alt+Shift+D`, same as Dark Reader's:
  disable it while both are installed). The shortcut toggles **the current site**
  (create/remove a site exception), not the global default; the toolbar click opens the popup (§7).
- Injection goes through a small `StyleInjector` interface so a Firefox port only
  needs an alternative implementation.

---

## 5. Cache

- Storage: `chrome.storage.local` + `unlimitedStorage` permission.
  The async read gap is covered by the base layer (worst case: generic dark for a few ms, never white).
- Strategy: **stale-while-revalidate** — apply cached CSS immediately, re-run analysis
  in background, patch + rewrite cache if the result differs. Stale rules whose
  selectors no longer match are harmless.
- Key: `domain + engineVersion + contrastLevel` (extension update invalidates everything).
- Eviction: LRU, cap ~200 domains / ~20 MB.
- Optional later spike: per-domain `chrome.scripting.registerContentScripts({ css })`
  for native zero-latency injection. Validate scaling behavior before adopting.

---

## 6. Hard cases coverage

**v1 (required):**

| Case | Solution |
|---|---|
| Cross-origin stylesheets (CDN) | Fetch via service worker (`<all_urls>` host permission), parse ourselves |
| Inline styles & SVG attributes (`style=`, `fill=`, `stroke=`) | Batched `MutationObserver` on attributes |
| Dynamically added `<style>`/`<link>` (SPAs) | `MutationObserver` on head/document |
| CSS-in-JS via `insertRule` (styled-components, emotion) | MAIN-world script patching `CSSStyleSheet.prototype.insertRule` / `replace(Sync)` |
| Open Shadow DOM | Patch `attachShadow`, attach the shared adopted sheet |
| Same-origin iframes | `all_frames: true` |
| Legacy color attributes (`bgcolor`, `<font color>`, `<body text>`) | Per-value `:where([bgcolor="…" i])` rules (zero specificity, like the presentational hints they replace) |

**v1.x:** image handling (v1 leaves images untouched, optional mild dimming of large
bright images). Gradient colors are already transformed since M1.

**Out of scope:** `<canvas>` apps (Docs, Figma), closed shadow roots, built-in PDF viewer.

---

## 7. Activation model & UX

- **Global default:** `Auto (follow OS)` (install default) / `Dark` / `Light`.
- **Per site (tri-state):** `Follow default` · `Always dark` · `Never`.
- The popup always shows **why** a site is in its current state
  (e.g. "Dark — global default (Auto)", "Light — site exception", "✓ Native dark theme").
- No scheduled mode (the OS handles it; Auto inherits it).

### Popup (~360 px)

```
┌──────────────────────────────────┐
│  leboncoin.fr                    │
│  ● Dark — global default (Auto)  │
├──────────────────────────────────┤
│  [ Default ][ Dark ][ Never ]    │
│  Contrast                        │
│  [ Soft ][ Standard ][ High ]    │
│  ✎ Fix an element                │
│  ⚑ Report this site              │
├──────────────────────────────────┤
│  Default: Auto ▾       ⚙ Options │
└──────────────────────────────────┘
```

### Options page
Global default, contrast level, shortcut link (`chrome://extensions/shortcuts`),
site exceptions list, personal fixes (view / delete / export / import),
remote fix list toggle.

---

## 8. Site fixes

Sources, in priority order: **user local fixes** > **remote signed list** > **bundled list**.

- **Element picker** (popup → hover outline → click) with 3 actions:
  `ignore` (keep original), `invert` (e.g. black logo on transparent), `force-dark`.
  Saved locally per domain, applied immediately.
- Prefer robust selectors (`id`, `data-*`, `aria-*`) over positional paths (`nth-child`).
- Export personal fixes → feeds the bundled / remote lists.

### Remote list — trust model
- Hosted as JSON in the public GitHub repo (raw / Pages), contributions via PR.
- **Strict schema:** selector + action from a closed set
  (`ignore` | `invert` | `force-dark` | `set-color` with validated color value).
  **No free-form CSS remotely** (free CSS only for user-local fixes and the reviewed bundled list).
- Allowlist validator in the extension; reject anything resembling `url(`, `@import`,
  `image-set`, `src(` (CSS exfiltration / "CSS keylogger" vector).
- **Ed25519 signature**; public key embedded in the extension, private key kept
  offline (never in the repo). Verified with `crypto.subtle.verify`.
- Refresh every 24 h via `chrome.alarms`, fallback to last valid version.

---

## 9. Bug reporting & privacy

- "Report this site" opens a **pre-filled GitHub issue** in a new tab: domain only
  (no path/query), extension version, contrast level, site state, browser + version.
  User reviews everything before submitting.
- Store listing + privacy policy state: *"No browsing data leaves your browser. The only
  network request downloads the signed fix list."*
- Known limitation: requires a GitHub account (account-less form deferred).

---

## 10. Stack

| Layer | Choice |
|---|---|
| Manifest | MV3 |
| Language | TypeScript (strict) |
| Extension framework / build | WXT (Vite) |
| Content script | Vanilla TS, zero dependencies, target < 30 KB minified |
| Popup / options | Svelte 5 |
| Unit tests | Vitest (color math, APCA, rule rewriting) |
| E2E / benchmark | Playwright with extension loaded |

---

## 11. Benchmark (success criteria vs Dark Reader)

Automated Playwright bench running the same corpus with Sombre and with Dark Reader.

| Metric | Measurement | v1 target |
|---|---|---|
| White flash | CDP screencast frames during load, mean luminance threshold | 0 light frames on 2nd visit, ≤ 1 on 1st |
| Toggle speed | Command → next stable frame | < 50 ms on Gmail, Notion, YouTube |
| Contrast | APCA Lc of every visible text node vs rendered background | 0 nodes < Lc 45; median Lc > Dark Reader |
| Page cost | Added scripting time (trace), content script memory | Lower than Dark Reader on 100% of corpus |
| Remaining bright areas | % of viewport with luminance > 80%, excluding images | Lower than Dark Reader |

### Corpus

- **Native dark mode (tests layer D):** Gmail, YouTube, GitHub, GitLab, Reddit, Notion.
- **No native dark mode (tests the engine):** Leboncoin, Amazon, Hacker News, Le Monde,
  Doctolib, impots.gouv / ameli, Wikipedia (forced light), a Shopify store, a WordPress blog.
- **Static edge-case pages** reproducing every §6 case.
- Real sites archived as snapshots for reproducible comparisons.
- Logged-in sites (Gmail, Notion) use a **dedicated test account** and a persistent
  Playwright profile — never a personal account. Banking sites: local only, never archived.
- The bench outputs a side-by-side comparison report (reusable for the Store listing).
- The contrast criterion judges pages rendered by an engine. Native dark themes are
  measured but not judged: they are deliberately left untouched (§2), and some fail
  Lc 45 on their own muted text (GitHub ≈ Lc 44).
- Fixtures are served over HTTPS on public-looking hostnames mapped to local servers:
  extensions special-case `http:`, ports, IPs and local hostnames. See `bench/README.md`.

---

## 12. Roadmap

Each milestone exits on a benchmark criterion, not on "looks good".
No durations until M0 gives a real velocity baseline.

| # | Milestone | Content | Exit criterion |
|---|---|---|---|
| M0 | Foundations | WXT scaffold, strict TS, Vitest, Playwright bench, corpus, **Dark Reader baseline** | Bench runs and outputs Dark Reader report |
| M1 | Minimal usable engine | Base layer, OKLCH transform, same/cross-origin CSS parsing, `adoptedStyleSheets`, attribute toggle, shortcut, **raw popup** (site on/off) | **Daily driver replacing Dark Reader.** 0 white flash on static corpus pages |
| M2 | Dynamic web | MutationObservers, `insertRule` patch, Shadow DOM, inline/SVG, iframes | Gmail, Notion, YouTube correct; bright areas < Dark Reader |
| M3 | Contrast & native | APCA DOM pass, contrast levels, native dark detection | 0 text < Lc 45; all 6 native-dark sites detected |
| M4 | Speed & polish | SWR cache, View Transition, perf budget | Toggle < 50 ms; 0 light frames on 2nd visit |
| M5 | Full UX | Final Svelte popup, per-site states with reason, options page, i18n FR/EN | All §7 flows covered by E2E tests |
| M6 | Fixes | Element picker, bundled list, signed remote list, export, Report button | A broken site fixable in < 3 clicks |
| M7 | Release | Store listing FR/EN, privacy policy, comparison report, Edge Add-ons | Beats Dark Reader on all §11 metrics across the corpus |

---

## 13. Prior art & licensing

- Dark Reader (MIT) is read as a reference for known pitfalls. Any reused code keeps
  its MIT copyright header in the affected file.
- Dark Reader's `dynamic-theme-fixes` list is **not** imported: it contains free-form CSS
  (incompatible with §8 schema) and is tuned for a different algorithm.

## 14. Naming

- Name: **Sombre** (FR "dark", also an English word). No conflicting Chrome Web Store
  extension or GitHub extension repo found at design time (2026-10-26).
- Discoverability caveat: on the French Store, "sombre" collides with generic
  "mode sombre" results → rely on the listing subtitle (e.g. "Sombre — Dark mode for every website").
- Technical prefix: `data-sombre`, storage keys `sombre:*`.
