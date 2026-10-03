<script lang="ts">
  import type { FolderCard, InboxSummary } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import FolderCardView from '../components/FolderCardView.svelte';
  import InboxBanner from '../components/InboxBanner.svelte';
  import NameDialog from '../components/NameDialog.svelte';
  import { fmt } from '../media.ts';
  import { navigate } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { library } from '../stores/library.svelte.ts';
  import { toast } from '../stores/toasts.svelte.ts';
  import { isStyled, word } from '../themes/index.ts';

  /** The front page of the Images module: the Inbox first, then the categories a→z (user guide §4.2). */

  let inbox = $state<InboxSummary | null>(null);
  let categories: FolderCard[] = $state([]);
  let loaded = $state(false);
  let creating = $state(false);

  $effect(() => {
    void live.folders;
    void live.files;
    unwrap(client.api.folders.$get({ query: {} }))
      .then((r) => {
        inbox = r.front?.inbox ?? null;
        categories = r.front?.categories ?? [];
      })
      .catch((err: Error) => toast(err.message, 'error'))
      .finally(() => (loaded = true));
  });

  async function createCategory(name: string) {
    const card = await unwrap(client.api.folders.$post({ json: { parentId: null, kind: 'category', name } }));
    toast(`Created ${word('category').toLowerCase()} “${card.name}”.`);
    navigate(`/images/f/${card.id}`);
  }

  async function rescan() {
    try {
      await unwrap(client.api.library.rescan.$post());
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }

  const imagesRoot =$derived(library.info ? `${library.info.path.replace(/[\\/]+$/, '')}\\Images\\` : '');
</script>

<div class="page">
  <header class="head">
    <h1 class="display title">Library</h1>
    <div class="facts">
      <span>{imagesRoot}</span>
      <span>
        <b>{fmt(library.info?.stats.files ?? 0)}</b> {word('images')} ·
        <b>{fmt(categories.length)}</b> {categories.length === 1 ? word('category').toLowerCase() : word('categories').toLowerCase()} ·
        <b class="accent">{fmt(inbox?.imageCount ?? 0)}</b> in the Inbox
      </span>
    </div>
    <div class="actions btn-group">
      <!-- Until the folder watcher (milestone 3), changes made in Explorer show up after a rescan. -->
      <button class="btn" onclick={rescan} disabled={live.scanning} title="Check the library folder again for changes made outside the app">
        {live.scanning ? 'Scanning…' : '↻ Rescan'}
      </button>
      <button class="btn" onclick={() => (creating = true)}>+ New {word('category').toLowerCase()}</button>
    </div>
  </header>

  {#if inbox}
    <InboxBanner {inbox} />
  {/if}

  <div class="section-title">
    <strong>{word('categories')}</strong>
    <span>{fmt(categories.length)} {isStyled('categories') ? (categories.length === 1 ? 'category' : 'categories') : ''} · a→z</span>
  </div>

  {#if categories.length > 0}
    <div class="grid">
      {#each categories as c, i (c.id)}
        <FolderCardView folder={c} index={i} />
      {/each}
    </div>
  {:else if loaded}
    <div class="empty">
      <span class="display">No {word('categories').toLowerCase()} yet.</span>
      <span>Create one, or add folders to <span class="path">{imagesRoot}</span> in Explorer — the app picks them up.</span>
    </div>
  {/if}
</div>

{#if creating}
  <NameDialog title="New {word('category').toLowerCase()}" label="Name" onsubmit={createCategory} onclose={() => (creating = false)} />
{/if}

<style>
  .page { display: flex; flex-direction: column; gap: 24px; }

  .head { display: flex; align-items: flex-end; gap: 32px; flex-wrap: wrap; border-bottom: 1px solid var(--line); padding-bottom: 18px; }
  .title { font-size: clamp(72px, 10vw, 140px); line-height: 0.78; }
  .facts { display: flex; flex-direction: column; gap: 4px; padding-bottom: 4px; font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .facts b { color: var(--text); font-weight: 400; }
  .facts b.accent { color: var(--accent); }
  .actions { margin-left: auto; display: flex; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px 16px; }

  .empty { display: flex; flex-direction: column; gap: 8px; padding: 32px 0; color: var(--text2); font: 12px var(--font-mono); text-transform: uppercase; }
  .empty .display { font-size: 48px; color: var(--text); }
  .path { color: var(--text); text-transform: none; }
</style>
