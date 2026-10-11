<script lang="ts">
  import type { HealthReport } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import { fmt } from '../media.ts';
  import { href } from '../router.svelte.ts';
  import { ask } from '../stores/confirm.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { report as reportResult, when } from '../stores/health.svelte.ts';
  import { library } from '../stores/library.svelte.ts';
  import { toastError } from '../stores/toasts.svelte.ts';

  /**
   * The Library Health header (design M7 · 01): last scan, Rescan, and Apply to all — which covers
   * red and amber only, asks first with what it will do, and skips what needs a choice.
   */
  let { report, compact = false, crumb }: { report: HealthReport | null; compact?: boolean; crumb?: string } = $props();

  const scanning = $derived(live.scanning || library.info?.scan.status === 'scanning');

  async function rescan() {
    try {
      await unwrap(client.api.library.rescan.$post());
    } catch (err) {
      toastError(err);
    }
  }

  /** What Apply to all would do, in general terms (§7.4 defaults). */
  const plan = $derived.by(() => {
    if (!report) return { lines: [] as { name: string; note: string }[], skipped: 0 };
    const n = (k: string) => report!.issues.filter((i) => i.kind === k).length;
    const loose = report.issues.filter((i) => i.details.kind === 'loose_files' && i.details.folderId !== null).length;
    const lines = [
      n('missing_folder') && { name: `Recreate ${n('missing_folder')} missing ${n('missing_folder') === 1 ? 'folder' : 'folders'} and their markers`, note: 'never Forget' },
      n('external_move') && { name: `Keep ${n('external_move')} ${n('external_move') === 1 ? 'change' : 'changes'} made outside the app`, note: 'nothing moves' },
      n('nested_in_album') && { name: `Move ${n('nested_in_album')} ${n('nested_in_album') === 1 ? 'folder' : 'folders'} out of albums`, note: 'next to the album' },
      n('unmarked_folder') && { name: `Confirm ${n('unmarked_folder')} guessed folder ${n('unmarked_folder') === 1 ? 'kind' : 'kinds'}`, note: 'markers written' },
      loose && { name: `Put loose images into ${loose} new ${loose === 1 ? 'album' : 'albums'}`, note: '“Loose images”' },
    ].filter((x): x is { name: string; note: string } => !!x);
    const skipped = n('missing_file') + n('ambiguous_move') + n('unsupported') + n('wrong_type') + (n('loose_files') - loose);
    return { lines, skipped };
  });

  async function applyAll() {
    if (!report) return;
    const p = plan;
    const ok = await ask({
      tone: 'normal',
      title: 'Apply to all?',
      sub: 'red and amber · each item’s default fix',
      body: `${p.lines.length ? 'This will:' : 'Nothing here has a default fix.'}${p.skipped ? ` ${fmt(p.skipped)} ${p.skipped === 1 ? 'item needs' : 'items need'} your choice and will be skipped.` : ''} Blue items are left alone.`,
      items: p.lines.map((l) => ({ name: l.name, note: l.note })),
      button: p.lines.length ? 'Apply to all' : '',
      refusal: p.lines.length === 0,
      foot: 'No Undo for the whole batch · anything recycled is in the Recycle Bin',
    });
    if (!ok) return;
    try {
      reportResult(await unwrap(client.api.health['fix-everything'].$post()));
    } catch (err) {
      toastError(err);
    }
  }

  const checked = $derived(library.info ? `${fmt(library.info.stats.files)} images · ${fmt(library.info.stats.folders)} folders checked` : '');
</script>

<header class="head" class:compact>
  <div class="titles">
    <nav class="crumbs">
      <a href={href('/images')}>Library</a><span>/</span>
      {#if crumb}<a href={href('/health')}>Health</a><span>/</span><span class="here">{crumb}</span>{:else}<span class="here">Health</span>{/if}
    </nav>
    <h1 class="display title">Library Health</h1>
  </div>
  <div class="facts">
    <span>Last scan · <b>{when(report?.lastScan ?? null)}</b></span>
    {#if checked}<span>{checked}</span>{/if}
  </div>
  <div class="actions">
    <button class="btn" onclick={rescan} disabled={scanning}>{scanning ? 'Scanning…' : '↻ Rescan'}</button>
    {#if report && (report.summary.error || report.summary.warning)}
      <button class="btn primary" onclick={applyAll} disabled={scanning}>Apply to all…</button>
    {/if}
  </div>
</header>
{#if scanning}
  <div class="scanning">
    <div class="bar"><div></div></div>
    <span>Scanning · the list below is from the last scan ({when(report?.lastScan ?? null)}) and updates when this one ends · fixes are paused until then</span>
  </div>
{/if}

<style>
  .head { display: flex; align-items: flex-end; gap: 32px; flex-wrap: wrap; padding: 22px 40px 18px; border-bottom: 1px solid var(--line); flex: none; }
  .head.compact { padding: 16px 32px 14px; gap: 28px; }
  .titles { display: flex; flex-direction: column; gap: 12px; }
  .compact .titles { gap: 8px; }
  .crumbs { display: flex; align-items: center; gap: 8px; font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .crumbs a { color: var(--text2); text-decoration: none; }
  .crumbs a:hover { color: var(--text); }
  .here { color: var(--accent); }
  .title { font-size: clamp(64px, 8vw, 112px); line-height: 0.8; }
  .compact .title { font-size: 56px; line-height: 0.9; }
  .facts { display: flex; flex-direction: column; gap: 4px; padding-bottom: 4px; font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .facts b { color: var(--text); font-weight: 400; }
  .actions { margin-left: auto; display: flex; gap: 6px; }
  .actions .btn:first-child { min-width: 150px; }
  .scanning { display: flex; flex-direction: column; gap: 10px; padding: 16px 40px; border-bottom: 1px solid var(--line); background: var(--bg2); flex: none; }
  .scanning span { font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .bar { height: 6px; background: var(--surface2); overflow: hidden; }
  .bar div { width: 30%; height: 100%; background: var(--accent); animation: slide 1.4s ease-in-out infinite; }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
</style>
