<script lang="ts">
  import { onMount } from 'svelte';
  import type { GetStateRequest, PageState } from '../../shared/messages.ts';
  import {
    DEFAULT_SETTINGS,
    findSiteKey,
    normalizeSettings,
    resolveEffective,
    SETTINGS_KEY,
    siteKey,
    type Mode,
    type Reason,
    type Settings,
    type SiteState,
  } from '../../shared/settings.ts';

  const REASONS: Record<Reason, string> = {
    'site-dark': 'Dark — always on this site',
    'site-never': 'Light — never on this site',
    'mode-dark': 'Dark — global default',
    'mode-light': 'Light — global default',
    'auto-dark': 'Dark — global default (Auto, OS is dark)',
    'auto-light': 'Light — global default (Auto, OS is light)',
  };

  const osDark = matchMedia('(prefers-color-scheme: dark)').matches;

  let settings = $state<Settings>(DEFAULT_SETTINGS);
  let page = $state<PageState | null>(null);
  let loaded = $state(false);

  const effective = $derived(page ? resolveEffective(settings, page.hostname, osDark) : null);
  const siteState = $derived.by<SiteState | null>(() => {
    if (!page) return null;
    const key = findSiteKey(Object.keys(settings.sites), page.hostname);
    return key ? settings.sites[key]! : null;
  });

  onMount(async () => {
    settings = normalizeSettings((await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) {
      const request: GetStateRequest = { type: 'sombre:get-state' };
      page = await browser.tabs.sendMessage(tab.id, request, { frameId: 0 }).catch(() => null);
    }
    loaded = true;
  });

  async function save(next: Settings) {
    settings = next;
    await browser.storage.local.set({ [SETTINGS_KEY]: $state.snapshot(next) });
  }

  function setSite(state: SiteState | null) {
    if (!page) return;
    const key = siteKey(page.hostname);
    const sites = { ...settings.sites };
    if (state) sites[key] = state;
    else delete sites[key];
    void save({ ...settings, sites });
  }

  function setMode(mode: Mode) {
    void save({ ...settings, mode });
  }
</script>

<main>
  {#if !loaded}
    <p class="muted">…</p>
  {:else if !page || !effective}
    <h1>Sombre</h1>
    <p class="muted">Not available on this page.</p>
  {:else}
    <header>
      <h1>{page.hostname}</h1>
      <p class="status" class:on={effective.on && !page.native}>
        {page.native && effective.on ? '✓ Native dark theme used' : REASONS[effective.reason]}
      </p>
    </header>

    <div class="segmented" role="radiogroup" aria-label="This site">
      <button role="radio" aria-checked={siteState === null} onclick={() => setSite(null)}>Default</button>
      <button role="radio" aria-checked={siteState === 'dark'} onclick={() => setSite('dark')}>Dark</button>
      <button role="radio" aria-checked={siteState === 'never'} onclick={() => setSite('never')}>Never</button>
    </div>
  {/if}

  {#if loaded}
    <footer>
      <label>
        Default
        <select value={settings.mode} onchange={(event) => setMode(event.currentTarget.value as Mode)}>
          <option value="auto">Auto</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
    </footer>
  {/if}
</main>

<style>
  :global(:root) {
    color-scheme: dark;
  }

  :global(body) {
    margin: 0;
    background: #16171a;
    color: #e6e6e6;
    font: 14px/1.4 system-ui, sans-serif;
  }

  main {
    width: 320px;
    padding: 16px;
    box-sizing: border-box;
    display: grid;
    gap: 14px;
  }

  h1 {
    margin: 0;
    font-size: 15px;
    overflow-wrap: anywhere;
  }

  p {
    margin: 0;
  }

  .muted,
  .status {
    color: #a0a0a8;
  }

  .status {
    margin-top: 2px;
  }

  .status.on {
    color: #d7d7dc;
  }

  .segmented {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    padding: 3px;
    border-radius: 9px;
    background: #24252a;
  }

  .segmented button {
    padding: 6px 0;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #b8b8c0;
    font: inherit;
    cursor: pointer;
  }

  .segmented button[aria-checked='true'] {
    background: #3a3b42;
    color: #f2f2f5;
  }

  .segmented button:focus-visible,
  select:focus-visible {
    outline: 2px solid #7aa2ff;
    outline-offset: 1px;
  }

  footer {
    display: flex;
    justify-content: space-between;
    padding-top: 12px;
    border-top: 1px solid #2a2b30;
    color: #a0a0a8;
  }

  label {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  select {
    background: #24252a;
    color: #e6e6e6;
    border: 1px solid #3a3b42;
    border-radius: 6px;
    padding: 3px 6px;
    font: inherit;
  }
</style>
