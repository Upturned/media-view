<script lang="ts">
  import { href, navigate, router } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { badgeOf, health, loadHealthSummary } from '../stores/health.svelte.ts';
  import { library } from '../stores/library.svelte.ts';
  import { openMenu } from '../stores/menu.svelte.ts';
  import { lock, profile } from '../stores/profile.svelte.ts';
  import { toastError } from '../stores/toasts.svelte.ts';
  import { openRandom, randomScope } from '../stores/random.svelte.ts';
  import { openDialog } from '../stores/ui.svelte.ts';
  import { fmt } from '../media.ts';
  import { word } from '../themes/index.ts';
  import Avatar from './Avatar.svelte';
  import SearchBox from './SearchBox.svelte';

  /** Random (milestone 8): from the list on screen, else the whole library. */
  const randomTitle = $derived(`Random image from ${randomScope()?.where ?? 'the whole library'}`);

  // The Health badge (user guide §3.3): reloads when issues, files or folders change.
  $effect(() => {
    void live.health;
    void live.files;
    void live.folders;
    if (!library.info) return;
    const t = setTimeout(() => void loadHealthSummary(), 200);
    return () => clearTimeout(t);
  });
  const badge = $derived(badgeOf(health.summary));
  const badgeTitle = $derived(health.summary
    ? [`${health.summary.error} missing`, `${health.summary.warning} need a decision`, `${health.summary.info + (health.summary.untagged ? 1 : 0)} just so you know`].join(' · ')
    : 'Library Health');
  const scanning = $derived(live.scanning || library.info?.scan.status === 'scanning');
  const hashing = $derived(library.info?.scan.hashing ?? 0);
  const converting = $derived(live.converting === undefined ? (library.info?.scan.converting ?? null) : live.converting);
  /** When the copies are all made: "✓ TIFF 12" for a moment (design M8 · 2B). */
  let tiffDone = $state<number | null>(null);
  let tiffTotal = 0;
  $effect(() => {
    const c = converting;
    if (c) {
      tiffTotal = c.total;
      tiffDone = null;
      return;
    }
    if (!tiffTotal) return;
    tiffDone = tiffTotal;
    tiffTotal = 0;
    const t = setTimeout(() => (tiffDone = null), 3000);
    return () => clearTimeout(t);
  });

  /** The profile menu (docs/profiles.md §4.2), on click and right-click of the avatar. */
  function profileMenu(e: MouseEvent) {
    const me = profile.me;
    if (!me) return;
    openMenu(e, me.name, [
      { label: 'Your profile', action: () => navigate(`/profile/${me.id}`) },
      { label: 'Switch profile…', action: () => navigate('/profiles') },
      ...(me.hasPassword ? [{ label: 'Lock', action: () => void lock().catch(toastError) }] : []),
      { label: 'Settings', separated: true, action: () => navigate('/settings') },
    ]);
  }

  /** The module the page belongs to, next to the logo (Images is the only one so far). */
  const module = $derived(
    !library.info || router.route.name === 'hub' || router.route.name === 'settings' ? null : { name: 'Images', path: '/images' },
  );
</script>

<header class="topbar">
  <a class="logo" href={href('/')} title="All modules"><span class="mark"></span>MEDIA/VIEW</a>
  {#if module}
    <a class="module" href={href(module.path)} title="{module.name} library"><span class="chev">›</span>{module.name}</a>
  {/if}

  {#if library.info}
    <SearchBox />
  {:else}
    <div class="spacer"></div>
  {/if}

  {#if scanning || hashing > 0}
    <span class="status" aria-live="polite" title={scanning ? 'Scanning the library for changes' : `Indexing ${fmt(hashing)} new ${word('images')}`}>
      <span class="pulse"></span>{scanning ? 'scanning' : `indexing ${fmt(hashing)}`}
    </span>
  {:else if converting}
    <span class="status" aria-live="polite" title="Making viewer copies of TIFF images — you can keep working.">
      <span class="pulse"></span>TIFF {fmt(converting.done)} / {fmt(converting.total)}
      <span class="progress" style:width="{(converting.done / Math.max(1, converting.total)) * 100}%"></span>
    </span>
  {:else if tiffDone}
    <span class="status done" aria-live="polite" title="Viewer copies of TIFF images made"><span class="tick">✓</span>TIFF {fmt(tiffDone)}</span>
  {/if}

  <nav>
    <a href={href('/images')} class:active={router.route.path.startsWith('/images')}>Images</a>
    <a href={href('/tags')} class:active={router.route.name === 'tags' || router.route.name === 'tag-types' || router.route.name === 'tag'}>Tags</a>
    <a href={href('/collections')} class:active={router.route.name === 'collections' || router.route.name === 'collection'}>Collections</a>
    <a href={href('/favorites')} class:active={router.route.name === 'favorites'}>Favorites</a>
    {#if library.info}<button class="random" title={randomTitle} onclick={() => void openRandom()}>Random</button>{/if}
    <a href={href('/recycle')} class:active={router.route.name === 'recycle'}>Bin</a>
    <a href={href('/settings')} class:active={router.route.name === 'settings'}>Settings</a>
  </nav>
  {#if library.info}
    <a class="health {badge.tone}" class:active={router.route.name.startsWith('health')} href={href('/health')} title={badgeTitle}>
      <span class="hl">Health</span>
      {#if badge.count}<span>{fmt(badge.count)}</span>{:else if badge.tone === 'blue'}<span class="dot"></span>{/if}
    </a>
  {/if}
  <button class="theme" title="Check styles" onclick={() => openDialog('styles')}><span class="swatch"></span>Darkroom</button>
  <button class="help" title="Help (F1)" onclick={() => openDialog('help')}>?</button>
  {#if profile.me}
    <button class="me" class:active={router.route.name === 'profile' || router.route.name === 'profiles'} title="{profile.me.name} · profile menu" onclick={profileMenu} oncontextmenu={profileMenu}>
      <Avatar p={profile.me} size={30} />
    </button>
  {/if}
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
  .module {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 18px 0 14px;
    border-right: 1px solid var(--line);
    color: var(--text2);
    font: 700 18px/1 var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-decoration: none;
  }
  .module:hover { color: var(--text); background: var(--surface); }
  .chev { color: var(--accent); }

  .spacer { flex: 1; }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    border-left: 1px solid var(--line);
    font: 11px var(--font-mono);
    color: var(--text2);
    text-transform: uppercase;
    white-space: nowrap;
  }
  .pulse { width: 8px; height: 8px; background: var(--accent); animation: pulse 1.2s ease-in-out infinite; }
  .status { position: relative; }
  .progress { position: absolute; left: 0; bottom: 0; height: 2px; background: var(--text2); }
  .tick { color: var(--text); }
  .done { animation: fade 3s ease-in forwards; }
  @keyframes fade { 60% { opacity: 1; } 100% { opacity: 0; } }
  @keyframes pulse { 50% { opacity: 0.25; } }

  nav { display: flex; align-items: stretch; font: 600 13px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; }
  nav a {
    display: flex;
    align-items: center;
    padding: 0 14px;
    color: var(--text2);
    border-left: 1px solid var(--line);
    text-decoration: none;
  }
  nav button { padding: 0 14px; border: none; border-left: 1px solid var(--line); background: none; color: var(--text2); font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer; }
  nav a:hover, nav button:hover { color: var(--text); background: var(--surface); }
  nav a.active { color: var(--text); background: var(--surface); box-shadow: inset 0 -3px 0 var(--accent); }

  .health {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    border-left: 1px solid var(--line);
    color: var(--text2);
    font: 700 13px/1 var(--font-mono);
    text-decoration: none;
  }
  .health:hover { color: var(--text); background: var(--surface); }
  .health .hl { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; }
  .health.red { background: var(--red); color: #fff; }
  .health.amber { background: var(--amber); color: #111; }
  .health.red:hover, .health.amber:hover { filter: brightness(1.08); }
  .health.active { box-shadow: inset 0 -3px 0 var(--text); }
  .health.none.active, .health.blue.active { color: var(--text); box-shadow: inset 0 -3px 0 var(--accent); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--blue); }

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
  .me { display: grid; place-items: center; width: 56px; padding: 0; border: none; border-left: 1px solid var(--line); background: none; cursor: pointer; }
  .me:hover, .me.active { background: var(--surface); }
  .me.active :global(.avatar) { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
