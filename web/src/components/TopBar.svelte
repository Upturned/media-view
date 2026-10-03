<script lang="ts">
  import { href } from '../router.svelte.ts';
  import { library } from '../stores/library.svelte.ts';
  import { openDialog } from '../stores/ui.svelte.ts';
  import Icon from './Icon.svelte';
</script>

<header class="topbar">
  <a class="logo" href={href('/')} title="Hub">
    <span class="mark" aria-hidden="true"></span>
    <span class="word">media<span class="dash">-</span>view</span>
  </a>

  {#if library.info}
    <span class="library label" title={library.info.path}>{library.info.name}</span>
  {/if}

  <div class="spacer"></div>

  <nav class="actions">
    <button class="icon-btn" title="Check styles" onclick={() => openDialog('styles')}>
      <Icon name="palette" />
    </button>
    <a class="icon-btn" href={href('/settings')} title="Settings"><Icon name="settings" /></a>
    <button class="icon-btn" title="Help (F1)" onclick={() => openDialog('help')}><Icon name="help" /></button>
  </nav>
</header>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 16px;
    height: 56px;
    padding: 0 16px 0 20px;
    background: var(--bg2);
    border-bottom: 1px solid var(--line);
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    font-weight: 700;
    font-size: 15px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .mark {
    width: 12px;
    height: 12px;
    background: var(--accent);
    box-shadow: 0 0 12px var(--accent);
  }
  .dash { color: var(--accent); }

  .library {
    padding-left: 16px;
    border-left: 1px solid var(--line);
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .spacer { flex: 1; }
  .actions { display: flex; gap: 4px; }
</style>
