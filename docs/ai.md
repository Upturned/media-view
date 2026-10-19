# media-view — AI Features

> **Status:** draft, revised 2026-10-17 · **Related:** `text-writer.md` (the writing features) · `ai-hardware.md` (hardware tiers, models per tier) · `technical/images.md` §1 (offline rule), §3 (architecture), §9 (thumbnails) · `profiles.md` §8 · `search-and-download.md` §3 (separate process) · `archive/future-features-ai-and-downloader.md` ("future-features") · `archive/Ai-features-runtime-and-consent.md` ("consent doc") · `archive/review-features-and-ai-docs.md` ("review")
>
> The one up-to-date AI doc. It replaces future-features §3 and §5–§10 and the consent doc as the place decisions are recorded. Parts of those docs that still hold are cited, not copied; from the consent doc, only §2 (bundled `llama-server`) still holds. §2 lists every AI feature planned. §3–§10 design the **first phase**. §11 records the decisions. Open decisions are in §12.
>
> **Revision 2026-10-16:** image generation narrowed to text-to-image for stories, for personal use; generating similar images left open (maybe, later); consent records and form dropped; face recognition becomes a plain opt-in; similarity search moved to the server; A2 skips realistic photos.
>
> **Revision 2026-10-17:** NSFW becomes a safe-for-work view driven by tags; the explicit-description flag is dropped; the hard rule's checks are outlined (§11.1; full design in a doc to come); real-person names are matched against tags; text to image renumbered A13; models folder can be moved; *Delete AI data* keeps the user's decisions.

---

## 1. Principles

- **Offline after a one-time model download.** The core app never opens a connection. Models are files; getting them is a separate, explicit step (§5.3).
- **Suggestions, never silent changes.** AI proposes tags, descriptions, files; the user accepts. Generated files land in the Inbox.
- **Separate process, off by default.** AI runs in its own process, started on demand and stoppable. Turning AI off, or deleting the models, breaks nothing else.
- **The library's own tags are the training data.** No fine-tuning, no uploads: recognition compares new images against images the user already tagged.
- **One hard limit, everything else trusted.** The app is used by its author and a few friends who contribute to it; it doesn't defend against its own users. The one rule that is never a setting is the minors limit, and it lives in code, not in a prompt (§11.1).

---

## 2. Every AI feature planned

Weight is for the target machine (Ryzen 5 5600G, 32 GB RAM, RTX 3060 12 GB arriving; future-features §4). Other machines: `ai-hardware.md`.

| # | Feature | What it needs | Weight | Phase |
|---|---|---|---|---|
| A1 | **Tag suggestions** (general tags: *long hair*, *forest*, *night*…) | Tagger model | Light, CPU | **1** |
| A2 | **Character recognition** for drawn and fictional characters, from the library's own tagged images | Image embeddings | Light, CPU | **1** |
| A3 | **Find similar images** (search, not generation) | Same embeddings as A2 | Light, CPU | **1** |
| A4 | *Near-duplicates* in Library Health (resized or re-encoded copies) | Same embeddings | Light | 1, optional |
| A5 | *Search by meaning* (`a red car at night`) | Embeddings + their text model | Light | 2 |
| A6 | **Image descriptions**, feeding search and tag suggestions | Vision language model (`llama-server`) | Medium; ~1 min/image on CPU | 2 |
| A13 | **Text to image**, with a *From a passage* mode (§2.1) | Image model; language model for the passage mode | Heavy, GPU | **3** |
| A7 | **Face recognition** for real people, opt-in per library (§11.2) | Face model | Light | 4 |
| A8 | **AI-assisted writing**: continue, co-write, character chat, lamp — designed in `text-writer.md` §4 | Language model + Texts module | Medium, GPU | 5 |
| A11 | **Images from a story passage** in the Text-Writer: A13's passage mode, called from the editor (`text-writer.md` §8) | A13 + Texts module | Heavy, GPU | 5 |
| A12 | **Generate similar images** — from the image itself or from its description; how is decided later (§11.6) | Image model; A6 for the description route | Heavy, GPU | Maybe, later |
| A10 | Tiny texts and minigames from tags | Tiny language model | Light | Cut (review §3) |

*Italics:* not in the earlier docs, or reshaped. A9 (story-writing chat) was merged into A8. A13 was numbered A11a in the 2026-10-16 draft.

What each phase needs that isn't a feature:

| Phase | Prerequisites |
|---|---|
| 1 | AI process, model files, indexing queue, similarity worker, migration 008 (§4–§6) |
| 2 | `llama-server` runtime (consent doc §2, still valid); AI traces (future-features §8, with §11.5) |
| 3 | GPU; image runtime that returns images in memory (open, §12); `generation` build option and image checks (§11.1); generated flag and provenance links (§11.7) |
| 4 | Face model; the opt-in and its notice (§11.2) |
| 5 | Texts module (`text-writer.md`); text checks and the guard model (§11.1) |

The safe-for-work view (§11.3) needs no AI and can be built at any time.

**Why phase 1 is A1–A3:** they run on the CPU today, need no GPU and generate nothing. They also make the existing library more useful at once: tagging is the slowest part of using media-view, and the user's ~10,000 images are mostly untagged or lightly tagged.

**Why text to image comes before the Text-Writer:** images from a story passage are two steps — a language model condenses the passage into an image prompt, then text to image draws it. Building the second step on its own (phase 3) lets image generation be tested now; the Text-Writer (phase 5) only adds the call from the editor.

### 2.1 Phase 3 at a glance

Designed in detail when phase 3 starts; the outline:

- **Generate image** dialog: a prompt, size, seed, **Generate**. Results land in the Inbox, like any import, with the generated flag and their provenance (prompt, seed, model).
- **From a passage** mode: paste story text; the phase 2 language model writes the image prompt (in English, whatever the passage's language; future-features §9 language note), shown for editing before drawing. This is exactly what the Text-Writer will call later.
- **Checks** on the prompt and on the output (§11.1), built here once so the story feature inherits them. **No progress previews** while the image is drawn: a half-drawn image would be shown before it's checked.
- The runtime hands the finished image back **in memory** (a server mode or library call), so a blocked image never reaches the disk. A runtime that can only write files to disk doesn't qualify unless it writes to a temp folder that's wiped immediately (§12).
- Only in builds made with the `generation` option (§11.1).

---

## 3. Phase 1 in use

### 3.1 Turning it on

**Settings → AI** (new section):

- **AI for this library** — off by default. Turning it on starts indexing (§3.2). Turning it off stops the AI process; **Delete AI data** removes what AI stored in this library (§6) and is offered alongside.
- **Models** — each expected model with its status: *found*, *missing* (with where to get it and the folder to put it in), *wrong file* (hash mismatch). The **models folder** is shown with **Open folder** and **Change…** (§5.3).
- **Indexing** — *4,210 of 10,312 images · about 40 min left* · **Pause** / **Resume**. Runs only while the app is open.
- **Character suggestions from** — which tag types A2 learns from. Default: *Character*. Types marked **real people** are never offered (§6.1).
- **How sure** — *More suggestions* / *Balanced* / *Fewer, surer*. One slider sets the thresholds of A1 and A2.

AI is per library because its data lives in the library (§6) and a library may travel to a computer without the models. Models are per computer (§5.3).

### 3.2 Indexing

Every image gets analysed once, in the background, at low priority: a tagger pass (A1) and an embedding (A2, A3). Results are stored by **file hash**, like thumbnails, so moves and renames keep them and duplicates share them.

- New imports are indexed after hashing, the same way TIFF viewer copies are made (images.md §9).
- The top bar shows *AI 4,210 / 10,312* while it runs, like *TIFF 3 / 12*.
- Animated GIF/WebP: first frame. SVG: rendered by `sharp` at the model's size. Videos: later, from keyframes.

### 3.3 Suggested tags in the viewer

Under the image's tags, a **Suggested** row: chips with a dashed outline, best first.

- **Click** adds the tag (it becomes an ordinary tag, as if typed). **×** rejects it; a rejected suggestion never comes back for that image.
- **Add all** / **Dismiss all** on the row.
- Hover shows why: *tagger · 92%*, or *looks like 14 images tagged #aerin*.
- Collapsible; the row remembers its state per profile.

Where suggestions come from:

- **A1 (tagger)** suggests a label only if it matches an **existing tag or alias** in the library. Tags stay the user's vocabulary. Danbooru-style names (`long_hair`) match library tags by the usual name rules (`_` equals space, images.md §10.1). To map `1girl` onto *solo female*, add the alias.
- Labels with no match but high confidence go to a collapsed **New tags?** line: *Create tag* or *Never suggest*.
- The tagger also knows many well-known franchise characters by name. Those match Character tags the same way.
- **Rating labels** (*sensitive*, *questionable*, *explicit*) follow the same rule: suggested only through a tag or alias the user made, such as an `explicit` alias on an NSFW tag (§11.3); never offered under *New tags?*. This is how A1 helps keep the safe-for-work view up to date.
- **A2 (similarity)** suggests tags of the chosen types (§3.1) when the image's nearest tagged neighbours mostly carry that tag (§7.2). This is what recognizes the user's **own characters**, which no tagger knows.

### 3.4 Reviewing a character in bulk

Recognizing one character across the library is faster per tag than per image. The **tag wiki** gets a line under the images:

> **Might also be #aerin — 34 images** · Review

**Review** opens a grid of the candidates, best first, with the usual selection. **Add tag** tags the selection; **Not aerin** rejects it. A tag with fewer than 5 tagged images shows *Tag at least 5 images of aerin to get suggestions* instead.

The **Untagged** list in Library Health shows each image's top suggestions inline, with the same click / × behaviour.

### 3.5 More like this (A3)

- **More like this** in the viewer and in the image context menu opens Search with `like:1234`, sorted by similarity.
- `like:` combines with the rest of the syntax: `like:1234 -#aerin` finds images that look like this one but aren't tagged *aerin* yet.
- The grid shows a similarity badge in that sort, like the format badge.
- On a photo of a person, similar images are often the same person. That's accepted: it's a search the user starts, on images they already hold, and it stores no identity. Recognizing people as such stays A7's job (§7.2 step 0).

### 3.6 Near-duplicates (A4, optional in phase 1)

Library Health's duplicates are exact (same hash). With embeddings, a new **Similar copies** group can list pairs above a very high similarity: the same picture resized, re-saved or cropped slightly. Review only (*Keep both* / *Recycle one*); never automatic.

---

## 4. Architecture

```
media-view server (Node) ─── fork / IPC ───► AI process (Node + onnxruntime-node)
   │  owns the library DB                       │  holds the ONNX models in memory
   │  reads files, resizes with sharp           │  never sees paths or the DB
   │  sends pixels ──────────────────────────►  │  runs the models
   │  ◄─────────────────── labels, vectors ───  │  returns numbers
   │
   ├── similarity worker (worker_thread): vectors in memory, nearest-neighbour queries
   ├── llama-server.exe (phase 2+), image runtime (phase 3+): started and stopped by the server
   ▼
library.db (results by hash)
```

- **Its own process**, started with `child_process.fork` when AI is on and the library is open; stopped when AI is turned off, the library closes, or after 10 minutes idle with nothing to index. In Electron, a utility process. Same isolation as the downloader (search-and-download §3).
- **IPC, not a port.** The fork channel is enough while both are Node: no listening socket, nothing for another program to find. Forked with **`serialization: 'advanced'`**, so image buffers cross as buffers (the default JSON serialization turns them into huge number arrays). `llama-server` (phase 2) uses HTTP on `127.0.0.1` with a per-session key (consent doc §2.4).
- **Pixels in, numbers out.** The server reads the original, preprocesses it with `sharp` exactly as the model's manifest entry says (§5.3) and sends raw pixels. The AI process never reads the library, so it can't leak a path or touch a file. The image checks of phase 3 (§11.1) use the same path.
- **Why a separate process:** native crashes and out-of-memory in a model runtime don't take the server down; killing it always frees the memory (gigabytes); and there is one place to firewall and audit.
- **Queue in the server.** The server decides what to index, in batches of 16, lowest priority; the AI process just runs batches. Pausing means not sending the next batch. Interactive requests (writing, generating) get a higher-priority lane (`text-writer.md` §6).
- **Similarity search runs in the server, not the AI process.** A `worker_thread` keeps the library's vectors in memory (§6.2) and answers `like:` and A2 neighbour queries by brute force: 50,000 vectors is a few tens of milliseconds, no vector database needed. Two reasons: the AI process stops when idle, and restarting it to reload every vector would make *More like this* wait; and `like:` combines with SQL filters, which live next to the DB. The AI process only runs models.
  - It loads the vectors when AI is on and the library opens, not otherwise (up to ~150–225 MB read at 50,000 images, §6.2).
  - Indexing sends each batch's new vectors to it as they're stored; *Delete AI data* and the orphan cleanup tell it to drop theirs.
- **Who runs what.** The server's AI service is the only thing that starts model runtimes: the AI process (ONNX), `llama-server` and the image runtime. Each is its own executable with its own firewall rule (§10).
- **One heavy model in VRAM at a time.** A language model or an image model fills most of a 12 GB card, so the AI service unloads one before loading the other (a few seconds each way; `ai-hardware.md`). While a heavy model is on the GPU, indexing pauses or runs on the CPU. The phase 1 ONNX models are small enough not to count.

New code:

| Where | What |
|---|---|
| `server/src/ai/worker.ts` | The AI process: loads models, runs batches |
| `server/src/workers/similarity.ts` | Vectors in memory, nearest-neighbour queries |
| `server/src/services/ai.ts` | Starts and stops the AI process, the indexing queue, storing results, building suggestions |
| `server/src/routes/ai.ts` | `/api/ai/*` (§8) |
| `server/src/db/migrations/008_ai.sql` | §6 |
| `web/src/components/SuggestedTags.svelte`, `AiSettings.svelte`, `pages/TagReview.svelte` | §3 |

---

## 5. Models

### 5.1 Phase 1 candidates

Chosen in a spike (§9, step 0), measured on the user's library, not from benchmarks.

| Role | Candidates | Notes |
|---|---|---|
| Tagger (A1) | **WD v3 taggers** (SmilingWolf): `wd-vit-tagger-v3` (~380 MB), `wd-swinv2-tagger-v3`, `wd-eva02-large-tagger-v3` (~1.2 GB, best) | ONNX already published; 448 × 448 input, padded to square with white, BGR order; labels in a CSV with categories (general, character, rating). Trained on anime art, weaker on photos. Licence to confirm (believed Apache 2.0). |
| Embeddings (A2, A3, A4) | **SigLIP 2** base (768 numbers per image) or so400m (1152, slower), or the **tagger's own features** (its last layer before the labels) | SigLIP knows photos and art in general (RGB, its own normalization); the tagger's features are anime-specific and may recognize drawn characters better. The spike decides, and one model may serve both A1 and A2. |

Both are small enough for the CPU. Expected speed on the 5600G (to measure): a fraction of a second to about a second per image. **A first pass over 10,000 images is a few hours in the background**; after that, only new imports. With the GPU, minutes.

Later phases' candidates, per hardware tier: `ai-hardware.md`.

### 5.2 Runtime

**`onnxruntime-node`**, loaded only in the AI process. CPU from day one; GPU on Windows through DirectML (to confirm it covers these models). Adds native DLLs to the portable zip, copied like `sharp`'s (images.md §14.1).

- Loads **`.onnx` files only**, with no custom-operator libraries. ONNX is a data format: loading it runs no code.
- The same runtime later runs the face models (A7) and the image checks (§11.1): more model files, no new library.
- **Telemetry:** ONNX Runtime's Windows builds send trace events through Windows' own telemetry system, uploaded by a Windows service, not by `node.exe`, so a firewall rule on `node.exe` doesn't stop them. Two layers: switched off in code at worker startup (the spike confirms how from Node), and Windows diagnostic data set to *Required only* (§10).

### 5.3 Model files

- **Location:** a **models folder** per computer, shared by every library and every build. Default `%APPDATA%\media-view\models\<role>\<file>`; **Change…** in Settings → AI stores another path as `modelsDir` in the app config (images.md §5.1), and the `MEDIA_VIEW_MODELS` environment variable overrides both. Language and image models are many GB, and `C:` may not be where they belong. A future `testing` build with its own app-data folder still finds the same models.
- **Manifest:** the app ships a small list of expected models: name, role, file, size, SHA-256, licence, where to download, the **runtime** that runs it (ONNX, `llama-server`, image runtime) and the **preprocessing** each expects (input size, pad or crop, colour order, normalization). A file is used only if its hash matches. Wrong preprocessing lowers accuracy without any error, so it lives in one place, next to the model.
- **Getting them, phase 1:** **by hand.** Settings → AI shows the download page and the folder (**Open folder**); the user puts the files there. No network code in the app.
- **Later:** the downloader process (search-and-download §3) fetches them from the manifest's URL and checks the hash. The `complete` build profile ships them preinstalled, after checking each licence allows redistribution (review §6.10).

---

## 6. Data model (migration 008)

### 6.1 Tables

```sql
-- One analysis per image content and model. Keyed by hash, like thumbnails.
CREATE TABLE ai_analysis (
  hash       TEXT    NOT NULL,
  model      TEXT    NOT NULL,          -- manifest id, e.g. 'wd-vit-v3'
  labels     TEXT,                      -- tagger: JSON [[label, score], …] above a floor (0.2), best first
  vector     BLOB,                      -- embedding: float32, normalized
  created_at INTEGER NOT NULL,
  PRIMARY KEY (hash, model)
);

-- Rejected suggestions; they never come back for that image.
CREATE TABLE ai_rejections (
  hash       TEXT    NOT NULL,
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,   -- who, for the log
  created_at INTEGER NOT NULL,
  PRIMARY KEY (hash, tag_id)
);

-- Accepted suggestions, for measuring precision and undoing a bad batch.
CREATE TABLE ai_accepted (
  hash       TEXT    NOT NULL,
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  source     TEXT    NOT NULL CHECK (source IN ('tagger','similar')),
  score      REAL    NOT NULL,
  profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (hash, tag_id)
);

-- Tagger labels the user never wants proposed as new tags.
CREATE TABLE ai_ignored_labels (
  label TEXT PRIMARY KEY
);

ALTER TABLE tag_types ADD COLUMN real_people INTEGER NOT NULL DEFAULT 0;
```

- **Suggestions are not stored.** They're computed when asked for, from `ai_analysis`, the image's current tags, the library's tags and aliases, and `ai_rejections`. New tags, aliases and merges change suggestions immediately, with no re-index.
- **Accepting a suggestion** writes an ordinary `file_tags` row (`source = 'manual'`: the user chose it) and an `ai_accepted` row recording where it came from (replacing an older one for the same image and tag). Bulk accepts are logged like any bulk tag change.
- **Rejections are shared**, like tags: they describe the image, not a person.
- **Settings:** `ai.enabled`, `ai.threshold`, `ai.similarityTypes` (tag type ids) in the library's `settings` table.
- **`tag_types.real_people`:** set by the user on types such as *Model*. A2 never learns from or suggests those types. Shown on the Tag types page as *Real people*. A2 also skips realistic photos whatever their tags (§7.2). The same types feed the real-name check on generation prompts (§11.1).
- **Cleanup:** analyses whose hash no longer belongs to any file are deleted by the same pass as `orphan_thumbs`.
- **Delete AI data** empties `ai_analysis` and `ai_accepted`: what the models produced. `ai_rejections` and `ai_ignored_labels` are the user's own decisions, so they're kept unless *Also forget my rejections* is ticked.

### 6.2 Size

A 768-number float32 vector is 3 KB: about 30 MB for 10,000 images, 150 MB at the 50,000 target, plus a few hundred bytes of labels each. With 1152 numbers (SigLIP 2 so400m), 4.5 KB: 45 MB and 225 MB. Acceptable in the DB. The similarity worker keeps an 8-bit copy in memory (about 40 MB at 50,000 with 768 numbers, 60 MB with 1152).

---

## 7. How suggestions are made

### 7.1 Tagger (A1)

1. Take the image's labels above the threshold (*Balanced* ≈ 0.35 general, 0.85 character; tuned in the spike).
2. Match each label to a tag or alias by normalized name, across types. A label matching tags in several types suggests the one in the type the tagger's category maps to (character → Character, else the default type).
3. Drop tags the image already has (directly or implied) and rejected ones.
4. Unmatched labels above a higher threshold, minus `ai_ignored_labels` and rating labels, go to **New tags?**

### 7.2 Similarity (A2)

0. **Skip realistic photos.** Images the tagger reads as realistic (`realistic`, `photorealistic` above a threshold set in the spike) are neither neighbours nor targets. In a photo, an embedding captures mostly the person, so a *Character* tag on cosplay photos would otherwise teach A2 to find that person across the library: face recognition by another name. Recognizing people is A7's job, behind its own opt-in. Drawn characters are unaffected.
1. Find the image's 20 nearest neighbours among **tagged** images (cosine similarity), skipping exact duplicates of itself.
2. For each tag of the chosen types on those neighbours, add up similarity. Suggest tags whose share passes the threshold, with at least **3 neighbours** carrying the tag and at least **5 images** tagged overall.
3. Same drops as A1.

The bulk review (§3.4) runs the other way: from the tag's images, find untagged-for-that-tag images whose nearest tagged neighbours vote for it.

**Measured, not guessed:** the spike runs leave-one-out on the user's own tags (hide one tagged image's tag, see if A2 suggests it back) and reports precision per tag. The thresholds and the choice of embedding model come from those numbers.

---

## 8. API

| Route | Does |
|---|---|
| `GET /api/ai` | Status: enabled, models folder, models (found / missing / wrong), indexing progress, worker running |
| `PATCH /api/ai` | `{ enabled?, threshold?, similarityTypes? }` |
| `PUT /api/ai/models-dir` | `{ path }`: change the models folder (app config, not the library) |
| `POST /api/ai/pause`, `/resume` | Indexing |
| `DELETE /api/ai/data` | `{ forgetDecisions? }`: Delete AI data (asks first in the UI) |
| `GET /api/ai/suggestions/:fileId` | `{ tags: [{ tag, score, source: 'tagger'|'similar', why }], newTags: [{ label, score }] }` |
| `POST /api/ai/reject` | `{ fileIds, tagId }` |
| `POST /api/ai/ignore-label` | `{ label }` |
| `GET /api/ai/candidates/:tagId` | Candidates for the bulk review (§3.4), paged |
| `GET /api/files?q=like:1234` | Similar images, through the normal search (§3.5) |

Events: `{ type: 'ai-indexing', done, total }` at most once a second, like `converting`. While AI is off, `/api/ai/*` answers status and settings only; `like:` returns *AI is off for this library*. With AI on, `like:` and suggestions work even while the AI process is stopped for idleness: they only need the stored results and the similarity worker. `like:` on an image not indexed yet returns *Not analysed yet*.

---

## 9. Build order

0. **Spike (1–2 days).** A script, outside the app, on a copy of the user's library: run the tagger candidates and SigLIP 2 on the CPU; time them; leave-one-out on the user's Character tags; check what tagger labels match existing tags; set the realistic-photo threshold; confirm turning ONNX Runtime telemetry off from Node. **Output:** model choice, thresholds, real speed. Decides whether phase 1 is worth it as designed before any UI exists.
1. **Worker and indexing.** Migration 008, `ai.ts`, the AI process, the similarity worker, the manifest, the models folder and Settings → AI, the top-bar progress.
2. **Suggested tags** in the viewer (A1 + A2), rejections, *New tags?*
3. **Bulk review** on the wiki and in Library Health's Untagged list.
4. **More like this** and `like:` (A3). Near-duplicates (A4) if time allows.
5. **Packaging** (onnxruntime in the zip), Help, user guide, `docs/testing/ai-test-guide.md`.

Phase 1 needs **no GPU**. The GPU makes indexing faster when it arrives; nothing else changes.

**Phase 2's spike** adds one question: whether one multimodal model can write descriptions (A6), passage prompts (A13) and the Text-Writer's helper requests (`text-writer.md` §9). One model means no swapping between them.

---

## 10. Privacy and safety, phase 1

- No network. The models come from the user's own download (§5.3).
- **Layers**, since only an air gap is absolute (the offline machines have one):
  1. No network code in media-view.
  2. ONNX Runtime telemetry off in code (§5.2).
  3. Windows diagnostic data set to *Required only*.
  4. A firewall rule per executable: the bundled `node.exe` (server and AI process), later `llama-server.exe` and the image runtime (review §6.8). Loopback isn't affected (to confirm).
  5. A check in Resource Monitor (Network tab) that none of them connects.
- **Downloader:** it's a Node process too, so the `node.exe` rule would block its connection check. Run it from its own executable, or do the connection check through yt-dlp. Settled when the downloader is built.
- Nothing generated, so no content checks yet.
- **Real people:** A2 skips realistic photos and tag types marked *Real people* (§7.2); A3 on photos is a search the user starts (§3.5). The tagger has no notion of identity for photos; its character labels are for fictional characters.
- **Logs:** one `area: "ai"` line per indexing run (count, model, time) and the usual line for bulk accepts, with `profile` when there are several profiles. No AI traces: there's no prompt or output to trace.

---

## 11. Decisions

Each needs a yes before it's final (§12).

### 11.1 Content policy

| Tier | Covers | Behaviour |
|---|---|---|
| **Hard limit** | Anything sexual involving minors, **drawn or real** (Brazil's ECA art. 241-C covers simulated depictions) | **Blocked** in every profile and every build. Checked on the prompt **and** the output. Blocked content is discarded and never written to disk; the log records that the rule fired, never the content. |
| **NSFW** | Adult themes, nudity, fictional violence | Allowed. The profile's NSFW setting (§11.3) decides what that profile sees and what the AI writes for it. Stories with some nudity are an intended use. |
| **Everything else** | | Allowed. |

**The hard limit lives in code.** Four rules, whatever the detectors turn out to be:

1. **Checked by the server**, on what goes in and what comes out. A system prompt asking the model to behave is added too, but never relied on: models don't always follow it.
2. **Fails closed.** If a detector is missing, fails to load or errors, generation is unavailable. "Couldn't check" counts as blocked.
3. **Never a setting**, in any build, the `testing` one included. Verbose traces (§11.5) may record that a check ran and its scores; nothing turns a check off.
4. **Nothing unchecked is shown.** Generated images show no progress previews (§2.1); generated text is held back a sentence at a time and checked before it reaches the screen (`text-writer.md` §7).

**The checks, in outline.** The full design (detectors, thresholds, test set) gets its own doc before phase 3. No new libraries: everything runs in onnxruntime (§5.2) or `llama-server`, from model files in the manifest, offline.

| Checks | Signals | Runs in |
|---|---|---|
| Generated images | The WD tagger's rating labels (already loaded for A1) and whatever age-related labels it has (the spike confirms which exist and how reliable they are); a small NSFW image classifier as a second opinion; for realistic images, a face detector with age estimation | AI process (ONNX), same *pixels in, numbers out* path as indexing |
| Generated and requested text | A small **guard model** that labels text by category, child sexual content among them (candidates: Llama Guard 3 1B, ShieldGemma 2B, Qwen3Guard); the **Age** field of the Character tags in the cast or mentioned (images.md §10.2) | `llama-server`, small enough to sit on the CPU next to the writer |
| Prompts and passages | The same text checks, before anything is generated | `llama-server` |

The code rule combines them: a sexual signal **and** any minor signal blocks. Thresholds lean strict: a false block costs a regeneration. Anime ages are stylized and no detector is perfect, which is why there are several signals.

**Generation is for the author's own use.** Text to image (A13) and everything built on it are only in builds made with a **`generation`** release option, alongside `--ai` / `--no-ai`. Friends' builds get tagging, descriptions and face recognition, not generation.

**No real people the app knows about in generated images.** The risk is a real person the library knows: someone photographed, a friend, a profile. Before generating, the prompt is matched against:

- the names and aliases of tags in types marked *Real people* (§6.1), and profile names;
- normalized like tag names (case, `_` equals space), on **whole words**, so *Ana* doesn't match *Banana*.

A match blocks the request and says which tag matched, so a character who shares a name with a *Model* tag is easy to spot; match on full names and keep aliases for the nicknames that should be caught. Names the app doesn't know (a celebrity typed by hand) aren't caught: for personal use, that's the line. Prompts built by the app (passage mode) go through the same check. Text to image takes no reference images; if A12 is built from the image itself, §11.6 applies.

The anime-style caveat stays: such models can make characters look younger than intended. Keeping the check on the output, not only the prompt, is what covers that.

### 11.2 Face recognition: an opt-in per library

**No consent records.** LGPD doesn't apply to processing by an individual for purely private, non-economic purposes (art. 4, I): recognizing faces in a personal library is the same as Immich or a phone gallery doing it. The consent doc's records, scopes and form are dropped.

- **Off by default**, per library, in Settings → AI. Turning it on shows: *"Face recognition stores data about the faces of everyone in this library's photos. For photos taken professionally, make sure the people in them agree."*
- **Professional libraries** (the photographer's work) are where LGPD can apply. His models already sign a term allowing face recognition in his photo service; that's his to keep covering media-view too.
- **Detecting** that a person is present is not recognition: no identity, nothing stored.
- **Turning it off** deletes the stored face data.
- **Models:** YuNet + SFace (Apache) are plain ONNX files and run in the existing runtime; InsightFace's `buffalo_l` is non-commercial (§11.7). `ai-hardware.md` lists both.
- Not legal advice; worth one question to the lawyer already reviewing the project.

### 11.3 NSFW: a safe-for-work view, driven by tags

NSFW is a convenience, not a lock: a *safe to look at work* view. Anyone at the keyboard can switch it off, and that's fine for this app.

- **Tags mark it.** A tag can be marked **Not safe for work** (wiki page and Edit tag dialog; `tags.nsfw`). An image carrying such a tag, directly or through an implication, is NSFW. Implications do the heavy lifting: mark `#nsfw`, and make *nude* or *explicit* imply it.
- **A1 helps.** An `explicit` or `questionable` alias on a marked tag lets the tagger's rating labels suggest it (§3.3), so untagged explicit images get caught as they're indexed.
- **Per profile.** Each profile has **Show NSFW**, off for new profiles. Off: NSFW images are left out of grids, search, random, slideshows and viewer navigation, and a hidden image used as a cover shows a placeholder. Their descriptions go with them, so there's no separate rule for description text.
- **One-time confirmation.** Turning *Show NSFW* on the first time for a profile asks *"Show adult content for this profile?"* and stores when it was confirmed. Not a security barrier; it keeps a friend's new profile from opening on explicit content by surprise.
- **Its own field and route,** not inside `prefs`, so a generic preferences update can't switch it on. No password needed beyond the profile's own.
- **The AI follows it.** For a profile with *Show NSFW* off, the writer's and the passage mode's system prompts ask for non-explicit text. Nothing is flagged or hidden afterwards.
- **Descriptions (A6)** describe what's in the image plainly; they never name a real person on their own. Names come only from tags the user added.

The view needs no AI and can be built before phase 1 (profiles.md §8). The 2026-10-16 draft's `files.description_explicit` flag is dropped.

### 11.4 No quarantine (review §4.2 point 3, §6.4)

**Everything blocked is discarded**, in test builds too. Metadata-only logs (rule, detector scores, seed) are enough to debug detectors. future-features §8.3 ("never the blocked content") stands as written. This is why the image runtime must hand images back in memory (§2.1).

### 11.5 Trace levels (review §6.5)

*Off / metadata only / full* is a normal setting (default **metadata only**), from phase 2 on. The test-build-only **verbose** level adds detector internals per step and can't be built outside the `testing` profile (review §2.3).

### 11.6 Similar images

- **Find similar** (A3, phase 1): search. No generation.
- **Generate similar** (A12): **maybe, later**; whether and how is decided then. Two possible routes:
  - **From the image** (image to image): the original's pixels are the reference. If built, it doesn't take realistic photos of other people as a source (the same realistic-photo check as A2, §7.2); drawings, story art and the user's own photos are fine.
  - **From the description**: the image's description, with real-person names removed (§11.1), becomes a text-to-image prompt. No pixels of the original are used.

### 11.7 Smaller fixes

- Image descriptions on CPU: **about 1 minute per image**, Medium (review §6.9).
- Each executable gets its own firewall rule (review §6.8). Ollama in development makes update checks; acceptable for development only, never with real photos.
- Licences: check redistribution before any model goes into a `complete` build (review §6.10). That matters for what friends' builds get (taggers, embeddings, face models, description and writer models); generation models stay with the author. InsightFace's pretrained face models are non-commercial: fine among friends, but don't bundle without checking.
- **Provenance links** (review §4.2 point 7) arrive with phase 3, before the first generated file: each generated file records its prompt, seed, model and, in passage mode, the passage it came from. The "generated" flag alone isn't enough.

### 11.8 Changes made in profiles.md §8

- **Own likeness** isn't needed for now: nothing planned uses reference images. *Subject* links only feed *Featuring you*. Revisit only if A12 is built from the image itself and should accept the user's own photos (§11.6).
- **NSFW** becomes *Show NSFW*: a profile field of its own (§11.3), not in `prefs`, off for new profiles, with a one-time confirmation and no password requirement.
- **Consent records** for other people are dropped (§11.2).

---

## 12. Open decisions

1. **Phase 1 scope:** A1 + A2 + A3, with A4 optional? (§2)
2. **Models by hand** in phase 1, before the downloader exists? (§5.3)
3. **AI per library**, off by default? (§3.1)
4. **Tagger suggests existing tags only**, with new ones behind *New tags?*, rating labels only through tags or aliases the user made? (§3.3)
5. **Rejections shared** by all profiles, and kept by *Delete AI data* unless asked? (§6.1)
6. **Models folder** movable, stored in the app config? (§5.3)
7. **Phase order:** text to image (phase 3) before face recognition (phase 4) and the Text-Writer (phase 5)? (§2)
8. **Image runtime** for phase 3: a Python `diffusers` worker or stable-diffusion.cpp (consent doc §2.6). Must hand images back in memory (§2.1); `ai-hardware.md` leans to stable-diffusion.cpp for the CPU tier.
9. **A12, generate similar:** whether to build it, and from the image or from its description (§11.6).
10. **The hard-limit checks:** detectors, thresholds and test set, in their own doc before phase 3 (§11.1). Also whether phase 2 descriptions go through the text check.
11. **§11.1–§11.8**, each: content policy, hard limit in code and the `generation` build option, real-name matching, face recognition as an opt-in, the safe-for-work view, no quarantine, trace levels, similar images, smaller fixes, profiles.md changes.
