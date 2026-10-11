<script lang="ts">
  import type { HealthReport } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import { fmt } from '../media.ts';
  import { href } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { report as reportResult, when } from '../stores/health.svelte.ts';
  import { library } from '../stores/library.svelte.ts';
  import { toastError } from '../stores/toasts.svelte.ts';
  import ApplyAllDialog, { type ApplyLine } from './ApplyAllDialog.svelte';

  /**
   * The Library Health header (design M7 · 01): last scan, Rescan, and Apply to all — which lists
   * what it can do by severity (red and amber ticked, blue for you to tick), and skips what needs a
   * choice.
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

  /** What Apply to all can do (§7.4 defaults), by severity. */
  const plan = $derived.by(() => {
    if (!report) return { lines: [] as ApplyLine[], skipped: 0 };
    const n = (k: string) => report!.issues.filter((i) => i.kind === k).length;
    const s = (x: number, one: string, many = `${one}s`) => `${fmt(x)} ${x === 1 ? one : many}`;
    const loose = report.issues.filter((i) => i.details.kind === 'loose_files' && i.details.folderId !== null).length;
    const clearDups = report.issues.filter((i) => i.details.kind === 'duplicate' && i.details.keepId !== null && i.details.reason !== 'different-tags' && i.details.reason !== 'two-starred').length;
    const lines: (ApplyLine | 0)[] = [
      n('missing_folder') && { section: 'red', kind: 'missing_folder', action: 'recreate', name: `Recreate ${s(n('missing_folder'), 'missing folder')} and their markers`, note: 'never Forget', on: true },
      n('external_move') && { section: 'amber', kind: 'external_move', action: 'keep', name: `Keep ${s(n('external_move'), 'change')} made outside the app`, note: 'nothing moves', on: true },
      n('nested_in_album') && { section: 'amber', kind: 'nested_in_album', action: 'move-out', name: `Move ${s(n('nested_in_album'), 'folder')} out of albums`, note: 'next to the album', on: true },
      n('unmarked_folder') && { section: 'amber', kind: 'unmarked_folder', action: 'confirm', name: `Confirm ${s(n('unmarked_folder'), 'guessed folder kind')}`, note: 'markers written', on: true },
      loose && { section: 'amber', kind: 'loose_files', action: 'new-album', name: `Put loose images into ${s(loose, 'new album')}`, note: 'named below', on: true },
      clearDups && { section: 'blue', kind: 'duplicate', action: 'keep-one', name: `Keep the suggested copy in ${s(clearDups, 'duplicate group')}`, note: 'others → Recycle Bin', on: false },
    ];
    const skipped = n('missing_file') + n('ambiguous_move') + n('unsupported') + n('wrong_type') + (n('loose_files') - loose);
    return { lines: lines.filter((x): x is ApplyLine => !!x), skipped };
  });

  let applying = $state(false);

  async function applyAll(steps: ApplyLine[], albumName: string | undefined) {
    applying = false;
    try {
      const r = await unwrap(client.api.health['fix-everything'].$post({ json: { albumName, steps: steps.map((l) => ({ kind: l.kind, action: l.action as 'keep' })) } }));
      reportResult(r, steps.some((l) => l.kind === 'duplicate'));
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
    {#if report && (report.summary.error || report.summary.warning || plan.lines.length)}
      <button class="btn primary" onclick={() => (applying = true)} disabled={scanning}>Apply to all…</button>
    {/if}
  </div>
</header>
{#if applying}
  <ApplyAllDialog lines={plan.lines} skipped={plan.skipped} onapply={applyAll} onclose={() => (applying = false)} />
{/if}
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
