<script lang="ts">
  import { library } from '../stores/library.svelte.ts';
</script>

<div class="page">
  <div class="page-header">
    <div>
      <div class="label">Images</div>
      <h1>Library</h1>
    </div>
  </div>

  <div class="panel empty">
    <div class="label">Inbox</div>
    <div class="count mono">{library.info?.stats.inboxFiles ?? 0} images waiting</div>
    <p>Browsing categories, albums and images arrives in the next milestone.</p>
  </div>
</div>

<style>
  .empty { padding: 32px; }
  .count { font-size: 18px; margin: 4px 0 12px; }
  p { margin: 0; color: var(--text2); }
</style>
