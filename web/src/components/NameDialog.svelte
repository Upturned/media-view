<script lang="ts">
  import Modal from './Modal.svelte';

  /** Asks for a name; `onsubmit` may throw to keep the dialog open and show the error. */
  let {
    title,
    label,
    confirm = 'Create',
    initial = '',
    onsubmit,
    onclose,
  }: {
    title: string;
    label: string;
    confirm?: string;
    initial?: string;
    onsubmit: (name: string) => Promise<void>;
    onclose: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let value = $state(initial);
  let error = $state('');
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!value.trim() || busy) return;
    busy = true;
    error = '';
    try {
      await onsubmit(value);
      onclose();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<Modal {title} {onclose}>
  <form onsubmit={submit}>
    <label>
      <span class="label">{label}</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value autofocus spellcheck="false" maxlength="200" />
    </label>
    {#if error}<p class="error">{error}</p>{/if}
    <div class="actions">
      <button type="button" class="btn ghost" onclick={onclose}>Cancel</button>
      <button type="submit" class="btn primary" disabled={!value.trim() || busy}>{confirm}</button>
    </div>
  </form>
</Modal>

<style>
  form { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  label { display: flex; flex-direction: column; gap: 6px; }
  input {
    height: 40px;
    padding: 0 12px;
    border: 1px solid var(--line);
    background: var(--bg2);
    color: var(--text);
    font: 15px var(--font-ui);
    outline: none;
  }
  input:focus { border-color: var(--text); }
  .error { margin: 0; color: var(--red); font-size: 13px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
