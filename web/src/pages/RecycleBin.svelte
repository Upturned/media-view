<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { client, unwrap } from '../api.ts';
  import KindIcon from '../components/KindIcon.svelte';
  import Thumb from '../components/Thumb.svelte';
  import { registerKeys } from '../keymap.svelte.ts';
  import { fmt, formatDate, formatSize } from '../media.ts';
  import { ask } from '../stores/confirm.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { openOps, restoreItems } from '../stores/ops.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';
  import { word } from '../themes/index.ts';

  /** The Recycle Bin (user guide §4.14; design M3 · 04). */

  interface Item {
    id: number;
    /** 'other': a file the app doesn't show (a wrong type sent here from Library Health). */
    entity: 'file' | 'folder' | 'other';
    name: string;
    kind: string;
    inner: string | null;
    location: string;
    locationGone: boolean;
    recycledAt: number;
    size: number;
    images: number;
    thumb: { id: number; v: string } | null;
  }

  let items = $state<Item[]>([]);
  let loaded = $state(false);
  let tab = $state<'all' | 'images' | 'folders'>('all');
  const selected = new SvelteSet<number>();

  $effect(() => {
    void live.files;
    void live.folders;
    unwrap(client.api.recycle.$get())
      .then((r) => {
        items = r.items as Item[];
        for (const id of [...selected]) if (!items.some((i) => i.id === id)) selected.delete(id);
      })
      .catch(toastError)
      .finally(() => (loaded = true));
  });

  const shown = $derived(items.filter((i) => tab === 'all' || (tab === 'images' ? i.entity !== 'folder' : i.entity === 'folder')));
  const chosen = $derived(items.filter((i) => selected.has(i.id)));
  const totalSize = $derived(items.reduce((s, i) => s + i.size, 0));
  const totalImages = $derived(items.reduce((s, i) => s + i.images, 0));
  const kindLabel = (k: string) =>
    k === 'image' ? 'Image' : k === 'other' ? 'File' : k === 'album' ? 'Album' : k === 'category' ? word('category') : word('subcategory');

  function toggleAll() {
    if (shown.length > 0 && shown.every((i) => selected.has(i.id))) selected.clear();
    else for (const i of shown) selected.add(i.id);
  }

  async function restore(list: Item[]) {
    await restoreItems(list);
  }

  function restoreTo(list: Item[]) {
    openOps({ kind: 'restore', items: list.map((i) => ({ id: i.id, entity: i.entity, name: i.name, kind: i.kind })) });
  }

  async function remove(list: Item[]) {
    const size = list.reduce((s, i) => s + i.size, 0);
    const images = list.reduce((s, i) => s + i.images, 0);
    const ok = await ask({
      tone: 'danger',
      title: list.length === 1 ? 'Delete permanently?' : `Delete ${list.length} items permanently?`,
      sub: `${fmt(images)} ${images === 1 ? 'image' : 'images'} · ${formatSize(size)}`,
      body: 'These files will be removed from disk. Their stars and descriptions go with them.',
      items: list.map((i) => ({ name: i.name, note: i.entity !== 'folder' ? formatSize(i.size) : `${kindLabel(i.kind).toLowerCase()} · ${i.images}` })),
      button: 'Delete permanently',
    });
    if (!ok) return;
    try {
      const r = await unwrap(client.api.recycle.delete.$post({ json: { ids: list.map((i) => i.id) } }));
      toast(`Deleted ${r.deleted} ${r.deleted === 1 ? 'item' : 'items'} permanently.`);
    } catch (err) {
      toastError(err);
    }
  }

  async function empty() {
    if (items.length === 0) return;
    const ok = await ask({
      tone: 'danger',
      title: 'Empty the Recycle Bin?',
      sub: `${items.length} ${items.length === 1 ? 'item' : 'items'} · ${fmt(totalImages)} images · ${formatSize(totalSize)}`,
      body: 'Everything in the bin will be deleted from disk, along with its stars and descriptions.',
      items: items.slice(0, 40).map((i) => ({ name: i.name, note: formatSize(i.size) })),
      button: 'Empty the bin',
    });
    if (!ok) return;
    try {
      await unwrap(client.api.recycle.$delete());
      toast('Bin emptied.');
    } catch (err) {
      toastError(err);
    }
  }

  $effect(() => {
    if (selected.size === 0) return;
    return registerKeys('recycle', [{ key: 'Escape', description: 'Clear the selection', handler: () => selected.clear() }]);
  });
</script>

<div class="bin-page">
  <header class="head">
    <h1 class="display title">Recycle Bin</h1>
    <div class="stats">
      <div class="stat"><b>{fmt(items.length)}</b>items</div>
      <div class="stat"><b>{formatSize(totalSize)}</b>total size</div>
      <div class="stat"><b>{fmt(totalImages)}</b>images inside</div>
    </div>
    <span class="where">Stored in .mediaview\recycle-bin\ · restored items keep their stars and descriptions</span>
    <button class="empty-btn" disabled={items.length === 0} onclick={empty}>Empty the bin</button>
  </header>

  <div class="toolbar">
    {#each [['all', 'All', items.length], ['images', 'Images', items.filter((i) => i.entity === 'file').length], ['folders', 'Folders', items.filter((i) => i.entity === 'folder').length]] as [key, label, n] (key)}
      <button class:on={tab === key} onclick={() => (tab = key as typeof tab)}>{label} <span>{n}</span></button>
    {/each}
    <span class="sort">Sort: date recycled ↓</span>
  </div>

  <div class="row head-row">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="box" class:on={shown.length > 0 && shown.every((i) => selected.has(i.id))} onclick={toggleAll}></span>
    <span></span><span>Name</span><span>Kind</span><span>Original location</span><span>Recycled</span><span class="r">Size</span><span></span>
  </div>
  <div class="rows">
    {#each shown as item (item.id)}
      <div class="row" class:sel={selected.has(item.id)}>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <span class="box" class:on={selected.has(item.id)} onclick={() => (selected.has(item.id) ? selected.delete(item.id) : selected.add(item.id))}>{selected.has(item.id) ? '✓' : ''}</span>
        {#if item.entity !== 'folder'}
          <div class="thumb"><Thumb file={item.thumb ?? undefined} fit="cover" /></div>
        {:else}
          <div class="thumb stack"><div class="back"></div><div class="front"><Thumb file={item.thumb ?? undefined} fit="cover" /></div></div>
        {/if}
        <div class="name">
          <span>{item.name}</span>
          {#if item.inner}<span class="inner">{item.inner}</span>{/if}
        </div>
        <span class="kind">
          {#if item.entity !== 'folder'}<span class="sq"></span>{:else}<KindIcon kind={item.kind as 'album'} size={12} />{/if}
          {kindLabel(item.kind)}
        </span>
        <div class="loc">
          <span class:gone={item.locationGone} title={item.location}>{item.location}</span>
          {#if item.locationGone}<span class="warn">Location no longer exists</span>{/if}
        </div>
        <span class="date">{formatDate(item.recycledAt)}</span>
        <span class="size">{formatSize(item.size)}</span>
        <div class="acts">
          <button disabled={item.locationGone} onclick={() => restore([item])} title={item.locationGone ? 'The original location is gone — use Restore to…' : 'Put it back where it was'}>Restore</button>
          {#if item.entity !== 'other'}<button class:hint={item.locationGone} onclick={() => restoreTo([item])}>Restore to…</button>{/if}
          <button class="del" onclick={() => remove([item])} title="Delete permanently">Delete</button>
        </div>
      </div>
    {:else}
      {#if loaded}
        <div class="empty">
          <span class="display">The bin is empty</span>
          <span>Recycled images and folders wait here until you restore or delete them.</span>
        </div>
      {/if}
    {/each}
  </div>

  {#if chosen.length > 0}
    <div class="selbar">
      <div class="count"><span class="display">{chosen.length}</span>selected · {formatSize(chosen.reduce((s, i) => s + i.size, 0))}</div>
      <button onclick={() => restore(chosen.filter((i) => !i.locationGone))}>Restore</button>
      <button onclick={() => restoreTo(chosen)}>Restore to…</button>
      <button class="del" onclick={() => remove(chosen)}>Delete permanently</button>
      <button class="close" onclick={() => selected.clear()} title="Clear the selection (Esc)">✕</button>
    </div>
  {/if}
</div>

<style>
  .bin-page { position: relative; height: calc(100vh - 56px); display: flex; flex-direction: column; }
  .head { display: flex; align-items: flex-end; gap: 32px; flex-wrap: wrap; padding: 24px 32px 18px; border-bottom: 1px solid var(--line); }
  .title { font-size: clamp(56px, 7vw, 96px); line-height: 0.8; }
  .stats { display: flex; gap: 28px; padding-bottom: 2px; }
  .where { margin-left: auto; max-width: 300px; font: 11px/1.5 var(--font-mono); color: var(--text2); text-transform: uppercase; text-align: right; }
  .empty-btn { height: 42px; padding: 0 18px; border: 1px solid var(--red); background: none; color: var(--red); font: 700 15px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; }
  .empty-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .toolbar { display: flex; align-items: stretch; height: 44px; flex: none; border-bottom: 1px solid var(--line); font: 12px var(--font-mono); text-transform: uppercase; }
  .toolbar button { padding: 0 18px; border: none; border-right: 1px solid var(--line); background: none; color: var(--text2); font: inherit; font-weight: 700; cursor: pointer; text-transform: inherit; }
  .toolbar button.on { background: var(--text); color: var(--bg); }
  .toolbar button span { opacity: 0.7; }
  .sort { display: flex; align-items: center; padding: 0 16px; color: var(--text2); }

  .row {
    display: grid;
    grid-template-columns: 48px 72px minmax(0, 1.4fr) 130px minmax(0, 1.6fr) 150px 90px 290px;
    align-items: center;
    min-height: 62px;
    padding: 0 32px 0 20px;
    border-bottom: 1px solid var(--line);
  }
  .row:not(.head-row):hover { background: var(--surface); }
  .row.sel { background: color-mix(in oklab, var(--accent2) 10%, transparent); }
  .head-row { min-height: 32px; flex: none; font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .rows { flex: 1; overflow-y: auto; overflow-x: hidden; background: var(--bg2); padding-bottom: 72px; }
  .r { text-align: right; }
  .box { width: 14px; height: 14px; border: 1px solid var(--text2); color: #111; font: 700 10px/14px sans-serif; text-align: center; cursor: pointer; }
  .box.on { border-color: var(--accent2); background: var(--accent2); }
  .thumb { width: 58px; height: 40px; background: var(--thumb); outline: 1px solid var(--line); overflow: hidden; }
  .thumb.stack { position: relative; overflow: visible; background: none; outline: none; }
  .stack .back { position: absolute; inset: 0; transform: translate(5px, -5px); background: var(--surface2); outline: 1px solid var(--line); }
  .stack .front { position: absolute; inset: 0; background: var(--thumb); outline: 1px solid var(--line); overflow: hidden; }
  .name { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding-right: 16px; font-size: 14px; }
  .name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .inner { font: 11px var(--font-mono); color: var(--text2); }
  .kind { display: flex; align-items: center; gap: 6px; font: 11px var(--font-mono); text-transform: uppercase; color: var(--text2); }
  .sq { width: 9px; height: 9px; background: var(--text2); }
  .loc { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding-right: 16px; font: 11.5px var(--font-mono); }
  .loc span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .loc .gone { color: var(--text2); text-decoration: line-through; }
  .warn { color: var(--amber); font-size: 10.5px; text-transform: uppercase; }
  .date { font: 11.5px var(--font-mono); color: var(--text2); }
  .size { font: 11.5px var(--font-mono); text-align: right; }
  .acts { display: flex; justify-content: flex-end; font: 11px var(--font-mono); text-transform: uppercase; }
  .acts button { height: 30px; padding: 0 10px; border: 1px solid var(--line); background: none; color: var(--text); font: inherit; cursor: pointer; text-transform: inherit; }
  .acts button + button { border-left: none; }
  .acts button:hover:not(:disabled) { border-color: var(--text); }
  .acts button:disabled { color: var(--line); cursor: not-allowed; }
  .acts button.hint { background: color-mix(in oklab, var(--amber) 18%, transparent); }
  .acts .del { color: var(--red); }
  .acts .del:hover { border-color: var(--red) !important; }

  .empty { padding: 90px 32px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .empty .display { font-size: 56px; color: var(--text); }

  .selbar { position: absolute; left: 0; right: 0; bottom: 0; z-index: 10; height: 56px; display: flex; align-items: stretch; background: var(--text); color: var(--bg); font: 12px var(--font-mono); text-transform: uppercase; }
  .selbar .count { display: flex; align-items: center; gap: 10px; padding: 0 24px; border-right: 1px solid rgba(0, 0, 0, 0.25); }
  .selbar .count .display { font-size: 30px; }
  .selbar button { padding: 0 18px; border: none; border-right: 1px solid rgba(0, 0, 0, 0.25); background: none; color: var(--bg); font: inherit; font-weight: 700; cursor: pointer; text-transform: inherit; }
  .selbar .del { background: var(--red); color: #fff; }
  .selbar .close { margin-left: auto; width: 56px; border-right: none; border-left: 1px solid rgba(0, 0, 0, 0.25); font: 700 16px sans-serif; }
</style>
