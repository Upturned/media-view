<script lang="ts">
  import LibraryActions from '../components/LibraryActions.svelte';
  import { library } from '../stores/library.svelte.ts';
  import { openDialog } from '../stores/ui.svelte.ts';
  import { themes } from '../themes/index.ts';
</script>

<div class="page">
  <div class="page-header">
    <h1>Settings</h1>
  </div>

  <section class="panel">
    <h2 class="label">Library</h2>
    {#if library.info}
      <div class="current">
        <div class="name">{library.info.name}</div>
        <div class="mono path">{library.info.path}</div>
      </div>
    {:else}
      <p class="muted">No library is open.</p>
    {/if}
    <LibraryActions />
  </section>

  <section class="panel">
    <h2 class="label">Theme</h2>
    {#each themes as t (t.id)}
      <div class="theme">
        <span class="swatch" style:background={t.vars['--bg']} style:border-color={t.vars['--accent']}></span>
        <div>
          <div class="name">{t.name}</div>
          <div class="muted">{t.description}</div>
        </div>
      </div>
    {/each}
    <p class="muted">Other styles are being considered. Preview them with <em>Check styles</em>.</p>
    <button class="btn" onclick={() => openDialog('styles')}>Check styles</button>
  </section>
</div>

<style>
  section { padding: 24px; margin-bottom: 16px; }
  h2 { margin-bottom: 16px; }
  .current { margin-bottom: 20px; }
  .name { font-weight: 600; font-size: 17px; }
  .path, .muted { color: var(--text2); }
  .muted { font-size: 13px; }
  .theme { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
  .swatch { width: 40px; height: 40px; border: 2px solid; border-radius: var(--radius); }
</style>
