<script lang="ts">
  import type { FolderCard } from '@media-view/shared';
  import { fmt } from '../media.ts';
  import { folderHref, href, navigate } from '../router.svelte.ts';
  import { openMenu } from '../stores/menu.svelte.ts';
  import { isStyled, word } from '../themes/index.ts';
  import KindIcon from './KindIcon.svelte';
  import Thumb from './Thumb.svelte';

  /**
   * One folder card; its look depends on the kind (user guide §2.5):
   * category → rack tile with cover, sub-category → drawer with a mosaic, album → stacked photos.
   */
  let { folder, index = 0 }: { folder: FolderCard; index?: number } = $props();

  const link = $derived(folderHref(folder));
  const empty = $derived(folder.imageCount === 0 && folder.subcategoryCount === 0 && folder.albumCount === 0);
  const num = $derived(String(index + 1).padStart(2, '0'));

  /** "3 albums · 2 drawers" */
  const contents = $derived(
    [
      folder.albumCount ? `${folder.albumCount} ${folder.albumCount === 1 ? word('album').toLowerCase() : word('albums').toLowerCase()}` : '',
      folder.subcategoryCount
        ? `${folder.subcategoryCount} ${folder.subcategoryCount === 1 ? word('subcategory').toLowerCase() : word('subcategories').toLowerCase()}`
        : '',
    ].filter(Boolean).join(' · '),
  );

  function onContext(e: MouseEvent) {
    openMenu(e, folder.name, [
      { label: 'Open', action: () => navigate(link) },
      ...(folder.kind !== 'album' ? [{ label: 'View all images', action: () => navigate(`/images/f/${folder.id}/all`) }] : []),
    ]);
  }
</script>

{#if folder.kind === 'category'}
  <a class="rack" href={link} oncontextmenu={onContext}>
    {#if empty}
      <div class="cover empty-box">This {word('category').toLowerCase()} is empty —<br />add an album or a {word('subcategory').toLowerCase()}.</div>
    {:else}
      <div class="cover">
        <Thumb file={folder.covers[0]} fit="cover" />
        <span class="num display">{num}</span>
      </div>
    {/if}
    <div class="meta">
      <span class="kind accent"><KindIcon kind="category" size={11} />{word('category')}{isStyled('category') ? ' · category' : ''}</span>
      <span class="name display">{folder.name}</span>
      <span class="count"><b>{fmt(folder.imageCount)}</b> {word('images')}{contents ? ` · ${contents}` : ''}</span>
    </div>
  </a>
{:else if folder.kind === 'subcategory'}
  <a class="drawer" href={link} oncontextmenu={onContext}>
    <div class="drawer-head">
      <KindIcon kind="subcategory" size={11} />{word('subcategory')}{isStyled('subcategory') ? ' · sub-category' : ''}
      <span class="right">{contents}</span>
    </div>
    {#if folder.covers.length > 0}
      <div class="mosaic">
        <div class="big"><Thumb file={folder.covers[0]} fit="cover" /></div>
        <div><Thumb file={folder.covers[1]} fit="cover" /></div>
        <div><Thumb file={folder.covers[2]} fit="cover" /></div>
      </div>
    {:else}
      <div class="mosaic empty-box">This {word('subcategory').toLowerCase()} is empty —<br />add an album or a {word('subcategory').toLowerCase()}.</div>
    {/if}
    <div class="handle"></div>
    <div class="meta pad">
      <span class="name display">{folder.name}</span>
      <span class="count"><b>{fmt(folder.imageCount)}</b> {word('images')}</span>
    </div>
  </a>
{:else}
  <a class="album" href={link} oncontextmenu={onContext}>
    <div class="stack">
      <div class="sheet back2"></div>
      <div class="sheet back1"></div>
      <div class="sheet front" class:empty-box={folder.imageCount === 0}>
        {#if folder.imageCount > 0}
          <Thumb file={folder.covers[0]} fit="cover" />
        {:else}
          This album is empty.
        {/if}
      </div>
    </div>
    <div class="meta">
      <span class="kind"><KindIcon kind="album" size={11} />Album</span>
      <span class="name display">{folder.name}</span>
      <span class="count"><b>{fmt(folder.imageCount)}</b> {word('images')}</span>
    </div>
  </a>
{/if}

<style>
  a { display: flex; flex-direction: column; gap: 10px; text-decoration: none; color: var(--text); min-width: 0; }

  .meta { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .meta.pad { padding: 10px 12px 14px; }
  .kind { display: flex; align-items: center; gap: 6px; font: 10.5px var(--font-mono); text-transform: uppercase; color: var(--text2); }
  .kind.accent { color: var(--accent); }
  .name { font-size: 28px; line-height: 0.95; overflow-wrap: anywhere; }
  .count { font: 11.5px var(--font-mono); color: var(--text2); }
  .count b { color: var(--text); font-weight: 400; }

  .empty-box {
    display: grid;
    place-items: center;
    padding: 16px;
    border: 1px dashed var(--text2);
    text-align: center;
    font: 11px/1.5 var(--font-mono);
    color: var(--text2);
    text-transform: uppercase;
  }

  /* Rack (category) */
  .cover { position: relative; aspect-ratio: 16 / 10; background: var(--thumb); outline: 1px solid var(--line); overflow: hidden; }
  .cover.empty-box { outline: none; }
  .rack:hover .cover:not(.empty-box) { outline: 2px solid var(--accent); }
  .num { position: absolute; top: 0; left: 0; padding: 5px 8px; background: var(--bg2); color: var(--text2); font-size: 20px; line-height: 1; }

  /* Drawer (sub-category) */
  .drawer { gap: 0; background: var(--surface); border: 1px solid var(--line); }
  .drawer:hover { border-color: var(--accent); }
  .drawer-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-bottom: 1px solid var(--line);
    font: 10.5px var(--font-mono);
    text-transform: uppercase;
    color: var(--text2);
  }
  .drawer-head .right { margin-left: auto; }
  .mosaic {
    display: grid;
    grid-template-columns: 2fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 3px;
    height: 140px;
    margin: 10px 10px 0;
  }
  .mosaic > div { background: var(--thumb); overflow: hidden; }
  .mosaic .big { grid-row: span 2; }
  .mosaic.empty-box { display: grid; grid-template-columns: 1fr; grid-template-rows: 1fr; font-size: 10.5px; }
  .handle { width: 56px; height: 6px; margin: 10px auto 0; background: var(--line); }

  /* Album: a stack of photos */
  .stack { position: relative; aspect-ratio: 3 / 2; margin: 12px 12px 0 0; }
  .sheet { position: absolute; inset: 0; outline: 1px solid var(--line); overflow: hidden; }
  .back2 { transform: translate(12px, -12px); background: var(--surface); }
  .back1 { transform: translate(6px, -6px); background: var(--surface2); }
  .front { background: var(--thumb); }
  .front.empty-box { background: var(--bg); outline: none; font-size: 10.5px; }
  .album:hover .front:not(.empty-box) { outline: 2px solid var(--accent); }
  .album .name { font-size: 26px; }
</style>
