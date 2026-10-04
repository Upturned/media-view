<script lang="ts">
  import type { FieldDef, FieldKind, FieldOptions } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import { KINDS, kindInfo } from '../fields.ts';
  import { fieldsOf, inkFor, loadTagTypes, tagTypes } from '../stores/tags.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';

  /**
   * Custom fields per tag type (design M5 · 04). The kind menu shows what each change would cost;
   * a change that loses values asks inline first.
   */

  let typeId = $state<number | null>(null);
  const type = $derived(tagTypes.list.find((t) => t.id === typeId) ?? tagTypes.list[0]);
  const fields = $derived(type ? fieldsOf(type.id) : []);

  let labels = $state<Record<number, string>>({});
  let menu = $state<number | null>(null);
  let costs = $state<Record<FieldKind, number> | null>(null);
  let pending = $state<{ id: number; to: FieldKind; lost: number } | null>(null);
  let deleting = $state<number | null>(null);
  let open = $state<number | null>(null);
  let optionInput = $state('');

  const NOTES: Partial<Record<FieldKind, string>> = {
    text: 'One line of text. No settings.',
    longtext: 'Several lines; shown as a paragraph. No settings.',
    date: 'Accepts a year, year-month or full date.',
    link: 'Must start with http://, https:// or file://. Opens in the browser.',
    image: 'Picks any image in the library; the tag’s own images are offered first.',
  };

  async function run<T>(call: () => Promise<T>, done?: string): Promise<T | undefined> {
    try {
      const r = await call();
      await loadTagTypes();
      if (done) toast(done);
      return r;
    } catch (err) {
      toastError(err);
      return undefined;
    }
  }

  const api = client.api['tag-fields'][':id'];
  const param = (f: FieldDef) => ({ id: String(f.id) });

  async function add() {
    if (!type) return;
    const f = await run(() => unwrap(client.api['tag-types'][':id'].fields.$post({ param: { id: String(type.id) }, json: { label: 'New field', kind: 'text' } })));
    if (f) {
      labels[f.id] = '';
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-field="${f.id}"]`)?.focus());
    }
  }

  function rename(f: FieldDef) {
    const label = (labels[f.id] ?? f.label).trim();
    delete labels[f.id];
    if (!label || label === f.label) return;
    void run(() => unwrap(api.$patch({ param: param(f), json: { label } })));
  }

  function setOptions(f: FieldDef, options: FieldOptions) {
    void run(() => unwrap(api.$patch({ param: param(f), json: { options: { ...f.options, ...options } } })));
  }

  async function openMenu(f: FieldDef, e: MouseEvent) {
    e.stopPropagation();
    if (menu === f.id) {
      menu = null;
      return;
    }
    menu = f.id;
    costs = null;
    try {
      costs = (await unwrap(api['kind-costs'].$get({ param: param(f) }))).costs;
    } catch (err) {
      toastError(err);
    }
  }

  function note(f: FieldDef, to: FieldKind): string {
    if (to === f.kind) return 'current';
    const lost = costs?.[to];
    if (lost === undefined) return '…';
    if (lost > 0) return `clears ${lost}`;
    if (f.filled === 0) return 'no values';
    if (to === 'choice') return 'values → options';
    if (f.kind === 'longtext' && to === 'text') return 'joins lines';
    return 'converts all';
  }

  function chooseKind(f: FieldDef, to: FieldKind) {
    menu = null;
    if (to === f.kind) return;
    const lost = costs?.[to] ?? 0;
    if (lost > 0) pending = { id: f.id, to, lost };
    else void changeKind(f, to, false);
  }

  async function changeKind(f: FieldDef, to: FieldKind, clearLost: boolean) {
    const lost = pending?.lost ?? 0;
    pending = null;
    await run(
      () => unwrap(api.kind.$post({ param: param(f), json: { kind: to, clearLost } })),
      `${f.label} is now ${kindInfo(to).label.toLowerCase()}.${clearLost && lost ? ` ${lost} ${lost === 1 ? 'value' : 'values'} cleared.` : f.filled ? ' All values converted.' : ''}`,
    );
  }

  async function remove(f: FieldDef) {
    deleting = null;
    await run(() => unwrap(api.$delete({ param: param(f) })), `Deleted field ${f.label}.`);
  }

  function addOption(f: FieldDef) {
    const o = optionInput.trim();
    if (!o) return;
    optionInput = '';
    const choices = f.options.choices ?? [];
    if (choices.some((c) => c.toLowerCase() === o.toLowerCase())) return;
    setOptions(f, { choices: [...choices, o] });
  }
</script>

<svelte:window onclick={() => (menu = null)} />

<div class="fields-tab">
  <div class="types">
    {#each tagTypes.list as t (t.id)}
      <button class="trow" class:on={t.id === type?.id} style:border-left-color={t.id === type?.id ? t.color : 'transparent'} onclick={() => { typeId = t.id; open = null; pending = null; deleting = null; }}>
        <span class="sq" style:background={t.color}></span>
        <span class="tname">{t.name}</span>
        <span class="tn">{fieldsOf(t.id).length} fields</span>
      </button>
    {/each}
    <span class="tnote">Each type has its own fields. Every tag of that type gets them on its wiki page.</span>
  </div>

  {#if type}
    <div class="panel">
      <div class="phead">
        <span class="edge" style:background={type.color}></span>
        <div class="ptitle">
          <span class="display">{type.name} fields</span>
          <span class="sub">{fields.length} {fields.length === 1 ? 'field' : 'fields'} · {type.tagCount} {type.name.toLowerCase()} {type.tagCount === 1 ? 'tag' : 'tags'} · empty fields stay hidden on wiki pages</span>
        </div>
        <button class="addbtn" onclick={add}>+ Add field</button>
      </div>
      <div class="grid th"><span>Order</span><span>Field name</span><span>Kind</span><span>Filled on</span><span></span></div>
      <div class="list">
        {#each fields as f, i (f.id)}
          {@const info = kindInfo(f.kind)}
          <div class="field" class:pend={pending?.id === f.id} class:open={open === f.id}>
            <div class="grid">
              <div class="order">
                <span class="display n">{i + 1}</span>
                <div class="arrows">
                  <button disabled={i === 0} onclick={() => run(() => unwrap(api.move.$post({ param: param(f), json: { delta: -1 } })))} aria-label="Up">▲</button>
                  <button disabled={i === fields.length - 1} onclick={() => run(() => unwrap(api.move.$post({ param: param(f), json: { delta: 1 } })))} aria-label="Down">▼</button>
                </div>
              </div>
              <div class="fname">
                <input
                  data-field={f.id}
                  value={labels[f.id] ?? f.label}
                  placeholder={f.label}
                  oninput={(e) => (labels[f.id] = e.currentTarget.value)}
                  onblur={() => rename(f)}
                  onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
              </div>
              <div class="kindcell">
                <button class="kind" class:active={menu === f.id} onclick={(e) => openMenu(f, e)}>
                  <span class="glyph">{info.glyph}</span><span class="kl">{info.label}</span><span class="glyph">▾</span>
                </button>
                {#if menu === f.id}
                  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                  <div class="menu" onclick={(e) => e.stopPropagation()}>
                    <span class="mh">Change kind · {f.filled} {f.filled === 1 ? 'value exists' : 'values exist'}</span>
                    {#each KINDS as k (k.kind)}
                      {@const lost = costs?.[k.kind] ?? 0}
                      <button class:cur={k.kind === f.kind} disabled={!costs && k.kind !== f.kind} onclick={() => chooseKind(f, k.kind)}>
                        <span class="glyph">{k.glyph}</span><span class="kl">{k.label}</span><span class="mn" class:loss={k.kind !== f.kind && lost > 0}>{note(f, k.kind)}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
              <div class="filled">
                <span class="meter"><span style:width="{type.tagCount ? Math.round((f.filled / type.tagCount) * 100) : 0}%" style:background={type.color}></span></span>
                <span>{f.filled} / {type.tagCount}</span>
              </div>
              <div class="acts">
                <button class:on={open === f.id} onclick={() => (open = open === f.id ? null : f.id)}>Settings {open === f.id ? '▴' : '▾'}</button>
                <button class="del" onclick={() => (deleting = f.id)}>Delete</button>
              </div>
            </div>

            {#if pending?.id === f.id}
              {@const to = kindInfo(pending.to)}
              <div class="strip amber">
                <span class="tag">Can’t convert</span>
                <span class="txt">Changing “{f.label}” from {info.label} to {to.label}: {pending.lost} of {f.filled} values can’t be read as {to.label.toLowerCase()} and will be cleared.</span>
                <button onclick={() => (pending = null)}>Keep {info.label}</button>
                <button class="go" onclick={() => changeKind(f, pending!.to, true)}>Change &amp; clear {pending.lost}</button>
              </div>
            {/if}
            {#if deleting === f.id}
              <div class="strip red">
                <span class="txt">Delete “{f.label}”? {f.filled ? `Its values on ${f.filled} ${f.filled === 1 ? 'tag are' : 'tags are'} lost.` : 'No tag has a value in it.'}</span>
                <button onclick={() => (deleting = null)}>Keep it</button>
                <button class="go" onclick={() => remove(f)}>Delete field</button>
              </div>
            {/if}
            {#if open === f.id}
              <div class="settings">
                {#if f.kind === 'number'}
                  <div class="srow">
                    <span class="sl">Unit</span>
                    <input class="unit" value={f.options.unit ?? ''} placeholder="e.g. cm" onchange={(e) => setOptions(f, { unit: e.currentTarget.value.trim() || undefined })} />
                    <span class="dim">shown after the value</span>
                  </div>
                {:else if f.kind === 'choice'}
                  <div class="srow top">
                    <span class="sl">Options</span>
                    <div class="opts">
                      {#each f.options.choices ?? [] as c (c)}
                        <span class="opt">{c}<button onclick={() => setOptions(f, { choices: (f.options.choices ?? []).filter((x) => x !== c) })} aria-label="Remove {c}" title="Remove — tags with this value lose it">✕</button></span>
                      {/each}
                      <input class="optin" bind:value={optionInput} placeholder="+ option, enter" onkeydown={(e) => e.key === 'Enter' && addOption(f)} />
                    </div>
                  </div>
                {:else if f.kind === 'tagref'}
                  <div class="srow">
                    <span class="sl">Allows</span>
                    {#each tagTypes.list as t (t.id)}
                      {@const on = (f.options.types ?? []).includes(t.id)}
                      <button class="tt" style:border-color={t.color} style:background={on ? t.color : 'transparent'} style:color={on ? inkFor(t.color) : 'var(--text)'}
                        onclick={() => setOptions(f, { types: on ? (f.options.types ?? []).filter((x) => x !== t.id) : [...(f.options.types ?? []), t.id] })}>{t.name}</button>
                    {/each}
                    {#if !(f.options.types ?? []).length}<span class="dim">any type</span>{/if}
                  </div>
                  <button class="srow check" onclick={() => setOptions(f, { multi: !f.options.multi })}>
                    <span class="sl">Count</span>
                    <span class="box" class:on={f.options.multi}>{f.options.multi ? '✓' : ''}</span>
                    <span>Multiple, in a chosen order</span>
                  </button>
                {:else}
                  <span class="dim">{NOTES[f.kind]}</span>
                {/if}
              </div>
            {/if}
          </div>
        {:else}
          <div class="empty">
            <span class="display">No custom fields</span>
            <span>{type.name} tags show only their description. Add a field to give them an info box.</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .fields-tab { flex: 1; min-height: 520px; display: grid; grid-template-columns: 300px minmax(0, 1fr); border: 1px solid var(--line); margin-top: 14px; }
  .types { display: flex; flex-direction: column; border-right: 1px solid var(--line); background: var(--surface); }
  .trow { display: flex; align-items: center; gap: 12px; height: 56px; padding: 0 20px 0 16px; border: none; border-bottom: 1px solid var(--line); border-left: 4px solid transparent; background: none; color: var(--text); text-align: left; cursor: pointer; }
  .trow:hover { background: var(--surface2); }
  .trow.on { background: var(--bg); }
  .sq { width: 14px; height: 14px; flex: none; }
  .tname { flex: 1; min-width: 0; font: 700 20px/1 var(--font-display); letter-spacing: 0.04em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tn { font: 11px var(--font-mono); color: var(--text2); }
  .tnote { padding: 14px 20px; font: 11px/1.5 var(--font-mono); color: var(--text2); text-transform: uppercase; }

  .panel { display: flex; flex-direction: column; min-width: 0; }
  .phead { display: flex; align-items: center; gap: 16px; padding: 16px 28px; border-bottom: 1px solid var(--line); }
  .edge { width: 8px; align-self: stretch; }
  .ptitle { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .ptitle .display { font-size: 34px; line-height: 0.9; }
  .sub { font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .addbtn { margin-left: auto; height: 40px; padding: 0 18px; border: none; background: var(--accent); color: var(--accent-ink); font: 700 15px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; flex: none; }

  .grid { display: grid; grid-template-columns: 70px minmax(0, 1fr) 200px 150px 200px; align-items: center; min-height: 52px; padding: 0 28px; }
  .grid.th { min-height: 32px; border-bottom: 1px solid var(--line); font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .list { flex: 1; background: var(--bg2); padding-bottom: 40px; }
  .field { border-bottom: 1px solid var(--line); }
  .field.open { background: var(--surface); }
  .field.pend { background: color-mix(in oklab, var(--amber) 5%, var(--bg2)); }
  .order { display: flex; align-items: center; gap: 6px; }
  .n { width: 22px; font-size: 20px; color: var(--text2); }
  .arrows { display: flex; flex-direction: column; }
  .arrows button { width: 24px; height: 18px; border: 1px solid var(--line); background: none; color: var(--text); font: 9px sans-serif; cursor: pointer; }
  .arrows button + button { border-top: none; }
  .arrows button:disabled { color: var(--line); cursor: default; }
  .fname { padding-right: 20px; }
  .fname input { width: 100%; height: 34px; padding: 0 10px; border: 1px solid var(--line); background: var(--bg); color: var(--text); font: 700 17px/1 var(--font-display); letter-spacing: 0.04em; text-transform: uppercase; outline: none; }
  .fname input:focus { border-color: var(--text); }

  .kindcell { position: relative; }
  .kind { display: flex; align-items: center; gap: 8px; width: 180px; height: 34px; padding: 0 10px; border: 1px solid var(--line); background: var(--bg); color: var(--text); font: 12px var(--font-mono); text-transform: uppercase; cursor: pointer; }
  .kind.active, .kind:hover { border-color: var(--text); }
  .glyph { width: 22px; color: var(--text2); flex: none; }
  .kl { flex: 1; text-align: left; }
  .menu { position: absolute; left: 0; top: 38px; z-index: 20; width: 300px; display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--text); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6); }
  .mh { padding: 6px 10px; border-bottom: 1px solid var(--line); font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .menu button { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px; border: none; border-bottom: 1px solid var(--line); background: none; color: var(--text); font: 12px var(--font-mono); text-transform: uppercase; text-align: left; cursor: pointer; }
  .menu button:hover:not(:disabled) { background: var(--surface2); }
  .menu button.cur { background: var(--surface2); }
  .menu button:disabled { color: var(--text2); cursor: wait; }
  .mn { font-size: 10.5px; color: var(--text2); text-transform: none; }
  .mn.loss { color: var(--amber); }

  .filled { display: flex; align-items: center; gap: 8px; font: 11.5px var(--font-mono); color: var(--text2); }
  .meter { width: 60px; height: 4px; background: var(--surface2); }
  .meter span { display: block; height: 100%; }
  .acts { display: flex; justify-content: flex-end; font: 11px var(--font-mono); text-transform: uppercase; }
  .acts button { height: 30px; padding: 0 10px; border: 1px solid var(--line); background: none; color: var(--text); font: inherit; text-transform: inherit; cursor: pointer; }
  .acts button.on { background: var(--surface2); }
  .acts .del { border-left: none; color: var(--red); }
  .acts .del:hover { border-color: var(--red); }

  .strip { display: flex; align-items: center; gap: 12px; margin: 0 28px 12px 98px; padding: 10px 12px; font-size: 14px; line-height: 1.45; }
  .strip.amber { border: 1px solid var(--amber); background: color-mix(in oklab, var(--amber) 8%, var(--bg)); }
  .strip.red { border: 1px solid var(--red); background: color-mix(in oklab, var(--red) 10%, var(--bg)); }
  .strip .tag { font: 700 11px var(--font-mono); color: var(--amber); text-transform: uppercase; }
  .strip .txt { flex: 1; text-wrap: pretty; }
  .strip button { height: 30px; padding: 0 12px; border: 1px solid var(--line); background: none; color: var(--text); font: 11px var(--font-mono); text-transform: uppercase; cursor: pointer; white-space: nowrap; }
  .strip.amber .go { border: none; background: var(--amber); color: #111; font-weight: 700; }
  .strip.red .go { border: none; background: var(--red); color: #fff; font-weight: 700; }

  .settings { display: flex; flex-direction: column; gap: 10px; margin: 0 28px 14px 98px; padding: 12px 14px; border: 1px solid var(--line); background: var(--bg); }
  .srow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font: 11.5px var(--font-mono); }
  .srow.top { align-items: flex-start; flex-wrap: nowrap; }
  .sl { width: 90px; flex: none; color: var(--text2); text-transform: uppercase; }
  .srow.top .sl { padding-top: 7px; }
  .dim { font: 11.5px var(--font-mono); color: var(--text2); }
  .unit { width: 140px; height: 30px; padding: 0 8px; border: 1px solid var(--line); background: var(--bg2); color: var(--text); font: inherit; outline: none; }
  .opts { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .opt { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 4px 0 10px; border: 1px solid var(--text); font: 700 13px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; }
  .opt button { border: none; background: none; color: var(--text2); font-size: 11px; cursor: pointer; }
  .optin { width: 140px; height: 28px; padding: 0 8px; border: 1px dashed var(--line); background: none; color: var(--text); font: inherit; outline: none; }
  .tt { height: 28px; padding: 0 10px; border: 1px solid; font: 700 12.5px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; }
  .check { padding: 0; border: none; background: none; color: var(--text); text-align: left; cursor: pointer; }
  .box { width: 14px; height: 14px; border: 1px solid var(--text); color: #111; font: 700 10px/14px sans-serif; text-align: center; }
  .box.on { background: var(--accent2); }

  .empty { display: flex; flex-direction: column; gap: 8px; margin: 40px 28px; padding: 32px; border: 1px dashed var(--line); font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .empty .display { font-size: 36px; color: var(--text); }
</style>
