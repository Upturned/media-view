<script lang="ts">
  import type { ProfileInfo } from '@media-view/shared';
  import Avatar from '../components/Avatar.svelte';
  import ProfileDialog, { type ProfileDialogResult } from '../components/ProfileDialog.svelte';
  import { navItems } from '../kbd.svelte.ts';
  import { goBack } from '../router.svelte.ts';
  import { library } from '../stores/library.svelte.ts';
  import { openMenu } from '../stores/menu.svelte.ts';
  import { createProfile, profile, switchTo } from '../stores/profile.svelte.ts';
  import { toastError } from '../stores/toasts.svelte.ts';

  /**
   * The profile picker (docs/profiles.md §4.1): when no profile is in use yet (a password, or several
   * profiles and none used here before), and from *Switch profile…*. Opening a profile reloads the app.
   */
  let unlocking = $state<ProfileInfo | null>(null);
  let creating = $state(false);

  function open(p: ProfileInfo) {
    if (p.active) {
      goBack('/');
      return;
    }
    if (p.hasPassword) unlocking = p;
    else switchTo(p.id).catch(toastError);
  }

  async function create(r: ProfileDialogResult) {
    const p = await createProfile(r.name, r.password);
    await switchTo(p.id, r.password ?? undefined);
  }

  function cardMenu(e: MouseEvent, p: ProfileInfo) {
    openMenu(e, p.name, [{ label: p.active ? 'In use' : p.hasPassword ? 'Open… (password)' : 'Open', disabled: p.active, action: () => open(p) }]);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="picker" oncontextmenu={(e) => openMenu(e, 'Profiles', [{ label: 'New profile…', action: () => (creating = true) }])}>
  <div class="page" use:navItems={{ kind: 'cards' }}>
    <div class="page-header">
      <div>
        <div class="label">{library.info?.name ?? 'Library'}</div>
        <h1>Who’s using media-view?</h1>
      </div>
      {#if profile.me}<button class="btn" onclick={() => goBack('/')}>Cancel</button>{/if}
    </div>

    <div class="cards">
      {#each profile.list as p (p.id)}
        <button class="card panel" class:current={p.active} data-nav onclick={() => open(p)} oncontextmenu={(e) => cardMenu(e, p)}>
          <Avatar {p} size={96} />
          <span class="name">{p.name}</span>
          <span class="meta mono">{p.active ? 'in use' : p.hasPassword ? '🔒 password' : ' '}</span>
        </button>
      {/each}
      <button class="card panel add" data-nav onclick={() => (creating = true)}>
        <span class="plus">+</span>
        <span class="name">New profile</span>
        <span class="meta mono">&nbsp;</span>
      </button>
    </div>
  </div>
</div>

{#if unlocking}
  {@const p = unlocking}
  <ProfileDialog mode="unlock" title="Open {p.name}" sub="this profile has a password" confirm="Open" onsubmit={(r) => switchTo(p.id, r.password ?? undefined)} onclose={() => (unlocking = null)} />
{/if}
{#if creating}
  <ProfileDialog mode="new" title="New profile" sub="your own stars, settings and tags · images and tags stay shared" confirm="Create" onsubmit={create} onclose={() => (creating = false)} />
{/if}

<style>
  /* The whole area under the top bar, so a right-click anywhere gets the app's menu. */
  .picker { min-height: calc(100vh - 56px); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 16px; }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 28px 16px 20px;
    color: var(--text);
    font: inherit;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .card:hover { border-color: var(--text2); background: var(--surface); }
  .card.current { border-color: var(--accent); }
  .name { font-size: 18px; font-weight: 600; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { color: var(--text2); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
  .add { color: var(--text2); border-style: dashed; }
  .plus { display: grid; place-items: center; width: 96px; height: 96px; border: 1px dashed var(--line); font: 300 48px/1 var(--font-display); }
</style>
