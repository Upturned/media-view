<script lang="ts">
  import { ApiError, client, unwrap } from '../api.ts';
  import { nameProblem, splitExt } from '../names.ts';
  import { closeOps, type OpsDialog } from '../stores/ops.svelte.ts';
  import { toast } from '../stores/toasts.svelte.ts';
  import { word } from '../themes/index.ts';
  import DialogFrame from './DialogFrame.svelte';
  import Thumb from './Thumb.svelte';

  /** Rename an image (extension locked) or a folder (design M3 · 02). */
  let { dialog }: { dialog: Extract<OpsDialog, { kind: 'rename-file' | 'rename-folder' }> } = $props();

  const isFile = $derived(dialog.kind === 'rename-file');
  const original = $derived(dialog.kind === 'rename-file' ? splitExt(dialog.file.filename) : { base: dialog.folder.name, ext: '' });
  // svelte-ignore state_referenced_locally
  let value = $state(original.base);
  let serverError = $state('');
  let busy = $state(false);

  const problem = $derived(nameProblem(value));
  const unchanged = $derived(value.trim() === original.base);
  const error = $derived(problem || serverError);
  const ok = $derived(!error && !unchanged && !busy);

  $effect(() => {
    void value;
    serverError = '';
  });

  const kindWord = $derived(
    dialog.kind === 'rename-file' ? 'image'
      : dialog.folder.kind === 'album' ? 'album'
      : dialog.folder.kind === 'category' ? word('category').toLowerCase() : word('subcategory').toLowerCase(),
  );

  async function go() {
    if (!ok) return;
    busy = true;
    try {
      if (dialog.kind === 'rename-file') {
        await unwrap(client.api.files[':id'].$patch({ param: { id: String(dialog.file.id) }, json: { name: value } }));
      } else {
        await unwrap(client.api.folders[':id'].$patch({ param: { id: String(dialog.folder.id) }, json: { name: value } }));
      }
      toast(`Renamed to ${value.trim()}${original.ext}.`);
      closeOps();
    } catch (err) {
      if (err instanceof ApiError && err.status < 500) serverError = err.message;
      else toast((err as Error).message, 'error');
    } finally {
      busy = false;
    }
  }
</script>

<DialogFrame title="Rename {kindWord}" sub={dialog.kind === 'rename-file' ? `in ${dialog.where}` : ''} width={640} onclose={closeOps}>
  <form class="content" class:with-thumb={isFile} onsubmit={(e) => { e.preventDefault(); void go(); }}>
    {#if dialog.kind === 'rename-file'}
      <div class="thumb"><Thumb file={dialog.file} /></div>
    {/if}
    <div class="fields">
      <span class="field-label">{isFile ? 'File name' : 'Name'}</span>
      <div class="input" class:bad={!!error}>
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value autofocus spellcheck="false" maxlength="200" onfocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
        {#if original.ext}<span class="ext">{original.ext}</span>{/if}
      </div>
      <span class="msg" class:bad={!!error}>
        {error || (unchanged ? (isFile ? 'Stars and descriptions stay with the file.' : 'Everything inside stays with it.') : `→ ${value.trim()}${original.ext}`)}
      </span>
    </div>
  </form>
  {#snippet footer()}
    <span class="hint">Enter renames · Esc cancels</span>
    <button class="dbtn push" onclick={closeOps}>Cancel</button>
    <button class="dbtn primary" disabled={!ok} onclick={go}>Rename</button>
  {/snippet}
</DialogFrame>

<style>
  .content { display: grid; grid-template-columns: 1fr; gap: 20px; padding: 20px; }
  .content.with-thumb { grid-template-columns: 150px 1fr; }
  .thumb { aspect-ratio: 3 / 2; background: var(--thumb); outline: 1px solid var(--line); padding: 8px; }
  .fields { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .input { display: flex; align-items: stretch; height: 40px; border: 1px solid var(--text); background: var(--bg2); }
  .input.bad { border-color: var(--red); }
  input { flex: 1; min-width: 0; padding: 0 10px; border: none; background: none; color: var(--text); font: 13px var(--font-mono); outline: none; }
  .ext { display: flex; align-items: center; padding: 0 10px; border-left: 1px solid var(--line); color: var(--text2); font: 13px var(--font-mono); }
</style>
