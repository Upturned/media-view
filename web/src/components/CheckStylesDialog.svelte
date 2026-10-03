<script lang="ts">
  import { closeDialog } from '../stores/ui.svelte.ts';
  import { styleMockups } from '../themes/index.ts';
  import Modal from './Modal.svelte';
  import Tabs from './Tabs.svelte';

  let active: string = $state(styleMockups[1].id);
  const tabs = styleMockups.map((s) => ({ id: s.id, label: s.name, hint: s.note }));
</script>

<Modal title="Check styles" wide onclose={closeDialog}>
  <Tabs {tabs} bind:active />
  <p class="note">
    Design mockups of the styles being considered. They're previews only — clicking around inside them doesn't change
    the app.
  </p>
  {#key active}
    <iframe title="{active} style mockup" src="/styles/{active}.html" sandbox="allow-scripts"></iframe>
  {/key}
</Modal>

<style>
  .note { margin: 0; padding: 8px 20px; color: var(--text2); font-size: 12px; border-bottom: 1px solid var(--line); }
  iframe { flex: 1; width: 100%; border: 0; background: var(--bg2); }
</style>
