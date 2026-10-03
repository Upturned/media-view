<script lang="ts">
  import LibraryActions from '../components/LibraryActions.svelte';
</script>

<div class="welcome">
  <div class="card panel">
    <div class="safelight" aria-hidden="true"></div>
    <h1>media-view</h1>
    <p>
      Your personal, offline media library. Choose the folder that holds your library, or create a new one — any folder
      works, and existing files are kept.
    </p>
    <LibraryActions />
  </div>
</div>

<style>
  .welcome { flex: 1; display: grid; place-items: center; padding: 32px 16px; }
  .card { position: relative; width: min(640px, 100%); padding: 40px; overflow: hidden; }
  .safelight {
    position: absolute;
    inset: 0 0 auto;
    height: 3px;
    background: var(--accent);
    box-shadow: 0 0 24px 2px var(--accent);
  }
  h1 { font-size: 32px; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 12px; }
  p { color: var(--text2); margin: 0 0 28px; max-width: 48ch; }
</style>
