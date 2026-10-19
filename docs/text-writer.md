# media-view — Text-Writer Module

> **Status:** first draft, revised 2026-10-17 · **Related:** `ai.md` (runtime §4, models, content policy §11.1, safe-for-work view §11.3, text to image §2.1) · `ai-hardware.md` (models and speeds per machine) · `technical/images.md` (folders §6.2, markers §7.1, tags §10, wiki §10.8) · `profiles.md` (per-profile settings) · `archive/Ai-features-runtime-and-consent.md` §2 (bundled `llama-server`)
>
> Replaces `ai.md` A8, A9 and A11 as the place the writing features are designed. §2–§3 sketch the module just far enough for the AI features to have something to stand on; the module's full design comes later. §4–§9 design the four AI writing modes. Open decisions are in §12.
>
> **Revision 2026-10-17:** stories reuse the album kind; image links by hash; context order changed for prompt caching; CodeMirror 6 for the editor; text checks while streaming (§7); NSFW follows `ai.md` §11.3; the Texts module itself is independent of the AI phases.

---

## 1. What it is

A **Texts** module next to Images: stories written in the app, stored as plain Markdown files in the library, tagged with the same tags as images, and written with AI help in four ways:

| Mode | In short |
|---|---|
| **Continue** (§4.1) | The AI suggests 1–5 directions to pick from, then writes a few lines along the chosen one; or simply writes the next paragraph |
| **Co-write** (§4.2) | Turn by turn: you write, the AI writes, you write… Any AI turn can be edited or regenerated |
| **Character chat** (§4.3) | A character from the library, defined by its tag's wiki page, talks with you |
| **Lamp** (§4.4) | Stuck? One click, one short suggestion of how to go on (5–20 words) |

All offline, through the same `llama-server` runtime as image descriptions (`ai.md` §4, phase 2). Writing with no AI at all works the same; AI is optional, as everywhere.

**The module doesn't depend on AI.** Its first build step (§11, step 1) needs no model and can come whenever the roadmap puts the Texts module, relative to Videos and Audio (images.md §19). Only the AI modes wait for `ai.md` phase 5.

---

## 2. Stories on disk

Same rules as Images ("what you see on disk is what you get", images.md §2):

| In the app | On disk | Kind in `folders` |
|---|---|---|
| **Category**, **sub-category** | Folders, as in Images | `category`, `subcategory` |
| **Story** | A folder holding chapters only | `album` (module `texts`): a story *is* an album, the UI calls it Story |
| **Chapter** | A `.md` file: `01 - The Crossing.md` | a `files` row, `media_type = 'text'` |
| **Inbox** | `Texts\Inbox\`, for imported `.md` files | `inbox`, as in Images |
| **Chats** | A special top-level folder holding one folder per character (§4.3) | `chats` (new) |

```
Texts\
├── Inbox\                          ← like Images\Inbox
├── Chats\                          ← special: one folder per character
│   └── Aerin\2026-10-16 18-04.md
└── Fantasy\                        ← category
    └── The Elves of Lathir\        ← story (an album)
        ├── 01 - The Crossing.md
        └── 02 - Ashes.md
```

- **Reusing `album`** for stories means no new marker, no new structural rules and no new triggers: an album already holds only files and never folders.
- **Chats** isn't like the Inbox, which holds no folders. It gets its own kind: top-level, one per module, can't be renamed, moved or recycled, recreated when missing; its children are albums named after the character. Adding the kind changes `folders.kind`'s `CHECK`, which in SQLite means rebuilding the table in that migration.
- **Story details** live in the DB, like a folder's cover and description: title, description, cover (any image in the library), the **cast** (§2.1), **story notes** (§5.2), the story's language and chapter summaries (§5.3).
- **Chapter order** comes from the number prefix; reordering in the app renames the files. File ids survive renames, so summaries and AI marks follow.
- **Autosave** writes through the app, so each write is registered with the watcher's expected changes (`lib/expected.ts`) and doesn't trigger a rescan.
- **Images in the text** are links to library images by **hash**: `![The crossing](mv://image/sha256:9f2c…)`. A hash survives moves, renames and a rebuilt database; a database id doesn't. The image stays in Images. If no file has that hash any more (deleted, or edited so its hash changed), the editor shows a *missing image* placeholder with **Relink…**, never a broken file.

### 2.1 Cast and tags

- A story's **cast** is a list of tags (Character, Source, Artist…) attached to the story: who appears, which world it belongs to, who wrote it. New table `story_tags` (§10); chapters can carry their own tags too, as files.
- Tags already have wiki pages with descriptions and custom fields. **The cast's wiki pages are what the AI knows about the characters and the world** (§5). No separate character editor.
- **Fields the writer uses.** The Character type's default fields are *Full name*, *Species*, *Age* and *Related characters* (images.md §10.2). *Age* also feeds the content check (§7). Writing-specific fields such as *Personality* and *Speech* are added by the user to the Character type, or become defaults (§12); the cast card includes whatever fields are filled.
- **A character's world** comes from its **implications**: a character tag implying a Source tag (the usual way to link them) brings that Source's first paragraph along. There's no Character → Source field.
- The tag wiki gains a **Stories** section next to Images and Collections, and *Images by me* / *Featuring you* on profiles list stories too.

### 2.2 AI-written text

- Text the AI wrote is **marked** in the editor (a faint underline, *AI* on hover). **Editing inside a mark splits it:** the characters the user typed or changed become theirs, the rest stays marked.
- Marks are stored in the DB as ranges per chapter (§10); the editor maps them through every edit. Best effort: if the file is changed outside the app, its marks are dropped. The `.md` file stays clean, with no hidden markup.
- A story's info shows the share written by AI (*12% AI-written*), from the marks that remain.

---

## 3. The editor (minimal)

Enough for the AI modes; the full editor is designed with the module.

- Markdown editor built on **CodeMirror 6** (a new web dependency, bundled like the rest): it maps positions through edits, which AI marks and ghost text need, and a `<textarea>` can't. **Edit / Split / Preview**, like the tag wiki editor (images.md user guide §4.8), which could move to the same component later.
- Chapter list on the side; **autosave**; word count per chapter and story.
- `[[tag]]` links work as in the wiki; hovering a character's name shows its card.
- An **AI bar** under the text with the modes (§4), visible only when AI is on for the library and a writer model is present.
- **Keys inside the editor.** Global shortcuts that clash with typing are off while the editor has focus: `Backspace` (go up a level, M8 keyboard navigation), `T`, `S`, `/`. `Tab` accepts ghost text only while ghost text is showing; otherwise it indents. `Esc` stops a generation or dismisses ghost text before it does anything else.

---

## 4. The four modes

Every mode streams its text in as it's generated, can be **stopped** midway (`Esc`), and can be **regenerated**. Text arrives a sentence at a time, because each sentence is checked before it's shown (§7). Regenerated versions are kept side by side; ◀ ▶ flips between them before accepting. Nothing enters the chapter until accepted, except in co-write, where turns are part of the text but stay editable.

### 4.1 Continue

Two ways, one button each:

- **Directions.** The AI proposes **1–5 short directions** (*Lathir lies about the map*, *A storm forces them ashore*). Pick one, or type your own; the AI writes **a few lines** (2–5 sentences) following it.
- **Next paragraph.** The AI writes one paragraph after the cursor as grey **ghost text**. `Tab` accepts, `Esc` dismisses, `Ctrl + →` accepts one word at a time, ◀ ▶ flips between versions.

Directions come back as JSON forced by the runtime (`llama-server` JSON schema: an array of 1–5 strings, each at most ~120 characters), so the list always parses and never runs long.

### 4.2 Co-write

A chapter becomes a sequence of **turns**: you write and press **Submit** (`Ctrl + Enter`), the AI writes the next part, and so on, like Backyard AI but producing a story rather than a chat.

- **Length** of the AI's turns: *a sentence* / *a paragraph* / *a few paragraphs*.
- **Steer** a turn with a short instruction (*make it tense*, *Aerin speaks next*), sent with that turn only.
- Any AI turn can be **edited** in place or **regenerated**; regenerating an earlier turn asks whether to discard the turns after it.
- Turns are plain text in the chapter; the turn boundaries and who wrote each live in the AI marks (§2.2), so they're lost, like the marks, if the file is edited outside the app.

### 4.3 Character chat

Talk with a character, as Emochi does.

- Started from a Character tag's wiki page (**Chat with Aerin**) or from the Chats folder.
- The **persona** is built from the tag's wiki page: the description, the filled custom fields and the implied Source's first paragraph (§2.1, §5.1). Editing the wiki changes the character.
- **Scenario** (optional): one line setting the scene (*at the harbour, the night before the crossing*).
- Replies stream in; regenerate and ◀ ▶ as everywhere.
- Saved as a Markdown transcript in `Chats\<Character>\`, with the character's **tag name and type** and the scenario at the top (names, not database ids, like image links). The file carries the character's tag like any file, so the tag's wiki lists its chats. **Turn into story…** copies a chat into a new chapter as prose dialogue for editing.
- Several characters at once is a later addition (§12).

### 4.4 Lamp

A 💡 button in the AI bar, with a shortcut checked against the keymap registry and the browser's reserved keys (`Ctrl + L` is the address bar in browser mode).

- Returns **one** suggestion of 5–20 words on how to go on, shown in a small popover next to the cursor: *What if the map was drawn by Lathir's father?*
- **Another** gets a new one; **Use it** adds it to the story notes for the **next request only** (§5.2), or makes it the co-write steer. It never writes into the chapter by itself.
- Forced by the runtime to a single JSON string of at most ~150 characters; the shortest and fastest request (about 1 s on the GPU with the context already cached, §5).

---

## 5. Context: what the model is given

Every request is built by one **context builder** on the server, in this order. The order matters: the parts that don't change between requests come first, so `llama-server` reuses its work on them (prompt caching) and each continuation only processes the newest text. On the CPU this is the difference between seconds and minutes: reading a ~12,000-token context from scratch takes a few minutes there (`ai-hardware.md`).

| # | Part | Changes | Typical size |
|---|---|---|---|
| 1 | **System prompt:** the mode's role, output language, style, the profile's NSFW setting (§7) | Rarely | ~300 tokens |
| 2 | **Cast cards:** the wiki pages of the story's cast (§5.1) | When the cast or wiki changes | ~1,500 |
| 3 | **Story notes** (§5.2) | When edited | ~200 |
| 4 | **Story so far:** summaries of earlier chapters (§5.3) | When a chapter is summarized | ~1,500 |
| 5 | **Recent text:** the end of the current chapter, up to the cursor | Grows at the end | up to ~8,000 |
| 6 | **Mentioned tags:** first paragraph of other tags named in the recent text (§5.1) | Often | ~500 |
| 7 | **The ask:** the mode's instruction, the chosen direction or steer, a lamp suggestion in use | Every request | ~100 |

- **Mentioned tags come after the recent text.** They change often; placed before it, every change would make the model reread the whole 8,000 tokens.
- **Trimming in large steps.** When the recent text outgrows its budget, the builder drops the oldest ~2,000 tokens at once, not a little per request, so the cached start stays the same for many requests. It trims recent text first, never the cast or notes.

Default context: **16,384 tokens**, which fits a 12B model at Q4 in 12 GB, tightly once Windows takes its share of VRAM; 32,768 with a quantized KV cache if long chapters need it (measured in the spike).

### 5.1 Cast cards and mentioned tags

- **Cast cards:** for each cast tag, its name, type, aliases, the wiki description (up to ~1,500 characters), filled custom fields and, for characters, the first paragraph of the Source tags it implies, as compact text.
- **Mentioned tags:** tags not in the cast whose name or **alias** appears in the last ~1,000 words get their wiki's first paragraph added, so a place or minor character mentioned in passing is known without being in the cast. Aliases make this work for nicknames.
- Characters' names are used as written in the wiki: these are the user's own characters, not real people.

### 5.2 Story notes

A short free-text field per story, always sent: tone, style, point of view, rules of the world (*first person, past tense; magic costs memories*). Writers' tools call this the *author's note* or *memory*. A lamp suggestion in use is sent with the ask (part 7) for one request, not written into the notes, so the cached notes stay unchanged.

### 5.3 Chapter summaries

- When a chapter is long enough to fall out of the recent-text window, its **summary** (5–10 sentences) takes its place in the context.
- Generated on demand or when moving to the next chapter; stored in the DB per chapter, **shown and editable**: the user fixes what the model got wrong, and that's what the model sees from then on.
- Stale summaries (chapter edited since, by hash) are marked and offered for regeneration, never regenerated silently.

---

## 6. Runtime

`llama-server`, started and stopped by the server's AI service, like descriptions (`ai.md` §4; consent doc §2). The ONNX AI process isn't involved. What's different for writing:

- **Interactive priority.** Writer requests jump ahead of background indexing and description batches; the queue gets a high-priority lane. Indexing pauses while a writer request runs (on the CPU tier they'd compete for the same cores and memory bandwidth).
- **Kept loaded** while a story or chat is open, instead of unloading after 10 minutes idle. Leaving the writer starts the idle timer.
- **One heavy model in VRAM at a time** (`ai.md` §4): generating an image from a passage (§8) swaps to the image model and back, a few seconds each way.
- **Streaming and stop:** each request is its own streamed HTTP response from the server (`POST /api/texts/ai/<mode>`, newline-delimited JSON), not the shared `/api/events` channel. **Stop**, or closing the request, cancels it in `llama-server`.
- **Sampling presets** per mode, starting values tuned in the spike:

| Mode | Temperature | Other | Max length |
|---|---|---|---|
| Directions | 1.0 | `min_p` 0.05 | JSON, 5 × 120 chars |
| Few lines / next paragraph | 0.8 | `min_p` 0.05, `repeat_penalty` 1.05 | ~120 / ~200 words |
| Co-write turn | 0.8 | same | per the length setting |
| Character chat | 0.9 | `repeat_penalty` 1.1 | ~150 words |
| Lamp | 0.9 | | JSON, 150 chars |
| Chapter summary | 0.3 | | ~200 words |

---

## 7. Content

Same policy as `ai.md` §11.1, applied to text:

- **Minors (hard limit), checked in code.** No sexual content involving minors, in any mode.
  - **Signals:** the guard model (`ai.md` §11.1) on the request (recent text, ask) and on the output; and the **Age** field of every Character tag in the cast or among the mentioned tags. A sexual signal with any minor signal blocks.
  - **While streaming:** the server holds the model's output back one sentence at a time. Each finished sentence is checked with the recent context and only then sent to the editor. On the GPU the delay is barely noticeable; on the CPU it adds about a second per sentence. Directions and the lamp are checked whole, before they're shown.
  - **When it fires:** the output is discarded, the request ends with *Blocked by the content rule*, and the log records that the rule fired, never the content. Fails closed: no guard model, no generation.
  - The user's own text is never changed or censored: the rule only stops the AI from generating.
- **NSFW:** follows the profile's *Show NSFW* (`ai.md` §11.3). On: adult scenes and nudity are fine, as some stories have them. Off: the system prompt asks for non-explicit writing. Nothing is flagged or hidden afterwards.
- **Models:** general models with safety tuning may refuse adult scenes in fiction; creative fine-tunes don't. The writer model is chosen for that (§9), separately from the description model.

---

## 8. Images from a passage

`ai.md` §2.1's *From a passage* mode (A13), called from the editor:

1. Select a passage → **Illustrate**.
2. The writer model turns it into an English image prompt, using the cast cards for appearances; the prompt is shown for editing. It goes through the text check and the real-name check (`ai.md` §11.1).
3. Text to image draws it; the image is checked, goes to the Inbox with its provenance (passage, prompt, seed, model) and is inserted at the passage as `![…](mv://image/sha256:…)`.

Only in builds with the `generation` option (`ai.md` §11.1). Without it, **Illustrate** isn't shown.

---

## 9. Models

Chosen in the spike (§11, step 0), on the user's own writing in Portuguese and English. The list below is a starting point: creative fine-tunes change fast, so it's refreshed when the spike runs. Per machine: `ai-hardware.md`.

| Candidate | For | Notes |
|---|---|---|
| **Mistral Nemo 12B** creative fine-tunes | Prose, co-write, character chat | Known for character-driven fiction and few refusals; fits a 12 GB card whole. Mostly trained on English fiction: Portuguese must be tested. ~5 tok/s on the CPU. |
| **Mistral Small 3.2 24B** | Richer prose on the GPU | Q4, partly in RAM. |
| **Qwen3-30B-A3B** (MoE) | Best speed on the CPU | ~10–15 tok/s on the 5600G, good Portuguese. Safety-tuned: refusals of adult scenes must be tested; a community fine-tune may be needed. |
| **Gemma 4 12B** | Lamp, directions, summaries; fallback for prose | Strong Portuguese and instruction following; safety tuning may refuse adult scenes. |
| **Gemma 4 26B A4B** | Best quality on this machine | Partly offloaded to RAM; slower but richer prose. |

- One **writer** role in the manifest, plus an optional **helper** role for summaries and the lamp if a smaller, faster model does those better. Swapping between them costs a model load, so the spike checks whether one model can do everything, and whether phase 2's description model can be the helper (`ai.md` §9).
- Expected on the 3060 with a 12B at Q4: ~25–35 words/s, a paragraph in 3–5 s, the lamp in about 1 s. On the CPU, with the context cached: a paragraph in 20–30 s with the MoE, more with dense models; the lamp in a few seconds. Without the cache, add the minutes of reading the context (§5).
- The spike measures **refusals** and **Portuguese quality**, not only speed.
- Output language follows the story's language setting (default: the UI language), with "Brazilian Portuguese" spelled out in the system prompt to avoid European Portuguese forms.

---

## 10. Data model (sketch)

```sql
CREATE TABLE story_tags (                 -- the cast (§2.1)
  folder_id  INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,  -- an album in the texts module
  tag_id     INTEGER NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  PRIMARY KEY (folder_id, tag_id)
);

CREATE TABLE story_meta (
  folder_id  INTEGER PRIMARY KEY REFERENCES folders(id) ON DELETE CASCADE,
  notes      TEXT    NOT NULL DEFAULT '',            -- story notes (§5.2)
  language   TEXT,                                   -- 'pt-BR', 'en'; null = UI language
  settings   TEXT    NOT NULL DEFAULT '{}'           -- JSON: co-write length, …
);

CREATE TABLE chapter_summaries (
  file_id    INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
  summary    TEXT    NOT NULL,
  source_hash TEXT   NOT NULL,                       -- chapter hash it was made from; differs → stale
  edited     INTEGER NOT NULL DEFAULT 0,             -- 1 = the user corrected it
  updated_at INTEGER NOT NULL
);

CREATE TABLE text_ai_spans (               -- AI marks (§2.2)
  file_id    INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  start      INTEGER NOT NULL,             -- character offsets in the chapter
  end        INTEGER NOT NULL,
  kind       TEXT    NOT NULL,             -- 'continue', 'cowrite', …
  created_at INTEGER NOT NULL
);
```

Plus the `chats` folder kind (§2). Chats need no table: the transcript file carries its character and scenario at the top; the `files` row and tags cover the rest.

---

## 11. Build order

0. **Spike (2–3 days).** A script against `llama-server`, outside the app: the candidate models on a few of the user's own chapters, in Portuguese and English; each mode's prompt; JSON schemas for directions and the lamp; speed on CPU and GPU, cold and with the context cached; refusals of adult scenes; whether one model can do everything; the guard model's speed per sentence. **Output:** the writer model, prompts, sampling presets.
1. **Texts module without AI.** Folders and kinds, chapters, the CodeMirror editor, autosave, cast, story notes, `mv://image` links. Useful on its own, and independent of the AI phases (§1).
2. **Lamp.** The smallest request; proves the pipeline (context builder, priority lane, streaming with the sentence check, keep-loaded) end to end.
3. **Continue:** next paragraph first (ghost text), then directions.
4. **Chapter summaries**, once stories outgrow the context.
5. **Co-write.**
6. **Character chat** and the Chats folder.
7. **Illustrate** (§8), once `ai.md` phase 3 exists.

---

## 12. Open decisions

1. **Story = album in the texts module, chapters as `.md` files** (§2)? Or a story as a single `.md` file? (A `.story` marker instead of `.album` is possible, at the cost of a new kind.)
2. **Chats** as their own folder kind, one folder per character (§2)?
3. **Cast** as tags on the story (`story_tags`), with the wiki as the character card and implications linking a character to its Source (§2.1)?
4. ***Personality*** **and *Speech*** as default fields of the Character type, or left to the user (§2.1)?
5. **Image links by hash**, with *Relink…* when an image is edited (§2)?
6. **AI marks** kept in the DB, split on edit, dropped on outside edits (§2.2)?
7. **Lamp** never writes into the text, only into the next request or a steer (§4.4)?
8. **Group chats** (several characters) later, not in the first version (§4.3)?
9. **One writer model** for everything, or writer + helper (§9)? Decided by the spike.
10. **Text formats beyond Markdown** (`.txt`, `.docx` import/export, PDF export): which, and when?
11. **Searching stories:** by tags like images, and full-text search of chapters (SQLite FTS)? Not designed yet.
12. **When the Texts module is built** relative to Videos and Audio (§1; images.md §19).
