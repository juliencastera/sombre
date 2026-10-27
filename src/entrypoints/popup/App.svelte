<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../../shared/i18n.ts';
  import type { GetStateRequest, PageState } from '../../shared/messages.ts';
  import {
    DEFAULT_SETTINGS,
    findSiteKey,
    normalizeSettings,
    resolveEffective,
    SETTINGS_KEY,
    siteKey,
    type ContrastLevel,
    type Mode,
    type Reason,
    type Settings,
    type SiteState,
  } from '../../shared/settings.ts';
  import Segmented from '../../ui/Segmented.svelte';

  const REASONS: Record<Reason, string> = {
    'site-dark': 'reasonSiteDark',
    'site-never': 'reasonSiteNever',
    'mode-dark': 'reasonModeDark',
    'mode-light': 'reasonModeLight',
    'auto-dark': 'reasonAutoDark',
    'auto-light': 'reasonAutoLight',
  };

  const osDark = matchMedia('(prefers-color-scheme: dark)').matches;
  /** Test hook: inspect a given tab instead of the active one (the popup opened as a tab is itself active). */
  const tabParam = new URLSearchParams(location.search).get('tab');

  let settings = $state<Settings>(DEFAULT_SETTINGS);
  let page = $state<PageState | null>(null);
  let loaded = $state(false);
  let shortcut = $state('');

  const effective = $derived(page ? resolveEffective(settings, page.hostname, osDark) : null);
  const siteState = $derived.by<SiteState | null>(() => {
    if (!page) return null;
    const key = findSiteKey(Object.keys(settings.sites), page.hostname);
    return key ? settings.sites[key]! : null;
  });
  /** The site's own dark theme is in use (Sombre runs in preserve mode). */
  const nativeInUse = $derived(Boolean(page?.native && effective?.on && effective.reason !== 'site-dark'));

  onMount(async () => {
    settings = normalizeSettings((await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
    const tabId = tabParam ? Number(tabParam) : (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (tabId !== undefined) {
      const request: GetStateRequest = { type: 'sombre:get-state' };
      page = await browser.tabs.sendMessage(tabId, request, { frameId: 0 }).catch(() => null);
    }
    const command = (await browser.commands.getAll()).find((c) => c.name === 'toggle-site');
    shortcut = command?.shortcut ?? '';
    loaded = true;
  });

  async function save(next: Settings) {
    settings = next;
    await browser.storage.local.set({ [SETTINGS_KEY]: $state.snapshot(next) });
  }

  function setSite(state: SiteState | 'default') {
    if (!page) return;
    const key = siteKey(page.hostname);
    const sites = { ...settings.sites };
    if (state === 'default') delete sites[key];
    else sites[key] = state;
    void save({ ...settings, sites });
  }
</script>

<main>
  {#if loaded && page && effective}
    <header>
      <h1 title={page.hostname}>{page.hostname}</h1>
      <p class="status" data-testid="status">
        <span class="dot" class:on={effective.on} aria-hidden="true"></span>
        {nativeInUse ? t('nativeStatus') : t(REASONS[effective.reason])}
      </p>
      {#if nativeInUse}
        <p class="hint">
          {t('nativeHint')}
          <button type="button" class="link-button" onclick={() => setSite('dark')}>{t('useEngine')}</button>
        </p>
      {:else if page.native && siteState === 'dark'}
        <p class="hint">{t('engineForced')}</p>
      {/if}
    </header>

    <section>
      <h2>{t('thisSite')}</h2>
      <Segmented
        label={t('thisSite')}
        value={siteState ?? 'default'}
        options={[
          { value: 'default', label: t('stateDefault') },
          { value: 'dark', label: t('stateDark') },
          { value: 'never', label: t('stateNever') },
        ]}
        onchange={setSite}
      />
    </section>
  {:else if loaded}
    <header>
      <h1>{t('extName')}</h1>
      <p class="hint">{t('notAvailable')}</p>
    </header>
  {/if}

  {#if loaded}
    <section>
      <h2>{t('contrast')}</h2>
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
    </section>

    <footer>
      <label>
        {t('defaultMode')}
        <select
          value={settings.mode}
          onchange={(event) => void save({ ...settings, mode: event.currentTarget.value as Mode })}
        >
          <option value="auto">{t('modeAuto')}</option>
          <option value="dark">{t('modeDark')}</option>
          <option value="light">{t('modeLight')}</option>
        </select>
      </label>
      <button type="button" class="link-button" onclick={() => browser.runtime.openOptionsPage()}>{t('options')}</button>
    </footer>
    {#if shortcut}
      <p class="shortcut">{t('shortcut', shortcut)}</p>
    {/if}
  {/if}
</main>

<style>
  main {
    width: 320px;
    padding: 16px;
    display: grid;
    gap: 16px;
  }

  h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  h2 {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-3);
  }

  p {
    margin: 0;
  }

  .status {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 4px;
    color: var(--text-2);
  }

  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-3);
  }

  .dot.on {
    background: var(--on);
  }

  .hint {
    margin-top: 6px;
    font-size: 13px;
    color: var(--text-3);
  }

  .hint .link-button {
    display: block;
    margin-top: 2px;
    font-size: 13px;
  }

  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    color: var(--text-2);
  }

  label {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .shortcut {
    margin-top: -8px;
    font-size: 12px;
    color: var(--text-3);
  }
</style>
