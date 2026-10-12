<script lang="ts">
  import { keyHint } from '../kbd.svelte.ts';

  /** The keys a page answers to, shown once (design M8 · 1J): quiet, bottom-centre, no close button. */
  const KEYS = {
    grid: [['← → ↑ ↓', 'move'], ['Enter', 'open'], ['Space', 'select'], ['⌫', 'up']],
    cards: [['← → ↑ ↓', 'move'], ['Enter', 'open'], ['⌫', 'up']],
    strip: [['← →', 'move'], ['Enter', 'show'], ['Esc', 'back']],
  };
</script>

{#if keyHint.context}
  <div class="hint" class:above={keyHint.context === 'strip'} role="status">
    {#each KEYS[keyHint.context] as [k, what] (k)}
      <span class="pair"><kbd>{k}</kbd>{what}</span>
    {/each}
    <span class="sep">|</span><span>F1 all keys</span>
  </div>
{/if}

<style>
  .hint {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 9px 14px;
    background: var(--bg2);
    border: 1px solid var(--line);
    color: var(--text2);
    font: 11px var(--font-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
    pointer-events: none;
  }
  /* In the viewer, above the film strip it talks about. */
  .hint.above { bottom: 128px; }
  .pair { display: flex; align-items: center; gap: 6px; }
  kbd { padding: 1px 5px; border: 1px solid var(--line); color: var(--text); font: inherit; }
  .sep { color: var(--line); }
</style>
