<script lang="ts">
  import { fmt } from '../media.ts';
  import { inkFor, typeColor, typeOf } from '../stores/tags.svelte.ts';
  import { firstParagraph, tagTip } from '../stores/tooltip.svelte.ts';

  /** The hover card for tags (design M2 tooltip). */
  const color = $derived(tagTip.tag ? typeColor(tagTip.tag.typeId) : '');
  const text = $derived(firstParagraph(tagTip.detail?.description ?? null));
  const left = $derived(Math.min(tagTip.x, window.innerWidth - 296));
</script>

{#if tagTip.tag}
  <div class="tip" style:left="{left}px" style:top="{tagTip.y}px">
    <span class="type" style:background={color} style:color={inkFor(color)}>{typeOf(tagTip.tag.typeId)?.name}</span>
    <div class="body">
      <span class="name display">{tagTip.tag.name}</span>
      {#if text}<span class="desc">{text}</span>{/if}
      <span class="meta">
        {#if tagTip.detail}{fmt(tagTip.detail.count)} {tagTip.detail.count === 1 ? 'image' : 'images'}{#if tagTip.detail.aliases.length} · aka {tagTip.detail.aliases.join(', ')}{/if}{/if}
        {#if tagTip.implied}<br />implied — can’t be removed on its own{/if}
        <br />Ctrl+click for the wiki page
      </span>
    </div>
  </div>
{/if}

<style>
  .tip { position: fixed; z-index: 95; width: 280px; display: flex; flex-direction: column; background: var(--bg2); border: 1px solid var(--text); pointer-events: none; }
  .type { padding: 5px 12px; font: 700 13px/1.2 var(--font-display); letter-spacing: 0.08em; text-transform: uppercase; }
  .body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 6px; }
  .name { font-size: 22px; line-height: 1; overflow-wrap: anywhere; }
  .desc { font-size: 13px; line-height: 1.45; }
  .meta { font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
</style>
