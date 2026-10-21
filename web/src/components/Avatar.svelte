<script lang="ts">
  import type { ThumbRef } from '@media-view/shared';
  import Thumb from './Thumb.svelte';

  /** A profile's picture (a square crop of its thumbnail), or its initials on its color (docs/profiles.md §4.3). */
  let { p, size = 32 }: { p: { name: string; color: string; picture: ThumbRef | null }; size?: number } = $props();

  const initials = $derived(
    p.name.split(/[\s_-]+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]!.toUpperCase()).join('') || '?',
  );
</script>

<span class="avatar" style:width="{size}px" style:height="{size}px" style:background={p.picture ? 'var(--thumb)' : p.color} style:font-size="{Math.round(size * 0.42)}px" aria-hidden="true">
  {#if p.picture}<Thumb file={p.picture} fit="cover" />{:else}{initials}{/if}
</span>

<style>
  .avatar {
    flex: none;
    display: inline-grid;
    place-items: center;
    overflow: hidden;
    color: #fff;
    font-family: var(--font-display);
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.02em;
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.35);
    user-select: none;
  }
</style>
