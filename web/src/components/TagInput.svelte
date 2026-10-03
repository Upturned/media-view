<script lang="ts">
  import { tagNameProblem, type TagRef, type TagSuggestion } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import { fmt } from '../media.ts';
  import { defaultType, inkFor, tagTypes, typeColor, typeOf } from '../stores/tags.svelte.ts';
  import { toastError } from '../stores/toasts.svelte.ts';

  /**
   * Typing a tag (design M2 · 04 tag panel): suggestions with type colors and counts, aliases shown as
   * "alias ⇒ name", and "create … as [type ▾]" when nothing matches. `type:name` picks the type.
   */
  let {
    placeholder = 'tag it — type:name works',
    onpick,
    already = [],
    allowCreate = true,
    note,
  }: {
    placeholder?: string;
    onpick: (tag: TagRef) => void;
    /** Tags to mark as "ON IT" (already on the image). */
    already?: number[];
    allowCreate?: boolean;
    /** Extra text per suggestion (e.g. "on 3/12"). */
    note?: (tag: TagSuggestion) => string;
  } = $props();

  let value = $state('');
  let input: HTMLInputElement | undefined = $state();
  let suggestions = $state<TagSuggestion[]>([]);
  let active = $state(0);
  let open = $state(false);
  let createTypeId = $state<number | null>(null);

  // `character:frodo` → type Character, name frodo.
  const typed = $derived.by(() => {
    const m = /^#?([\p{L}\p{N}_-]+):(.*)$/u.exec(value.trim());
    const t = m ? tagTypes.list.find((x) => x.key === m[1]!.toLowerCase()) : undefined;
    return t ? { typeId: t.id, name: m![2]!.trim() } : { typeId: null, name: value.trim().replace(/^#/, '') };
  });
  const createAs = $derived(typeOf(createTypeId ?? typed.typeId ?? defaultType()?.id ?? 0) ?? defaultType());
  const exact = $derived(suggestions.some((s) => s.name.toLowerCase() === typed.name.replace(/_/g, ' ').toLowerCase() && (!typed.typeId || s.typeId === typed.typeId)));
  const showCreate = $derived(allowCreate && !!typed.name && !exact && !tagNameProblem(typed.name));

  $effect(() => {
    const q = value.trim();
    createTypeId = null;
    if (!q) {
      suggestions = [];
      return;
    }
    const t = setTimeout(() => {
      unwrap(client.api.tags.suggest.$get({ query: { q, limit: '8' } }))
        .then((r) => {
          suggestions = r.tags;
          active = 0;
        })
        .catch(() => (suggestions = []));
    }, 120);
    return () => clearTimeout(t);
  });

  function pick(tag: TagRef) {
    onpick(tag);
    value = '';
    suggestions = [];
  }

  async function create() {
    if (!showCreate || !createAs) return;
    try {
      const tag = await unwrap(client.api.tags.$post({ json: { name: typed.name, typeId: createAs.id } }));
      pick(tag);
    } catch (err) {
      toastError(err);
    }
  }

  function cycleType() {
    const list = tagTypes.list;
    const i = list.findIndex((t) => t.id === createAs?.id);
    createTypeId = list[(i + 1) % list.length]!.id;
  }

  function key(e: KeyboardEvent) {
    const rows = suggestions.length + (showCreate ? 1 : 0);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(rows - 1, active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, active - 1);
    } else if (e.key === 'Enter' || e.key === ',') {
      if (!value.trim()) return;
      e.preventDefault();
      const s = suggestions[active];
      if (s && !already.includes(s.id)) pick(s);
      else if (showCreate) void create();
      else if (s) pick(s);
    } else if (e.key === 'Escape') {
      // Esc leaves the field (so the page's keys work again). With text typed, it also clears it —
      // and stops there, so inside a dialog the first Esc doesn't close the dialog.
      if (value) {
        e.preventDefault();
        e.stopPropagation();
        value = '';
      }
      input?.blur();
    }
  }
</script>

<div class="box" class:open={open && (suggestions.length > 0 || showCreate)}>
  <div class="field">
    <span class="plus">+</span>
    <input bind:this={input} bind:value {placeholder} spellcheck="false" onkeydown={key} onfocus={() => (open = true)} onblur={() => setTimeout(() => (open = false), 150)} />
  </div>
  {#if open && (suggestions.length > 0 || showCreate)}
    <div class="list">
      {#each suggestions as s, i (s.id)}
        {@const c = typeColor(s.typeId)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="row" class:active={i === active} onmousedown={(e) => { e.preventDefault(); pick(s); }} onmouseenter={() => (active = i)}>
          <span class="bar" style:background={c}></span>
          <span class="name">{#if s.alias}<span class="alias">{s.alias} ⇒ </span>{/if}{s.name}</span>
          {#if already.includes(s.id)}<span class="on">ON IT</span>{/if}
          {#if note}<span class="on">{note(s)}</span>{/if}
          <span class="type" style:background={c} style:color={inkFor(c)}>{typeOf(s.typeId)?.name}</span>
          <span class="count">{fmt(s.count)}</span>
        </div>
      {/each}
      {#if showCreate && createAs}
        <div class="create" class:active={active === suggestions.length}>
          <span class="new">NEW:</span>
          <button onmousedown={(e) => { e.preventDefault(); void create(); }}>create “{typed.name.replace(/_/g, ' ')}” as</button>
          <button class="as" style:background={createAs.color} style:color={inkFor(createAs.color)} onmousedown={(e) => { e.preventDefault(); cycleType(); }}>{createAs.name} ▾</button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .box { position: relative; display: flex; flex-direction: column; border: 1px solid var(--text); background: var(--bg2); }
  .field { display: flex; align-items: center; gap: 8px; padding: 0 10px; }
  .plus { color: var(--accent); font: 700 13px var(--font-mono); }
  input { flex: 1; height: 36px; border: none; background: none; color: var(--text); font: 13px var(--font-mono); outline: none; min-width: 0; }
  .list { border-top: 1px solid var(--line); display: flex; flex-direction: column; }
  .row { display: flex; align-items: center; gap: 8px; height: 30px; padding-right: 10px; font-size: 12.5px; cursor: pointer; border-bottom: 1px solid color-mix(in oklab, var(--line) 60%, transparent); }
  .row.active { background: var(--surface2); }
  .bar { width: 4px; align-self: stretch; }
  .name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .alias { color: var(--text2); font-family: var(--font-mono); }
  .on { font: 10px var(--font-mono); color: var(--text2); }
  .type { font: 10px var(--font-mono); padding: 2px 5px; text-transform: uppercase; }
  .count { font: 11px var(--font-mono); color: var(--text2); min-width: 42px; text-align: right; }
  .create { display: flex; align-items: center; gap: 8px; padding: 8px 10px; font: 12px var(--font-mono); }
  .create.active { background: var(--surface2); }
  .new { color: var(--accent); }
  .create button { padding: 0; border: none; background: none; color: var(--text); font: inherit; cursor: pointer; text-decoration: underline; }
  .create .as { height: 22px; padding: 0 8px; text-decoration: none; font-weight: 700; text-transform: uppercase; }
</style>
