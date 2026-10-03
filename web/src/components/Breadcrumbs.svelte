<script lang="ts">
  import type { Crumb } from '@media-view/shared';
  import { folderHref, href } from '../router.svelte.ts';
  import KindIcon from './KindIcon.svelte';

  /** Images / ancestors… / current. The last crumb isn't a link unless `linkLast`. */
  let { crumbs, linkLast = false }: { crumbs: Crumb[]; linkLast?: boolean } = $props();
</script>

<nav class="crumbs" aria-label="Breadcrumb">
  <a href={href('/images')}>Images</a>
  {#each crumbs as c, i (c.id)}
    <span class="sep">/</span>
    {#if i === crumbs.length - 1 && !linkLast}
      <span class="current"><KindIcon kind={c.kind} />{c.name}</span>
    {:else}
      <a href={folderHref(c)}><KindIcon kind={c.kind} />{c.name}</a>
    {/if}
  {/each}
</nav>

<style>
  .crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font: 11.5px var(--font-mono);
    text-transform: uppercase;
    color: var(--text2);
  }
  a, .current { display: inline-flex; align-items: center; gap: 5px; text-decoration: none; }
  a { color: var(--text2); }
  a:hover { color: var(--text); }
  .current { color: var(--accent); }
</style>
