<script lang="ts">
  import type { Crumb, FolderKind } from '@media-view/shared';
  import { folderHref, navigate } from '../router.svelte.ts';
  import { openOps, recycleFolder } from '../stores/ops.svelte.ts';

  /** Rename · Move · Recycle for the folder a page shows (the Inbox has none). */
  let { folder, parent }: { folder: { id: number; name: string; kind: FolderKind; parentId: number | null }; parent: Crumb | undefined } = $props();

  async function recycle() {
    if (await recycleFolder(folder)) navigate(parent ? folderHref(parent).slice(1) : '/images');
  }
</script>

{#if folder.kind !== 'inbox'}
  <div class="actions">
    <button onclick={() => openOps({ kind: 'rename-folder', folder })}>Rename</button>
    <button onclick={() => openOps({ kind: 'folder-move', folder })}>Move…</button>
    <button class="danger" onclick={recycle}>Recycle</button>
  </div>
{/if}

<style>
  .actions { display: flex; gap: 14px; font: 11px var(--font-mono); text-transform: uppercase; }
  button { padding: 0; border: none; background: none; color: var(--text2); font: inherit; cursor: pointer; text-transform: inherit; }
  button:hover { color: var(--text); text-decoration: underline; }
  button.danger:hover { color: var(--red); }
</style>
