<script lang="ts">
  import { registerKeys } from '../keymap.svelte.ts';
  import { closeMenu, menu } from '../stores/menu.svelte.ts';

  let el: HTMLDivElement | undefined = $state();
  let pos = $state({ left: 0, top: 0 });

  // Keep the menu inside the window.
  $effect(() => {
    if (!menu.open || !el) return;
    const r = el.getBoundingClientRect();
    pos = {
      left: Math.min(menu.x, window.innerWidth - r.width - 8),
      top: Math.min(menu.y, window.innerHeight - r.height - 8),
    };
  });

  $effect(() => {
    if (!menu.open) return;
    const close = () => closeMenu();
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('blur', close);
    const unregister = registerKeys('menu', [{ key: 'Escape', description: 'Close the menu', handler: close }]);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('blur', close);
      unregister();
    };
  });
</script>

{#if menu.open}
  <div class="menu" role="menu" tabindex="-1" bind:this={el} style:left="{pos.left || menu.x}px" style:top="{pos.top || menu.y}px"
    onpointerdown={(e) => e.stopPropagation()}>
    <span class="title">{menu.title}</span>
    {#each menu.items as item (item.label)}
      <button role="menuitem" class:danger={item.danger} class:separated={item.separated}
        onclick={() => { closeMenu(); item.action(); }}>
        {item.label}
      </button>
    {/each}
  </div>
{/if}

<style>
  .menu {
    position: fixed;
    z-index: 70;
    width: 240px;
    display: flex;
    flex-direction: column;
    background: var(--bg2);
    border: 1px solid var(--text);
    font: 12px var(--font-mono);
    text-transform: uppercase;
  }
  .title {
    padding: 7px 12px;
    background: var(--text);
    color: var(--bg);
    font: 700 14px/1.1 var(--font-display);
    letter-spacing: 0.04em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button {
    display: flex;
    align-items: center;
    height: 30px;
    padding: 0 12px;
    border: none;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  button:hover, button:focus-visible { background: var(--surface2); outline: none; }
  button.separated { border-top: 1px solid var(--line); }
  button.danger { color: var(--red); }
</style>
