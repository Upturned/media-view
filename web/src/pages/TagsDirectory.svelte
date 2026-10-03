<script lang="ts">
  import type { TagSummary } from '@media-view/shared';
  import { SvelteSet } from 'svelte/reactivity';
  import { client, unwrap } from '../api.ts';
  import DialogFrame from '../components/DialogFrame.svelte';
  import NameDialog from '../components/NameDialog.svelte';
  import { registerKeys } from '../keymap.svelte.ts';
  import { fmt } from '../media.ts';
  import { href, navigate } from '../router.svelte.ts';
  import { ask } from '../stores/confirm.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { openMenu } from '../stores/menu.svelte.ts';
  import { openOps } from '../stores/ops.svelte.ts';
  import { defaultType, groupByType, inkFor, tagTypes, typeColor, typeOf } from '../stores/tags.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';

  /** Every tag, grouped by type (user guide §4.7; design M4 · 03). Select two or more to merge. */

  let tags = $state<TagSummary[]>([]);
  let loaded = $state(false);
  let filter = $state('');
  let sort = $state<'name' | 'count'>('name');
  let typeFilter = $state<number | null>(null);
  let creating = $state(false);
  let merging = $state(false);
  let mergeInto = $state<number | null>(null);
  let keepAliases = $state(true);
  const selected = new SvelteSet<number>();

  $effect(() => {
    void live.files;
    unwrap(client.api.tags.$get({ query: { sort: 'name' } }))
      .then((r) => {
        tags = r.tags;
        for (const id of [...selected]) if (!tags.some((t) => t.id === id)) selected.delete(id);
      })
      .catch(toastError)
      .finally(() => (loaded = true));
  });

  const shown = $derived.by(() => {
    const q = filter.trim().toLowerCase().replace(/_/g, ' ');
    const list = tags.filter((t) => (typeFilter === null || t.typeId === typeFilter)
      && (!q || t.name.toLowerCase().includes(q) || t.aliases.some((a) => a.toLowerCase().includes(q))));
    return sort === 'count' ? [...list].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) : list;
  });
  const groups = $derived(groupByType(shown));
  const chosen = $derived(tags.filter((t) => selected.has(t.id)));
  const uses = $derived(chosen.reduce((s, t) => s + t.count, 0));

  async function create(name: string) {
    const t = await unwrap(client.api.tags.$post({ json: { name } }));
    toast(`Created “${t.name}” (${typeOf(t.typeId)?.name}).`);
  }

  function openMerge() {
    if (chosen.length < 2) return;
    mergeInto = [...chosen].sort((a, b) => b.count - a.count)[0]!.id;
    merging = true;
  }

  async function merge() {
    if (mergeInto === null) return;
    try {
      const into = await unwrap(client.api.tags.merge.$post({ json: { sourceIds: chosen.map((t) => t.id), targetId: mergeInto, keepAliases } }));
      toast(`Merged ${chosen.length - 1} into ${into.name}.`);
      selected.clear();
      merging = false;
    } catch (err) {
      toastError(err);
    }
  }

  async function remove(list: TagSummary[]) {
    const total = list.reduce((s, t) => s + t.count, 0);
    const ok = await ask({
      tone: 'danger',
      title: list.length === 1 ? `Delete “${list[0]!.name}”?` : `Delete ${list.length} tags?`,
      sub: `used on ${fmt(total)} ${total === 1 ? 'image' : 'images'}`,
      body: 'The tags and their aliases are deleted, and they come off every image. The images themselves stay where they are.',
      items: list.length > 1 ? list.map((t) => ({ name: t.name, note: `${fmt(t.count)} images` })) : undefined,
      button: list.length === 1 ? 'Delete tag' : 'Delete tags',
    });
    if (!ok) return;
    try {
      const r = await unwrap(client.api.tags.delete.$post({ json: { ids: list.map((t) => t.id) } }));
      toast(`Deleted ${r.deleted} ${r.deleted === 1 ? 'tag' : 'tags'}.`);
      selected.clear();
    } catch (err) {
      toastError(err);
    }
  }

  function toggle(t: TagSummary) {
    if (selected.has(t.id)) selected.delete(t.id);
    else selected.add(t.id);
  }

  function menu(e: MouseEvent, t: TagSummary) {
    openMenu(e, t.name, [
      { label: 'Show all images', action: () => navigate(`/tags/${t.id}/images`) },
      { label: 'Edit tag…', action: () => openOps({ kind: 'edit-tag', tagId: t.id }) },
      { label: selected.has(t.id) ? 'Deselect' : 'Select', separated: true, action: () => toggle(t) },
      { label: 'Delete', danger: true, action: () => void remove([t]) },
    ]);
  }

  $effect(() => {
    if (selected.size === 0) return;
    return registerKeys('tags', [{ key: 'Escape', description: 'Clear the selection', handler: () => selected.clear() }]);
  });
</script>

<div class="tags-page">
  <header class="head">
    <h1 class="display title">Tags</h1>
    <span class="meta"><b>{fmt(tags.length)}</b> tags · <b>{tagTypes.list.length}</b> types</span>
    <a class="types-link" href={href('/tag-types')}>Tag types →</a>
    <button class="btn primary" onclick={() => (creating = true)}>+ New tag</button>
  </header>

  <div class="toolbar">
    <div class="filter"><span class="prompt">&gt;</span><input bind:value={filter} placeholder="filter tags or aliases…" spellcheck="false" /></div>
    <button class="tool" onclick={() => (sort = sort === 'name' ? 'count' : 'name')}><span class="dim">Sort:</span> {sort === 'name' ? 'Name a→z' : 'Most used'}</button>
    <button class="tool" class:on={typeFilter === null} onclick={() => (typeFilter = null)}><span class="dot all"></span>All <span class="n">{tags.length}</span></button>
    {#each tagTypes.list as t (t.id)}
      <button class="tool" class:on={typeFilter === t.id} onclick={() => (typeFilter = typeFilter === t.id ? null : t.id)}>
        <span class="dot" style:background={t.color}></span>{t.name} <span class="n">{tags.filter((x) => x.typeId === t.id).length}</span>
      </button>
    {/each}
  </div>

  <div class="list">
    {#each groups as g (g.type.id)}
      <div class="group-head" style:background={g.type.color} style:color={inkFor(g.type.color)}>
        {g.type.name}<span>{g.tags.length} tags · {fmt(g.tags.reduce((s, t) => s + t.count, 0))} uses</span>
        {#if g.type.isDefault}<span class="default">Default type</span>{/if}
      </div>
      <div class="grid">
        {#each g.tags as t (t.id)}
          <div class="tag" class:sel={selected.has(t.id)} oncontextmenu={(e) => menu(e, t)} role="row" tabindex="-1">
            <button class="box" class:on={selected.has(t.id)} onclick={() => toggle(t)} aria-label="Select {t.name}">{selected.has(t.id) ? '✓' : ''}</button>
            <a class="name" href={href(`/tags/${t.id}/images`)} onclick={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); openOps({ kind: 'edit-tag', tagId: t.id }); } else if (selected.size > 0) { e.preventDefault(); toggle(t); } }}>
              <span>{t.name}</span>
              {#if t.aliases.length}<span class="aka">aka {t.aliases.join(', ')}</span>{/if}
            </a>
            <span class="count">{fmt(t.count)}</span>
          </div>
        {/each}
      </div>
    {:else}
      {#if loaded}
        <div class="empty">
          <span class="display">{tags.length ? 'No tags match.' : 'No tags yet.'}</span>
          <span>{tags.length ? 'Loosen the filter.' : 'Tag images from the viewer or a selection — or create one here.'}</span>
        </div>
      {/if}
    {/each}
  </div>

  {#if chosen.length > 0}
    <div class="selbar">
      <div class="count-box"><span class="display">{chosen.length}</span>{chosen.length === 1 ? 'tag' : 'tags'} selected · {fmt(uses)} uses</div>
      <button disabled={chosen.length < 2} onclick={openMerge}>Merge…</button>
      <button class="del" onclick={() => remove(chosen)}>Delete</button>
      <span class="hint">{chosen.length < 2 ? 'Select two or more to merge' : ''}</span>
      <button class="close" onclick={() => selected.clear()} title="Clear the selection (Esc)">✕</button>
    </div>
  {/if}
</div>

{#if creating}
  <NameDialog title="New tag" sub="it gets the {defaultType()?.name ?? 'default'} type — or write type:name" label="Name" onsubmit={create} onclose={() => (creating = false)} />
{/if}

{#if merging}
  <DialogFrame title="Merge {chosen.length} tags" sub="pick the tag that stays" width={600} onclose={() => (merging = false)}>
    <div class="merge">
      {#each chosen as t (t.id)}
        {@const c = typeColor(t.typeId)}
        <button class="opt" class:on={mergeInto === t.id} onclick={() => (mergeInto = t.id)}>
          <span class="radio"></span>
          <span class="bar" style:background={c}></span>
          <span class="name">{t.name}</span>
          <span class="type" style:background={c} style:color={inkFor(c)}>{typeOf(t.typeId)?.name}</span>
          <span class="n">{fmt(t.count)}</span>
        </button>
      {/each}
      <label class="keep"><input type="checkbox" bind:checked={keepAliases} /> Keep the other names as aliases</label>
      <p>
        {fmt(chosen.filter((t) => t.id !== mergeInto).reduce((s, t) => s + t.count, 0))} image tags move to
        <b>{chosen.find((t) => t.id === mergeInto)?.name}</b>{keepAliases ? '; the other names keep working as its aliases' : ''}. Their implications move over too.
      </p>
    </div>
    {#snippet footer()}
      <span class="hint">One-time cleanup · logged</span>
      <button class="dbtn push" onclick={() => (merging = false)}>Cancel</button>
      <button class="dbtn primary" onclick={merge}>Merge into {chosen.find((t) => t.id === mergeInto)?.name}</button>
    {/snippet}
  </DialogFrame>
{/if}

<style>
  .tags-page { position: relative; height: calc(100vh - 56px); display: flex; flex-direction: column; }
  .head { display: flex; align-items: flex-end; gap: 28px; padding: 22px 32px 16px; border-bottom: 1px solid var(--line); flex: none; }
  .title { font-size: clamp(56px, 7vw, 96px); line-height: 0.8; }
  .meta { padding-bottom: 4px; font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .meta b { color: var(--text); font-weight: 400; }
  .types-link { margin-left: auto; padding-bottom: 6px; font: 12px var(--font-mono); text-transform: uppercase; color: var(--text2); text-decoration: none; }
  .types-link:hover { color: var(--text); }

  .toolbar { display: flex; align-items: stretch; height: 44px; flex: none; border-bottom: 1px solid var(--line); font: 12px var(--font-mono); text-transform: uppercase; overflow-x: auto; }
  .filter { display: flex; align-items: center; gap: 8px; width: 300px; flex: none; padding: 0 16px; border-right: 1px solid var(--line); }
  .prompt { color: var(--accent); font-weight: 700; }
  .filter input { flex: 1; min-width: 0; height: 100%; border: none; background: none; color: var(--text); font: 13px var(--font-mono); outline: none; }
  .tool { display: flex; align-items: center; gap: 8px; padding: 0 14px; border: none; border-right: 1px solid var(--line); background: none; color: var(--text2); font: inherit; font-weight: 700; white-space: nowrap; cursor: pointer; text-transform: inherit; }
  .tool.on { background: var(--text); color: var(--bg); }
  .dim { color: var(--text2); font-weight: 400; }
  .dot { width: 10px; height: 10px; }
  .dot.all { background: var(--text); }
  .tool.on .dot.all { background: var(--bg); }
  .n { opacity: 0.7; font-weight: 400; }

  .list { flex: 1; overflow-y: auto; overflow-x: hidden; padding-bottom: 90px; background: var(--bg2); }
  .group-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 10px; padding: 7px 32px; font: 700 16px/1.2 var(--font-display); letter-spacing: 0.08em; text-transform: uppercase; }
  .group-head span { font: 11px var(--font-mono); }
  .default { margin-left: auto; padding: 2px 6px; border: 1px solid currentColor; font-size: 10px !important; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1px; background: var(--line); border-bottom: 1px solid var(--line); }
  .tag { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 6px 16px 6px 20px; background: var(--bg2); }
  .tag:hover { background: var(--surface); }
  .tag.sel { background: color-mix(in oklab, var(--accent2) 10%, var(--bg2)); }
  .box { width: 14px; height: 14px; flex: none; padding: 0; border: 1px solid var(--text2); background: none; color: #111; font: 700 10px/12px sans-serif; cursor: pointer; }
  .box.on { border-color: var(--accent2); background: var(--accent2); }
  .name { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; color: var(--text); text-decoration: none; font-size: 14px; }
  .name span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name:hover span:first-child { text-decoration: underline; }
  .aka { font: 10.5px var(--font-mono); color: var(--text2); }
  .count { font: 11.5px var(--font-mono); color: var(--text2); }
  .empty { padding: 60px 32px; display: flex; flex-direction: column; gap: 8px; font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .empty .display { font-size: 48px; color: var(--text); }

  .selbar { position: absolute; left: 0; right: 0; bottom: 0; z-index: 10; height: 56px; display: flex; align-items: stretch; background: var(--text); color: var(--bg); font: 12px var(--font-mono); text-transform: uppercase; }
  .count-box { display: flex; align-items: center; gap: 10px; padding: 0 24px; border-right: 1px solid rgba(0, 0, 0, 0.25); }
  .count-box .display { font-size: 30px; }
  .selbar button { padding: 0 18px; border: none; border-right: 1px solid rgba(0, 0, 0, 0.25); background: none; color: var(--bg); font: inherit; font-weight: 700; cursor: pointer; text-transform: inherit; }
  .selbar button:disabled { color: rgba(0, 0, 0, 0.35); cursor: not-allowed; }
  .selbar .del { background: var(--red); color: #fff; }
  .selbar .hint { display: flex; align-items: center; padding: 0 16px; color: rgba(0, 0, 0, 0.6); }
  .selbar .close { margin-left: auto; width: 56px; border-right: none; border-left: 1px solid rgba(0, 0, 0, 0.25); font: 700 16px sans-serif; }

  .merge { display: flex; flex-direction: column; padding: 12px 20px 16px; gap: 10px; }
  .opt { display: flex; align-items: center; gap: 12px; padding: 9px 10px; border: none; border-bottom: 1px solid var(--line); background: none; color: var(--text); cursor: pointer; text-align: left; }
  .opt.on { background: var(--surface2); }
  .radio { width: 14px; height: 14px; flex: none; border-radius: 50%; border: 1px solid var(--text); box-shadow: inset 0 0 0 3px var(--bg); }
  .opt.on .radio { background: var(--accent); }
  .opt .bar { width: 4px; align-self: stretch; }
  .opt .name { flex: 1; font-size: 14px; }
  .opt .type { font: 10px var(--font-mono); padding: 2px 6px; text-transform: uppercase; }
  .opt .n { font: 11.5px var(--font-mono); color: var(--text2); min-width: 48px; text-align: right; }
  .keep { display: flex; align-items: center; gap: 10px; font-size: 14px; cursor: pointer; }
  .keep input { accent-color: var(--accent); }
  .merge p { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--text2); }
  .merge b { color: var(--text); font-weight: 400; }
</style>
