<script lang="ts">
  import { ops } from '../stores/ops.svelte.ts';
  import BulkRenameDialog from './BulkRenameDialog.svelte';
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
    {/if}
  {/key}
{/if}
