<script lang="ts">
  import { onMount } from 'svelte';
  import ConfirmDialog from './components/ConfirmDialog.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import ImportPanel from './components/ImportPanel.svelte';
  import KeyHint from './components/KeyHint.svelte';
  import Lazy from './components/Lazy.svelte';
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
  import Hub from './pages/Hub.svelte';
  import Library from './pages/Library.svelte';
  import NotFound from './pages/NotFound.svelte';
  import Search from './pages/Search.svelte';
  import TagGallery from './pages/TagGallery.svelte';
  import TagsDirectory from './pages/TagsDirectory.svelte';
  import Viewer from './pages/Viewer.svelte';
  import { navigate, routeUp, router, up } from './router.svelte.ts';
  import { confirmState } from './stores/confirm.svelte.ts';
  import { connectEvents, live } from './stores/events.svelte.ts';
  import { installDragTracking } from './stores/imports.svelte.ts';
  import { library, refreshLibrary } from './stores/library.svelte.ts';
  import { loadTagTypes } from './stores/tags.svelte.ts';
  import { toast } from './stores/toasts.svelte.ts';
  import { openDialog, ui } from './stores/ui.svelte.ts';

  /** Pages and dialogs used less often load on first use, in their own chunks. */
  const pages = {
    CheckStylesDialog: () => import('./components/CheckStylesDialog.svelte'),
    HelpDialog: () => import('./components/HelpDialog.svelte'),
    Health: () => import('./pages/Health.svelte'),
    HealthGrid: () => import('./pages/HealthGrid.svelte'),
    HealthReview: () => import('./pages/HealthReview.svelte'),
    HealthUntagged: () => import('./pages/HealthUntagged.svelte'),
    RecycleBin: () => import('./pages/RecycleBin.svelte'),
    TagTypes: () => import('./pages/TagTypes.svelte'),
    Settings: () => import('./pages/Settings.svelte'),
    Welcome: () => import('./pages/Welcome.svelte'),
    Wiki: () => import('./pages/Wiki.svelte'),
  };

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
    {
      key: 'Backspace',
      description: 'Up one level',
      handler: () => {
        const to = up.path ?? routeUp(router.route);
        if (to) navigate(to);
      },
    },
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
    <Lazy load={pages.Welcome} />
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
    <Lazy load={pages.TagTypes} />
  {:else if page === 'tag'}
    {#key router.route.params.id}<TagGallery />{/key}
  {:else if page === 'wiki'}
    {#key router.route.params.id}<Lazy load={pages.Wiki} />{/key}
  {:else if page === 'favorites'}
    <Favorites />
  {:else if page === 'collections'}
    <Collections />
  {:else if page === 'collection'}
    {#key router.route.params.id}<Collection />{/key}
  {:else if page === 'health'}
    <Lazy load={pages.Health} />
  {:else if page === 'health-review'}
    {#key router.route.params.section}<Lazy load={pages.HealthReview} />{/key}
  {:else if page === 'health-untagged'}
    <Lazy load={pages.HealthUntagged} />
  {:else if page === 'health-grid'}
    <Lazy load={pages.HealthGrid} />
  {:else if page === 'recycle'}
    <Lazy load={pages.RecycleBin} />
  {:else if page === 'settings'}
    <Lazy load={pages.Settings} />
  {:else}
    <NotFound />
  {/if}
</main>

{#if ui.dialog === 'help'}
  <Lazy load={pages.HelpDialog} page={page} />
{:else if ui.dialog === 'styles'}
  <Lazy load={pages.CheckStylesDialog} />
{/if}

<OpsDialogs />
{#if confirmState.request}
  <ConfirmDialog />
{/if}
<ContextMenu />
<MoveDropBar />
<ImportPanel />
<TagTooltip />
<KeyHint />
<Toasts />

<style>
  main { flex: 1; display: flex; flex-direction: column; }
</style>
