<script lang="ts">
  import type { ThumbRef } from '@media-view/shared';
  import { thumbUrl } from '../media.ts';

  /** A thumbnail filling its box: `contain` keeps the whole frame visible, `cover` crops to fill. */
  let { file, fit = 'contain', alt = '' }: { file: ThumbRef | undefined; fit?: 'contain' | 'cover'; alt?: string } = $props();
  let failed = $state(false);

  $effect(() => {
    void file?.id;
    failed = false;
  });
</script>

{#if file && !failed}
  <img src={thumbUrl(file)} {alt} loading="lazy" decoding="async" draggable="false" style:object-fit={fit} onerror={() => (failed = true)} />
{:else}
  <div class="blank" class:broken={failed} title={failed ? 'This image could not be read' : undefined}></div>
{/if}

<style>
  img { display: block; width: 100%; height: 100%; }
  .blank {
    width: 100%;
    height: 100%;
    background: repeating-linear-gradient(135deg, var(--surface) 0 7px, var(--surface2) 7px 14px);
  }
  .blank.broken { background: repeating-linear-gradient(135deg, var(--surface) 0 7px, color-mix(in oklab, var(--red) 25%, var(--surface)) 7px 14px); }
</style>
