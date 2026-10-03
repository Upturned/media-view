<script lang="ts">
  import { client, unwrap } from '../api.ts';
  import { formatSize } from '../media.ts';
  import { cancelImport, closeImport, imports, report, retryUnreadable, visibleJob } from '../stores/imports.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';

  /** Docked, non-blocking import progress with a per-file report (design M3 · 06). */

  const job = $derived(visibleJob());
  let tab = $state<'rejected' | 'renamed' | 'copied'>('rejected');

  const total = $derived(job?.items.length ?? 0);
  const results = $derived(job ? job.items.filter((i) => i.result) : []);
  const rejected = $derived(results.filter((i) => i.result!.status === 'rejected' || i.result!.status === 'skipped'));
  const renamed = $derived(results.filter((i) => i.result!.status === 'renamed'));
  const copied = $derived(results.filter((i) => i.result!.status === 'copied' || i.result!.status === 'renamed'));
  const running = $derived(job?.status === 'running' || job?.status === 'waiting');
  const bytesDone = $derived(copied.reduce((s, i) => s + i.size, 0));
  const unreadable = $derived(rejected.some((i) => i.result!.reason?.startsWith('Couldn’t read')));
  const title = $derived(
    !job ? '' : job.status === 'cancelled' ? 'Import cancelled' : running ? `Importing ${total} ${total === 1 ? 'file' : 'files'}` : 'Import finished',
  );

  // Show the rejected tab first when there's something in it; otherwise what was copied.
  $effect(() => {
    if (!running && rejected.length === 0) tab = 'copied';
  });

  const rows = $derived(
    tab === 'rejected' ? rejected.map((i) => ({ name: i.name, reason: i.result!.reason ?? '', dot: 'var(--amber)' }))
      : tab === 'renamed' ? renamed.map((i) => ({ name: i.name, reason: i.result!.reason ?? '', dot: 'var(--blue)' }))
      : [...copied].reverse().slice(0, 200).map((i) => ({
        name: i.result!.savedAs ?? i.name,
        reason: i.result!.status === 'renamed' ? 'Copied · renamed to avoid a clash' : `Copied · ${formatSize(i.size)}`,
        dot: i.result!.status === 'renamed' ? 'var(--blue)' : 'var(--line)',
      })),
  );

  async function copyReport() {
    if (!job) return;
    try {
      await navigator.clipboard.writeText(report(job));
      toast(`Report copied to the clipboard (${results.length} lines).`);
    } catch (err) {
      toastError(err);
    }
  }

  function openLog() {
    unwrap(client.api.system['open-logs'].$post()).catch(toastError);
  }
</script>

{#if job}
  <section class="panel" aria-live="polite">
    <header>
      <div class="titles">
        <span class="title">{title}</span>
        <span class="target">→ {job.targetLabel}</span>
      </div>
      <button class="icon" onclick={() => (imports.minimized = !imports.minimized)} title={imports.minimized ? 'Expand' : 'Minimize'}>{imports.minimized ? '▴' : '▾'}</button>
      <button class="icon" onclick={() => (running ? cancelImport() : closeImport())} title={running ? 'Cancel import' : 'Close'}>✕</button>
    </header>

    <div class="progress">
      <div class="bar"><div style:width="{total ? (job.done / total) * 100 : 0}%" class:done={!running} class:cancelled={job.status === 'cancelled'}></div></div>
      <div class="line">
        <span class="count">{job.done} / {total}</span>
        <span class="current">{running ? job.current : job.status === 'cancelled' ? 'Stopped — files already copied were kept' : `${rejected.length} not imported · see report`}</span>
        <span>{formatSize(bytesDone)}</span>
      </div>
      <div class="stats">
        <div><b>{copied.length}</b><span>copied</span></div>
        <div><b class="blue">{renamed.length}</b><span>renamed</span></div>
        <div><b class="amber">{rejected.length}</b><span>not imported</span></div>
      </div>
    </div>

    {#if !imports.minimized}
      <div class="tabs">
        <button class:on={tab === 'rejected'} onclick={() => (tab = 'rejected')}>Not imported {rejected.length}</button>
        <button class:on={tab === 'renamed'} onclick={() => (tab = 'renamed')}>Renamed {renamed.length}</button>
        <button class:on={tab === 'copied'} onclick={() => (tab = 'copied')}>Copied {copied.length}</button>
      </div>
      <div class="rows">
        {#each rows as r, i (i)}
          <div class="row">
            <span class="dot" style:background={r.dot}></span>
            <div class="text">
              <span class="name" title={r.name}>{r.name}</span>
              <span class="reason">{r.reason}</span>
            </div>
          </div>
        {:else}
          <div class="none">Nothing here yet.</div>
        {/each}
      </div>
      <footer>
        {#if running}
          <span class="note">Keep working — this runs in the background</span>
          <button class="push" onclick={cancelImport}>Cancel import</button>
        {:else}
          <button onclick={copyReport}>Copy report</button>
          <button class="joined" onclick={openLog}>Open log</button>
          {#if unreadable}<button class="joined" onclick={() => retryUnreadable(job)}>Retry unreadable</button>{/if}
          <button class="push done" onclick={closeImport}>Done</button>
        {/if}
      </footer>
    {/if}
  </section>
{/if}

<style>
  .panel {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 90;
    width: min(520px, calc(100vw - 48px));
    max-height: min(760px, calc(100vh - 100px));
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--text);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  }
  header { display: flex; align-items: stretch; border-bottom: 1px solid var(--line); }
  .titles { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; padding: 14px 16px 12px; }
  .title { font: 700 24px/0.95 var(--font-display); text-transform: uppercase; }
  .target { font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .icon { width: 48px; border: none; border-left: 1px solid var(--line); background: none; color: var(--text); font: 14px var(--font-mono); cursor: pointer; }
  .icon:hover { background: var(--surface2); }

  .progress { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
  .bar { height: 6px; background: var(--surface2); }
  .bar div { height: 100%; background: var(--accent); transition: width 0.15s; }
  .bar div.done { background: var(--text); }
  .bar div.cancelled { background: var(--text2); }
  .line { display: flex; align-items: baseline; gap: 10px; font: 11.5px var(--font-mono); color: var(--text2); }
  .count { font: 700 26px/1 var(--font-display); color: var(--text); }
  .current { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--line); font: 10.5px var(--font-mono); text-transform: uppercase; }
  .stats div { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; }
  .stats div + div { border-left: 1px solid var(--line); }
  .stats b { font: 700 22px/1 var(--font-display); }
  .stats b.blue { color: var(--blue); }
  .stats b.amber { color: var(--amber); }
  .stats span { color: var(--text2); }

  .tabs { display: flex; height: 36px; border-bottom: 1px solid var(--line); font: 11px var(--font-mono); text-transform: uppercase; }
  .tabs button { padding: 0 14px; border: none; border-right: 1px solid var(--line); background: none; color: var(--text2); font: inherit; font-weight: 700; cursor: pointer; text-transform: inherit; }
  .tabs button.on { background: var(--surface2); color: var(--text); }
  .rows { flex: 1; min-height: 0; max-height: 380px; overflow-y: auto; background: var(--bg2); }
  .row { display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 10px; padding: 9px 16px; border-bottom: 1px solid var(--line); }
  .dot { width: 10px; height: 10px; margin-top: 4px; }
  .text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .name { font: 12.5px var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .reason { font-size: 12.5px; color: var(--text2); line-height: 1.4; }
  .none { padding: 20px 16px; font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }

  footer { display: flex; align-items: center; gap: 0; padding: 12px 16px; border-top: 1px solid var(--line); font: 11px var(--font-mono); text-transform: uppercase; }
  .note { color: var(--text2); }
  footer button { height: 32px; padding: 0 12px; border: 1px solid var(--line); background: none; color: var(--text); font: inherit; cursor: pointer; text-transform: inherit; }
  footer button.joined { border-left: none; }
  footer button:hover { border-color: var(--text); }
  footer .push { margin-left: auto; }
  footer .done { border: none; background: var(--accent); color: var(--accent-ink); font-weight: 700; padding: 0 16px; }
</style>
