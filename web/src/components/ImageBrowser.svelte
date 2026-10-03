<script lang="ts">
  import type { Crumb, FileItem, SortKey } from '@media-view/shared';
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { client, unwrap } from '../api.ts';
  import { registerKeys } from '../keymap.svelte.ts';
  import { fmt, isGif, toParams, viewerHref, type ListQuery } from '../media.ts';
  import { navigate } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { search } from '../stores/search.svelte.ts';
  import { setDragPayload, startImport } from '../stores/imports.svelte.ts';
  import { openMenu, type MenuItem } from '../stores/menu.svelte.ts';
  import { openOps, openWith, recycleImages, setCover, setStar } from '../stores/ops.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';
  import { word } from '../themes/index.ts';
  import TagIndex from './TagIndex.svelte';
  import Thumb from './Thumb.svelte';

  /**
   * The image grid used by albums, the Inbox and "View all" (technical doc §13.2 MediaGrid):
   * toolbar, virtualized grid paged from the server, selection and bulk actions.
   */
  let {
    scope,
    where,
    coverTargets = [],
    addTo,
    searchable = true,
    emptyText = 'Nothing here yet.',
    ontotal,
  }: {
    /** The folder (and whether to include everything under it), or a tag; nothing = the whole library. */
    scope: { folder?: number; recursive?: boolean; tag?: number; favorites?: boolean };
    /** Whether the top-bar search filters this grid (and the tag index shows). */
    searchable?: boolean;
    /** The place, for dialogs: "Portraits", "all images in Fantasy". */
    where: string;
    /** Folders an image of this grid can be the cover of (its album and the folders above it). */
    coverTargets?: Crumb[];
    /** Where "+ Add images" puts files (albums and the Inbox only). */
    addTo?: { id: number; label: string };
    emptyText?: string;
    ontotal?: (total: number) => void;
  } = $props();

  // ─── Preferences (remembered) ──────────────────────────────────────────────

  const SORTS: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'modified', label: 'Date modified' },
    { key: 'added', label: 'Date added' },
    { key: 'size', label: 'File size' },
    { key: 'random', label: 'Random' },
  ];

  function stored<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }
  function store(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // private mode: preferences just aren't remembered
    }
  }

  let cols = $state(stored('grid.cols', 6));
  let sort = $state<SortKey>(stored('grid.sort', 'name'));
  let order = $state<'asc' | 'desc'>(stored('grid.order', 'asc'));
  let favorites = $state(false);
  let showIndex = $state(stored('grid.index', true));
  $effect(() => store('grid.index', showIndex));
  let nameInput = $state('');
  let name = $state('');
  let seed = $state(Math.floor(Math.random() * 2_000_000_000) + 1);

  $effect(() => store('grid.cols', cols));
  $effect(() => store('grid.sort', sort));
  $effect(() => store('grid.order', order));

  // Debounce the name filter.
  $effect(() => {
    const v = nameInput;
    const t = setTimeout(() => (name = v), 200);
    return () => clearTimeout(t);
  });

  const query: ListQuery = $derived({
    folder: scope.folder,
    recursive: scope.recursive,
    tag: scope.tag,
    favorites: scope.favorites || favorites,
    q: searchable ? search.q : undefined,
    name,
    sort,
    order,
    seed: sort === 'random' ? seed : undefined,
  });

  function cycleSort() {
    const i = SORTS.findIndex((s) => s.key === sort);
    sort = SORTS[(i + 1) % SORTS.length]!.key;
    if (sort === 'random') seed = Math.floor(Math.random() * 2_000_000_000) + 1;
  }

  // ─── Data: pages of PAGE items, loaded as they scroll into view ────────────

  const PAGE = 200;
  let total = $state<number | null>(null);
  /** Tags in the search that don't exist (shown as a hint). */
  let unknown = $state<string[]>([]);
  let pages = $state<Record<number, FileItem[]>>({});
  let generation = 0;
  const loading = new Set<number>();
  let allIds: number[] | null = null;

  async function loadPage(p: number, gen: number) {
    if (loading.has(p)) return;
    loading.add(p);
    try {
      const r = await unwrap(client.api.files.$get({ query: { ...toParams(query), offset: String(p * PAGE), limit: String(PAGE) } }));
      if (gen !== generation) return;
      pages[p] = r.items;
      total = r.total;
      if (p === 0) unknown = r.unknown;
    } catch (err) {
      if (gen === generation) toast((err as Error).message, 'error');
    } finally {
      loading.delete(p);
    }
  }

  // New query: start over. Changes elsewhere (scan, favorites): reload what's on screen without blanking.
  // Only the query and the live counter trigger this; everything else is read untracked.
  let lastKey = '';
  $effect(() => {
    void live.files;
    const key = JSON.stringify(toParams(query));
    untrack(() => {
      const fresh = key !== lastKey;
      lastKey = key;
      generation++;
      allIds = null;
      loading.clear();
      if (fresh) {
        pages = {};
        total = null;
        selected.clear();
        anchor = null;
        if (scroller) scroller.scrollTop = 0;
      }
      const keep = fresh ? [] : Object.keys(pages).map(Number);
      for (const p of keep.length ? keep : [0]) void loadPage(p, generation);
    });
  });

  $effect(() => {
    if (total !== null) ontotal?.(total);
  });

  const itemAt = (i: number): FileItem | undefined => pages[Math.floor(i / PAGE)]?.[i % PAGE];

  // ─── Layout: only the rows in view exist in the DOM ────────────────────────

  let scroller: HTMLDivElement | undefined = $state();
  let width = $state(0);
  let height = $state(0);
  let scrollTop = $state(0);

  const PAD_X = 32;
  const PAD_TOP = 6;
  const GAP_X = 14;
  const GAP_Y = 18;
  const LABEL = 22;

  const cellW = $derived(Math.max(60, (width - PAD_X * 2 - GAP_X * (cols - 1)) / cols));
  const stride = $derived(cellW * (2 / 3) + LABEL + GAP_Y);
  const rowCount = $derived(Math.ceil((total ?? 0) / cols));
  const firstRow = $derived(Math.max(0, Math.floor((scrollTop - PAD_TOP) / stride) - 2));
  const lastRow = $derived(Math.min(rowCount - 1, Math.ceil((scrollTop + height) / stride) + 2));
  const visible = $derived.by(() => {
    const out: number[] = [];
    for (let i = firstRow * cols; i < Math.min(total ?? 0, (lastRow + 1) * cols); i++) out.push(i);
    return out;
  });

  // Load the pages that the visible range needs.
  $effect(() => {
    if (total === null || visible.length === 0) return;
    const need = new Set(visible.map((i) => Math.floor(i / PAGE)));
    for (const p of need) if (!pages[p]) void loadPage(p, untrack(() => generation));
  });

  // ─── Selection ─────────────────────────────────────────────────────────────

  const selected = new SvelteSet<number>();
  let anchor: number | null = null;

  async function ids(): Promise<number[]> {
    if (!allIds) allIds = (await unwrap(client.api.files.ids.$get({ query: toParams(query) }))).ids;
    return allIds;
  }

  function toggle(id: number, index: number) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    anchor = index;
  }

  async function selectRange(from: number, to: number) {
    const list = await ids();
    for (let i = Math.min(from, to); i <= Math.max(from, to); i++) if (list[i] !== undefined) selected.add(list[i]!);
  }

  async function selectAll() {
    for (const id of await ids()) selected.add(id);
  }

  function onCellClick(e: MouseEvent, item: FileItem, index: number) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      toggle(item.id, index);
    } else if (e.shiftKey) {
      e.preventDefault();
      void selectRange(anchor ?? index, index);
      anchor ??= index;
    } else if (selected.size > 0) {
      // While selecting, a click adds to the selection instead of opening.
      e.preventDefault();
      toggle(item.id, index);
    }
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  /** The selection, in the grid's order, with names and stars (it may not all be loaded). */
  async function selection(): Promise<{ id: number; filename: string; favorited: boolean; folderId: number }[]> {
    const order = await ids();
    const chosen = order.filter((id) => selected.has(id));
    return (await unwrap(client.api.files.brief.$post({ json: { ids: chosen } }))).files;
  }

  async function bulk(action: 'star' | 'unstar' | 'move' | 'copy' | 'rename' | 'recycle' | 'tags') {
    try {
      const files = await selection();
      if (files.length === 0) return;
      const ids = files.map((f) => f.id);
      if (action === 'star' || action === 'unstar') await setStar(ids, action === 'star');
      else if (action === 'tags') openOps({ kind: 'bulk-tag', files, where });
      else if (action === 'move' || action === 'copy') {
        openOps({ kind: 'transfer', mode: action, files, from: where, currentFolderId: scope.recursive ? null : (scope.folder ?? null) });
      } else if (action === 'rename') {
        openOps({ kind: 'bulk-rename', files, where, order: `current sort order (${sortLabel.toLowerCase()} ${order === 'asc' ? '↑' : '↓'})` });
      } else if (await recycleImages(files)) selected.clear();
    } catch (err) {
      toastError(err);
    }
  }

  function onCellContext(e: MouseEvent, item: FileItem) {
    const items: MenuItem[] = [
      { label: 'Open', action: () => navigate(viewerHref(item.id, query)) },
      { label: 'Open with…', action: () => openWith(item.id) },
      { label: 'Tags…', separated: true, action: () => openOps({ kind: 'bulk-tag', files: [item], where }) },
      { label: 'Rename…', action: () => openOps({ kind: 'rename-file', file: item, where }) },
      { label: 'Move…', action: () => openOps({ kind: 'transfer', mode: 'move', files: [item], from: where, currentFolderId: item.folderId }) },
      { label: 'Copy…', action: () => openOps({ kind: 'transfer', mode: 'copy', files: [item], from: where, currentFolderId: item.folderId }) },
      { label: item.favorited ? '☆ Unstar' : '★ Star', action: () => setStar([item.id], !item.favorited) },
      ...coverTargets.map((c, i) => ({ label: `Cover of ${c.name}`, separated: i === 0, action: () => setCover(c.id, c.name, item.id) })),
      { label: selected.has(item.id) ? 'Deselect' : 'Select', separated: true, action: () => toggle(item.id, 0) },
      { label: 'Recycle', danger: true, action: () => void recycleImages([item]) },
    ];
    openMenu(e, item.filename, items);
  }

  // Drag images out of the grid: the selection if the dragged image is in it, else that image.
  function onDragStart(e: DragEvent, item: FileItem) {
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-media-view-files', String(item.id));
    if (selected.has(item.id) && selected.size > 1) {
      setDragPayload([{ id: item.id, filename: item.filename }]);
      void selection().then((files) => setDragPayload(files));
    } else setDragPayload([{ id: item.id, filename: item.filename }]);
  }

  async function pickAndAdd() {
    if (!addTo) return;
    try {
      const { paths } = await unwrap(client.api.system['pick-files'].$post({ json: { title: `Add images to ${addTo.label}` } }));
      startImport(addTo, paths);
    } catch (err) {
      toastError(err);
    }
  }

  $effect(() => {
    if (selected.size === 0) return;
    return registerKeys('grid', [{ key: 'Escape', description: 'Clear the selection', handler: () => selected.clear() }]);
  });

  const sortLabel = $derived(SORTS.find((s) => s.key === sort)!.label);
</script>

<div class="browser">
 <div class="main">
  <div class="toolbar">
    <button class="tool" onclick={cycleSort} title="Change the sort order"><span class="dim">Sort:</span> {sortLabel}</button>
    <button class="tool arrow" onclick={() => (order = order === 'asc' ? 'desc' : 'asc')} disabled={sort === 'random'}
      title={order === 'asc' ? 'Ascending' : 'Descending'}>{order === 'asc' ? '↑' : '↓'}</button>
    <div class="tool cols">
      <span class="dim">Cols</span>
      {#each { length: 9 } as _, i (i)}
        <button class:on={cols === i + 2} onclick={() => (cols = i + 2)}>{i + 2}</button>
      {/each}
    </div>
    {#if !scope.favorites}
      <button class="tool fav" class:on={favorites} onclick={() => (favorites = !favorites)}>{favorites ? '★' : '☆'} Starred only</button>
    {/if}
    <input class="filter" bind:value={nameInput} placeholder="name contains…" spellcheck="false" />
    {#if searchable}<button class="tool idx" class:on={showIndex} onclick={() => (showIndex = !showIndex)} title="Show or hide the tag index">Index</button>{/if}
    {#if addTo}<button class="add" onclick={pickAndAdd}>+ Add images</button>{/if}
  </div>
  {#if unknown.length}
    <div class="unknown">No tag named {unknown.map((u) => `“${u}”`).join(', ')} — check the spelling, or pick one from the suggestions.</div>
  {/if}

  <div class="scroller" bind:this={scroller} bind:clientWidth={width} bind:clientHeight={height}
    onscroll={() => (scrollTop = scroller!.scrollTop)}>
    <div class="sprockets"></div>
    {#if total === 0}
      <div class="empty">
        <span class="display">{favorites || name || query.q ? 'No matches.' : emptyText}</span>
        {#if favorites || name || query.q}<span>Nothing matches the filters — loosen them.</span>{/if}
      </div>
    {:else}
      <div class="canvas" style:height="{PAD_TOP + rowCount * stride + 100}px">
        {#each visible as index (index)}
          {@const item = itemAt(index)}
          {@const row = Math.floor(index / cols)}
          {@const col = index % cols}
          {#if item}
            <a
              class="cell"
              class:selected={selected.has(item.id)}
              href={viewerHref(item.id, query)}
              title={item.filename}
              style:top="{PAD_TOP + row * stride}px"
              style:left="{PAD_X + col * (cellW + GAP_X)}px"
              style:width="{cellW}px"
              onclick={(e) => onCellClick(e, item, index)}
              oncontextmenu={(e) => onCellContext(e, item)}
              draggable="true"
              ondragstart={(e) => onDragStart(e, item)}
              ondragend={() => setDragPayload([])}
            >
              <div class="frame">
                <div class="inner"><Thumb file={item} alt={item.filename} /></div>
                {#if isGif(item)}<span class="badge">GIF</span>{/if}
                {#if item.favorited}<span class="star">★</span>{/if}
                {#if selected.has(item.id)}<div class="ring"></div>{/if}
              </div>
              <div class="caption">
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <span class="check" class:on={selected.has(item.id)}
                  onclick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(item.id, index); }}>
                  {selected.has(item.id) ? '✓' : ''}
                </span>
                <span class="frame-no">{index + 1}A</span>
                <span class="fname">{item.filename}</span>
              </div>
            </a>
          {:else}
            <div class="cell placeholder" style:top="{PAD_TOP + row * stride}px" style:left="{PAD_X + col * (cellW + GAP_X)}px" style:width="{cellW}px">
              <div class="frame"></div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>

  {#if selected.size > 0}
    <div class="bulk">
      <div class="count"><span class="display">{fmt(selected.size)}</span><span>{selected.size === 1 ? word('image') : word('images')}<br />selected</span></div>
      <button onclick={() => bulk('tags')}># Tags…</button>
      <button onclick={() => bulk('star')}>★ Star</button>
      <button onclick={() => bulk('unstar')}>☆ Unstar</button>
      <button onclick={() => bulk('move')}>Move…</button>
      <button onclick={() => bulk('copy')}>Copy…</button>
      <button onclick={() => bulk('rename')}>Rename…</button>
      <button class="recycle" onclick={() => bulk('recycle')}>Recycle</button>
      <button class="push" onclick={selectAll}>Select all</button>
      <button class="close" onclick={() => selected.clear()} title="Clear the selection (Esc)">✕</button>
    </div>
  {/if}
 </div>
 {#if searchable && showIndex}<TagIndex {query} />{/if}
</div>

<style>
  .browser { flex: 1; min-height: 0; display: flex; }
  .main { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .idx { color: var(--text2); font-weight: 700; }
  .idx.on { color: var(--text); }
  .unknown { padding: 8px 16px; border-bottom: 1px solid var(--line); background: color-mix(in oklab, var(--amber) 12%, var(--bg)); font: 11.5px var(--font-mono); color: var(--amber); }

  .toolbar {
    display: flex;
    align-items: stretch;
    height: 44px;
    flex: none;
    border-bottom: 1px solid var(--line);
    font: 12px var(--font-mono);
    text-transform: uppercase;
  }
  .tool {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 16px;
    border: none;
    border-right: 1px solid var(--line);
    background: none;
    color: var(--text);
    font: inherit;
    white-space: nowrap;
    cursor: pointer;
  }
  .tool:disabled { color: var(--line); cursor: default; }
  .dim { color: var(--text2); margin-right: 6px; }
  .arrow { width: 40px; justify-content: center; padding: 0; color: var(--accent); font-size: 15px; }
  .cols { padding: 0 12px; cursor: default; }
  .cols button { width: 24px; height: 24px; border: none; background: none; color: var(--text2); font: 700 11px var(--font-mono); cursor: pointer; }
  .cols button.on { background: var(--text); color: var(--bg); }
  .fav { font-weight: 700; color: var(--text2); }
  .fav.on { background: var(--accent2); color: #111; }
  .filter { flex: 1; min-width: 0; padding: 0 16px; border: none; background: none; color: var(--text); font: inherit; outline: none; text-transform: none; }
  .add { padding: 0 20px; border: none; background: var(--accent); color: var(--accent-ink); font: 700 15px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; white-space: nowrap; }
  .add:hover { filter: brightness(1.08); }

  .scroller { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--bg2); }
  .canvas { position: relative; }

  .cell { position: absolute; display: flex; flex-direction: column; gap: 6px; text-decoration: none; color: var(--text2); }
  .frame { position: relative; aspect-ratio: 3 / 2; background: var(--thumb); outline: 1px solid var(--line); }
  .cell:hover .frame { outline-color: var(--accent); }
  .placeholder .frame { background: none; outline: 1px dashed var(--line); }
  .inner { position: absolute; inset: 8px; }
  .badge { position: absolute; top: 0; left: 0; padding: 4px 6px; background: var(--accent); color: var(--accent-ink); font: 700 10px/1 var(--font-mono); }
  .star { position: absolute; top: 2px; right: 6px; color: var(--accent2); font-size: 15px; }
  /* A hand-drawn grease-pencil circle around picked frames */
  .ring {
    position: absolute;
    inset: -9px -7px;
    border: 3px solid var(--accent2);
    border-radius: 48% 52% 45% 55% / 55% 42% 58% 45%;
    transform: rotate(-1.5deg);
    pointer-events: none;
  }

  .caption { display: flex; align-items: center; gap: 8px; height: 16px; font: 10.5px var(--font-mono); }
  .check {
    width: 12px;
    height: 12px;
    flex: none;
    border: 1px solid var(--text2);
    border-radius: 50%;
    cursor: pointer;
    font: 700 10px/12px sans-serif;
    text-align: center;
    opacity: 0;
  }
  .cell:hover .check, .check.on, .browser:has(.bulk) .check { opacity: 1; }
  .check.on { width: 14px; height: 14px; border: none; border-radius: 0; background: var(--accent2); color: #111; line-height: 14px; }
  .frame-no { color: var(--accent); font-weight: 700; }
  .fname { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .empty { display: flex; flex-direction: column; gap: 8px; padding: 60px 32px; font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .empty .display { font-size: 48px; color: var(--text); }

  .bulk {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    height: 60px;
    display: flex;
    align-items: stretch;
    background: var(--accent2);
    color: #111;
    font: 12px var(--font-mono);
    text-transform: uppercase;
  }
  .bulk .count { display: flex; align-items: center; gap: 10px; padding: 0 24px; border-right: 2px solid #111; line-height: 1.2; }
  .bulk .count .display { font-size: 34px; }
  .bulk button { padding: 0 16px; border: none; border-right: 1px solid rgba(0, 0, 0, 0.25); background: none; color: #111; font: inherit; font-weight: 700; cursor: pointer; }
  .bulk button:hover { background: rgba(0, 0, 0, 0.08); }
  .bulk .recycle { color: #8a0016; }
  .bulk .push { margin-left: auto; border-left: 1px solid rgba(0, 0, 0, 0.25); font-weight: 400; }
  .bulk .close { width: 60px; border-right: none; border-left: 2px solid #111; font-size: 16px; }
</style>
