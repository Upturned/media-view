<script lang="ts">
  import type { TagRef } from '@media-view/shared';
  import { href } from '../router.svelte.ts';
  import { openMenu } from '../stores/menu.svelte.ts';
  import { openOps } from '../stores/ops.svelte.ts';
  import { inkFor, typeColor } from '../stores/tags.svelte.ts';
  import { toast } from '../stores/toasts.svelte.ts';
  import { hideTagTip, releaseTagTip, showTagTip } from '../stores/tooltip.svelte.ts';

  /**
   * A tag, colored by its type. Behaves the same everywhere (user guide §3.1): click → its images,
   * Ctrl + click → wiki page, middle-click → wiki page in a new tab, right-click → menu, hover → tooltip.
   * Implied tags are outlined with a lock and can't be removed on their own.
   */
  let {
    tag,
    implied = false,
    onremove,
  }: {
    tag: TagRef;
    implied?: boolean;
    /** Shows "Remove from this image" (manual tags only). */
    onremove?: () => void;
  } = $props();

  const color = $derived(typeColor(tag.typeId));
  let el: HTMLAnchorElement | undefined = $state();

  // A chip removed while hovered (after a click, or a list update) takes its tooltip with it.
  $effect(() => {
    const node = el;
    return () => releaseTagTip(node);
  });

  function click(e: MouseEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      location.hash = `#/tags/${tag.id}`;
    }
  }

  function aux(e: MouseEvent) {
    if (e.button !== 1) return;
    e.preventDefault();
    window.open(`#/tags/${tag.id}`, '_blank');
  }

  function menu(e: MouseEvent) {
    hideTagTip();
    openMenu(e, tag.name, [
      { label: 'Open wiki page', action: () => (location.hash = `#/tags/${tag.id}`) },
      { label: 'Show all images', action: () => (location.hash = `#/tags/${tag.id}/images`) },
      { label: 'Edit tag…', action: () => openOps({ kind: 'edit-tag', tagId: tag.id }) },
      { label: 'Copy name', action: () => navigator.clipboard.writeText(tag.name).then(() => toast(`Copied “${tag.name}”.`)) },
      ...(onremove && !implied ? [{ label: 'Remove from this image', danger: true, separated: true, action: onremove }] : []),
    ]);
  }
</script>

<a
  bind:this={el}
  class="chip"
  class:implied
  href={href(`/tags/${tag.id}/images`)}
  style:--c={color}
  style:--ink={inkFor(color)}
  onclick={click}
  onauxclick={aux}
  onmousedown={(e) => e.button === 1 && e.preventDefault()}
  oncontextmenu={menu}
  onmouseenter={(e) => showTagTip(tag, e.currentTarget as HTMLElement, implied)}
  onmouseleave={hideTagTip}
>
  {#if implied}
    <svg width="9" height="10" viewBox="0 0 10 11" aria-hidden="true"><rect x="1" y="5" width="8" height="6" fill="currentColor" /><rect x="2.6" y="1" width="4.8" height="6" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
  {/if}
  {tag.name}
</a>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    background: var(--c);
    color: var(--ink);
    font-size: 12.5px;
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .chip:hover { outline: 2px solid var(--text); }
  .chip.implied {
    padding: 2px 8px;
    border: 1px solid var(--c);
    background: repeating-linear-gradient(135deg, color-mix(in oklab, var(--c) 22%, transparent) 0 4px, transparent 4px 8px);
    color: var(--text);
  }
</style>
