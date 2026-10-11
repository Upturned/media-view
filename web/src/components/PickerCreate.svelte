<script lang="ts">
  import { client, unwrap } from '../api.ts';
  import { nameProblem } from '../names.ts';
  import { toastError } from '../stores/toasts.svelte.ts';
  import { word } from '../themes/index.ts';
  import type FolderPicker from './FolderPicker.svelte';
  import type { PickerNode } from './FolderPicker.svelte';

  type Creatable = 'category' | 'subcategory' | 'album';

  /**
   * "+ New …" under a folder picker: a category at the top level, a sub-category or an album inside
   * a category / sub-category — the ones `allow` lists. The new folder is selected in the tree.
   */
  let { node, picker, allow, oncreated }: {
    /** The picked node (where the new folder goes). */
    node: PickerNode | undefined;
    picker: FolderPicker | undefined;
    allow: Creatable[];
    oncreated?: (id: number) => void;
  } = $props();

  const kinds = $derived.by((): Creatable[] => {
    if (!node) return [];
    const here: Creatable[] = node.kind === 'root' ? ['category'] : node.kind === 'category' || node.kind === 'subcategory' ? ['subcategory', 'album'] : [];
    return here.filter((k) => allow.includes(k));
  });
  let making = $state<Creatable | null>(null);
  let name = $state('');
  let busy = $state(false);
  const problem = $derived(name.trim() ? nameProblem(name) : '');

  // Another folder picked: start over.
  $effect(() => {
    void node?.id;
    making = null;
  });

  const label = (k: Creatable) => word(k === 'category' ? 'category' : k === 'subcategory' ? 'subcategory' : 'album');

  function start(k: Creatable) {
    making = k;
    name = '';
  }

  async function create(e: SubmitEvent) {
    e.preventDefault();
    if (!node || !making || !name.trim() || problem || busy) return;
    busy = true;
    try {
      const card = await unwrap(client.api.folders.$post({ json: { parentId: node.id === 0 ? null : node.id, kind: making, name: name.trim() } }));
      making = null;
      await picker?.reload();
      picker?.reveal(card.id);
      oncreated?.(card.id);
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
    }
  }
</script>

{#if kinds.length && node}
  <div class="create">
    {#if making}
      <form onsubmit={create}>
        <span class="lab">New {label(making).toLowerCase()} in {node.name}</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={name} placeholder="{label(making)} name" autofocus spellcheck="false" maxlength="200" class:bad={!!problem} title={problem} />
        <button type="submit" disabled={!name.trim() || !!problem || busy}>Create</button>
        <button type="button" onclick={() => (making = null)}>Cancel</button>
      </form>
    {:else}
      {#each kinds as k (k)}
        <button onclick={() => start(k)}>+ New {label(k).toLowerCase()}{node.id === 0 ? '' : ` in ${node.name}`}</button>
      {/each}
    {/if}
  </div>
{/if}

<style>
  .create { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font: 12px var(--font-mono); }
  form { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
  .lab { color: var(--text2); text-transform: uppercase; white-space: nowrap; }
  button, input { height: 30px; padding: 0 12px; border: 1px solid var(--line); background: none; color: var(--text); font: inherit; text-transform: uppercase; cursor: pointer; white-space: nowrap; }
  button:hover:not(:disabled) { border-color: var(--text); }
  button:disabled { opacity: 0.5; cursor: default; }
  input { flex: 1; min-width: 140px; text-transform: none; cursor: text; background: var(--bg2); border-color: var(--text); outline: none; }
  input.bad { border-color: var(--red); }
</style>
