<script lang="ts">
  import { ApiError, client, unwrap } from '../api.ts';
  import { fmt } from '../media.ts';
  import { nameProblem, patternName, splitExt } from '../names.ts';
  import { closeOps, type OpsDialog } from '../stores/ops.svelte.ts';
  import { toast } from '../stores/toasts.svelte.ts';
  import { word } from '../themes/index.ts';
  import DialogFrame from './DialogFrame.svelte';

  /** Bulk rename with a live before / after preview (design M3 · 03). */
  let { dialog }: { dialog: Extract<OpsDialog, { kind: 'bulk-rename' }> } = $props();

  let pattern = $state('*_#');
  let start = $state(1);
  let digits = $state(2);
  let input: HTMLInputElement | undefined = $state();
  let busy = $state(false);
  let serverError = $state('');

  // Names already in the folders involved (lowercase), to flag clashes before renaming.
  let existing = $state<Record<number, Set<string>>>({});
  $effect(() => {
    const folders = [...new Set(dialog.files.map((f) => f.folderId))];
    Promise.all(folders.map((id) => unwrap(client.api.files.names.$get({ query: { folder: String(id) } })).then((r) => [id, new Set(r.names)] as const)))
      .then((pairs) => (existing = Object.fromEntries(pairs)))
      .catch(() => {});
  });

  const patternProblem = $derived(!pattern.trim() ? 'Pattern is empty.' : /[\\/:?"<>|]/.test(pattern) ? 'Not allowed:  \\ / : ? " < > |' : '');

  const rows = $derived.by(() => {
    const ours = new Set(dialog.files.map((f) => `${f.folderId}/${f.filename.toLowerCase()}`));
    const outs = dialog.files.map((f, i) => ({ f, ...patternName(f.filename, pattern, start + i, digits) }));
    const counts = new Map<string, number>();
    for (const o of outs) {
      const k = `${o.f.folderId}/${(o.base + o.ext).toLowerCase()}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return outs.map((o, i) => {
      const key = `${o.f.folderId}/${(o.base + o.ext).toLowerCase()}`;
      const same = o.base === splitExt(o.f.filename).base;
      const status = patternProblem || nameProblem(o.base) ? 'invalid'
        : (counts.get(key) ?? 0) > 1 ? 'duplicate'
        : !same && !ours.has(key) && existing[o.f.folderId]?.has((o.base + o.ext).toLowerCase()) ? 'exists'
        : same ? 'unchanged' : 'ok';
      return { n: i + 1, before: o.f.filename, after: o.base, ext: o.ext, status };
    });
  });

  const bad = $derived(rows.filter((r) => r.status === 'invalid' || r.status === 'duplicate' || r.status === 'exists').length);
  const changing = $derived(rows.filter((r) => r.status === 'ok').length);
  const ok = $derived(!patternProblem && bad === 0 && changing > 0 && !busy);
  const summary = $derived(
    serverError || patternProblem ? serverError || 'Fix the pattern to continue'
      : bad ? `${bad} ${bad === 1 ? 'conflict' : 'conflicts'} — every name must be unique in the album`
      : `${changing} will change · ${rows.length - changing} unchanged · no conflicts`,
  );

  $effect(() => {
    void pattern;
    void start;
    void digits;
    serverError = '';
  });

  function insert(token: string) {
    const el = input;
    if (!el) {
      pattern += token;
      return;
    }
    const s = el.selectionStart ?? pattern.length;
    const e = el.selectionEnd ?? s;
    pattern = pattern.slice(0, s) + token + pattern.slice(e);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  }

  const presets = ['*_#', 'ref_#', '# - *', '*'];
  const example = $derived((p: string) => patternName(dialog.files[0]?.filename ?? 'image.png', p, start, digits).base);

  async function go() {
    if (!ok) return;
    busy = true;
    try {
      const r = await unwrap(client.api.files['rename-bulk'].$post({ json: { ids: dialog.files.map((f) => f.id), pattern, start, digits } }));
      toast(`Renamed ${fmt(r.renamed)} ${r.renamed === 1 ? word('image') : word('images')}.`);
      closeOps();
    } catch (err) {
      if (err instanceof ApiError && err.status < 500) serverError = err.message;
      else toast((err as Error).message, 'error');
    } finally {
      busy = false;
    }
  }
</script>

<DialogFrame title="Rename {fmt(dialog.files.length)} {word('images')}" sub="in {dialog.where} · numbered in {dialog.order}" width={1080} height={700} onclose={closeOps}>
  <div class="layout">
    <div class="side">
      <div class="group">
        <span class="field-label">Pattern</span>
        <input class="field" class:bad={!!patternProblem} bind:this={input} bind:value={pattern} spellcheck="false" />
        <div class="tokens">
          <button onclick={() => insert('#')}><b>#</b> number</button>
          <button onclick={() => insert('*')}><b>*</b> original name</button>
        </div>
        <span class="msg bad">{patternProblem}</span>
      </div>
      <div class="pair">
        <div class="group">
          <span class="field-label">Start at</span>
          <div class="stepper">
            <button onclick={() => (start = Math.max(0, start - 1))}>−</button>
            <span>{start}</span>
            <button onclick={() => (start += 1)}>+</button>
          </div>
        </div>
        <div class="group">
          <span class="field-label">Digits</span>
          <div class="digits">
            {#each [1, 2, 3, 4] as d (d)}
              <button class:on={digits === d} onclick={() => (digits = d)}>{d}</button>
            {/each}
          </div>
        </div>
      </div>
      <div class="group">
        <span class="field-label">Presets</span>
        <div class="presets">
          {#each presets as p (p)}
            <button onclick={() => (pattern = p)}><span>{p}</span><span class="eg">{example(p)}</span></button>
          {/each}
        </div>
      </div>
      <span class="note">Extensions are kept. Stars and descriptions follow each file.</span>
    </div>

    <div class="preview">
      <div class="row head"><span>#</span><span>Before</span><span></span><span>After</span><span class="r">Status</span></div>
      <div class="rows">
        {#each rows as r (r.n)}
          {@const red = r.status === 'invalid' || r.status === 'duplicate' || r.status === 'exists'}
          <div class="row" class:red>
            <span class="n">{r.n}</span>
            <span class="before">{r.before}</span>
            <span class="arrow">→</span>
            <span class="after" class:same={r.status === 'unchanged'}>{r.after || '—'}<span class="ext">{r.ext}</span></span>
            <span class="status {r.status}">{r.status}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
  {#snippet footer()}
    <span class="hint" style:color={serverError || patternProblem || bad ? 'var(--red)' : undefined}>{summary}</span>
    <button class="dbtn push" onclick={closeOps}>Cancel</button>
    <button class="dbtn primary" disabled={!ok} onclick={go}>Rename {fmt(changing || dialog.files.length)} {word('images')}</button>
  {/snippet}
</DialogFrame>

<style>
  .layout { flex: 1; min-height: 0; display: grid; grid-template-columns: 340px 1fr; }
  .side { display: flex; flex-direction: column; gap: 18px; padding: 20px; border-right: 1px solid var(--line); overflow-y: auto; }
  .group { display: flex; flex-direction: column; gap: 8px; }
  .field { font-size: 14px; }
  .tokens { display: flex; gap: 6px; }
  .tokens button { height: 28px; padding: 0 10px; border: 1px solid var(--line); background: none; color: var(--text); font: 12px var(--font-mono); cursor: pointer; }
  .tokens button:hover { border-color: var(--text); }
  .tokens b { color: var(--accent); }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .stepper, .digits { display: flex; align-items: stretch; height: 36px; border: 1px solid var(--line); font: 13px var(--font-mono); }
  .stepper button { width: 34px; border: none; background: none; color: var(--text); font: inherit; cursor: pointer; }
  .stepper span { flex: 1; display: grid; place-items: center; border-left: 1px solid var(--line); border-right: 1px solid var(--line); }
  .digits button { flex: 1; border: none; background: none; color: var(--text2); font: inherit; font-weight: 700; cursor: pointer; }
  .digits button.on { background: var(--accent); color: var(--accent-ink); }
  .presets { display: flex; flex-direction: column; border: 1px solid var(--line); }
  .presets button { display: flex; align-items: center; gap: 10px; height: 32px; padding: 0 10px; border: none; border-bottom: 1px solid var(--line); background: none; color: var(--text); font: 12.5px var(--font-mono); text-align: left; cursor: pointer; }
  .presets button:last-child { border-bottom: none; }
  .presets button:hover { background: var(--surface2); }
  .presets span:first-child { flex: 1; }
  .eg { color: var(--text2); font-size: 11px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note { margin-top: auto; font: 11px/1.5 var(--font-mono); color: var(--text2); text-transform: uppercase; }

  .preview { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .row { display: grid; grid-template-columns: 44px minmax(0, 1fr) 28px minmax(0, 1fr) 84px; align-items: center; min-height: 44px; padding: 0 20px; border-bottom: 1px solid var(--line); font: 12.5px var(--font-mono); }
  .row.head { min-height: 34px; font-size: 10.5px; color: var(--text2); text-transform: uppercase; }
  .rows { flex: 1; overflow-y: auto; background: var(--bg2); }
  .row.red { background: color-mix(in oklab, var(--red) 9%, transparent); }
  .n { color: var(--accent); font-weight: 700; }
  .before { color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .arrow { color: var(--text2); }
  .after { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .after.same { color: var(--text2); }
  .row.red .after { color: var(--red); }
  .after .ext { color: var(--text2); }
  .r { text-align: right; }
  .status { justify-self: end; padding: 2px 6px; font-size: 10px; text-transform: uppercase; border: 1px solid var(--line); color: var(--text2); }
  .status.ok { border: none; background: var(--text); color: var(--bg); }
  .status.invalid, .status.duplicate, .status.exists { border-color: var(--red); color: var(--red); }
</style>
