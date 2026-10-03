<script lang="ts">
  import { nameProblem } from '../names.ts';
  import DialogFrame from './DialogFrame.svelte';

  /** Asks for a new folder's name; `onsubmit` may throw to keep the dialog open and show the error. */
  let {
    title,
    label,
    sub = '',
    confirm = 'Create',
    initial = '',
    onsubmit,
    onclose,
  }: {
    title: string;
    label: string;
    sub?: string;
    confirm?: string;
    initial?: string;
    onsubmit: (name: string) => Promise<void>;
    onclose: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let value = $state(initial);
  let serverError = $state('');
  let busy = $state(false);

  const problem = $derived(value.trim() ? nameProblem(value) : '');
  const error = $derived(problem || serverError);

  $effect(() => {
    void value;
    serverError = '';
  });

  async function submit(e?: SubmitEvent) {
    e?.preventDefault();
    if (!value.trim() || problem || busy) return;
    busy = true;
    try {
      await onsubmit(value);
      onclose();
    } catch (err) {
      serverError = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<DialogFrame {title} {sub} width={560} {onclose}>
  <form onsubmit={submit}>
    <span class="field-label">{label}</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input class="field" class:bad={!!error} bind:value autofocus spellcheck="false" maxlength="200" />
    <span class="msg" class:bad={!!error}>{error}</span>
  </form>
  {#snippet footer()}
    <span class="hint">Enter creates · Esc cancels</span>
    <button class="dbtn push" onclick={onclose}>Cancel</button>
    <button class="dbtn primary" disabled={!value.trim() || !!problem || busy} onclick={() => submit()}>{confirm}</button>
  {/snippet}
</DialogFrame>

<style>
  form { padding: 20px; display: flex; flex-direction: column; gap: 8px; }
</style>
