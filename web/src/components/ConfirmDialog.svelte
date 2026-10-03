<script lang="ts">
  import { answer, confirmState } from '../stores/confirm.svelte.ts';
  import DialogFrame from './DialogFrame.svelte';

  const req = $derived(confirmState.request!);
  const edge = $derived(req.tone === 'danger' ? 'var(--red)' : req.tone === 'starred' ? 'var(--accent2)' : 'var(--text)');
  const foot = $derived(req.foot ?? (req.tone === 'danger' ? 'This can’t be undone' : req.tone === 'starred' ? 'Restorable from the Recycle Bin' : ''));
</script>

<DialogFrame title={req.title} sub={req.sub} width={580} {edge} onclose={() => answer(false)}>
  <div class="content">
    <p>{req.body}</p>
    {#if req.items?.length}
      <div class="items">
        {#each req.items as item, i (i)}
          <div class="item">
            <span class="dot" style:background={item.kept ? 'var(--accent2)' : 'var(--text2)'}></span>
            <span class="name" class:kept={item.kept}>{item.name}</span>
            <span class="note">{item.note}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
  {#snippet footer()}
    {#if foot}<span class="hint" style:color={req.tone === 'danger' ? 'var(--red)' : undefined}>{foot}</span>{/if}
    <button class="dbtn push" onclick={() => answer(false)}>{req.refusal ? 'OK' : 'Cancel'}</button>
    {#if !req.refusal}
      <!-- svelte-ignore a11y_autofocus -->
      <button class="dbtn" class:danger={req.tone === 'danger'} class:strong={req.tone !== 'danger'} autofocus onclick={() => answer(true)}>{req.button}</button>
    {/if}
  {/snippet}
</DialogFrame>

<style>
  .content { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px; }
  p { margin: 0; font-size: 15px; line-height: 1.5; }
  .items { display: flex; flex-direction: column; max-height: 220px; overflow-y: auto; border: 1px solid var(--line); font: 12px var(--font-mono); }
  .item { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-bottom: 1px solid var(--line); }
  .item:last-child { border-bottom: none; }
  .dot { width: 10px; height: 10px; flex: none; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name.kept { color: var(--text2); }
  .note { color: var(--text2); text-transform: uppercase; font-size: 11px; white-space: nowrap; }
</style>
