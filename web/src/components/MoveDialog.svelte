<script lang="ts">
  import { client, unwrap } from '../api.ts';
  import { fmt } from '../media.ts';
  import { library } from '../stores/library.svelte.ts';
  import { closeOps, restoreItems, transfer, type ClashPolicy, type OpsDialog } from '../stores/ops.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';
  import { word } from '../themes/index.ts';
  import DialogFrame from './DialogFrame.svelte';
  import FolderPicker, { type PickerNode } from './FolderPicker.svelte';
  import KindIcon from './KindIcon.svelte';

  /** Move / Copy images, move a folder, or restore from the bin to a chosen place (design M3 · 01). */
  let { dialog }: { dialog: Extract<OpsDialog, { kind: 'transfer' | 'folder-move' | 'restore' }> } = $props();

  let picker: FolderPicker | undefined = $state();
  let selected = $state<number | null>(null);
  let created = $state<number[]>([]);
  // svelte-ignore state_referenced_locally
  let mode = $state<'move' | 'copy'>(dialog.kind === 'transfer' ? dialog.mode : 'move');
  let policy = $state<ClashPolicy>('keep-both');
  let copyTags = $state(true);
  let busy = $state(false);
  let newName = $state<string | null>(null);

  // What can be picked.
  const restoringFiles = $derived(dialog.kind === 'restore' && dialog.items.every((i) => i.entity === 'file'));
  const restoringFolders = $derived(dialog.kind === 'restore' && dialog.items.every((i) => i.entity === 'folder'));
  const placingImages = $derived(dialog.kind === 'transfer' || restoringFiles);
  /** A folder (moved or restored) that is an album can't sit at the top level. */
  const holdsAlbum = $derived(
    (dialog.kind === 'folder-move' && dialog.folder.kind === 'album') ||
    (dialog.kind === 'restore' && dialog.items.some((i) => i.kind === 'album')),
  );

  function accepts(n: PickerNode): boolean {
    if (placingImages) return n.kind === 'album' || n.kind === 'inbox';
    if (dialog.kind === 'restore' && !restoringFolders) return false;
    if (n.kind === 'root') return !holdsAlbum;
    return n.kind === 'category' || n.kind === 'subcategory';
  }

  const current = $derived(
    dialog.kind === 'transfer' && mode === 'move' ? dialog.currentFolderId
      : dialog.kind === 'folder-move' ? (dialog.folder.parentId ?? 0)
      : null,
  );
  const blocked = $derived(dialog.kind === 'folder-move' ? [dialog.folder.id] : []);

  const node = $derived(picker && selected !== null ? picker.nodeById(selected) : undefined);
  const valid = $derived(!!node && accepts(node) && node.id !== current && !(picker?.pathOf(node.id).some((p) => blocked.includes(p.id))));

  // ─── Recent destinations (albums) ──────────────────────────────────────────

  function recentIds(): number[] {
    try {
      return JSON.parse(localStorage.getItem('move.recent') ?? '[]') as number[];
    } catch {
      return [];
    }
  }
  function remember(id: number) {
    try {
      localStorage.setItem('move.recent', JSON.stringify([id, ...recentIds().filter((x) => x !== id)].slice(0, 3)));
    } catch {
      // not remembered
    }
  }
  const recent = $derived(placingImages && picker ? recentIds().map((id) => picker!.nodeById(id)).filter((n): n is PickerNode => !!n) : []);

  // ─── Name clashes in the destination (images) ──────────────────────────────

  let clashes = $state<string[]>([]);
  $effect(() => {
    if (dialog.kind !== 'transfer' || !valid || selected === null) {
      clashes = [];
      return;
    }
    const target = selected;
    const names = dialog.files.map((f) => f.filename);
    unwrap(client.api.files.names.$get({ query: { folder: String(target) } }))
      .then((r) => {
        if (target !== selected) return;
        const there = new Set(r.names);
        clashes = names.filter((n) => there.has(n.toLowerCase()));
      })
      .catch(() => (clashes = []));
  });

  // ─── Labels ────────────────────────────────────────────────────────────────

  const count = $derived(dialog.kind === 'transfer' ? dialog.files.length : dialog.kind === 'restore' ? dialog.items.length : 1);
  const title = $derived(
    dialog.kind === 'transfer' ? `${mode === 'move' ? 'Move' : 'Copy'} ${fmt(count)} ${count === 1 ? word('image') : word('images')}`
      : dialog.kind === 'folder-move' ? `Move “${dialog.folder.name}”`
      : `Restore ${count === 1 ? `“${dialog.items[0]!.name}”` : `${count} items`} to…`,
  );
  const sub = $derived(dialog.kind === 'transfer' ? `from ${dialog.from}` : dialog.kind === 'folder-move' ? 'its kind follows its new place' : 'from the Recycle Bin');
  const verb = $derived(dialog.kind === 'transfer' ? (mode === 'move' ? 'Move' : 'Copy') : dialog.kind === 'folder-move' ? 'Move' : 'Restore');

  const destination = $derived.by(() => {
    if (!node || !picker || !library.info) return '';
    const parts = picker.pathOf(node.id).filter((p) => p.id !== 0).map((p) => p.name);
    return `${library.info.path.replace(/[\\/]+$/, '')}\\Images\\${parts.map((p) => `${p}\\`).join('')}`;
  });

  const hint = $derived.by(() => {
    if (dialog.kind === 'restore' && !restoringFiles && !restoringFolders) return 'Images and folders go to different places — restore them separately.';
    if (!node) return placingImages ? 'Pick an album.' : 'Pick where it goes.';
    if (node.id === current) return dialog.kind === 'folder-move' ? 'It’s already here. Pick a different place.' : 'The images are already here. Pick a different album.';
    if (picker?.pathOf(node.id).some((p) => blocked.includes(p.id))) return 'A folder can’t go inside itself.';
    if (placingImages) {
      if (node.kind === 'root') return 'Images can’t sit at the top level. Pick an album.';
      return `${node.kind === 'category' ? word('categories') : word('subcategories')} hold albums, not images. Pick an album, or create one here.`;
    }
    if (node.kind === 'root') return 'Albums can’t sit at the top level. Pick a category or sub-category.';
    return 'Albums hold only images. Pick a category or sub-category.';
  });

  const canCreateAlbum = $derived(placingImages && !!node && (node.kind === 'category' || node.kind === 'subcategory'));

  async function createAlbum() {
    if (!node || !newName?.trim()) return;
    try {
      const card = await unwrap(client.api.folders.$post({ json: { parentId: node.id, kind: 'album', name: newName } }));
      newName = null;
      created = [...created, card.id];
      await picker!.reload();
      picker!.reveal(card.id);
    } catch (err) {
      toastError(err);
    }
  }

  async function go() {
    if (!valid || !node || busy) return;
    busy = true;
    try {
      if (dialog.kind === 'transfer') {
        remember(node.id);
        const done = await transfer(mode, dialog.files.map((f) => f.id), node, policy, copyTags);
        if (done && mode === 'move') dialog.onmoved?.();
      } else if (dialog.kind === 'folder-move') {
        await unwrap(client.api.folders[':id'].move.$post({ param: { id: String(dialog.folder.id) }, json: { parentId: node.id === 0 ? null : node.id } }));
        toast(`Moved “${dialog.folder.name}” to ${node.name}.`);
      } else {
        await restoreItems(dialog.items, node.id === 0 ? null : node.id);
      }
      closeOps();
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
    }
  }
</script>

<DialogFrame {title} {sub} width={760} height={720} onclose={closeOps}>
  {#snippet head()}
    {#if dialog.kind === 'transfer'}
      <div class="seg">
        <button class:on={mode === 'move'} onclick={() => (mode = 'move')}>Move</button>
        <button class:on={mode === 'copy'} onclick={() => (mode = 'copy')}>Copy</button>
      </div>
    {/if}
  {/snippet}

  {#if recent.length}
    <div class="recent">
      <span>Recent</span>
      {#each recent as r (r.id)}
        <button class:on={selected === r.id} onclick={() => picker?.reveal(r.id)}><KindIcon kind="album" size={11} />{r.name}</button>
      {/each}
    </div>
  {/if}

  <FolderPicker bind:this={picker} bind:selected bind:created {accepts} {current} {blocked} />

  {#snippet footer()}
    <div class="foot">
      {#if valid}
        <div class="dest">
          <span class="field-label">Destination</span>
          <span class="path">{destination}</span>
        </div>
        {#if dialog.kind === 'transfer' && clashes.length > 0}
          <div class="clash">
            <span class="n">{clashes.length} name {clashes.length === 1 ? 'clash' : 'clashes'}</span>
            <span class="what">{clashes.length === 1 ? `${clashes[0]} already exists there` : `${clashes[0]} and ${clashes.length - 1} more already exist there`}</span>
            <div class="seg small">
              <button class:on={policy === 'keep-both'} onclick={() => (policy = 'keep-both')}>Keep both</button>
              <button class:on={policy === 'replace'} onclick={() => (policy = 'replace')} title="The existing image goes to the Recycle Bin (starred ones are never replaced)">Replace</button>
              <button class:on={policy === 'skip'} onclick={() => (policy = 'skip')}>Skip</button>
            </div>
          </div>
        {/if}
      {:else}
        <div class="invalid">
          <span>{hint}</span>
          {#if canCreateAlbum}
            {#if newName === null}
              <button onclick={() => (newName = '')}>+ New album in {node?.name}</button>
            {:else}
              <form onsubmit={(e) => { e.preventDefault(); void createAlbum(); }}>
                <!-- svelte-ignore a11y_autofocus -->
                <input bind:value={newName} placeholder="Album name" autofocus />
                <button type="submit" disabled={!newName.trim()}>Create</button>
              </form>
            {/if}
          {/if}
        </div>
      {/if}
      <div class="actions">
        {#if dialog.kind === 'transfer' && mode === 'copy'}
          <label class="check"><input type="checkbox" bind:checked={copyTags} /> Copy tags</label>
        {/if}
        <span class="hint">
          {#if dialog.kind === 'transfer'}{mode === 'move' ? 'Tags, stars and descriptions travel with the images' : 'Copies are new images in the album'}{:else if dialog.kind === 'folder-move'}Everything inside moves with it{:else}Restored items keep their stars and descriptions{/if}
        </span>
        <button class="dbtn push" onclick={closeOps}>Cancel</button>
        <button class="dbtn primary" disabled={!valid || busy} onclick={go}>{valid && node ? `${verb} to ${node.name}` : `${verb} here`}</button>
      </div>
    </div>
  {/snippet}
</DialogFrame>

<style>
  .seg { display: flex; border: 1px solid var(--line); font: 12px var(--font-mono); text-transform: uppercase; }
  .seg button { padding: 7px 14px; border: none; background: none; color: var(--text2); font: inherit; font-weight: 700; cursor: pointer; text-transform: inherit; }
  .seg button.on { background: var(--text); color: var(--bg); }
  .seg.small button { padding: 4px 9px; font-weight: 400; }

  .recent { display: flex; align-items: center; gap: 10px; padding: 12px 20px; flex: none; border-bottom: 1px solid var(--line); font: 11px var(--font-mono); text-transform: uppercase; color: var(--text2); flex-wrap: wrap; }
  .recent button { display: flex; align-items: center; gap: 6px; padding: 5px 9px; border: 1px solid var(--line); background: none; color: var(--text); font: inherit; text-transform: none; cursor: pointer; }
  .recent button:hover { border-color: var(--text); }
  .recent button.on { background: var(--surface2); }

  .foot { flex: 1; display: flex; flex-direction: column; gap: 10px; }
  .dest { display: flex; flex-direction: column; gap: 4px; font: 11.5px var(--font-mono); }
  .path { overflow-wrap: anywhere; }
  .clash { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--amber); font: 11.5px var(--font-mono); }
  .clash .n { color: var(--amber); font-weight: 700; text-transform: uppercase; white-space: nowrap; }
  .clash .what { flex: 1; min-width: 0; color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .invalid { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px dashed var(--text2); font: 12px var(--font-mono); color: var(--text2); }
  .invalid > span { flex: 1; line-height: 1.45; }
  .invalid button, .invalid input { height: 30px; padding: 0 12px; border: 1px solid var(--text); background: none; color: var(--text); font: inherit; text-transform: uppercase; cursor: pointer; }
  .invalid form { display: flex; gap: 6px; }
  .invalid input { text-transform: none; cursor: text; background: var(--bg2); outline: none; width: 180px; }
  .invalid button:disabled { opacity: 0.5; cursor: default; }
  .actions { display: flex; align-items: center; gap: 8px; }
  .check { display: flex; align-items: center; gap: 6px; padding-right: 10px; font: 11px var(--font-mono); text-transform: uppercase; cursor: pointer; }
  .check input { accent-color: var(--accent); }
</style>
