<script lang="ts">
  import DialogFrame from './DialogFrame.svelte';
  import FolderPicker, { type PickerNode } from './FolderPicker.svelte';

  /** Pick an album (or the Inbox) — e.g. where loose images go (Library Health). */
  let { title, sub = '', onpick, onclose }: { title: string; sub?: string; onpick: (albumId: number | null, name: string) => void; onclose: () => void } = $props();

  let picker: FolderPicker | undefined = $state();
  let selected = $state<number | null>(null);
  const node = $derived(picker && selected !== null ? picker.nodeById(selected) : undefined);
  const ok = $derived(!!node && (node.kind === 'album' || node.kind === 'inbox'));
</script>

<DialogFrame {title} {sub} width={640} height={640} {onclose}>
  <FolderPicker bind:this={picker} bind:selected accepts={(n: PickerNode) => n.kind === 'album' || n.kind === 'inbox'} />
  {#snippet footer()}
    <span class="hint">{node ? node.name : 'Pick an album or the Inbox'}</span>
    <button class="dbtn push" onclick={onclose}>Cancel</button>
    <button class="dbtn primary" disabled={!ok} onclick={() => node && onpick(node.kind === 'inbox' ? null : node.id, node.name)}>Move here</button>
  {/snippet}
</DialogFrame>
