<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../../shared/i18n.ts';

  let shortcut = $state('');

  onMount(async () => {
    const command = (await browser.commands.getAll()).find((c) => c.name === 'toggle-site');
    shortcut = command?.shortcut ?? '';
  });
</script>

<main>
  <h1>{t('welcomeTitle')}</h1>
  <p class="lead">{t('welcomeLead')}</p>

  <ol>
    <li>
      <h2>{t('welcomePinTitle')}</h2>
      <p>{t('welcomePinText')}</p>
    </li>
    <li>
      <h2>{t('welcomeSiteTitle')}</h2>
      <p>
        {t('welcomeSiteText')}
        {#if shortcut}{t('welcomeShortcut', shortcut)}{/if}
      </p>
    </li>
    <li>
      <h2>{t('welcomeFixTitle')}</h2>
      <p>{t('welcomeFixText')}</p>
    </li>
  </ol>

  <p class="footer">
    <button type="button" class="link-button" onclick={() => browser.runtime.openOptionsPage()}>{t('optionsTitle')}</button>
  </p>
</main>

<style>
  main {
    max-width: 560px;
    margin: 0 auto;
    padding: 64px 24px;
  }

  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 600;
  }

  .lead {
    margin: 8px 0 32px;
    color: var(--text-2);
    font-size: 16px;
  }

  ol {
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: step;
  }

  li {
    position: relative;
    padding: 16px 20px 16px 60px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface-1);
    counter-increment: step;
  }

  li::before {
    content: counter(step);
    position: absolute;
    top: 16px;
    left: 20px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--surface-3);
    color: var(--text-1);
    font-weight: 600;
    line-height: 26px;
    text-align: center;
  }

  h2 {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 600;
  }

  p {
    margin: 0;
    color: var(--text-2);
  }

  .footer {
    margin-top: 32px;
  }
</style>
