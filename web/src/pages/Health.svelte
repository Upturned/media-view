<script lang="ts">
  import type { HealthReport } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import HealthHeader from '../components/HealthHeader.svelte';
  import { groupsOf, reviewHref, SECTIONS, type Group, type Section } from '../health.ts';
  import { fmt, formatSize } from '../media.ts';
  import { href, navigate } from '../router.svelte.ts';
  import { ask } from '../stores/confirm.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { applyToKind, when } from '../stores/health.svelte.ts';
  import { library } from '../stores/library.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';

  /**
   * Library Health (user guide §4.15, design M7 · 01): what needs attention, by severity. Each group
   * has its fix for the whole group (asked first) and Review ▸; the white notices, the format
   * statistics and the logs follow.
   */
  let report = $state<HealthReport | null>(null);

  $effect(() => {
    void live.health;
    void live.files;
    void live.folders;
    const t = setTimeout(() => {
      unwrap(client.api.health.$get()).then((r) => (report = r)).catch(toastError);
    }, 150);
    return () => clearTimeout(t);
  });

  const scanning = $derived(live.scanning || library.info?.scan.status === 'scanning');
  const groups = $derived(report ? groupsOf(report) : []);
  const bySection = $derived((['red', 'amber', 'blue', 'white'] as Section[]).map((s) => ({ section: s, ...SECTIONS[s], groups: groups.filter((g) => g.section === s) })).filter((s) => s.groups.length));
  const counts = $derived({
    red: groups.filter((g) => g.section === 'red').reduce((n, g) => n + g.issues.length, 0),
    amber: groups.filter((g) => g.section === 'amber').reduce((n, g) => n + g.issues.length, 0),
    blue: groups.filter((g) => g.section === 'blue').length,
  });
  const allClear = $derived(report !== null && counts.red + counts.amber + counts.blue === 0);
  const sub = (s: Section) => {
    const gs = groups.filter((g) => g.section === s);
    const short = (g: Group) =>
      g.key === 'untagged' ? `${fmt(report?.summary.untagged ?? 0)} untagged`
        : g.key === 'thumbnails' ? `${fmt(report?.thumbnails.count ?? 0)} old thumbnails`
        : g.key === 'duplicates' ? `${fmt(g.issues.length)} duplicate ${g.issues.length === 1 ? 'group' : 'groups'}`
        : g.key === 'untracked' ? `${fmt(report?.untracked.length ?? 0)} not tracked`
        : `${fmt(g.issues.length)} ${g.title.toLowerCase()}`;
    return gs.length ? gs.map(short).join(' · ') : '✓ all clear';
  };

  async function groupFix(g: Group) {
    if (g.key === 'thumbnails') return cleanThumbs();
    if (!g.fix) return;
    const ok = await ask({ tone: 'normal', title: `${g.fix.label}?`, sub: g.title, body: `${g.fix.does}.`, button: g.fix.label, foot: 'Each fix is logged' });
    if (!ok) return;
    for (const step of g.fix.steps) await applyToKind(step.kind, step.action);
  }

  async function cleanThumbs() {
    if (!report) return;
    const ok = await ask({
      tone: 'normal', title: 'Delete unused thumbnails?', sub: `${fmt(report.thumbnails.count)} thumbnails · ${formatSize(report.thumbnails.bytes)}`,
      body: 'These cached thumbnails belong to no image. Deleting them frees space; nothing in your library changes.', button: 'Delete',
    });
    if (!ok) return;
    try {
      const r = await unwrap(client.api.health.thumbnails.clean.$post());
      toast(`Deleted ${fmt(r.deleted)} unused thumbnails · ${formatSize(r.bytes)} freed`);
    } catch (err) {
      toastError(err);
    }
  }

  async function openLogs() {
    try {
      await unwrap(client.api.system['open-logs'].$post());
    } catch (err) {
      toastError(err);
    }
  }

  async function clearLogs() {
    if (!report) return;
    const ok = await ask({ tone: 'danger', title: 'Clear the logs?', sub: `${fmt(report.logs.files)} files · ${formatSize(report.logs.bytes)}`, body: 'The log files are deleted: errors, fixes and bulk operations recorded so far. New ones start right away.', button: 'Clear logs' });
    if (!ok) return;
    try {
      await unwrap(client.api.health.logs.$delete());
      toast('Logs cleared.');
      report = await unwrap(client.api.health.$get());
    } catch (err) {
      toastError(err);
    }
  }
</script>

<div class="health-page">
  <HealthHeader {report} />

  {#if report && allClear && !scanning}
    <div class="clear">
      <div class="pitch">
        <span class="display big">All in order.</span>
        <p>Every folder and image on disk matches what the app remembers. Nothing is missing, nothing needs a decision, and the badge in the top bar is gone. Changes you make in Explorer show up here the next time the app looks.</p>
        <span class="mono-note">last scan {when(report.lastScan)}</span>
      </div>
      <div class="tally">
        <div><span class="sq" style:background="var(--red)"></span>Missing<span>0</span></div>
        <div><span class="sq" style:background="var(--amber)"></span>Needs a decision<span>0</span></div>
        <div><span class="sq" style:background="var(--blue)"></span>Just so you know<span>0</span></div>
        <div><span class="sq" style:background="var(--surface2)"></span>Logs<span>{fmt(report.logs.files)} files · {formatSize(report.logs.bytes)}</span></div>
      </div>
    </div>
  {:else if report}
    <div class="body" class:dim={scanning}>
      <div class="summary">
        <div class="card" style:--c="var(--red)"><div class="n-row"><span class="n">{fmt(counts.red)}</span><span class="lbl">missing</span></div><span class="sub">{sub('red')}</span><span class="foot">counted in the badge</span></div>
        <div class="card" style:--c="var(--amber)"><div class="n-row"><span class="n">{fmt(counts.amber)}</span><span class="lbl">need a decision</span></div><span class="sub">{sub('amber')}</span><span class="foot">counted in the badge</span></div>
        <div class="card" style:--c="var(--blue)"><div class="n-row"><span class="n">{fmt(counts.blue)}</span><span class="lbl">just so you know</span></div><span class="sub">{sub('blue')}</span><span class="foot">not counted · a blue dot when only these are left</span></div>
      </div>

      {#each bySection as s (s.section)}
        <div class="sec-head">
          <div class="edge" style:background={s.color}></div>
          <div class="sec-titles"><span class="sec-title">{s.title}</span><span class="sec-sub">{s.sub}</span></div>
        </div>
        {#each s.groups as g (g.key)}
          <div class="group">
            <span class="stripe" style:background={s.color}></span>
            <div class="g-title"><span class="g-name">{g.title}</span><span class="g-count" style:color={s.section === 'white' ? 'var(--text2)' : s.color}>{g.count}</span></div>
            <div class="g-sample"><span>{g.sample}</span>{#if g.need}<span class="need">needs your choice</span>{/if}</div>
            <div class="g-acts">
              {#if g.key === 'untagged'}
                <button class="gbtn" onclick={() => navigate('/health/untagged/grid')}>Open as grid</button>
              {:else if g.key === 'thumbnails'}
                <button class="gbtn pri" disabled={scanning} onclick={cleanThumbs}>Delete</button>
              {:else if g.fix}
                <button class="gbtn pri" disabled={scanning} onclick={() => groupFix(g)}>{g.fix.label}</button>
              {/if}
              {#if g.key !== 'thumbnails'}<a class="gbtn" href={href(reviewHref(g))}>Review ▸</a>{/if}
            </div>
          </div>
        {/each}
      {/each}

      {#if report.formatStats.length}
        <div class="sec-head">
          <div class="edge" style:background="var(--surface2)"></div>
          <div class="sec-titles"><span class="sec-title">Unsupported formats</span><span class="sec-sub">ignored or recorded so far · which formats are worth supporting next</span></div>
        </div>
        <table class="stats">
          <thead><tr><th>Format</th><th>Ignored</th><th>Recorded</th><th>Total</th></tr></thead>
          <tbody>
            {#each report.formatStats as f (f.ext)}
              <tr><td>{f.ext.toUpperCase()}</td><td>{fmt(f.ignored)}</td><td>{fmt(f.recorded)}</td><td><b>{fmt(f.ignored + f.recorded)}</b></td></tr>
            {/each}
          </tbody>
        </table>
      {/if}

      <div class="sec-head logs">
        <div class="edge" style:background="var(--surface2)"></div>
        <div class="sec-titles"><span class="sec-title">Logs</span><span class="sec-sub">{fmt(report.logs.files)} files · {formatSize(report.logs.bytes)} · errors, fixes and bulk operations</span></div>
        <div class="log-acts">
          <button class="gbtn" onclick={openLogs}>Open logs folder</button>
          <button class="gbtn red" onclick={clearLogs} disabled={report.logs.files === 0}>Clear logs</button>
        </div>
      </div>
      <div class="pad"></div>
    </div>
  {/if}
</div>

<style>
  .health-page { height: calc(100vh - 56px); display: flex; flex-direction: column; overflow: hidden; }
  .body { flex: 1; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; }
  .body.dim { opacity: 0.4; pointer-events: none; }

  .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid var(--line); flex: none; }
  .card { display: flex; flex-direction: column; gap: 6px; padding: 16px 24px 16px 40px; border-right: 1px solid var(--line); box-shadow: inset 0 4px 0 var(--c); }
  .n-row { display: flex; align-items: baseline; gap: 12px; }
  .n { font: 700 56px/0.9 var(--font-display); color: var(--c); }
  .lbl { font: 700 20px/1 var(--font-display); text-transform: uppercase; }
  .sub { font: 11.5px var(--font-mono); color: var(--text); }
  .foot { font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }

  .sec-head { display: flex; align-items: stretch; border-bottom: 1px solid var(--line); margin-top: 18px; flex: none; }
  .edge { width: 8px; flex: none; }
  .sec-titles { flex: 1; display: flex; align-items: baseline; gap: 16px; padding: 12px 24px 10px; min-width: 0; }
  .sec-title { font: 700 30px/1 var(--font-display); text-transform: uppercase; }
  .sec-sub { font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .logs .sec-titles { align-items: center; }
  .log-acts { display: flex; gap: 6px; align-items: center; padding-right: 40px; }

  .group { display: grid; grid-template-columns: 4px 290px minmax(0, 1fr) auto; gap: 0 20px; align-items: center; min-height: 60px; padding-right: 40px; border-bottom: 1px solid var(--line); flex: none; }
  .stripe { align-self: stretch; }
  .g-title { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
  .g-name { font: 700 22px/1 var(--font-display); text-transform: uppercase; }
  .g-count { font: 700 12px var(--font-mono); white-space: nowrap; }
  .g-sample { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .g-sample > span:first-child { font: 12px var(--font-mono); color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .need { flex: none; padding: 2px 6px; border: 1px dashed var(--text2); font: 700 10px/1.3 var(--font-mono); text-transform: uppercase; }
  .g-acts { display: flex; gap: 6px; }
  .gbtn { display: inline-flex; align-items: center; height: 34px; padding: 0 14px; border: 1px solid var(--line); background: none; color: var(--text); font: 700 14px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; text-decoration: none; cursor: pointer; }
  .gbtn:hover:not(:disabled) { border-color: var(--text); }
  .gbtn.pri { border-color: transparent; background: var(--accent); color: var(--accent-ink); }
  .gbtn.red { border-color: var(--red); color: var(--red); }
  .gbtn:disabled { opacity: 0.4; cursor: not-allowed; }

  .stats { margin: 0 40px; border-collapse: collapse; font: 12px var(--font-mono); max-width: 640px; }
  .stats th { padding: 8px 16px 8px 0; text-align: left; font-weight: 400; font-size: 10.5px; color: var(--text2); text-transform: uppercase; border-bottom: 1px solid var(--line); }
  .stats td { padding: 7px 16px 7px 0; border-bottom: 1px solid var(--line); }
  .stats td:first-child { font-weight: 700; }
  .stats b { font-weight: 700; color: var(--accent); }
  .pad { height: 40px; flex: none; }

  .clear { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 420px); gap: 56px; padding: 56px 40px 40px; align-items: center; }
  .pitch { display: flex; flex-direction: column; gap: 18px; }
  .big { font-size: clamp(72px, 9vw, 120px); line-height: 0.82; }
  .pitch p { margin: 0; max-width: 600px; font-size: 16px; line-height: 1.55; color: var(--text2); text-wrap: pretty; }
  .mono-note { font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .tally { display: flex; flex-direction: column; border: 1px solid var(--line); font: 12px var(--font-mono); text-transform: uppercase; }
  .tally div { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--line); }
  .tally div:last-child { border-bottom: none; }
  .tally span:last-child { margin-left: auto; color: var(--text2); }
  .sq { width: 10px; height: 10px; flex: none; }
</style>
