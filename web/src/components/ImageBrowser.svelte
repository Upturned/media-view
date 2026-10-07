<script lang="ts">
  import type { CollectionCount, CollectionRef, Crumb, FileItem, GroupedFileItem, SortKey } from '@media-view/shared';
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { client, unwrap } from '../api.ts';
  import { registerKeys } from '../keymap.svelte.ts';
  import { fmt, isGif, toParams, viewerHref, type ListQuery } from '../media.ts';
  import { navigate } from '../router.svelte.ts';
  import { collectionHref, removeFromCollection, reorder, setCollectionCover } from '../stores/collections.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { search, setQuery } from '../stores/search.svelte.ts';
  import { setDragPayload, startImport } from '../stores/imports.svelte.ts';
  import { openMenu, type MenuItem } from '../stores/menu.svelte.ts';
  import { openOps, openWith, recycleImages, setCover, setStar } from '../stores/ops.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';
  import { word } from '../themes/index.ts';
  import ListIcon from './ListIcon.svelte';
  import TagIndex from './TagIndex.svelte';
  import Thumb from './Thumb.svelte';

  /**
   * The image grid used by albums, the Inbox, "View all", Favorites, tag galleries, Search and
   * collection pages (technical doc §13.2 MediaGrid): toolbar, virtualized grid paged from the
   * server, selection and bulk actions. "Group by collection" splits it into sections (§11.3); on a
   * collection page it numbers the frames and reorders them by drag (design M6 · 02).
   */
  let {
    scope,
    where,
    coverTargets = [],
    addTo,
    collection,
    untaggedView = false,
    searchable = true,
    emptyText = 'Nothing here yet.',
    ontotal,
  }: {
    /** The folder (and whether to include everything under it), a tag, a collection; nothing = the whole library. */
    scope: { folder?: number; recursive?: boolean; tag?: number; favorites?: boolean; collection?: number; untagged?: boolean; fresh?: boolean };
    /** Whether the top-bar search filters this grid (and the index shows). */
    searchable?: boolean;
    /** The place, for dialogs: "Portraits", "all images in Fantasy". */
    where: string;
    /** Folders an image of this grid can be the cover of (its album and the folders above it). */
    coverTargets?: Crumb[];
    /** Where "+ Add images" puts files (albums and the Inbox only). */
    addTo?: { id: number; label: string };
    /** On a collection page: the list itself (own order, numbers, reorder, remove). */
    collection?: CollectionRef;
    /**
     * Library Health's untagged images as a grid (design M7 · 06): NEW marks, Mark as seen / Leave
     * untagged, and images that get tagged stay (dimmed) until Refresh, so the grid doesn't jump.
     */
    untaggedView?: boolean;
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
  const LIST_SORTS: { key: SortKey; label: string }[] = [
    { key: 'position', label: 'Collection order' },
    { key: 'name', label: 'Name' },
    { key: 'size', label: 'Size' },
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

  // svelte-ignore state_referenced_locally
  const inList = !!collection;
  const sortKey = inList ? 'list.sort' : 'grid.sort';
  const orderKey = inList ? 'list.order' : 'grid.order';

  let cols = $state(stored('grid.cols', 6));
  /** The remembered sort, if it's one this grid offers. */
  function initialSort(): SortKey {
    const s = stored<SortKey>(sortKey, inList ? 'position' : 'name');
    return (inList ? LIST_SORTS : SORTS).some((x) => x.key === s) ? s : inList ? 'position' : 'name';
  }
  let sort = $state<SortKey>(initialSort());
  let order = $state<'asc' | 'desc'>(stored(orderKey, 'asc'));
  let grouped = $state<boolean>(!inList && stored('grid.group', false));
  let favorites = $state(false);
  let showIndex = $state(stored('grid.index', true));
  $effect(() => store('grid.index', showIndex));
  let nameInput = $state('');
  let name = $state('');
  let seed = $state(Math.floor(Math.random() * 2_000_000_000) + 1);
  /** Sections shown in reverse (group by collection). */
  const reversed = new SvelteSet<number>();

  $effect(() => store('grid.cols', cols));
  $effect(() => store(sortKey, sort));
  $effect(() => store(orderKey, order));
  $effect(() => {
    if (!inList) store('grid.group', grouped);
  });

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
    collection: scope.collection,
    untagged: scope.untagged,
    fresh: scope.fresh,
    favorites: scope.favorites || favorites,
    q: searchable ? search.q : undefined,
    name,
    sort,
    // A collection's own order has no direction to flip.
    order: sort === 'position' ? 'asc' : order,
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
  /** Tags and collections in the search that don't exist (shown as a hint). */
  let unknown = $state<string[]>([]);
  let pages = $state<Record<number, (FileItem | GroupedFileItem)[]>>({});
  /** Group by collection: the sections, in the server's order (collections by name, then the rest). */
  let groupCounts = $state<{ collections: CollectionCount[]; none: number } | null>(null);
  let generation = 0;
  const loading = new Set<number>();
  let allIds: number[] | null = null;

  const requestParams = $derived({
    ...toParams(query),
    ...(grouped ? { group: 'collection' as const, ...(reversed.size ? { rev: [...reversed].join(',') } : {}) } : {}),
  });

  async function loadPage(p: number, gen: number) {
    if (loading.has(p)) return;
    loading.add(p);
    try {
      const r = await unwrap(client.api.files.$get({ query: { ...requestParams, offset: String(p * PAGE), limit: String(PAGE) } }));
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

  async function loadGroups(gen: number) {
    try {
      const r = await unwrap(client.api.files['collection-counts'].$get({ query: { ...toParams(query), by: 'name' } }));
      if (gen === generation) groupCounts = r;
    } catch (err) {
      if (gen === generation) toastError(err);
    }
  }

  // New query: start over. Changes elsewhere (scan, favorites): reload what's on screen without blanking.
  // Only the query and the live counter trigger this; everything else is read untracked.
  let lastKey = '';
  /** Untagged view: images that left the list since it loaded (tagged, set aside…), shown dimmed. */
  const stale = new SvelteSet<number>();
  let refreshes = $state(0);
  $effect(() => {
    void live.files;
    void refreshes;
    const key = JSON.stringify(requestParams);
    untrack(() => {
      const fresh = key !== lastKey;
      if (untaggedView && !fresh && lastKey) {
        void markStale();
        return;
      }
      stale.clear();
      lastKey = key;
      generation++;
      allIds = null;
      loading.clear();
      if (fresh) {
        pages = {};
        total = null;
        groupCounts = null;
        selected.clear();
        anchor = null;
        if (scroller) scroller.scrollTop = 0;
      }
      if (grouped) void loadGroups(generation);
      const keep = fresh ? [] : Object.keys(pages).map(Number);
      for (const p of keep.length ? keep : [0]) void loadPage(p, generation);
    });
  });

  // Grouped rows count an image once per section: the page's count comes from the plain list.
  let plainTotal = $state<number | null>(null);
  $effect(() => {
    void live.files;
    if (!grouped) return;
    const params = toParams(query);
    unwrap(client.api.files.$get({ query: { ...params, limit: '1' } }))
      .then((r) => (plainTotal = r.total))
      .catch(() => {});
  });
  $effect(() => {
    const n = grouped ? plainTotal : total;
    if (n !== null) ontotal?.(n);
  });

  async function markStale() {
    try {
      const now = new Set((await unwrap(client.api.files.ids.$get({ query: toParams(query) }))).ids);
      for (const page of Object.values(pages)) for (const item of page) if (!now.has(item.id)) stale.add(item.id);
    } catch {
      // keep what's shown
    }
  }

  function refresh() {
    lastKey = '';
    refreshes++;
  }

  async function untaggedAction(action: 'seen' | 'leave') {
    try {
      const chosen = (await ids()).filter((id) => selected.has(id));
      const r = await unwrap(client.api.health.untagged[action].$post({ json: { ids: chosen } }));
      toast(action === 'seen' ? `Marked ${fmt(r.changed)} as seen · NEW marks cleared` : `Left ${fmt(r.changed)} untagged · off this view`, 'info', {
        label: 'Undo',
        run: () => void unwrap(client.api.health.untagged[action === 'seen' ? 'seen' : 'put-back'].$post({ json: { ids: chosen } })).catch(toastError),
      });
      selected.clear();
    } catch (err) {
      toastError(err);
    }
  }

  const itemAt = (i: number): FileItem | GroupedFileItem | undefined => pages[Math.floor(i / PAGE)]?.[i % PAGE];

  // ─── Layout: only the rows in view exist in the DOM ────────────────────────

  let scroller: HTMLDivElement | undefined = $state();
  let width = $state(0);
  let height = $state(0);
  let scrollTop = $state(0);

  const PAD_X = 32;
  const PAD_TOP = inList ? 16 : 6;
  const GAP_X = 14;
  const GAP_Y = inList ? 20 : 18;
  /** Caption under the frame; collection pages add the album line. */
  const LABEL = inList ? 38 : 22;
  /** Group headers and the space around them. */
  const HEAD = 58;
  const HEAD_GAP = 14;

  const cellW = $derived(Math.max(60, (width - PAD_X * 2 - GAP_X * (cols - 1)) / cols));
  const stride = $derived(cellW * (2 / 3) + LABEL + GAP_Y);

  interface Section {
    group: CollectionCount | null;
    /** First flat index, and how many. */
    start: number;
    count: number;
    /** Pixel top of the header and of the first row. */
    top: number;
    rowsTop: number;
    rows: number;
  }

  /** One section for a plain grid; one per collection (+ the rest) when grouped. */
  const sections = $derived.by((): Section[] => {
    if (!grouped) {
      const count = (total ?? 0) + (dragIds ? 1 : 0);
      return [{ group: null, start: 0, count, top: 0, rowsTop: PAD_TOP, rows: Math.ceil(count / cols) }];
    }
    if (!groupCounts || total === null) return [];
    const list = [
      ...groupCounts.collections.filter((c) => c.count > 0).map((c) => ({ group: c as CollectionCount | null, count: c.count })),
      ...(groupCounts.none > 0 ? [{ group: null, count: groupCounts.none }] : []),
    ];
    let start = 0;
    let top = 0;
    return list.map((s) => {
      const rows = Math.ceil(s.count / cols);
      const sec = { ...s, start, top, rowsTop: top + HEAD + HEAD_GAP, rows };
      start += s.count;
      top = sec.rowsTop + rows * stride;
      return sec;
    });
  });
  const canvasHeight = $derived.by(() => {
    const last = sections[sections.length - 1];
    return last ? last.rowsTop + last.rows * stride + 100 : 0;
  });

  /** Flat indexes in view, with where each one goes. */
  const visible = $derived.by(() => {
    const out: { index: number; top: number; left: number }[] = [];
    const from = scrollTop - stride * 2;
    const to = scrollTop + height + stride * 2;
    for (const s of sections) {
      const end = s.rowsTop + s.rows * stride;
      if (end < from || s.rowsTop > to) continue;
      const firstRow = Math.max(0, Math.floor((from - s.rowsTop) / stride));
      const lastRow = Math.min(s.rows - 1, Math.ceil((to - s.rowsTop) / stride));
      for (let r = firstRow; r <= lastRow; r++) {
        for (let c = 0; c < cols; c++) {
          const local = r * cols + c;
          if (local >= s.count) break;
          out.push({ index: s.start + local, top: s.rowsTop + r * stride, left: PAD_X + c * (cellW + GAP_X) });
        }
      }
    }
    return out;
  });
  const visibleHeads = $derived(grouped ? sections.filter((s) => s.top + HEAD > scrollTop - HEAD && s.top < scrollTop + height) : []);
  /** The section under the top edge: its header stays pinned. */
  const pinned = $derived(grouped ? [...sections].reverse().find((s) => s.top < scrollTop) : undefined);

  // Load the pages that the visible range needs.
  $effect(() => {
    if (total === null || visible.length === 0) return;
    const need = new Set(visible.filter((v) => v.index < total!).map((v) => Math.floor(v.index / PAGE)));
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
      // Grouped rows don't match the list's order (an image can come twice): Shift just toggles.
      if (grouped) toggle(item.id, index);
      else {
        void selectRange(anchor ?? index, index);
        anchor ??= index;
      }
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

  async function bulk(action: 'star' | 'unstar' | 'move' | 'copy' | 'rename' | 'recycle' | 'tags' | 'collect' | 'unlist') {
    try {
      const files = await selection();
      if (files.length === 0) return;
      const ids = files.map((f) => f.id);
      if (action === 'star' || action === 'unstar') await setStar(ids, action === 'star');
      else if (action === 'tags') openOps({ kind: 'bulk-tag', files, where });
      else if (action === 'collect') openOps({ kind: 'add-to-collection', files, where });
      else if (action === 'unlist') {
        if (collection && (await removeFromCollection(collection, ids))) selected.clear();
      } else if (action === 'move' || action === 'copy') {
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
      { label: 'Add to collection…', action: () => openOps({ kind: 'add-to-collection', files: [item], where }) },
      ...(collection ? [{ label: 'Remove from collection', action: () => void removeFromCollection(collection, [item.id]) }] : []),
      { label: 'Rename…', action: () => openOps({ kind: 'rename-file', file: item, where }) },
      { label: 'Move…', action: () => openOps({ kind: 'transfer', mode: 'move', files: [item], from: where, currentFolderId: item.folderId }) },
      { label: 'Copy…', action: () => openOps({ kind: 'transfer', mode: 'copy', files: [item], from: where, currentFolderId: item.folderId }) },
      { label: item.favorited ? '☆ Unstar' : '★ Star', action: () => setStar([item.id], !item.favorited) },
      ...coverTargets.map((c, i) => ({ label: `Cover of ${c.name}`, separated: i === 0, action: () => setCover(c.id, c.name, item.id) })),
      ...(collection ? [{ label: `Cover of ${collection.name}`, separated: coverTargets.length === 0, action: () => void setCollectionCover(collection, item.id) }] : []),
      { label: selected.has(item.id) ? 'Deselect' : 'Select', separated: true, action: () => toggle(item.id, 0) },
      { label: 'Recycle', danger: true, action: () => void recycleImages([item]) },
    ];
    openMenu(e, item.filename, items);
  }

  // ─── Dragging: out of the grid (move), or within a collection (reorder) ────

  const filtered = $derived(favorites || !!name.trim() || (searchable && !!search.q.trim()));
  const canReorder = $derived(inList && sort === 'position' && !filtered);
  /** Images being reordered, in list order, and where they'd land. */
  let dragIds = $state<number[] | null>(null);
  let over = $state<number | 'end' | null>(null);

  function onDragStart(e: DragEvent, item: FileItem) {
    if (!e.dataTransfer) return;
    if (inList) {
      if (!canReorder) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-media-view-reorder', String(item.id));
      dragIds = [item.id];
      over = null;
      void ids().then((order) => {
        if (dragIds && selected.has(item.id)) dragIds = order.filter((id) => selected.has(id));
      });
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-media-view-files', String(item.id));
    if (selected.has(item.id) && selected.size > 1) {
      setDragPayload([{ id: item.id, filename: item.filename }]);
      void selection().then((files) => setDragPayload(files));
    } else setDragPayload([{ id: item.id, filename: item.filename }]);
  }

  function onDragOver(e: DragEvent, target: number | 'end') {
    if (!dragIds) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (target !== 'end' && dragIds.includes(target)) return;
    over = target;
  }

  /** Where the dragged images would land (0-based), when the order is known. */
  const landing = $derived.by(() => {
    if (!dragIds || over === null || !allIds) return null;
    const rest = allIds.filter((id) => !dragIds!.includes(id));
    const at = over === 'end' ? rest.length : rest.indexOf(over);
    return at < 0 ? null : at;
  });
  const pad = (n: number) => String(n).padStart(2, '0');
  const slotLabel = $derived(landing === null || !dragIds ? '' : dragIds.length > 1 ? `${pad(landing + 1)}–${pad(landing + dragIds.length)}` : pad(landing + 1));

  async function onDrop(e: DragEvent) {
    if (!dragIds || !collection) return;
    e.preventDefault();
    const moving = dragIds;
    const target = over;
    dragIds = null;
    over = null;
    if (target === null) return;
    const order = await ids();
    const rest = order.filter((id) => !moving.includes(id));
    const at = target === 'end' ? rest.length : rest.indexOf(target);
    await reorder(collection, moving, target === 'end' ? null : target, Math.max(0, at));
    selected.clear();
  }

  function onDragEnd() {
    setDragPayload([]);
    dragIds = null;
    over = null;
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

  const sortLabel = $derived((inList ? LIST_SORTS : SORTS).find((s) => s.key === sort)?.label ?? 'Name');

  /** The collection page's hint: how reordering works, or why it's off. */
  const hint = $derived.by((): { text: string; tone: 'dim' | 'accent'; action?: { label: string; run: () => void } } => {
    if (dragIds) {
      return { text: slotLabel ? `release to place ${dragIds.length > 1 ? `${dragIds.length} images` : 'it'} at ${slotLabel} · esc cancels` : `moving ${dragIds.length} · aim between two frames`, tone: 'accent' };
    }
    if (sort !== 'position') {
      return { text: `Sorted by ${sort === 'name' ? 'name' : 'size'} · reordering works only in collection order`, tone: 'dim', action: { label: '↺ Collection order', run: () => (sort = 'position') } };
    }
    if (filtered) {
      return {
        text: 'Filtered · clear filters to reorder',
        tone: 'dim',
        action: { label: '✕ Clear', run: () => { favorites = false; nameInput = ''; name = ''; if (searchable) setQuery(''); } },
      };
    }
    return { text: '↕ drag to reorder · a selection moves together', tone: 'dim' };
  });

  const unknownText = $derived.by(() => {
    const tags = unknown.filter((u) => !u.startsWith('@'));
    const lists = unknown.filter((u) => u.startsWith('@')).map((u) => u.slice(1));
    return [
      tags.length ? `No tag named ${tags.map((u) => `“${u}”`).join(', ')}` : '',
      lists.length ? `No collection named ${lists.map((u) => `“${u}”`).join(', ')}` : '',
    ].filter(Boolean).join(' · ');
  });
</script>

{#snippet head(s: Section)}
  {#if s.group}
    {@const g = s.group}
    <div class="ghead">
      <ListIcon size={14} />
      <span class="gtitle">{g.name}</span>
      <span class="gmeta">{fmt(g.count)} of these · the list holds {fmt(g.size)} · {reversed.has(g.id) ? 'list order, reversed' : 'list order'}</span>
      <a class="gopen" href={collectionHref(g.id)}>Open collection ↗</a>
      <button class="grev" class:on={reversed.has(g.id)} onclick={() => (reversed.has(g.id) ? reversed.delete(g.id) : reversed.add(g.id))}>
        ⇅ {reversed.has(g.id) ? 'Reversed' : 'Reverse'}
      </button>
    </div>
  {:else}
    <div class="ghead">
      <span class="gtitle none">Not in a collection</span>
      <span class="gmeta">the loners · sorted by {sortLabel.toLowerCase()}</span>
    </div>
  {/if}
{/snippet}

<div class="browser">
 <div class="main">
  <div class="toolbar">
    {#if inList}
      <span class="lbl">Sort</span>
      <div class="segwrap">
        <div class="seg">
          {#each LIST_SORTS as s (s.key)}
            <button class:on={sort === s.key} onclick={() => (sort = s.key)}>{s.label}</button>
          {/each}
        </div>
        {#if sort !== 'position'}
          <button class="segarrow" onclick={() => (order = order === 'asc' ? 'desc' : 'asc')} title={order === 'asc' ? 'Ascending' : 'Descending'}>{order === 'asc' ? '↑' : '↓'}</button>
        {/if}
      </div>
      <button class="tool fav" class:on={favorites} onclick={() => (favorites = !favorites)}>{favorites ? '★' : '☆'} Favorites</button>
      <input class="filter narrow" bind:value={nameInput} placeholder="name contains…" spellcheck="false" />
      <div class="hint" class:accent={hint.tone === 'accent'}>
        <span>{hint.text}</span>
        {#if hint.action}<button onclick={hint.action.run}>{hint.action.label}</button>{/if}
      </div>
    {:else}
      <button class="tool" onclick={cycleSort} title="Change the sort order"><span class="dim">Sort:</span> {sortLabel}</button>
      <button class="tool arrow" onclick={() => (order = order === 'asc' ? 'desc' : 'asc')} disabled={sort === 'random'}
        title={order === 'asc' ? 'Ascending' : 'Descending'}>{order === 'asc' ? '↑' : '↓'}</button>
      <div class="tool group">
        <span class="dim">Group</span>
        <div class="seg">
          <button class:on={!grouped} onclick={() => (grouped = false)}>None</button>
          <button class:on={grouped} onclick={() => (grouped = true)}>Collection</button>
        </div>
      </div>
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
    {/if}
    {#if untaggedView && stale.size}<button class="tool refresh" onclick={refresh} title="Take the tagged images out of this view">↻ Refresh · {fmt(stale.size)} done</button>{/if}
    {#if searchable}<button class="tool idx" class:on={showIndex} onclick={() => (showIndex = !showIndex)} title="Show or hide the index">Index</button>{/if}
    {#if addTo}<button class="add" onclick={pickAndAdd}>+ Add images</button>{/if}
  </div>
  {#if unknownText}
    <div class="unknown">{unknownText} — check the spelling, or pick one from the suggestions.</div>
  {/if}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scroller" bind:this={scroller} bind:clientWidth={width} bind:clientHeight={height}
    onscroll={() => (scrollTop = scroller!.scrollTop)} ondragover={(e) => dragIds && e.preventDefault()} ondrop={onDrop}>
    <div class="sprockets"></div>
    {#if total === 0}
      <div class="empty">
        <span class="display">{favorites || name || query.q ? 'No matches.' : emptyText}</span>
        {#if favorites || name || query.q}<span>Nothing matches the filters — loosen them.</span>{/if}
      </div>
    {:else}
      {#if pinned}
        <div class="pin">{@render head(pinned)}</div>
      {/if}
      <div class="canvas" style:height="{canvasHeight}px">
        {#each visibleHeads as s (s.group?.id ?? 'none')}
          <div class="ghead-at" style:top="{s.top}px">{@render head(s)}</div>
        {/each}
        {#each visible as v (v.index)}
          {@const item = itemAt(v.index)}
          {@const g = item && 'group' in item ? item : null}
          {#if dragIds && v.index === total}
            <div class="cell end" class:on={over === 'end'} style:top="{v.top}px" style:left="{v.left}px" style:width="{cellW}px"
              role="region" aria-label="Drop at the end" ondragover={(e) => onDragOver(e, 'end')}>
              <div class="frame endbox">{over === 'end' && slotLabel ? `drop → ${slotLabel}` : '→ to the end'}</div>
            </div>
          {:else if item}
            <a
              class="cell"
              class:selected={selected.has(item.id)}
              class:ghosted={dragIds?.includes(item.id)}
              class:stale={stale.has(item.id)}
              class:grab={canReorder}
              href={viewerHref(item.id, query)}
              title={item.filename}
              style:top="{v.top}px"
              style:left="{v.left}px"
              style:width="{cellW}px"
              onclick={(e) => onCellClick(e, item, v.index)}
              oncontextmenu={(e) => onCellContext(e, item)}
              draggable={!inList || canReorder ? 'true' : 'false'}
              ondragstart={(e) => onDragStart(e, item)}
              ondragover={(e) => onDragOver(e, item.id)}
              ondragend={onDragEnd}
            >
              <div class="frame">
                <div class="inner"><Thumb file={item} alt={item.filename} /></div>
                {#if inList || (g && g.group)}
                  <span class="num" class:big={inList} class:dim={inList && sort !== 'position'}>{pad(item.position ?? 0)}</span>
                {:else if isGif(item)}<span class="badge">GIF</span>{/if}
                {#if item.favorited}<span class="star">★</span>{/if}
                {#if untaggedView && item.isNew && !stale.has(item.id)}<span class="newb">NEW</span>{/if}
                {#if g && g.group && g.listed > 1}<span class="dup" title="On {g.listed} lists">{g.listed}×</span>{/if}
                {#if selected.has(item.id)}<div class="ring"></div>{/if}
                {#if dragIds && over === item.id}
                  <div class="slot"><span>{slotLabel ? `${dragIds.length > 1 ? `${dragIds.length} images` : 'drop'} → ${slotLabel}` : 'drop here'}</span></div>
                {/if}
              </div>
              <div class="caption">
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <span class="check" class:on={selected.has(item.id)}
                  onclick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(item.id, v.index); }}>
                  {selected.has(item.id) ? '✓' : ''}
                </span>
                {#if !inList && !(g && g.group)}<span class="frame-no">{v.index + 1}A</span>{/if}
                <span class="fname">{item.filename}</span>
              </div>
              {#if inList}<span class="where">{item.where ?? ''}</span>{/if}
            </a>
          {:else}
            <div class="cell placeholder" style:top="{v.top}px" style:left="{v.left}px" style:width="{cellW}px">
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
      {#if collection}<button class="unlist" onclick={() => bulk('unlist')}>− Remove from collection</button>{/if}
      <button onclick={() => bulk('tags')}># Tags…</button>
      {#if untaggedView}
        <button onclick={() => untaggedAction('seen')}>Mark as seen</button>
        <button onclick={() => untaggedAction('leave')}>Leave untagged</button>
      {/if}
      <button onclick={() => bulk('collect')}>+ Collection</button>
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
 {#if searchable && showIndex}<TagIndex {query} exclude={collection?.id} />{/if}
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
    text-transform: inherit;
    white-space: nowrap;
    cursor: pointer;
  }
  .tool:disabled { color: var(--line); cursor: default; }
  .dim { color: var(--text2); margin-right: 6px; }
  .arrow { width: 40px; justify-content: center; padding: 0; color: var(--accent); font-size: 15px; }
  .cols { padding: 0 12px; cursor: default; }
  .cols button { width: 24px; height: 24px; border: none; background: none; color: var(--text2); font: 700 11px var(--font-mono); cursor: pointer; }
  .cols button.on { background: var(--text); color: var(--bg); }
  .group { padding: 0 12px; gap: 8px; cursor: default; }
  .group .dim { margin-right: 0; }
  .seg { display: flex; border: 1px solid var(--line); }
  .seg button { height: 28px; padding: 0 10px; border: none; background: none; color: var(--text2); font: inherit; font-weight: 700; text-transform: uppercase; cursor: pointer; }
  .seg button.on { background: var(--text); color: var(--bg); }
  .lbl { display: flex; align-items: center; padding: 0 12px 0 16px; color: var(--text2); }
  .segwrap { display: flex; align-items: center; padding-right: 10px; border-right: 1px solid var(--line); }
  .segarrow { width: 30px; height: 28px; border: 1px solid var(--line); border-left: none; background: none; color: var(--accent); font: inherit; font-size: 15px; cursor: pointer; }
  .fav { font-weight: 700; color: var(--text2); }
  .fav.on { background: var(--accent2); color: #111; }
  .filter { flex: 1; min-width: 0; padding: 0 16px; border: none; background: none; color: var(--text); font: inherit; outline: none; text-transform: none; }
  .filter.narrow { flex: none; width: 170px; padding: 0 14px; border-right: 1px solid var(--line); }
  .hint { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 0 16px; color: var(--text2); font-size: 11px; }
  .hint.accent { color: var(--accent); }
  .hint span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hint button { flex: none; height: 26px; padding: 0 10px; border: 1px solid var(--line); background: none; color: var(--text); font: inherit; text-transform: uppercase; cursor: pointer; }
  .hint button:hover { border-color: var(--text); }
  .add { padding: 0 20px; border: none; background: var(--accent); color: var(--accent-ink); font: 700 15px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; white-space: nowrap; }
  .add:hover { filter: brightness(1.08); }

  .scroller { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--bg2); }
  .canvas { position: relative; }

  /* Group headers: in place, and the current one pinned to the top. */
  .ghead-at { position: absolute; left: 0; right: 0; }
  .pin { position: sticky; top: 0; z-index: 4; height: 0; }
  .ghead {
    height: 58px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 4px 32px 0;
    background: var(--bg);
    border-bottom: 1px solid var(--line);
    font: 11px var(--font-mono);
    color: var(--text2);
    text-transform: uppercase;
  }
  .gtitle { font: 700 26px/1 var(--font-display); color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .gtitle.none { color: var(--text2); }
  .gmeta { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gopen { margin-left: auto; flex: none; color: var(--accent); text-decoration: none; }
  .gopen:hover { color: var(--text); text-decoration: underline; }
  .grev { flex: none; height: 26px; padding: 0 10px; border: 1px solid var(--line); background: none; color: var(--text2); font: 700 11px var(--font-mono); text-transform: uppercase; cursor: pointer; }
  .grev.on { background: var(--text); color: var(--bg); }

  .cell { position: absolute; display: flex; flex-direction: column; gap: 6px; text-decoration: none; color: var(--text2); }
  .cell.grab { cursor: grab; }
  .cell.ghosted { opacity: 0.28; }
  .cell.stale { opacity: 0.35; }
  .newb { position: absolute; left: 0; bottom: 0; padding: 2px 6px; background: var(--accent2); color: #111; font: 700 10px/1.2 var(--font-mono); }
  .refresh { color: var(--accent); font-weight: 700; }
  .cell.ghosted .frame { outline: 1px dashed var(--text2); }
  .frame { position: relative; aspect-ratio: 3 / 2; background: var(--thumb); outline: 1px solid var(--line); }
  .cell:hover .frame { outline-color: var(--accent); }
  .placeholder .frame { background: none; outline: 1px dashed var(--line); }
  .inner { position: absolute; inset: 8px; }
  .badge { position: absolute; top: 0; left: 0; padding: 4px 6px; background: var(--accent); color: var(--accent-ink); font: 700 10px/1 var(--font-mono); }
  .num { position: absolute; top: 0; left: 0; padding: 3px 6px; background: var(--bg2); font: 700 15px/1 var(--font-display); color: var(--accent); }
  .num.big { padding: 4px 7px; font-size: 18px; }
  .num.dim { color: var(--text2); }
  .dup { position: absolute; right: 4px; bottom: 4px; padding: 1px 5px; background: var(--bg2); border: 1px solid var(--line); font: 10px var(--font-mono); color: var(--text2); }
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
  /* Reorder: the bar in front of the frame the images would land before. */
  .slot { position: absolute; inset: 0; pointer-events: none; background: color-mix(in oklab, var(--accent) 9%, transparent); }
  .slot::before { content: ''; position: absolute; left: -10px; top: -8px; bottom: -8px; width: 4px; background: var(--accent); }
  .slot span { position: absolute; left: 0; bottom: -18px; padding: 1px 5px; background: var(--accent); color: var(--accent-ink); font: 700 10px var(--font-mono); text-transform: uppercase; white-space: nowrap; }
  .endbox { display: grid; place-items: center; background: none; outline: 1px dashed var(--line); font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .end.on .endbox { outline-color: var(--accent); color: var(--accent); background: color-mix(in oklab, var(--accent) 9%, transparent); }

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
  .where { margin-top: -3px; font: 10px var(--font-mono); color: var(--text2); opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; }

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
    overflow-x: auto;
  }
  .bulk .count { display: flex; align-items: center; gap: 10px; padding: 0 24px; border-right: 2px solid #111; line-height: 1.2; flex: none; }
  .bulk .count .display { font-size: 34px; }
  .bulk button { flex: none; padding: 0 14px; border: none; border-right: 1px solid rgba(0, 0, 0, 0.25); background: none; color: #111; font: inherit; font-weight: 700; text-transform: inherit; cursor: pointer; white-space: nowrap; }
  .bulk button:hover { background: rgba(0, 0, 0, 0.08); }
  .bulk .unlist { background: rgba(0, 0, 0, 0.14); }
  .bulk .recycle { color: #8a0016; }
  .bulk .push { margin-left: auto; border-left: 1px solid rgba(0, 0, 0, 0.25); font-weight: 400; }
  .bulk .close { width: 60px; border-right: none; border-left: 2px solid #111; font-size: 16px; }
</style>
