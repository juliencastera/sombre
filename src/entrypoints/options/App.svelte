<script lang="ts">
  import { onMount } from 'svelte';
  import { CACHE_INDEX_KEY, CACHE_PREFIX, type CacheIndex } from '../../shared/cache.ts';
  import { t } from '../../shared/i18n.ts';
  import {
    DEFAULT_SETTINGS,
    NATIVE_KEY,
    normalizeNative,
    normalizeSettings,
    SETTINGS_KEY,
    type ContrastLevel,
    type Mode,
    type NativeVerdict,
    type Settings,
    type SiteState,
  } from '../../shared/settings.ts';
  import Segmented from '../../ui/Segmented.svelte';

  let settings = $state<Settings>(DEFAULT_SETTINGS);
  let native = $state<Record<string, NativeVerdict>>({});
  let cacheIndex = $state<CacheIndex>({});
  let shortcut = $state('');

  const sites = $derived(Object.keys(settings.sites).sort());
  const nativeSites = $derived(Object.keys(native).sort());
  const cacheBytes = $derived(Object.values(cacheIndex).reduce((sum, entry) => sum + entry.size, 0));
  const version = browser.runtime.getManifest().version;

  async function load() {
    const stored = await browser.storage.local.get([SETTINGS_KEY, NATIVE_KEY, CACHE_INDEX_KEY]);
    settings = normalizeSettings(stored[SETTINGS_KEY]);
    native = normalizeNative(stored[NATIVE_KEY]);
    cacheIndex = (stored[CACHE_INDEX_KEY] ?? {}) as CacheIndex;
    const command = (await browser.commands.getAll()).find((c) => c.name === 'toggle-site');
    shortcut = command?.shortcut ?? '';
  }

  onMount(() => {
    void load();
    const onChanged = () => void load();
    browser.storage.onChanged.addListener(onChanged);
    // The shortcut can change in chrome://extensions/shortcuts while this tab stays open.
    addEventListener('focus', onChanged);
    return () => {
      browser.storage.onChanged.removeListener(onChanged);
      removeEventListener('focus', onChanged);
    };
  });

  async function save(next: Settings) {
    settings = next;
    await browser.storage.local.set({ [SETTINGS_KEY]: $state.snapshot(next) });
  }

  function setSite(key: string, state: SiteState | null) {
    const next = { ...settings.sites };
    if (state) next[key] = state;
    else delete next[key];
    void save({ ...settings, sites: next });
  }

  async function forgetNative(key: string) {
    const next = { ...native };
    delete next[key];
    native = next;
    await browser.storage.local.set({ [NATIVE_KEY]: next });
  }

  async function clearCache() {
    const keys = Object.keys(await browser.storage.local.get(null)).filter((key) => key.startsWith(CACHE_PREFIX));
    await browser.storage.local.remove([...keys, CACHE_INDEX_KEY]);
    cacheIndex = {};
  }

  function formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return `${value.toLocaleString(undefined, { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`;
  }
</script>

<main>
  <h1>{t('optionsTitle')}</h1>

  <section aria-labelledby="general">
    <h2 id="general">{t('sectionGeneral')}</h2>
    <div class="row">
      <div>
        <h3>{t('defaultModeLabel')}</h3>
        <p class="help">{t('defaultModeHelp')}</p>
      </div>
      <Segmented
        label={t('defaultModeLabel')}
        value={settings.mode}
        options={[
          { value: 'auto', label: t('modeAuto') },
          { value: 'dark', label: t('modeDark') },
          { value: 'light', label: t('modeLight') },
        ] satisfies { value: Mode; label: string }[]}
        onchange={(mode) => void save({ ...settings, mode })}
      />
    </div>
    <div class="row">
      <div>
        <h3>{t('contrast')}</h3>
        <p class="help">{t('contrastHelp')}</p>
      </div>
      <Segmented
        label={t('contrast')}
        value={settings.contrast}
        options={[
          { value: 'soft', label: t('contrastSoft') },
          { value: 'standard', label: t('contrastStandard') },
          { value: 'high', label: t('contrastHigh') },
        ] satisfies { value: ContrastLevel; label: string }[]}
        onchange={(contrast) => void save({ ...settings, contrast })}
      />
    </div>
    <div class="row">
      <div>
        <h3>{t('shortcutLabel')}</h3>
        <p class="help">{t('shortcutHelp')}</p>
      </div>
      <div class="inline">
        <kbd data-testid="shortcut">{shortcut || t('shortcutNone')}</kbd>
        <button type="button" class="link-button" onclick={() => browser.tabs.create({ url: 'chrome://extensions/shortcuts' })}
          >{t('shortcutChange')}</button
        >
      </div>
    </div>
  </section>

  <section aria-labelledby="sites">
    <h2 id="sites">{t('sectionSites')}</h2>
    {#if sites.length}
      <ul class="list" data-testid="site-exceptions">
        {#each sites as key (key)}
          <li>
            <span class="site">{key}</span>
            <select
              aria-label={key}
              value={settings.sites[key]}
              onchange={(event) => setSite(key, event.currentTarget.value as SiteState)}
            >
              <option value="dark">{t('stateDark')}</option>
              <option value="never">{t('stateNever')}</option>
            </select>
            <button type="button" class="link-button" onclick={() => setSite(key, null)}>{t('remove')}</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">{t('sitesEmpty')}</p>
    {/if}
  </section>

  <section aria-labelledby="native">
    <h2 id="native">{t('sectionNative')}</h2>
    <p class="help">{t('nativeHelp')}</p>
    {#if nativeSites.length}
      <ul class="list" data-testid="native-sites">
        {#each nativeSites as key (key)}
          <li>
            <span class="site">
              {key}
              {#if native[key]?.marker}<span class="tag">{t('nativeSwitched')}</span>{/if}
            </span>
            <button type="button" class="link-button" onclick={() => forgetNative(key)}>{t('forget')}</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">{t('nativeEmpty')}</p>
    {/if}
  </section>

  <section aria-labelledby="cache">
    <h2 id="cache">{t('sectionCache')}</h2>
    <div class="row">
      <p class="help">
        {t('cacheHelp')}<br />
        <span data-testid="cache-size">{t('cacheSize', formatBytes(cacheBytes), String(Object.keys(cacheIndex).length))}</span>
      </p>
      <button type="button" class="link-button" onclick={clearCache}>{t('clearCache')}</button>
    </div>
  </section>

  <section aria-labelledby="about">
    <h2 id="about">{t('sectionAbout')}</h2>
    <p class="help">{t('privacy')}</p>
    <p class="help">{t('version', version)}</p>
  </section>
</main>

<style>
  main {
    max-width: 680px;
    margin: 0 auto;
    padding: 40px 24px 64px;
  }

  h1 {
    margin: 0 0 32px;
    font-size: 22px;
    font-weight: 600;
  }

  section {
    padding: 20px 0;
    border-top: 1px solid var(--border);
  }

  h2 {
    margin: 0 0 12px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--text-3);
  }

  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
  }

  p {
    margin: 0;
  }

  .help {
    margin-top: 2px;
    color: var(--text-2);
    font-size: 13px;
    max-width: 52ch;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr minmax(200px, 260px);
    gap: 24px;
    align-items: center;
    padding: 10px 0;
  }

  .row > .link-button {
    justify-self: end;
  }

  .inline {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: flex-end;
  }

  kbd {
    padding: 3px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-2);
    font: 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace;
  }

  .list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .list li {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
  }

  .site {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .tag {
    margin-left: 8px;
    color: var(--text-3);
    font-size: 12px;
  }

  .empty {
    color: var(--text-3);
    font-size: 13px;
  }

  @media (max-width: 560px) {
    .row {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .inline {
      justify-content: flex-start;
    }
  }
</style>
