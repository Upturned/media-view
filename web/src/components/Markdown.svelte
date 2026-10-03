<script lang="ts">
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';

  let { source }: { source: string } = $props();
  const html = $derived(DOMPurify.sanitize(marked.parse(source, { async: false })));
</script>

<div class="md">{@html html}</div>

<style>
  .md :global(h1), .md :global(h2), .md :global(h3) { margin: 1.2em 0 0.4em; text-transform: uppercase; letter-spacing: 0.04em; font-size: 14px; }
  .md :global(h1:first-child), .md :global(h2:first-child) { margin-top: 0; }
  .md :global(p), .md :global(ul) { margin: 0 0 0.8em; color: var(--text); }
  .md :global(table) { width: 100%; margin: 0 0 1em; border-collapse: collapse; font-size: 13px; }
  .md :global(th) { padding: 6px 8px; border-bottom: 1px solid var(--text2); text-align: left; font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .md :global(td) { padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .md :global(td:first-child) { white-space: nowrap; }
  .md :global(li) { margin-bottom: 0.3em; }
  .md :global(code) { font-family: var(--font-mono); font-size: 0.9em; padding: 1px 5px; background: var(--surface2); border-radius: var(--radius); }
  .md :global(strong) { color: var(--text); }
  .md :global(a) { color: var(--accent); }
</style>
