<script lang="ts">
  import { client, unwrap } from '../api.ts';
  import { library, openLibraryAt, pickAndCreateLibrary, pickAndOpenLibrary } from '../stores/library.svelte.ts';
  import Icon from './Icon.svelte';

  type Recent = { path: string; available: boolean; current: boolean };
  let recent: Recent[] = $state([]);

  async function loadRecent() {
    recent = (await unwrap(client.api.library.recent.$get())).recent;
  }

  async function forget(path: string) {
    await unwrap(client.api.library.recent.$delete({ json: { path } }));
    await loadRecent();
  }

  // Load now, and again whenever the open library changes.
  $effect(() => {
    void library.info?.path;
    loadRecent();
  });
</script>

<div class="actions">
  <button class="btn primary" disabled={library.busy} onclick={pickAndOpenLibrary}>
    <Icon name="folder" size={16} /> Open library…
  </button>
  <button class="btn" disabled={library.busy} onclick={pickAndCreateLibrary}>
    <Icon name="plus" size={16} /> New library…
  </button>
</div>

{#if recent.length}
  <div class="recent">
    <div class="label">Recent libraries</div>
    <ul>
      {#each recent as r (r.path)}
        <li class:current={r.current}>
          <button class="path mono" disabled={!r.available || r.current || library.busy} onclick={() => openLibraryAt(r.path)}
            title={r.available ? r.path : 'Not found — the drive may be disconnected'}>
            {r.path}
          </button>
          {#if r.current}
            <span class="label tag">Open</span>
          {:else if !r.available}
            <span class="label tag missing">Not found</span>
          {/if}
          {#if !r.current}
            <button class="icon-btn" title="Remove from list" onclick={() => forget(r.path)}><Icon name="close" size={14} /></button>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .recent { margin-top: 24px; }
  ul { list-style: none; margin: 8px 0 0; padding: 0; border-top: 1px solid var(--line); }
  li { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--line); }
  .path {
    flex: 1;
    padding: 10px 0;
    border: 0;
    background: none;
    color: var(--text);
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .path:hover:not(:disabled) { color: var(--accent); }
  .path:disabled { cursor: default; }
  li:not(.current) .path:disabled { color: var(--text2); }
  .tag { padding: 2px 6px; border: 1px solid var(--line); }
  .tag.missing { color: var(--amber); }
</style>
