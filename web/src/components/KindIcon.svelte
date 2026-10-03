<script lang="ts">
  import type { FolderKind } from '@media-view/shared';

  /** Rack (category), drawer (sub-category), album and tray (Inbox), from the Darkroom design. */
  let { kind, size = 12 }: { kind: FolderKind; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
  {#if kind === 'category'}
    <rect x="2" y="1" width="1.6" height="14" fill="currentColor" />
    <rect x="12.4" y="1" width="1.6" height="14" fill="currentColor" />
    <rect x="2" y="4" width="12" height="1.6" fill="currentColor" />
    <rect x="2" y="9.5" width="12" height="1.6" fill="currentColor" />
  {:else if kind === 'subcategory'}
    <rect x="1.8" y="3.8" width="12.4" height="9.4" fill="none" stroke="currentColor" stroke-width="1.6" />
    <rect x="6" y="7.6" width="4" height="1.8" fill="currentColor" />
  {:else if kind === 'album'}
    <rect x="4.5" y="1.5" width="10" height="11" fill="none" stroke="currentColor" stroke-width="1.4" />
    <rect x="1.5" y="4" width="10" height="11" fill="currentColor" />
  {:else}
    <path d="M1.5 9 L4 3.5 H12 L14.5 9 V13 H1.5 Z" fill="none" stroke="currentColor" stroke-width="1.5" />
    <rect x="5.5" y="8.3" width="5" height="1.5" fill="currentColor" />
  {/if}
</svg>
