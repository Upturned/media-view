<script lang="ts">
  import { tagNameProblem, type TagDetail, type TagRef } from '@media-view/shared';
  import { ApiError, client, unwrap } from '../api.ts';
  import { fmt, formatDate } from '../media.ts';
  import { ask } from '../stores/confirm.svelte.ts';
  import { closeOps, openOps } from '../stores/ops.svelte.ts';
  import { inkFor, tagTypes, typeColor } from '../stores/tags.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';
  import DialogFrame from './DialogFrame.svelte';
  import TagInput from './TagInput.svelte';

  /**
   * Edit a tag (design M4 · 05): main name and type (saved together), aliases with "make main name",
   * implications (applied to existing images — asks above 30), merge into another tag, delete.
   */
  let { tagId }: { tagId: number } = $props();

  const ASK_ABOVE = 30;

  let tag = $state<TagDetail | null>(null);
  let name = $state('');
  let typeId = $state(0);
  let nameError = $state('');
  let aliasIn = $state('');
  let aliasError = $state('');
  let mergeTarget = $state<TagRef | null>(null);
  let confirmDelete = $state(false);
  let busy = $state(false);

  async function load() {
    try {
      tag = await unwrap(client.api.tags[':id'].$get({ param: { id: String(tagId) } }));
    } catch (err) {
      toastError(err);
      closeOps();
    }
  }
  $effect(() => {
    void load().then(() => {
      if (tag) {
        name = tag.name;
        typeId = tag.typeId;
      }
    });
  });

  const problem = $derived(tagNameProblem(name));
  const dirty = $derived(!!tag && (name.trim() !== tag.name || typeId !== tag.typeId));
  const color = $derived(typeColor(typeId));

  async function save() {
    if (!tag || !dirty || problem || busy) return;
    busy = true;
    try {
      tag = await unwrap(client.api.tags[':id'].$patch({ param: { id: String(tag.id) }, json: { name, typeId } }));
      name = tag.name;
      nameError = '';
      toast('Tag saved.');
    } catch (err) {
      if (err instanceof ApiError && err.status < 500) nameError = err.message;
      else toastError(err);
    } finally {
      busy = false;
    }
  }

  async function run(call: () => Promise<TagDetail>) {
    try {
      tag = await call();
    } catch (err) {
      toastError(err);
    }
  }

  async function addAlias(e: KeyboardEvent) {
    if (e.key !== 'Enter' || !tag || !aliasIn.trim()) return;
    e.preventDefault();
    try {
      tag = await unwrap(client.api.tags[':id'].aliases.$post({ param: { id: String(tag.id) }, json: { alias: aliasIn } }));
      aliasIn = '';
      aliasError = '';
    } catch (err) {
      aliasError = (err as Error).message;
    }
  }

  async function implication(other: TagRef, action: 'add' | 'remove') {
    if (!tag) return;
    const t = tag;
    const { affected } = await unwrap(client.api.tags[':id'].implications.impact.$get({
      param: { id: String(t.id) },
      query: { implied: String(other.id), action },
    }));
    if (affected > ASK_ABOVE) {
      const ok = await ask({
        tone: 'normal',
        title: action === 'add' ? `Tag ${fmt(affected)} images?` : `Untag ${fmt(affected)} images?`,
        sub: `${t.name} ${action === 'add' ? 'implies' : 'stops implying'} ${other.name}`,
        body: action === 'add'
          ? `Every image tagged ${t.name} also gets ${other.name} — ${fmt(affected)} images don’t have it yet.`
          : `${fmt(affected)} images have ${other.name} only because of ${t.name}; it comes off them.`,
        button: action === 'add' ? 'Add implication' : 'Remove implication',
      });
      if (!ok) return;
    }
    await run(() => action === 'add'
      ? unwrap(client.api.tags[':id'].implications.$post({ param: { id: String(t.id) }, json: { impliedId: other.id } }))
      : unwrap(client.api.tags[':id'].implications.remove.$post({ param: { id: String(t.id) }, json: { impliedId: other.id } })));
  }

  async function merge() {
    if (!tag || !mergeTarget) return;
    try {
      const into = await unwrap(client.api.tags.merge.$post({ json: { sourceIds: [tag.id], targetId: mergeTarget.id, keepAliases: true } }));
      toast(`Merged into ${into.name}. “${tag.name}” is now one of its aliases.`);
      openOps({ kind: 'edit-tag', tagId: into.id });
    } catch (err) {
      toastError(err);
    }
  }

  async function remove() {
    if (!tag) return;
    try {
      await unwrap(client.api.tags.delete.$post({ json: { ids: [tag.id] } }));
      toast(`Deleted “${tag.name}”.`);
      closeOps();
    } catch (err) {
      toastError(err);
    }
  }
</script>

{#if tag}
  <DialogFrame title="Edit tag · {tag.name}" sub="{fmt(tag.count)} {tag.count === 1 ? 'image' : 'images'} · created {formatDate(tag.createdAt).slice(0, 10)}" width={920} edge={color} onclose={closeOps}>
    <div class="cols">
      <div class="col">
        <div class="group">
          <span class="field-label">Main name</span>
          <input class="field" class:bad={!!(problem || nameError)} bind:value={name} spellcheck="false" oninput={() => (nameError = '')} onkeydown={(e) => e.key === 'Enter' && save()} />
          <span class="msg" class:bad={!!(problem || nameError)}>{problem || nameError || (dirty ? 'Unsaved — Save changes below.' : '')}</span>
        </div>
        <div class="group">
          <span class="field-label">Type</span>
          <div class="types">
            {#each tagTypes.list as t (t.id)}
              <button class:on={typeId === t.id} style:--c={t.color} style:--ink={inkFor(t.color)} onclick={() => (typeId = t.id)}>{t.name}</button>
            {/each}
          </div>
        </div>
        <div class="group">
          <span class="field-label">Aliases · also known as</span>
          <div class="aliases">
            {#each tag.aliases as a (a)}
              <div class="alias">
                <span>{a}</span>
                <button class="small" onclick={() => run(() => unwrap(client.api.tags[':id'].aliases.main.$post({ param: { id: String(tag!.id) }, json: { alias: a } })))}>Make main name</button>
                <button class="x" title="Remove alias" onclick={() => run(() => unwrap(client.api.tags[':id'].aliases.remove.$post({ param: { id: String(tag!.id) }, json: { alias: a } })))}>✕</button>
              </div>
            {/each}
            <div class="alias add"><span class="plus">+</span><input bind:value={aliasIn} placeholder="add alias, enter" spellcheck="false" onkeydown={addAlias} oninput={() => (aliasError = '')} /></div>
          </div>
          {#if aliasError}<span class="msg bad">{aliasError}</span>{/if}
        </div>
      </div>

      <div class="col">
        <div class="group">
          <span class="field-label">Implies · added automatically with this tag</span>
          <div class="chips">
            {#each tag.implies as t (t.id)}
              {@const c = typeColor(t.typeId)}
              <span class="chip" style:background={c} style:color={inkFor(c)}>{t.name}<button onclick={() => implication(t, 'remove')} title="Remove implication">✕</button></span>
            {:else}
              <span class="none">Nothing yet.</span>
            {/each}
          </div>
          <TagInput placeholder="+ tag it implies, enter" already={tag.implies.map((t) => t.id)} onpick={(t) => implication(t, 'add')} />
        </div>
        <div class="group">
          <span class="field-label">Implied by · set on those tags</span>
          <div class="chips dashed">
            {#each tag.impliedBy as t (t.id)}
              <button class="link" style:border-color={typeColor(t.typeId)} onclick={() => openOps({ kind: 'edit-tag', tagId: t.id })}>{t.name} ↗</button>
            {:else}
              <span class="none">No tag implies this one.</span>
            {/each}
          </div>
        </div>
        <div class="group merge">
          <span class="field-label">Merge into another tag</span>
          {#if mergeTarget}
            <div class="merge-box">
              <span>{fmt(tag.count)} images move to <b>{mergeTarget.name}</b>; “{tag.name}” becomes its alias.</span>
              <button class="small" onclick={() => (mergeTarget = null)}>Change</button>
              <button class="go" onclick={merge}>Merge</button>
            </div>
          {:else}
            <TagInput placeholder="find the tag to keep…" allowCreate={false} onpick={(t) => (mergeTarget = t.id === tag!.id ? null : t)} />
          {/if}
        </div>
      </div>
    </div>

    {#if confirmDelete}
      <div class="delete">
        <span>Delete “{tag.name}”? It’s removed from {fmt(tag.count)} {tag.count === 1 ? 'image' : 'images'} and its aliases stop working. The images stay.</span>
        <button class="small" onclick={() => (confirmDelete = false)}>Keep it</button>
        <button class="del" onclick={remove}>Delete tag</button>
      </div>
    {/if}

    {#snippet footer()}
      <button class="dbtn red-outline" onclick={() => (confirmDelete = true)}>Delete tag</button>
      <button class="dbtn push" onclick={closeOps}>{dirty ? 'Cancel' : 'Close'}</button>
      <button class="dbtn primary" disabled={!dirty || !!problem || busy} onclick={save}>Save changes</button>
    {/snippet}
  </DialogFrame>
{/if}

<style>
  .cols { display: grid; grid-template-columns: 1fr 1fr; }
  .col { display: flex; flex-direction: column; gap: 18px; padding: 18px 20px; min-width: 0; }
  .col + .col { border-left: 1px solid var(--line); }
  .group { display: flex; flex-direction: column; gap: 6px; }
  .types { display: flex; flex-wrap: wrap; gap: 4px; }
  .types button { height: 30px; padding: 0 12px; border: 1px solid var(--c); background: none; color: var(--text); font: 700 13px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; }
  .types button.on { background: var(--c); color: var(--ink); }
  .aliases { display: flex; flex-direction: column; border: 1px solid var(--line); }
  .alias { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 6px 0 10px; border-bottom: 1px solid var(--line); font: 12.5px var(--font-mono); }
  .alias:last-child { border-bottom: none; }
  .alias > span:first-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .alias.add { gap: 8px; }
  .alias input { flex: 1; border: none; background: none; color: var(--text); font: inherit; outline: none; }
  .plus { color: var(--accent); font-weight: 700; }
  .small { height: 24px; padding: 0 8px; border: 1px solid var(--line); background: none; color: var(--text); font: 10.5px var(--font-mono); text-transform: uppercase; cursor: pointer; white-space: nowrap; }
  .small:hover { border-color: var(--text); }
  .x { width: 24px; height: 24px; border: none; background: none; color: var(--text2); cursor: pointer; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px; border: 1px solid var(--line); min-height: 44px; align-items: center; }
  .chips.dashed { border-style: dashed; }
  .chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 4px 3px 8px; font-size: 12.5px; }
  .chip button { border: none; background: none; color: inherit; font-size: 11px; cursor: pointer; }
  .link { padding: 3px 8px; border: 1px solid; background: none; color: var(--text); font-size: 12.5px; cursor: pointer; }
  .none { font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .merge { margin-top: auto; padding-top: 14px; border-top: 1px solid var(--line); }
  .merge-box { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--accent); font-size: 13px; line-height: 1.4; }
  .merge-box > span { flex: 1; }
  .go { height: 28px; padding: 0 12px; border: none; background: var(--accent); color: var(--accent-ink); font: 700 11px var(--font-mono); text-transform: uppercase; cursor: pointer; }
  .delete { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-top: 1px solid var(--red); background: color-mix(in oklab, var(--red) 12%, var(--bg)); font-size: 14px; }
  .delete > span { flex: 1; }
  .del { height: 32px; padding: 0 14px; border: none; background: var(--red); color: #fff; font: 700 11px var(--font-mono); text-transform: uppercase; cursor: pointer; }
  :global(.dbtn.red-outline) { border-color: var(--red) !important; color: var(--red) !important; }
</style>
