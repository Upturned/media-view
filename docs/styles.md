# media-view — Styles and Themes

> **Status:** decisions and open questions · **Related:** `technical/images.md` §13.4 (themes as data), `Styles and themes/` (design mockups)

---

## 1. Decision for the first version

- **Darkroom is the default (and only selectable) style** of v1. Its tokens (`--bg #121212`, `--surface #1b1b1a`, `--line #363631`, `--text #f3f2ec`, `--accent #ff4b2b`, …) and its look — sharp corners, mono/DIN-style type — become the base theme.
- A **Check styles** dialog shows the other three mockups (Mochi, Scriptorium, Sticker Riot), so they can be shown to other people and compared before a final decision.
  - **Option (a), chosen:** each mockup HTML is shown as-is inside a sandboxed `<iframe>`, one tab per style.
  - The mockups mention `unpkg.com`, but only as labels: React is already inlined (compressed) inside each file, so they work offline as-is. They're copied unchanged to `web/public/styles/`.
  - These are static mockups, not the real app — clicking around inside them doesn't affect anything.
- Later, **option (b)**: implement each style as a real theme and replace the iframes with live mini-previews of the actual app (as the theme picker already does).

### 1.1 Page designs (Claude Design handoffs)

- Page designs live in `docs/Design/<handoff>/` as Claude Design handoff bundles (readable HTML/CSS/JS). Milestone 2 pages: `docs/Design/darkroom-milestone-2-pages/` (Library, Folder page, Album grid, Viewer).
- They're recreated in Svelte, not copied. Parts of a design that belong to a later milestone (tag index, collections, health badge, …) are built only when that milestone lands; until then they're not shown.
- **Tone:** the designs' copy is playful. It's **toned down** in the app — a little flavor is welcome, but never at the cost of clarity.
- **Vocabulary per style:** a style may use its own words — Darkroom says *rack* (category), *drawer* (sub-category), *frames* (images), and numbers images like film (`12A`). The docs and Help always use the plain words, so the style's word is paired with the plain one wherever it appears on its own (e.g. a *Racks* heading with "10 categories" next to it). If a style word would read too differently from the docs, the plain word is used instead. Style words live in the theme data (`words`), with the plain words as the fallback.
- Dropped from the Milestone 2 design: the album stat "since last roll" (no clear meaning). Kept: the Inbox's "N new this week · oldest: X days".

---

## 2. What the four styles are

They differ in more than color — each changes typography, shapes, borders, shadows and ornaments. All four are dark.

| Style            | Character                                                              | Accent      |
|------------------|------------------------------------------------------------------------|-------------|
| **Darkroom**     | Sharp, restrained, technical; mono + DIN-like type                     | `#ff4b2b` red-orange |
| **Mochi**        | Soft and playful; pill shapes everywhere, rounded type, purple base    | `#ff8fc2` pink |
| **Scriptorium**  | Old manuscript; serif (Palatino), gold inset frames, arched shapes     | `#d4ab52` gold |
| **Sticker Riot** | Loud; white outlines, hard offset shadows, lime on black               | `#c8ff1a` lime |

---

## 3. Options for the final product (open)

### 3.1 Style × variant (preferred over free style × color)

Splitting **style** (Darkroom, Mochi, …) from **color** (Modern, Minimal, …) as two free settings is technically easy — the CSS variables split into a *style* layer (fonts, radius, borders, shadows, ornaments) and a *color* layer. But each style's palette is part of its identity: most of the 16 combinations would look wrong, and none of the styles has a light version yet.

Preferred shape: **Style** + **Variant** (*dark* / *light* / *high contrast*), where each style defines its own variants.

### 3.2 Map the current four themes onto the styles

| Current theme     | Becomes          | Note |
|-------------------|------------------|------|
| **Warm**          | Scriptorium      | Natural fit |
| **Modern**        | Mochi            | Natural fit |
| **High Contrast** | Sticker Riot     | White outlines on near-black + lime is literally high contrast |
| **Minimal**       | Darkroom         | The restrained one. Minimal was the *light* theme, so Darkroom needs a light variant, or the app loses its light option |

(Originally proposed as High Contrast → Darkroom and Minimal → Sticker Riot; swapped because Sticker Riot is the opposite of minimal.)

### 3.3 Module-specific themes ("Specific")

A **Specific** theme option that dresses each module in its own medium:

- **Images:** polaroids and film strips in the background, folder cards as photo film / negatives, albums as photo albums, Library Health as a red-light darkroom.
- **Audio:** tapes, CDs, vinyl, jukeboxes, boomboxes — albums as cassette cases or CD jewel cases, the player as a boombox or deck.
- **Videos:** film reels, clapperboards, VHS tapes, cinema seats.
- **Texts:** typewriter, paper, notebooks, library shelves.

**Feasibility:** yes. It fits the existing design:

- Themes are already data (`{ id, name, vars }`). A specific theme adds a `module` field and is applied when the user is inside that module; outside (Hub, Settings) the base style is used.
- Most of the effect comes from **tokens + assets**: background illustrations, card frames (`border-image` / SVG frames), icons and fonts per module. Components stay the same; they read variables like `--card-frame`, `--page-ornament`, `--health-mood`.
- Components that need a different *shape* (a cassette instead of a card) get an optional **skin slot**: `FolderCard` renders a module skin when the theme provides one, the default card otherwise.

**Costs and cautions:**

- It's mostly **art**, not code: each module needs its own set of illustrations/SVGs, and each must look good at every grid size.
- Heavy decoration fights readability — keep thumbnails, text and the health colors (red / amber / blue) unaffected.
- Must stay offline: all assets bundled.
- Natural order: build it after the target module exists and the base style is settled.

---

## 4. Technical notes

- Themes stay **data**: `web/src/themes/<id>.ts` with `{ id, name, description, vars }`, extended with `layer` (`style` / `variant`) and optional `module` / `skins` when §3 is decided.
- All component CSS uses only variables, so adding a style later never touches components (except opt-in skins).
- Fonts and assets are bundled locally; no Google Fonts or CDNs.
- Tag-type colors stay independent of the theme (inline custom properties, black/white text by contrast).
