<script lang="ts">
  import { onMount } from 'svelte';
  import CheckStylesDialog from './components/CheckStylesDialog.svelte';
  import HelpDialog from './components/HelpDialog.svelte';
  import Toasts from './components/Toasts.svelte';
  import TopBar from './components/TopBar.svelte';
  import { registerKeys } from './keymap.svelte.ts';
  import Hub from './pages/Hub.svelte';
  import Images from './pages/Images.svelte';
  import NotFound from './pages/NotFound.svelte';
  import Settings from './pages/Settings.svelte';
  import Welcome from './pages/Welcome.svelte';
  import { router } from './router.svelte.ts';
  import { library, refreshLibrary } from './stores/library.svelte.ts';
  import { toast } from './stores/toasts.svelte.ts';
  import { openDialog, ui } from './stores/ui.svelte.ts';

  onMount(() => {
    refreshLibrary().catch((err: Error) => toast(err.message, 'error'));
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

<TopBar />

<main>
  {#if !library.loaded}
    <!-- first load -->
  {:else if page === 'welcome'}
    <Welcome />
  {:else if page === 'hub'}
    <Hub />
  {:else if page === 'images'}
    <Images />
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

<Toasts />

<style>
  main { flex: 1; display: flex; flex-direction: column; }
</style>
