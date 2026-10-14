<script lang="ts">
  import type { Component } from 'svelte';

  /** A page or dialog loaded on first use (its own chunk of the bundle); props are passed through. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { load, ...rest }: { load: () => Promise<{ default: Component<any> }> } & Record<string, unknown> = $props();
</script>

{#await load() then m}
  <m.default {...rest} />
{/await}
