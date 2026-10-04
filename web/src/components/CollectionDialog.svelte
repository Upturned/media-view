<script lang="ts">
  import { collectionNameProblem, collectionToken, displayTagName, normTagName, type CollectionDetail, type CollectionRef } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import { fmt } from '../media.ts';
  import { navigate } from '../router.svelte.ts';
  import { ago } from '../stores/collections.svelte.ts';
  import { closeOps } from '../stores/ops.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';
  import CoverPickerDialog from './CoverPickerDialog.svelte';
  import DialogFrame from './DialogFrame.svelte';
  import Thumb from './Thumb.svelte';

  /** New / edit collection (design M6 · 03): name (unique), description, cover. */
  let { id, initialName = '' }: { id: number | null; initialName?: string } = $props();

  const DESCRIPTION_MAX = 500;
  const pad = (n: number) => String(n).padStart(2, '0');

  let detail = $state<CollectionDetail | null>(null);
  let others = $state<CollectionRef[]>([]);
  // svelte-ignore state_referenced_locally
  let name = $state(initialName);
  let description = $state('');
  /** null = the first image */
  let coverId = $state<number | null>(null);
  let coverThumb = $state<{ id: number; v: string; filename: string; position: number } | null>(null);
  let picking = $state(false);
  let busy = $state(false);
  let input: HTMLInputElement;

  $effect(() => {
    unwrap(client.api.collections.$get({ query: {} }))
      .then((r) => (others = r.collections.filter((c) => c.id !== id).map((c) => ({ id: c.id, name: c.name }))))
      .catch(toastError);
    if (id !== null) {
      unwrap(client.api.collections[':id'].$get({ param: { id: String(id) } }))
        .then((d) => {
          detail = d;
          name = d.name;
          description = d.description ?? '';
          coverId = d.coverFileId;
        })
        .catch(toastError);
    }
    input.focus();
  });

  // What the cover box shows: the chosen image, else the first one.
  $effect(() => {
    if (id === null) return;
    const chosen = coverId;
    const q = chosen === null ? { collection: String(id), sort: 'position', order: 'asc', limit: '1' } : null;
    if (q) {
      unwrap(client.api.files.$get({ query: q }))
        .then((r) => (coverThumb = r.items[0] ? { id: r.items[0].id, v: r.items[0].v, filename: r.items[0].filename, position: r.items[0].position ?? 1 } : null))
        .catch(toastError);
    } else if (chosen !== null) {
      unwrap(client.api.files[':id'].$get({ param: { id: String(chosen) } }))
        .then((f) => (coverThumb = { id: f.id, v: f.v, filename: f.filename, position: f.collections.find((c) => c.id === id)?.position ?? 1 }))
        .catch(toastError);
    }
  });

  const problem = $derived(collectionNameProblem(name));
  const clash = $derived(name.trim() ? others.find((c) => normTagName(c.name) === normTagName(name)) : undefined);
  const tooLong = $derived(description.length > DESCRIPTION_MAX);
  const valid = $derived(!problem && !clash && !tooLong);
  const editing = $derived(id !== null);
  const hasImages = $derived((detail?.count ?? 0) > 0);

  async function save() {
    if (!valid || busy) return;
    busy = true;
    try {
      if (id === null) {
        const c = await unwrap(client.api.collections.$post({ json: { name, description: description || null } }));
        closeOps();
        toast(`Created ${c.name}. Add images from any grid → + Collection.`);
        navigate(`/collections/${c.id}`);
      } else {
        await unwrap(client.api.collections[':id'].$patch({ param: { id: String(id) }, json: { name, description: description || null, coverFileId: coverId } }));
        closeOps();
      }
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
    }
  }

  function openClash() {
    if (!clash) return;
    closeOps();
    navigate(`/collections/${clash.id}`);
  }

  const coverText = $derived(
    !editing || !hasImages ? 'The first image you add becomes the cover. Choose… unlocks once the list has images.'
      : coverId !== null && coverThumb ? `Chosen: ${coverThumb.filename} (${pad(coverThumb.position)}). Stays the cover even if the order changes.`
      : `Follows the order: whatever is 01 is the cover.${coverThumb ? ` Now: ${coverThumb.filename}.` : ''}`,
  );
</script>

<DialogFrame
  title={editing ? 'Edit collection' : 'New collection'}
  sub={editing && detail ? `${fmt(detail.count)} ${detail.count === 1 ? 'image' : 'images'} · changed ${ago(detail.updatedAt)}` : 'a list — nothing is moved or copied'}
  width={640}
  onclose={closeOps}
>
  <form class="form" onsubmit={(e) => { e.preventDefault(); void save(); }}>
    <label class="fld">
      <span class="lbl">Name</span>
      <input bind:this={input} class="name" class:bad={!!clash || (name.trim() !== '' && !!problem)} bind:value={name} spellcheck="false" maxlength="120" />
      {#if clash}
        <span class="err">“{clash.name}” already exists. Names are unique — capitals and _ vs. space don’t count. <button type="button" class="link" onclick={openClash}>Open it →</button></span>
      {:else if name.trim() && problem}
        <span class="err">{problem}</span>
      {:else}
        <span class="hint">{name.trim() ? `Searchable as ${collectionToken('must', displayTagName(name))}` : 'Give it a name.'}</span>
      {/if}
    </label>

    <label class="fld">
      <span class="lbl row"><span>Description</span><span class:over={tooLong}>{fmt(description.length)} / {DESCRIPTION_MAX} · first line shows on the card</span></span>
      <textarea bind:value={description} rows="3" placeholder="What is this list for?"></textarea>
    </label>

    <div class="fld">
      <span class="lbl">Cover</span>
      <div class="cover-row">
        {#if editing && hasImages && coverThumb}
          <div class="cover"><Thumb file={coverThumb} fit="cover" /><span class="num">{pad(coverThumb.position)}</span></div>
        {:else}
          <div class="cover none">NONE YET</div>
        {/if}
        <div class="cover-side">
          <div class="seg">
            <button type="button" class:on={coverId === null} onclick={() => (coverId = null)}>First image</button>
            <button type="button" class:on={coverId !== null} disabled={!editing || !hasImages}
              title={editing && hasImages ? 'Pick one of this collection’s images' : 'Nothing to choose from yet'} onclick={() => (picking = true)}>Choose…</button>
          </div>
          <span class="cover-text">{coverText}</span>
        </div>
      </div>
    </div>
    <button type="submit" hidden aria-hidden="true"></button>
  </form>

  {#snippet footer()}
    <span class="foot">{editing ? 'Changes save on Save' : 'Starts empty · add from any grid'}</span>
    <button class="dbtn" onclick={closeOps}>Cancel</button>
    <button class="dbtn primary" disabled={!valid || busy} onclick={save}>{editing ? 'Save' : 'Create collection'}</button>
  {/snippet}
</DialogFrame>

{#if picking && id !== null}
  <CoverPickerDialog
    collection={{ id, name }}
    current={coverId}
    onuse={(fid) => { coverId = fid; picking = false; }}
    onclose={() => (picking = false)}
  />
{/if}

<style>
  .form { display: flex; flex-direction: column; gap: 20px; padding: 20px; }
  .fld { display: flex; flex-direction: column; gap: 7px; }
  .lbl { font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .lbl.row { display: flex; justify-content: space-between; gap: 12px; }
  .over { color: var(--red); }
  .name { height: 44px; padding: 0 12px; border: 1px solid var(--line); background: var(--bg2); color: var(--text); font: 700 22px/1 var(--font-display); letter-spacing: 0.03em; outline: none; }
  .name:focus { border-color: var(--text); }
  .name.bad { border-color: var(--red); }
  .err { font: 11.5px/1.5 var(--font-mono); color: var(--red); }
  .hint { font: 11.5px var(--font-mono); color: var(--text2); }
  .link { border: none; background: none; padding: 0; color: var(--text); font: inherit; text-decoration: underline; cursor: pointer; }
  textarea { resize: none; padding: 10px 12px; border: 1px solid var(--line); background: var(--bg2); color: var(--text); font: 14px/1.5 var(--font-ui); outline: none; }
  textarea:focus { border-color: var(--text); }

  .cover-row { display: flex; align-items: center; gap: 16px; }
  .cover { position: relative; width: 132px; height: 88px; flex: none; background: var(--thumb); outline: 1px solid var(--line); overflow: hidden; }
  .cover.none { display: grid; place-items: center; outline: none; border: 1px dashed var(--text2); background: none; font: 10px var(--font-mono); color: var(--text2); }
  .num { position: absolute; top: 0; left: 0; padding: 3px 6px; background: var(--bg2); font: 700 14px/1 var(--font-display); color: var(--accent); }
  .cover-side { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .seg { display: flex; align-self: flex-start; border: 1px solid var(--line); font: 12px var(--font-mono); text-transform: uppercase; }
  .seg button { padding: 7px 12px; border: none; background: none; color: var(--text2); font: inherit; font-weight: 700; text-transform: uppercase; cursor: pointer; }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg button.on { background: var(--text); color: var(--bg); }
  .seg button:disabled { opacity: 0.45; cursor: default; }
  .cover-text { font-size: 13px; line-height: 1.45; color: var(--text2); text-wrap: pretty; overflow-wrap: anywhere; }
  .foot { margin-right: auto; font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
</style>
