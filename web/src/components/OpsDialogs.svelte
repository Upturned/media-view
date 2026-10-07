<script lang="ts">
  import { ops } from '../stores/ops.svelte.ts';
  import AddToCollectionDialog from './AddToCollectionDialog.svelte';
  import CollectionDialog from './CollectionDialog.svelte';
  import BulkRenameDialog from './BulkRenameDialog.svelte';
  import BulkTagDialog from './BulkTagDialog.svelte';
  import EditTagDialog from './EditTagDialog.svelte';
  import MoveDialog from './MoveDialog.svelte';
  import RenameDialog from './RenameDialog.svelte';

  /** Hosts whichever operation dialog is open (one at a time). */
</script>

{#if ops.dialog}
  {@const d = ops.dialog}
  {#key d}
    {#if d.kind === 'transfer' || d.kind === 'folder-move' || d.kind === 'restore'}
      <MoveDialog dialog={d} />
    {:else if d.kind === 'rename-file' || d.kind === 'rename-folder'}
      <RenameDialog dialog={d} />
    {:else if d.kind === 'bulk-rename'}
      <BulkRenameDialog dialog={d} />
    {:else if d.kind === 'edit-tag'}
      <EditTagDialog tagId={d.tagId} />
    {:else if d.kind === 'bulk-tag'}
      <BulkTagDialog dialog={d} />
    {:else if d.kind === 'collection-edit'}
      <CollectionDialog id={d.id} initialName={d.name} />
    {:else if d.kind === 'add-to-collection'}
      <AddToCollectionDialog dialog={d} />
    {/if}
  {/key}
{/if}
