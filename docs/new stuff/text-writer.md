# media-view — Text-Writer Module

> **Status:** first draft, 2026-10-16 · **Related:** `ai.md` (runtime, models, content policy §11.1, text to image §2.1) · `technical/images.md` (folders, markers, tags, wiki) · `profiles.md` (per-profile settings) · `archive/Ai-features-runtime-and-consent.md` §2 (bundled `llama-server`)
>
> Replaces `ai.md` A8, A9 and A11 as the place the writing features are designed. §2–§3 sketch the module just far enough for the AI features to have something to stand on; the module's full design comes later. §4–§9 design the four AI writing modes. Open decisions are in §12.

---

## 1. What it is

A **Texts** module next to Images: stories written in the app, stored as plain Markdown files in the library, tagged with the same tags as images, and written with AI help in four ways:

| Mode | In short |
|---|---|
| **Continue** (§4.1) | The AI suggests 1–5 directions to pick from, then writes a few lines along the chosen one; or simply writes the next paragraph |
| **Co-write** (§4.2) | Turn by turn: you write, the AI writes, you write… Any AI turn can be edited or regenerated |
| **Character chat** (§4.3) | A character from the library, defined by its tag's wiki page, talks with you |
| **Lamp** (§4.4) | Stuck? One click, one short suggestion of how to go on (5–20 words) |

All offline, through the same `llama-server` runtime as image descriptions (`ai.md` §2). Writing with no AI at all works the same; AI is optional, as everywhere.

---

## 2. Stories on disk

Same rules as Images ("what you see on disk is what you get", images.md §2):

| In the app | On disk | Holds |
|---|---|---|
| **Category**, **sub-category** | Folders, as in Images | Sub-categories and stories |
| **Story** | A folder with a `.story` marker | Chapters only, like an album holds only images |
| **Chapter** | A `.md` file: `01 - The Crossing.md` | Markdown text |
| **Chats** | A special top-level folder (`.chats` marker), like the Inbox | Character chat transcripts (§4.3) |

```
Texts\
├── Chats\                          ← special, like Images\Inbox
│   └── Aerin\2026-10-16 18-04.md
└── Fantasy\                        ← category
    └── The Elves of Lathir\        ← story (.story)
        ├── 01 - The Crossing.md
        └── 02 - Ashes.md
```

- **Story details** live in the DB, like a folder's cover and description: title, description, cover (any image in the library), the **cast** (§2.1), **story notes** (§5.2) and chapter summaries (§5.3).
- **Chapter order** comes from the number prefix; reordering in the app renames the files.
- **Images in the text** are links to library images by id: `![The crossing](mv://image/1234)`. The image stays in Images; deleting it leaves a *missing image* placeholder, not a broken file.

### 2.1 Cast and tags

- A story's **cast** is a list of tags (Character, Source, Artist…) attached to the story: who appears, which world it belongs to, who wrote it. New table `story_tags` (§10); chapters can carry their own tags too.
- Tags already have wiki pages with descriptions and custom fields. **The cast's wiki pages are what the AI knows about the characters and the world** (§5). No separate character editor.
- The tag wiki gains a **Stories** section next to Images and Collections, and *Images by me* / *Featuring you* on profiles list stories too.

### 2.2 AI-written text

- Text the AI wrote is **marked** in the editor (a faint underline, *AI* on hover) until the user edits it, at which point it becomes theirs.
- Marks are stored in the DB as ranges per chapter, best effort: if the file is changed outside the app, its marks are dropped. The `.md` file stays clean, with no hidden markup.
- A story's info shows the share written by AI (*12% AI-written*).

---

## 3. The editor (minimal)

Enough for the AI modes; the full editor is designed with the module.

- Markdown editor with **Edit / Split / Preview**, the same component family as the tag wiki editor (images.md user guide §4.8).
- Chapter list on the side; **autosave**; word count per chapter and story.
- `[[tag]]` links work as in the wiki; hovering a character's name shows its card.
- An **AI bar** under the text with the modes (§4), visible only when AI is on for the library and a writer model is present.

---

## 4. The four modes

Every mode streams its text in as it's generated, can be **stopped** midway (`Esc`), and can be **regenerated**. Regenerated versions are kept side by side; ◀ ▶ flips between them before accepting. Nothing enters the chapter until accepted, except in co-write, where turns are part of the text but stay editable.

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
- Turns are plain text in the chapter; the turn boundaries and who wrote each live in the AI marks (§2.2).

### 4.3 Character chat

Talk with a character, as Emochi does.

- Started from a Character tag's wiki page (**Chat with Aerin**) or from the Chats folder.
- The **persona** is built from the tag's wiki page: the description, the custom fields (*Personality*, *Speech*, *Related characters*…) and the linked Source's first paragraph (§5.1). Editing the wiki changes the character.
- **Scenario** (optional): one line setting the scene (*at the harbour, the night before the crossing*).
- Replies stream in; regenerate and ◀ ▶ as everywhere.
- Saved as a Markdown transcript in `Chats\<Character>\`, with the character's tag id and the scenario at the top. **Turn into story…** copies a chat into a new chapter as prose dialogue for editing.
- Several characters at once is a later addition (§12).

### 4.4 Lamp

A 💡 button in the AI bar (shortcut `Ctrl + L`).

- Returns **one** suggestion of 5–20 words on how to go on, shown in a small popover next to the cursor: *What if the map was drawn by Lathir's father?*
- **Another** gets a new one; **Use it** inserts it as a story note for the next continuation, or as a co-write steer. It never writes into the chapter by itself.
- Forced by the runtime to a single JSON string of at most ~150 characters; the shortest and fastest request (about 1 s on the GPU).

---

## 5. Context: what the model is given

Every request is built by one **context builder** on the server, in this order. The order matters: the parts that don't change between requests come first, so `llama-server` reuses its work on them (prompt caching) and each continuation only processes the newest text.

| # | Part | Changes | Typical size |
|---|---|---|---|
| 1 | **System prompt:** the mode's role, output language, style, the profile's NSFW setting (§7) | Rarely | ~300 tokens |
| 2 | **Cast cards:** the wiki pages of the story's cast (§5.1) | When the cast or wiki changes | ~1,500 |
| 3 | **Story notes** (§5.2) | When edited | ~200 |
| 4 | **Story so far:** summaries of earlier chapters (§5.3) | When a chapter is summarized | ~1,500 |
| 5 | **Mentioned tags:** first paragraph of other tags named in the recent text (§5.1) | Often | ~500 |
| 6 | **Recent text:** the end of the current chapter, up to the cursor | Every request | up to ~8,000 |
| 7 | **The ask:** the mode's instruction, the chosen direction or steer | Every request | ~100 |

Default context: **16,384 tokens**, which fits a 12B model at Q4 in 12 GB with room to spare; 32,768 with a quantized KV cache if long chapters need it (measured in the spike). The builder trims from the oldest recent text first, never the cast or notes.

### 5.1 Cast cards and mentioned tags

- **Cast cards:** for each cast tag, its name, type, aliases, the wiki description (up to ~1,500 characters) and filled custom fields, as compact text.
- **Mentioned tags:** tags not in the cast whose name or **alias** appears in the last ~1,000 words get their wiki's first paragraph added, so a place or minor character mentioned in passing is known without being in the cast. Aliases make this work for nicknames.
- Characters' names are used as written in the wiki: these are the user's own characters, not real people.

### 5.2 Story notes

A short free-text field per story, always sent: tone, style, point of view, rules of the world (*first person, past tense; magic costs memories*). Writers' tools call this the *author's note* or *memory*. The lamp's **Use it** adds to it temporarily.

### 5.3 Chapter summaries

- When a chapter is long enough to fall out of the recent-text window, its **summary** (5–10 sentences) takes its place in the context.
- Generated on demand or when moving to the next chapter; stored in the DB per chapter, **shown and editable**: the user fixes what the model got wrong, and that's what the model sees from then on.
- Stale summaries (chapter edited since) are marked and offered for regeneration, never regenerated silently.

---

## 6. Runtime

Same `llama-server` and AI process as descriptions (`ai.md` §4, consent doc §2). What's different for writing:

- **Interactive priority.** Writer requests jump ahead of background indexing and description batches; the queue gets a high-priority lane. Indexing pauses while a writer request runs.
- **Kept loaded** while a story or chat is open, instead of unloading after 10 minutes idle. Leaving the writer starts the idle timer.
- **One model in VRAM at a time** still holds: generating an image from a passage (§8) swaps to the image model and back, a few seconds each way.
- **Streaming and stop:** tokens are forwarded over `/api/events`; **Stop** cancels the request in `llama-server`.
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

- **Minors (hard limit):** no sexual content involving minors, in any mode. Checked in code on the request (the recent text and the ask) and on the output; a blocked output is discarded and the log records that the rule fired, never the content. The user's own text is never changed or censored: the rule only stops the AI from generating.
- **NSFW:** follows the profile's NSFW setting (`ai.md` §11.3). On: adult scenes and nudity are fine, as some stories have them. Off: the system prompt asks for non-explicit writing, and explicit outputs are flagged and hidden like explicit descriptions.
- **Models:** general models with safety tuning (Gemma) may refuse adult scenes in fiction; creative fine-tunes don't. The writer model is chosen for that (§9), separately from the description model.

---

## 8. Images from a passage

`ai.md` §2.1's *From a passage* mode, called from the editor:

1. Select a passage → **Illustrate**.
2. The writer model turns it into an English image prompt, using the cast cards for appearances; the prompt is shown for editing.
3. Text to image draws it; the image goes to the Inbox with its provenance (passage, prompt, seed, model) and is inserted at the passage as `![…](mv://image/id)`.

Only in builds with the `generation` option (`ai.md` §11.1). Without it, **Illustrate** isn't shown.

---

## 9. Models

Chosen in the spike (§11, step 0), on the user's own writing in Portuguese and English.

| Candidate | For | Notes |
|---|---|---|
| **Mistral Nemo 12B** creative fine-tunes | Prose, co-write, character chat | Known for character-driven fiction and few refusals. Mostly trained on English fiction: Portuguese must be tested. |
| **Gemma 4 12B** | Lamp, directions, summaries; fallback for prose | Strong Portuguese and instruction following; safety tuning may refuse adult scenes. |
| **Gemma 4 26B A4B** | Best quality on this machine | Partly offloaded to RAM; slower but richer prose. |

- One **writer** role in the manifest, plus an optional **helper** role for summaries and the lamp if a smaller, faster model does those better. Swapping between them costs a model load, so the spike checks whether one model can do everything.
- Expected on the 3060 with a 12B at Q4: ~25–35 words/s, a paragraph in 3–5 s, the lamp in about 1 s. On the CPU: a paragraph in 30 s or more; the lamp stays usable.
- Output language follows the story's language setting (default: the UI language), with "Brazilian Portuguese" spelled out in the system prompt to avoid European Portuguese forms.

---

## 10. Data model (sketch)

```sql
CREATE TABLE story_tags (                 -- the cast (§2.1)
  folder_id  INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,  -- a .story folder
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

Chats need no table: the transcript file carries its character and scenario at the top; the `files` row and tags cover the rest.

---

## 11. Build order

0. **Spike (2–3 days).** A script against `llama-server`, outside the app: the candidate models on a few of the user's own chapters, in Portuguese and English; each mode's prompt; JSON schemas for directions and the lamp; speed on CPU and GPU; whether one model can do everything. **Output:** the writer model, prompts, sampling presets.
1. **Texts module without AI.** Folders and markers, chapters, the editor, autosave, cast, story notes, `mv://image` links. Useful on its own.
2. **Lamp.** The smallest request; proves the pipeline (context builder, priority lane, streaming, keep-loaded) end to end.
3. **Continue:** next paragraph first (ghost text), then directions.
4. **Chapter summaries**, once stories outgrow the context.
5. **Co-write.**
6. **Character chat** and the Chats folder.
7. **Illustrate** (§8), once `ai.md` phase 3 exists.

---

## 12. Open decisions

1. **Story = folder with `.story` marker, chapters as `.md` files** (§2)? Or a story as a single `.md` file?
2. **Chats** as a special top-level folder in `Texts\`, like the Inbox (§2)?
3. **Cast** as tags on the story (`story_tags`), with the wiki as the character card (§2.1)?
4. **AI marks** kept in the DB, best effort, dropped on outside edits (§2.2)?
5. **Lamp** never writes into the text, only into notes or steers (§4.4)?
6. **Group chats** (several characters) later, not in the first version (§4.3)?
7. **One writer model** for everything, or writer + helper (§9)? Decided by the spike.
8. **Text formats beyond Markdown** (`.txt`, `.docx` import/export, PDF export): which, and when?
