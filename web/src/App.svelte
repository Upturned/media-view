<script lang="ts">
  import { onMount } from 'svelte';
  import CheckStylesDialog from './components/CheckStylesDialog.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import HelpDialog from './components/HelpDialog.svelte';
  import Toasts from './components/Toasts.svelte';
  import TopBar from './components/TopBar.svelte';
  import { registerKeys } from './keymap.svelte.ts';
  import Album from './pages/Album.svelte';
  import Folder from './pages/Folder.svelte';
  import Hub from './pages/Hub.svelte';
  import Library from './pages/Library.svelte';
  import NotFound from './pages/NotFound.svelte';
  import Settings from './pages/Settings.svelte';
  import Viewer from './pages/Viewer.svelte';
  import Welcome from './pages/Welcome.svelte';
  import { router } from './router.svelte.ts';
  import { connectEvents, live } from './stores/events.svelte.ts';
  import { library, refreshLibrary } from './stores/library.svelte.ts';
  import { toast } from './stores/toasts.svelte.ts';
  import { openDialog, ui } from './stores/ui.svelte.ts';

  onMount(() => {
    connectEvents();
  });

  // The library's info (counts, scan status) follows live changes; debounced, as changes come in bursts.
  $effect(() => {
    void live.library;
    void live.files;
    void live.folders;
    void live.scanning;
    const t = setTimeout(() => refreshLibrary().catch((err: Error) => toast(err.message, 'error')), 150);
    return () => clearTimeout(t);
  });

  $effect(() => registerKeys('global', [
    { key: 'F1', description: 'Help', handler: () => openDialog('help'), inInputs: true },
    { key: '?', description: 'Help', handler: () => openDialog('help') },
  ]));

  /** Without a library, every page except Settings shows the welcome screen. */
  const page = $derived(
    !library.info && router.route.name !== 'settings' ? 'welcome' : router.route.name,
  );
</script>

{#if page !== 'viewer'}
  <TopBar />
{/if}

<main>
  {#if !library.loaded}
    <!-- first load -->
  {:else if page === 'welcome'}
    <Welcome />
  {:else if page === 'hub'}
    <Hub />
  {:else if page === 'images'}
    <Library />
  {:else if page === 'folder'}
    <Folder />
  {:else if page === 'album'}
    <Album />
  {:else if page === 'all'}
    <Album all />
  {:else if page === 'viewer'}
    <Viewer />
  {:else if page === 'settings'}
    <Settings />
  {:else}
    <NotFound />
  {/if}
</main>

{#if ui.dialog === 'help'}
  <HelpDialog page={page} />
{:else if ui.dialog === 'styles'}
  <CheckStylesDialog />
{/if}

<ContextMenu />
<Toasts />

<style>
  main { flex: 1; display: flex; flex-direction: column; }
</style>
