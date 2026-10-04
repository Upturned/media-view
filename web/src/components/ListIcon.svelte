<script lang="ts">
  /** The collection mark (design M6): a numbered list, three bullets and lines. */
  let { size = 12 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style="flex: none;">
  <rect x="1" y="2" width="3" height="3" fill="currentColor" />
  <rect x="6" y="2.8" width="9" height="1.5" fill="currentColor" />
  <rect x="1" y="6.5" width="3" height="3" fill="currentColor" />
  <rect x="6" y="7.3" width="9" height="1.5" fill="currentColor" />
  <rect x="1" y="11" width="3" height="3" fill="currentColor" />
  <rect x="6" y="11.8" width="9" height="1.5" fill="currentColor" />
</svg>
