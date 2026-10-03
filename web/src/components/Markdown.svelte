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
  .md :global(li) { margin-bottom: 0.3em; }
  .md :global(code) { font-family: var(--font-mono); font-size: 0.9em; padding: 1px 5px; background: var(--surface2); border-radius: var(--radius); }
  .md :global(strong) { color: var(--text); }
  .md :global(a) { color: var(--accent); }
</style>
