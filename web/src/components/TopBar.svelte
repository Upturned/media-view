<script lang="ts">
  import { href, router } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { library } from '../stores/library.svelte.ts';
  import { openDialog } from '../stores/ui.svelte.ts';
  import { fmt } from '../media.ts';
  import { word } from '../themes/index.ts';

  // Search, Tags, Collections, Favorites, Random, Bin and the Health badge join as their milestones land.
  const scanning = $derived(live.scanning || library.info?.scan.status === 'scanning');
  const hashing = $derived(library.info?.scan.hashing ?? 0);
</script>

<header class="topbar">
  <a class="logo" href={href('/')} title="Hub"><span class="mark"></span>MEDIA/VIEW</a>

  <div class="status" aria-live="polite">
    {#if library.info}
      <span class="prompt">&gt;</span>
      {#if scanning}
        <span>scanning the library…</span>
      {:else if hashing > 0}
        <span>indexing {fmt(hashing)} new {word('images')}…</span>
      {:else}
        <span class="dim">{library.info.name} · {fmt(library.info.stats.files)} {word('images')}</span>
      {/if}
    {/if}
  </div>

  <nav>
    <a href={href('/images')} class:active={router.route.path.startsWith('/images')}>Images</a>
    <a href={href('/settings')} class:active={router.route.name === 'settings'}>Settings</a>
  </nav>
  <button class="theme" title="Check styles" onclick={() => openDialog('styles')}><span class="swatch"></span>Darkroom</button>
  <button class="help" title="Help (F1)" onclick={() => openDialog('help')}>?</button>
</header>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    height: 56px;
    flex: none;
    display: flex;
    align-items: stretch;
    background: var(--bg2);
    border-bottom: 1px solid var(--line);
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 22px;
    border-right: 1px solid var(--line);
    font: 700 22px/1 var(--font-display);
    letter-spacing: 0.02em;
    text-decoration: none;
  }
  .mark { width: 12px; height: 12px; background: var(--accent); }

  .status {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 18px;
    font: 13px var(--font-mono);
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
  }
  .prompt { color: var(--accent); font-weight: 700; }
  .dim { color: var(--text2); overflow: hidden; text-overflow: ellipsis; }

  nav { display: flex; align-items: stretch; font: 600 13px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; }
  nav a {
    display: flex;
    align-items: center;
    padding: 0 14px;
    color: var(--text2);
    border-left: 1px solid var(--line);
    text-decoration: none;
  }
  nav a:hover { color: var(--text); background: var(--surface); }
  nav a.active { color: var(--text); }

  .theme {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    border: none;
    border-left: 1px solid var(--line);
    background: none;
    color: var(--text2);
    font: 12px var(--font-mono);
    text-transform: uppercase;
    cursor: pointer;
  }
  .theme:hover { color: var(--text); background: var(--surface); }
  .swatch { width: 12px; height: 12px; border: 1.5px solid var(--text); background: linear-gradient(90deg, var(--text) 50%, transparent 50%); }

  .help {
    width: 52px;
    border: none;
    border-left: 1px solid var(--line);
    background: none;
    color: var(--text);
    font: 700 18px/1 var(--font-display);
    cursor: pointer;
  }
  .help:hover { background: var(--surface); }
</style>
