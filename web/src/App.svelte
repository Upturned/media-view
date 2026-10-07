<script lang="ts">
  import { onMount } from 'svelte';
  import CheckStylesDialog from './components/CheckStylesDialog.svelte';
  import ConfirmDialog from './components/ConfirmDialog.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import HelpDialog from './components/HelpDialog.svelte';
  import ImportPanel from './components/ImportPanel.svelte';
  import MoveDropBar from './components/MoveDropBar.svelte';
  import OpsDialogs from './components/OpsDialogs.svelte';
  import Toasts from './components/Toasts.svelte';
  import TagTooltip from './components/TagTooltip.svelte';
  import TopBar from './components/TopBar.svelte';
  import { registerKeys } from './keymap.svelte.ts';
  import Album from './pages/Album.svelte';
  import Collection from './pages/Collection.svelte';
  import Collections from './pages/Collections.svelte';
  import Favorites from './pages/Favorites.svelte';
  import Folder from './pages/Folder.svelte';
  import Health from './pages/Health.svelte';
  import HealthGrid from './pages/HealthGrid.svelte';
  import HealthReview from './pages/HealthReview.svelte';
  import HealthUntagged from './pages/HealthUntagged.svelte';
  import Hub from './pages/Hub.svelte';
  import Library from './pages/Library.svelte';
  import NotFound from './pages/NotFound.svelte';
  import RecycleBin from './pages/RecycleBin.svelte';
  import Search from './pages/Search.svelte';
  import TagGallery from './pages/TagGallery.svelte';
  import TagsDirectory from './pages/TagsDirectory.svelte';
  import TagTypes from './pages/TagTypes.svelte';
  import Settings from './pages/Settings.svelte';
  import Viewer from './pages/Viewer.svelte';
  import Welcome from './pages/Welcome.svelte';
  import Wiki from './pages/Wiki.svelte';
  import { router } from './router.svelte.ts';
  import { confirmState } from './stores/confirm.svelte.ts';
  import { connectEvents, live } from './stores/events.svelte.ts';
  import { installDragTracking } from './stores/imports.svelte.ts';
  import { library, refreshLibrary } from './stores/library.svelte.ts';
  import { loadTagTypes } from './stores/tags.svelte.ts';
  import { toast } from './stores/toasts.svelte.ts';
  import { openDialog, ui } from './stores/ui.svelte.ts';

  onMount(() => {
    connectEvents();
    return installDragTracking();
  });

  // The library's info (counts, scan status) follows live changes; debounced, as changes come in bursts.
  $effect(() => {
    void live.library;
    void live.files;
    void live.folders;
    void live.scanning;
    const t = setTimeout(() => {
      refreshLibrary()
        .then(() => (library.info ? loadTagTypes() : undefined))
        .catch((err: Error) => toast(err.message, 'error'));
    }, 150);
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
  {:else if page === 'search'}
    <Search />
  {:else if page === 'tags'}
    <TagsDirectory />
  {:else if page === 'tag-types'}
    <TagTypes />
  {:else if page === 'tag'}
    {#key router.route.params.id}<TagGallery />{/key}
  {:else if page === 'wiki'}
    {#key router.route.params.id}<Wiki />{/key}
  {:else if page === 'favorites'}
    <Favorites />
  {:else if page === 'collections'}
    <Collections />
  {:else if page === 'collection'}
    {#key router.route.params.id}<Collection />{/key}
  {:else if page === 'health'}
    <Health />
  {:else if page === 'health-review'}
    {#key router.route.params.section}<HealthReview />{/key}
  {:else if page === 'health-untagged'}
    <HealthUntagged />
  {:else if page === 'health-grid'}
    <HealthGrid />
  {:else if page === 'recycle'}
    <RecycleBin />
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

<OpsDialogs />
{#if confirmState.request}
  <ConfirmDialog />
{/if}
<ContextMenu />
<MoveDropBar />
<ImportPanel />
<TagTooltip />
<Toasts />

<style>
  main { flex: 1; display: flex; flex-direction: column; }
</style>
