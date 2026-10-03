<script lang="ts">
  import type { TagRef } from '@media-view/shared';
  import { href } from '../router.svelte.ts';
  import { openMenu } from '../stores/menu.svelte.ts';
  import { openOps } from '../stores/ops.svelte.ts';
  import { inkFor, typeColor, typeOf } from '../stores/tags.svelte.ts';
  import { toast } from '../stores/toasts.svelte.ts';

  /**
   * A tag, colored by its type. Behaves the same everywhere (user guide §3.1): click → its images,
   * Ctrl + click → edit (the wiki page arrives in milestone 5), middle-click → new tab, right-click → menu.
   * Implied tags are outlined with a lock and can't be removed on their own.
   */
  let {
    tag,
    implied = false,
    impliedBy = '',
    onremove,
  }: {
    tag: TagRef;
    implied?: boolean;
    /** For the tooltip of an implied tag. */
    impliedBy?: string;
    /** Shows "Remove from this image" (manual tags only). */
    onremove?: () => void;
  } = $props();

  const color = $derived(typeColor(tag.typeId));
  const title = $derived(
    `${typeOf(tag.typeId)?.name ?? 'Tag'} · ${tag.name}${implied ? ` — implied${impliedBy ? ` by ${impliedBy}` : ''}, can’t be removed on its own` : ''}\nClick: images · Ctrl+click: edit`,
  );

  function click(e: MouseEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      openOps({ kind: 'edit-tag', tagId: tag.id });
    }
  }

  function menu(e: MouseEvent) {
    openMenu(e, tag.name, [
      { label: 'Show all images', action: () => (location.hash = `#/tags/${tag.id}/images`) },
      { label: 'Edit tag…', action: () => openOps({ kind: 'edit-tag', tagId: tag.id }) },
      {
        label: 'Copy name',
        action: () => navigator.clipboard.writeText(tag.name).then(() => toast(`Copied “${tag.name}”.`)),
      },
      ...(onremove && !implied ? [{ label: 'Remove from this image', danger: true, separated: true, action: onremove }] : []),
    ]);
  }
</script>

<a
  class="chip"
  class:implied
  href={href(`/tags/${tag.id}/images`)}
  {title}
  style:--c={color}
  style:--ink={inkFor(color)}
  onclick={click}
  oncontextmenu={menu}
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
