<script lang="ts" module>
  import type { ThumbRef } from '@media-view/shared';

  export interface PickTarget {
    key: string;
    label: string;
    current: number | null;
  }
  export type PickedImage = ThumbRef & { filename: string };
</script>

<script lang="ts">
  import type { FileDetail, FileItem, TagRef } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import { fmt, formatSize } from '../media.ts';
  import { typeColor } from '../stores/tags.svelte.ts';
  import { toastError } from '../stores/toasts.svelte.ts';
  import DialogFrame from './DialogFrame.svelte';
  import Thumb from './Thumb.svelte';

  /**
   * Choose an image for a wiki page (design M5 · 03): the tag's own images first, then — once
   * something is typed — the whole library. Double-click uses an image right away.
   */
  let {
    tag,
    targets,
    target: initial,
    onuse,
    onclose,
  }: {
    tag: TagRef;
    targets: PickTarget[];
    target: string;
    onuse: (target: string, image: PickedImage | null) => void;
    onclose: () => void;
  } = $props();

  const LIMIT = 120;
  let chosen = $state<string | null>(null);
  const target = $derived(chosen ?? initial);
  const current = $derived(targets.find((t) => t.key === target));
  let q = $state('');
  let own = $state<FileItem[]>([]);
  let ownTotal = $state(0);
  let every = $state<FileItem[]>([]);
  let everyTotal = $state(0);
  let selected = $state<FileItem | null>(null);
  let detail = $state<FileDetail | null>(null);
  let input: HTMLInputElement;

  $effect(() => {
    input.focus();
  });

  $effect(() => {
    const text = q.trim();
    const t = setTimeout(async () => {
      try {
        const mine = await unwrap(client.api.files.$get({
          query: { tag: String(tag.id), name: text || undefined, sort: 'added', order: 'desc', limit: String(LIMIT) },
        }));
        own = mine.items;
        ownTotal = mine.total;
        if (text) {
          const all = await unwrap(client.api.files.$get({ query: { q: text, sort: 'added', order: 'desc', limit: String(LIMIT + mine.items.length) } }));
          const mineIds = new Set(mine.items.map((f) => f.id));
          every = all.items.filter((f) => !mineIds.has(f.id)).slice(0, LIMIT);
          everyTotal = Math.max(0, all.total - mine.total);
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
    const f = selected;
    detail = null;
    if (!f) return;
    unwrap(client.api.files[':id'].$get({ param: { id: String(f.id) } }))
      .then((d) => {
        if (selected?.id === d.id) detail = d;
      })
      .catch(() => {});
  });

  const tagged = $derived(detail ? detail.tags.some((t) => t.id === tag.id) : selected ? own.some((f) => f.id === selected!.id) : false);
  const folder = $derived(detail ? detail.relPath.split('/').slice(0, -1).join(' \\ ') || '—' : '…');

  function use(f: FileItem | null) {
    if (!current) return;
    onuse(current.key, f ? { id: f.id, v: f.v, filename: f.filename } : null);
    onclose();
  }
</script>

{#snippet grid(items: FileItem[])}
  <div class="grid">
    {#each items as f (f.id)}
      <button
        class="cell"
        class:sel={selected?.id === f.id}
        title={f.filename}
        onclick={() => (selected = f)}
        ondblclick={() => use(f)}
      >
        <Thumb file={f} />
        {#if f.id === current?.current}<span class="cur">Current</span>{/if}
      </button>
    {/each}
  </div>
{/snippet}

<DialogFrame title="Choose image · {current?.label ?? ''}" sub="for {tag.name} · the original file stays where it is" width={1120} height={780} {onclose}>
  {#snippet head()}
    {#if targets.length > 1}
      <div class="seg">
        {#each targets as t (t.key)}
          <button class:on={t.key === target} onclick={() => (chosen = t.key)}>{t.label}</button>
        {/each}
      </div>
    {/if}
  {/snippet}

  <div class="filter">
    <span class="prompt">&gt;</span>
    <input bind:this={input} bind:value={q} placeholder="filter by file name, or search the whole library…" spellcheck="false" />
    {#if q}<button class="clear" onclick={() => (q = '')}>✕ clear</button>{/if}
  </div>

  <div class="main">
    <div class="lists">
      <div class="sec sticky"><span class="sw" style:background={typeColor(tag.typeId)}></span><span class="h">Tagged {tag.name}</span><span class="n">{fmt(ownTotal)}</span></div>
      {@render grid(own)}
      {#if q.trim() && own.length === 0}<span class="none">None of the tag’s images match “{q.trim()}”.</span>{/if}
      {#if ownTotal > own.length}<span class="none">Showing the newest {fmt(own.length)} — type to narrow down.</span>{/if}

      <div class="sec every"><span class="sw empty"></span><span class="h">Everywhere</span>{#if q.trim()}<span class="n">{fmt(everyTotal)}</span>{/if}</div>
      {#if !q.trim()}
        <div class="prompt-box">Type above to search the whole library — by file name, or #tag.</div>
      {:else}
        {@render grid(every)}
        {#if every.length === 0}<span class="none">Nothing else in the library matches.</span>{/if}
      {/if}
    </div>

    <aside class="side">
      {#if selected}
        <div class="big"><Thumb file={selected} /></div>
        <span class="name">{selected.filename}</span>
        <div class="facts">
          <span>IN</span><span>{folder}</span>
          <span>SIZE</span><span>{selected.width && selected.height ? `${selected.width} × ${selected.height} · ` : ''}{formatSize(selected.size)}</span>
          <span>TAGGED</span><span class:no={!tagged}>{tagged ? 'yes' : 'no'}</span>
        </div>
        {#if !tagged && detail}
          <p>Not tagged {tag.name}. It can still be used; the image is only referenced, not moved or tagged.</p>
        {/if}
      {:else}
        <div class="nosel">Pick an image.<br />Double-click uses it right away.</div>
      {/if}
    </aside>
  </div>

  {#snippet footer()}
    {#if current?.current}
      <button class="dbtn" onclick={() => use(null)}>Remove {current.label.toLowerCase()}</button>
    {/if}
    <button class="dbtn push" onclick={onclose}>Cancel</button>
    <button class="dbtn primary" disabled={!selected} onclick={() => use(selected)}>Use as {current?.label.toLowerCase()}</button>
  {/snippet}
</DialogFrame>

<style>
  .seg { display: flex; border: 1px solid var(--line); font: 700 12px var(--font-mono); text-transform: uppercase; }
  .seg button { padding: 7px 12px; border: none; background: none; color: var(--text2); font: inherit; cursor: pointer; }
  .seg button.on { background: var(--text); color: var(--bg); }

  .filter { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 20px; border-bottom: 1px solid var(--line); flex: none; }
  .prompt { color: var(--accent); font: 700 13px var(--font-mono); }
  .filter input { flex: 1; height: 100%; border: none; background: none; color: var(--text); font: 13px var(--font-mono); outline: none; }
  .clear { border: none; background: none; color: var(--text2); font: 11px var(--font-mono); text-transform: uppercase; cursor: pointer; }

  .main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 320px; }
  .lists { overflow-y: auto; background: var(--bg2); padding-bottom: 20px; }
  .sec { display: flex; align-items: baseline; gap: 10px; padding: 12px 20px 8px; background: var(--bg2); }
  .sec.sticky { position: sticky; top: 0; z-index: 2; }
  .sec.every { margin-top: 10px; padding-top: 22px; border-top: 1px solid var(--line); }
  .sw { width: 10px; height: 10px; flex: none; }
  .sw.empty { border: 1px solid var(--text2); }
  .h { font: 700 18px/1 var(--font-display); text-transform: uppercase; overflow-wrap: anywhere; }
  .n { font: 11px var(--font-mono); color: var(--text2); }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 10px; padding: 0 20px; }
  .cell { position: relative; aspect-ratio: 1; padding: 6px; border: none; background: var(--thumb); outline: 1px solid var(--line); cursor: pointer; }
  .cell:hover { outline: 2px solid var(--text); }
  .cell.sel { outline: 3px solid var(--accent); }
  .cur { position: absolute; top: 0; left: 0; padding: 2px 5px; background: var(--text); color: var(--bg); font: 700 9.5px var(--font-mono); text-transform: uppercase; }
  .none { display: block; padding: 6px 20px 0; font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .prompt-box { margin: 0 20px; padding: 22px; border: 1px dashed var(--line); font: 12px/1.6 var(--font-mono); color: var(--text2); text-transform: uppercase; }

  .side { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-left: 1px solid var(--line); min-width: 0; overflow-y: auto; }
  .big { aspect-ratio: 4 / 5; padding: 8px; background: var(--thumb); outline: 1px solid var(--line); flex: none; }
  .name { font: 700 18px/1.05 var(--font-display); overflow-wrap: anywhere; }
  .facts { display: grid; grid-template-columns: 84px 1fr; font: 11.5px var(--font-mono); border-top: 1px solid var(--line); }
  .facts span { padding: 5px 0; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
  .facts span:nth-child(odd) { color: var(--text2); }
  .facts .no { color: var(--amber); }
  .side p { margin: 0; font-size: 13px; line-height: 1.45; color: var(--text2); }
  .nosel { flex: 1; display: grid; place-items: center; padding: 20px; border: 1px dashed var(--line); font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; text-align: center; }
</style>
