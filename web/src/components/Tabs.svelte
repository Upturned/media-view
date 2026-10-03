<script lang="ts">
  let {
    tabs,
    active = $bindable(),
  }: { tabs: readonly { id: string; label: string; hint?: string }[]; active: string } = $props();
</script>

<div class="tabs" role="tablist">
  {#each tabs as tab (tab.id)}
    <button role="tab" aria-selected={active === tab.id} class:active={active === tab.id} onclick={() => (active = tab.id)}>
      {tab.label}
      {#if tab.hint}<span class="hint">{tab.hint}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .tabs { display: flex; gap: 0; border-bottom: 1px solid var(--line); padding: 0 12px; flex-shrink: 0; }
  button {
    padding: 12px 14px 10px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--text2);
    font: inherit;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: var(--label-spacing);
    cursor: pointer;
  }
  button:hover { color: var(--text); }
  button.active { color: var(--text); border-bottom-color: var(--accent); }
  .hint { margin-left: 6px; color: var(--text2); text-transform: none; letter-spacing: 0; font-size: 11px; }
</style>
