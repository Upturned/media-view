# media-view — Future Features: Profiles and AI

> **Status:** ideas under discussion · **Related:** `technical/images.md` §1 (offline rule), §8.3 (import) · `search-and-download.md`

---

## 1. The offline rule for new features

Every feature falls into one of three buckets:

| Bucket | Meaning | Allowed? |
|---|---|---|
| **Offline** | Part of the core app; works with no connection, always | Yes |
| **Online, but separate** | Own process, off by default; reaches the library only through a door that also exists offline (the import path → Inbox) | Yes |
| **Online and entangled** | A core page or action waits on the network, or library data depends on a remote server | No — redesign into one of the above |

Rules for anything in the second bucket:

- The core app never opens a connection.
- Data flows one way: online → library, through the normal import path.
- Output is files, optionally with **suggestions** (tags, source URL, description) that the user confirms. Never silent changes.
- Removing the online part breaks nothing. A stored source URL is plain text (a *Link* field), not a dependency.

### 1.1 Notes on Search and Download

The design already follows these rules. Two adjustments:

- **Update yt-dlp** runs inside the downloader process, so all network access stays in one place.
- **Uploader → Artist tag** is a suggestion confirmed by the user, not applied automatically.

---

## 2. Profiles

Fully offline; no AI involved.

- **Profile** (name, picture, stable ID) is global: `%APPDATA%\media-view\user.db` (Electron: `userData`), alongside the existing app config and pre-library logs.
- **Links** between a profile and tags live in each **library's** DB, because tags are per library. The library also stores the profile's ID and display name, so a library opened on another computer still knows who its links belong to.
- Each link has a **role**:
  - *creator* → **Images by me**
  - *subject* (character, model, self-portrait) → **Featuring you**
- Each profile section is a saved search over the linked tags; no new search machinery needed.
- Naming: v2 is single-user, so "profile" rather than "register/account" (no passwords), unless several people sharing one computer becomes a goal.

---

## 3. AI features

### 3.1 Offline feasibility

All of them can run fully offline **after a one-time model download**. Models are gigabytes, so they're an optional download on first enable (like yt-dlp/ffmpeg). That download is an "online, but separate" step; after it, nothing needs a connection.

| Feature | Offline? | Normal CPU? | Weight |
|---|---|---|---|
| Image descriptions | Yes | Yes, seconds per image | Light |
| Character/model recognition + tag suggestions | Yes | Yes, fast | Light |
| Stories from images | Yes | Slow without GPU | Medium |
| Story-building chat (Text module) | Yes | Slow without GPU | Medium |
| Similar images | Yes | Barely, minutes per image | Heavy |
| Images from a story passage | Yes | Barely, minutes per image | Heavy |

### 3.2 Notes per feature

- **Recognition** is two problems:
  - *Real people* (models, the user): face recognition. Small, fast, mature.
  - *Drawn/fictional characters*: face recognition fails on art. Use image similarity against the library's own tagged images ("images like this are mostly tagged *aerin*"). Works with ~5–20 tagged examples per character. Likely the most useful AI feature, since existing tags become the training data.
- **Similar images**: generate from the image itself (image-to-image), not from its description. A description loses most of what made the picture distinctive.
- **Images from stories**: two models chained. A language model condenses the passage into an image prompt, then the image model draws it.

### 3.3 Architecture

- Same isolation pattern as the downloader: an **AI process**, off by default, started on demand, reached through a proxied API on the main server. The core app is unchanged.
- **Outputs are suggestions or new files, never silent changes:**
  - Generated images → the module's Inbox.
  - Descriptions and tags → proposed; applied only when the user accepts.
- **Mark generated content from day one** (DB flag, optionally shown as a tag). Cheap now, hard to retrofit, and needed for content limits.
- **Content limits**: local models have no upstream filtering, so all limits are enforced by media-view itself (see §7).
- **One model loaded at a time.** The AI process runs a job queue and keeps a single model in VRAM; chained features (story → image) swap models between steps.

---

## 4. Target hardware

| Part | Spec |
|---|---|
| CPU | AMD Ryzen 5 5600G (6 cores, integrated graphics, PCIe 3.0) |
| RAM | 32 GB DDR4-3200 |
| GPU | NVIDIA RTX 3060 12 GB (chosen; best VRAM per price for local AI as of Oct 2026) |

- Connect the monitor to the motherboard (the 5600G's integrated graphics) so the full 12 GB of VRAM stays free for models.
- 32 GB of RAM allows models larger than VRAM to run with partial CPU offload, at reduced speed.

---

## 5. Models

Candidates as of October 2026. Model choices will change; the AI process API should not.

### 5.1 Text (descriptions, stories, story chat)

| Model | Role | Notes |
|---|---|---|
| **Gemma 4 12B** | Default | Text + image input: one model covers descriptions, stories from images and the chat. Apache 2.0. Up to 256K context. ~7–8 GB at Q4. |
| **Gemma 4 26B A4B** | Best quality on this machine | Mixture-of-experts, 4B active parameters: runs nearly as fast as a 4B model. Doesn't fit in 12 GB; runs partly offloaded to RAM. |
| **Mistral Nemo 12B** (+ community fine-tunes) | Prose specialist | Strong character-driven fiction. Fine-tunes are less restrictive than general models like Gemma, which ship with safety tuning and may refuse some fiction. |

### 5.2 Images

| Model | Role | Notes |
|---|---|---|
| **SDXL** + community fine-tunes | Workhorse | ~8 GB (12 GB comfortable). Largest LoRA/ControlNet ecosystem; anime, illustration and realistic fine-tunes. Where most adult-capable image models live. |
| **FLUX.2 [klein] 4B** | Similar images, story scenes | Text-to-image, editing and multi-reference in one model (references keep a character consistent across scenes). ~13 GB at full precision → must run quantized (FP8/GGUF). Apache 2.0; the 9B is non-commercial. |
| **Z-Image Turbo** | Fast alternative | 6B, ~8 steps, Apache 2.0. Needs quantization on 12 GB. |
| ~~FLUX.2 [dev], Qwen-Image~~ | Out of reach | Need ~24 GB. |

### 5.3 Recognition and tag suggestions

All small; fine on CPU.

| Model | Role | Notes |
|---|---|---|
| Image embeddings (SigLIP family) | Similarity: "images like this are tagged X" | Drawn/fictional characters. |
| WD tagger (Danbooru-style) | General tag suggestions for art | |
| InsightFace | Real faces (models, the user) | Pretrained models are **non-commercial**; check before distributing. |

### 5.4 Licensing

Only matters if media-view is distributed. Prefer Apache 2.0 / permissive models for anything bundled or offered as a default download.

---

## 6. Performance and limitations

### 6.1 Expected speed

Rough ranges, not benchmarks. On CPU, text speed is limited by memory bandwidth (dual-channel DDR4-3200).

| Task | CPU only (5600G) | RTX 3060 12 GB |
|---|---|---|
| Tagging, embeddings, faces | < 1–2 s per image | Near-instant |
| Gemma 4 12B text | ~3–5 words/s (500 words: 2–4 min) | ~25–35 words/s |
| Gemma 4 26B A4B text | ~8–12 words/s (faster than 12B on CPU) | Fast, partly offloaded |
| Image description | 30–60 s per image | A few seconds |
| SDXL image (1024 px) | Several minutes | ~10–20 s |
| Klein 4B / Z-Image Turbo | ~1–3 min | A few seconds |

**Before the GPU arrives:** build and test the full pipeline (AI process, queue, Inbox hand-off) with the light models and the 26B MoE for text. Image generation on CPU is a "does it work" check only. Moving to the GPU changes model files and speed, not code.

### 6.2 Compromises on 12 GB

- **One model in VRAM at a time.** Story → image unloads the language model and loads the image model: several seconds per swap.
- **Prose quality.** 12B-class models are good, not great; the real jump comes at 32B+. The 26B MoE is the closest option.
- **Long stories.** Context memory eats VRAM. Keep a rolling summary of earlier chapters instead of feeding the whole text.
- **Character consistency.** Reference images (Klein) go far; best results need a per-character LoRA (SDXL), which trains on 12 GB but takes a while per character.

---

## 7. Content settings

Three tiers. Checks run inside the AI process.

### 7.1 Default: NSFW off

Everything else is allowed. Enforced on both ends:

- **Request check** before generating.
- **Output check** after generating: a local NSFW image classifier for images; the language model itself or a small text classifier for stories.

The output check is the backbone: keyword lists on requests are easy to get around, even by accident.

### 7.2 NSFW on (opt-in)

Enabled in Settings with a one-time adult confirmation. Two kinds of dismissible warnings:

- **Content warnings** — per-category (gore, body horror, …), triggered by an editable keyword list plus a classifier for paraphrases.
- **Quality warnings** — for things local image models handle badly regardless of content: crowded scenes, complex poses, hands, several interacting characters. E.g. *"Scenes with many characters often come out distorted."*

## 8. AI logging

### 8.1 What is recorded

| Part | Contents |
|---|---|
| **What** | Job type, requesting feature, full output (text, or the generated file's path) |
| **How** | Model name and file hash, full prompt including the app's system prompt, settings (temperature, length; for images: seed, steps, size, references, LoRAs). Image jobs can be regenerated exactly. |
| **Why** | Content checks that ran, their scores and the decision (allowed / warned / blocked), and which keyword or category triggered a warning |
| **Reasoning** | Only for language models with a thinking mode; stored separately from the answer. A helpful trace of how the model approached the task, not a guaranteed account of what drove the output. Image models have none. |

### 8.2 Where it goes

- **`.mediaview/logs/`** — one short line per job, like any bulk operation (§3.1 of the technical doc), pointing to its trace:

```json
{"ts":1790000000000,"level":"info","area":"ai","msg":"job done","data":{"job":"j-41c2","kind":"story_from_image","model":"gemma-4-12b-q4","outcome":"allowed","trace":"ai-traces/2026-10/j-41c2.json"}}
```

- **`.mediaview/ai-traces/`** — one JSON file per job with the full record. Own size limit in Settings, separate from the regular log budget (100 files / 50 MB), so traces never push out error and Library Health logs.
- **Generated images** also carry a short trace in their own file metadata (PNG text chunks), so the "how" travels with the image and backs up the generated flag (§3.3).

### 8.3 Decisions

- **Trace level setting:** *off* / *metadata only* (settings and decisions, no text) / *full*. Default: **metadata only**.
- **Blocked jobs:** a hard-limit block logs that it happened and which rule caused it, **never the blocked content**.

---

## 9. Privacy

Everything runs offline. Nothing in the library should ever leave the machine; the only network traffic media-view makes is the downloader's, when the user starts it.

### 9.1 Model files

- A model file (`.gguf`, `.safetensors`) is data only: it can't connect to anything or read files.
- **The AI process loads only `.safetensors` and `.gguf`.** Older formats (`.ckpt`, `.pt`, `.bin`) use Python pickle, which can run arbitrary code when loaded.
- Downloading a model is a one-way file request; nothing from the library is sent.

### 9.2 Model runtimes

| Software | Connects when | Control |
|---|---|---|
| llama.cpp | Only when explicitly told to download a model | — |
| Hugging Face libraries | Checks the Hub for newer model versions when a model is loaded by name | `HF_HUB_OFFLINE=1` |
| ONNX Runtime (taggers, classifiers) | Windows builds: telemetry on by default, via Windows' own telemetry system | `DisableTelemetryEvents()` at AI process startup |
| ComfyUI-style apps and plugin managers | Update checks, plugin lists | Not used: the AI process runs models directly |

### 9.3 Enforcement, not trust

- **Firewall:** a Windows Firewall rule blocks all outbound traffic for the AI process executable. The downloader is the only process allowed online, and only while enabled.
- **Verify:** Resource Monitor (Network tab) shows every connection per process; the AI process should have none.
- The downloader never reads the library, but it does send search text to the source site (YouTube, SoundCloud).

### 9.4 Risks outside media-view

- **Cloud sync** — OneDrive folder backup (Desktop, Documents, Pictures), Google Drive, Dropbox. A library inside a synced folder gets uploaded, including NSFW content and AI traces. Keep libraries outside them (e.g. `D:\MyLibrary`).
  - **Feature:** warn when a library is opened or created inside a known synced folder.
- **Antivirus sample submission** — Windows Defender may send suspicious files to Microsoft. Aimed at executables, not images or text; can be set to "ask before sending".
- **Explorer thumbnail cache** — browsing the library in Windows Explorer caches previews outside the library. Local only, but they persist after images are deleted.
- **Physical access** — anyone using the computer, or holding the external drive, can open the folder. Mitigation: BitLocker (Windows Pro) or a VeraCrypt container. Both free.

---

## 10. Open points

- Where model files live (global, per library, or user-chosen folder) and how they're downloaded and updated.
- Limits by size: story length, image resolution, batch counts.
- Which classifiers to use for the request/output checks, and how warnings and blocks appear in the UI.
- Default model set offered on first enable (download size vs. quality).
