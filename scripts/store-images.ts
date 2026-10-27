/**
 * Chrome Web Store images (store/images/): real captures of the built extension on
 * a demo page (store/demo/article.<lang>.html), composed into captioned 1280×800
 * screenshots, the 440×280 and 1400×560 promo tiles, and the padded store icon.
 *
 *   npm run build && node scripts/store-images.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { launchContext } from '../bench/browser.ts';
import { PATHS } from '../bench/config.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'store', 'images');
const DEMO_URL = 'https://fieldnotes.example/';
const ICON = readFileSync(path.join(ROOT, 'public', 'icon', '128.png')).toString('base64');

type Lang = 'en' | 'fr';

type Caption = 'hero' | 'contrast' | 'popup' | 'picker' | 'options' | 'before' | 'after' | 'tagline';

const CAPTIONS: Record<Lang, Record<Caption, [string, string]>> = {
  en: {
    hero: ['Dark mode for every website', 'No white flash. Colors keep their meaning.'],
    contrast: ['Readable text, guaranteed', 'Light grey captions are lifted to a readable contrast, at the level you choose.'],
    popup: ['One click per site', 'Auto, always dark or never on this site, and three contrast levels.'],
    picker: ['Fix any element', 'Keep it original, invert it or force it dark. Remembered for the site.'],
    options: ['Your settings, your exceptions', 'Default mode, contrast, per-site exceptions and fixes. In English and French.'],
    before: ['Without Sombre', ''],
    after: ['With Sombre', ''],
    tagline: ['Dark mode for every website', 'No white flash · Readable text · Instant toggle'],
  },
  fr: {
    hero: ['Le mode sombre sur tous les sites', 'Sans flash blanc. Les couleurs gardent leur sens.'],
    contrast: ['Un texte lisible, garanti', 'Les légendes gris clair sont rendues lisibles, au niveau de contraste choisi.'],
    popup: ['Un clic par site', 'Auto, toujours sombre ou jamais sur ce site, et trois niveaux de contraste.'],
    picker: ['Corrigez n’importe quel élément', 'Gardez l’original, inversez-le ou forcez-le en sombre. Mémorisé pour le site.'],
    options: [
      'Vos réglages, vos exceptions',
      'Mode par défaut, contraste, exceptions et corrections par site. En français et en anglais.',
    ],
    before: ['Sans Sombre', ''],
    after: ['Avec Sombre', ''],
    tagline: ['Le mode sombre sur tous les sites', 'Sans flash blanc · Texte lisible · Bascule instantanée'],
  },
};

const message = (lang: Lang, key: string): string =>
  JSON.parse(readFileSync(path.join(ROOT, 'public', '_locales', lang, 'messages.json'), 'utf8'))[key].message;

const png = (buffer: Buffer) => `data:image/png;base64,${buffer.toString('base64')}`;

async function serveDemo(context: BrowserContext, lang: Lang): Promise<void> {
  const body = readFileSync(path.join(ROOT, 'store', 'demo', `article.${lang}.html`), 'utf8');
  await context.route(`${DEMO_URL}**`, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body }));
}

async function openDemo(context: BrowserContext, themed: boolean): Promise<Page> {
  const page = await context.newPage();
  await page.goto(DEMO_URL);
  if (themed) await page.waitForSelector('html[data-sombre-ready]');
  // Icon analyses and the contrast pass settle after the first frame.
  await page.waitForTimeout(800);
  return page;
}

interface Captures {
  light: Buffer;
  dark: Buffer;
  popup: Buffer;
  picker: Buffer;
  options: Buffer;
  /** The end of the article and its small grey caption: the area the contrast screenshot zooms into. */
  crop: { x: number; y: number; width: number; height: number };
}

async function capture(lang: Lang): Promise<Captures> {
  const plain = await launchContext({ headed: false, scheme: 'light', lang });
  await serveDemo(plain, lang);
  const lightPage = await openDemo(plain, false);
  const light = await lightPage.screenshot();
  const article = (await lightPage.locator('article').boundingBox())!;
  const caption = (await lightPage.locator('article .muted').boundingBox())!;
  await plain.close();

  const context = await launchContext({ extensionPath: PATHS.sombre, headed: false, scheme: 'dark', lang });
  await serveDemo(context, lang);
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  const page = await openDemo(context, true);
  const dark = await page.screenshot();

  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://fieldnotes.example/*' }))[0]?.id);
  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html?tab=${tabId}`);
  await popupPage.waitForTimeout(300);
  const popup = await popupPage.locator('main').screenshot();

  await popupPage.getByRole('button', { name: message(lang, 'fixElement') }).click();
  await page.bringToFront();
  await page.locator('sombre-picker').waitFor({ state: 'attached' });
  const target = (await page.locator('.note').boundingBox())!;
  await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
  await page.waitForTimeout(300);
  const picker = await page.screenshot();
  await popupPage.close();

  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
  await optionsPage.waitForTimeout(300);
  const options = await optionsPage.screenshot();
  await context.close();

  return {
    light,
    dark,
    popup,
    picker,
    options,
    crop: { x: article.x - 16, y: caption.y - 78, width: article.width + 32, height: 120 },
  };
}

const STYLE = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif; color: #ececef;
    background: radial-gradient(1200px 600px at 85% -10%, #26324d 0%, rgba(38,50,77,0) 60%), #141518; overflow: hidden; }
  .frame { position: relative; width: 1280px; height: 800px; padding: 44px 64px 0; }
  .brand { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 600; color: #a4a6ae; }
  .brand img { width: 26px; height: 26px; }
  h1 { margin: 18px 0 6px; font-size: 40px; line-height: 1.15; font-weight: 700; letter-spacing: -0.01em; }
  .sub { margin: 0; font-size: 19px; color: #a4a6ae; }
  .window { position: absolute; left: 176px; top: 214px; width: 928px; height: 580px; border-radius: 14px; overflow: hidden;
    border: 1px solid #2c2e34; box-shadow: 0 30px 80px rgba(0,0,0,.55); background: #1b1c20; }
  .window img { display: block; width: 928px; height: 580px; }
  .label { position: absolute; top: 176px; padding: 4px 12px; border-radius: 999px; font-size: 14px; font-weight: 600;
    background: rgba(20,21,24,.82); color: #ececef; border: 1px solid #33353c; }
`;

const brand = `<div class="brand"><img src="data:image/png;base64,${ICON}">Sombre</div>`;
const titled = (title: string, sub: string, body: string) =>
  `<div class="frame">${brand}<h1>${title}</h1><p class="sub">${sub}</p>${body}</div>`;

function screenshots(lang: Lang, c: Captures): Record<string, string> {
  const t = CAPTIONS[lang];
  const split = `
    <div class="window">
      <img src="${png(c.light)}">
      <img src="${png(c.dark)}" style="position:absolute;inset:0;clip-path:inset(0 0 0 50%)">
      <div style="position:absolute;top:0;bottom:0;left:50%;width:2px;background:#8fb3ff"></div>
    </div>
    <span class="label" style="left:176px">${t.before[0]}</span>
    <span class="label" style="right:176px">${t.after[0]}</span>`;
  // Same article area on both sides, magnified: what the contrast pass changes.
  const { x, y, width, height } = c.crop;
  const scale = 928 / width;
  const zoomHeight = Math.round(height * scale);
  const zoom = (image: Buffer, label: string, top: number) => {
    return `<span class="label" style="left:176px;top:${top - 40}px">${label}</span>
      <div class="window" style="top:${top}px;height:${zoomHeight}px">
      <div style="width:928px;height:100%;background:url(${png(image)}) no-repeat;
        background-size:${1280 * scale}px ${800 * scale}px;background-position:${-x * scale}px ${-y * scale}px"></div></div>`;
  };
  return {
    'screenshot-1': titled(...t.hero, split),
    'screenshot-2': titled(...t.contrast, zoom(c.light, t.before[0], 256) + zoom(c.dark, t.after[0], 256 + zoomHeight + 84)),
    'screenshot-3': titled(
      ...t.popup,
      `<div class="window"><img src="${png(c.dark)}"></div>
       <img src="${png(c.popup)}" style="position:absolute;right:120px;top:190px;width:320px;border-radius:12px;
         border:1px solid #33353c;box-shadow:0 24px 70px rgba(0,0,0,.7)">`,
    ),
    'screenshot-4': titled(...t.picker, `<div class="window"><img src="${png(c.picker)}"></div>`),
    'screenshot-5': titled(...t.options, `<div class="window"><img src="${png(c.options)}"></div>`),
  };
}

function promos(lang: Lang, c: Captures): Record<string, [string, number, number]> {
  const [title, sub] = CAPTIONS[lang].tagline;
  return {
    'promo-small': [
      `<div style="width:440px;height:280px;padding:40px 36px;display:flex;flex-direction:column;justify-content:center;gap:14px">
         <div style="display:flex;align-items:center;gap:14px"><img src="data:image/png;base64,${ICON}" style="width:64px">
           <span style="font-size:40px;font-weight:700">Sombre</span></div>
         <div style="font-size:19px;line-height:1.3;color:#ececef">${title}</div></div>`,
      440,
      280,
    ],
    'promo-marquee': [
      `<div style="width:1400px;height:560px;padding:0 90px;display:flex;align-items:center;gap:66px">
         <div style="width:470px"><div style="display:flex;align-items:center;gap:16px">
           <img src="data:image/png;base64,${ICON}" style="width:72px"><span style="font-size:46px;font-weight:700">Sombre</span></div>
           <div style="margin-top:22px;font-size:30px;line-height:1.25;font-weight:600">${title}</div>
           <div style="margin-top:12px;font-size:18px;color:#a4a6ae">${sub}</div></div>
         <div style="position:relative;width:704px;height:440px;border-radius:14px;overflow:hidden;border:1px solid #2c2e34;
           box-shadow:0 30px 80px rgba(0,0,0,.55)">
           <img src="${png(c.light)}" style="width:100%;height:100%;display:block">
           <img src="${png(c.dark)}" style="position:absolute;inset:0;width:100%;height:100%;clip-path:inset(0 0 0 50%)">
           <div style="position:absolute;top:0;bottom:0;left:50%;width:2px;background:#8fb3ff"></div></div></div>`,
      1400,
      560,
    ],
  };
}

const browser = await chromium.launch();
const composer = await browser.newPage();
async function render(html: string, width: number, height: number, file: string): Promise<void> {
  await composer.setViewportSize({ width, height });
  await composer.setContent(`<!doctype html><meta charset="utf-8"><style>${STYLE}</style><body>${html}</body>`);
  await composer.waitForLoadState('load');
  // JPEG: the store wants screenshots without alpha.
  await composer.screenshot({ path: file, type: 'jpeg', quality: 92 });
}

for (const lang of ['en', 'fr'] as const) {
  const dir = path.join(OUT, lang);
  mkdirSync(dir, { recursive: true });
  const c = await capture(lang);
  for (const [name, html] of Object.entries(screenshots(lang, c))) await render(html, 1280, 800, path.join(dir, `${name}.jpg`));
  for (const [name, [html, width, height]] of Object.entries(promos(lang, c))) {
    await render(html, width, height, path.join(dir, `${name}.jpg`));
  }
}

// Store icon: the toolbar icon fills its square; the store wants 96×96 artwork with 16 px of padding.
await composer.setViewportSize({ width: 128, height: 128 });
await composer.setContent(
  `<body style="margin:0;background:transparent"><img src="data:image/png;base64,${ICON}" style="margin:16px;width:96px;height:96px">`,
);
writeFileSync(path.join(OUT, 'icon-128.png'), await composer.screenshot({ omitBackground: true }));
await browser.close();
console.log(`Store images written to ${path.relative(ROOT, OUT)}`);
