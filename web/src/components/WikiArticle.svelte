<script lang="ts">
  import type { TagRef } from '@media-view/shared';
  import { live } from '../stores/events.svelte.ts';
  import { typeColor } from '../stores/tags.svelte.ts';
  import { toastError } from '../stores/toasts.svelte.ts';
  import { forgetLinks, renderWiki, resolveLinks, wikiLinks } from '../wiki.ts';

  /**
   * A wiki page's text (design M5 · 01): Markdown with tag links colored by type.
   * Missing links are dashed in amber; clicking one calls `onmissing` (to create the tag).
   */
  let {
    source,
    onmissing,
    onlinks,
  }: {
    source: string;
    onmissing: (ref: string) => void;
    /** The links and how they resolved, whenever they change (the editor's counts). */
    onlinks?: (links: Map<string, TagRef | null>) => void;
  } = $props();

  let links = $state(new Map<string, TagRef | null>());
  let seen = 0;

  $effect(() => {
    // Tags created, renamed or deleted elsewhere change what links resolve to.
    if (live.files !== seen) {
      seen = live.files;
      forgetLinks();
    }
    const refs = wikiLinks(source).map((l) => l.ref);
    const t = setTimeout(() => {
      resolveLinks(refs)
        .then((r) => {
          links = r;
          onlinks?.(r);
        })
        .catch(toastError);
    }, 150);
    return () => clearTimeout(t);
  });

  const html = $derived(renderWiki(source, links, typeColor));

  function click(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.wl.missing');
    if (!a) return;
    e.preventDefault();
    onmissing(a.dataset['ref'] ?? '');
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<article class="wiki" onclick={click}>{@html html}</article>

<style>
  .wiki { max-width: 760px; font-size: 16px; line-height: 1.6; overflow-wrap: anywhere; }
  .wiki :global(h1), .wiki :global(h2), .wiki :global(h3) {
    font-family: var(--font-display);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .wiki :global(h1) { margin: 20px 0 8px; font-size: 40px; }
  .wiki :global(h2) { margin: 22px 0 8px; font-size: 28px; }
  .wiki :global(h3) { margin: 16px 0 6px; font-size: 20px; line-height: 1.1; }
  .wiki :global(:is(h1, h2, h3):first-child) { margin-top: 0; }
  .wiki :global(p) { margin: 0 0 12px; text-wrap: pretty; }
  .wiki :global(ul), .wiki :global(ol) { margin: 0 0 12px; padding-left: 16px; }
  .wiki :global(ul) { list-style: none; padding-left: 0; }
  .wiki :global(ul > li) { position: relative; padding-left: 16px; margin-bottom: 4px; }
  .wiki :global(ul > li)::before { content: ''; position: absolute; left: 0; top: 10px; width: 6px; height: 6px; background: var(--accent); }
  .wiki :global(blockquote) { margin: 6px 0 12px; padding-left: 14px; border-left: 3px solid var(--line); color: var(--text2); }
  .wiki :global(blockquote p) { margin: 0; }
  .wiki :global(code) { font-family: var(--font-mono); font-size: 0.88em; padding: 1px 5px; background: var(--surface2); }
  .wiki :global(hr) { border: none; border-top: 1px solid var(--line); margin: 20px 0; }
  .wiki :global(a) { color: var(--accent); }
  .wiki :global(a.wl) { color: var(--text); text-decoration: none; border-bottom: 2px solid var(--lc, var(--text2)); }
  .wiki :global(a.wl:hover) { background: var(--surface2); }
  .wiki :global(a.wl.missing) { color: var(--amber); border-bottom: 1px dashed var(--amber); }
  .wiki :global(a.wl.missing:hover) { background: color-mix(in oklab, var(--amber) 14%, transparent); }
  .wiki :global(a.wl sup) { margin-left: 3px; font: 9.5px var(--font-mono); text-transform: uppercase; }
  .wiki :global(table) { border-collapse: collapse; margin: 0 0 12px; font-size: 14px; }
  .wiki :global(th), .wiki :global(td) { padding: 5px 10px; border-bottom: 1px solid var(--line); text-align: left; }
  .wiki :global(img) { max-width: 100%; }
</style>
