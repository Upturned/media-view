<script lang="ts">
  import type { FieldDef, TagRef } from '@media-view/shared';
  import { prettyFieldDate, fieldNumber, isFieldDate, isFieldLink } from '@media-view/shared';
  import { draftProblem, isEmptyDraft, kindInfo, linkDomain, today, type FieldDraft } from '../fields.ts';
  import { inkFor, tagTypes, typeColor } from '../stores/tags.svelte.ts';
  import { toast } from '../stores/toasts.svelte.ts';
  import TagInput from './TagInput.svelte';
  import Thumb from './Thumb.svelte';

  /** One custom field on the wiki page editor (design M5 · 02), by kind. */
  let {
    field,
    draft = $bindable(),
    selfId,
    onchooseimage,
  }: {
    field: FieldDef;
    draft: FieldDraft;
    /** The tag being edited (it can't reference itself). */
    selfId: number;
    onchooseimage: () => void;
  } = $props();

  const info = $derived(kindInfo(field.kind));
  const empty = $derived(isEmptyDraft(field, draft));
  const problem = $derived(draftProblem(field, draft));
  const allowed = $derived(field.options.types?.length ? field.options.types : undefined);
  const multi = $derived(field.options.multi ?? false);
  const refPlaceholder = $derived(
    `add ${allowed ? allowed.map((id) => tagTypes.list.find((t) => t.id === id)?.name.toLowerCase()).filter(Boolean).join(' / ') + ' ' : ''}tag${multi ? ' · ordered' : ''}`,
  );

  function clear() {
    draft = { value: '', file: null, tags: [] };
  }

  function step(d: number) {
    const n = fieldNumber(draft.value) ?? 0;
    draft.value = String(Math.round((n + d) * 1e9) / 1e9);
  }

  function addRef(t: TagRef) {
    if (t.id === selfId) return toast('A tag can’t reference itself.', 'error');
    if (draft.tags.some((x) => x.id === t.id)) return;
    draft.tags = multi ? [...draft.tags, t] : [t];
  }

  function moveRef(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= draft.tags.length) return;
    const list = draft.tags.slice();
    [list[i], list[j]] = [list[j]!, list[i]!];
    draft.tags = list;
  }
</script>

<div class="row" class:bad={!!problem}>
  <div class="top">
    <span class="glyph">{info.glyph}</span>
    <span class="name">{field.label}</span>
    <span class="kind">{info.label}</span>
    {#if empty}<span class="hidden">hidden · empty</span>{/if}
    {#if !empty}<button class="clear" onclick={clear}>Clear</button>{/if}
  </div>

  {#if field.kind === 'text'}
    <input class="in" bind:value={draft.value} />
  {:else if field.kind === 'longtext'}
    <textarea class="in" rows="3" bind:value={draft.value}></textarea>
  {:else if field.kind === 'number'}
    <div class="box">
      <button onclick={() => step(-1)} aria-label="Less">−</button>
      <input bind:value={draft.value} inputmode="decimal" />
      <span class="unit">{field.options.unit || '—'}</span>
      <button onclick={() => step(1)} aria-label="More">+</button>
    </div>
  {:else if field.kind === 'date'}
    <div class="box">
      <input class="date" bind:value={draft.value} placeholder="YYYY-MM-DD" />
      <span class="pretty">{draft.value && isFieldDate(draft.value.trim()) ? prettyFieldDate(draft.value.trim()) : 'year, year-month or full date'}</span>
      <button class="today" onclick={() => (draft.value = today())}>Today</button>
    </div>
  {:else if field.kind === 'link'}
    <div class="box link">
      <input bind:value={draft.value} placeholder="https://" />
      {#if draft.value.trim() && isFieldLink(draft.value.trim())}
        <a href={draft.value.trim()} target="_blank" rel="noreferrer">{linkDomain(draft.value.trim())} ↗</a>
      {/if}
    </div>
  {:else if field.kind === 'choice'}
    <div class="choices">
      {#each field.options.choices ?? [] as c (c)}
        <button class:on={draft.value === c} onclick={() => (draft.value = draft.value === c ? '' : c)}>{c}</button>
      {/each}
      {#if !(field.options.choices ?? []).length}<span class="msg">No choices yet — add them in Tag types.</span>{/if}
    </div>
  {:else if field.kind === 'image'}
    <div class="image">
      {#if draft.file}
        <div class="pic"><Thumb file={draft.file} fit="cover" /></div>
      {:else}
        <div class="pic none">NONE</div>
      {/if}
      <div class="pick">
        <span class="file">{draft.file?.filename ?? 'No image chosen'}</span>
        <button onclick={onchooseimage}>Choose image…</button>
      </div>
    </div>
  {:else if field.kind === 'tagref'}
    <div class="refs">
      {#each draft.tags as t, i (t.id)}
        <div class="ref">
          <span class="n">{i + 1}</span>
          <span class="chip" style:background={typeColor(t.typeId)} style:color={inkFor(typeColor(t.typeId))}>{t.name}</span>
          <div class="arrows">
            <button disabled={i === 0} onclick={() => moveRef(i, -1)} aria-label="Up">▲</button>
            <button disabled={i === draft.tags.length - 1} onclick={() => moveRef(i, 1)} aria-label="Down">▼</button>
            <button class="x" onclick={() => (draft.tags = draft.tags.filter((x) => x.id !== t.id))} aria-label="Remove">✕</button>
          </div>
        </div>
      {/each}
      <div class="add">
        <TagInput placeholder={refPlaceholder} types={allowed} already={draft.tags.map((t) => t.id)} onpick={addRef} />
      </div>
    </div>
  {/if}

  {#if problem}<span class="msg err">{problem}</span>{/if}
</div>

<style>
  .row { display: flex; flex-direction: column; gap: 7px; padding: 12px 18px 14px; border-bottom: 1px solid var(--line); }
  .row.bad { background: color-mix(in oklab, var(--red) 6%, transparent); }
  .top { display: flex; align-items: center; gap: 8px; }
  .glyph { width: 22px; height: 18px; flex: none; display: grid; place-items: center; border: 1px solid var(--line); font: 10px var(--font-mono); color: var(--text2); }
  .name { font: 700 15px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; }
  .kind { font: 10px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .hidden { padding: 1px 5px; border: 1px dashed var(--line); font: 10px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .clear { margin-left: auto; padding: 0; border: none; background: none; color: var(--text2); font: 10.5px var(--font-mono); text-transform: uppercase; cursor: pointer; }
  .clear:hover { color: var(--text); }

  .in { padding: 0 10px; border: 1px solid var(--line); background: var(--bg2); color: var(--text); font: 14px var(--font-ui); outline: none; }
  input.in { height: 34px; }
  textarea.in { padding: 8px 10px; resize: vertical; line-height: 1.5; }
  .in:focus, .box:focus-within { border-color: var(--text); }
  .row.bad .in, .row.bad .box { border-color: var(--red); }

  .box { display: flex; align-items: stretch; height: 34px; border: 1px solid var(--line); background: var(--bg2); font: 13px var(--font-mono); }
  .box input { flex: 1; min-width: 0; padding: 0 10px; border: none; background: none; color: var(--text); font: inherit; outline: none; }
  .box input.date { flex: none; width: 130px; }
  .box button { width: 34px; border: none; background: none; color: var(--text); font: inherit; cursor: pointer; }
  .box button:first-child { border-right: 1px solid var(--line); }
  .box button:last-child { border-left: 1px solid var(--line); }
  .box button:hover { background: var(--surface2); }
  .unit, .pretty { display: flex; align-items: center; padding: 0 10px; border-left: 1px solid var(--line); color: var(--text2); }
  .pretty { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; }
  .box .today { width: auto; padding: 0 10px; color: var(--text2); font: 11px var(--font-mono); text-transform: uppercase; }
  .box.link { font-size: 12.5px; }
  .box.link a { display: flex; align-items: center; padding: 0 10px; border-left: 1px solid var(--line); color: var(--text2); white-space: nowrap; }

  .choices { display: flex; flex-wrap: wrap; gap: 4px; }
  .choices button { height: 30px; padding: 0 12px; border: 1px solid var(--line); background: none; color: var(--text); font: 700 13px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; }
  .choices button:hover { border-color: var(--text); }
  .choices button.on { border-color: var(--text); background: var(--text); color: var(--bg); }

  .image { display: flex; align-items: center; gap: 12px; }
  .pic { width: 64px; height: 80px; flex: none; outline: 1px solid var(--line); overflow: hidden; background: var(--thumb); }
  .pic.none { outline: none; border: 1px dashed var(--text2); display: grid; place-items: center; background: none; font: 10px var(--font-mono); color: var(--text2); }
  .pick { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .file { font: 11.5px var(--font-mono); color: var(--text2); overflow-wrap: anywhere; }
  .pick button { align-self: flex-start; height: 30px; padding: 0 12px; border: 1px solid var(--text); background: none; color: var(--text); font: 11.5px var(--font-mono); text-transform: uppercase; cursor: pointer; }
  .pick button:hover { background: var(--surface2); }

  .refs { display: flex; flex-direction: column; border: 1px solid var(--line); background: var(--bg2); }
  .ref { display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 0 6px 0 10px; border-bottom: 1px solid var(--line); }
  .n { width: 16px; font: 700 11px var(--font-mono); color: var(--accent); }
  .chip { padding: 2px 8px; font-size: 13px; overflow-wrap: anywhere; }
  .arrows { margin-left: auto; display: flex; }
  .arrows button { width: 24px; height: 24px; border: 1px solid var(--line); background: none; color: var(--text); font: 9px sans-serif; cursor: pointer; }
  .arrows button + button { border-left: none; }
  .arrows button:disabled { color: var(--line); cursor: default; }
  .arrows .x { border: none; color: var(--text2); font-size: 12px; }
  .add { padding: 4px 6px; }

  .msg { font: 11px var(--font-mono); color: var(--text2); }
  .msg.err { color: var(--red); }
</style>
