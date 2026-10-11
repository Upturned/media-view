<script lang="ts">
  import { word } from '../themes/index.ts';
  import DialogFrame from './DialogFrame.svelte';
  import FolderPicker, { type PickerNode } from './FolderPicker.svelte';
  import PickerCreate from './PickerCreate.svelte';

  /**
   * Pick a place (Library Health): an album or the Inbox (where loose images go), or a category /
   * sub-category (where a folder goes as an album). Albums, sub-categories and categories can be
   * created right here.
   */
  let {
    title,
    sub = '',
    want,
    verb = 'Move here',
    blocked = [],
    onpick,
    onclose,
  }: {
    title: string;
    sub?: string;
    /** album: an album or the Inbox · container: a category or sub-category */
    want: 'album' | 'container';
    verb?: string;
    /** Folders that can't be picked, with what's inside (the folder being moved). */
    blocked?: number[];
    onpick: (node: PickerNode) => void;
    onclose: () => void;
  } = $props();

  let picker: FolderPicker | undefined = $state();
  let selected = $state<number | null>(null);
  let created = $state<number[]>([]);
  const accepts = (n: PickerNode) => (want === 'album' ? n.kind === 'album' || n.kind === 'inbox' : n.kind === 'category' || n.kind === 'subcategory');
  const node = $derived(picker && selected !== null ? picker.nodeById(selected) : undefined);
  const inside = $derived(!!node && !!picker?.pathOf(node.id).some((p) => blocked.includes(p.id)));
  const ok = $derived(!!node && accepts(node) && !inside);
  const hint = $derived(
    !node ? (want === 'album' ? 'Pick an album or the Inbox' : `Pick a ${word('category').toLowerCase()} or ${word('subcategory').toLowerCase()}`)
      : inside ? 'A folder can’t go inside itself'
      : ok ? node.name
      : want === 'album' ? `${node.kind === 'root' ? 'Images' : node.name} holds folders, not images — pick an album, or create one here`
      : node.kind === 'root' ? 'Albums can’t sit at the top level' : 'Albums hold only images — pick where it goes',
  );
</script>

<DialogFrame {title} {sub} width={640} height={680} {onclose}>
  <FolderPicker bind:this={picker} bind:selected bind:created {accepts} {blocked} />
  {#snippet footer()}
    <div class="foot">
      <PickerCreate {node} {picker} allow={want === 'album' ? ['category', 'subcategory', 'album'] : ['category', 'subcategory']}
        oncreated={(id) => (created = [...created, id])} />
      <div class="row">
        <span class="hint">{hint}</span>
        <button class="dbtn push" onclick={onclose}>Cancel</button>
        <button class="dbtn primary" disabled={!ok} onclick={() => node && onpick(node)}>{verb}</button>
      </div>
    </div>
  {/snippet}
</DialogFrame>

<style>
  .foot { flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .row { display: flex; align-items: center; gap: 8px; }
</style>
