<script lang="ts">
  import { dismiss, toasts } from '../stores/toasts.svelte.ts';
</script>

<!-- Inverted mono strip, bottom-left (design M2/M3). -->
<div class="toasts" aria-live="polite">
  {#each toasts.list as t (t.id)}
    <div class="toast" class:error={t.kind === 'error'}>
      <button class="msg" onclick={() => dismiss(t.id)}>{t.message}</button>
      {#if t.action}
        {@const action = t.action}
        <button class="action" onclick={() => { dismiss(t.id); action.run(); }}>{action.label}</button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toasts { position: fixed; left: 24px; bottom: 70px; z-index: 100; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .toast { display: flex; align-items: stretch; max-width: 560px; background: var(--text); color: var(--bg); font: 12px var(--font-mono); outline: 1px solid var(--bg); }
  .toast.error { background: var(--red); color: #fff; }
  button { border: none; background: none; color: inherit; font: inherit; cursor: pointer; text-align: left; }
  .msg { padding: 12px 16px; }
  .action { padding: 0 16px; border-left: 1px solid color-mix(in oklab, currentColor 30%, transparent); font-weight: 700; text-transform: uppercase; }
  .action:hover { background: color-mix(in oklab, currentColor 12%, transparent); }
</style>
