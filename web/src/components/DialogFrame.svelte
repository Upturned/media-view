<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * The one dialog frame (design M3): condensed title bar, mono context line, close button;
   * body and footer from snippets. `edge` adds the colored side bar of confirmations.
   */
  let {
    title,
    sub = '',
    width = 640,
    height,
    edge,
    onclose,
    head,
    children,
    footer,
  }: {
    title: string;
    sub?: string;
    width?: number;
    height?: number;
    edge?: string;
    onclose: () => void;
    /** Extra controls in the title bar (e.g. the Move / Copy switch). */
    head?: Snippet;
    children: Snippet;
    footer?: Snippet;
  } = $props();

  let dialog: HTMLDialogElement;

  $effect(() => {
    dialog.showModal();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  aria-label={title}
  style:width="min({width}px, calc(100vw - 32px))"
  style:height={height ? `min(${height}px, calc(100vh - 48px))` : undefined}
  style:border-color={edge ?? 'var(--text)'}
  oncancel={(e) => { e.preventDefault(); onclose(); }}
  onclick={(e) => { if (e.target === dialog) onclose(); }}
>
  <header>
    {#if edge}<div class="edge" style:background={edge}></div>{/if}
    <div class="titles">
      <span class="title">{title}</span>
      {#if sub}<span class="sub">{sub}</span>{/if}
    </div>
    {#if head}<div class="head">{@render head()}</div>{/if}
    {#if !edge}<button class="close" onclick={onclose} title="Close (Esc)">✕</button>{/if}
  </header>
  <div class="body">{@render children()}</div>
  {#if footer}<footer>{@render footer()}</footer>{/if}
</dialog>

<style>
  dialog {
    max-height: calc(100vh - 48px);
    padding: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--text);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
  }
  dialog::backdrop { background: rgba(7, 7, 7, 0.74); }

  header { display: flex; align-items: stretch; border-bottom: 1px solid var(--line); flex: none; }
  .edge { width: 8px; flex: none; }
  .titles { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; padding: 16px 20px 14px; }
  .title { font: 700 30px/0.95 var(--font-display); text-transform: uppercase; overflow-wrap: anywhere; }
  .sub { font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; overflow-wrap: anywhere; }
  .head { display: flex; align-items: center; padding: 0 16px; border-left: 1px solid var(--line); }
  .close { width: 56px; border: none; border-left: 1px solid var(--line); background: none; color: var(--text); font: 16px sans-serif; cursor: pointer; }
  .close:hover { background: var(--surface2); }

  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: auto; }

  footer {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 20px;
    border-top: 1px solid var(--line);
  }
  footer :global(.hint) { font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  footer :global(.push) { margin-left: auto; }

  /* Dialog buttons: outline secondary, filled primary, red only for what can't be undone. */
  dialog :global(.dbtn) {
    height: 40px;
    padding: 0 18px;
    border: 1px solid var(--line);
    background: none;
    color: var(--text);
    font: 700 15px/1 var(--font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
    cursor: pointer;
  }
  dialog :global(.dbtn:hover:not(:disabled)) { border-color: var(--text); }
  dialog :global(.dbtn.primary) { padding: 0 22px; border: none; background: var(--accent); color: var(--accent-ink); }
  dialog :global(.dbtn.danger) { padding: 0 22px; border: none; background: var(--red); color: #fff; }
  dialog :global(.dbtn.strong) { padding: 0 22px; border: none; background: var(--text); color: var(--bg); }
  dialog :global(.dbtn:disabled) { border: none; background: var(--surface2); color: var(--text2); cursor: not-allowed; }
  dialog :global(.field-label) { font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  dialog :global(.field) {
    height: 40px;
    padding: 0 10px;
    border: 1px solid var(--text);
    background: var(--bg2);
    color: var(--text);
    font: 13px var(--font-mono);
    outline: none;
  }
  dialog :global(.field.bad) { border-color: var(--red); }
  dialog :global(.msg) { min-height: 16px; font: 11.5px var(--font-mono); color: var(--text2); }
  dialog :global(.msg.bad) { color: var(--red); }
</style>
