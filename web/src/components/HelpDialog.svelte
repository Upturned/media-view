<script lang="ts">
  import type { AboutInfo } from '@media-view/shared';
  import { onMount } from 'svelte';
  import { client, unwrap } from '../api.ts';
  import { keymap } from '../keymap.svelte.ts';
  import { closeDialog } from '../stores/ui.svelte.ts';
  import Markdown from './Markdown.svelte';
  import Modal from './Modal.svelte';
  import Tabs from './Tabs.svelte';

  let { page }: { page: string } = $props();

  const pages = import.meta.glob('../help/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const pageHelp = $derived(pages[`../help/${page}.md`] ?? 'There is no help for this page yet.');

  const tabs = [
    { id: 'page', label: 'This page' },
    { id: 'shortcuts', label: 'Shortcuts' },
    { id: 'formats', label: 'Formats' },
    { id: 'about', label: 'About' },
  ];
  let active = $state('page');
  let about = $state<AboutInfo | null>(null);

  onMount(async () => {
    about = await unwrap(client.api.system.about.$get());
  });

  /** Shortcuts grouped as Everywhere / This page, deduplicated by key. */
  const shortcuts = $derived.by(() => {
    const seen = new Set<string>();
    return keymap.bindings
      .filter((b) => !seen.has(b.key + b.scope) && seen.add(b.key + b.scope))
      .sort((a, b) => Number(a.scope !== 'global') - Number(b.scope !== 'global'));
  });

  const MODULE_NAMES = { images: 'Images', videos: 'Videos', audio: 'Audio', texts: 'Text-Writer' } as const;
</script>

<Modal title="Help" onclose={closeDialog}>
  <Tabs {tabs} bind:active />
  <section>
    {#if active === 'page'}
      <Markdown source={pageHelp} />
    {:else if active === 'shortcuts'}
      <table>
        <tbody>
          {#each shortcuts as b (b.key + b.scope)}
            <tr>
              <td><kbd>{b.key}</kbd></td>
              <td>{b.description}</td>
              <td class="label">{b.scope === 'global' ? 'Everywhere' : 'This page'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="muted">The full shortcut set is still being revised.</p>
    {:else if active === 'formats'}
      {#if about}
        <dl>
          {#each Object.entries(about.formats) as [module, formats] (module)}
            <dt class="label">{MODULE_NAMES[module as keyof typeof MODULE_NAMES]}</dt>
            <dd class="mono">{formats.length ? formats.map((f) => f.toUpperCase()).join(' · ') : 'Coming soon'}</dd>
          {/each}
        </dl>
      {/if}
    {:else if about}
      <div class="about">
        <div class="name">{about.name}</div>
        <div class="mono">version {about.version} · {about.releaseDate}</div>
        <p>Made by {about.credits} (Anthropic's AI).</p>
        <p class="muted">A personal, offline media library. Nothing leaves your computer.</p>
      </div>
    {/if}
  </section>
</Modal>

<style>
  section { padding: 20px; overflow: auto; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 0; border-bottom: 1px solid var(--line); }
  td:first-child { width: 110px; }
  td:last-child { text-align: right; }
  kbd {
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 2px 8px;
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    border-radius: var(--radius);
    background: var(--bg2);
  }
  .muted { color: var(--text2); font-size: 13px; }
  dl { margin: 0; display: grid; grid-template-columns: 140px 1fr; gap: 12px 16px; }
  dd { margin: 0; }
  .about .name { font-size: 24px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }
  .about .mono { color: var(--text2); margin-bottom: 16px; }
</style>
