# media-view — AI Features

> **Status:** draft, 2026-10-14 · **Related:** `technical/images.md` §1 (offline rule), §3 (architecture), §9 (thumbnails) · `profiles.md` §8 · `search-and-download.md` §3 (separate process) · `archive/future-features-ai-and-downloader.md` ("future-features") · `archive/Ai-features-runtime-and-consent.md` ("consent doc") · `archive/review-features-and-ai-docs.md` ("review")
>
> The one up-to-date AI doc. It replaces future-features §3 and §5–§10 and the consent doc as the place decisions are recorded. Parts of those docs that still hold are cited, not copied. §2 lists every AI feature planned. §3–§10 design the **first phase**. §11 settles the contradictions the review found. Open decisions are in §12.

---

## 1. Principles

These carry over unchanged from the earlier docs.

- **Offline after a one-time model download.** The core app never opens a connection. Models are files; getting them is a separate, explicit step (§5.3).
- **Suggestions, never silent changes.** AI proposes tags, descriptions, files; the user accepts. Generated files land in the Inbox.
- **Separate process, off by default.** AI runs in its own process, started on demand and stoppable. Turning AI off, or deleting the models, breaks nothing else.
- **The library's own tags are the training data.** No fine-tuning, no uploads: recognition compares new images against images the user already tagged.
- **Fail closed where it matters.** Hard limits (§11.1) block; everything else warns.

---

## 2. Every AI feature planned

Weight is for the target machine (Ryzen 5 5600G, 32 GB RAM, RTX 3060 12 GB arriving; future-features §4).

| # | Feature | What it needs | Weight | Phase |
|---|---|---|---|---|
| A1 | **Tag suggestions** (general tags: *long hair*, *forest*, *night*…) | Tagger model | Light, CPU | **1** |
| A2 | **Character recognition** for drawn and fictional characters, from the library's own tagged images | Image embeddings | Light, CPU | **1** |
| A3 | **Find similar images** (search, not generation) | Same embeddings as A2 | Light, CPU | **1** |
| A4 | *Near-duplicates* in Library Health (resized or re-encoded copies) | Same embeddings | Light | 1, optional |
| A5 | *Search by meaning* (`a red car at night`) | Embeddings + their text model | Light | 2 |
| A6 | **Image descriptions**, feeding search and tag suggestions | Vision language model (`llama-server`) | Medium; ~1 min/image on CPU | 2 |
| A7 | **Face recognition** for real people (models, you) | Face model + **consent records** (§11.2) | Light, but gated | 3 |
| A8 | **Stories from images** | Language model | Medium, GPU | 4 |
| A9 | **Story-writing chat** | Language model + Text module | Medium, GPU | 4 |
| A10 | Tiny texts and minigames from tags | Tiny language model | Light | Cut (review §3) |
| A11 | **Images from a story passage** | Language model → image model | Heavy, GPU | 5 |
| A12 | **Generate similar images** (image to image) | Image model; reference rules (§11.1) | Heavy, GPU | 5 |

*Italics:* not in the earlier docs; they come almost free with A2's embeddings.

What each phase needs that isn't a feature:

| Phase | Prerequisites |
|---|---|
| 1 | AI process, model files, indexing queue, migration 008 (§4–§6) |
| 2 | `llama-server` runtime (consent doc §2, still valid), per-profile NSFW setting (§11.3) |
| 3 | Consent records and form (consent doc §4, with §11.2 changes) |
| 4 | Text module; AI traces (future-features §8, with §11.5) |
| 5 | Provenance links (review §4.2 point 7), hard-limit checks (§11.1), image runtime (open, consent doc §2.6) |

**Why phase 1 is A1–A3:** they run on the CPU today, need no GPU, generate nothing, and depend on none of the open consent questions. They also make the existing library more useful at once: tagging is the slowest part of using media-view, and the user's ~10,000 images are mostly untagged or lightly tagged.

---

## 3. Phase 1 in use

### 3.1 Turning it on

**Settings → AI** (new section):

- **AI for this library** — off by default. Turning it on starts indexing (§3.2). Turning it off stops the AI process; **Delete AI data** removes everything AI stored in this library (§6) and is offered alongside.
- **Models** — each expected model with its status: *found*, *missing* (with where to get it and the folder to put it in), *wrong file* (hash mismatch).
- **Indexing** — *4,210 of 10,312 images · about 40 min left* · **Pause** / **Resume**. Runs only while the app is open.
- **Character suggestions from** — which tag types A2 learns from. Default: *Character*. Types marked **real people** are never offered (§11.2).
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

### 3.6 Near-duplicates (A4, optional in phase 1)

Library Health's duplicates are exact (same hash). With embeddings, a new **Similar copies** group can list pairs above a very high similarity: the same picture resized, re-saved or cropped slightly. Review only (*Keep both* / *Recycle one*); never automatic.

---

## 4. Architecture

```
media-view server (Node) ─── fork / IPC ───► AI process (Node + onnxruntime-node)
   │  owns the library DB                       │  holds the models in memory
   │  reads files, resizes with sharp           │  never sees paths or the DB
   │  sends pixels ──────────────────────────►  │  runs the models
   │  ◄─────────────────── labels, vectors ───  │  returns numbers
   ▼
library.db (results by hash)
```

- **Its own process**, started with `child_process.fork` when AI is on and the library is open; stopped when AI is turned off, the library closes, or after 10 minutes idle with nothing to index. In Electron, a utility process. Same isolation as the downloader (search-and-download §3).
- **IPC, not a port.** The fork channel is enough while both are Node: no listening socket, nothing for another program to find. `llama-server` (phase 2) uses HTTP on `127.0.0.1` with a per-session key (consent doc §2.4).
- **Pixels in, numbers out.** The server reads the original, resizes it with `sharp` to the model's input size and sends raw RGB. The AI process never reads the library, so it can't leak a path or touch a file, and the content checks of later phases run on exactly the pixels a model saw (consent doc §3.2).
- **Why a separate process:** native crashes and out-of-memory in a model runtime don't take the server down; killing it always frees the memory (gigabytes); and there is one place to firewall and audit.
- **Queue in the server.** The server decides what to index, in batches of 16, lowest priority; the AI process just runs batches. Pausing means not sending the next batch.
- **Search runs in the AI process.** It keeps the library's vectors in memory (§6.2) and answers `like:` and A2 neighbour queries by brute force. 50,000 × 768 numbers is a few tens of milliseconds; no vector database needed.

New code:

| Where | What |
|---|---|
| `server/src/ai/worker.ts` | The AI process: loads models, runs batches, holds vectors, answers nearest-neighbour queries |
| `server/src/services/ai.ts` | Starts and stops the worker, the indexing queue, storing results, building suggestions |
| `server/src/routes/ai.ts` | `/api/ai/*` (§8) |
| `server/src/db/migrations/008_ai.sql` | §6 |
| `web/src/components/SuggestedTags.svelte`, `AiSettings.svelte`, `pages/TagReview.svelte` | §3 |

---

## 5. Models

### 5.1 Phase 1 candidates

Chosen in a spike (§9, step 0), measured on the user's library, not from benchmarks.

| Role | Candidates | Notes |
|---|---|---|
| Tagger (A1) | **WD v3 taggers** (SmilingWolf): `wd-vit-tagger-v3` (~380 MB), `wd-swinv2-tagger-v3`, `wd-eva02-large-tagger-v3` (~1.2 GB, best) | ONNX already published; 448 × 448 input; labels in a CSV with categories (general, character, rating). Trained on anime art, weaker on photos. Licence to confirm (believed Apache 2.0). |
| Embeddings (A2, A3, A4) | **SigLIP 2** base (768 numbers per image), or the **tagger's own features** (its last layer before the labels) | SigLIP knows photos and art in general; the tagger's features are anime-specific and may recognize drawn characters better. The spike decides, and one model may serve both A1 and A2. |

Both are small enough for the CPU. Expected speed on the 5600G (to measure): a fraction of a second to about a second per image. **A first pass over 10,000 images is a few hours in the background**; after that, only new imports. With the GPU, minutes.

### 5.2 Runtime

**`onnxruntime-node`**, loaded only in the AI process. CPU from day one; GPU on Windows through DirectML (to confirm it covers these models). Adds native DLLs to the portable zip, copied like `sharp`'s (images.md §14.1).

- Loads **`.onnx` files only**, with no custom-operator libraries. ONNX is a data format: loading it runs no code.
- ONNX Runtime's Windows telemetry is switched off at worker startup (future-features §9.2); the spike confirms how from Node.

### 5.3 Model files

- **Location:** `%APPDATA%\media-view\models\<role>\<file>`. Per computer, shared by every library. Settles future-features §10's first open point.
- **Manifest:** the app ships a small list of expected models (name, file, size, SHA-256, licence, where to download). A file is used only if its hash matches.
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

-- Tagger labels the user never wants proposed as new tags.
CREATE TABLE ai_ignored_labels (
  label TEXT PRIMARY KEY
);

ALTER TABLE tag_types ADD COLUMN real_people INTEGER NOT NULL DEFAULT 0;
```

- **Suggestions are not stored.** They're computed when asked for, from `ai_analysis`, the image's current tags, the library's tags and aliases, and `ai_rejections`. New tags, aliases and merges change suggestions immediately, with no re-index.
- **Accepting a suggestion** writes an ordinary `file_tags` row (`source = 'manual'`): the user chose it. Bulk accepts are logged like any bulk tag change.
- **Rejections are shared**, like tags: they describe the image, not a person.
- **Settings:** `ai.enabled`, `ai.threshold`, `ai.similarityTypes` (tag type ids) in the library's `settings` table.
- **`tag_types.real_people`:** set by the user on types such as *Model*. A2 never learns from or suggests those types (§11.2). Shown on the Tag types page as *Real people*.
- **Cleanup:** analyses whose hash no longer belongs to any file are deleted by the same pass as `orphan_thumbs`. **Delete AI data** empties the three tables.

### 6.2 Size

A 768-number float32 vector is 3 KB: about 30 MB for 10,000 images, 150 MB at the 50,000 target, plus a few hundred bytes of labels each. Acceptable in the DB. The AI process keeps an 8-bit copy in memory (about 40 MB at 50,000).

---

## 7. How suggestions are made

### 7.1 Tagger (A1)

1. Take the image's labels above the threshold (*Balanced* ≈ 0.35 general, 0.85 character; tuned in the spike).
2. Match each label to a tag or alias by normalized name, across types. A label matching tags in several types suggests the one in the type the tagger's category maps to (character → Character, else the default type).
3. Drop tags the image already has (directly or implied), rejected ones, and **rating labels** (they're never suggested).
4. Unmatched labels above a higher threshold, minus `ai_ignored_labels`, go to **New tags?**

### 7.2 Similarity (A2)

1. Find the image's 20 nearest neighbours among **tagged** images (cosine similarity), skipping exact duplicates of itself.
2. For each tag of the chosen types on those neighbours, add up similarity. Suggest tags whose share passes the threshold, with at least **3 neighbours** carrying the tag and at least **5 images** tagged overall.
3. Same drops as A1.

The bulk review (§3.4) runs the other way: from the tag's images, find untagged-for-that-tag images whose nearest tagged neighbours vote for it.

**Measured, not guessed:** the spike runs leave-one-out on the user's own tags (hide one tagged image's tag, see if A2 suggests it back) and reports precision per tag. The thresholds and the choice of embedding model come from those numbers.

---

## 8. API

| Route | Does |
|---|---|
| `GET /api/ai` | Status: enabled, models (found / missing / wrong), indexing progress, worker running |
| `PATCH /api/ai` | `{ enabled?, threshold?, similarityTypes? }` |
| `POST /api/ai/pause`, `/resume` | Indexing |
| `DELETE /api/ai/data` | Delete AI data (asks first in the UI) |
| `GET /api/ai/suggestions/:fileId` | `{ tags: [{ tag, score, source: 'tagger'|'similar', why }], newTags: [{ label, score }] }` |
| `POST /api/ai/reject` | `{ fileIds, tagId }` |
| `POST /api/ai/ignore-label` | `{ label }` |
| `GET /api/ai/candidates/:tagId` | Candidates for the bulk review (§3.4), paged |
| `GET /api/files?q=like:1234` | Similar images, through the normal search (§3.5) |

Events: `{ type: 'ai-indexing', done, total }` at most once a second, like `converting`. While AI is off, `/api/ai/*` answers status and settings only; `like:` returns *AI is off for this library*.

---

## 9. Build order

0. **Spike (1–2 days).** A script, outside the app, on a copy of the user's library: run the tagger candidates and SigLIP 2 on the CPU; time them; leave-one-out on the user's Character tags; check what tagger labels match existing tags. **Output:** model choice, thresholds, real speed. Decides whether phase 1 is worth it as designed before any UI exists.
1. **Worker and indexing.** Migration 008, `ai.ts`, the worker, the manifest and Settings → AI, the top-bar progress.
2. **Suggested tags** in the viewer (A1 + A2), rejections, *New tags?*
3. **Bulk review** on the wiki and in Library Health's Untagged list.
4. **More like this** and `like:` (A3). Near-duplicates (A4) if time allows.
5. **Packaging** (onnxruntime in the zip), Help, user guide, `docs/testing/ai-test-guide.md`.

Phase 1 needs **no GPU**. The GPU makes indexing faster when it arrives; nothing else changes.

---

## 10. Privacy and safety, phase 1

- No network. The models come from the user's own download (§5.3).
- **Firewall:** a rule blocking outbound traffic for the bundled `node.exe` covers both the server and the AI process. They never connect anywhere; loopback isn't affected (to confirm). `llama-server.exe` and any image runtime get their own rules when they arrive (review §6.8).
- Nothing generated, so no content checks yet. NSFW settings don't change phase 1, except that rating labels are never suggested.
- **Real people:** A2 skips tag types marked *Real people* until §11.2 is settled. The tagger has no notion of identity for photos; its character labels are for fictional characters.
- **Logs:** one `area: "ai"` line per indexing run (count, model, time) and the usual line for bulk accepts, with `profile` when there are several profiles. No AI traces: there's no prompt or output to trace.

---

## 11. Decisions on the earlier docs

Proposed answers to the review's contradictions. Each needs a yes before it's final (§12).

### 11.1 Content policy: three tiers (review §3.1, §6.1, §6.2)

The missing future-features §7.3, written down:

| Tier | Covers | Behaviour |
|---|---|---|
| **Hard limits** | Anything sexual involving minors, **drawn or real** (Brazil's ECA art. 241-C covers simulated depictions); real people used as references without consent | **Blocked**, in every profile and every build. Not a setting. Checked on the request (prompt) **and** the output. Blocked content is discarded and never written to disk; the log records which rule fired, never the content. |
| **NSFW** | Adult and explicit themes, fictional violence and gore | **Off** by default per profile; on with a one-time adult confirmation. When off, requests and outputs are checked and blocked. |
| **Everything else** | | Allowed; dismissible **content warnings** and **quality warnings** (future-features §7.2) |

The features doc's "no restrictions, warn but don't limit" applies to the NSFW tier when it's on, **never to hard limits**. Applies from phase 2 (descriptions) on; phase 1 generates nothing.

### 11.2 Face recognition needs consent (review §6.6)

**Yes, recognition of real people requires a consent record**, except your own likeness, which is a profile setting (profiles.md §8). Faces are biometric data, which LGPD treats as sensitive. The consent doc's §4.1 scope and highlighted form checkbox stand; its §3.3 line ("stays a local tool… without consent") is withdrawn.

- **Detecting** that a person is present (to block generation, §11.1) is not recognition: no identity, nothing stored. Allowed without consent.
- **Drawn-character recognition** (A2) isn't about real people and needs nothing. To keep it from becoming face recognition by another name, it never learns from tag types marked *Real people* (§6.1).
- Puts A7 in phase 3, after consent records.

### 11.3 Descriptions are not gated by consent (review §4.2 point 4)

**Proposed: no consent record needed for AI descriptions**, and the scope comes off the consent form. Reasons: a description is what the user could write by hand about an image they already hold; it stays in their library; it identifies no one by itself. Two rules instead:

- With the profile's **NSFW off**, explicit images get no description, or a non-explicit one, so explicit text doesn't sit in the DB (consent doc §3.3).
- Descriptions never name a real person. Names come only from tags the user added.

Needs a per-profile `ai.nsfw` setting before phase 2 (`ProfilePrefs`; not built yet).

### 11.4 No quarantine (review §4.2 point 3, §6.4)

**Everything blocked is discarded**, in test builds too. Metadata-only logs (rule, detector scores, seed, prompt for non-hard-limit blocks) are enough to debug detectors. Add a quarantine only if that turns out not to be true; future-features §8.3 ("never the blocked content") stands as written.

### 11.5 Trace levels (review §6.5)

*Off / metadata only / full* is a normal setting (default **metadata only**). The test-build-only **verbose** level adds detector internals per step and can't be built outside the `testing` profile (review §2.3).

### 11.6 Similar images: two features (review §6.7)

- **Find similar** (A3, phase 1): search. No generation, no reference use.
- **Generate similar** (A12, phase 5): image to image. That **is** reference use, so the real-person rules apply in full.
- The "similar from description" route is dropped: worse results, and the only reason for it was getting around the reference rules.

### 11.7 Smaller fixes

- Image descriptions on CPU: **about 1 minute per image**, Medium (review §6.9).
- Each executable gets its own firewall rule (review §6.8). Ollama in development makes update checks; acceptable for development only, never with real photos.
- Licences: check redistribution before any model goes into a `complete` build (review §6.10). InsightFace's pretrained models are non-commercial: fine among friends, but don't bundle without checking.
- Provenance links (review §4.2 point 7) are planned with phase 5, before the first generated file. The "generated" flag alone isn't enough.
- ID numbers on the consent form are optional (review §4.2 point 5).

---

## 12. Open decisions

1. **Phase 1 scope:** A1 + A2 + A3, with A4 optional? (§2)
2. **Models by hand** in phase 1, before the downloader exists? (§5.3)
3. **AI per library**, off by default? (§3.1)
4. **Tagger suggests existing tags only**, with new ones behind *New tags?* (§3.3)
5. **Rejections shared** by all profiles? (§6.1)
6. **§11.1–§11.7**, each: content tiers, face recognition behind consent, descriptions not gated, no quarantine, trace levels, two kinds of "similar", smaller fixes.
