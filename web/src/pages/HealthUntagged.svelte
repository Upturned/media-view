<script lang="ts">
  import type { FileItem, HealthReport, TagRef } from '@media-view/shared';
  import { SvelteSet } from 'svelte/reactivity';
  import { client, unwrap } from '../api.ts';
  import HealthHeader from '../components/HealthHeader.svelte';
  import KindIcon from '../components/KindIcon.svelte';
  import TagInput from '../components/TagInput.svelte';
  import Thumb from '../components/Thumb.svelte';
  import { fmt, formatDate, viewerHref } from '../media.ts';
  import { href, navigate } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { openOps } from '../stores/ops.svelte.ts';
  import { inkFor, typeColor } from '../stores/tags.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';

  /**
   * Untagged images on the Health page (design M7 · 05): album by album, with a tag field on every
   * row — a tagged row leaves the list. Mark as seen clears NEW; Leave untagged takes it off the list
   * (and "Left untagged (n)" brings them back).
   */
  type Row = FileItem & { where: string };
  const PAGE = 200;

  let report = $state<HealthReport | null>(null);
  let filter = $state<'all' | 'new' | 'left'>('all');
  let rows = $state<Row[]>([]);
  let total = $state(0);
  /** Rows tagged here: shown with their tag for a moment, then they leave. */
  let tagged = $state<Record<number, TagRef>>({});
  const gone = new SvelteSet<number>();
  const selected = new SvelteSet<number>();

  async function load(offset = 0) {
    try {
      const q = filter === 'new' ? { fresh: '1' as const } : filter === 'left' ? { left: '1' as const } : {};
      const r = await unwrap(client.api.health.untagged.$get({ query: { ...q, offset: String(offset), limit: String(PAGE) } }));
      rows = offset ? [...rows, ...r.items] : r.items;
      total = r.total;
      if (!offset) {
        gone.clear();
        tagged = {};
      }
    } catch (err) {
      toastError(err);
    }
  }

  $effect(() => {
    void filter;
    selected.clear();
    void load();
  });

  $effect(() => {
    void live.health;
    void live.files;
    unwrap(client.api.health.$get()).then((r) => (report = r)).catch(toastError);
  });

  const shown = $derived(rows.filter((r) => !gone.has(r.id)));
  const byAlbum = $derived.by(() => {
    const out: { where: string; folderId: number; rows: Row[] }[] = [];
    for (const r of shown) {
      const last = out.at(-1);
      if (last && last.folderId === r.folderId) last.rows.push(r);
      else out.push({ where: r.where, folderId: r.folderId, rows: [r] });
    }
    return out;
  });

  async function tag(r: Row, t: TagRef) {
    try {
      await unwrap(client.api.files.tags.$post({ json: { ids: [r.id], add: [t.id], remove: [] } }));
      tagged = { ...tagged, [r.id]: t };
      toast(`Tagged ${t.name} · it leaves the list`, 'info', {
        label: 'Undo',
        run: () => {
          void unwrap(client.api.files.tags.$post({ json: { ids: [r.id], add: [], remove: [t.id] } })).then(() => {
            const next = { ...tagged };
            delete next[r.id];
            tagged = next;
            gone.delete(r.id);
          });
        },
      });
      setTimeout(() => tagged[r.id] && gone.add(r.id), 1500);
    } catch (err) {
      toastError(err);
    }
  }

  async function act(ids: number[], action: 'seen' | 'leave' | 'put-back') {
    try {
      const r = await unwrap(client.api.health.untagged[action].$post({ json: { ids } }));
      const n = `${fmt(r.changed)} ${r.changed === 1 ? 'image' : 'images'}`;
      if (action === 'seen') rows = rows.map((x) => (ids.includes(x.id) ? { ...x, isNew: false } : x));
      else for (const id of ids) gone.add(id);
      selected.clear();
      toast(action === 'seen' ? `Marked ${n} as seen · still on the list` : action === 'leave' ? `Left ${n} untagged · off the list` : `Put ${n} back on the list`, 'info', {
        label: 'Undo',
        run: () => {
          const back = action === 'seen' ? null : action === 'leave' ? 'put-back' : 'leave';
          if (back) void unwrap(client.api.health.untagged[back].$post({ json: { ids } })).then(() => ids.forEach((id) => gone.delete(id)));
        },
      });
    } catch (err) {
      toastError(err);
    }
  }

  async function bulkTags() {
    const files = shown.filter((r) => selected.has(r.id));
    if (files.length) openOps({ kind: 'bulk-tag', files, where: 'untagged images' });
  }

  const listQuery = { untagged: true, sort: 'name' as const, order: 'asc' as const };
</script>

<div class="health-page">
  <HealthHeader {report} compact crumb="Untagged" />
  <div class="blue-bar">
    <div class="edge"></div>
    <span class="t">Blue — for your information</span><span class="s">not counted in the badge</span>
    <a href={href('/health')}>↑ Library Health</a>
  </div>
  <div class="g-head">
    <span class="g-name">{filter === 'left' ? 'Left untagged' : 'Untagged images'}</span>
    <span class="g-sub">{filter === 'left' ? 'set aside · put them back on the list any time' : 'outside the Inbox · no tags yet · grouped by album'}</span>
  </div>
  <div class="toolbar">
    <div class="seg">
      <button class:on={filter === 'all'} onclick={() => (filter = 'all')}>All untagged · {fmt(report?.summary.untagged ?? 0)}</button>
      <button class:on={filter === 'new'} onclick={() => (filter = 'new')}>New from outside · {fmt(report?.summary.fresh ?? 0)}</button>
    </div>
    <button class="tbtn" onclick={() => shown.forEach((r) => selected.add(r.id))}>Select all</button>
    <span class="hint">tag a row and it leaves · mark as seen clears NEW · leave untagged takes it off the list</span>
    <button class="tbtn grid" onclick={() => navigate(filter === 'new' ? '/health/untagged/grid?fresh=1' : '/health/untagged/grid')}>Open as grid ↗</button>
  </div>

  <div class="list">
    {#each byAlbum as g (g.folderId + g.where)}
      <div class="album">
        <KindIcon kind="album" size={13} />
        <span class="a-name">{g.where.split(' › ').at(-1)}</span>
        <span class="a-path">{g.where}</span>
        <span class="a-n">{g.rows.length}</span>
      </div>
      {#each g.rows as r (r.id)}
        {@const t = tagged[r.id]}
        <div class="row" class:sel={selected.has(r.id)} class:done={!!t}>
          <button class="check" class:on={selected.has(r.id)} onclick={() => (selected.has(r.id) ? selected.delete(r.id) : selected.add(r.id))}>{selected.has(r.id) ? '✓' : ''}</button>
          <a class="pic" href={viewerHref(r.id, listQuery)}><Thumb file={r} /></a>
          <div class="name">
            <div class="n-row"><span class="fname">{r.filename}</span>{#if r.isNew}<span class="new">NEW</span>{/if}</div>
            <span class="arrived">{r.isNew ? 'arrived' : 'added'} {formatDate(r.addedAt)}</span>
          </div>
          <div class="tagcell">
            {#if t}
              {@const c = typeColor(t.typeId)}
              <div class="tagged"><span style:background={c} style:color={inkFor(c)}>{t.name}</span><span>✓ tagged · leaving the list</span></div>
            {:else if filter !== 'left'}
              <TagInput onpick={(picked) => void tag(r, picked)} />
            {/if}
          </div>
          <div class="acts">
            {#if filter === 'left'}
              <button class="rbtn" onclick={() => act([r.id], 'put-back')}>Put back on the list</button>
            {:else}
              {#if r.isNew && !t}<button class="rbtn" onclick={() => act([r.id], 'seen')}>Mark as seen</button>{/if}
              {#if !t}<button class="rbtn dim" onclick={() => act([r.id], 'leave')}>Leave untagged</button>{/if}
            {/if}
          </div>
        </div>
      {/each}
    {:else}
      <div class="none">
        <span class="display">{filter === 'left' ? 'Nothing set aside.' : 'Every frame has a name.'}</span>
        <span>{filter === 'left' ? 'Images you leave untagged show up here.' : 'Nothing untagged here. Switch the filter, or come back after the next import.'}</span>
      </div>
    {/each}
    {#if rows.length < total}
      <button class="more" onclick={() => load(rows.length)}>Load {fmt(Math.min(PAGE, total - rows.length))} more · {fmt(total - rows.length)} left</button>
    {/if}
    {#if filter !== 'left' && (report?.leftUntagged ?? 0) > 0}
      <button class="left-link" onclick={() => (filter = 'left')}>Left untagged ({fmt(report!.leftUntagged)}) ▸</button>
    {:else if filter === 'left'}
      <button class="left-link" onclick={() => (filter = 'all')}>◂ Back to the untagged list</button>
    {/if}
  </div>

  {#if selected.size}
    <div class="bulk">
      <div class="count"><span class="display">{fmt(selected.size)}</span><span>frames circled.<br />do something.</span></div>
      {#if filter === 'left'}
        <button onclick={() => act([...selected], 'put-back')}>Put back on the list</button>
      {:else}
        <button class="strong" onclick={bulkTags}>Tags…</button>
        <button onclick={() => act([...selected], 'seen')}>Mark as seen</button>
        <button onclick={() => act([...selected], 'leave')}>Leave untagged</button>
      {/if}
      <button class="close" onclick={() => selected.clear()}>✕</button>
    </div>
  {/if}
</div>

<style>
  .health-page { height: calc(100vh - 56px); display: flex; flex-direction: column; overflow: hidden; position: relative; }
  .blue-bar { display: flex; align-items: center; gap: 16px; border-bottom: 1px solid var(--line); flex: none; padding-right: 32px; }
  .blue-bar .edge { width: 8px; align-self: stretch; background: var(--blue); }
  .blue-bar .t { font: 700 24px/1 var(--font-display); text-transform: uppercase; padding: 12px 0 10px; }
  .blue-bar .s { font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .blue-bar a { margin-left: auto; font: 11px var(--font-mono); color: var(--accent); text-transform: uppercase; text-decoration: none; }
  .g-head { display: flex; align-items: baseline; gap: 12px; padding: 14px 32px 10px; background: var(--bg2); border-bottom: 1px solid var(--line); flex: none; }
  .g-name { font: 700 22px/1 var(--font-display); text-transform: uppercase; }
  .g-sub { font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .toolbar { display: flex; align-items: center; gap: 10px; padding: 8px 32px; border-bottom: 1px solid var(--line); flex: none; font: 11px var(--font-mono); text-transform: uppercase; }
  .seg { display: flex; border: 1px solid var(--line); }
  .seg button { height: 28px; padding: 0 10px; border: none; background: none; color: var(--text2); font: 700 11px var(--font-mono); text-transform: uppercase; cursor: pointer; }
  .seg button.on { background: var(--text); color: var(--bg); }
  .tbtn { height: 28px; padding: 0 10px; border: 1px solid var(--line); background: none; color: var(--text); font: 700 11px var(--font-mono); text-transform: uppercase; cursor: pointer; }
  .tbtn.grid { margin-left: auto; color: var(--accent); }
  .hint { color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .list { flex: 1; overflow-y: auto; overflow-x: hidden; padding-bottom: 80px; }
  .album { display: flex; align-items: center; gap: 10px; padding: 14px 32px 8px; color: var(--text2); }
  .a-name { font: 700 18px/1 var(--font-display); text-transform: uppercase; color: var(--text); }
  .a-path { font: 11px var(--font-mono); text-transform: uppercase; }
  .a-n { margin-left: auto; font: 11px var(--font-mono); }
  .row { display: grid; grid-template-columns: 20px 96px minmax(0, 240px) minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 8px 32px; border-bottom: 1px solid var(--line); }
  .row.sel { background: color-mix(in oklab, var(--accent2) 10%, transparent); }
  .row.done { opacity: 0.55; }
  .check { width: 14px; height: 14px; padding: 0; border: 1px solid var(--text2); border-radius: 50%; background: none; color: #111; font: 700 10px/12px sans-serif; cursor: pointer; }
  .check.on { border: none; border-radius: 0; background: var(--accent2); }
  .pic { display: block; width: 96px; height: 64px; background: var(--thumb); outline: 1px solid var(--line); padding: 4px; }
  .name { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .n-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .fname { font: 12px var(--font-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .new { padding: 1px 5px; background: var(--accent2); color: #111; font: 700 10px var(--font-mono); }
  .arrived { font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .tagcell { min-width: 0; }
  .tagged { display: flex; align-items: center; gap: 10px; font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .tagged span:first-child { padding: 3px 8px; font: 12.5px var(--font-ui); text-transform: none; }
  .acts { display: flex; gap: 6px; }
  .rbtn { height: 30px; padding: 0 10px; border: 1px solid var(--line); background: none; color: var(--text); font: 11px var(--font-mono); text-transform: uppercase; cursor: pointer; white-space: nowrap; }
  .rbtn:hover { border-color: var(--text); }
  .rbtn.dim { color: var(--text2); }
  .none { display: flex; flex-direction: column; gap: 8px; padding: 40px 32px; font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .none .display { font-size: 48px; color: var(--text); }
  .more, .left-link { display: block; margin: 16px 32px 0; padding: 0; border: none; background: none; color: var(--text2); font: 11px var(--font-mono); text-transform: uppercase; cursor: pointer; }
  .more:hover, .left-link:hover { color: var(--text); }
  .bulk { position: absolute; left: 0; right: 0; bottom: 0; height: 60px; display: flex; align-items: stretch; background: var(--accent2); color: #111; font: 12px var(--font-mono); text-transform: uppercase; z-index: 10; }
  .bulk .count { display: flex; align-items: center; gap: 10px; padding: 0 24px; border-right: 2px solid #111; line-height: 1.2; }
  .bulk .count .display { font-size: 34px; }
  .bulk button { padding: 0 16px; border: none; border-right: 1px solid rgba(0, 0, 0, 0.25); background: none; color: #111; font: inherit; font-weight: 700; text-transform: inherit; cursor: pointer; }
  .bulk button.strong { background: #111; color: var(--accent2); }
  .bulk .close { margin-left: auto; width: 60px; border-right: none; border-left: 2px solid #111; font-size: 16px; }
</style>
