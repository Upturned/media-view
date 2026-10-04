<script lang="ts">
  import type { TagRef } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import { defaultType, inkFor, tagTypes, typeKeys } from '../stores/tags.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';
  import { knownLink, missingTarget } from '../wiki.ts';
  import DialogFrame from './DialogFrame.svelte';

  /** "Create tag · name" from a missing wiki link (design M5 · 01). */
  let { ref, onclose, oncreated }: { ref: string; onclose: () => void; oncreated?: (tag: TagRef) => void } = $props();

  const target = $derived(missingTarget(ref, typeKeys()));
  let typeId = $state<number | null>(null);
  const chosen = $derived(typeId ?? tagTypes.list.find((t) => t.key === target.typeKey)?.id ?? defaultType()?.id ?? 0);
  const color = $derived(tagTypes.list.find((t) => t.id === chosen)?.color ?? 'var(--line)');
  let busy = $state(false);

  async function create() {
    busy = true;
    try {
      const tag = await unwrap(client.api.tags.$post({ json: { name: target.name, typeId: chosen } }));
      knownLink(ref, tag);
      toast(`Created ${tagTypes.list.find((t) => t.id === tag.typeId)?.name.toLowerCase()} tag “${tag.name}”. Its links now resolve.`);
      oncreated?.(tag);
      onclose();
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
    }
  }
</script>

<DialogFrame title="Create tag · {target.name}" sub="from a link on this page · typed as [[{ref}]]" width={540} edge={color} {onclose}>
  <div class="body">
    <span class="field-label">Type</span>
    <div class="types">
      {#each tagTypes.list as t (t.id)}
        <button
          style:border-color={t.color}
          style:background={chosen === t.id ? t.color : 'transparent'}
          style:color={chosen === t.id ? inkFor(t.color) : 'var(--text)'}
          onclick={() => (typeId = t.id)}
        >{t.name}</button>
      {/each}
    </div>
    <p>The tag starts with no images and an empty wiki page. Every link to it starts working.</p>
  </div>
  {#snippet footer()}
    <button class="dbtn push" onclick={onclose}>Cancel</button>
    <button class="dbtn primary" onclick={create} disabled={busy}>Create tag</button>
  {/snippet}
</DialogFrame>

<style>
  .body { display: flex; flex-direction: column; gap: 8px; padding: 18px 20px; }
  .types { display: flex; flex-wrap: wrap; gap: 4px; }
  .types button { height: 30px; padding: 0 12px; border: 1px solid; font: 700 13px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; }
  p { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--text2); }
</style>
