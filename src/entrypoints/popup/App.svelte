<script lang="ts">
  const version = browser.runtime.getManifest().version;
</script>

<main>
  <h1>Sombre</h1>
  <p>v{version}</p>
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
    width: 360px;
    padding: 16px;
    box-sizing: border-box;
  }

  h1 {
    margin: 0;
    font-size: 16px;
  }

  p {
    margin: 4px 0 0;
    color: #a0a0a8;
  }
</style>
