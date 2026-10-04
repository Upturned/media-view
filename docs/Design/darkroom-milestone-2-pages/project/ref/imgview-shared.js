// Shared demo data + behavior for the three img-view direction files.
const T = {
  character: { label: 'Character', color: '#2E9E5B' },
  source: { label: 'Source', color: '#B0487A' },
  artist: { label: 'Artist', color: '#D08A1E' },
  general: { label: 'General', color: '#6B7A99' },
};
const ORDER = ['character', 'source', 'artist', 'general'];
const W = 1440;

export function ink(hex) {
  const n = parseInt(hex.slice(1), 16);
  const L = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = 0.2126 * L((n >> 16) & 255) + 0.7152 * L((n >> 8) & 255) + 0.0722 * L(n & 255);
  return lum > 0.179 ? '#000000' : '#FFFFFF';
}
const fmt = n => n.toLocaleString('en-US');
const disp = s => s.replace(/_/g, ' ');

const RAW = {
  character: 'aerin_valecrest lathir maelis_of_the_thornwood_court ysolde corin_ashgrove the_pale_archivist fennick saoirse_dunmore odrin vael nimue_(winter_form) tamsin_reed kaelen silas_wren brannoch idrel sera_moonwhistle quill',
  source: 'the_ilvenmar_cycle chapter_3_the_long_road_south original_character the_lord_of_the_rings ashes_of_varn_(webcomic) thornwood_tales commissions_2025 dnd_campaign_saltmarsh oneshots',
  artist: 'felipe mirelle_k ohno_tatsu gr4yhound lumen_studio petra_vasquez jun_ah silverpoint_sam ink_and_ivy w.o.l.f unknown_artist',
  general: 'silver_hair long_hair pointy_ears full_body turnaround expression_sheet standing three-quarter_view portrait armor cape circlet silk_embroidered_robe sketch lineart flat_colors painterly monochrome blue_eyes green_eyes smiling serious side_view back_view hands_reference holding_staff holding_bow night forest_background white_background simple_background transparent_background jewelry braid freckles scar_across_left_eye_from_the_siege_of_varn animated wip color_palette height_chart multiple_views dramatic_lighting',
};
const DESC = {
  aerin_valecrest: 'Heir to the silver court of Ilvenmar. Never smiles in canon; constantly smiles in fanart.',
  lathir: "Aerin's sworn blade. Left-handed — check the hands before you tag.",
  maelis_of_the_thornwood_court: 'Thornwood envoy. Three outfits, all of them thorns.',
  the_ilvenmar_cycle: 'The main story. Every court character implies this one.',
  chapter_3_the_long_road_south: 'Chapter 3 of the Ilvenmar Cycle. The one with the rain.',
  original_character: 'Mine, all mine. Characters I made up rather than borrowed.',
  the_lord_of_the_rings: 'Also known as lotr. You know the one.',
  sketch: 'Rough, unfinished, gloriously messy. Exclude it when you want to look competent.',
  wip: 'Work in progress. Some of these have been "in progress" since 2022.',
  armor: 'Plate, leather, scale — anything that would hurt to be hit by.',
  cape: 'Capes, cloaks, mantles. If it billows, it counts.',
  felipe: "That's you. Hi.",
  mirelle_k: 'Commissioned artist. Paid in full, credited always.',
  silver_hair: 'Silver, white, platinum. Aliases: white_hair, platinum_hair.',
  scar_across_left_eye_from_the_siege_of_varn: 'Yes, the full name. No, we are not shortening it.',
  odrin: 'Old sword-master. Also answers to "silvermane", and to nothing before coffee.',
  silverpoint_sam: 'Does everything in silverpoint. Refuses to explain why.',
};
const ALIASES = { lotr: 'the_lord_of_the_rings', aerin: 'aerin_valecrest', white_hair: 'silver_hair', greyhound: 'gr4yhound', silvermane: 'odrin', platinum_hair: 'silver_hair' };
const IMPLIED = { the_ilvenmar_cycle: 'aerin_valecrest', original_character: 'aerin_valecrest' };

const TAGS = [];
ORDER.forEach(type => RAW[type].split(' ').forEach((name, i) => {
  const base = { character: 460, source: 900, artist: 380, general: 820 }[type];
  const count = Math.max(1, Math.round(base * Math.pow(0.8, i) + ((i * 37) % 23)));
  TAGS.push({ name, type, color: T[type].color, ink: ink(T[type].color), count, total: count * 9 + ((i * 131) % 400),
    desc: DESC[name] || `${T[type].label} tag — no wiki text yet. Ctrl+click to write its page.` });
}));
const TAG = Object.fromEntries(TAGS.map(t => [t.name, t]));

const FILES = [
  ['aerin_valecrest__court_regalia_turnaround_FINAL_v3 (1).png', 2 / 3, 'png'],
  ['aerin_expressions_sheet_A_happy-sad-furious-smug.png', 16 / 9, 'png'],
  ['lathir_bust_wip.jpg', 4 / 5, 'jpg'],
  ['IMG_20250614_183302_ref_lighting.jpg', 3 / 2, 'jpg'],
  ['maelis_thornwood_court_dress__back_detail.png', 2 / 3, 'png'],
  ['circlet_design_variants_x12.png', 21 / 9, 'png'],
  ['blink_loop_aerin.gif', 1, 'gif'],
  ['icon_crest_ilvenmar_64px.png', 1, 'png', 'tiny'],
  ['ysolde_full_body_lineart_clean.png', 1 / 2.4, 'png'],
  ['pose_ref_kneeling_with_staff (from sketchbook p.43).jpg', 3 / 4, 'jpg'],
  ['hands_reference_sheet__holding_bow_and_quill.png', 4 / 3, 'png'],
  ['corin_ashgrove_height_chart_vs_the_whole_party.png', 32 / 9, 'png'],
  ['palette_court_night_scene.png', 5, 'png'],
  ['the_pale_archivist__concept_03.jpg', 2 / 3, 'jpg'],
  ['scan_0042.jpg', 8.5 / 11, 'jpg'],
  ['aerin_cape_flow_animation_test.gif', 4 / 3, 'gif'],
  ['commission_mirelle_k_aerin_and_lathir_final_signed.png', 3 / 4, 'png'],
  ['Screenshot 2025-11-02 031407.png', 16 / 10, 'png'],
  ['silas_wren_mugshot_frontal.png', 1, 'png'],
  ['ear_shapes_by_bloodline.png', 3 / 2, 'png'],
  ['nimue_winter_form_v2_(do_not_use_v1).png', 2 / 3, 'png'],
  ['map_detail_court_district.jpg', 1, 'jpg'],
  ['fennick_sticker.webp', 1, 'webp', 'tiny'],
  ['throne_room_establishing_shot_4k.jpg', 16 / 9, 'jpg'],
  ['tamsin_reed_face_closeup_freckles.avif', 4 / 5, 'avif'],
  ['embroidery_pattern_tile.svg', 1, 'svg', 'tiny'],
  ['kaelen__armor_breakdown_layers_01-07.png', 9 / 16, 'png'],
  ['ref_dramatic_rimlight_moodboard.jpg', 3 / 2, 'jpg'],
  ['brannoch_profile_left.png', 3 / 4, 'png'],
  ['idrel_and_sera_moonwhistle_duo_pose.png', 4 / 3, 'png'],
  ['vael_idle_breathing.gif', 2 / 3, 'gif'],
  ['quill_tiny_doodle_margin.png', 1, 'png', 'tiny'],
  ['saoirse_dunmore_travel_outfit_ch3.jfif', 3 / 4, 'jfif'],
  ['odrin_old_master_portrait_oil_ref.jpg', 4 / 5, 'jpg'],
  ['court_banner_long_strip.png', 1 / 4, 'png'],
  ['untitled-1-final-final.png', 1, 'png'],
];
const FAV = new Set([0, 4, 6, 13, 16, 20, 23, 29, 33]);
const CH3 = [0, 4, 2, 9, 10, 13, 16, 20, 24, 26, 28, 29];
const COURT = [0, 5, 1, 4, 15, 26];
const fill = (h, l = 0.44) => `repeating-linear-gradient(135deg, oklch(${l} 0.07 ${h}) 0 7px, oklch(${l - 0.04} 0.07 ${h}) 7px 14px)`;
const hueOf = i => (i * 47 + 20) % 360;
const ratioLabel = ar => { const m = [[2/3,'2:3'],[16/9,'16:9'],[4/5,'4:5'],[3/2,'3:2'],[21/9,'21:9'],[1,'1:1'],[3/4,'3:4'],[4/3,'4:3'],[32/9,'32:9'],[5,'5:1'],[16/10,'16:10'],[9/16,'9:16'],[1/4,'1:4'],[1/2.4,'5:12'],[8.5/11,'letter']].find(([v]) => Math.abs(v - ar) < 0.01); return m ? m[1] : ar.toFixed(2); };

const VIEW_TAGS = ['aerin_valecrest', 'lathir', 'the_ilvenmar_cycle', 'chapter_3_the_long_road_south', 'original_character', 'felipe', 'mirelle_k',
  'silver_hair', 'long_hair', 'pointy_ears', 'full_body', 'turnaround', 'multiple_views', 'standing', 'armor', 'cape', 'circlet', 'silk_embroidered_robe',
  'jewelry', 'braid', 'blue_eyes', 'serious', 'white_background', 'flat_colors', 'scar_across_left_eye_from_the_siege_of_varn'];

const CATS = [
  ['Fantasy', 8412, '4 drawers · 11 albums'], ['Photography', 12903, '6 drawers · 48 albums'], ['Character Design Sheets', 3211, '2 drawers · 19 albums'],
  ['Anatomy & Pose Reference', 5126, '9 albums'], ['Concept Art — Environments', 4310, '3 drawers · 14 albums'], ['Sci-Fi & Mecha Reference', 2780, '1 drawer · 7 albums'],
  ['Wallpapers (the good ones)', 1904, '4 albums'], ['Comics — Ashes of Varn pages', 642, '12 albums'], ['Reaction Images', 977, '1 album'], ['Untitled rack', 0, 'empty'],
];

export const THEMES = {
  A: {
    Modern: { bg: '#0e0d11', bg2: '#09080b', surface: '#17151b', surface2: '#221f28', line: '#2f2b36', text: '#f1ebe3', text2: '#a39aa3', accent: '#e3a857', accentInk: '#1b1206', accent2: '#c2554a', red: '#ef5b52', amber: '#f0b429', blue: '#6aa8f5', thumb: '#141217', scrim: 'rgba(8,7,10,.74)' },
    Minimal: { bg: '#f5f3ef', bg2: '#ebe8e2', surface: '#ffffff', surface2: '#f0ede8', line: '#ddd8d0', text: '#1c1a1f', text2: '#625c66', accent: '#94570f', accentInk: '#ffffff', accent2: '#a33a33', red: '#c8322b', amber: '#9c6514', blue: '#2a64c4', thumb: '#e7e3dc', scrim: 'rgba(245,243,239,.84)' },
    Warm: { bg: '#1d1612', bg2: '#150f0c', surface: '#271e18', surface2: '#33271f', line: '#45362b', text: '#f6e7d4', text2: '#bba58c', accent: '#f0a35e', accentInk: '#2a1606', accent2: '#d0614a', red: '#f06a54', amber: '#f2b33d', blue: '#86b0e6', thumb: '#221a15', scrim: 'rgba(21,15,12,.76)' },
    'High Contrast': { bg: '#000000', bg2: '#000000', surface: '#000000', surface2: '#141414', line: '#ffffff', text: '#ffffff', text2: '#e8e8e8', accent: '#ffd400', accentInk: '#000000', accent2: '#ff6b6b', red: '#ff4d4d', amber: '#ffb000', blue: '#5cb0ff', thumb: '#0a0a0a', scrim: 'rgba(0,0,0,.88)' },
  },
  B: {
    Modern: { bg: '#121212', bg2: '#0b0b0b', surface: '#1b1b1a', surface2: '#262625', line: '#363631', text: '#f3f2ec', text2: '#9a9990', accent: '#ff4b2b', accentInk: '#0b0b0b', accent2: '#f2e34b', red: '#ff3d5a', amber: '#ffb020', blue: '#58a6ff', thumb: '#0e0e0e', scrim: 'rgba(11,11,11,.8)' },
    Minimal: { bg: '#f4f4f0', bg2: '#e9e9e3', surface: '#ffffff', surface2: '#efefea', line: '#cfcfc6', text: '#111111', text2: '#57574f', accent: '#d8341a', accentInk: '#ffffff', accent2: '#a38600', red: '#c8173a', amber: '#9e6600', blue: '#1d67c9', thumb: '#e4e4dd', scrim: 'rgba(244,244,240,.86)' },
    Warm: { bg: '#1a1310', bg2: '#120d0b', surface: '#241b17', surface2: '#30241e', line: '#47372e', text: '#f7ebdf', text2: '#b9a493', accent: '#ff7a3d', accentInk: '#1a0d06', accent2: '#ffd27a', red: '#ff5a5a', amber: '#ffbe3d', blue: '#7fb2ee', thumb: '#16100d', scrim: 'rgba(18,13,11,.8)' },
    'High Contrast': { bg: '#000000', bg2: '#000000', surface: '#000000', surface2: '#111111', line: '#ffffff', text: '#ffffff', text2: '#eeeeee', accent: '#ffea00', accentInk: '#000000', accent2: '#00e5ff', red: '#ff4d4d', amber: '#ffb000', blue: '#5cb0ff', thumb: '#000000', scrim: 'rgba(0,0,0,.9)' },
  },
  C: {
    Modern: { bg: '#0b0b0b', bg2: '#000000', surface: '#171717', surface2: '#232323', line: '#f5f5f5', text: '#ffffff', text2: '#bdbdbd', accent: '#c8ff1a', accentInk: '#000000', accent2: '#ff2f8f', accent3: '#6b69ff', red: '#ff3b3b', amber: '#ffb800', blue: '#3ba7ff', thumb: '#1c1c1c', scrim: 'rgba(0,0,0,.78)' },
    Minimal: { bg: '#fbfaf6', bg2: '#f0eee6', surface: '#ffffff', surface2: '#f3f1ea', line: '#111111', text: '#111111', text2: '#4f4f4f', accent: '#2f2bff', accentInk: '#ffffff', accent2: '#e0176f', accent3: '#0f9e5a', red: '#d81f1f', amber: '#a86b00', blue: '#1f6fd6', thumb: '#ecebe4', scrim: 'rgba(251,250,246,.86)' },
    Warm: { bg: '#1e0f14', bg2: '#150a0e', surface: '#2a1620', surface2: '#36202b', line: '#ffe8d6', text: '#fff3e8', text2: '#d8b9a8', accent: '#ffb627', accentInk: '#1e0f14', accent2: '#ff5d73', accent3: '#7ad3ff', red: '#ff5252', amber: '#ffc23d', blue: '#7ad3ff', thumb: '#24121a', scrim: 'rgba(21,10,14,.8)' },
    'High Contrast': { bg: '#000000', bg2: '#000000', surface: '#000000', surface2: '#111111', line: '#ffffff', text: '#ffffff', text2: '#ffffff', accent: '#ffff00', accentInk: '#000000', accent2: '#ff00ff', accent3: '#00ffff', red: '#ff4040', amber: '#ffb000', blue: '#40a0ff', thumb: '#000000', scrim: 'rgba(0,0,0,.9)' },
  },
  D: {
    Modern: { bg: '#1c1830', bg2: '#161227', surface: '#262040', surface2: '#322a54', line: '#41386a', text: '#fff4fa', text2: '#bcb0d8', accent: '#ff8fc2', accentInk: '#2a0c1c', accent2: '#8ff0d0', accent3: '#ffe08a', red: '#ff6b8a', amber: '#ffc46b', blue: '#8fb8ff', thumb: '#221d3a', scrim: 'rgba(22,18,39,.78)' },
    Minimal: { bg: '#fff7fb', bg2: '#fbeef5', surface: '#ffffff', surface2: '#fdf0f6', line: '#f0d6e4', text: '#3a2340', text2: '#76607e', accent: '#d63f87', accentInk: '#ffffff', accent2: '#16876a', accent3: '#9a6a00', red: '#d0304f', amber: '#a85f00', blue: '#3366cc', thumb: '#f6e6ef', scrim: 'rgba(255,247,251,.84)' },
    Warm: { bg: '#2a1a1c', bg2: '#211416', surface: '#352325', surface2: '#432c2e', line: '#58393b', text: '#fff1e8', text2: '#d6b9ad', accent: '#ffa585', accentInk: '#2a120a', accent2: '#ffd88a', accent3: '#b8e6a0', red: '#ff7070', amber: '#ffc46b', blue: '#9fc0ff', thumb: '#2f1f21', scrim: 'rgba(33,20,22,.8)' },
    'High Contrast': { bg: '#000000', bg2: '#000000', surface: '#000000', surface2: '#141414', line: '#ffffff', text: '#ffffff', text2: '#f0f0f0', accent: '#ff7ac0', accentInk: '#000000', accent2: '#6dffcc', accent3: '#ffe600', red: '#ff5070', amber: '#ffb000', blue: '#70b0ff', thumb: '#0a0a0a', scrim: 'rgba(0,0,0,.9)' },
  },
  E: {
    Modern: { bg: '#14110d', bg2: '#0d0b08', surface: '#1f1a13', surface2: '#2a2319', line: '#4a3d27', text: '#eadfc8', text2: '#a8997c', accent: '#d4ab52', accentInk: '#1a1206', accent2: '#c2443a', accent3: '#5b7fc7', red: '#d9493c', amber: '#e0a43a', blue: '#6f93d9', thumb: '#18140f', scrim: 'rgba(13,11,8,.8)' },
    Minimal: { bg: '#f3ead6', bg2: '#ebe0c7', surface: '#faf4e6', surface2: '#efe5cf', line: '#cdb98f', text: '#2b2114', text2: '#6b5a3d', accent: '#8a6414', accentInk: '#fffaf0', accent2: '#a3271d', accent3: '#2c4f99', red: '#a3271d', amber: '#8f5f00', blue: '#2c4f99', thumb: '#e6dbc1', scrim: 'rgba(243,234,214,.86)' },
    Warm: { bg: '#1e130c', bg2: '#160d08', surface: '#2a1b11', surface2: '#362417', line: '#5c4129', text: '#f4e2c4', text2: '#bfa27c', accent: '#e8b45a', accentInk: '#1e1206', accent2: '#d65a3c', accent3: '#7fa0d8', red: '#e05a44', amber: '#f0b040', blue: '#88a8e0', thumb: '#22160e', scrim: 'rgba(22,13,8,.82)' },
    'High Contrast': { bg: '#000000', bg2: '#000000', surface: '#000000', surface2: '#141414', line: '#ffffff', text: '#ffffff', text2: '#f0f0f0', accent: '#ffcc33', accentInk: '#000000', accent2: '#ff5a4a', accent3: '#7aa8ff', red: '#ff4d4d', amber: '#ffb000', blue: '#7aa8ff', thumb: '#000000', scrim: 'rgba(0,0,0,.9)' },
  },
};
const THEME_NAMES = ['Modern', 'Minimal', 'Warm', 'High Contrast'];
export function applyTheme(el, dir, name) {
  if (!el) return;
  const t = THEMES[dir][name] || THEMES[dir].Modern;
  for (const k in t) el.style.setProperty('--' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), t[k]);
}

export function initState(p) {
  return { theme: p.theme || 'Modern', side: { aerin_valecrest: 'inc', sketch: 'exc', wip: 'exc', armor: 'any', cape: 'any' },
    sel: { 2: 1, 3: 1, 9: 1, 10: 1 }, cols: 6, sort: 2, asc: false, fav: false, group: false, tip: null, q: 'sil', vAdded: [], ctype: 0,
    pInfo: true, pTags: true, pColl: true, panels: true, vpos: 3, zoom: 0, show: false, dropAlbum: false, dropLib: false, dropInbox: false, toast: null, sideFilter: '' };
}

function rel(el) {
  let x = 0, y = 0, n = el;
  while (n && !(n.dataset && n.dataset.tipRoot)) {
    x += n.offsetLeft; y += n.offsetTop;
    const p = n.offsetParent;
    let a = n.parentElement;
    while (a && a !== p) { x -= a.scrollLeft; y -= a.scrollTop; a = a.parentElement; }
    if (p && !(p.dataset && p.dataset.tipRoot)) { x -= p.scrollLeft; y -= p.scrollTop; }
    n = p;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

export function vals(c) {
  const st = c.state, set = p => c.setState(p);
  const tipOff = () => set({ tip: null });
  const tipOn = (board, place, data) => e => set({ tip: { board, place, ...rel(e.currentTarget), ...data } });
  const tipFor = b => {
    const t = st.tip; if (!t || t.board !== b) return null;
    let left, top, transform = 'none';
    if (t.place === 'right') { left = t.x + t.w + 12; top = t.y - 6; }
    else if (t.place === 'below') { left = Math.max(8, Math.min(t.x + t.w - 290, W - 300)); top = t.y + t.h + 10; }
    else { left = Math.max(8, Math.min(t.x, W - 300)); top = t.y - 10; transform = 'translateY(-100%)'; }
    return { ...t, left: left + 'px', top: top + 'px', transform };
  };
  const toast = (board, text) => { set({ toast: { board, text } }); clearTimeout(c._tt); c._tt = setTimeout(() => c.setState({ toast: null }), 3200); };

  // sidebar
  const sf = st.sideFilter.toLowerCase();
  const sideGroups = ORDER.map(type => {
    const tags = TAGS.filter(t => t.type === type && (!sf || t.name.includes(sf))).map(t => {
      const s = st.side[t.name] || 'off';
      const bg = { inc: `color-mix(in oklab, ${t.color} 30%, transparent)`, exc: 'transparent', any: `color-mix(in oklab, var(--blue) 12%, transparent)`, off: 'transparent' }[s];
      const bd = { inc: `1px solid ${t.color}`, exc: '1px solid color-mix(in oklab, var(--red) 75%, transparent)', any: '1px dashed var(--blue)', off: '1px solid transparent' }[s];
      return { ...t, label: disp(t.name), cnt: fmt(t.count), state: s, isInc: s === 'inc', isExc: s === 'exc', isAny: s === 'any', isOff: s === 'off',
        bg, bd, deco: s === 'exc' ? 'line-through' : 'none', op: s === 'exc' ? '0.6' : '1',
        onEnter: tipOn('album', 'right', { title: disp(t.name), typeLabel: T[type].label, color: t.color, ink: t.ink, desc: t.desc, meta: `${fmt(t.count)} here · ${fmt(t.total)} in library` }),
        onLeave: tipOff,
        onClick: e => {
          const cur = st.side[t.name] || 'off';
          const nx = (e.ctrlKey || e.metaKey) ? (cur === 'any' ? 'off' : 'any') : ({ off: 'inc', inc: 'exc', exc: 'off', any: 'off' })[cur];
          const side = { ...st.side }; if (nx === 'off') delete side[t.name]; else side[t.name] = nx; set({ side });
        },
        onCtx: e => e.preventDefault() };
    });
    return { type, label: T[type].label, color: T[type].color, ink: ink(T[type].color), n: tags.length, tags, has: tags.length > 0, roman: ['I', 'II', 'III', 'IV'][ORDER.indexOf(type)] };
  });
  const sideList = Object.entries(st.side);
  const tok = (s) => sideList.filter(([, v]) => v === s).map(([n]) => { const t = TAG[n]; return { pre: { inc: '#', exc: '-#', any: '~#' }[s], typ: t.type === 'general' ? '' : t.type + ':', name: n, color: t.color,
    preColor: { inc: 'var(--text2)', exc: 'var(--red)', any: 'var(--blue)' }[s] }; });
  const searchTokens = [...tok('inc'), ...tok('any'), ...tok('exc')];
  const nInc = sideList.filter(([, v]) => v === 'inc').length, nExc = sideList.filter(([, v]) => v === 'exc').length, nAny = sideList.filter(([, v]) => v === 'any').length;
  const match = sideList.length ? Math.max(3, Math.round(1248 * Math.pow(0.42, nInc) * Math.pow(0.86, nExc) * (nAny ? 0.64 : 1))) : 1248;

  // grid
  const mk = (i, key) => {
    const [name, ar, ext, tiny] = FILES[i];
    const sel = !!st.sel[i];
    const toggle = e => { e.stopPropagation(); const s = { ...st.sel }; if (s[i]) delete s[i]; else s[i] = 1; set({ sel: s }); };
    return { key, id: i, name, ext: ext.toUpperCase(), ar: ar.toFixed(4), iar: (1 / ar).toFixed(4), tiny: !!tiny, big: !tiny, gif: ext === 'gif',
      fill: fill(hueOf(i)), fillHi: fill(hueOf(i), 0.52), ratio: ratioLabel(ar), fav: FAV.has(i), sel, unsel: !sel, frame: (i + 1) + 'A', num: String(i + 1).padStart(2, '0'),
      onToggle: toggle, onClick: e => { if (e.ctrlKey || e.metaKey || Object.keys(st.sel).length) toggle(e); } };
  };
  let ids = FILES.map((_, i) => i);
  const order = [ids, ids.slice().sort((a, b) => FILES[a][0].localeCompare(FILES[b][0])), ids, ids.slice().sort((a, b) => FILES[b][1] - FILES[a][1]), ids.slice().sort((a, b) => ((a * 7919) % 37) - ((b * 7919) % 37))][st.sort];
  ids = order.slice(); if (st.asc) ids.reverse();
  if (st.fav) ids = ids.filter(i => FAV.has(i));
  const keep = i => !st.fav || FAV.has(i);
  const groups = st.group
    ? [{ title: 'Chapter 3 refs', meta: '12 images · collection order', list: CH3 }, { title: 'Court outfits — final pass', meta: '6 images · collection order', list: COURT },
       { title: 'Not in a collection', meta: 'the loners', list: ids.filter(i => !CH3.includes(i) && !COURT.includes(i)) }]
      .map((g, gi) => ({ ...g, show: true, items: g.list.filter(keep).map(i => mk(i, gi + '-' + i)) }))
    : [{ title: '', meta: '', show: false, items: ids.map(i => mk(i, 'a' + i)) }];
  const selCount = Object.keys(st.sel).length;
  const SORTS = ['Date added', 'Name', 'Date modified', 'File size', 'Random'];
  const sortIdx = [2, 1, 3, 4, 0];

  // viewer
  const added = st.vAdded;
  const vNames = [...VIEW_TAGS, ...added.map(a => a.name)];
  const vTagsAll = vNames.map(n => TAG[n] || added.find(a => a.name === n));
  const vGroups = ORDER.map(type => {
    const tags = vTagsAll.filter(t => t.type === type).map(t => ({ ...t, label: disp(t.name), implied: !!IMPLIED[t.name], own: !IMPLIED[t.name], by: IMPLIED[t.name] ? disp(IMPLIED[t.name]) : '',
      onEnter: tipOn('viewer', 'above', { title: disp(t.name), typeLabel: T[type].label, color: t.color, ink: t.ink, desc: t.desc,
        meta: IMPLIED[t.name] ? `Implied by ${T.character.label.toLowerCase()}:${IMPLIED[t.name]} — take it up with her.` : `${fmt(t.total || 1)} images · Ctrl+click for wiki` }),
      onLeave: tipOff }));
    return { type, label: T[type].label, color: T[type].color, n: tags.length, tags, has: tags.length > 0 };
  });
  const q = st.q.trim().toLowerCase();
  let qType = null, qName = q;
  const pm = q.match(/^(character|source|artist|general):(.*)$/); if (pm) { qType = pm[1]; qName = pm[2]; }
  const sugg = [];
  if (qName) {
    Object.entries(ALIASES).forEach(([a, n]) => { if (a.includes(qName)) { const t = TAG[n]; sugg.push({ t, alias: a }); } });
    TAGS.forEach(t => { if (t.name.includes(qName) && (!qType || t.type === qType) && !sugg.find(s => s.t === t)) sugg.push({ t, alias: '' }); });
  }
  const pick = (name, type) => { if (vNames.includes(name)) { set({ q: '' }); return; }
    const t = TAG[name] || { name, type, color: T[type].color, ink: ink(T[type].color), count: 0, total: 1, desc: 'Brand new. Fresh out of the oven, no wiki page yet.' };
    set({ vAdded: [...added, t], q: '' }); };
  const suggestions = sugg.slice(0, 6).map(({ t, alias }) => ({ label: disp(t.name), typeLabel: T[t.type].label, color: t.color, ink: t.ink, count: fmt(t.total), alias, hasAlias: !!alias,
    onImage: vNames.includes(t.name), notOn: !vNames.includes(t.name), onPick: () => pick(t.name, t.type) }));
  const ctype = qType || ORDER[[3, 0, 1, 2][st.ctype % 4]];
  const exact = qName && TAGS.some(t => t.name === qName.replace(/ /g, '_')) || ALIASES[qName];
  const createName = qName.replace(/ /g, '_');
  const ch3pos = st.vpos, cur = CH3[ch3pos - 1];
  const [vName, vAr, vExt] = FILES[cur];
  const ZOOMS = [0, 0.5, 1, 2, 4];
  const zoomLabel = st.zoom === 0 ? 'Fit' : Math.round(ZOOMS[st.zoom] * 100) + '%';
  const pathParts = ['D:', 'MyLibrary', 'Images', 'Fantasy', 'Elves', 'High Court of Ilvenmar', 'Portraits & Expression Sheets'];

  // library
  const cats = CATS.map(([name, count, meta], i) => ({ name, initial: name[0], rest: name.slice(1), count: fmt(count), meta, empty: count === 0, full: count > 0, f1: fill(hueOf(i * 3 + 1), 0.46), f2: fill(hueOf(i * 3 + 2), 0.4), f3: fill(hueOf(i * 3 + 5), 0.36),
    rot: ['-2.2deg', '1.4deg', '-0.8deg', '2.4deg', '-1.6deg', '0.9deg', '-2.8deg', '1.8deg', '-1.1deg', '2deg'][i], num: String(i + 1).padStart(2, '0') }));
  const dnd = (k, board, msg) => ({
    over: e => { e.preventDefault(); e.stopPropagation(); if (!st[k]) set({ [k]: true }); },
    leave: e => { if (!e.currentTarget.contains(e.relatedTarget)) set({ [k]: false }); },
    drop: e => { e.preventDefault(); e.stopPropagation(); const n = (e.dataTransfer && e.dataTransfer.files.length) || 1; set({ [k]: false }); toast(board, msg(n)); },
  });
  const dA = dnd('dropAlbum', 'album', n => `Caught ${n} file${n > 1 ? 's' : ''}. Copied into “Portraits & Expression Sheets”.`);
  const dL = dnd('dropLib', 'lib', n => `${n} file${n > 1 ? 's' : ''} tossed in the Inbox. It's getting crowded in there.`);
  const dI = dnd('dropInbox', 'lib', n => `${n} file${n > 1 ? 's' : ''} landed in the tray. Sort them. Eventually.`);
  const tst = b => st.toast && st.toast.board === b ? st.toast.text : '';

  return {
    themeName: st.theme, cycleTheme: () => set({ theme: THEME_NAMES[(THEME_NAMES.indexOf(st.theme) + 1) % 4] }),
    healthEnter: tipOn('album', 'below', { title: '37 things want you', typeLabel: 'Library Health', color: 'var(--red)', ink: '#fff', desc: '3 are missing (we\'re worried), 21 need a decision, 13 are just gossip.', meta: 'Red = something is missing' }),
    healthEnterV: tipOn('viewer', 'below', { title: '37 things want you', typeLabel: 'Library Health', color: 'var(--red)', ink: '#fff', desc: '3 are missing (we\'re worried), 21 need a decision, 13 are just gossip.', meta: 'Red = something is missing' }),
    healthEnterL: tipOn('lib', 'below', { title: '37 things want you', typeLabel: 'Library Health', color: 'var(--red)', ink: '#fff', desc: '3 are missing (we\'re worried), 21 need a decision, 13 are just gossip.', meta: 'Red = something is missing' }),
    tipOff, tipAlbum: tipFor('album'), tipViewer: tipFor('viewer'), tipLib: tipFor('lib'),
    // album
    sideGroups, searchTokens, sideFilter: st.sideFilter, onSideFilter: e => set({ sideFilter: e.target.value }),
    filterCount: sideList.length, hasFilters: sideList.length > 0, clearFilters: () => set({ side: {} }), matchCount: fmt(match),
    groups, cols: st.cols, gridCols: `repeat(${st.cols}, minmax(0, 1fr))`, colsPct: ((st.cols - 2) / 8 * 100) + '%',
    colsDown: () => set({ cols: Math.max(2, st.cols - 1) }), colsUp: () => set({ cols: Math.min(10, st.cols + 1) }),
    colTicks: [2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => ({ n, on: n === st.cols, off: n !== st.cols, onClick: () => set({ cols: n }) })),
    sortLabel: SORTS[st.sort], sortArrow: st.asc ? '↑' : '↓', sortDir: st.asc ? 'ascending' : 'descending',
    cycleSort: () => set({ sort: sortIdx[st.sort] }), flipSort: () => set({ asc: !st.asc }),
    favOn: st.fav, favOff: !st.fav, toggleFav: () => set({ fav: !st.fav }), groupOn: st.group, groupOff: !st.group, toggleGroup: () => set({ group: !st.group }),
    selCount, hasSel: selCount > 0, selectAll: () => set({ sel: Object.fromEntries(FILES.map((_, i) => [i, 1])) }), clearSel: () => set({ sel: {} }),
    dropAlbum: st.dropAlbum, toggleDropAlbum: () => set({ dropAlbum: !st.dropAlbum }), albumOver: dA.over, albumLeave: dA.leave, albumDrop: dA.drop, toastAlbum: tst('album'),
    // viewer
    vGroups, vTagCount: vNames.length, tagQuery: st.q, onQuery: e => set({ q: e.target.value }), showSugg: !!qName, suggestions,
    showCreate: !!qName && !exact, createName, createType: T[ctype].label, createColor: T[ctype].color, createInk: ink(T[ctype].color),
    cycleCreateType: () => set({ ctype: st.ctype + 1 }), doCreate: () => pick(createName, ctype),
    onQueryKey: e => { if (e.key === 'Enter') { if (suggestions[0] && suggestions[0].notOn) suggestions[0].onPick(); else if (qName && !exact) pick(createName, ctype); } },
    vPos: ch3pos, vPosLabel: `${ch3pos} / 12`, vPosRoman: ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'][ch3pos - 1], vName, vFill: fill(hueOf(cur), 0.5), vAr: vAr.toFixed(4), vIar: (1 / vAr).toFixed(4), vExt: vExt.toUpperCase(), vRatio: ratioLabel(vAr),
    vPrev: () => set({ vpos: ch3pos === 1 ? 12 : ch3pos - 1 }), vNext: () => set({ vpos: ch3pos === 12 ? 1 : ch3pos + 1 }),
    vStrip: CH3.map((i, k) => ({ key: 'v' + i, fill: fill(hueOf(i)), on: k + 1 === ch3pos, off: k + 1 !== ch3pos, n: k + 1, onClick: () => set({ vpos: k + 1 }) })),
    vFav: FAV.has(cur), vNotFav: !FAV.has(cur),
    zoomLabel, zoomScale: `scale(${st.zoom === 0 ? 1 : ZOOMS[st.zoom] < 1 ? 0.7 : Math.min(1.8, ZOOMS[st.zoom])})`,
    zoomIn: () => set({ zoom: Math.min(4, st.zoom + 1) }), zoomOut: () => set({ zoom: Math.max(0, st.zoom - 1) }), zoomReset: () => set({ zoom: 0 }),
    showOn: st.show, showOff: !st.show, toggleShow: () => set({ show: !st.show }),
    panels: st.panels, noPanels: !st.panels, togglePanels: () => set({ panels: !st.panels }),
    pInfo: st.pInfo, pTags: st.pTags, pColl: st.pColl, pInfoArrow: st.pInfo ? '−' : '+', pTagsArrow: st.pTags ? '−' : '+', pCollArrow: st.pColl ? '−' : '+',
    togInfo: () => set({ pInfo: !st.pInfo }), togTags: () => set({ pTags: !st.pTags }), togColl: () => set({ pColl: !st.pColl }),
    pathParts: pathParts.map((p, i) => ({ p, last: i === pathParts.length - 1, notLast: i < pathParts.length - 1 })),
    vColls: [{ name: 'Chapter 3 refs', pos: `${ch3pos} / 12`, current: true, other: false }, { name: 'Court outfits — final pass', pos: '1 / 6', current: false, other: true }, { name: 'Wallpaper candidates (maybe)', pos: '17 / 40', current: false, other: true }],
    // library
    cats, inboxThumbs: [3, 8, 11, 17, 21, 27].map(i => ({ key: 't' + i, fill: fill(hueOf(i), 0.46), rot: ['-8deg', '5deg', '-3deg', '9deg', '-6deg', '3deg'][i % 6] })),
    dropLib: st.dropLib, dropInbox: st.dropInbox, toggleDropLib: () => set({ dropLib: !st.dropLib, dropInbox: false }), toggleDropInbox: () => set({ dropInbox: !st.dropInbox, dropLib: false }),
    libOver: dL.over, libLeave: dL.leave, libDrop: dL.drop, inboxOver: dI.over, inboxLeave: dI.leave, inboxDrop: dI.drop, toastLib: tst('lib'),
  };
}
