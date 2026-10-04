<script lang="ts">
  import type { FolderCard, InboxSummary } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import FolderCardView from '../components/FolderCardView.svelte';
  import DropOverlay from '../components/DropOverlay.svelte';
  import InboxBanner from '../components/InboxBanner.svelte';
  import ListIcon from '../components/ListIcon.svelte';
  import NameDialog from '../components/NameDialog.svelte';
  import { fmt } from '../media.ts';
  import { href, navigate } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { drag, importDrop, startImport } from '../stores/imports.svelte.ts';
  import { library } from '../stores/library.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';
  import { isStyled, word } from '../themes/index.ts';

  /** The front page of the Images module: the Inbox first, then the categories a→z (user guide §4.2). */

  let inbox = $state<InboxSummary | null>(null);
  let categories: FolderCard[] = $state([]);
  let loaded = $state(false);
  let creating = $state(false);
  let listCount = $state<number | null>(null);

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
    unwrap(client.api.collections.$get({ query: {} }))
      .then((r) => (listCount = r.collections.length))
      .catch(() => (listCount = null));
  });

  async function createCategory(name: string) {
    const card = await unwrap(client.api.folders.$post({ json: { parentId: null, kind: 'category', name } }));
    toast(`Created ${word('category').toLowerCase()} “${card.name}”.`);
    navigate(`/images/f/${card.id}`);
  }

  // No album here: images added or dropped on this page go to the Inbox (user guide §4.2).
  const inboxTarget = $derived(inbox ? { id: inbox.id, label: 'Inbox' } : null);

  async function addImages() {
    if (!inboxTarget) return;
    try {
      const { paths } = await unwrap(client.api.system['pick-files'].$post({ json: { title: 'Add images to the Inbox' } }));
      startImport(inboxTarget, paths);
    } catch (err) {
      toastError(err);
    }
  }

  function onDragOver(e: DragEvent) {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  }

  function onDrop(e: DragEvent) {
    if (!inboxTarget || !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    void importDrop(e.dataTransfer, inboxTarget);
  }

  const imagesRoot =$derived(library.info ? `${library.info.path.replace(/[\\/]+$/, '')}\\Images\\` : '');
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="page" ondragover={onDragOver} ondrop={onDrop}>
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
    <div class="actions">
      <div class="btn-group">
        <a class="btn" href={href('/favorites')}><span class="star">★</span> Favorites</a>
        <a class="btn" href={href('/collections')}><ListIcon size={13} />Collections{#if listCount !== null}<span class="n">{fmt(listCount)}</span>{/if}</a>
      </div>
      <button class="btn gap" onclick={() => (creating = true)}>+ New {word('category').toLowerCase()}</button>
      <button class="btn primary" onclick={addImages}>+ Add images</button>
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
        <FolderCardView folder={c} parentId={null} index={i} />
      {/each}
    </div>
  {:else if loaded}
    <div class="empty">
      <span class="display">No {word('categories').toLowerCase()} yet.</span>
      <span>Create one, or add folders to <span class="path">{imagesRoot}</span> in Explorer — the app picks them up.</span>
    </div>
  {/if}

  {#if drag.files}
    <DropOverlay target={`${imagesRoot}Inbox\\`} headline={'Straight to\nthe Inbox.'} body="No album here, so the Inbox gets them. Sort them later." />
  {/if}
</div>

{#if creating}
  <NameDialog title="New {word('category').toLowerCase()}" label="Name" onsubmit={createCategory} onclose={() => (creating = false)} />
{/if}

<style>
  .page { position: relative; display: flex; flex-direction: column; gap: 24px; }

  .head { display: flex; align-items: flex-end; gap: 32px; flex-wrap: wrap; border-bottom: 1px solid var(--line); padding-bottom: 18px; }
  .title { font-size: clamp(72px, 10vw, 140px); line-height: 0.78; }
  .facts { display: flex; flex-direction: column; gap: 4px; padding-bottom: 4px; font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .facts b { color: var(--text); font-weight: 400; }
  .facts b.accent { color: var(--accent); }
  .actions { margin-left: auto; display: flex; gap: 8px; }
  .star { color: var(--accent2); }
  .n { font: 11px var(--font-mono); color: var(--text2); }
  .gap { margin-left: 4px; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px 16px; }

  .empty { display: flex; flex-direction: column; gap: 8px; padding: 32px 0; color: var(--text2); font: 12px var(--font-mono); text-transform: uppercase; }
  .empty .display { font-size: 48px; color: var(--text); }
  .path { color: var(--text); text-transform: none; }
</style>
