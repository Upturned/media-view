<script module lang="ts">
  import type { FixAction, IssueKind } from '@media-view/shared';

  /** One thing Apply to all can do: a fix for every item of a kind. */
  export interface ApplyLine {
    section: 'red' | 'amber' | 'blue';
    kind: IssueKind;
    action: FixAction['action'];
    name: string;
    note: string;
    /** Checked when the dialog opens. */
    on: boolean;
  }
</script>

<script lang="ts">
  import { SECTIONS } from '../health.ts';
  import { fmt } from '../media.ts';
  import { nameProblem } from '../names.ts';
  import DialogFrame from './DialogFrame.svelte';

  /**
   * Apply to all (Library Health): every fix it can do, by severity, each with a checkbox — red and
   * amber checked, blue (duplicates) left for you to tick. Loose images going into new albums ask
   * for the albums' name. Items that need a choice are never touched.
   */
  let { lines, skipped, onapply, onclose }: {
    lines: ApplyLine[];
    skipped: number;
    onapply: (steps: ApplyLine[], albumName: string | undefined) => void;
    onclose: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let on = $state<boolean[]>(lines.map((l) => l.on));
  let albumName = $state('Loose images');

  const sections = $derived((['red', 'amber', 'blue'] as const)
    .map((s) => ({ s, ...SECTIONS[s], rows: lines.map((l, i) => ({ l, i })).filter((x) => x.l.section === s) }))
    .filter((x) => x.rows.length));
  const chosen = $derived(lines.filter((_, i) => on[i]));
  const naming = $derived(chosen.some((l) => l.kind === 'loose_files' && l.action === 'new-album'));
  const problem = $derived(naming ? nameProblem(albumName) : '');

  function toggleSection(rows: { i: number }[]) {
    const all = rows.every((r) => on[r.i]);
    for (const r of rows) on[r.i] = !all;
  }

  function apply() {
    if (!chosen.length || problem) return;
    onapply(chosen, naming ? albumName.trim() : undefined);
  }
</script>

<DialogFrame title="Apply to all" sub="pick what runs · each item’s default fix" width={640} {onclose}>
  <div class="content">
    {#if lines.length === 0}
      <p>Nothing here has a default fix.{skipped ? ` ${fmt(skipped)} ${skipped === 1 ? 'item needs' : 'items need'} your choice — open Review ▸ to decide.` : ''}</p>
    {:else}
      <p>Untick what you want to leave for now; tick a whole severity with its heading.{skipped ? ` ${fmt(skipped)} ${skipped === 1 ? 'item needs' : 'items need'} your choice and ${skipped === 1 ? 'is' : 'are'} skipped.` : ''}</p>
      <div class="list">
        {#each sections as sec (sec.s)}
          {@const all = sec.rows.every((r) => on[r.i])}
          {@const some = sec.rows.some((r) => on[r.i])}
          <label class="sec">
            <input type="checkbox" checked={all} indeterminate={some && !all} onchange={() => toggleSection(sec.rows)} />
            <span class="sq" style:background={sec.color}></span>
            <span class="sec-title">{sec.title}</span>
            {#if sec.s === 'blue'}<span class="sec-note">not counted in the badge</span>{/if}
          </label>
          {#each sec.rows as { l, i } (i)}
            <label class="line">
              <input type="checkbox" bind:checked={on[i]} />
              <span class="name">{l.name}</span>
              <span class="note">{l.note}</span>
            </label>
          {/each}
        {/each}
      </div>
      {#if naming}
        <form class="form" onsubmit={(e) => { e.preventDefault(); apply(); }}>
          <span class="field-label">Name for the new albums (one per folder)</span>
          <input class="field" class:bad={!!problem} bind:value={albumName} spellcheck="false" maxlength="200" />
          <span class="msg" class:bad={!!problem}>{problem}</span>
        </form>
      {/if}
    {/if}
  </div>
  {#snippet footer()}
    <span class="hint">No Undo for the whole batch · anything recycled is in the Recycle Bin</span>
    <button class="dbtn push" onclick={onclose}>{lines.length ? 'Cancel' : 'OK'}</button>
    {#if lines.length}
      <button class="dbtn strong" disabled={!chosen.length || !!problem} onclick={apply}>
        {chosen.length ? `Apply ${chosen.length} ${chosen.length === 1 ? 'fix' : 'fixes'}` : 'Nothing ticked'}
      </button>
    {/if}
  {/snippet}
</DialogFrame>

<style>
  .content { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px; }
  p { margin: 0; font-size: 15px; line-height: 1.5; }
  .list { display: flex; flex-direction: column; max-height: 340px; overflow-y: auto; border: 1px solid var(--line); font: 12px var(--font-mono); }
  label { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-bottom: 1px solid var(--line); cursor: pointer; }
  label:last-child { border-bottom: none; }
  input[type='checkbox'] { accent-color: var(--accent); margin: 0; flex: none; }
  .sec { background: var(--bg2); }
  .sq { width: 10px; height: 10px; flex: none; }
  .sec-title { font: 700 15px/1 var(--font-display); text-transform: uppercase; }
  .sec-note { margin-left: auto; color: var(--text2); font-size: 10.5px; text-transform: uppercase; }
  .line { padding-left: 30px; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note { color: var(--text2); text-transform: uppercase; font-size: 11px; white-space: nowrap; }
  .form { display: flex; flex-direction: column; gap: 8px; }
</style>
