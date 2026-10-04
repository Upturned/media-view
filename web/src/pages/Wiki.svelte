<script lang="ts">
  import { prettyFieldDate, type FieldDef, type FieldInput, type FieldValue, type ThumbRef, type WikiPage } from '@media-view/shared';
  import { ApiError, client, unwrap } from '../api.ts';
  import CreateLinkedTagDialog from '../components/CreateLinkedTagDialog.svelte';
  import FieldEditor from '../components/FieldEditor.svelte';
  import ImagePickerDialog, { type PickedImage, type PickTarget } from '../components/ImagePickerDialog.svelte';
  import TagChip from '../components/TagChip.svelte';
  import Thumb from '../components/Thumb.svelte';
  import WikiArticle from '../components/WikiArticle.svelte';
  import WikiEditor from '../components/WikiEditor.svelte';
  import { draftInput, draftOf, draftProblem, linkLabel, sameDraft, type FieldDraft } from '../fields.ts';
  import { registerKeys } from '../keymap.svelte.ts';
  import { fmt, viewerHref } from '../media.ts';
  import { href, navigate, router } from '../router.svelte.ts';
  import { ask } from '../stores/confirm.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { openOps } from '../stores/ops.svelte.ts';
  import { inkFor, typeColor, typeOf } from '../stores/tags.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';
  import { word } from '../themes/index.ts';

  /** A tag's wiki page (design M5 · 01 view, 02 edit). One edit mode: Save page or Discard. */

  const MAX_WIKI = 20_000;
  const id = $derived(Number(router.route.params.id));
  let page = $state<WikiPage | null>(null);
  let missing = $state(false);
  let editing = $state(false);
  let saving = $state(false);
  let creating = $state<string | null>(null);
  let picking = $state<string | null>(null);

  // ── Loading ──
  async function load() {
    try {
      page = await unwrap(client.api.tags[':id'].page.$get({ param: { id: String(id) } }));
      missing = false;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) missing = true;
      else toastError(err);
    }
  }

  $effect(() => {
    void live.files;
    // While editing, the draft stays as it is; the page reloads after saving or discarding.
    if (!editing) void load();
  });

  const color = $derived(page ? typeColor(page.typeId) : 'var(--line)');
  const type = $derived(page ? typeOf(page.typeId) : undefined);
  const valueOf = (fieldId: number): FieldValue | undefined => page?.values.find((v) => v.fieldId === fieldId);
  const shown = $derived(page ? page.fields.filter((f) => valueOf(f.id)) : []);
  const hiddenCount = $derived(page ? page.fields.length - shown.length : 0);

  function edited(at: number): string {
    const days = Math.floor((Date.now() - at) / 86_400_000);
    if (Date.now() - at < 60_000) return 'just now';
    if (days < 1) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;
    return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // ── Editing ──
  let desc = $state('');
  let cover = $state<ThumbRef | null>(null);
  let drafts = $state<Record<number, FieldDraft>>({});

  function startEditing() {
    if (!page) return;
    desc = page.description ?? '';
    cover = page.cover;
    drafts = Object.fromEntries(page.fields.map((f) => [f.id, draftOf(valueOf(f.id))]));
    editing = true;
  }

  const changedFields = $derived(
    page && editing ? page.fields.filter((f) => drafts[f.id] && !sameDraft(drafts[f.id]!, draftOf(valueOf(f.id)))) : [],
  );
  const dirty = $derived(
    !!page && editing && (desc.trim() !== (page.description ?? '') || (cover?.id ?? null) !== (page.cover?.id ?? null) || changedFields.length > 0),
  );
  const problems = $derived(
    page && editing ? page.fields.filter((f) => drafts[f.id] && draftProblem(f, drafts[f.id]!)).length + (desc.length > MAX_WIKI ? 1 : 0) : 0,
  );

  async function save() {
    if (!page || saving) return;
    if (problems) return toast('Fix the highlighted fields first.', 'error');
    if (!dirty) {
      editing = false;
      return;
    }
    saving = true;
    try {
      const fields: Record<string, FieldInput> = {};
      for (const f of changedFields) fields[f.id] = draftInput(f, drafts[f.id]!);
      page = await unwrap(client.api.tags[':id'].page.$put({
        param: { id: String(page.id) },
        json: {
          description: desc,
          ...((cover?.id ?? null) !== (page.cover?.id ?? null) ? { coverFileId: cover?.id ?? null } : {}),
          fields,
        },
      }));
      editing = false;
      toast('Page saved.');
    } catch (err) {
      toastError(err);
    } finally {
      saving = false;
    }
  }

  async function discard() {
    if (dirty) {
      const ok = await ask({
        title: 'Discard changes?',
        body: 'Your edits to this wiki page haven’t been saved.',
        button: 'Discard',
        tone: 'normal',
      });
      if (!ok) return;
    }
    editing = false;
  }

  // Leaving the app (or reloading) with unsaved edits asks first.
  $effect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });

  $effect(() => {
    if (editing) {
      return registerKeys('wiki', [
        { key: 'Ctrl+S', description: 'Save page', handler: () => void save(), inInputs: true },
        { key: 'Escape', description: 'Discard', handler: () => void discard() },
      ]);
    }
    return registerKeys('wiki', [
      { key: 'E', description: 'Edit page', handler: startEditing },
    ]);
  });

  // ── Images ──
  const imageFields = $derived(page ? page.fields.filter((f) => f.kind === 'image') : []);
  const pickTargets = $derived<PickTarget[]>([
    ...imageFields.map((f) => ({ key: String(f.id), label: f.label, current: drafts[f.id]?.file?.id ?? null })),
    { key: 'cover', label: 'Cover', current: cover?.id ?? null },
  ]);

  function usePicked(target: string, image: PickedImage | null) {
    if (target === 'cover') cover = image;
    else {
      const d = drafts[Number(target)];
      if (d) d.file = image;
    }
  }

  function fieldText(f: FieldDef, v: FieldValue): string {
    if (f.kind === 'number') return `${v.value}${f.options.unit ? ` ${f.options.unit}` : ''}`;
    if (f.kind === 'date') return prettyFieldDate(v.value ?? '');
    return v.value ?? '';
  }

  const listQuery = $derived(page ? { tag: page.id, sort: 'added' as const, order: 'desc' as const } : null);
</script>

<div class="wiki-page" class:editing>
  {#if missing}
    <p class="gone">This tag no longer exists. <a href={href('/tags')}>All tags</a></p>
  {:else if page && !editing}
    <!-- ───────── View ───────── -->
    <header class="head">
      <div class="edge" style:background={color}></div>
      <div class="cover">
        {#if page.cover}<Thumb file={page.cover} fit="cover" />{:else}<div class="nocover">No cover</div>{/if}
      </div>
      <div class="info">
        <div class="crumbs">
          <span class="type" style:background={color} style:color={inkFor(color)}>{type?.name}</span>
          <a href={href('/tags')}>Tags</a><span>/</span><span>{type?.name}</span><span>/</span><span class="here">Wiki</span>
        </div>
        <h1 class="display name">{page.name}</h1>
        {#if page.aliases.length}<span class="aka">also known as {#each page.aliases as a, i (a)}{#if i}, {/if}<b>{a}</b>{/each}</span>{/if}
        <div class="bottom">
          <div class="stat"><b>{fmt(page.count)}</b>{page.count === 1 ? word('image') : word('images')}</div>
          <span class="edited">page edited {edited(page.updatedAt)}</span>
          <div class="actions">
            <button class="hbtn" onclick={() => openOps({ kind: 'edit-tag', tagId: page!.id })}>Edit tag</button>
            <button class="hbtn primary" onclick={startEditing} title="Edit page (E)">✎ Edit page</button>
          </div>
        </div>
      </div>
    </header>

    <div class="body">
      <div class="main">
        {#if page.description}
          <WikiArticle source={page.description} onmissing={(ref) => (creating = ref)} />
        {:else}
          <div class="blank">
            <span>No wiki page yet.</span>
            <button class="hbtn" onclick={startEditing}>✎ Write it</button>
          </div>
        {/if}

        <section>
          <div class="sec"><span class="sh">Images</span><span class="sn">newest first</span></div>
          {#if page.preview.length}
            <div class="strip">
              {#each page.preview as f (f.id)}
                <a class="thumb" href={viewerHref(f.id, listQuery!)}><Thumb file={f} fit="cover" /></a>
              {/each}
              <a class="all" href={href(`/tags/${page.id}/images`)}><span class="display">See all →</span><span class="sn">{fmt(page.count)}</span></a>
            </div>
          {:else}
            <p class="none">No images with this tag yet.</p>
          {/if}
        </section>

        <div class="two">
          <section>
            <div class="sec minor"><span class="sh">Implies</span><span class="sn">added with this tag</span></div>
            <div class="chips">
              {#each page.implies as t (t.id)}<TagChip tag={t} />{:else}<span class="none">none</span>{/each}
            </div>
          </section>
          <section>
            <div class="sec minor"><span class="sh">Implied by</span><span class="sn">these add it</span></div>
            <div class="chips">
              {#each page.impliedBy as t (t.id)}<TagChip tag={t} implied />{:else}<span class="none">none</span>{/each}
            </div>
          </section>
        </div>

        <section>
          <div class="sec minor"><span class="sh">Related tags</span><span class="sn">most often on the same images</span></div>
          {#if page.related.length}
            <div class="related">
              {#each page.related as r (r.id)}
                {@const c = typeColor(r.typeId)}
                <a class="rel" href={href(`/tags/${r.id}`)} title="{r.name} · on {fmt(r.together)} of these images">
                  <span class="rbar" style:background={c}></span>
                  <span class="rname">{r.name}</span>
                  <span class="meter"><span style:width="{r.pct}%" style:background={c}></span></span>
                  <span class="pct">{r.pct}%</span>
                </a>
              {/each}
            </div>
          {:else}
            <p class="none">None yet — related tags come from images that share tags.</p>
          {/if}
        </section>
      </div>

      <aside class="fields" style:border-top-color={color}>
        <div class="fhead"><span class="fh">Info</span><span class="sn">{type?.name} fields</span></div>
        {#each shown as f (f.id)}
          {@const v = valueOf(f.id)!}
          <div class="frow">
            <span class="fname">{f.label}</span>
            <div class="fval">
              {#if f.kind === 'link'}
                <a class="flink" href={v.value} target="_blank" rel="noreferrer">{linkLabel(v.value ?? '')} ↗</a>
              {:else if f.kind === 'choice'}
                <span class="fchoice">{v.value}</span>
              {:else if f.kind === 'image' && v.file}
                <a class="fimg" href={viewerHref(v.file.id, { sort: 'name', order: 'asc' })} title={v.file.filename}><Thumb file={v.file} fit="cover" /></a>
                <span class="ffile">{v.file.filename}</span>
              {:else if f.kind === 'tagref'}
                <div class="frefs">
                  {#each v.tags as t, i (t.id)}
                    <div class="fref">{#if v.tags.length > 1}<span class="fn">{i + 1}</span>{/if}<TagChip tag={t} /></div>
                  {/each}
                </div>
              {:else}
                <span class:long={f.kind === 'longtext'}>{fieldText(f, v)}</span>
              {/if}
            </div>
          </div>
        {/each}
        {#if page.fields.length === 0}
          <p class="fnote">{type?.name} tags have no fields yet. <a href={href('/tag-types?tab=fields')}>Add them in Tag types →</a></p>
        {:else if hiddenCount}
          <p class="fnote">{hiddenCount} empty {hiddenCount === 1 ? 'field' : 'fields'} hidden</p>
        {/if}
      </aside>
    </div>
  {:else if page && editing}
    <!-- ───────── Edit ───────── -->
    <div class="ebar">
      <div class="estate">
        <span class="accent">✎ Editing wiki page</span>
        <span>{page.name}</span>
        <span class:bad={problems > 0} class:dim={!dirty}>· {problems ? `${problems} to fix` : dirty ? 'unsaved changes' : 'no changes'}</span>
      </div>
      <button class="ebtn" onclick={discard}>Discard</button>
      <button class="ebtn save" class:ready={dirty && !problems} disabled={saving} onclick={save} title="Save page (Ctrl+S)">Save page</button>
    </div>
    <div class="ecover">
      <div class="ethumb">{#if cover}<Thumb file={cover} fit="cover" />{/if}</div>
      <div class="etitle">
        <span class="display">{page.name}</span>
        <span class="sn">Name, type, aliases &amp; implications live in <button class="linkish" onclick={() => openOps({ kind: 'edit-tag', tagId: page!.id })}>Edit tag</button></span>
      </div>
      <button class="change" onclick={() => (picking = 'cover')}>Change cover…</button>
    </div>
    <div class="egrid">
      <div class="ecol">
        <WikiEditor bind:value={desc} max={MAX_WIKI} onmissing={(ref) => (creating = ref)} />
      </div>
      <div class="epanel">
        <div class="fhead"><span class="fh">Info fields</span><span class="sn">empty fields stay hidden on the page</span></div>
        <div class="escroll">
          {#each page.fields as f (f.id)}
            {#if drafts[f.id]}
              <FieldEditor field={f} bind:draft={drafts[f.id]!} selfId={page.id} onchooseimage={() => (picking = String(f.id))} />
            {/if}
          {:else}
            <p class="fnote">{type?.name} tags have no fields yet. <a href={href('/tag-types?tab=fields')} onclick={(e) => { if (dirty) { e.preventDefault(); toast('Save or discard the page first.'); } }}>Add them in Tag types →</a></p>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

{#if creating !== null}
  <CreateLinkedTagDialog ref={creating} onclose={() => (creating = null)} />
{/if}
{#if picking !== null && page}
  <ImagePickerDialog tag={page} targets={pickTargets} target={picking} onuse={usePicked} onclose={() => (picking = null)} />
{/if}

<style>
  .wiki-page { min-height: calc(100vh - 56px); display: flex; flex-direction: column; }
  .wiki-page.editing { height: calc(100vh - 56px); }
  .gone { padding: 32px; font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .gone a { color: var(--accent); }
  .sn { font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }

  /* View · header */
  .head { display: grid; grid-template-columns: 8px 210px minmax(0, 1fr); border-bottom: 1px solid var(--line); }
  .cover { margin: 24px 0 24px 28px; aspect-ratio: 4 / 5; background: var(--thumb); outline: 1px solid var(--line); overflow: hidden; }
  .nocover { width: 100%; height: 100%; display: grid; place-items: center; border: 1px dashed var(--line); font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .info { display: flex; flex-direction: column; gap: 12px; padding: 24px 40px 22px 32px; min-width: 0; }
  .crumbs { display: flex; align-items: center; gap: 10px; font: 11.5px var(--font-mono); text-transform: uppercase; color: var(--text2); }
  .crumbs a { color: var(--text2); text-decoration: none; }
  .crumbs a:hover, .crumbs .here { color: var(--text); }
  .type { padding: 3px 8px; font: 700 13px/1.1 var(--font-display); letter-spacing: 0.08em; }
  .name { font-size: clamp(48px, 7.5vw, 112px); line-height: 0.82; overflow-wrap: anywhere; }
  .aka { font-size: 15px; color: var(--text2); }
  .aka b { color: var(--text); font-weight: 400; }
  .bottom { display: flex; align-items: flex-end; gap: 28px; flex-wrap: wrap; margin-top: auto; }
  .stat { display: flex; flex-direction: column; gap: 2px; font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .stat b { font: 700 40px/1 var(--font-display); color: var(--text); }
  .edited { padding-bottom: 4px; font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .actions { margin-left: auto; display: flex; }
  .hbtn { height: 40px; padding: 0 16px; border: 1px solid var(--line); background: none; color: var(--text); font: 700 14px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; }
  .hbtn:hover { border-color: var(--text); }
  .hbtn.primary { padding: 0 18px; border: none; background: var(--accent); color: var(--accent-ink); }

  /* View · body */
  .body { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 48px; padding: 28px 40px 56px; }
  .main { display: flex; flex-direction: column; gap: 36px; min-width: 0; }
  .blank { display: flex; align-items: center; gap: 16px; padding: 22px; border: 1px dashed var(--line); font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  section { display: flex; flex-direction: column; gap: 12px; }
  .sec { display: flex; align-items: baseline; gap: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
  .sh { font: 700 22px/1 var(--font-display); text-transform: uppercase; }
  .sec.minor .sh { font-size: 18px; }
  .sec.minor { gap: 8px; }
  .none { margin: 0; font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .strip { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)) 120px; gap: 8px; }
  .thumb { aspect-ratio: 3 / 4; background: var(--thumb); outline: 1px solid var(--line); overflow: hidden; }
  .thumb:hover { outline: 2px solid var(--accent); }
  .all { grid-column: 8; display: flex; flex-direction: column; justify-content: flex-end; gap: 4px; padding: 10px; border: 1px solid var(--text); color: var(--text); text-decoration: none; }
  .all:hover { background: var(--surface); }
  .all .display { font-size: 22px; line-height: 0.95; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .related { display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; }
  .rel { display: grid; grid-template-columns: 4px minmax(0, 1fr) 120px 44px; align-items: center; gap: 10px; height: 34px; border-bottom: 1px solid var(--line); color: var(--text); text-decoration: none; }
  .rel:hover { background: var(--surface); }
  .rbar { align-self: stretch; }
  .rname { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meter { height: 4px; background: var(--surface2); }
  .meter span { display: block; height: 100%; }
  .pct { font: 11px var(--font-mono); color: var(--text2); text-align: right; }

  /* Info aside */
  .fields { align-self: start; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-top: 3px solid; }
  .fhead { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); flex: none; }
  .fh { font: 700 22px/1 var(--font-display); text-transform: uppercase; }
  .frow { display: grid; grid-template-columns: 118px minmax(0, 1fr); gap: 12px; padding: 9px 16px; border-bottom: 1px solid var(--line); }
  .fname { padding-top: 1px; font: 10.5px/1.5 var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .fval { min-width: 0; display: flex; flex-direction: column; gap: 6px; font-size: 14px; line-height: 1.45; overflow-wrap: anywhere; }
  .fval .long { white-space: pre-line; text-wrap: pretty; }
  .flink { font: 12.5px var(--font-mono); color: var(--text); }
  .fchoice { align-self: flex-start; padding: 2px 8px; border: 1px solid var(--text); font: 700 13px/1.3 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; }
  .fimg { width: 132px; aspect-ratio: 4 / 5; outline: 1px solid var(--line); overflow: hidden; }
  .ffile { font: 10.5px var(--font-mono); color: var(--text2); }
  .frefs { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .fref { display: flex; align-items: center; gap: 8px; }
  .fn { width: 14px; font: 10.5px var(--font-mono); color: var(--text2); }
  .fnote { margin: 0; padding: 9px 16px; font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .fnote a { color: var(--accent); }

  /* Edit */
  .ebar { height: 56px; flex: none; display: flex; align-items: stretch; border-bottom: 1px solid var(--line); background: color-mix(in oklab, var(--accent) 14%, var(--bg2)); }
  .estate { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 0 18px 0 40px; font: 12px var(--font-mono); text-transform: uppercase; white-space: nowrap; overflow: hidden; }
  .estate .accent { color: var(--accent); font-weight: 700; }
  .estate .bad { color: var(--red); }
  .estate .dim { color: var(--text2); }
  .ebtn { padding: 0 18px; border: none; border-left: 1px solid var(--line); background: none; color: var(--text); font: 700 15px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; }
  .ebtn.save { padding: 0 24px; background: var(--surface2); color: var(--text2); }
  .ebtn.save.ready { background: var(--accent); color: var(--accent-ink); }
  .ecover { display: flex; align-items: center; gap: 20px; padding: 14px 40px; border-bottom: 1px solid var(--line); flex: none; }
  .ethumb { width: 64px; height: 80px; flex: none; background: var(--thumb); outline: 1px solid var(--line); overflow: hidden; }
  .etitle { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .etitle .display { font-size: 48px; line-height: 0.85; overflow-wrap: anywhere; }
  .linkish { padding: 0; border: none; background: none; color: var(--text); font: inherit; text-transform: inherit; text-decoration: underline; cursor: pointer; }
  .change { margin-left: auto; height: 34px; padding: 0 14px; border: 1px solid var(--line); background: none; color: var(--text); font: 12px var(--font-mono); text-transform: uppercase; cursor: pointer; flex: none; }
  .change:hover { border-color: var(--text); }
  .egrid { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 460px; }
  .ecol { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-right: 1px solid var(--line); }
  .epanel { display: flex; flex-direction: column; min-height: 0; background: var(--surface); }
  .escroll { flex: 1; overflow-y: auto; overflow-x: hidden; }

  @media (max-width: 1100px) {
    .body { grid-template-columns: 1fr; }
    .egrid { grid-template-columns: 1fr; overflow-y: auto; }
    .ecol { min-height: 520px; }
    .strip { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .all { grid-column: auto; }
  }
</style>
