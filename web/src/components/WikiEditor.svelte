<script lang="ts">
  import type { TagRef, TagSuggestion } from '@media-view/shared';
  import { tick } from 'svelte';
  import { client, unwrap } from '../api.ts';
  import { fmt } from '../media.ts';
  import { inkFor, tagTypeKey, tagTypes, typeColor, typeOf } from '../stores/tags.svelte.ts';
  import { resolveLinks, wikiLinks } from '../wiki.ts';
  import WikiArticle from './WikiArticle.svelte';

  /**
   * The wiki description editor (design M5 · 02): Markdown with a small toolbar, Edit / Split /
   * Preview, and tag-link suggestions after `[[`.
   */
  let {
    value = $bindable(),
    max,
    onmissing,
  }: {
    value: string;
    max: number;
    onmissing: (ref: string) => void;
  } = $props();

  type Mode = 'edit' | 'split' | 'preview';
  const MODE_KEY = 'mv.wikiEditorMode';
  let mode = $state<Mode>(readMode());
  let ta: HTMLTextAreaElement | undefined = $state();

  function readMode(): Mode {
    try {
      const m = localStorage.getItem(MODE_KEY);
      return m === 'edit' || m === 'preview' ? m : 'split';
    } catch {
      return 'split';
    }
  }
  function setMode(m: Mode) {
    mode = m;
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // not remembered
    }
  }

  // ── Link counts ──
  let links = $state(new Map<string, TagRef | null>());
  $effect(() => {
    const refs = wikiLinks(value).map((l) => l.ref);
    const t = setTimeout(() => resolveLinks(refs).then((r) => (links = r)).catch(() => {}), 250);
    return () => clearTimeout(t);
  });
  const linkCount = $derived(wikiLinks(value).length);
  const missing = $derived([...links].filter(([, t]) => !t).map(([ref]) => ref));

  // ── Editing helpers ──
  async function replace(start: number, end: number, text: string, selStart: number, selEnd = selStart) {
    value = value.slice(0, start) + text + value.slice(end);
    await tick();
    ta?.focus();
    ta?.setSelectionRange(selStart, selEnd);
    caretMoved();
  }

  function wrap(a: string, b: string) {
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    void replace(s, e, a + value.slice(s, e) + b, s + a.length, e + a.length);
  }

  function prefix(p: string) {
    if (!ta) return;
    const s = ta.selectionStart;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    if (value.startsWith(p, lineStart)) void replace(lineStart, lineStart + p.length, '', s - p.length);
    else void replace(lineStart, lineStart, p, s + p.length);
  }

  const tools: { label: string; tip: string; cls: string; run: () => void }[] = [
    { label: 'B', tip: 'Bold (Ctrl+B)', cls: 'b', run: () => wrap('**', '**') },
    { label: 'I', tip: 'Italic (Ctrl+I)', cls: 'i', run: () => wrap('*', '*') },
    { label: 'H', tip: 'Heading', cls: 'h', run: () => prefix('## ') },
    { label: '•', tip: 'List', cls: '', run: () => prefix('- ') },
    { label: '❝', tip: 'Quote', cls: '', run: () => prefix('> ') },
    { label: '[[ ]] Tag link', tip: 'Link a tag — or just type [[', cls: 'mono', run: () => { dismissedAt = -1; wrap('[[', ''); } },
  ];

  // ── [[ suggestions ──
  let caret = $state(0);
  let dismissedAt = $state(-1);
  let suggestions = $state<TagSuggestion[]>([]);
  let active = $state(0);

  function caretMoved() {
    caret = ta?.selectionStart ?? 0;
  }

  const query = $derived.by(() => {
    if (dismissedAt === caret) return null;
    const m = /\[\[([^\]\n|]*)$/.exec(value.slice(0, caret));
    return m ? m[1]! : null;
  });
  const typed = $derived.by(() => {
    if (query === null) return null;
    const m = /^([\p{L}\p{N}_-]+):(.*)$/u.exec(query);
    const t = m ? tagTypes.list.find((x) => x.key === m[1]!.toLowerCase()) : undefined;
    return t ? { typeId: t.id, text: m![2]! } : { typeId: null, text: query };
  });

  $effect(() => {
    const q = typed;
    if (!q || !q.text.trim()) {
      suggestions = [];
      return;
    }
    const t = setTimeout(() => {
      unwrap(client.api.tags.suggest.$get({ query: { q: q.text.trim(), limit: '12' } }))
        .then((r) => {
          suggestions = (q.typeId ? r.tags.filter((s) => s.typeId === q.typeId) : r.tags).slice(0, 6);
          active = 0;
        })
        .catch(() => (suggestions = []));
    }, 120);
    return () => clearTimeout(t);
  });

  function pick(s: TagSuggestion) {
    if (query === null) return;
    const start = caret - query.length - 2;
    // Whatever was already typed up to a closing ]] on this line is replaced too.
    const rest = /^[^\]\n]*\]\]/.exec(value.slice(caret));
    const end = caret + (rest ? rest[0].length : 0);
    const link = `[[${tagTypeKey(s)}:${s.name.replace(/ /g, '_')}]]`;
    void replace(start, end, link, start + link.length);
  }

  function key(e: KeyboardEvent) {
    const open = query !== null && suggestions.length > 0;
    if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length;
    } else if (open && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault();
      pick(suggestions[active]!);
    } else if (query !== null && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      dismissedAt = caret;
    } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'b' || e.key === 'i')) {
      e.preventDefault();
      if (e.key === 'b') wrap('**', '**');
      else wrap('*', '*');
    }
  }
</script>

<div class="editor">
  <div class="bar">
    <span class="title">Description</span>
    {#each tools as t (t.tip)}
      <button class="tool {t.cls}" title={t.tip} disabled={mode === 'preview'} onclick={t.run}>{t.label}</button>
    {/each}
    <div class="modes">
      {#each ['edit', 'split', 'preview'] as const as m (m)}
        <button class:on={mode === m} onclick={() => setMode(m)}>{m}</button>
      {/each}
    </div>
  </div>

  <div class="panes {mode}">
    {#if mode !== 'preview'}
      <div class="src">
        <textarea
          bind:this={ta}
          bind:value
          spellcheck="false"
          placeholder="Write about this tag. Link other tags with [[name]]."
          onkeydown={key}
          onkeyup={caretMoved}
          onclick={caretMoved}
          oninput={caretMoved}
          onblur={() => setTimeout(() => (dismissedAt = caret), 150)}
          onfocus={() => (dismissedAt = -1)}
        ></textarea>
        {#if query !== null && typed?.text.trim()}
          <div class="sugg">
            <span class="sh">Link a tag · [[{query}</span>
            {#each suggestions as s, i (s.id)}
              {@const c = typeColor(s.typeId)}
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
              <div class="srow" class:active={i === active} onmousedown={(e) => { e.preventDefault(); pick(s); }} onmouseenter={() => (active = i)}>
                <span class="sbar" style:background={c}></span>
                <span class="sname">{#if s.alias}<span class="alias">{s.alias} ⇒ </span>{/if}{s.name}</span>
                <span class="stype" style:background={c} style:color={inkFor(c)}>{typeOf(s.typeId)?.name}</span>
              </div>
            {/each}
            {#if suggestions.length === 0}
              <span class="snone">No tag “{typed.text.trim()}” — the link will show as missing until it’s created.</span>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
    {#if mode !== 'edit'}
      <div class="prev">
        <span class="ph">Preview</span>
        {#if value.trim()}
          <WikiArticle source={value} {onmissing} />
        {:else}
          <p class="empty">Nothing written yet.</p>
        {/if}
      </div>
    {/if}
  </div>

  <div class="foot">
    <span><b>{linkCount}</b> {linkCount === 1 ? 'link' : 'links'}</span>
    {#if missing.length}
      <span class="miss">
        <span class="amber">{missing.length} missing:</span>
        {#each missing as ref (ref)}
          <button onclick={() => onmissing(ref)}>{ref}</button>
        {/each}
      </span>
    {/if}
    <span class="count" class:over={value.length > max}>{fmt(value.length)} / {fmt(max)}</span>
    <span class="hint">**bold** · *italic* · ## heading · - list · &gt; quote · [[type:name|label]]</span>
  </div>
</div>

<style>
  .editor { flex: 1; min-height: 0; display: flex; flex-direction: column; min-width: 0; }
  .bar { display: flex; align-items: stretch; height: 40px; flex: none; border-bottom: 1px solid var(--line); font: 12px var(--font-mono); }
  .title { display: flex; align-items: center; padding: 0 16px; border-right: 1px solid var(--line); font: 700 16px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; }
  .tool { min-width: 40px; padding: 0 10px; border: none; border-right: 1px solid var(--line); background: none; color: var(--text); font: 15px/1 sans-serif; cursor: pointer; }
  .tool:hover:not(:disabled) { background: var(--surface2); }
  .tool:disabled { color: var(--text2); cursor: default; }
  .tool.b { font: 700 15px/1 var(--font-ui); }
  .tool.i { font: italic 15px/1 Georgia, serif; }
  .tool.h { font: 700 15px/1 var(--font-display); }
  .tool.mono { font: 12px var(--font-mono); }
  .modes { margin-left: auto; display: flex; border-left: 1px solid var(--line); }
  .modes button { padding: 0 12px; border: none; background: none; color: var(--text2); font: inherit; text-transform: uppercase; cursor: pointer; }
  .modes button.on { background: var(--text); color: var(--bg); }

  .panes { flex: 1; min-height: 0; display: grid; }
  .panes.split { grid-template-columns: 1fr 1fr; }
  .src { position: relative; display: flex; min-height: 0; min-width: 0; }
  .panes.split .src { border-right: 1px solid var(--line); }
  textarea { flex: 1; resize: none; padding: 18px 20px; border: none; background: var(--bg2); color: var(--text); font: 13.5px/1.65 var(--font-mono); outline: none; }
  .prev { overflow-y: auto; padding: 16px 24px 32px; min-width: 0; }
  .ph { display: block; margin-bottom: 10px; font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .empty { font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }

  .sugg { position: absolute; left: 16px; right: 16px; bottom: 16px; z-index: 5; display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--text); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6); }
  .sh { padding: 6px 10px; border-bottom: 1px solid var(--line); font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; overflow-wrap: anywhere; }
  .srow { display: flex; align-items: center; gap: 8px; height: 32px; padding-right: 10px; font-size: 13px; cursor: pointer; }
  .srow.active { background: var(--surface2); }
  .sbar { width: 4px; align-self: stretch; }
  .sname { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .alias { color: var(--text2); font-family: var(--font-mono); }
  .stype { padding: 2px 5px; font: 10px var(--font-mono); text-transform: uppercase; }
  .snone { padding: 8px 10px; font: 11.5px var(--font-mono); color: var(--amber); }

  .foot { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; min-height: 40px; padding: 6px 16px; flex: none; border-top: 1px solid var(--line); font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .foot b { color: var(--text); font-weight: 400; }
  .miss { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .amber { color: var(--amber); }
  .miss button { padding: 0; border: none; border-bottom: 1px dashed var(--amber); background: none; color: var(--amber); font: inherit; text-transform: none; cursor: pointer; }
  .count { margin-left: auto; }
  .count.over { color: var(--red); }
  .hint { text-transform: none; }
</style>
