<script lang="ts">
  import { tick } from 'svelte';

  /**
   * Inline description editing (design M3 · 07): click the text or ✎, Ctrl+Enter saves, Esc cancels.
   * Up to 600 characters.
   */
  let {
    text,
    placeholder = 'No description yet. Click to add one.',
    prompt = 'Describe it…',
    onsave,
    compact = false,
  }: {
    text: string | null;
    placeholder?: string;
    prompt?: string;
    onsave: (text: string) => Promise<void>;
    compact?: boolean;
  } = $props();

  const MAX = 600;
  let editing = $state(false);
  let draft = $state('');
  let busy = $state(false);
  let area: HTMLTextAreaElement | undefined = $state();

  async function start() {
    draft = text ?? '';
    editing = true;
    await tick();
    area?.focus();
    area?.setSelectionRange(draft.length, draft.length);
  }

  async function save() {
    if (draft.length > MAX || busy) return;
    busy = true;
    try {
      await onsave(draft.trim());
      editing = false;
    } finally {
      busy = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      editing = false;
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void save();
    }
  }
</script>

{#if editing}
  <div class="editor" class:compact>
    <textarea bind:this={area} bind:value={draft} onkeydown={onKey} rows={compact ? 4 : 5} placeholder={prompt}></textarea>
    <div class="bar">
      <span class:over={draft.length > MAX}>{draft.length} / {MAX}</span>
      <span class="dim">· ctrl+enter saves · esc cancels</span>
      <button class="push" onclick={() => (editing = false)}>Cancel</button>
      <button class="save" disabled={draft.length > MAX || busy} onclick={save}>Save</button>
    </div>
  </div>
{:else}
  <button class="view" class:compact onclick={start}>
    <p class:empty={!text}>{text || placeholder}</p>
    <span class="edit">✎ Edit description</span>
  </button>
{/if}

<style>
  .view {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 680px;
    margin: -8px -10px 0;
    padding: 8px 10px;
    border: 1px dashed transparent;
    background: none;
    color: var(--text);
    text-align: left;
    font: inherit;
    cursor: text;
  }
  .view:hover { border-color: var(--line); background: var(--surface); }
  p { margin: 0; font-size: 15px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  p.empty { color: var(--text2); }
  .compact p { font-size: 13.5px; }
  .edit { font: 11px var(--font-mono); text-transform: uppercase; color: var(--text2); }

  .editor { display: flex; flex-direction: column; max-width: 680px; margin: -8px -10px 0; border: 1px solid var(--accent); background: var(--bg2); }
  textarea { resize: none; padding: 10px; border: none; background: none; color: var(--text); font: 15px/1.55 var(--font-ui); outline: none; }
  .compact textarea { font-size: 13.5px; }
  .bar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-top: 1px solid var(--line); font: 11px var(--font-mono); text-transform: uppercase; color: var(--text2); flex-wrap: wrap; }
  .over { color: var(--red); }
  .push { margin-left: auto; }
  .bar button { height: 30px; padding: 0 12px; border: 1px solid var(--line); background: none; color: var(--text); font: inherit; cursor: pointer; text-transform: inherit; }
  .bar .save { border: none; background: var(--accent); color: var(--accent-ink); font-weight: 700; padding: 0 14px; }
  .bar .save:disabled { background: var(--surface2); color: var(--text2); cursor: not-allowed; }
</style>
