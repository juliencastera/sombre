<script lang="ts" generics="T extends string">
  interface Props {
    label: string;
    options: readonly { value: T; label: string }[];
    value: T | null;
    onchange: (value: T) => void;
  }

  let { label, options, value, onchange }: Props = $props();

  function onkeydown(event: KeyboardEvent) {
    const index = options.findIndex((option) => option.value === value);
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = options[(index + step + options.length) % options.length]!;
    onchange(next.value);
    (event.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
  }
</script>

<div class="segmented" role="radiogroup" aria-label={label} tabindex="-1" {onkeydown}>
  {#each options as option (option.value)}
    <button
      type="button"
      role="radio"
      data-value={option.value}
      aria-checked={option.value === value}
      tabindex={option.value === value || (value === null && option === options[0]) ? 0 : -1}
      onclick={() => onchange(option.value)}>{option.label}</button
    >
  {/each}
</div>

<style>
  .segmented {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    padding: 3px;
    border-radius: 10px;
    background: var(--surface-2);
    outline: none;
  }

  button {
    padding: 7px 4px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--text-2);
    font: inherit;
    cursor: pointer;
    transition:
      background-color 120ms ease-out,
      color 120ms ease-out;
  }

  button:hover {
    color: var(--text-1);
  }

  button[aria-checked='true'] {
    background: var(--surface-3);
    color: var(--text-1);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.35);
  }

  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
