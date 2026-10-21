<script lang="ts" module>
  /**
   * new: name and an optional password · rename: the name · password: set, change or remove the
   * password of the profile in use · unlock: a protected profile's password (to open or delete it).
   */
  export type ProfileDialogMode = 'new' | 'rename' | 'password' | 'unlock';
  export interface ProfileDialogResult {
    name: string;
    /** new / password: the new password (null = none, or removed) · unlock: the password typed. */
    password: string | null;
    /** password: the current one, when the profile has one. */
    current?: string;
  }
</script>

<script lang="ts">
  import DialogFrame from './DialogFrame.svelte';

  /** One dialog for the profile forms; `onsubmit` may throw to keep it open and show the error. */
  let {
    mode,
    title,
    sub = '',
    confirm,
    initialName = '',
    hasPassword = false,
    onsubmit,
    onclose,
  }: {
    mode: ProfileDialogMode;
    title: string;
    sub?: string;
    confirm: string;
    initialName?: string;
    /** password mode: the profile has one now (asks for it, and offers Remove). */
    hasPassword?: boolean;
    onsubmit: (r: ProfileDialogResult) => Promise<void>;
    onclose: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(initialName);
  let current = $state('');
  let next = $state('');
  let again = $state('');
  let serverError = $state('');
  let busy = $state(false);

  const withName = $derived(mode === 'new' || mode === 'rename');
  const withNew = $derived(mode === 'new' || mode === 'password');
  const problem = $derived(
    withName && name.trim().length > 50 ? 'Names can be up to 50 characters.'
    : withNew && next !== again && again ? 'The two passwords don’t match.'
    : '',
  );
  const ready = $derived(
    !problem && !busy
    && (!withName || !!name.trim())
    && (mode !== 'unlock' || !!current)
    && (mode !== 'password' || (!!next && next === again && (!hasPassword || !!current)))
    && (mode !== 'new' || next === again),
  );
  const error = $derived(problem || serverError);

  $effect(() => {
    void [name, current, next, again];
    serverError = '';
  });

  async function run(result: ProfileDialogResult) {
    busy = true;
    try {
      await onsubmit(result);
      onclose();
    } catch (err) {
      serverError = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  function submit(e?: SubmitEvent) {
    e?.preventDefault();
    if (!ready) return;
    void run({
      name: name.trim(),
      password: mode === 'unlock' ? current : next || null,
      current: hasPassword ? current : undefined,
    });
  }
</script>

<DialogFrame {title} {sub} width={520} {onclose}>
  <form onsubmit={submit}>
    {#if withName}
      <label>
        <span class="field-label">Name</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="field" bind:value={name} autofocus spellcheck="false" maxlength="60" />
      </label>
    {/if}
    {#if mode === 'unlock' || (mode === 'password' && hasPassword)}
      <label>
        <span class="field-label">{mode === 'unlock' ? 'Password' : 'Current password'}</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="field" type="password" bind:value={current} autofocus autocomplete="current-password" maxlength="200" />
      </label>
    {/if}
    {#if withNew}
      <label>
        <span class="field-label">{mode === 'new' ? 'Password (optional)' : 'New password'}</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="field" type="password" bind:value={next} autofocus={mode === 'password' && !hasPassword} autocomplete="new-password" maxlength="200" />
      </label>
      {#if next}
        <label>
          <span class="field-label">Type it again</span>
          <input class="field" type="password" bind:value={again} autocomplete="new-password" maxlength="200" />
        </label>
      {/if}
      <p class="note">A password keeps others from using media-view as you. It doesn’t hide your images: anyone with access to this computer can still open the library folder.</p>
    {/if}
    <span class="msg" class:bad={!!error}>{error}</span>
    <button type="submit" hidden aria-hidden="true" tabindex="-1"></button>
  </form>
  {#snippet footer()}
    {#if mode === 'password' && hasPassword}
      <button class="dbtn" disabled={!current || busy} onclick={() => void run({ name: '', password: null, current })}>Remove password</button>
    {/if}
    <span class="hint">Enter {confirm.toLowerCase()} · Esc cancels</span>
    <button class="dbtn push" onclick={onclose}>Cancel</button>
    <button class="dbtn primary" disabled={!ready} onclick={() => submit()}>{confirm}</button>
  {/snippet}
</DialogFrame>

<style>
  form { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  label { display: flex; flex-direction: column; gap: 6px; }
  .note { margin: 0; color: var(--text2); font-size: 13px; line-height: 1.5; }
</style>
