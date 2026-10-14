<script lang="ts">
  import type { ProfileRole, TagSuggestion } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import { segmented } from '../kbd.svelte.ts';
  import { fmt } from '../media.ts';
  import { linkTag, ROLE_LABEL } from '../stores/profile.svelte.ts';
  import { inkFor, typeColor, typeOf } from '../stores/tags.svelte.ts';
  import { toastError } from '../stores/toasts.svelte.ts';
  import DialogFrame from './DialogFrame.svelte';

  /** Link a tag to the profile in use (docs/profiles.md §5): find it, pick the role. */
  let { role: initialRole = 'creator', onclose }: { role?: ProfileRole; onclose: () => void } = $props();

  // svelte-ignore state_referenced_locally
  let role = $state<ProfileRole>(initialRole);
  let q = $state('');
  let found = $state<TagSuggestion[]>([]);
  let picked = $state<TagSuggestion | null>(null);
  let error = $state('');
  let busy = $state(false);

  $effect(() => {
    const text = q.trim();
    picked = null;
    error = '';
    if (!text) {
      found = [];
      return;
    }
    const t = setTimeout(() => {
      unwrap(client.api.tags.suggest.$get({ query: { q: text, limit: '12' } }))
        .then((r) => (found = r.tags))
        .catch(toastError);
    }, 150);
    return () => clearTimeout(t);
  });

  async function link() {
    if (!picked || busy) return;
    busy = true;
    try {
      await linkTag(picked.id, role);
      onclose();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<DialogFrame title="Link a tag" sub="this tag is you · its images show on your profile" width={560} {onclose}>
  <div class="body">
    <div class="row">
      <span class="field-label">As</span>
      <div class="seg" use:segmented>
        <button class:on={role === 'creator'} onclick={() => (role = 'creator')} title="Your artist name, your studio, your pen name">Creator · {ROLE_LABEL.creator}</button>
        <button class:on={role === 'subject'} onclick={() => (role = 'subject')} title="You as a model, your self-portrait tag, a character you play">Subject · {ROLE_LABEL.subject}</button>
      </div>
    </div>
    <!-- svelte-ignore a11y_autofocus -->
    <input class="field" bind:value={q} placeholder="find a tag…" spellcheck="false" autofocus onkeydown={(e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (picked) void link();
        else if (found[0]) picked = found[0];
      }
    }} />
    <div class="found">
      {#each found as t (t.id)}
        {@const c = typeColor(t.typeId)}
        <button class="hit" class:on={picked?.id === t.id} onclick={() => (picked = t)} ondblclick={() => { picked = t; void link(); }}>
          <span class="chip" style:--c={c} style:--ink={inkFor(c)}>{t.name}</span>
          <span class="type">{typeOf(t.typeId)?.name ?? ''}</span>
          <span class="n">{fmt(t.count)}</span>
        </button>
      {:else}
        {#if q.trim()}<p class="none">No tag matches.</p>{/if}
      {/each}
    </div>
    <span class="msg" class:bad={!!error}>{error}</span>
  </div>
  {#snippet footer()}
    <span class="hint">Enter picks, then links · Esc cancels</span>
    <button class="dbtn push" onclick={onclose}>Cancel</button>
    <button class="dbtn primary" disabled={!picked || busy} onclick={() => void link()}>Link{picked ? ` “${picked.name}”` : ''}</button>
  {/snippet}
</DialogFrame>

<style>
  .body { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  .row { display: flex; align-items: center; gap: 12px; }
  .seg { display: inline-flex; flex-wrap: wrap; }
  .seg button { height: 26px; padding: 0 10px; margin-right: -1px; border: 1px solid var(--line); background: transparent; color: var(--text2); font: 10px var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; }
  .seg button.on { background: var(--text); color: var(--bg2); border-color: var(--text); }
  .found { display: flex; flex-direction: column; max-height: 300px; overflow-y: auto; }
  .hit { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border: none; border-bottom: 1px solid var(--surface2); background: none; color: var(--text); text-align: left; cursor: pointer; }
  .hit:hover { background: var(--surface); }
  .hit.on { outline: 2px solid var(--accent); outline-offset: -2px; }
  .chip { padding: 3px 8px; background: var(--c); color: var(--ink); font-size: 12.5px; }
  .type { color: var(--text2); font: 11px var(--font-mono); text-transform: uppercase; }
  .n { margin-left: auto; color: var(--text2); font: 11px var(--font-mono); }
  .none { margin: 0; color: var(--text2); font-size: 13px; }
</style>
