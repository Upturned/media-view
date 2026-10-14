<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { href, navigate } from '../router.svelte.ts';
  import { library } from '../stores/library.svelte.ts';
  import { openMenu } from '../stores/menu.svelte.ts';

  const modules = [
    { id: 'images', name: 'Images', path: '/images', active: true },
    { id: 'videos', name: 'Videos', path: null, active: false },
    { id: 'audio', name: 'Audio', path: null, active: false },
    { id: 'texts', name: 'Text-Writer', path: null, active: false },
  ] as const;
  type Module = (typeof modules)[number];

  const open = (m: Module) => {
    if (m.path) navigate(m.path);
  };

  /** Right-click a card: Open (the same as clicking it). */
  function cardMenu(e: MouseEvent, m: Module) {
    openMenu(e, m.name, [{ label: m.active ? 'Open' : 'Open · coming soon', disabled: !m.active, action: () => open(m) }]);
  }

  /** Right-click anywhere else: every module, to go to one. */
  function pageMenu(e: MouseEvent) {
    openMenu(e, 'Modules', modules.map((m) => ({ label: m.active ? m.name : `${m.name} · coming soon`, disabled: !m.active, action: () => open(m) })));
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="hub" oncontextmenu={pageMenu}>
  <div class="page">
    <div class="page-header">
      <div>
        <div class="label">Library</div>
        <h1>{library.info?.name}</h1>
      </div>
      <div class="mono path" title={library.info?.path}>{library.info?.path}</div>
    </div>

    <div class="modules">
      {#each modules as m (m.id)}
        {#if m.active && m.path}
          <a class="module panel active" href={href(m.path)} oncontextmenu={(e) => cardMenu(e, m)}>
            <span class="icon"><Icon name={m.id} size={32} /></span>
            <span class="name">{m.name}</span>
            <span class="meta mono">
              {library.info?.stats.files ?? 0} images · {library.info?.stats.inboxFiles ?? 0} in Inbox
            </span>
          </a>
        {:else}
          <div class="module panel" aria-disabled="true" oncontextmenu={(e) => cardMenu(e, m)}>
            <span class="icon"><Icon name={m.id} size={32} /></span>
            <span class="name">{m.name}</span>
            <span class="meta label">Coming soon</span>
          </div>
        {/if}
      {/each}
    </div>
  </div>
</div>

<style>
  /* The whole area under the top bar, so a right-click anywhere gets the app's menu. */
  .hub { min-height: calc(100vh - 56px); }

  .path { color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 50%; }

  .modules { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }

  .module {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 200px;
    padding: 24px;
    text-decoration: none;
    color: var(--text2);
  }
  .module .icon { margin-bottom: auto; }
  .module .name { font-size: 20px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }

  .module.active { color: var(--text); transition: border-color 0.15s, background 0.15s; }
  .module.active .icon { color: var(--accent); }
  .module.active .meta { color: var(--text2); }
  .module.active::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--accent);
  }
  .module.active:hover { border-color: var(--text2); background: var(--surface2); }

  .module[aria-disabled='true'] { opacity: 0.55; border-style: dashed; }
</style>
