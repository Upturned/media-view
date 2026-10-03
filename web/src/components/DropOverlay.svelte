<script lang="ts">
  /** Full-area drop target shown while files are dragged over a page (design M2 drop boards). */
  let { target, headline, body }: { target: string; headline: string; body: string } = $props();
</script>

<div class="overlay">
  <div class="frame"></div>
  <span class="target">DROP TARGET → {target}</span>
  <span class="headline display">{headline}</span>
  <span class="body">{body}</span>
</div>

<style>
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 10px;
    padding: 0 80px;
    background: color-mix(in oklab, var(--accent) 30%, var(--scrim));
    pointer-events: none;
  }
  .frame { position: absolute; inset: 16px; border: 2px solid var(--accent); }
  .target { font: 12px var(--font-mono); letter-spacing: 0.1em; overflow-wrap: anywhere; }
  .headline { font-size: clamp(64px, 9vw, 150px); line-height: 0.85; white-space: pre-line; }
  .body { font-size: 16px; max-width: 720px; }
</style>
