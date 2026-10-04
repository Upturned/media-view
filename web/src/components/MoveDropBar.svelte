<script lang="ts">
  import { client, unwrap } from '../api.ts';
  import { drag, dragPayload, setDragPayload } from '../stores/imports.svelte.ts';
  import { openOps, transfer } from '../stores/ops.svelte.ts';
  import { toastError } from '../stores/toasts.svelte.ts';
  import { word } from '../themes/index.ts';
  import KindIcon from './KindIcon.svelte';

  /**
   * While images are dragged out of the grid, a bar of destinations appears at the bottom:
   * the Inbox, the recent albums, and "Other album…" (opens the Move dialog).
   */

  interface Target {
    id: number;
    name: string;
    kind: 'album' | 'inbox';
  }

  let targets = $state<Target[]>([]);
  let over = $state<number | 'other' | null>(null);

  $effect(() => {
    if (!drag.internal) return;
    let recent: number[] = [];
    try {
      recent = JSON.parse(localStorage.getItem('move.recent') ?? '[]') as number[];
    } catch {
      // none
    }
    unwrap(client.api.folders.tree.$get())
      .then((r) => {
        const inbox = r.folders.find((f) => f.kind === 'inbox');
        const albums = recent.map((id) => r.folders.find((f) => f.id === id && f.kind === 'album')).filter((f) => !!f);
        targets = [...(inbox ? [inbox] : []), ...albums].map((f) => ({ id: f.id, name: f.name, kind: f.kind as 'album' | 'inbox' }));
      })
      .catch(() => (targets = []));
  });

  function allow(e: DragEvent, key: number | 'other') {
    if (!drag.internal) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    over = key;
  }

  async function drop(e: DragEvent, t: Target | null) {
    e.preventDefault();
    const files = dragPayload;
    setDragPayload([]);
    over = null;
    if (!t) {
      openOps({ kind: 'transfer', mode: 'move', files, from: 'the grid', currentFolderId: null });
      return;
    }
    try {
      await transfer('move', files.map((f) => f.id), t, 'keep-both');
    } catch (err) {
      toastError(err);
    }
  }
</script>

{#if drag.internal}
  <div class="bar">
    <span class="label">Move {dragPayload.length} {dragPayload.length === 1 ? word('image') : word('images')} to</span>
    {#each targets as t (t.id)}
      <div class="target" class:over={over === t.id} role="region" aria-label="Move to {t.name}"
        ondragover={(e) => allow(e, t.id)} ondragleave={() => (over = null)} ondrop={(e) => drop(e, t)}>
        <KindIcon kind={t.kind} size={13} />{t.name}
      </div>
    {/each}
    <div class="target other" class:over={over === 'other'} role="region" aria-label="Other album"
      ondragover={(e) => allow(e, 'other')} ondragleave={() => (over = null)} ondrop={(e) => drop(e, null)}>
      Other album…
    </div>
  </div>
{/if}

<style>
  .bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 80;
    height: 72px;
    display: flex;
    align-items: stretch;
    background: var(--bg2);
    border-top: 2px solid var(--accent);
    font: 12px var(--font-mono);
    text-transform: uppercase;
  }
  .label { display: flex; align-items: center; padding: 0 24px; color: var(--text2); border-right: 1px solid var(--line); white-space: nowrap; }
  .target { display: flex; align-items: center; gap: 8px; padding: 0 22px; border-right: 1px solid var(--line); color: var(--text); text-transform: none; font-size: 13px; white-space: nowrap; }
  .target.other { color: var(--text2); text-transform: uppercase; font-size: 12px; }
  .target.over { background: var(--accent); color: var(--accent-ink); }
</style>
