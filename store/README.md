# Chrome Web Store submission

Everything the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) asks for,
field by field. The same package works on [Edge Add-ons](https://partner.microsoft.com/dashboard/microsoftedge/overview)
(see the end).

## Before the first submission

1. Register a developer account (one-time fee) and verify the contact email.
2. Get the package: download `sombre-<version>-chrome.zip` from the
   [GitHub release](https://github.com/juliencastera/sombre/releases), or run `make zip`
   (`.output/sombre-<version>-chrome.zip`).
3. Dashboard → *New item* → upload the zip.

## Store listing tab

| Field | Value |
|---|---|
| Description | [listing.en.md](listing.en.md) (default language), [listing.fr.md](listing.fr.md) for the French localization |
| Category | Make Chrome Yours → Accessibility |
| Language | English, then *Add localization* → French |
| Store icon | [images/icon-128.png](images/icon-128.png) |
| Screenshots (1280×800) | `images/<lang>/screenshot-1.jpg` … `screenshot-5.jpg`, in that order |
| Small promo tile (440×280) | `images/<lang>/promo-small.jpg` |
| Marquee promo tile (1400×560) | `images/<lang>/promo-marquee.jpg` |
| Official URL | https://github.com/juliencastera/sombre (needs the site verified in Search Console; otherwise leave empty) |
| Homepage URL | https://github.com/juliencastera/sombre |
| Support URL | https://github.com/juliencastera/sombre/issues |

The name and summary come from the manifest (`public/_locales/<lang>/messages.json`).

## Privacy practices tab

**Single purpose**

> Sombre displays websites in a dark theme: it recomputes each page's colors into a readable
> dark version, with per-site controls and fixes.

**Permission justifications**

| Permission | Justification |
|---|---|
| `storage` | Saves the user's settings (default mode, contrast level, per-site exceptions), their element fixes and the shared fix list on the device. |
| `unlimitedStorage` | A per-site cache of the generated dark stylesheets lets pages render dark immediately on the next visit; it is capped at 20 MB by the extension, above the default 10 MB quota. |
| `scripting` | Registers the dark base stylesheet as a content script at document start, only on the sites where dark mode applies, so pages never flash white before the theme is ready. Also injects the element picker (packaged `picker.js`) into the current tab when the user clicks "Fix an element". |
| `alarms` | Refreshes the signed shared fix list once a day. |
| Host permission `<all_urls>` | The extension's single purpose is to theme any website the user visits, so its content script and base stylesheet must run on all sites. The background also downloads the stylesheets and images a page references from other domains (which the page itself cannot read) to compute their dark version. |

**Remote code**: *No, I am not using remote code.* The only downloaded file is the shared fix
list, a JSON document of CSS selectors and a closed set of actions, verified against an Ed25519
signature embedded in the extension and validated against a strict schema (no free-form CSS, no
URLs). All JavaScript ships in the package.

**Data usage**: tick none of the data types. Then certify the three statements (no sale to third
parties, no use unrelated to the single purpose, no use for creditworthiness or lending).

**Privacy policy URL**: https://github.com/juliencastera/sombre/blob/main/PRIVACY.md

## Distribution tab

Free, public, all regions.

## After submitting

Review usually takes a few days; broad host permissions can make it longer. Once the item is
published, note its ID (in the dashboard URL): it is needed to automate later uploads from the
release workflow through the Chrome Web Store API.

## Edge Add-ons

The same zip is accepted as is. Partner Center → *Create new extension* → upload the zip; reuse
the same descriptions, images, privacy policy URL and justifications.

## Regenerating the images

`npm run build && node scripts/store-images.ts` (or `make store-images`) captures the built
extension on [demo/article.en.html](demo/article.en.html) and its French version, and rewrites
`images/`. Fonts come from the operating system: generate them on the same machine for a
consistent set.
