<script lang="ts">
  import { parseQuery, tagToken, type TagSuggestion } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import { registerKeys } from '../keymap.svelte.ts';
  import { fmt } from '../media.ts';
  import { navigate } from '../router.svelte.ts';
  import { library } from '../stores/library.svelte.ts';
  import { search } from '../stores/search.svelte.ts';
  import { inkFor, tagTypes, typeColor, typeKeys, typeOf } from '../stores/tags.svelte.ts';
  import { word } from '../themes/index.ts';

  /**
   * The top-bar search (design M4 · 01). On a page with a grid it filters that grid as you type
   * ("This album"); "Everywhere" — or any other page — opens the Search page on Enter.
   */

  let input: HTMLInputElement | undefined = $state();
  let open = $state(false);
  let suggestions = $state<TagSuggestion[]>([]);
  let active = $state(-1);

  const onGrid = $derived(search.context?.kind === 'grid');
  const live = $derived(search.context !== null && (search.context.kind === 'search' || search.scope === 'here'));

  // Filter the current grid as you type.
  $effect(() => {
    const draft = search.draft;
    if (!live) return;
    const t = setTimeout(() => (search.q = draft), 250);
    return () => clearTimeout(t);
  });

  /** The word being typed: its op and `#`, and what to look tags up by. */
  const current = $derived.by(() => {
    const m = /(\S*)$/.exec(search.draft)!;
    const raw = m[1]!;
    const op = raw.startsWith('-') ? 'never' : raw.startsWith('~') ? 'any' : 'must';
    const body = raw.replace(/^[-~]/, '').replace(/^#/, '');
    return { raw, start: m.index, op: op as 'must' | 'never' | 'any', body, isTag: raw.replace(/^[-~]/, '').startsWith('#') };
  });

  $effect(() => {
    const q = current.body;
    if (!open || !q || q.startsWith('"')) {
      suggestions = [];
      return;
    }
    const t = setTimeout(() => {
      unwrap(client.api.tags.suggest.$get({ query: { q, limit: '6' } }))
        .then((r) => {
          suggestions = r.tags;
          active = -1;
        })
        .catch(() => (suggestions = []));
    }, 100);
    return () => clearTimeout(t);
  });

  const parsed = $derived(parseQuery(search.draft, typeKeys()).filter((t) => t.kind === 'text' || t.name));
  const textTerm = $derived(current.raw && !current.isTag && !/^[-~]/.test(current.raw) ? current.raw : '');

  function pick(s: TagSuggestion) {
    const key = typeOf(s.typeId)?.key ?? null;
    search.draft = `${search.draft.slice(0, current.start)}${tagToken(current.op, key, s.name)} `;
    suggestions = [];
    input?.focus();
  }

  function submit() {
    open = false;
    if (search.context && (search.context.kind === 'search' || search.scope === 'here')) {
      search.q = search.draft;
      input?.blur();
      return;
    }
    navigate(`/search?q=${encodeURIComponent(search.draft.trim())}`);
    input?.blur();
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(suggestions.length - 1, active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(-1, active - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && suggestions[active]) pick(suggestions[active]!);
      else submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      open = false;
      input?.blur();
    }
  }

  $effect(() => registerKeys('global', [{ key: '/', description: 'Search', handler: () => input?.focus() }]));

  const placeholder = $derived(
    onGrid && search.scope === 'here' ? `search ${search.context!.label}, or #tag` : `search ${fmt(library.info?.stats.files ?? 0)} ${word('images')}, or #tag`,
  );
</script>

<div class="search" class:focus={open}>
  <span class="prompt">&gt;</span>
  <input
    bind:this={input}
    bind:value={search.draft}
    {placeholder}
    spellcheck="false"
    onfocus={() => (open = true)}
    onblur={() => setTimeout(() => (open = false), 150)}
    onkeydown={key}
  />
  {#if onGrid}
    <span class="scope">{search.scope === 'here' ? 'This page' : 'Everywhere'}</span>
  {/if}

  {#if open}
    <div class="drop">
      {#if parsed.length}
        <div class="reading">
          <span>Reading as</span>
          {#each parsed as t, i (i)}
            {#if t.kind === 'tag'}
              <span class="tok" style:border-color={t.op === 'never' ? 'var(--red)' : t.op === 'any' ? 'var(--blue)' : 'var(--text)'}>
                <b style:color={t.op === 'never' ? 'var(--red)' : t.op === 'any' ? 'var(--blue)' : 'var(--text)'}>{t.op === 'must' ? 'must' : t.op === 'never' ? 'never' : 'any of'}</b>
                {t.type ? `${t.type}:` : ''}{t.name}
              </span>
            {:else}
              <span class="tok" style:border-color="var(--line)"><b>{t.op === 'never' ? 'not' : 'text'}</b>“{t.value}”</span>
            {/if}
          {/each}
        </div>
      {/if}
      {#if textTerm}
        <button class="row text" onmousedown={(e) => { e.preventDefault(); submit(); }}>
          <span class="aa">Aa</span><span>“{textTerm}”</span><span class="dim">in file &amp; folder names</span>
        </button>
      {/if}
      {#each suggestions as s, i (s.id)}
        {@const c = typeColor(s.typeId)}
        <button class="row sugg" class:active={i === active} onmousedown={(e) => { e.preventDefault(); pick(s); }} onmouseenter={() => (active = i)}>
          <span class="bar" style:background={c}></span>
          <span class="name">{#if s.alias}<span class="alias">{s.alias} ⇒ </span>{/if}{s.name}</span>
          <span class="type" style:background={c} style:color={inkFor(c)}>{typeOf(s.typeId)?.name}</span>
          <span class="count">{fmt(s.count)}</span>
        </button>
      {/each}
      {#if onGrid}
        <div class="scopes">
          <button class:on={search.scope === 'here'} onmousedown={(e) => { e.preventDefault(); search.scope = 'here'; }}>
            <span class="label">This page</span><span class="sub">{search.context!.label}</span>
          </button>
          <button class:on={search.scope === 'everywhere'} onmousedown={(e) => { e.preventDefault(); search.scope = 'everywhere'; }}>
            <span class="label">Everywhere</span><span class="sub">the whole library · Enter opens Search</span>
          </button>
        </div>
      {/if}
      <div class="hint">
        <span><b>#tag</b> must</span><span><b class="red">-#tag</b> never</span><span><b class="blue">~#tag</b> any of</span><span><b>type:name</b></span>
        <span class="push">space ends a term — write <b>#red_dress</b> · F1 for more</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .search { position: relative; flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 0 18px; }
  .search.focus { background: var(--bg); box-shadow: inset 0 -2px 0 var(--accent); }
  .prompt { color: var(--accent); font: 700 13px var(--font-mono); }
  input { flex: 1; min-width: 0; height: 100%; border: none; background: none; color: var(--text); font: 14px var(--font-mono); outline: none; }
  .scope { flex: none; font: 10.5px var(--font-mono); padding: 3px 7px; border: 1px solid var(--line); color: var(--text2); text-transform: uppercase; }

  .drop {
    position: absolute;
    left: 0;
    top: 56px;
    z-index: 30;
    width: min(760px, 100%);
    display: flex;
    flex-direction: column;
    background: var(--bg2);
    border: 1px solid var(--text);
    border-top: none;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
  }
  .reading { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 10px 14px; border-bottom: 1px solid var(--line); font: 11px var(--font-mono); text-transform: uppercase; color: var(--text2); }
  .tok { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border: 1px solid; text-transform: none; color: var(--text); }
  .tok b { font-size: 10px; text-transform: uppercase; }
  .row { display: flex; align-items: center; gap: 10px; height: 38px; padding: 0 14px; border: none; border-bottom: 1px solid color-mix(in oklab, var(--line) 60%, transparent); background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
  .row.text { font: 13px var(--font-mono); }
  .row:hover, .row.active { background: var(--surface2); }
  .aa, .dim { color: var(--text2); }
  .dim { font-size: 11px; text-transform: uppercase; }
  .sugg { padding-left: 0; }
  .bar { width: 4px; align-self: stretch; }
  .name { flex: 1; min-width: 0; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .alias { color: var(--text2); font: 12.5px var(--font-mono); }
  .type { font: 10px var(--font-mono); padding: 2px 6px; text-transform: uppercase; }
  .count { font: 11.5px var(--font-mono); color: var(--text2); min-width: 56px; text-align: right; }
  .scopes { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--line); }
  .scopes button { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 10px 14px; border: none; border-right: 1px solid var(--line); background: none; color: var(--text2); text-align: left; cursor: pointer; }
  .scopes button.on { background: var(--text); color: var(--bg); }
  .scopes .label { font: 700 15px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; }
  .scopes .sub { font: 11px var(--font-mono); opacity: 0.8; }
  .hint { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; padding: 8px 14px; font: 10.5px var(--font-mono); color: var(--text2); }
  .hint b { color: var(--text); font-weight: 400; }
  .hint b.red { color: var(--red); }
  .hint b.blue { color: var(--blue); }
  .hint .push { margin-left: auto; }
</style>
