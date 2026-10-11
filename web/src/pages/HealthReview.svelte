<script lang="ts">
  import type { DuplicateCopy, FolderKind, HealthIssue, HealthReport, TagRef } from '@media-view/shared';
  import { ApiError, client, unwrap } from '../api.ts';
  import AlbumPickDialog from '../components/AlbumPickDialog.svelte';
  import HealthHeader from '../components/HealthHeader.svelte';
  import KindIcon from '../components/KindIcon.svelte';
  import Thumb from '../components/Thumb.svelte';
  import { groupsOf, SECTIONS, type Group, type Section } from '../health.ts';
  import { fmt, formatDate } from '../media.ts';
  import { href, router } from '../router.svelte.ts';
  import { ask } from '../stores/confirm.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { applyFix, winPath } from '../stores/health.svelte.ts';
  import { library } from '../stores/library.svelte.ts';
  import { inkFor, typeColor } from '../stores/tags.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';

  /**
   * Library Health, one severity at a time (design M7 · 02–04, 07, and the white notices): every
   * item with what the app knows about it and its fixes. Groups collapse; `?group=` opens on one.
   */
  const section = $derived((router.route.params.section ?? 'red') as Section);
  const focus = $derived(router.route.query.get('group'));
  let report = $state<HealthReport | null>(null);
  /** Rows being worked on: a name being typed, a convert note, the album picker. */
  let naming = $state<{ id: number; name: string } | null>(null);
  let converting = $state<{ id: number; name: string } | null>(null);
  let picking = $state<HealthIssue | null>(null);
  let kinds = $state<Record<number, FolderKind>>({});
  let picks = $state<Record<number, number>>({});
  let dupModes = $state<Record<number, 'keep' | 'merge'>>({});
  let closed = $state<Record<string, boolean>>({});
  let busy = $state(false);

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
  const groups = $derived(report ? groupsOf(report).filter((g) => g.section === section && g.key !== 'untagged') : []);
  const isOpen = (g: Group) => (closed[g.key] === undefined ? !focus || focus === g.key : !closed[g.key]);
  const total = $derived(groups.reduce((n, g) => n + (g.issues.length || (g.key === 'untracked' ? report?.untracked.length ?? 0 : 0)), 0));
  const TABS: [Section, string][] = [['red', 'Red · missing'], ['amber', 'Amber · decisions'], ['blue', 'Blue · for your info'], ['white', 'White · notices']];

  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } finally {
      busy = false;
    }
  }
  const fix = (i: HealthIssue, f: Parameters<typeof applyFix>[1]) => run(() => applyFix(i.id, f));

  // ── Paths: WAS / NOW, with the part that changed highlighted ──
  function diff(a: string, b: string): [{ pre: string; hit: string; post: string }, { pre: string; hit: string; post: string }] {
    const A = winPath(a).split('\\');
    const B = winPath(b).split('\\');
    let i = 0;
    while (i < A.length && i < B.length && A[i] === B[i]) i++;
    let j = 0;
    while (j < A.length - i && j < B.length - i && A[A.length - 1 - j] === B[B.length - 1 - j]) j++;
    const part = (S: string[]) => {
      const pre = S.slice(0, i).join('\\');
      const hit = S.slice(i, S.length - j).join('\\');
      const post = S.slice(S.length - j).join('\\');
      return { pre: pre + (pre && hit ? '\\' : ''), hit, post: (post && hit ? '\\' : '') + post };
    };
    return [part(A), part(B)];
  }

  // ── Forget: the normal confirmation, then "Are you sure?" ──
  async function forget(i: HealthIssue) {
    const d = i.details;
    const isImage = d.kind === 'missing_file';
    const name = d.kind === 'missing_file' ? d.filename : d.kind === 'missing_folder' ? d.name : '';
    const items = d.kind === 'missing_file'
      ? [
        { name: `${plural(d.tags.length, 'tag')}`, note: d.tags.map((t) => t.name).join(' · ') || '—' },
        { name: 'Star', note: d.favorited ? '★ starred' : '—' },
        { name: 'Collections', note: d.collections ? `places in ${plural(d.collections, 'collection')}` : '—' },
      ]
      : d.kind === 'missing_folder'
        ? [
          { name: 'Folders', note: d.folders ? `the ${d.folderKind === 'subcategory' ? 'sub-category' : d.folderKind} and ${plural(d.folders, 'folder')} in it` : `the ${d.folderKind === 'subcategory' ? 'sub-category' : d.folderKind}` },
          { name: plural(d.images, 'image'), note: 'their tags, stars, descriptions and places in collections' },
        ]
        : [];
    const first = await ask({
      tone: 'danger',
      title: `Forget “${name}”?`,
      sub: isImage ? 'missing image · everything the app remembers about it' : 'missing folder · and everything inside it',
      body: isImage
        ? 'The app will stop remembering this image. Its tags, star, description and places in collections are deleted for good. If the file turns up later, it comes back as a new, untagged image.'
        : 'The app will stop remembering this folder and the images that were in it. If they turn up later, they come back as new, untagged images in a folder with no marker.',
      items,
      button: 'Forget',
    });
    if (!first) return;
    const sure = await ask({ tone: 'danger', title: 'Are you sure?', body: `“${name}” and everything the app remembers about it will be gone.`, button: 'Yes, forget', foot: 'This can’t be undone' });
    if (sure) await fix(i, { action: 'forget' });
  }

  // ── Locate…: the picked file must be the same image ──
  async function locate(i: HealthIssue) {
    if (i.details.kind !== 'missing_file') return;
    const name = i.details.filename;
    for (;;) {
      let paths: string[];
      try {
        paths = (await unwrap(client.api.system['pick-files'].$post({ json: { title: `Locate ${name}` } }))).paths;
      } catch (err) {
        toastError(err);
        return;
      }
      if (!paths[0]) return;
      try {
        const r = await unwrap(client.api.health[':id'].fix.$post({ param: { id: String(i.id) }, json: { action: 'locate', path: paths[0] } }));
        toast(r.message);
        return;
      } catch (err) {
        if (!(err instanceof ApiError) || err.code !== 'NOT_THE_SAME') {
          toastError(err);
          return;
        }
        const again = await ask({
          tone: 'danger',
          title: 'Not the same image',
          sub: `locate… ${name} · the content didn’t match · nothing changed`,
          body: 'The file you picked may look similar, but its content isn’t the same as the image the app remembers, so it can’t take that image’s place. Only an identical file works — a re-export or an edited version counts as a different image.',
          items: [{ name: paths[0], note: '✕ doesn’t match' }],
          button: 'Pick another file…',
          foot: 'The image stays on the missing list',
        });
        if (!again) return;
      }
    }
  }

  async function intoAlbum(albumId: number | null, name: string) {
    const issue = picking;
    picking = null;
    if (issue) await fix(issue, { action: 'into-album', albumId });
    void name;
  }

  // ── Duplicates ──
  function lostIf(copies: DuplicateCopy[], keepId: number): TagRef[] {
    const keep = copies.find((c) => c.id === keepId)!;
    const seen = new Set<number>();
    return copies.filter((c) => c.id !== keepId).flatMap((c) => c.tags).filter((t) => !keep.tags.some((k) => k.id === t.id) && !seen.has(t.id) && seen.add(t.id));
  }
  function mergedTags(copies: DuplicateCopy[]): TagRef[] {
    const out = new Map<number, TagRef>();
    for (const c of copies) for (const t of c.tags) out.set(t.id, t);
    return [...out.values()];
  }
  async function unstar(fileId: number) {
    try {
      await unwrap(client.api.files[':id'].$patch({ param: { id: String(fileId) }, json: { favorited: false } }));
      toast('Unstarred.', 'info', { label: 'Undo', run: () => void unwrap(client.api.files[':id'].$patch({ param: { id: String(fileId) }, json: { favorited: true } })) });
    } catch (err) {
      toastError(err);
    }
  }

  // ── Not tracked ──
  async function untracked(paths: string[], action: 'track' | 'record') {
    await run(async () => {
      try {
        const r = await unwrap(client.api.health.untracked[':action'].$post({ param: { action }, json: { paths } }));
        toast(action === 'track' ? `${plural(r.changed, 'file')} tracked again · back on Not supported` : `Recorded ${plural(r.changed, 'file')} · moved to the hidden Invalid folder`);
      } catch (err) {
        toastError(err);
      }
    });
  }

  const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
  const folderLabel = (k: FolderKind) => (k === 'subcategory' ? 'Sub-category' : k === 'category' ? 'Category' : k === 'inbox' ? 'Inbox' : 'Album');
  const RECORD_TIP = 'Moves the file into the library’s hidden Invalid folder (.mediaview\\Invalid\\…, keeping its path) and counts it in the statistics. Get it back from Explorer if you change your mind.';
</script>

{#snippet path(lab: string, p: { pre: string; hit: string; post: string }, dim = false)}
  <div class="line"><span class="lab">{lab}</span><span class:dim>{p.pre}{#if p.hit}<mark>{p.hit}</mark>{/if}{p.post}</span></div>
{/snippet}
{#snippet plain(lab: string, text: string)}
  <div class="line"><span class="lab">{lab}</span><span>{text}</span></div>
{/snippet}
{#snippet tags(list: TagRef[])}
  {#if list.length}
    <div class="tags">{#each list as t (t.id)}{@const c = typeColor(t.typeId)}<span style:background={c} style:color={inkFor(c)}>{t.name}</span>{/each}</div>
  {/if}
{/snippet}
{#snippet chip(label: string, tone: 'kind' | 'guess' | 'need' | 'new' = 'kind')}
  <span class="chip {tone}">{label}</span>
{/snippet}

<div class="health-page">
  <HealthHeader {report} compact crumb={SECTIONS[section].title.split(' — ')[0]} />
  <nav class="tabs">
    {#each TABS as [k, label] (k)}
      <a class:on={k === section} href={href(`/health/review/${k}`)}><span class="dot" style:background={SECTIONS[k].color}></span>{label}</a>
    {/each}
    <a href={href('/health')} class="back">↑ Overview</a>
  </nav>

  <div class="body" class:dim={scanning}>
    <div class="sec-head">
      <div class="edge" style:background={SECTIONS[section].color}></div>
      <div class="sec-titles">
        <span class="sec-title">{SECTIONS[section].title}</span>
        <span class="sec-count" style:color={section === 'white' ? 'var(--text2)' : SECTIONS[section].color}>{fmt(total)}</span>
        <span class="sec-sub">{SECTIONS[section].sub}</span>
      </div>
    </div>

    {#if report && groups.length === 0}
      <div class="empty"><span class="display">Nothing here.</span><span>✓ All clear in this section · <a href={href('/health')}>back to the overview</a></span></div>
    {/if}

    {#each groups as g (g.key)}
      {@const open = isOpen(g)}
      <button class="g-head" onclick={() => (closed = { ...closed, [g.key]: open })}>
        <span class="arrow">{open ? '▾' : '▸'}</span>
        <span class="g-name">{g.title}</span>
        <span class="g-count" style:color={section === 'white' ? 'var(--text2)' : SECTIONS[section].color}>{g.count}</span>
        {#if g.need}<span class="need">needs your choice</span>{/if}
        <span class="g-hint">{g.hint}</span>
      </button>

      {#if open}
        <!-- Not tracked: a list, not issues -->
        {#if g.key === 'untracked' && report}
          {#each report.untracked as u (u.path)}
            <div class="row">
              <span class="stripe" style:background="var(--text)"></span>
              <div class="icon"><svg width="22" height="22" viewBox="0 0 16 16"><path d="M3 1.5 H10 L13 4.5 V14.5 H3 Z" fill="none" stroke="currentColor" stroke-width="1.4" /><rect x="5" y="8" width="6" height="1.4" fill="currentColor" /></svg></div>
              <div class="info">
                <div class="t-row"><span class="title">{u.path.split('/').at(-1)}</span>{@render chip(u.ext.toUpperCase())}{@render chip(u.reason === 'unsupported' ? 'Not supported' : 'Wrong type')}</div>
                {@render plain('IN', winPath(u.path.split('/').slice(0, -1).join('/')))}
                <span class="meta">ignored {formatDate(u.ignoredAt)} · stays where it is · not shown in the app</span>
              </div>
              <div class="btns">
                <button class="rbtn" disabled={busy} onclick={() => untracked([u.path], 'track')}>Track again</button>
                <button class="rbtn" disabled={busy} onclick={() => untracked([u.path], 'record')} title={RECORD_TIP}>Record</button>
              </div>
            </div>
          {/each}
        {/if}

        <!-- Thumbnail cleanup -->
        {#if g.key === 'thumbnails' && report}
          <div class="row">
            <span class="stripe" style:background="var(--blue)"></span>
            <div class="icon"><svg width="22" height="22" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" /><rect x="4.5" y="8" width="7" height="3.5" fill="currentColor" /></svg></div>
            <div class="info"><span class="title">{g.count}</span><span class="meta">{g.sample}</span></div>
            <div class="btns"><a class="rbtn" href={href('/health')}>Delete on the overview ↑</a></div>
          </div>
        {/if}

        {#each g.issues as i (i.id)}
          {@const d = i.details}
          {@const stripe = section === 'white' ? 'var(--text)' : SECTIONS[section].color}

          {#if d.kind === 'ambiguous_move'}
            <div class="unclear">
              <span class="stripe" style:background={stripe}></span>
              <div class="uc-body">
                <div class="cards">
                  <div class="found">
                    <div class="band">Found · {formatDate(i.detectedAt)}</div>
                    <div class="pic"><Thumb file={d.file.thumb ?? undefined} /></div>
                    <span class="title">{d.file.path.split('/').at(-1)}</span>
                    <span class="meta">{winPath(d.file.path.split('/').slice(0, -1).join('/'))}<br />identical to {plural(d.candidates.length, 'image')} the app is missing</span>
                  </div>
                  {#each d.candidates as c, k (c.id)}
                    {@const on = picks[i.id] === c.id}
                    <button class="cand" class:on onclick={() => (picks = { ...picks, [i.id]: c.id })}>
                      <div class="band" class:on>{on ? '● It’s this one' : `○ Candidate ${String.fromCharCode(65 + k)}`}</div>
                      <span class="title">{c.path.split('/').at(-1)}</span>
                      {@render plain('WAS', winPath(c.path.split('/').slice(0, -1).join('/')))}
                      {#if c.tags.length}{@render tags(c.tags)}{:else}<span class="notags">NO TAGS</span>{/if}
                      <div class="facts">
                        <span>STAR</span><span>{c.favorited ? '★ starred' : '—'}</span>
                        <span>COLLECTIONS</span><span>{c.collections ? plural(c.collections, 'list') : '—'}</span>
                        <span>NOTE</span><span>{c.description ?? '—'}</span>
                      </div>
                    </button>
                  {/each}
                </div>
                <div class="uc-foot">
                  <span>Same pixels, {d.candidates.length} histories. Pick the one it really is: its tags, star and collection places come back. The others stay on Missing images.</span>
                  <button class="rbtn" disabled={busy} onclick={() => fix(i, { action: 'keep-new' })}>Keep as a new image</button>
                  <button class="rbtn pri" disabled={busy || picks[i.id] === undefined}
                    onclick={() => fix(i, { action: 'pick', candidateId: picks[i.id]! })}>
                    {picks[i.id] === undefined ? 'Pick one first' : `It’s ${String.fromCharCode(65 + d.candidates.findIndex((c) => c.id === picks[i.id]))} · bring back its tags`}
                  </button>
                </div>
              </div>
            </div>
          {:else if d.kind === 'duplicate'}
            {@const mode = dupModes[i.id]}
            {@const clear = d.keepId !== null && d.reason !== 'different-tags' && d.reason !== 'two-starred'}
            {@const stars = d.copies.filter((c) => c.favorited).length}
            {@const pick = picks[i.id] ?? d.keepId ?? d.copies[0]!.id}
            {@const lost = lostIf(d.copies, pick)}
            <div class="dup">
              <div class="dup-head">
                <div class="dup-thumb"><Thumb file={d.thumb ?? undefined} fit="cover" /></div>
                <span class="title">{d.copies[0]!.path.split('/').at(-1)}</span>
                <span class="meta">{d.copies.length} copies</span>
                {#if clear}{@render chip(`suggested: ${d.reason === 'only-tagged' ? 'the only tagged copy' : d.reason === 'starred' ? 'the starred copy' : 'the oldest'}`)}
                {:else}{@render chip(d.reason === 'two-starred' ? 'two starred · your choice' : 'different tags · your choice', 'need')}{/if}
              </div>
              <div class="copies" style:grid-template-columns="repeat({Math.min(d.copies.length, 4)}, minmax(0, 1fr))">
                {#each d.copies as c, k (c.id)}
                  {@const keep = (clear || mode) && c.id === pick}
                  {@const only = c.tags.filter((t) => !d.copies.some((o) => o.id !== c.id && o.tags.some((x) => x.id === t.id)))}
                  <button class="copy" class:keep class:gone={(clear || mode === 'keep') && c.id !== pick}
                    onclick={() => (clear || mode) && (picks = { ...picks, [i.id]: c.id })}>
                    <div class="band" class:keep class:star={!keep && c.favorited}>
                      {keep ? (mode === 'merge' ? 'Merge into this one' : c.id === d.keepId ? 'Keep · suggested' : 'Keep · your pick') : (clear || mode === 'keep') ? '→ Recycle Bin' : c.favorited ? '★ Starred · stays' : `Copy ${k + 1}`}
                    </div>
                    <span class="where">{winPath(c.path.split('/').slice(0, -1).join('/'))}</span>
                    {#if c.tags.length}{@render tags(c.tags)}{:else}<span class="notags">NO TAGS</span>{/if}
                    {#if !clear && only.length}<span class="only">only on this copy: {only.map((t) => t.name).join(', ')}</span>{/if}
                    <div class="facts">
                      <span>STAR</span><span>{c.favorited ? '★ starred' : '—'}</span>
                      <span>LISTS</span><span>{c.collections.map((l) => l.name).join(', ') || '—'}</span>
                      <span>NOTE</span><span>{c.description ?? '—'}</span>
                      <span>ADDED</span><span>{formatDate(c.addedAt)}</span>
                    </div>
                    {#if c.favorited && stars >= 2}<span class="unstar" role="button" tabindex="0" onclick={(e) => { e.stopPropagation(); void unstar(c.id); }} onkeydown={() => {}}>☆ Unstar</span>{/if}
                  </button>
                {/each}
              </div>
              <div class="dup-foot">
                {#if clear || mode === 'keep'}
                  {@const others = d.copies.filter((c) => c.id !== pick)}
                  {@const starredOther = others.some((c) => c.favorited)}
                  <span class:warn={lost.length || starredOther}>
                    {starredOther ? 'Another copy is starred, and starred images can’t be recycled — keep that one, merge, or unstar it.'
                      : lost.length ? `Keeping this copy loses ${lost.map((t) => t.name).join(', ')} — the tags only the other copies have.`
                      : 'Click another copy to keep that one instead.'}
                  </span>
                  {#if mode}<button class="rbtn" onclick={() => (dupModes = { ...dupModes, [i.id]: undefined as never })}>Back</button>{/if}
                  <button class="rbtn pri" disabled={busy || starredOther} onclick={() => fix(i, { action: 'keep-one', keepId: pick })}>Keep copy {d.copies.findIndex((c) => c.id === pick) + 1} · recycle {others.length}</button>
                {:else if mode === 'merge'}
                  {@const merged = mergedTags(d.copies)}
                  <span>The kept copy gets every tag ({merged.map((t) => t.name).join(', ') || 'none'}){d.copies.some((c) => c.favorited) ? ', the star' : ''}, a description and every place in a collection. The other copies go to the Recycle Bin{d.copies.filter((c) => c.favorited).length > 1 ? ', unstarred' : ''}.</span>
                  <button class="rbtn" onclick={() => (dupModes = { ...dupModes, [i.id]: undefined as never })}>Back</button>
                  <button class="rbtn pri" disabled={busy} onclick={() => fix(i, { action: 'merge', keepId: pick })}>Merge into copy {d.copies.findIndex((c) => c.id === pick) + 1}</button>
                {:else}
                  <span class:warn={stars >= 2}>{stars >= 2 ? 'Two copies are starred, and starred images can’t be recycled. Unstar one, or merge them into a single copy.' : 'The copies have different tags, so the app won’t pick one for you.'}</span>
                  <button class="rbtn" disabled={stars >= 2} title={stars >= 2 ? 'Unstar one copy first' : ''} onclick={() => { dupModes = { ...dupModes, [i.id]: 'keep' }; picks = { ...picks, [i.id]: d.keepId ?? d.copies[0]!.id }; }}>Keep one…</button>
                  <button class="rbtn pri" onclick={() => { dupModes = { ...dupModes, [i.id]: 'merge' }; picks = { ...picks, [i.id]: d.keepId ?? d.copies[0]!.id }; }}>Merge into…</button>
                {/if}
              </div>
            </div>
          {:else}
            <div class="row">
              <span class="stripe" style:background={stripe}></span>
              <!-- Picture: a thumbnail, or the kind of thing -->
              {#if d.kind === 'missing_file' || (d.kind === 'external_move' && d.entity === 'files')}
                {@const th = d.kind === 'missing_file' ? d.thumb : d.files[0]?.thumb}
                {#if th}<div class="pic sm"><Thumb file={th} fit="cover" /></div>{:else}<div class="nothumb">NO<br />THUMBNAIL</div>{/if}
              {:else if d.kind === 'missing_folder' || (d.kind === 'external_move' && d.entity === 'folder') || d.kind === 'unmarked_folder'}
                <div class="icon" class:red={d.kind === 'missing_folder'} class:guess={d.kind === 'unmarked_folder'}>
                  <KindIcon kind={d.kind === 'missing_folder' ? d.folderKind : d.kind === 'unmarked_folder' ? (kinds[i.id] ?? d.current) : 'subcategory'} size={22} />
                </div>
              {:else if d.kind === 'loose_files' || d.kind === 'nested_in_album'}
                <div class="icon"><KindIcon kind={d.kind === 'nested_in_album' ? 'album' : d.folderId === null ? 'category' : 'subcategory'} size={22} /></div>
              {:else}
                <div class="icon"><svg width="22" height="22" viewBox="0 0 16 16"><path d="M3 1.5 H10 L13 4.5 V14.5 H3 Z" fill="none" stroke="currentColor" stroke-width="1.4" /><rect x="5" y="8" width="6" height="1.4" fill="currentColor" /><rect x="5" y="10.8" width="4" height="1.4" fill="currentColor" /></svg></div>
              {/if}

              <div class="info">
                {#if d.kind === 'missing_folder'}
                  <div class="t-row"><span class="title">{d.name}</span>{@render chip(folderLabel(d.folderKind))}</div>
                  {@render path('WAS', { pre: winPath(d.path), hit: '', post: '' }, true)}
                  <span class="meta">{[d.folders && plural(d.folders, 'folder') + ' inside', plural(d.images, 'image') + ' inside', `gone since ${formatDate(i.detectedAt)}`].filter(Boolean).join(' · ')}</span>
                {:else if d.kind === 'missing_file'}
                  <div class="t-row"><span class="title">{d.filename}</span>{@render chip('Image')}</div>
                  {@render path('WAS', { pre: winPath(d.path), hit: '', post: '' }, true)}
                  {@render tags(d.tags)}
                  <span class="meta">{[d.favorited && '★ starred', d.collections && `in ${plural(d.collections, 'collection')}`, !d.thumb && 'no cached thumbnail'].filter(Boolean).join(' · ') || `missing since ${formatDate(i.detectedAt)}`}</span>
                {:else if d.kind === 'external_move' && d.entity === 'folder'}
                  {@const [w, n] = diff(d.from, d.to)}
                  {@const renamed = d.from.split('/').slice(0, -1).join('/') === d.to.split('/').slice(0, -1).join('/')}
                  <div class="t-row"><span class="title">{d.from.split('/').at(-1)}{renamed ? ` → ${d.name}` : ''}</span>{@render chip('Folder')}{@render chip(renamed ? 'Renamed' : 'Moved')}</div>
                  {@render path('WAS', w, true)}
                  {@render path('NOW', n)}
                  <span class="meta">tags, stars and covers already followed · seen {formatDate(i.detectedAt)}</span>
                {:else if d.kind === 'external_move' && d.entity === 'files'}
                  {@const [w, n] = diff(d.fromFolder, d.toFolder)}
                  <div class="t-row"><span class="title">{d.files.length === 1 ? d.files[0]!.filename : `${plural(d.files.length, 'image')} moved together`}</span>{@render chip(d.files.length === 1 ? 'Image' : 'Images')}{@render chip('Moved')}</div>
                  {@render path('WAS', w, true)}
                  {@render path('NOW', n)}
                  {#if d.files.length > 1}
                    <div class="strip">{#each d.files.slice(0, 5) as f (f.id)}<div><Thumb file={f.thumb ?? undefined} fit="cover" /></div>{/each}{#if d.files.length > 5}<span>+{d.files.length - 5}</span>{/if}</div>
                  {/if}
                  <span class="meta">{d.files.length > 1 ? `one item, because they moved together · Keep or Undo covers all ${d.files.length}` : `tags followed · seen ${formatDate(i.detectedAt)}`}</span>
                {:else if d.kind === 'loose_files'}
                  <div class="t-row"><span class="title">{plural(d.count, 'loose image')} in {d.path ? d.path.split('/').at(-1) : 'Images'}</span>{@render chip(d.folderId === null ? 'Images' : 'Folder')}{@render chip('Loose images')}</div>
                  {@render plain('IN', winPath(d.path))}
                  <span class="meta">racks and drawers hold folders, never loose images (§2.3)</span>
                  {#if naming?.id === i.id}
                    <div class="inline">
                      <span>New album in {d.path.split('/').at(-1)}:</span>
                      <input bind:value={naming.name} spellcheck="false" />
                      <button class="rbtn pri" disabled={busy || !naming.name.trim()} onclick={() => { const n = naming!.name.trim(); naming = null; void fix(i, { action: 'new-album', name: n }); }}>Create &amp; move {d.count}</button>
                      <button class="rbtn" onclick={() => (naming = null)}>Cancel</button>
                    </div>
                  {/if}
                {:else if d.kind === 'nested_in_album'}
                  {@const [, n] = diff(d.albumPath, d.path)}
                  <div class="t-row"><span class="title">A folder inside {d.albumPath.split('/').at(-1)}</span>{@render chip('Album')}{@render chip('Folder inside')}</div>
                  {@render path('IN', n)}
                  <span class="meta">“{d.path.split('/').at(-1)}” · an album holds images only</span>
                  {#if converting?.id === i.id}
                    <div class="note">
                      <span class="note-lab">What convert does</span>
                      <span>{d.albumPath.split('/').at(-1)} becomes a sub-category. Its images move into a new album inside it, next to “{d.path.split('/').at(-1)}”, which becomes a folder of its own (confirm its kind afterwards).</span>
                      <div class="inline">
                        <span>New album:</span><input bind:value={converting.name} spellcheck="false" />
                        <button class="rbtn pri" disabled={busy || !converting.name.trim()} onclick={() => { const n = converting!.name.trim(); converting = null; void fix(i, { action: 'convert', name: n }); }}>Convert</button>
                        <button class="rbtn" onclick={() => (converting = null)}>Cancel</button>
                      </div>
                    </div>
                  {/if}
                {:else if d.kind === 'unmarked_folder'}
                  {@const cur = kinds[i.id] ?? d.current}
                  <div class="t-row"><span class="title">{d.path.split('/').at(-1)}</span>{@render chip(`Guessed: ${folderLabel(d.current)}`, 'guess')}{#if !d.images && !d.folders}{@render chip('Empty')}{/if}</div>
                  {@render plain('IN', winPath(d.path))}
                  <span class="meta">{!d.images && !d.folders ? 'empty · nothing to go by, so “album” is only a default' : [d.folders && `holds ${plural(d.folders, 'folder')}`, d.images && plural(d.images, 'image')].filter(Boolean).join(' · ')} · made outside the app</span>
                  <div class="seg">
                    {#each ['album', 'subcategory'] as k (k)}
                      <button class:on={cur === k} class:guess={d.current === k} onclick={() => (kinds = { ...kinds, [i.id]: k as FolderKind })}>{folderLabel(k as FolderKind)}{d.current === k ? ' · guess' : ''}</button>
                    {/each}
                  </div>
                {:else if d.kind === 'unsupported'}
                  <div class="t-row"><span class="title">{d.path.split('/').at(-1)}</span>{@render chip(d.ext.toUpperCase())}{@render chip('Not supported')}</div>
                  {@render plain('IN', winPath(d.path.split('/').slice(0, -1).join('/')))}
                  <span class="meta">the app can’t show {d.ext.toUpperCase()} images yet · <b>Ignore</b> leaves it where it is (listed under Not tracked) · <b>Record</b> moves it to the hidden Invalid folder · both count in the statistics</span>
                {:else if d.kind === 'wrong_type'}
                  <div class="t-row"><span class="title">{d.path.split('/').at(-1)}</span>{@render chip(d.unreadable ? 'Unreadable image' : d.ext ? d.ext.toUpperCase() : 'File')}</div>
                  {@render plain('IN', winPath(d.path.split('/').slice(0, -1).join('/')))}
                  <span class="meta">{d.unreadable ? 'the app couldn’t read this image · recycle it, or replace the file' : 'no module takes this kind of file'}</span>
                {:else if d.kind === 'moved_file'}
                  <div class="t-row"><span class="title">{d.from.split('/').at(-1)}</span>{@render chip(d.module === 'videos' ? 'Video' : d.module === 'audio' ? 'Audio' : 'Text')}{@render chip('Moved')}</div>
                  {@render path('WAS', diff(d.from, d.to.split('/').slice(1).join('/'))[0], true)}
                  {@render plain('NOW', [d.to.split('/')[0], ...d.to.split('/').slice(1)].join('\\'))}
                  <span class="meta">moved by the scan {formatDate(i.detectedAt)} · it’ll show in the {d.module === 'texts' ? 'Texts' : d.module === 'audio' ? 'Audio' : 'Videos'} module when that exists</span>
                {/if}
              </div>

              <div class="btns">
                {#if d.kind === 'missing_folder'}
                  <button class="rbtn pri" disabled={busy} onclick={() => fix(i, { action: 'recreate' })}>Recreate</button>
                  <button class="rbtn red" disabled={busy} onclick={() => forget(i)}>Forget…</button>
                {:else if d.kind === 'missing_file'}
                  <button class="rbtn pri" disabled={busy} onclick={() => locate(i)}>Locate…</button>
                  <button class="rbtn red" disabled={busy} onclick={() => forget(i)}>Forget…</button>
                {:else if d.kind === 'external_move'}
                  <button class="rbtn pri" disabled={busy} onclick={() => fix(i, { action: 'keep' })}>Keep</button>
                  <button class="rbtn" disabled={busy} onclick={() => fix(i, { action: 'undo' })}>Undo</button>
                {:else if d.kind === 'loose_files' && naming?.id !== i.id}
                  {#if d.folderId !== null}<button class="rbtn pri" onclick={() => (naming = { id: i.id, name: 'Loose images' })}>Move into a new album…</button>{/if}
                  <button class="rbtn" onclick={() => (picking = i)}>Into an existing album…</button>
                {:else if d.kind === 'nested_in_album' && converting?.id !== i.id}
                  <button class="rbtn pri" disabled={busy} onclick={() => fix(i, { action: 'move-out' })}>Move it out</button>
                  <button class="rbtn" onclick={() => (converting = { id: i.id, name: d.albumPath.split('/').at(-1) ?? 'Images' })}>Convert…</button>
                {:else if d.kind === 'unmarked_folder'}
                  {@const cur = kinds[i.id] ?? d.current}
                  <button class="rbtn pri" disabled={busy} onclick={() => fix(i, { action: 'confirm', folderKind: cur as 'album' })}>
                    {cur === d.current ? `Confirm ${folderLabel(cur).toLowerCase()}` : `Make it ${cur === 'album' ? 'an album' : 'a sub-category'}`}
                  </button>
                {:else if d.kind === 'unsupported'}
                  <button class="rbtn" disabled={busy} onclick={() => fix(i, { action: 'ignore' })}>Ignore</button>
                  <button class="rbtn pri" disabled={busy} onclick={() => fix(i, { action: 'record' })} title={RECORD_TIP}>Record</button>
                {:else if d.kind === 'wrong_type'}
                  {#if !d.unreadable}<button class="rbtn" disabled={busy} onclick={() => fix(i, { action: 'ignore' })}>Ignore</button>{/if}
                  <button class="rbtn red" disabled={busy} onclick={() => fix(i, { action: 'recycle' })}>Recycle</button>
                {:else if d.kind === 'moved_file'}
                  <button class="rbtn pri" disabled={busy} onclick={() => fix(i, { action: 'ok' })}>OK</button>
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      {/if}
    {/each}
    <div class="pad"></div>
  </div>
</div>

{#if picking}
  <AlbumPickDialog title="Move the loose images" sub="pick an album or the Inbox · the images move on disk" onpick={intoAlbum} onclose={() => (picking = null)} />
{/if}

<style>
  .health-page { height: calc(100vh - 56px); display: flex; flex-direction: column; overflow: hidden; }
  .tabs { display: flex; align-items: stretch; border-bottom: 1px solid var(--line); flex: none; padding: 0 32px; }
  .tabs a { display: flex; align-items: center; gap: 8px; padding: 10px 16px 11px; color: var(--text2); text-decoration: none; font: 700 16px/1 var(--font-display); letter-spacing: 0.04em; text-transform: uppercase; }
  .tabs a.on { color: var(--text); box-shadow: inset 0 -3px 0 var(--accent); }
  .tabs a:hover { color: var(--text); }
  .tabs .dot { width: 10px; height: 10px; }
  .tabs .back { margin-left: auto; font: 11px var(--font-mono); }
  .body { flex: 1; overflow-y: auto; overflow-x: hidden; }
  .body.dim { opacity: 0.4; pointer-events: none; }

  .sec-head { display: flex; align-items: stretch; border-bottom: 1px solid var(--line); }
  .edge { width: 8px; flex: none; }
  .sec-titles { flex: 1; display: flex; align-items: baseline; gap: 16px; padding: 14px 24px 12px; }
  .sec-title { font: 700 34px/1 var(--font-display); text-transform: uppercase; }
  .sec-count { font: 700 13px var(--font-mono); }
  .sec-sub { font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }

  .g-head { width: 100%; display: flex; align-items: center; gap: 12px; padding: 14px 32px 10px 20px; border: none; border-bottom: 1px solid var(--line); background: var(--bg2); color: var(--text); text-align: left; cursor: pointer; }
  .arrow { width: 14px; font: 13px var(--font-mono); color: var(--text2); }
  .g-name { font: 700 22px/1 var(--font-display); text-transform: uppercase; }
  .g-count { font: 700 12px var(--font-mono); }
  .need { padding: 2px 6px; border: 1px dashed var(--text2); font: 700 10px/1.3 var(--font-mono); text-transform: uppercase; }
  .g-hint { margin-left: auto; font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }

  .row { display: grid; grid-template-columns: 4px 72px minmax(0, 1fr) auto; gap: 0 16px; align-items: start; padding: 14px 32px 14px 0; border-bottom: 1px solid var(--line); }
  .stripe { align-self: stretch; }
  .pic { width: 72px; height: 54px; background: var(--thumb); outline: 1px solid var(--line); overflow: hidden; }
  .nothumb { width: 72px; height: 54px; border: 1px dashed var(--text2); display: grid; place-items: center; text-align: center; font: 9.5px/1.3 var(--font-mono); color: var(--text2); }
  .icon { width: 72px; height: 54px; border: 1px solid var(--line); background: var(--bg2); display: grid; place-items: center; color: var(--text2); }
  .icon.red { border: 1px dashed var(--red); color: var(--red); }
  .icon.guess { border: 1px dashed var(--amber); color: var(--amber); }
  .info { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
  .t-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .title { font: 700 20px/1.05 var(--font-display); overflow-wrap: anywhere; }
  .chip { padding: 2px 6px; font: 700 10px/1.3 var(--font-mono); text-transform: uppercase; white-space: nowrap; background: var(--surface2); color: var(--text2); }
  .chip.guess { background: none; color: var(--amber); border: 1px dashed var(--amber); }
  .chip.need { background: none; color: var(--text); border: 1px dashed var(--text2); }
  .chip.new { background: var(--accent2); color: #111; }
  .line { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 8px; font: 11.5px/1.45 var(--font-mono); }
  .line .lab { color: var(--text2); }
  .line span { overflow-wrap: anywhere; }
  .line .dim { color: var(--text2); }
  mark { background: color-mix(in oklab, var(--accent) 35%, transparent); color: var(--text); }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .tags span { padding: 2px 7px; font-size: 12px; }
  .meta { font: 11px/1.5 var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .meta b { color: var(--text); font-weight: 400; }
  .strip { display: flex; gap: 4px; align-items: center; }
  .strip div { width: 56px; height: 40px; background: var(--thumb); overflow: hidden; outline: 1px solid var(--line); }
  .strip span { font: 11px var(--font-mono); color: var(--text2); padding-left: 4px; }
  .btns { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; max-width: 380px; }
  .rbtn { display: inline-flex; align-items: center; height: 34px; padding: 0 14px; border: 1px solid var(--line); background: none; color: var(--text); font: 700 14px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; text-decoration: none; cursor: pointer; }
  .rbtn:hover:not(:disabled) { border-color: var(--text); }
  .rbtn.pri { border-color: transparent; background: var(--accent); color: var(--accent-ink); }
  .rbtn.red { border-color: var(--red); color: var(--red); }
  .rbtn:disabled { opacity: 0.4; cursor: not-allowed; }
  .inline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .inline input { height: 34px; padding: 0 10px; border: 1px solid var(--text); background: var(--bg2); color: var(--text); font: 700 16px var(--font-display); outline: none; min-width: 220px; }
  .note { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); font-size: 13.5px; line-height: 1.45; }
  .note-lab { font: 700 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .seg { display: flex; align-self: flex-start; border: 1px solid var(--line); }
  .seg button { height: 28px; padding: 0 10px; border: none; background: none; color: var(--text2); font: 700 11px var(--font-mono); text-transform: uppercase; cursor: pointer; }
  .seg button.guess { outline: 1px dashed var(--amber); outline-offset: -3px; }
  .seg button.on { background: var(--text); color: var(--bg); }

  .unclear, .dup { display: grid; grid-template-columns: 4px minmax(0, 1fr); border-bottom: 1px solid var(--line); }
  .dup { display: flex; flex-direction: column; gap: 12px; padding: 14px 32px 16px 20px; }
  .uc-body { display: flex; flex-direction: column; gap: 12px; padding: 14px 32px 16px 16px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .found, .cand, .copy { display: flex; flex-direction: column; gap: 8px; padding: 0 0 12px; border: none; outline: 1px solid var(--line); background: var(--bg2); color: var(--text); text-align: left; font: inherit; }
  .found > :not(.band), .cand > :not(.band), .copy > :not(.band) { margin: 0 12px; }
  .cand, .copy { cursor: pointer; }
  .cand.on, .copy.keep { outline: 2px solid var(--accent); }
  .copy.gone { opacity: 0.6; }
  .band { padding: 6px 12px; background: var(--surface2); color: var(--text2); font: 700 11px var(--font-mono); text-transform: uppercase; }
  .band.on, .band.keep { background: var(--accent); color: var(--accent-ink); }
  .band.star { background: var(--accent2); color: #111; }
  .found .pic { width: auto; height: 120px; }
  .notags { font: 10.5px var(--font-mono); color: var(--text2); }
  .facts { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 3px 8px; font: 11px var(--font-mono); }
  .facts span:nth-child(odd) { color: var(--text2); }
  .facts span { overflow-wrap: anywhere; }
  .uc-foot, .dup-foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13.5px; color: var(--text2); }
  .uc-foot span, .dup-foot span { flex: 1; min-width: 240px; }
  .dup-foot .warn { color: var(--amber); }
  .dup-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .dup-thumb { width: 56px; height: 40px; background: var(--thumb); overflow: hidden; outline: 1px solid var(--line); }
  .copies { display: grid; gap: 12px; }
  .where { font: 11px var(--font-mono); color: var(--text2); overflow-wrap: anywhere; }
  .only { font: 10.5px var(--font-mono); color: var(--amber); }
  .unstar { align-self: flex-start; padding: 4px 10px; border: 1px solid var(--line); font: 700 11px var(--font-mono); text-transform: uppercase; }
  .unstar:hover { border-color: var(--text); }

  .empty { display: flex; flex-direction: column; gap: 8px; padding: 40px 32px; font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .empty .display { font-size: 48px; color: var(--text); }
  .empty a { color: var(--accent); }
  .pad { height: 60px; }
</style>
