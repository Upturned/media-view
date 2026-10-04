<script lang="ts">
  import type { TagCoverage, TagRef } from '@media-view/shared';
  import { SvelteMap } from 'svelte/reactivity';
  import { client, unwrap } from '../api.ts';
  import { fmt } from '../media.ts';
  import { closeOps, type OpsDialog } from '../stores/ops.svelte.ts';
  import { groupByType, typeColor } from '../stores/tags.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';
  import { word } from '../themes/index.ts';
  import DialogFrame from './DialogFrame.svelte';
  import TagInput from './TagInput.svelte';
  import Thumb from './Thumb.svelte';

  /**
   * Tag a selection (design M4 · 06): bars show how many of the images have each tag; nothing
   * changes until Apply. Implied tags can't be removed here (remove the tag that implies them).
   */
  let { dialog }: { dialog: Extract<OpsDialog, { kind: 'bulk-tag' }> } = $props();

  const total = $derived(dialog.files.length);
  let coverage = $state<TagCoverage[]>([]);
  let thumbs = $state<{ id: number; v: string }[]>([]);
  /** Pending changes: tag id → add to all / remove from all. */
  const pending = new SvelteMap<number, { tag: TagRef; action: 'add' | 'remove' }>();
  let busy = $state(false);

  $effect(() => {
    const ids = dialog.files.map((f) => f.id);
    unwrap(client.api.files['tag-coverage'].$post({ json: { ids } }))
      .then((r) => (coverage = r.tags))
      .catch(toastError);
    // A strip of the images (the first 12).
    Promise.all(ids.slice(0, 12).map((id) => unwrap(client.api.files[':id'].$get({ param: { id: String(id) } })).catch(() => null)))
      .then((rows) => (thumbs = rows.filter((r) => !!r).map((r) => ({ id: r!.id, v: r!.v }))));
  });

  interface Row {
    tag: TagRef;
    count: number;
    impliedOnly: boolean;
    action: 'add' | 'remove' | null;
  }

  const rows = $derived.by(() => {
    const out: Row[] = coverage.map((c) => ({ tag: c, count: c.count, impliedOnly: c.impliedOnly, action: pending.get(c.id)?.action ?? null }));
    for (const p of pending.values()) if (!coverage.some((c) => c.id === p.tag.id)) out.push({ tag: p.tag, count: 0, impliedOnly: false, action: p.action });
    return out;
  });
  const groups = $derived(groupByType(rows.map((r) => ({ ...r, typeId: r.tag.typeId }))));

  const adds = $derived([...pending.values()].filter((p) => p.action === 'add').length);
  const removes = $derived([...pending.values()].filter((p) => p.action === 'remove').length);

  function toggle(row: Row, action: 'add' | 'remove') {
    if (pending.get(row.tag.id)?.action === action) pending.delete(row.tag.id);
    else pending.set(row.tag.id, { tag: row.tag, action });
  }

  /** How many of the images will have it after Apply. */
  function after(row: Row): number {
    return row.action === 'add' ? total : row.action === 'remove' ? 0 : row.count;
  }

  async function apply() {
    if (!adds && !removes) return;
    busy = true;
    try {
      const add = [...pending.values()].filter((p) => p.action === 'add').map((p) => p.tag.id);
      const remove = [...pending.values()].filter((p) => p.action === 'remove').map((p) => p.tag.id);
      await unwrap(client.api.files.tags.$post({ json: { ids: dialog.files.map((f) => f.id), add, remove } }));
      toast(`Tagged ${fmt(total)} ${total === 1 ? word('image') : word('images')}.`);
      closeOps();
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
    }
  }
</script>

<DialogFrame title="Tag {fmt(total)} {total === 1 ? word('image') : word('images')}" sub="from {dialog.where} · implied tags follow automatically" width={820} height={760} onclose={closeOps}>
  <div class="strip">
    {#each thumbs as t (t.id)}<div class="t"><Thumb file={t} fit="cover" /></div>{/each}
    {#if total > 12}<span class="more">+{fmt(total - 12)}</span>{/if}
  </div>
  <div class="input">
    <TagInput
      placeholder="add a tag to all {total} — type:name works"
      already={rows.filter((r) => after(r) === total).map((r) => r.tag.id)}
      note={(s) => { const c = coverage.find((x) => x.id === s.id); return c ? `on ${c.count}/${total}` : ''; }}
      onpick={(t) => pending.set(t.id, { tag: t, action: 'add' })}
    />
  </div>
  <div class="rows">
    {#each groups as g (g.type.id)}
      <div class="group-head" style:background={g.type.color}></div>
      {#each g.tags as r (r.tag.id)}
        {@const now = after(r)}
        {@const filled = Math.round((now / total) * 12)}
        <div class="row" class:pending={r.action}>
          <span class="bar" style:background={typeColor(r.tag.typeId)}></span>
          <div class="name">
            <span class:struck={r.action === 'remove'}>{r.tag.name}</span>
            {#if r.action === 'add'}<span class="note add">will be on all {total}</span>
            {:else if r.action === 'remove'}<span class="note rem">comes off {r.count}</span>
            {:else if r.impliedOnly}<span class="note">implied by another tag</span>{/if}
          </div>
          <div class="cells">
            {#each { length: 12 } as _, i (i)}<span class:on={i < filled} style:--c={typeColor(r.tag.typeId)}></span>{/each}
          </div>
          <span class="cov">{fmt(now)} / {fmt(total)}</span>
          <div class="acts">
            {#if r.impliedOnly}
              <span class="locked"><svg width="9" height="10" viewBox="0 0 10 11"><rect x="1" y="5" width="8" height="6" fill="currentColor" /><rect x="2.6" y="1" width="4.8" height="6" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>implied</span>
            {:else}
              {#if r.count < total}<button class:on={r.action === 'add'} onclick={() => toggle(r, 'add')}>{r.action === 'add' ? '✓ add to all' : '+ add to all'}</button>{/if}
              {#if r.count > 0}<button class="rem" class:on={r.action === 'remove'} onclick={() => toggle(r, 'remove')}>{r.action === 'remove' ? '✓ remove' : '− remove'}</button>{/if}
            {/if}
          </div>
        </div>
      {/each}
    {:else}
      <div class="empty">No tags on these images yet. Add one above.</div>
    {/each}
  </div>
  {#snippet footer()}
    <span class="hint" style:color={adds || removes ? 'var(--text)' : undefined}>{adds || removes ? `${adds} to add · ${removes} to remove` : 'Nothing changes until Apply'}</span>
    <button class="dbtn push" onclick={closeOps}>Cancel</button>
    <button class="dbtn primary" disabled={(!adds && !removes) || busy} onclick={apply}>Apply</button>
  {/snippet}
</DialogFrame>

<style>
  .strip { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)) auto; gap: 4px; padding: 12px 20px; border-bottom: 1px solid var(--line); align-items: center; flex: none; }
  .t { aspect-ratio: 1; background: var(--thumb); outline: 1px solid var(--line); overflow: hidden; }
  .more { font: 11px var(--font-mono); color: var(--text2); padding-left: 6px; }
  .input { padding: 12px 20px; border-bottom: 1px solid var(--line); flex: none; }
  .rows { flex: 1; overflow-y: auto; background: var(--bg2); min-height: 120px; }
  .group-head { height: 3px; }
  .row { display: grid; grid-template-columns: 4px minmax(0, 1fr) 190px 90px 200px; align-items: center; gap: 14px; min-height: 42px; padding-right: 20px; border-bottom: 1px solid var(--line); }
  .row.pending { background: color-mix(in oklab, var(--accent) 8%, transparent); }
  .bar { align-self: stretch; }
  .name { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 14px; }
  .name span:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .struck { text-decoration: line-through; color: var(--text2); }
  .note { font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .note.add { color: var(--accent); }
  .note.rem { color: var(--red); }
  .cells { display: grid; grid-template-columns: repeat(12, 1fr); gap: 2px; height: 12px; }
  .cells span { background: var(--surface2); }
  .cells span.on { background: var(--c); }
  .cov { font: 12px var(--font-mono); text-align: right; }
  .acts { display: flex; justify-content: flex-end; gap: 4px; font: 10.5px var(--font-mono); text-transform: uppercase; }
  .acts button { height: 26px; padding: 0 9px; border: 1px solid var(--line); background: none; color: var(--text); font: inherit; text-transform: inherit; cursor: pointer; }
  .acts button.on { background: var(--surface2); border-color: var(--text); }
  .acts .rem { color: var(--red); }
  .acts .rem.on { border-color: var(--red); background: color-mix(in oklab, var(--red) 14%, transparent); }
  .locked { display: flex; align-items: center; gap: 5px; color: var(--text2); }
  .empty { padding: 24px 20px; font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
</style>
