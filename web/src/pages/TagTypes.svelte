<script lang="ts">
  import type { TagTypeInfo } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import CustomFields from '../components/CustomFields.svelte';
  import { href, navigate, router } from '../router.svelte.ts';
  import { loadTagTypes, inkFor, tagTypes } from '../stores/tags.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';

  /**
   * Tag types (user guide §4.9; design M4 · 04): rename, recolor, reorder, pick the default.
   * The Custom fields tab (design M5 · 04) defines the info fields of each type’s wiki pages.
   */

  const SWATCHES = ['#6B7A99', '#2E9E5B', '#B0487A', '#D08A1E', '#3B82C4', '#8E5BD6', '#C0392B', '#1F9E9E', '#7A8B2E', '#5C5C58'];
  const BUILT_IN = ['general', 'character', 'source', 'artist'];

  const tab = $derived(router.route.query.get('tab') === 'fields' ? 'fields' : 'types');
  let palette = $state<number | null>(null);
  let names = $state<Record<number, string>>({});

  async function run(call: () => Promise<unknown>, done?: string) {
    try {
      await call();
      await loadTagTypes();
      if (done) toast(done);
    } catch (err) {
      toastError(err);
    }
  }

  function rename(t: TagTypeInfo) {
    const name = (names[t.id] ?? t.name).trim();
    if (!name || name === t.name) return;
    void run(() => unwrap(client.api['tag-types'][':id'].$patch({ param: { id: String(t.id) }, json: { name } })));
  }

  function addType() {
    const used = new Set(tagTypes.list.map((t) => t.color.toLowerCase()));
    const color = SWATCHES.find((c) => !used.has(c.toLowerCase())) ?? SWATCHES[0]!;
    void run(() => unwrap(client.api['tag-types'].$post({ json: { name: 'New type', color } })), 'Type added — give it a name.');
  }
</script>

<div class="page types-page">
  <div class="crumbs"><a href={href('/tags')}>Tags</a><span>/</span><span class="here">Tag types</span></div>
  <header class="head">
    <h1 class="display title">Tag types</h1>
    <div class="tabs">
      <button class:on={tab === 'types'} onclick={() => navigate('/tag-types', { replace: true })}>Name · color · order</button>
      <button class:on={tab === 'fields'} onclick={() => navigate('/tag-types?tab=fields', { replace: true })}>Custom fields</button>
    </div>
    {#if tab === 'types'}
      <p>Every tag has exactly one type. The type sets its color, and the order here is the order types appear in sidebars, panels and the directory.</p>
      <button class="btn primary" onclick={addType}>+ New type</button>
    {/if}
  </header>

  {#if tab === 'fields'}
    <CustomFields />
  {:else}
  <div class="table">
    <div class="row th"><span>Order</span><span>Color</span><span>Name</span><span>Preview</span><span class="r">Tags</span><span class="c">Default</span><span></span></div>
    {#each tagTypes.list as t, i (t.id)}
      <div class="row">
        <div class="order">
          <span class="display n">{i + 1}</span>
          <div class="arrows">
            <button disabled={i === 0} onclick={() => run(() => unwrap(client.api['tag-types'][':id'].move.$post({ param: { id: String(t.id) }, json: { delta: -1 } })))}>▲</button>
            <button disabled={i === tagTypes.list.length - 1} onclick={() => run(() => unwrap(client.api['tag-types'][':id'].move.$post({ param: { id: String(t.id) }, json: { delta: 1 } })))}>▼</button>
          </div>
        </div>
        <div class="swatch-cell">
          <button class="swatch" style:background={t.color} onclick={() => (palette = palette === t.id ? null : t.id)} aria-label="Color"></button>
          {#if palette === t.id}
            <div class="palette">
              <div class="sw">
                {#each SWATCHES as c (c)}
                  <button style:background={c} class:cur={c.toLowerCase() === t.color.toLowerCase()} onclick={() => { palette = null; void run(() => unwrap(client.api['tag-types'][':id'].$patch({ param: { id: String(t.id) }, json: { color: c } }))); }} aria-label={c}></button>
                {/each}
              </div>
              <span>text ink picks itself</span>
            </div>
          {/if}
        </div>
        <div class="name">
          <input value={names[t.id] ?? t.name} oninput={(e) => (names[t.id] = (e.currentTarget as HTMLInputElement).value)} onblur={() => rename(t)} onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />
          {#if BUILT_IN.includes(t.key)}<span class="builtin">built-in</span>{/if}
          <span class="key" title="Used in searches as {t.key}:name">{t.key}:</span>
        </div>
        <div class="preview"><span class="chip" style:background={t.color} style:color={inkFor(t.color)}>{t.name.toLowerCase()} tag</span><span class="bar" style:background={t.color}></span></div>
        <span class="r mono">{t.tagCount}</span>
        <button class="default" onclick={() => !t.isDefault && run(() => unwrap(client.api['tag-types'][':id'].$patch({ param: { id: String(t.id) }, json: { isDefault: true } })), `New tags now default to ${t.name}.`)}>
          <span class="dot" class:on={t.isDefault}></span>{t.isDefault ? 'Default' : ''}
        </button>
        <button class="del" disabled={t.tagCount > 0 || t.isDefault}
          title={t.isDefault ? 'Pick another default type first.' : t.tagCount > 0 ? `${t.name} still has ${t.tagCount} tags. Move or delete them first.` : 'Delete this type'}
          onclick={() => run(() => unwrap(client.api['tag-types'][':id'].$delete({ param: { id: String(t.id) } })), `Deleted ${t.name}.`)}>Delete</button>
      </div>
    {/each}
    <p class="note">New tags get the default type unless typed as <b>type:name</b>. A type can only be deleted once it has no tags.</p>
  </div>
  {/if}
</div>

<style>
  .types-page { display: flex; flex-direction: column; gap: 10px; }
  .crumbs { display: flex; align-items: center; gap: 8px; font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .crumbs a { color: var(--text2); text-decoration: none; }
  .crumbs .here { color: var(--accent); }
  .head { display: flex; align-items: flex-end; gap: 28px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
  .title { font-size: clamp(56px, 7vw, 96px); line-height: 0.8; }
  .head p { margin: 0 0 4px; max-width: 520px; font-size: 14px; line-height: 1.5; color: var(--text2); }
  .head .btn { margin-left: auto; }
  .tabs { display: flex; flex: none; margin-bottom: 4px; border: 1px solid var(--line); font: 12px var(--font-mono); text-transform: uppercase; }
  .tabs button { padding: 7px 14px; border: none; background: none; color: var(--text2); font: inherit; text-transform: inherit; cursor: pointer; }
  .tabs button.on { background: var(--text); color: var(--bg); font-weight: 700; }

  .table { margin-top: 14px; }
  .row { position: relative; display: grid; grid-template-columns: 90px 76px minmax(0, 1fr) 220px 120px 150px 110px; align-items: center; min-height: 64px; padding: 0 16px; border-bottom: 1px solid var(--line); background: var(--bg); }
  .row.th { min-height: 34px; background: none; font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .r { text-align: right; }
  .c { text-align: center; }
  .order { display: flex; align-items: center; gap: 6px; }
  .n { font-size: 26px; color: var(--text2); width: 26px; }
  .arrows { display: flex; flex-direction: column; }
  .arrows button { width: 26px; height: 20px; border: 1px solid var(--line); background: none; color: var(--text); font: 10px sans-serif; cursor: pointer; }
  .arrows button + button { border-top: none; }
  .arrows button:disabled { color: var(--line); cursor: default; }
  .swatch { width: 44px; height: 30px; border: 1px solid var(--text); cursor: pointer; }
  .palette { position: absolute; left: 106px; top: 54px; z-index: 10; display: flex; flex-direction: column; gap: 8px; padding: 10px; background: var(--bg2); border: 1px solid var(--text); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6); }
  .sw { display: grid; grid-template-columns: repeat(5, 30px); gap: 6px; }
  .sw button { width: 30px; height: 30px; border: 1px solid var(--line); cursor: pointer; }
  .sw button.cur { border: 2px solid var(--text); }
  .palette span { font: 10px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .name { display: flex; align-items: center; gap: 10px; padding-right: 20px; }
  .name input { flex: 1; min-width: 0; height: 36px; padding: 0 10px; border: 1px solid var(--line); background: var(--bg2); color: var(--text); font: 700 20px/1 var(--font-display); letter-spacing: 0.04em; text-transform: uppercase; outline: none; }
  .name input:focus { border-color: var(--text); }
  .builtin, .key { font: 10px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .key { text-transform: none; }
  .preview { display: flex; align-items: center; gap: 6px; }
  .chip { padding: 3px 8px; font-size: 12.5px; }
  .bar { width: 4px; height: 22px; }
  .mono { font: 12px var(--font-mono); }
  .default { display: flex; align-items: center; justify-content: center; gap: 8px; border: none; background: none; color: var(--text2); font: 11px var(--font-mono); text-transform: uppercase; cursor: pointer; }
  .dot { width: 14px; height: 14px; border-radius: 50%; border: 1px solid var(--text); box-shadow: inset 0 0 0 3px var(--bg); }
  .dot.on { background: var(--accent); }
  .del { justify-self: end; height: 30px; padding: 0 12px; border: 1px solid var(--red); background: none; color: var(--red); font: 11px var(--font-mono); text-transform: uppercase; cursor: pointer; }
  .del:disabled { border-color: var(--line); color: var(--line); cursor: not-allowed; }
  .note { padding: 14px 16px; margin: 0; font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .note b { color: var(--text); font-weight: 400; text-transform: none; }
</style>
