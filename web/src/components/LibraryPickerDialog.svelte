<script lang="ts" module>
  /** Where the picked images go: an album (moved or copied into it) or a collection (added to the list). */
  export type PickerTarget = { kind: 'album'; id: number; name: string } | { kind: 'collection'; id: number; name: string };
</script>

<script lang="ts">
  import type { FileDetail, FileItem } from '@media-view/shared';
  import { SvelteMap } from 'svelte/reactivity';
  import { client, unwrap } from '../api.ts';
  import { fmt, formatSize } from '../media.ts';
  import { addToCollection } from '../stores/collections.svelte.ts';
  import { transfer } from '../stores/ops.svelte.ts';
  import { toastError } from '../stores/toasts.svelte.ts';
  import DialogFrame from './DialogFrame.svelte';
  import Thumb from './Thumb.svelte';

  /**
   * Add images from the library to an album or a collection: the Inbox first (newest first), then —
   * once something is typed — the whole library, with the search syntax. Click picks, shift-click
   * picks a range. Into an album, images from the Inbox are moved and images from other albums are
   * copied (or moved, if chosen); into a collection, they're added at the end of the list.
   */
  let { target, onclose }: { target: PickerTarget; onclose: () => void } = $props();

  const LIMIT = 120;
  const toAlbum = $derived(target.kind === 'album');
  let q = $state('');
  let inboxId = $state<number | null>(null);
  let inbox = $state<FileItem[]>([]);
  let inboxTotal = $state(0);
  let every = $state<FileItem[]>([]);
  let everyTotal = $state(0);
  /** Images already where they'd go (in the album, on the list): shown, but can't be picked. */
  let already = $state(new Set<number>());
  const picked = new SvelteMap<number, FileItem>();
  /** For shift-click: the last image clicked, and in which section. */
  let anchor: { list: 'inbox' | 'every'; index: number } | null = null;
  let focused = $state<FileItem | null>(null);
  let detail = $state<FileDetail | null>(null);
  /** Images from other albums, into an album: copied (the default) or moved. */
  let othersMode = $state<'copy' | 'move'>('copy');
  let busy = $state(false);
  let input: HTMLInputElement;

  $effect(() => {
    input.focus();
  });

  // The Inbox's id, and what's already where the images would go.
  $effect(() => {
    const t = target;
    unwrap(client.api.folders.$get({ query: {} }))
      .then((r) => (inboxId = r.front?.inbox?.id ?? null))
      .catch(toastError);
    unwrap(client.api.files.ids.$get({ query: t.kind === 'album' ? { folder: String(t.id), sort: 'name', order: 'asc' } : { collection: String(t.id), sort: 'position', order: 'asc' } }))
      .then((r) => (already = new Set(r.ids)))
      .catch(toastError);
  });

  $effect(() => {
    const text = q.trim();
    const box = inboxId;
    if (box === null) return;
    const t = setTimeout(async () => {
      try {
        const mine = await unwrap(client.api.files.$get({
          query: { folder: String(box), name: text || undefined, sort: 'added', order: 'desc', limit: String(LIMIT) },
        }));
        inbox = mine.items;
        inboxTotal = mine.total;
        if (text) {
          const [all, inInbox] = await Promise.all([
            unwrap(client.api.files.$get({ query: { q: text, sort: 'added', order: 'desc', limit: String(LIMIT * 2) } })),
            unwrap(client.api.files.$get({ query: { q: text, folder: String(box), sort: 'added', order: 'desc', limit: '1' } })),
          ]);
          every = all.items.filter((f) => f.folderId !== box).slice(0, LIMIT);
          everyTotal = Math.max(0, all.total - inInbox.total);
        } else {
          every = [];
          everyTotal = 0;
        }
      } catch (err) {
        toastError(err);
      }
    }, text ? 200 : 0);
    return () => clearTimeout(t);
  });

  $effect(() => {
    const f = focused;
    detail = null;
    if (!f) return;
    unwrap(client.api.files[':id'].$get({ param: { id: String(f.id) } }))
      .then((d) => {
        if (focused?.id === d.id) detail = d;
      })
      .catch(() => {});
  });

  function click(e: MouseEvent, list: 'inbox' | 'every', items: FileItem[], index: number) {
    const f = items[index]!;
    if (already.has(f.id)) return;
    focused = f;
    if (e.shiftKey && anchor?.list === list) {
      const pick = !picked.has(f.id) || picked.has(items[anchor.index]!.id);
      for (let i = Math.min(anchor.index, index); i <= Math.max(anchor.index, index); i++) {
        const x = items[i]!;
        if (already.has(x.id)) continue;
        if (pick) picked.set(x.id, x);
        else picked.delete(x.id);
      }
    } else if (picked.has(f.id)) picked.delete(f.id);
    else picked.set(f.id, f);
    anchor = { list, index };
  }

  const fromInbox = $derived([...picked.values()].filter((f) => f.folderId === inboxId));
  const fromOthers = $derived([...picked.values()].filter((f) => f.folderId !== inboxId));
  const where = $derived(detail ? detail.relPath.split('/').slice(0, -1).join(' \\ ') || '—' : '…');
  const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

  async function add() {
    if (busy || picked.size === 0) return;
    busy = true;
    try {
      if (target.kind === 'collection') {
        await addToCollection(target, [...picked.keys()]);
      } else {
        const dest = { id: target.id, name: target.name, kind: 'album' };
        if (fromInbox.length) await transfer('move', fromInbox.map((f) => f.id), dest, 'keep-both');
        if (fromOthers.length) await transfer(othersMode, fromOthers.map((f) => f.id), dest, 'keep-both');
      }
      onclose();
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
    }
  }
</script>

{#snippet grid(list: 'inbox' | 'every', items: FileItem[])}
  <div class="grid">
    {#each items as f, i (f.id)}
      {@const here = already.has(f.id)}
      <button class="cell" class:sel={picked.has(f.id)} class:here class:focus={focused?.id === f.id} disabled={here}
        title={here ? `${f.filename} · already ${toAlbum ? 'in this album' : 'on this list'}` : f.filename}
        onclick={(e) => click(e, list, items, i)}>
        <Thumb file={f} />
        {#if picked.has(f.id)}<span class="tick">✓</span>{/if}
        {#if here}<span class="tag">{toAlbum ? 'Here' : 'On the list'}</span>{/if}
      </button>
    {/each}
  </div>
{/snippet}

<DialogFrame title="Add from the library · {target.name}"
  sub={toAlbum ? 'from the Inbox: moved here · from other albums: copied, or moved if you choose' : 'added at the end of the list · the images stay where they are'}
  width={1120} height={780} {onclose}>
  <div class="filter">
    <span class="prompt">&gt;</span>
    <input bind:this={input} bind:value={q} placeholder="filter the Inbox by file name, or search the whole library (#tags, @collections)…" spellcheck="false" />
    {#if q}<button class="clear" onclick={() => (q = '')}>✕ clear</button>{/if}
  </div>

  <div class="main">
    <div class="lists">
      <div class="sec sticky"><span class="sw"></span><span class="h">Inbox</span><span class="n">{fmt(inboxTotal)}</span></div>
      {@render grid('inbox', inbox)}
      {#if inboxId !== null && inbox.length === 0}<span class="none">{q.trim() ? `Nothing in the Inbox matches “${q.trim()}”.` : 'The Inbox is empty.'}</span>{/if}
      {#if inboxTotal > inbox.length}<span class="none">Showing the newest {fmt(inbox.length)} — type to narrow down.</span>{/if}

      <div class="sec every"><span class="sw empty"></span><span class="h">Everywhere else</span>{#if q.trim()}<span class="n">{fmt(everyTotal)}</span>{/if}</div>
      {#if !q.trim()}
        <div class="prompt-box">Type above to search the whole library — by file name, #tag or @collection.</div>
      {:else}
        {@render grid('every', every)}
        {#if every.length === 0}<span class="none">Nothing else in the library matches.</span>{/if}
        {#if everyTotal > every.length}<span class="none">Showing the newest {fmt(every.length)} of {fmt(everyTotal)} — refine the search to see others.</span>{/if}
      {/if}
    </div>

    <aside class="side">
      {#if focused}
        <div class="big"><Thumb file={focused} /></div>
        <span class="name">{focused.filename}</span>
        <div class="facts">
          <span>IN</span><span>{where}</span>
          <span>SIZE</span><span>{focused.width && focused.height ? `${focused.width} × ${focused.height} · ` : ''}{formatSize(focused.size)}</span>
        </div>
      {:else}
        <div class="nosel">Click images to pick them.<br />Shift-click picks a range.</div>
      {/if}
      {#if picked.size}
        <div class="summary">
          <span class="h">{plural(picked.size, 'image')} picked</span>
          {#if toAlbum}
            {#if fromInbox.length}<span>{plural(fromInbox.length, 'image')} from the Inbox · <b>moved</b> here</span>{/if}
            {#if fromOthers.length}
              <span>{plural(fromOthers.length, 'image')} from other albums ·</span>
              <div class="seg">
                <button class:on={othersMode === 'copy'} onclick={() => (othersMode = 'copy')} title="A copy comes here, with its tags; the original stays where it is">Copy</button>
                <button class:on={othersMode === 'move'} onclick={() => (othersMode = 'move')} title="The image leaves its album and comes here">Move</button>
              </div>
            {/if}
          {/if}
          <button class="link" onclick={() => picked.clear()}>✕ Clear the picks</button>
        </div>
      {/if}
    </aside>
  </div>

  {#snippet footer()}
    <span class="hint">{toAlbum ? 'names that clash get a number' : 'images already on the list are skipped'}</span>
    <button class="dbtn push" onclick={onclose}>Cancel</button>
    <button class="dbtn primary" disabled={busy || picked.size === 0} onclick={add}>
      {picked.size === 0 ? 'Pick images first' : `Add ${plural(picked.size, 'image')} to ${target.name.length > 24 ? `${target.name.slice(0, 23)}…` : target.name}`}
    </button>
  {/snippet}
</DialogFrame>

<style>
  .filter { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 20px; border-bottom: 1px solid var(--line); flex: none; }
  .prompt { color: var(--accent); font: 700 13px var(--font-mono); }
  .filter input { flex: 1; height: 100%; border: none; background: none; color: var(--text); font: 13px var(--font-mono); outline: none; }
  .clear { border: none; background: none; color: var(--text2); font: 11px var(--font-mono); text-transform: uppercase; cursor: pointer; }

  .main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 320px; }
  .lists { overflow-y: auto; background: var(--bg2); padding-bottom: 20px; }
  .sec { display: flex; align-items: baseline; gap: 10px; padding: 12px 20px 8px; background: var(--bg2); }
  .sec.sticky { position: sticky; top: 0; z-index: 2; }
  .sec.every { margin-top: 10px; padding-top: 22px; border-top: 1px solid var(--line); }
  .sw { width: 10px; height: 10px; flex: none; background: var(--accent); }
  .sw.empty { background: none; border: 1px solid var(--text2); }
  .h { font: 700 18px/1 var(--font-display); text-transform: uppercase; overflow-wrap: anywhere; }
  .n { font: 11px var(--font-mono); color: var(--text2); }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 10px; padding: 0 20px; }
  .cell { position: relative; aspect-ratio: 1; padding: 6px; border: none; background: var(--thumb); outline: 1px solid var(--line); cursor: pointer; }
  .cell:hover:not(:disabled) { outline: 2px solid var(--text); }
  .cell.focus { outline: 2px solid var(--text2); }
  .cell.sel { outline: 3px solid var(--accent); }
  .cell.here { opacity: 0.4; cursor: default; }
  .tick { position: absolute; top: 0; right: 0; width: 22px; height: 22px; display: grid; place-items: center; background: var(--accent); color: var(--accent-ink); font: 700 13px var(--font-mono); }
  .tag { position: absolute; top: 0; left: 0; padding: 2px 5px; background: var(--text); color: var(--bg); font: 700 9.5px var(--font-mono); text-transform: uppercase; }
  .none { display: block; padding: 6px 20px 0; font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .prompt-box { margin: 0 20px; padding: 22px; border: 1px dashed var(--line); font: 12px/1.6 var(--font-mono); color: var(--text2); text-transform: uppercase; }

  .side { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-left: 1px solid var(--line); min-width: 0; overflow-y: auto; }
  .big { aspect-ratio: 4 / 5; padding: 8px; background: var(--thumb); outline: 1px solid var(--line); flex: none; }
  .name { font: 700 18px/1.05 var(--font-display); overflow-wrap: anywhere; }
  .facts { display: grid; grid-template-columns: 84px 1fr; font: 11.5px var(--font-mono); border-top: 1px solid var(--line); }
  .facts span { padding: 5px 0; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
  .facts span:nth-child(odd) { color: var(--text2); }
  .nosel { flex: 1; display: grid; place-items: center; padding: 20px; border: 1px dashed var(--line); font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; text-align: center; }
  .summary { display: flex; flex-direction: column; gap: 8px; padding-top: 12px; border-top: 1px solid var(--line); font: 12px var(--font-mono); }
  .summary b { color: var(--accent); }
  .seg { display: flex; align-self: flex-start; border: 1px solid var(--line); font: 700 12px var(--font-mono); text-transform: uppercase; }
  .seg button { padding: 7px 12px; border: none; background: none; color: var(--text2); font: inherit; cursor: pointer; }
  .seg button.on { background: var(--text); color: var(--bg); }
  .link { align-self: flex-start; padding: 0; border: none; background: none; color: var(--text2); font: 11px var(--font-mono); text-transform: uppercase; cursor: pointer; }
  .link:hover { color: var(--text); }
</style>
