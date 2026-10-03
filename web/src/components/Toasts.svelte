<script lang="ts">
  import { dismiss, toasts } from '../stores/toasts.svelte.ts';
</script>

<div class="toasts" aria-live="polite">
  {#each toasts.list as t (t.id)}
    <button class="toast" class:error={t.kind === 'error'} onclick={() => dismiss(t.id)}>{t.message}</button>
  {/each}
</div>

<style>
  .toasts { position: fixed; right: 16px; bottom: 16px; z-index: 100; display: flex; flex-direction: column; gap: 8px; }
  .toast {
    max-width: 420px;
    padding: 10px 14px;
    border: 1px solid var(--line);
    border-left: 3px solid var(--blue);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  .toast.error { border-left-color: var(--red); }
</style>
