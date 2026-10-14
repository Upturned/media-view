# media-view — AI Runtime, Reference Safety and Consent

> **Status:** design notes for the first AI test build · **Related:** `future-features.md` §3 (AI features), §7 (content settings), §8 (AI logging), §9 (privacy)
>
> §3–§4 here refine `future-features.md` §7.3: real people are blocked as references **unless** a consent record covers every person in the image.

---

## 1. Runtime choices

A model is a file on disk. A **runtime** loads it into VRAM and generates; the app talks to the runtime, never to the model.

### 1.1 Options

| Runtime | What it is | Fit for media-view |
|---|---|---|
| **llama.cpp (`llama-server`)** | The engine under most local tools; single executable, OpenAI-compatible HTTP API | **Shipped version** (§2) |
| **Ollama** | Installer + model store + API, built on llama.cpp | **Development only** (§1.2) |
| KoboldCpp | Single executable on llama.cpp, aimed at storytelling; includes image generation | Worth trying for ideas on story features |
| LM Studio | Polished desktop app; closed source | Quick model testing only |
| Jan | Open-source desktop chat app | Quick model testing only |
| vLLM / SGLang | Multi-user servers, Linux-focused | Not a fit |
| node-llama-cpp | llama.cpp loaded inside a Node process | Alternative to spawning `llama-server` |
| onnxruntime-node | Small models in-process | Taggers, classifiers, embeddings |

### 1.2 Ollama during development

- Local generation sends nothing out; the core runtime has no telemetry.
- The Windows app **checks for and downloads updates** automatically (app version and IP, not content).
- **`-cloud` models run on Ollama's servers.** One suffix difference from a local model name. Never use them with test data.
- **Never set `OLLAMA_HOST=0.0.0.0`**: the API has no password and becomes reachable from the network.
- Block `ollama.exe` in the firewall while testing with sensitive photos.

### 1.3 Not runtimes

- **Odysseus** (PewDiePie, May 2026) is an AI workspace (chat, agents, research, email) that sits **on top of** Ollama or cloud APIs. Same layer as media-view's own AI UI; not a replacement for a runtime.
- **A custom runtime** is a good learning project (see Karpathy's *llama2.c*, ~700 lines of C), but not for media-view: matching llama.cpp means CUDA kernels and support for every new architecture. No privacy gain either; llama.cpp makes no connections on its own.

---

## 2. Bundled llama-server

### 2.1 Files

Two zips from the llama.cpp GitHub releases, unzipped into one folder: the **CUDA build** (`llama-server.exe` + DLLs) and the matching **CUDA runtime** (cudart DLLs). No installer, service, model store or update checker.

```
media-view/
└─ runtimes/
   └─ llama.cpp/
      └─ b6xxx/                     ← pinned build number
         ├─ llama-server.exe
         └─ *.dll
%APPDATA%\media-view\models\
   └─ text/
      ├─ gemma-4-12b-Q4_K_M.gguf
      └─ gemma-4-12b-mmproj.gguf    ← vision part, separate file
```

- **Pin one build**; record it in the models manifest. llama.cpp releases almost daily; update deliberately after testing, never automatically.

### 2.2 Lifecycle: one process per model

1. **Start** on a free port chosen by the AI process:
   ```
   llama-server.exe -m gemma-4-12b-Q4_K_M.gguf --mmproj gemma-4-12b-mmproj.gguf
     --host 127.0.0.1 --port 52817 --api-key <random per session> --no-webui
     -ngl 99 -c 16384 -np 1
   ```
   `-ngl 99` all layers on GPU · `-c` context size · `-np 1` one request at a time · `--mmproj` vision.
2. **Wait** for `GET /health` to report ready (model loading from disk).
3. **Generate** with `POST /v1/chat/completions`, `stream: true`; tokens forwarded to the UI over `/api/events`.
4. **Unload** by stopping the process. Guarantees VRAM is freed before an image model loads.

**Later option: router mode.** `llama-server` started without a model can load/unload/switch models over HTTP (`--models-dir`, `--models-max`, `--no-models-autoload`, `/models/load`, `/models/unload`). Saves the ~1 s process restart; not needed while models swap rarely.

### 2.3 Features used

- **Vision:** images sent as base64 data URLs in the chat message (standard OpenAI format).
- **Structured output:** responses constrained to a JSON schema, e.g. `{"tags": [...]}` for tag suggestions.
- **Separate reasoning:** thinking returned in its own field (`reasoning_content`) → AI traces (`future-features.md` §8).
- **MoE offload:** `--n-cpu-moe N` keeps expert weights of N layers in RAM. Makes Gemma 4 26B A4B usable on 12 GB.
- **Sampling:** `top_k`, `min_p`, `repeat_penalty` accepted in the same request; tune for prose quality.

### 2.4 Security and housekeeping

- `--host 127.0.0.1` — unreachable from the network.
- `--api-key`, random per session — other local programs can't use it even if they find the port.
- `--no-webui` — no built-in chat page.
- **Never use `-hf` download flags.** Models arrive through the separate download step; the firewall rule on `llama-server.exe` enforces it.
- **Orphans:** write the PID to a file on start; on next startup, kill any leftover process from that file (a crashed media-view would otherwise leave VRAM held).

### 2.5 Engine adapter

The AI process talks to runtimes through one interface (*generate text*, *describe image*, …) with one implementation per runtime:

- **Ollama adapter** — development, before and during GPU arrival.
- **llama-server adapter** — shipped version.

Both expose the OpenAI-style chat endpoint, so the adapters are nearly identical:

```js
const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
  body: JSON.stringify({ model, messages, stream: true }),
});
```

### 2.6 Image models (open)

No mature Node option. Candidates:

- **Python worker with `diffusers`** — supports everything; heavy to package offline (Python + PyTorch, several GB).
- **stable-diffusion.cpp** — single native executable; check support for the chosen models (SDXL, FLUX.2 klein, Z-Image).

Avoid ComfyUI-style apps as backends: update checks, plugin managers, and reported telemetry that ignored its off switch.

---

## 3. Real people as references

### 3.1 Rule

An image showing a real person can't be used as a generation reference unless a consent record (§4) covers **every** person in it. Fail closed: when unsure, block.

A tag alone (`real_photo`) isn't enough: it depends on someone remembering it, and misses new Inbox imports, crops, copies and screenshots. Might be used during tests, though.

### 3.2 Layered checks

1. **Detection at use time**, by the AI process, on the actual pixels sent (not the DB record):
   - **Person present?** Person/body detection, not only faces — faceless body shots are real people too.
   - **Photograph or photorealistic?** Photo-vs-illustration classifier.
   - Both yes, or uncertain → blocked (unless §4 applies).
2. **Tags only tighten.** `real_photo` forces a block (e.g. a realistic painting of a real person). No tag can lift a block.
3. **Blocks are inherited** by anything derived from a blocked image (crops, edits, generations), via the provenance flag.
4. **Outputs are checked.** A generated face matching any real person known in the library is discarded, unless that person's consent covers it.
5. **Face-identity adapters** (InstantID, PuLID, IP-Adapter FaceID). They generate a specific person from a face by design; Needs explicit consent.

Default scope: the block applies to **all** generation, not only NSFW. Non-sexual deepfakes cause harm too.

### 3.3 Face recognition and descriptions

- **Face recognition** stays a local tool for finding and tagging people. Face data lives in the library DB, is deleted when the feature is turned off, and never feeds generation.
- **Descriptions** of nude photos work locally. With NSFW off, skip those images or write a non-explicit description, so explicit text doesn't sit in the DB.
- **"Similar from description"** on a real photo: strip real-person names (*Model* tags, linked profiles) from the prompt.

---

## 4. Consent

### 4.1 Consent records

media-view can't verify consent; it records it. Records are explicit, narrow and revocable.

- **One record per person**, attached to their *Model* tag or profile. Default: no record = no consent.
- **Fields:** person, scope (below), date given, optional expiry, signed form attached, status (active / revoked + date).
- **Scope** (each a separate checkbox):
  - Reference for SFW generation
  - Reference for NSFW generation
  - Face recognition (biometric data)
  - AI descriptions of their photos
- **Every person must be covered.** Each detected face must match a person whose record covers the requested use. One unknown face blocks. Faceless body shots can't be matched → stay blocked.
- **Active only with a signed form attached** (§4.2). Deliberate friction.
- **Revocation is one click:** blocks further use immediately, and lists everything generated from that person's photos for deletion.
- **Own profile:** consenting to your own likeness is a setting; no form needed.

### 4.2 Consent form generation

The app generates a standard consent form from the record, fully offline.

1. User fills in the record (person, scope, expiry) in the app.
2. **Generate form** → HTML template filled with the record's data → PDF (Electron `printToPDF`, or the browser's print dialog in the web version). The form carries the **record ID**.
3. Print, sign (both parties), keep one copy each.
4. **Attach** a scan or photo of the signed form → record becomes **active**.
5. Signed forms are stored in `.mediaview/consent/` inside the library. They contain personal data (names, ID numbers): same privacy rules as the rest of the library (`future-features.md` §9; encrypted storage recommended).

- Template text in **Appendix A**. Needs a **pt-BR version** for people in Brazil, and both should be **reviewed by a lawyer** before real use.
- Template written with LGPD's consent principles in mind: free, informed, specific purposes, separate highlighted consent for biometric data, revocable at any time.

### 4.3 Real-world notes

- Existing model releases almost certainly don't cover AI generation. New written consent is needed, explicit about AI use, NSFW, and what may be done with results.
- Not legal advice; for anything beyond personal use, have a lawyer review the form.

---

## 5. Testing

### 5.1 Test build

- **Test-build-only options** (can't ship enabled): quarantine folder, verbose AI traces.
- **Separate test library** for test photos — never a real library. Deleting everything after testing is one folder.
- **Quarantine folder** for blocked outputs (real-person and NSFW-off blocks only):
  - Outside any library; inside a **VeraCrypt container** (a normal delete leaves recoverable data, and overwriting doesn't work reliably on SSDs).
  - **Automatic expiry in hours**; review the same day.
  - Reviewed **only inside the app** (opening it in Windows Explorer copies previews into Explorer's thumbnail cache).

### 5.2 The minors block

- **Nothing is ever kept.** If it fires on an output, the image is discarded immediately: never written to disk, never reviewed. Possession is illegal in Brazil and most countries, temporary or not.
- **Never tested by trying to generate the content.** Tested in pieces instead:
  - Each detector separately on legal content (apparent-age check on ordinary non-sexual images; sexual-content check on adult content).
  - The combining logic with **unit tests** on detector scores.
  - **Metadata-only trace logs** confirm which rule fired and the scores, with no content.

### 5.3 Test people

- Own photos, Rubio's (friend who's a photographer) and their two models who showed interest in the feature. 
- **Written consent before testing,** covering the testing itself: photos used as references, some outputs blocked and kept briefly in quarantine, everything deleted afterwards. Withdrawing means their photos and all derived outputs are deleted.
- Until consent records exist in the build, their photos are blocked by design — useful for testing the real-person block. Consented generation is tested after §4.1 is implemented.

---

## 6. Open points

- Image runtime: Python `diffusers` worker vs stable-diffusion.cpp (§2.6).
- Choice of person detector and photo-vs-illustration classifier (§3.2).
- Quarantine expiry exact value (hours).
- pt-BR consent form and legal review.
- Where signed forms live if the library travels (encrypt `.mediaview/consent/` separately?).

---

## Appendix A — Consent form template (draft)

> Draft for discussion. Not legal advice. Translate to pt-BR and have a lawyer review before use. `{…}` fields are filled by the app.

---

**CONSENT TO USE OF IMAGE AND LIKENESS IN LOCAL AI GENERATION**

Record ID: `{record_id}` · Generated: `{date}`

**1. Parties**

Person depicted ("I"): `{full_name}` · ID document: `{id_number}`

User of media-view ("the User"): `{user_name}` · ID document: `{user_id_number}`

**2. Age**

[ ] I declare I am 18 years of age or older.

**3. Images covered**

`{description_of_images}` (e.g. photo session of `{session_date}`), stored in the User's media-view library on the User's own computer.

**4. What I allow** (mark each one separately)

[ ] My images may be used as references to generate **non-sexual** images with AI.

[ ] My images may be used as references to generate images **including nudity or sexual content** with AI.

[ ] AI may write **text descriptions** of my images.

**[ ] BIOMETRIC DATA — My face may be analyzed by face recognition to identify me in the User's library. I understand this creates data about my facial features.**

**5. How it is done**

All processing happens **locally on the User's computer**, with no upload to any online service. Generated images are marked as AI-generated.

**6. Use of results**

[ ] Generated images remain **private** to the User.

[ ] Generated images may be **shared with me**.

[ ] Generated images may be **published or shared with others** — only with my separate, specific approval for each publication.

**7. Duration**

This consent is valid until `{expiry_date | "I withdraw it"}`.

**8. Withdrawal**

I may withdraw this consent at any time, without giving a reason, by informing the User `{contact_method}`. On withdrawal, the User will stop all use immediately and delete images generated from my photos, and the face data mentioned in item 4.

**9. Testing period** *(test builds only)*

[ ] I understand that during testing, some generated images may be blocked by the app's safety checks and kept for up to `{hours}` hours for review, then permanently deleted.

**10. Signatures**

Place and date: `{place}`, `{date}`

_______________________________ Person depicted

_______________________________ User

*One copy for each party.*
