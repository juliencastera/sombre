# Changelog

## [1.0.1](https://github.com/juliencastera/sombre/compare/v1.0.0...v1.0.1) (2026-10-27)


### Bug Fixes

* **manifest:** require Chrome 137 and link the project homepage ([245a146](https://github.com/juliencastera/sombre/commit/245a14643a6a944b1ec6e111f196c4faf13a5913))

## 1.0.0 (2026-10-28)

First release.

### Features

- **Dark mode without a white flash**: a base layer is injected before first paint, then every
  page stylesheet gets a dark mirror with role-based colors (backgrounds, text, borders,
  shadows) computed in OKLCH.
- **Dynamic pages**: cross-origin stylesheets (fetched by the background), `<style>` and
  `<link>` added later, CSS-in-JS (`insertRule`, constructed sheets), open shadow roots, inline
  styles, SVG and legacy color attributes, Tailwind and shadcn/ui color variables.
- **Guaranteed text contrast**: an APCA floor per contrast level (Soft, Standard, High), at rule
  level and on the rendered text.
- **Native dark themes**: sites with their own dark theme are detected or switched to it, and
  only their light leftovers are fixed.
- **Speed**: per-site cache of stylesheet mirrors, instant toggle with a View Transition.
- **Popup and options page** in English and French: global mode (auto, dark, light), per-site
  exceptions, contrast level, keyboard shortcut (Alt+Shift+D).
- **Site fixes**: an element picker (keep original, invert, force dark), a signed shared fix
  list refreshed daily, and a "Report this site" link.
- **Dark icons**: dark icons on transparent backgrounds are inverted, as in Dark Reader, and
  `mask-image` icons are drawn in a light ink.
