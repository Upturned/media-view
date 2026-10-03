<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    title,
    onclose,
    wide = false,
    children,
  }: { title: string; onclose: () => void; wide?: boolean; children: Snippet } = $props();

  let dialog: HTMLDialogElement;

  $effect(() => {
    dialog.showModal();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  class:wide
  aria-label={title}
  oncancel={(e) => { e.preventDefault(); onclose(); }}
  onclick={(e) => { if (e.target === dialog) onclose(); }}
>
  <header>
    <h2 class="label">{title}</h2>
    <button class="icon-btn" title="Close (Esc)" onclick={onclose}><Icon name="close" /></button>
  </header>
  <div class="body">
    {@render children()}
  </div>
</dialog>

<style>
  dialog {
    width: min(720px, calc(100vw - 32px));
    max-height: calc(100vh - 64px);
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    display: flex;
    flex-direction: column;
  }
  dialog.wide { width: calc(100vw - 64px); height: calc(100vh - 64px); max-width: 1600px; }
  dialog::backdrop { background: var(--scrim); }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 8px 8px 20px;
    border-bottom: 1px solid var(--line);
  }
  h2 { color: var(--text); font-size: 12px; }

  .body { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
</style>
