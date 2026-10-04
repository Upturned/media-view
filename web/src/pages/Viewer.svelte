<script lang="ts">
  import type { FileDetail, FileItem, TagRef } from '@media-view/shared';
  import { onDestroy, tick, untrack } from 'svelte';
  import { ApiError, client, unwrap } from '../api.ts';
  import DescriptionEditor from '../components/DescriptionEditor.svelte';
  import TagChip from '../components/TagChip.svelte';
  import TagInput from '../components/TagInput.svelte';
  import KindIcon from '../components/KindIcon.svelte';
  import Thumb from '../components/Thumb.svelte';
  import { registerKeys } from '../keymap.svelte.ts';
  import { fileUrl, fmt, formatDate, formatSize, fromParams, toParams, viewerHref, type ListQuery } from '../media.ts';
  import { folderHref, goBack, href, navigate, router } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { openMenu } from '../stores/menu.svelte.ts';
  import { groupByType } from '../stores/tags.svelte.ts';
  import { openOps, openWith, recycleImages, setCover } from '../stores/ops.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';
  import { openDialog } from '../stores/ui.svelte.ts';

  /** The image viewer (user guide §4.5): prev / next follow the list it was opened from. */

  const id = $derived(Number(router.route.params.id));
  const query: ListQuery = $derived(fromParams(router.route.query));

  let file = $state<FileDetail | null>(null);
  let missing = $state(false);
  let position = $state<{ index: number; total: number } | null>(null);
  let strip = $state<FileItem[]>([]);
  let stripStart = $state(0);

  const STRIP = 13;

  /** The list to step through: the one we came from, or the file's own album. */
  const listQuery: ListQuery = $derived(
    query.folder !== undefined || !file ? query : { ...query, folder: file.folder.id },
  );

  $effect(() => {
    void live.files;
    const current = id;
    unwrap(client.api.files[':id'].$get({ param: { id: String(current) } }))
      .then((d) => {
        if (current !== id) return;
        file = d;
        missing = false;
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) missing = true;
        else toast((err as Error).message, 'error');
      });
  });

  // Where the file sits in the list, and the film strip around it.
  $effect(() => {
    if (!file) return;
    const q = listQuery;
    const current = file.id;
    void live.files;
    void (async () => {
      const pos = (await unwrap(client.api.files.locate.$get({ query: { ...toParams(q), id: String(current) } }))).position;
      if (current !== id) return;
      position = pos;
      if (!pos) {
        strip = [];
        return;
      }
      const start = Math.max(0, Math.min(pos.index - Math.floor(STRIP / 2), pos.total - STRIP));
      const r = await unwrap(client.api.files.$get({ query: { ...toParams(q), offset: String(start), limit: String(STRIP) } }));
      if (current !== id) return;
      stripStart = start;
      strip = r.items;
    })().catch((err: Error) => toast(err.message, 'error'));
  });

  async function itemAt(index: number): Promise<FileItem | undefined> {
    const local = strip[index - stripStart];
    if (local) return local;
    return (await unwrap(client.api.files.$get({ query: { ...toParams(listQuery), offset: String(index), limit: '1' } }))).items[0];
  }

  function show(target: FileItem | { id: number }) {
    navigate(viewerHref(target.id, listQuery).slice(1), { replace: true });
  }

  async function step(delta: number, wrap = false) {
    if (!position) return;
    let next = position.index + delta;
    if (next < 0 || next >= position.total) {
      if (!wrap) return;
      next = (next + position.total) % position.total;
    }
    const target = await itemAt(next);
    if (target) show(target);
  }

  async function random() {
    const r = await unwrap(client.api.files.random.$get({ query: { ...toParams(listQuery), exclude: String(id) } }));
    if (r.id) show({ id: r.id });
  }

  async function toggleFavorite() {
    if (!file) return;
    file = await unwrap(client.api.files[':id'].$patch({ param: { id: String(file.id) }, json: { favorited: !file.favorited } }));
  }

  async function saveDescription(text: string) {
    if (!file) return;
    try {
      file = await unwrap(client.api.files[':id'].$patch({ param: { id: String(file.id) }, json: { description: text } }));
    } catch (err) {
      toastError(err);
      throw err;
    }
  }

  /** "Set as cover of ▸": the album, every folder above it, and the image's tags (collections come later). */
  function coverMenu(e: MouseEvent) {
    if (!file) return;
    const f = file;
    const targets = [f.folder, ...[...f.ancestors].reverse()].filter((c) => c.kind !== 'inbox');
    openMenu(e, 'Set as cover of…', [
      ...targets.map((c) => ({ label: `${c.kind === 'album' ? 'Album' : c.kind === 'category' ? 'Category' : 'Sub-category'} · ${c.name}`, action: () => setCover(c.id, c.name, f.id) })),
      ...f.tags.map((t, i) => ({ label: `Tag · ${t.name}`, separated: i === 0, action: () => setTagCover(t, f.id) })),
    ]);
  }

  async function setTagCover(t: TagRef, fileId: number) {
    try {
      await unwrap(client.api.tags[':id'].$patch({ param: { id: String(t.id) }, json: { coverFileId: fileId } }));
      toast(`Cover of ${t.name} set.`);
    } catch (err) {
      toastError(err);
    }
  }

  // ─── Tags ──────────────────────────────────────────────────────────────────

  async function changeTags(add: number[], remove: number[]) {
    if (!file) return;
    try {
      await unwrap(client.api.files.tags.$post({ json: { ids: [file.id], add, remove } }));
      file = await unwrap(client.api.files[':id'].$get({ param: { id: String(file.id) } }));
    } catch (err) {
      toastError(err);
    }
  }

  const tagGroups = $derived(file ? groupByType(file.tags) : []);
  let tagsOpen = $state(true);
  let tagInput: TagInput | undefined = $state();

  /** T: straight to the tag field (opening the panel if needed); Esc goes back to the images. */
  async function focusTags() {
    if (fullscreen) return;
    panels = true;
    tagsOpen = true;
    await tick();
    tagInput?.focus();
  }

  async function recycle() {
    if (!file) return;
    const pos = position;
    if (!(await recycleImages([file]))) return;
    // Show the next image of the list (or the previous one at the end), else go back.
    if (pos && pos.total > 1) {
      const next = await itemAt(pos.index + 1 < pos.total ? pos.index + 1 : pos.index - 1);
      if (next && next.id !== id) return show(next);
    }
    back();
  }

  function back() {
    goBack(file ? folderHref(file.folder).slice(1) : '/images');
  }

  // Preload the next image so stepping feels instant.
  $effect(() => {
    if (!position || !strip.length) return;
    const next = strip[position.index + 1 - stripStart];
    if (next) new Image().src = fileUrl(next);
  });

  // ─── Zoom and pan ──────────────────────────────────────────────────────────

  let stageW = $state(0);
  let stageH = $state(0);
  let natW = $state(0);
  let natH = $state(0);
  /** null = fit to screen */
  let zoom = $state<number | null>(null);
  let panX = $state(0);
  let panY = $state(0);
  let dragging = $state(false);

  const MARGIN = 48;
  const fitScale = $derived(natW && natH ? Math.min(1, (stageW - MARGIN * 2) / natW, (stageH - MARGIN * 2) / natH) : 1);
  const scale = $derived(zoom ?? fitScale);
  const zoomLabel = $derived(zoom === null ? 'Fit' : `${scale.toFixed(scale < 1 ? 2 : 1)}×`);

  // New image: back to fit.
  $effect(() => {
    void id;
    untrack(() => {
      zoom = null;
      panX = 0;
      panY = 0;
      natW = 0;
      natH = 0;
    });
  });

  function onLoad(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    // SVGs without a size report 0: give them a square to fit.
    natW = img.naturalWidth || 1000;
    natH = img.naturalHeight || 1000;
  }

  function setZoom(next: number, cx = 0, cy = 0) {
    const clamped = Math.min(10, Math.max(0.1, next));
    // Keep the point under the cursor (cx, cy from the stage center) where it is.
    const ratio = clamped / scale;
    panX = cx - (cx - panX) * ratio;
    panY = cy - (cy - panY) * ratio;
    zoom = clamped;
  }

  function resetZoom() {
    zoom = null;
    panX = 0;
    panY = 0;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setZoom(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    dragging = true;
    const start = { x: e.clientX, y: e.clientY, px: panX, py: panY };
    const move = (m: PointerEvent) => {
      panX = start.px + m.clientX - start.x;
      panY = start.py + m.clientY - start.y;
    };
    const up = () => {
      dragging = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ─── Slideshow ─────────────────────────────────────────────────────────────

  function storedInterval(): number {
    try {
      const v = Number(localStorage.getItem('viewer.interval'));
      return v >= 1 && v <= 30 ? v : 5;
    } catch {
      return 5;
    }
  }
  let slideshow = $state(false);
  let interval = $state(storedInterval());

  $effect(() => {
    try {
      localStorage.setItem('viewer.interval', String(interval));
    } catch {
      // not remembered
    }
  });

  $effect(() => {
    if (!slideshow) return;
    void id;
    const t = setTimeout(() => void step(1, true), interval * 1000);
    return () => clearTimeout(t);
  });

  // ─── Fullscreen and panels ─────────────────────────────────────────────────

  let root: HTMLDivElement | undefined = $state();
  let fullscreen = $state(false);
  let panels = $state(true);
  let infoOpen = $state(true);

  function onFullscreenChange() {
    fullscreen = document.fullscreenElement === root;
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);
  onDestroy(() => {
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    if (document.fullscreenElement) void document.exitFullscreen();
  });

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root?.requestFullscreen();
  }

  // ─── Keys (user guide §4.5) ────────────────────────────────────────────────

  $effect(() =>
    registerKeys('viewer', [
      { key: 'ArrowLeft', description: 'Previous image', handler: () => void step(-1) },
      { key: 'ArrowRight', description: 'Next image', handler: () => void step(1) },
      { key: '+', description: 'Zoom in', handler: () => setZoom(scale * 1.25) },
      { key: '=', description: 'Zoom in', handler: () => setZoom(scale * 1.25) },
      { key: '-', description: 'Zoom out', handler: () => setZoom(scale / 1.25) },
      { key: '0', description: 'Reset zoom', handler: resetZoom },
      { key: 'F', description: 'Fullscreen', handler: toggleFullscreen },
      { key: 'R', description: 'Random image', handler: () => void random() },
      { key: 'S', description: 'Start / stop slideshow', handler: () => (slideshow = !slideshow) },
      { key: 'T', description: 'Type a tag (Esc goes back to the images)', handler: () => void focusTags() },
      {
        key: 'Escape',
        description: 'Exit fullscreen → stop slideshow',
        handler: () => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else if (slideshow) slideshow = false;
        },
      },
      { key: 'Backspace', description: 'Back to the previous page', handler: back },
    ]),
  );

  // ─── Labels ────────────────────────────────────────────────────────────────

  /** Where the list came from: a folder, Favorites, a tag, or a search. */
  const source = $derived(
    query.folder !== undefined ? 'folder' : query.favorites ? 'favorites' : query.tag !== undefined ? 'tag' : query.q ? 'search' : 'folder',
  );
  const backLabel = $derived(
    !file ? 'Back'
      : source === 'favorites' ? 'Favorites'
      : source === 'tag' ? 'Tag'
      : source === 'search' ? 'Search'
      : query.recursive && query.folder !== undefined ? 'All images' : file.folder.name,
  );
  const contextKind = $derived(
    source === 'favorites' ? 'in Favorites'
      : source === 'tag' ? 'with the tag'
      : source === 'search' ? 'in the search'
      : file?.folder.kind === 'inbox' ? 'in the Inbox' : query.recursive ? 'in a folder' : 'in album',
  );
  const dims = $derived(file?.width && file.height ? `${fmt(file.width)} × ${fmt(file.height)}` : natW ? `${fmt(natW)} × ${fmt(natH)}` : '—');
</script>

<div class="viewer" class:full={fullscreen} bind:this={root}>
  {#if !fullscreen}
    <header class="bar">
      <a class="logo" href={href('/')}><span class="mark"></span>MEDIA/VIEW</a>
      <button class="back" onclick={back}>← {backLabel}</button>
      <div class="spacer"></div>
      <button class="help" title="Help (F1)" onclick={() => openDialog('help')}>?</button>
    </header>
  {/if}

  <div class="body">
    <div class="main">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="stage" class:dragging bind:clientWidth={stageW} bind:clientHeight={stageH} onwheel={onWheel} onpointerdown={onPointerDown}>
        {#if missing}
          <div class="gone display">This image no longer exists.</div>
        {:else if file}
          <div class="position">
            <span class="display pos">{position ? `${position.index + 1} / ${position.total}` : '—'}</span>
            <span class="ctx">{contextKind}{#if source === 'folder'}<br /><b>{file.folder.name}</b>{/if}</span>
          </div>
          <img
            class="photo"
            src={fileUrl(file)}
            alt={file.filename}
            draggable="false"
            onload={onLoad}
            style:width="{natW * scale}px"
            style:height="{natH * scale}px"
            style:transform="translate(calc(-50% + {panX}px), calc(-50% + {panY}px))"
            style:visibility={natW ? 'visible' : 'hidden'}
          />
          <span class="caption">{file.ext.toUpperCase()} · {dims}{scale === 1 ? ' · natural size' : ''}</span>
        {/if}

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="controls" onpointerdown={(e) => e.stopPropagation()} onwheel={(e) => e.stopPropagation()}>
          <button onclick={() => setZoom(scale / 1.25)} title="Zoom out (−)">−</button>
          <button class="zoom" onclick={resetZoom} title="Reset (0)">{zoomLabel}</button>
          <button onclick={() => setZoom(scale * 1.25)} title="Zoom in (+)">+</button>
          <button class="show" class:on={slideshow} onclick={() => (slideshow = !slideshow)} title="Slideshow (S)">{slideshow ? '❚❚ Stop' : '▶ Slideshow'}</button>
          {#if slideshow}
            <div class="interval">
              <button onclick={() => (interval = Math.max(1, interval - 1))}>‹</button>
              <span>{interval}s</span>
              <button onclick={() => (interval = Math.min(30, interval + 1))}>›</button>
            </div>
          {/if}
          <button onclick={random} title="Random (R)">⚄ Random</button>
          <button onclick={toggleFullscreen} title="Fullscreen (F)">{fullscreen ? '⤡ Exit' : '⤢ Full'}</button>
          {#if !fullscreen}
            <button onclick={() => (panels = !panels)}>{panels ? 'Info ⟩' : '⟨ Info'}</button>
          {/if}
        </div>

        {#if fullscreen}
          <span class="full-hint">Fullscreen · Esc to exit · ← → to step</span>
        {/if}
        {#if slideshow}
          {#key `${id}-${interval}`}
            <div class="progress"><div style:animation-duration="{interval}s"></div></div>
          {/key}
        {/if}
      </div>

      {#if !fullscreen}
        <div class="filmstrip">
          <div class="holes"></div>
          <div class="frames">
            <button class="nav" onclick={() => step(-1)} title="Previous (←)" disabled={!position || position.index === 0}>◀</button>
            {#each strip as s, k (s.id)}
              {@const n = stripStart + k + 1}
              <button class="frame" class:on={s.id === id} onclick={() => show(s)} title={s.filename}>
                <Thumb file={s} fit="cover" />
                <span class="n">{s.id === id ? `${n}A` : n}</span>
              </button>
            {/each}
            <button class="nav" onclick={() => step(1)} title="Next (→)" disabled={!position || position.index >= position.total - 1}>▶</button>
          </div>
          <div class="holes"></div>
        </div>
      {/if}
    </div>

    {#if panels && !fullscreen && file}
      <aside class="panel-col">
        <button class="section" onclick={() => (infoOpen = !infoOpen)}>01 · Info<span>{infoOpen ? '−' : '+'}</span></button>
        {#if infoOpen}
          <div class="info">
            <span class="name">{file.filename}</span>
            <div class="path">
              <a href={href('/images')}>Images</a>
              {#each [...file.ancestors, file.folder] as c (c.id)}
                <span class="sep">\</span><a href={folderHref(c)}><KindIcon kind={c.kind} size={10} />{c.name}</a>
              {/each}
            </div>
            <dl>
              <dt>Size</dt><dd>{formatSize(file.size)}</dd>
              <dt>Dimensions</dt><dd>{dims}</dd>
              <dt>Modified</dt><dd>{formatDate(file.mtime)}</dd>
              <dt>Added</dt><dd>{formatDate(file.addedAt)}</dd>
            </dl>
            <div class="actions">
              <button class="fav" class:on={file.favorited} onclick={toggleFavorite}>{file.favorited ? '★ Starred' : '☆ Star'}</button>
              <button onclick={() => file && openWith(file.id)}>Open with…</button>
              <button onclick={() => file && openOps({ kind: 'rename-file', file, where: file.folder.name })}>Rename</button>
              <button onclick={() => file && openOps({ kind: 'transfer', mode: 'move', files: [file], from: file.folder.name, currentFolderId: file.folder.id })}>Move</button>
              <button onclick={coverMenu} disabled={file.folder.kind === 'inbox' && file.ancestors.length === 0}>Cover of ▸</button>
              <button class="recycle" onclick={recycle}>Recycle</button>
            </div>
            <DescriptionEditor text={file.description} compact prompt="Describe this image…" onsave={saveDescription} />
          </div>
        {/if}
        <button class="section" onclick={() => (tagsOpen = !tagsOpen)}>02 · Tags <span class="n">{file.tags.length}</span><span>{tagsOpen ? '−' : '+'}</span></button>
        {#if tagsOpen}
          <div class="tags">
            <TagInput bind:this={tagInput} already={file.tags.map((t) => t.id)} onpick={(t) => changeTags([t.id], [])} />
            {#each tagGroups as g (g.type.id)}
              <div class="tag-group">
                <span class="tlabel" style:border-top-color={g.type.color}>{g.type.name}</span>
                <div class="chips">
                  {#each g.tags as t (t.id)}
                    <TagChip tag={t} implied={t.source === 'implied'} onremove={() => changeTags([], [t.id])} />
                  {/each}
                </div>
              </div>
            {:else}
              <p class="notags">No tags yet. Type above — Enter adds, and <b>type:name</b> picks the type.</p>
            {/each}
          </div>
        {/if}
      </aside>
    {/if}
  </div>
</div>

<style>
  .viewer { height: 100vh; display: flex; flex-direction: column; background: var(--bg2); }
  .viewer.full { background: #000; }

  .bar { height: 48px; flex: none; display: flex; align-items: stretch; border-bottom: 1px solid var(--line); }
  .logo { display: flex; align-items: center; gap: 8px; padding: 0 18px; border-right: 1px solid var(--line); font: 700 19px/1 var(--font-display); text-decoration: none; }
  .mark { width: 10px; height: 10px; background: var(--accent); }
  .back {
    display: flex;
    align-items: center;
    padding: 0 16px;
    border: none;
    border-right: 1px solid var(--line);
    background: none;
    color: var(--text2);
    font: 12px var(--font-mono);
    text-transform: uppercase;
    cursor: pointer;
  }
  .back:hover { color: var(--text); background: var(--surface); }
  .spacer { flex: 1; }
  .help { width: 48px; border: none; border-left: 1px solid var(--line); background: none; color: var(--text); font: 700 18px/1 var(--font-display); cursor: pointer; }

  .body { flex: 1; min-height: 0; display: flex; }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }

  .stage { position: relative; flex: 1; min-height: 0; overflow: hidden; cursor: grab; user-select: none; }
  .stage.dragging { cursor: grabbing; }
  .full .stage { background: #000; }
  .photo {
    position: absolute;
    left: 50%;
    top: 50%;
    max-width: none;
    outline: 1px solid var(--line);
    outline-offset: 10px;
    image-rendering: auto;
  }
  .full .photo { outline: none; }
  .gone { position: absolute; inset: 0; display: grid; place-items: center; font-size: 48px; color: var(--text2); }

  .position { position: absolute; top: 18px; left: 24px; z-index: 3; display: flex; align-items: baseline; gap: 12px; pointer-events: none; }
  .pos { font-size: 56px; line-height: 0.8; color: var(--accent); }
  .ctx { font: 12px var(--font-mono); text-transform: uppercase; color: var(--text2); line-height: 1.4; }
  .ctx b { color: var(--text); font-weight: 400; }
  .caption { position: absolute; left: 24px; bottom: 14px; z-index: 3; font: 10.5px var(--font-mono); color: #fff; background: rgba(0, 0, 0, 0.45); padding: 3px 6px; pointer-events: none; }
  .full .caption { display: none; }

  .controls {
    position: absolute;
    top: 24px;
    right: 24px;
    z-index: 3;
    display: flex;
    align-items: stretch;
    height: 34px;
    border: 1px solid var(--line);
    background: var(--bg);
    font: 12px var(--font-mono);
    text-transform: uppercase;
    cursor: default;
  }
  .controls button { min-width: 34px; padding: 0 12px; border: none; border-left: 1px solid var(--line); background: none; color: var(--text); font: inherit; cursor: pointer; }
  .controls > button:first-child { border-left: none; }
  .controls button:hover { background: var(--surface); }
  .controls .zoom { min-width: 64px; color: var(--accent); }
  .controls .show { font-weight: 700; }
  .controls .show.on { background: var(--accent); color: var(--accent-ink); }
  .interval { display: flex; align-items: stretch; border-left: 1px solid var(--line); }
  .interval button { min-width: 26px; padding: 0; border: none; }
  .interval span { display: flex; align-items: center; justify-content: center; min-width: 34px; }

  .full-hint { position: absolute; left: 24px; bottom: 16px; z-index: 3; font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; pointer-events: none; }
  .progress { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--line); z-index: 3; }
  .progress div { height: 100%; background: var(--accent); animation: grow linear forwards; }
  @keyframes grow { from { width: 0; } to { width: 100%; } }

  .filmstrip { flex: none; height: 108px; background: var(--film); display: flex; flex-direction: column; border-top: 1px solid var(--line); }
  .holes {
    height: 12px;
    background-image: repeating-linear-gradient(90deg, var(--sprocket) 0 9px, transparent 9px 20px);
    background-size: 100% 6px;
    background-position: 0 50%;
    background-repeat: no-repeat;
  }
  .frames { flex: 1; display: flex; align-items: center; gap: 6px; padding: 0 12px; }
  .nav { width: 36px; height: 56px; flex: none; border: 1px solid #333; background: none; color: #eee; font-size: 13px; cursor: pointer; }
  .nav:disabled { color: #444; cursor: default; }
  .frame { position: relative; flex: 1; min-width: 0; max-width: 120px; height: 56px; padding: 0; border: none; background: #111; opacity: 0.5; cursor: pointer; overflow: hidden; }
  .frame:hover { opacity: 1; }
  .frame.on { height: 60px; opacity: 1; outline: 3px solid var(--accent); }
  .n { position: absolute; bottom: 0; left: 0; padding: 1px 4px; color: #ddd; font: 700 10px var(--font-mono); }
  .frame.on .n { background: var(--accent); color: var(--accent-ink); }

  .panel-col { width: 420px; flex: none; overflow-y: auto; background: var(--surface); border-left: 1px solid var(--line); }
  .section {
    width: 100%;
    display: flex;
    align-items: center;
    padding: 10px 20px;
    border: none;
    border-bottom: 1px solid var(--line);
    background: none;
    color: var(--text);
    font: 700 15px/1 var(--font-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .section span { margin-left: auto; font-family: var(--font-mono); color: var(--text2); }
  .section .n { margin-left: 8px; font: 11px var(--font-mono); color: var(--text2); }
  .tags { padding: 14px 20px 18px; display: flex; flex-direction: column; gap: 14px; border-bottom: 1px solid var(--line); }
  .tag-group { display: grid; grid-template-columns: 78px 1fr; gap: 10px; }
  .tlabel { font: 700 13px/22px var(--font-display); letter-spacing: 0.08em; text-transform: uppercase; border-top: 3px solid; overflow-wrap: anywhere; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; align-content: flex-start; }
  .notags { margin: 0; font: 11.5px var(--font-mono); color: var(--text2); }
  .notags b { color: var(--text); font-weight: 400; }
  .info { padding: 14px 20px 18px; display: flex; flex-direction: column; gap: 12px; border-bottom: 1px solid var(--line); }
  .info .name { font: 700 22px/1.05 var(--font-display); overflow-wrap: anywhere; }
  .path { display: flex; flex-wrap: wrap; align-items: center; font: 11px var(--font-mono); }
  .path a { display: inline-flex; align-items: center; gap: 4px; color: var(--text2); text-decoration: none; }
  .path a:hover { color: var(--accent); }
  .path .sep { color: var(--accent); padding: 0 3px; }
  dl { margin: 0; display: grid; grid-template-columns: 110px 1fr; font: 12px var(--font-mono); border-top: 1px solid var(--line); }
  dt, dd { margin: 0; padding: 5px 0; border-bottom: 1px solid var(--line); }
  dt { color: var(--text2); text-transform: uppercase; }
  .actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; font: 11px var(--font-mono); text-transform: uppercase; }
  .actions button { height: 30px; border: 1px solid var(--line); background: none; color: var(--text); font: inherit; text-transform: inherit; cursor: pointer; }
  .actions button:hover:not(:disabled) { border-color: var(--text); }
  .actions button:disabled { color: var(--line); cursor: default; }
  .actions .fav { font-weight: 700; }
  .actions .fav.on { border-color: var(--accent2); background: var(--accent2); color: #111; }
  .actions .recycle { border-color: var(--red); color: var(--red); }
</style>
