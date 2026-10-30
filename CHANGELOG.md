# Changelog

## [1.0.2](https://github.com/juliencastera/sombre/compare/v1.0.1...v1.0.2) (2026-10-30)


### Bug Fixes

* **engine:** answer frames through a private port ([b227580](https://github.com/juliencastera/sombre/commit/b227580cf173b6d7477e8f001ece423596dd5fc4))
* **engine:** darken Bootstrap's comma-separated channel variables ([e954bdc](https://github.com/juliencastera/sombre/commit/e954bdc1db16a99f76cfb73b4862f32bbfce5314))
* **engine:** give wide outlines the background role ([7e0578a](https://github.com/juliencastera/sombre/commit/7e0578a7ee1ae6473a4f4cb5b2b00ceedef8e960))
* **engine:** keep every color of logos that carry their own backdrop ([a9ff402](https://github.com/juliencastera/sombre/commit/a9ff4025e9bd9a16fd927b237d991e163a2d1d25))
* **engine:** keep logo colors drawn in an SVG's own stylesheet ([63f6999](https://github.com/juliencastera/sombre/commit/63f69998d898ac8c1bdb9070be628284736457fd))
* **engine:** keep transparent iframes see-through ([23a5501](https://github.com/juliencastera/sombre/commit/23a5501b95c67d14d2ec5457e2a5d4cd250d5558))
* **engine:** leave the canvas to &lt;body&gt; when the page paints it ([0cfe9b6](https://github.com/juliencastera/sombre/commit/0cfe9b6f321e6e4a1edce95d322aa3c8bd30057c))
* **engine:** lighten faint tinted overlays and keep colored glows vivid ([5bd74da](https://github.com/juliencastera/sombre/commit/5bd74da73a93b5404b0e4362043614aec77afecd))
* **engine:** show pictures blended into light cards ([8ee39c0](https://github.com/juliencastera/sombre/commit/8ee39c02d9e6940a5ccfbd480c287409ebdc0bf3))
* **engine:** treat inline SVG paints as artwork ([24e93a5](https://github.com/juliencastera/sombre/commit/24e93a58080a0050b3f3a4b5fd39307903a48373))

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
