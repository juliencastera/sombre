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
   injected by the browser before first paint: `color-scheme: dark`, dark canvas (top
   page only: frames stay transparent, see §6; once ready, the engine colors the root only
   while the page leaves `<body>` unpainted, since a root background would make `<body>`
   paint its own box over negative z-index layers) and text, and a "nothing paints light" guard (every element forced dark) until the
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
(`prefers-color-scheme` media rules, `.dark` / `data-theme` conventions), activate it.
The popup states this and offers "Use Sombre's engine instead" (the site's Dark state).
- *Detection* reads the page's own colors with Sombre disabled (synchronously, no frame
  painted): the canvas (root/body background, propagated) must be dark and ≥ 85 % of a
  3×3 viewport grid must sit on dark backgrounds — a dark hero over white sections is not
  a dark theme.
- *Activation (M3):* when the page is not dark by itself, the most used theme switches
  found in its stylesheets (`html.dark`, `html[dark]`, `[data-theme="dark"]`,
  `[data-color-mode="dark"]`… on `html`/`body`) are tried in turn; the first that makes the
  page dark is kept and remembered per site, then re-applied at document start.
- *Preserve mode (M3, revised):* the engine still runs on native sites, with a transform
  that leaves already-dark backgrounds/borders/shadows and light text/icons exactly as
  designed — only light leftovers (consent walls, third-party widgets) are darkened, and
  the contrast passes still apply. A native theme with a white consent wall is otherwise a
  white flash.
- Re-checked at `load`: a light page that turned dark switches to preserve mode; a native
  page whose canvas is light again (the site reset our switch) switches back. Overlays do
  not count for the second check: only the canvas does.
- Verdicts are stored per site and excluded from the base layer registration.

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
     Runs in `requestIdleCallback`. A fixed element gets `data-sombre-fix="<hex>"`, styled
     by one `!important` rule per color — the only attribute Sombre writes on page
     elements. Fixes are removed, re-measured and re-applied in the same task, so no
     frame shows an unfixed color. Backgrounds behind images, gradients, filters or
     blend modes are not judged.
  Floors, after APCA's font lookup in simplified form: the level's target holds for 16px
  regular text; large text (≥ 24px, or ≥ 18.66px bold) 15 less; small text (under 16px, or
  under 14px semi-bold) 5 more; tiny text (under 13px) 10 more; a thin weight (< 400) counts
  as one step smaller; never above Lc 100. Revised after Gmail (14px rows) read poorly in
  Soft: the bumps stay small so titles keep standing above grey secondary text.
- **User setting:** contrast level, global only (no per-site override in v1):

  | Level | APCA target |
  |---|---|
  | Soft / Doux | Lc 60 |
  | Standard | Lc 75 |
  | High / Élevé | Lc 90 |

  Replaces Dark Reader's brightness/contrast/sepia/grayscale sliders.
- **Roles:** a color is transformed according to its use — background, text, border,
  shadow. Light backgrounds map into a narrow dark band (white → L 0.20), steeper near
  white so close surfaces (read/unread rows, hover, zebra stripes) stay apart (#f2f6fc
  lands 0.025 above white instead of 0.012); already-dark backgrounds stay dark; dark and
  mid-grey text maps into a compressed light band calibrated with APCA against the page
  background (Standard: #1f1f1f → Lc 89, #5f6368 → Lc 78; Soft: 81 and 68); light text on
  colored surfaces stays light.
- **Accents, tints, overlays** (revised after Fragrantica and GitHub):
  - Vivid fills and borders (OKLCH chroma ≥ 0.06, lightness ≤ 0.88: badges, bars, colored
    buttons) keep their hue and 90 % of their chroma, lightness capped at 0.6 so white text
    on them stays around Lc 70–76. Darkening them like surfaces made near-black browns.
  - Pastel tints (lighter than 0.88) are darkened like surfaces, with up to twice their
    chroma (max 0.05) so a mint or blue-grey panel stays visibly tinted.
  - Faint neutral overlays (opacity ≤ 0.16: hover tints, glassy buttons, hairlines) become
    white at the same opacity; on a site's own dark theme they are left alone.
  - A contrast fix never lowers contrast: when neither white nor black text reaches the
    floor (white on a mid-tone button), the better extreme is used, or the text is left.
  - `fill="currentColor"` and other `currentColor` values are never resolved to a fixed
    color (a canvas resolves them to black): icons keep following their element's color.
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
  skipped when `prefers-reduced-motion: reduce`, and on pages over 1500 elements: the
  snapshot costs about a frame per few thousand elements (heavy fixture: 85 ms with the
  transition, 27 ms without), so large pages switch instantly rather than late.
- Keyboard shortcut via `chrome.commands` (default `Alt+Shift+D`, same as Dark Reader's:
  disable it while both are installed). The shortcut toggles **the current site**
  (create/remove a site exception), not the global default; the toolbar click opens the popup (§7).
- Injection goes through a small `StyleInjector` interface so a Firefox port only
  needs an alternative implementation.

---

## 5. Cache

- Storage: `chrome.storage.local` + `unlimitedStorage` permission.
  The async read gap is covered by the base layer (worst case: generic dark for a few ms, never white).
- **Granularity (revised in M4): mirrors of fetched stylesheets, by stylesheet URL**, per
  site. A whole-page cache was tried first and dropped: it lifted the base layer's guard
  with a theme generated for another page (Amazon serves an interstitial that reloads
  into the real page) and left the real page's cards white for ~1 s; and snapshots of the
  same page differed between visits (lazily loaded stylesheets). A per-URL mirror can
  only ever apply to the stylesheet it was generated from.
- Strategy: **stale-while-revalidate** — a cached mirror is served as soon as its `<link>`
  appears (no network wait, also for late stylesheets), and the stylesheet is refetched
  in background; the mirror is replaced if it changed.
- Key: `site + extensionVersion + contrastLevel + nativeMode`; pages of a site merge into
  one entry (2 MB per site, least recently seen stylesheets dropped).
- Eviction: LRU in the background, cap 200 sites / 20 MB.
- Optional later spike: per-domain `chrome.scripting.registerContentScripts({ css })`
  for native zero-latency injection. Validate scaling behavior before adopting.

---

## 6. Hard cases coverage

**v1 (required):**

| Case | Solution |
|---|---|
| Cross-origin stylesheets (CDN) | Fetch via service worker (`<all_urls>` host permission), parse ourselves |
| Inline styles & SVG attributes (`style=`, `fill=`, `stroke=`) | Batched `MutationObserver` on attributes; rules select the exact declaration text (`[style*=";color: #333"]`) with `!important`, appended incrementally — the page DOM is not modified, except for the `data-sombre-art` marker below. SVG artwork attributes use an `invert` role (light fills → dark, dark → light); inline paints (`style="fill:…"`) use the `art` role below |
| Dynamically added `<style>`/`<link>` (SPAs) | `MutationObserver` on head/document |
| CSS-in-JS via `insertRule` (styled-components, emotion) | MAIN-world script patching `CSSStyleSheet.prototype.insertRule` / `replace(Sync)` |
| Open Shadow DOM | Patch `attachShadow`; each shadow root is a scope adopting its own mirrors (sources shared between roots share one mirror), plus a pre-ready guard sheet since the base layer cannot pierce shadow boundaries |
| Utility CSS (Tailwind v3 `rgb(… / var(--tw-bg-opacity))`, shadcn/ui `hsl(var(--background))`, Bootstrap 5 `rgba(var(--bs-white-rgb), var(--bs-bg-opacity))` with `--bs-white-rgb: 255,255,255`) | Channels transformed, alpha expressions kept; channel variables get per-role twins in the same separator (spaces or commas) and channel format |
| Iframes | `all_frames: true`. A frame keeps a transparent canvas (`data-sombre-frame` on its root, no base background), so overlays drawn over a video or a page stay see-through. The browser paints a frame opaque when its root's `color-scheme` differs from its `<iframe>` element's, so each frame asks its parent's content script (`postMessage` carrying a private `MessagePort`, which pages relaying messages between frames, like Twitch's extension supervisor, do not forward) for that element's scheme and takes it on its root, keeping `dark` on `<body>` for form controls; the parent tells the frames that asked again after a toggle |
| Legacy color attributes (`bgcolor`, `<font color>`, `<body text>`) | Per-value `:where([bgcolor="…" i])` rules (zero specificity, like the presentational hints they replace) |
| Dark icons on transparent backgrounds (CSS `background-image: url()`) | As in Dark Reader: each image is fetched (by the background when cross-origin) and sampled on a 32×32 canvas; ≥ 70 % dark opaque pixels, ≥ 10 % transparent pixels and < 480 000 natural pixels → an inverted copy (SVG stays vector, with a root `filter`; rasters are redrawn through `ctx.filter`). Mirrors write `var(--sombre-icon-<hash>, url(original))` and the property is only defined on `:root` once the verdict is "invert", so a result never regenerates a mirror; verdicts go into the per-site cache. JPEGs and images over 512 KB are skipped |
| Pictures blended into a light surface (`mix-blend-mode: multiply / darken / color-burn` on rules whose subject is `img`, `picture`, `video`, `canvas` or `svg`) | Mirrored as `normal`: the blend kept the darker of the photo and its now-dark card, which hides the photo. It shows on its own white background instead. Blends on other elements (tints over pictures) are the design and stay |
| SVG artwork styled by its own `<style>` (logos exported as `.st1{fill:#0087CD}`) | Paints (`fill`, `stroke`, `stop-color`, `flood-color`) of sheets owned by an `SVGStyleElement` use an `art` role: vivid colors from mid lightness up stay as drawn, greys, black and dark colors move into the text band like ink. A sheet that paints white next to a vivid color carries its own backdrop (white shapes would not show on the white page otherwise): its dark details sit on that backdrop, so all its colors stay as drawn. For inline styles and `fill=` attributes, each `<svg>` is classified once, in paint order: when its first opaque shape is vivid and white is painted later (a logo on its own badge), it gets `data-sombre-art` and the inline and attribute rules skip its inside (`:not([data-sombre-art] *)`). A chart whose first shape is a white plot background is still darkened |
| Icons drawn with `mask-image` | The rule's `background-color` is the icon's ink: transformed as text, not as a surface |

**v1.x:** `<img>` elements stay untouched, as in Dark Reader (a dark logo in an `<img>` takes
an `invert` site fix); optional mild dimming of large bright images. Gradient colors are
already transformed since M1.

**Out of scope:** `<canvas>` apps (Docs, Figma), closed shadow roots, built-in PDF viewer.

**Known gaps:** `adoptedStyleSheets.push()` (observable array mutation, no setter to hook)
is only picked up on the next rebuild; channel variables in RGB form are recognized only
as three bare numbers; Gmail and Notion are untested until a test account is set up.

Each page stylesheet has its **own mirror sheet** (spec §4): a CSS-in-JS `insertRule`
regenerates only that mirror, in the microtask after the mutating task, so new rules are
mirrored before the next paint.

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

As built in M5 (320 px): when the site's own dark theme is in use, the status reads
"Dark — the site's own dark theme" with a "Use Sombre's engine instead" link (sets the
site to Dark). The keyboard shortcut is shown under the footer. Fix and Report arrive in M6.
The popup accepts `?tab=<id>` so E2E tests can point it at a page (opened as a tab, it
would otherwise inspect itself).
Two weeks after install (or after the first update that has it), the popup asks once for a
store review; "Leave a review" and "No thanks" both end it. No reward, per store policy.

### Options page
Implemented in M5 with: global default, contrast level, shortcut (shown, with a link to
`chrome://extensions/shortcuts`), site exceptions (change or remove), sites with their own
dark theme (forget to re-detect), cache size and clear, privacy statement. Spec'd:
Global default, contrast level, shortcut link (`chrome://extensions/shortcuts`),
site exceptions list, personal fixes (view / delete / export / import),
remote fix list toggle.

### Welcome page
Opened once, on first install (not for unpacked builds, so tests and development stay quiet):
pin the button, one click per site (with the shortcut), "Fix an element". Users who cannot
find the button or a way to fix a site uninstall.

---

## 8. Site fixes

Sources, in priority order: **user local fixes** > **remote signed list** > **bundled list**.

As built in M6:
- No free CSS anywhere, local fixes included: every fix is a selector plus one of
  `ignore`, `invert`, `force-dark`, `set-color` (hex value, color properties only).
  The picker covers the cases free CSS was meant for, and one validator serves all sources.
- `ignore` ("Keep original") wraps every document mirror in `@scope (:root) to (<selectors>)`:
  the lower boundary excludes the elements and their content. The explicit `(:root)` matters:
  without a scope start, Chrome finds no scoping root for adopted sheets and the rules
  match nothing. Shadow-tree mirrors are left unwrapped.
- Elements with a fix are skipped by the DOM contrast pass: an explicit choice wins.
- Bundled and remote lists share one format (`fixes/fixes.json`, signed into
  `fixes/fixes.signed.json` and `public/fixes.signed.json` by `npm run fixes:sign`); the
  background keeps the newest valid version. The remote URL and the repository for
  "Report this site" are build-time settings (`WXT_FIXES_URL`, `WXT_REPO_URL`), defaulting to
  github.com/juliencastera/sombre; set empty, the remote refresh and the report link are off.
- The private signing key lives outside the repository (default `~/.sombre/fixes-ed25519.pem`,
  created once by `npm run fixes:keygen`).

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
- Store listing + privacy policy ([PRIVACY.md](../PRIVACY.md)) state: *"No browsing data leaves
  your browser."* Network requests are the daily signed fix list and the stylesheets and images a
  page references, fetched again from the same addresses to compute their dark version (other
  domains without cookies).
- Known limitation: requires a GitHub account (account-less form deferred).

---

## 10. Stack

| Layer | Choice |
|---|---|
| Manifest | MV3 |
| Language | TypeScript (strict) |
| Extension framework / build | WXT (Vite) |
| Content script | Vanilla TS, zero dependencies, built as a WXT unlisted script declared in the manifest (no WXT content script runtime). Budget < 40 KB minified, enforced by an E2E test (38.8 KB with frame schemes, the canvas check, blended pictures and SVG artwork; revised from 30 KB, then 34 KB, 37 KB and 38 KB, as contrast passes, native themes, cache, fixes, image analysis, frame schemes and site-compatibility fixes landed). Chrome code-caches extension scripts, so the remaining cost is negligible. The element picker is a separate script injected on demand |
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
| M7 | Release | Store listing FR/EN, privacy policy, comparison report, Edge Add-ons (package, texts and images in `store/`) | Beats Dark Reader on all §11 metrics across the corpus |

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
