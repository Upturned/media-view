<script lang="ts">
  /** Small inline line icons (bundled, offline). */
  const PATHS = {
    palette: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-7.8-9-7.8ZM7.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-1.5.1-1.5-.1-1.5 2-1.6-2-3.4-2.4 1a7 7 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7 7 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6-.1 1.5.1 1.5-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7 7 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.6Z',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-11.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01',
    close: 'M6 6l12 12M18 6 6 18',
    images: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6M15.5 9.5h.01',
    videos: 'M3 6h13v12H3zM16 10l5-3v10l-5-3',
    audio: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    texts: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
    folder: 'M3 6h6l2 2h10v11H3z',
    plus: 'M12 5v14M5 12h14',
  } as const;

  let { name, size = 18 }: { name: keyof typeof PATHS; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
  stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
  <path d={PATHS[name]} />
</svg>
