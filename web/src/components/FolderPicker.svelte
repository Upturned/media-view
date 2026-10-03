<script module lang="ts">
  import type { FolderKind } from '@media-view/shared';

  export interface PickerNode {
    id: number;
    parentId: number | null;
    kind: FolderKind | 'root';
    name: string;
    imageCount: number;
  }
</script>

<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { client, unwrap } from '../api.ts';
  import { fmt } from '../media.ts';
  import { toastError } from '../stores/toasts.svelte.ts';
  import KindIcon from './KindIcon.svelte';

  /**
   * The folder tree of the Move / Copy dialog (design M3 · 01). `accepts` says which folders are
   * valid destinations; the root ("Images", id 0) stands for the top level.
   */

  let {
    selected = $bindable(),
    accepts,
    current = null,
    blocked = [],
    created = $bindable([]),
  }: {
    /** The picked node id (0 = the root), or null. */
    selected: number | null;
    accepts: (node: PickerNode) => boolean;
    /** Where the items are now (marked "current"). */
    current?: number | null;
    /** Folders that can't be picked, with their subtree (a folder moved into itself). */
    blocked?: number[];
    /** Ids of albums created from this picker (marked "new"). */
    created?: number[];
  } = $props();

  let nodes = $state<PickerNode[]>([]);
  let filter = $state('');
  const open = new SvelteSet<number>([0]);

  export async function reload(): Promise<void> {
    try {
      const r = await unwrap(client.api.folders.tree.$get());
      nodes = [{ id: 0, parentId: null, kind: 'root', name: 'Images', imageCount: 0 }, ...r.folders.map((f) => ({ ...f, parentId: f.parentId ?? 0 }))];
    } catch (err) {
      toastError(err);
    }
  }

  $effect(() => {
    void reload();
  });

  export function nodeById(id: number | null): PickerNode | undefined {
    return id === null ? undefined : nodes.find((n) => n.id === id);
  }

  export function pathOf(id: number): PickerNode[] {
    const chain: PickerNode[] = [];
    for (let n = nodeById(id); n; n = n.id === 0 ? undefined : nodeById(n.parentId)) chain.unshift(n);
    return chain;
  }

  /** Reveal a node (open its ancestors) and select it. */
  export function reveal(id: number): void {
    for (const n of pathOf(id)) open.add(n.id);
    selected = id;
  }

  const children = (id: number) =>
    nodes.filter((n) => n.parentId === id && n.id !== 0)
      // Inbox first, then racks/drawers, then albums, each a→z.
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const rank = (n: PickerNode) => (n.kind === 'inbox' ? 0 : n.kind === 'album' ? 2 : 1);

  const isBlocked = (n: PickerNode) => pathOf(n.id).some((p) => blocked.includes(p.id));

  const rows = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    const matches = (n: PickerNode): boolean => n.name.toLowerCase().includes(q) || children(n.id).some(matches);
    const out: { node: PickerNode; depth: number; open: boolean; hasKids: boolean }[] = [];
    const emit = (n: PickerNode, depth: number) => {
      if (q && n.id !== 0 && !matches(n)) return;
      const kids = children(n.id);
      const isOpen = q ? true : open.has(n.id);
      out.push({ node: n, depth, open: isOpen, hasKids: kids.length > 0 });
      if (isOpen) for (const k of kids) emit(k, depth + 1);
    };
    const root = nodes.find((n) => n.id === 0);
    if (root) emit(root, 0);
    return out;
  });

  const albumCount = $derived(nodes.filter((n) => n.kind === 'album' || n.kind === 'inbox').length);

  function click(n: PickerNode) {
    selected = n.id;
    if (n.kind !== 'album' && n.kind !== 'inbox') open.add(n.id);
  }

  function toggle(e: MouseEvent, n: PickerNode) {
    e.stopPropagation();
    if (open.has(n.id)) open.delete(n.id);
    else open.add(n.id);
  }
</script>

<div class="filter">
  <span class="prompt">&gt;</span>
  <input bind:value={filter} placeholder="filter folders…" spellcheck="false" />
  <span class="count">{fmt(albumCount)} albums</span>
</div>

<div class="tree" role="tree">
  {#each rows as { node, depth, open: isOpen, hasKids } (node.id)}
    {@const valid = accepts(node) && !isBlocked(node) && node.id !== current}
    {@const albumish = node.kind === 'album' || node.kind === 'inbox'}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="row"
      class:sel={selected === node.id}
      class:valid
      class:folder={!albumish}
      class:blocked={isBlocked(node)}
      role="treeitem"
      tabindex="-1"
      aria-selected={selected === node.id}
      style:padding-left="{20 + depth * 22}px"
      onclick={() => click(node)}
    >
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <span class="caret" onclick={(e) => toggle(e, node)}>{hasKids && node.id !== 0 ? (isOpen ? '▾' : '▸') : ''}</span>
      {#if node.kind === 'root'}<span class="root-mark"></span>{:else}<KindIcon kind={node.kind} size={13} />{/if}
      <span class="name">{node.name}</span>
      {#if node.id === current}<span class="tag">current</span>{/if}
      {#if created.includes(node.id)}<span class="tag new">new</span>{/if}
      <span class="meta">{albumish ? fmt(node.imageCount) : hasKids || node.id === 0 ? '' : 'empty'}</span>
    </div>
  {/each}
</div>

<style>
  .filter { display: flex; align-items: center; gap: 8px; padding: 0 20px; height: 42px; flex: none; border-bottom: 1px solid var(--line); }
  .prompt { color: var(--accent); font: 700 13px var(--font-mono); }
  input { flex: 1; height: 100%; border: none; background: none; color: var(--text); font: 13px var(--font-mono); outline: none; }
  .count { font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }

  .tree { flex: 1; min-height: 160px; overflow-y: auto; overflow-x: hidden; padding: 6px 0; background: var(--bg2); }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding-right: 20px;
    border-left: 3px solid transparent;
    color: var(--text2);
    cursor: pointer;
  }
  .row:hover { background: var(--surface); }
  .row.valid { color: var(--text); }
  .row.folder .name { font-weight: 600; }
  .row.blocked { opacity: 0.45; }
  .row.sel { background: var(--surface2); border-left-color: var(--text2); }
  .row.sel.valid { background: color-mix(in oklab, var(--accent) 22%, var(--bg2)); border-left-color: var(--accent); }
  .caret { width: 16px; flex: none; font: 11px var(--font-mono); color: var(--text2); text-align: center; }
  .root-mark { width: 13px; height: 13px; flex: none; background: var(--accent); }
  .name { flex: 1; min-width: 0; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag { font: 10px var(--font-mono); padding: 2px 6px; border: 1px solid var(--text2); color: var(--text2); text-transform: uppercase; }
  .tag.new { border: none; background: var(--accent2); color: #111; }
  .meta { min-width: 60px; font: 11px var(--font-mono); color: var(--text2); text-align: right; }
</style>
