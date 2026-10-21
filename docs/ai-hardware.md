# media-view — AI Hardware Tiers

> **Status:** reference, 2026-10-17 · **Related:** `ai.md` (features A1–A13, runtime §4, models §5, checks §11.1) · `text-writer.md` (writer models §9, context §5)
>
> What each kind of machine can run, and which models fit. The numbers are **orders of magnitude**: they vary with resolution, quantization and software, and are measured in the spikes (`ai.md` §9, `text-writer.md` §11). The model lists reflect what was available up to mid-2026; check for newer versions of the same families before each spike. Translated and revised from the Portuguese draft (*Faixas de hardware para as features de IA*).

---

## 1. What decides speed

Most of `ai.md` is light and runs the same on any machine. The tiers differ in three groups:

- **Descriptions** — A6 (vision language model).
- **Text** — the Text-Writer's modes (A8) and the *From a passage* prompt (A13, A11).
- **Images** — text to image (A13) and generating similar images (A12).

Three rules explain the tables below:

- **Writing text** is limited by **memory bandwidth**: every word reads the model's active weights once.
- **Drawing images and reading a prompt** (prefill) are limited by **compute**.
- **VRAM capacity** decides what fits. A model that doesn't fit spills into system RAM and runs 5–10× slower.

**Prefill matters most on the CPU.** Reading the prompt before the first word is compute-bound, so on the CPU a ~12,000-token writer context takes a few minutes from scratch. The Text-Writer stays usable there only because `llama-server` caches the unchanged start of the context (`text-writer.md` §5). The times below exclude loading and prefill unless they say otherwise.

---

## 2. The same on every tier

| Feature | Models | Runs in | Notes |
|---|---|---|---|
| A1 tag suggestions | WD v3 (`vit`, `swinv2`, `eva02-large`) | ONNX | The reference for anime art |
| A2–A4 embeddings | SigLIP 2 (base, 768 numbers; or so400m, 1152, slower), or the tagger's own features | ONNX | The phase 1 spike picks one; so400m's larger vectors change `ai.md` §6.2 |
| A5 search by meaning | SigLIP 2's text tower | ONNX | Comes with A2 if SigLIP is chosen |
| A7 faces | InsightFace `buffalo_l` (non-commercial) or YuNet + SFace (OpenCV Zoo, permissive) | ONNX | YuNet + SFace are plain ONNX files: no OpenCV library needed, and no licence problem |
| Hard-limit checks (`ai.md` §11.1) | The tagger's rating labels + a small NSFW image classifier + face detection with age estimation; for text, a small guard model | ONNX; `llama-server` for the guard | Light; the output checks run on every tier |

**First indexing of 10,000 images:** hours on the CPU, minutes with a GPU. Done once.

---

## 3. Tier 3 — Minimum (CPU only, Ryzen 5 5600G)

The author's machine today.

**Hardware**

- **RAM: 32 GB required.** With 16 GB the best text model doesn't fit.
- **Memory:** DDR4 3200–3600, dual channel. For text, RAM speed matters more than the CPU.
- **Use:** one heavy model loaded at a time.

**Limit:** each generation (not counting loading and prefill) should stay under ~10 minutes.

| Feature | Choice | Estimated time |
|---|---|---|
| A6 | Qwen3-VL-4B or 2B, or Qwen3-VL-30B-A3B | ~1–2 min per image (matches `ai.md` §11.7) |
| Text | **Qwen3-30B-A3B Q4** (~18 GB) | ~10–15 tok/s. Best speed: MoE runs well on the CPU. Safety-tuned: test refusals of adult scenes; a community fine-tune may be needed |
| Text | Mistral Nemo 12B Q4 | ~5 tok/s; few refusals |
| Text | Dense models of 24B+ | ~2–3 tok/s. Long stories go past the limit |
| A13 | **SDXL / Illustrious + a distillation LoRA (DMD2, Lightning or Hyper), 4–8 steps** | ~2–6 min at 1024 px |
| A13 | The same model with 25–30 normal steps | Probably over 10 min |
| A13 | Z-Image-Turbo, Flux schnell | Borderline; measure |
| A13 | Flux dev, Qwen-Image | Not viable |
| A12 | Distilled SDXL img2img | Faster than A13 (runs only part of the steps) |
| A12 | Kontext / Qwen-Image-Edit | Not viable |

**Notes**

- **Image runtime (`ai.md` §12.8):** the CPU tier leans to **stable-diffusion.cpp**, which runs well on the CPU and uses GGUF.
- **Vega 7 iGPU:** worth testing through the Vulkan backend. Drawing images is compute-bound, and the iGPU may beat the 6 cores. Not guaranteed; the test is cheap.
- **Indexing and text compete** for the same cores and memory bandwidth, so indexing pauses while a writer request runs (`text-writer.md` §6).

**Changing the CPU**

| Option | Effect on text | Effect on images | Note |
|---|---|---|---|
| Another AM4 CPU | Almost none (limited by DDR4) | 5900X / 5950X: ~2–2.5× faster, room under the 10-minute limit | No integrated graphics: needs a graphics card for display |
| Zen 4/5 (AM5) with DDR5 | Large: ~2× the bandwidth | Large: AVX-512 | Means a new platform |

---

## 4. Tier 2 — Value (RTX 3060 12 GB)

The author's machine once the GPU arrives.

**Hardware**

- **GPU:** RTX 3060 12 GB.
- **RAM:** 32 GB works. **64 GB** would keep more models in the file cache for fast swaps and leave room for MoE models with their experts on the CPU. A purchase decision, not a requirement.
- **Platform:** on the 5600G the card runs at PCIe 3.0 x16. That's enough; moving a model from RAM to VRAM takes about 1 s per GB.

| Task | Time |
|---|---|
| SDXL / Illustrious, 1024 px, ~25 steps | 15–25 s |
| Flux dev, quantized | ~1–2 min |
| Qwen-Image Q4 | a few minutes |
| Description (A6) | ~5–15 s per image |
| Text (models that fit) | 20–40 tok/s |

**Models**

| Use | Recommendation |
|---|---|
| A6 descriptions | Qwen3-VL-8B, JoyCaption Beta One (describes adult content without refusing), Gemma 3 12B |
| Text | Qwen3-30B-A3B (experts on the CPU, ~20 tok/s), Mistral Small 3.2 24B (Q4, partly in RAM), Mistral Nemo 12B and its creative-writing variants (fit whole) |
| A13 images | Illustrious XL / NoobAI-XL (anime), realistic SDXL fine-tunes, Z-Image-Turbo, Flux.1 dev in fp8/GGUF |
| A12 similar | FLUX.1 Kontext dev (GGUF), Qwen-Image-Edit (Q4, slow), SDXL img2img |

**Limits and notes**

- **One heavy model at a time** in VRAM (`ai.md` §4). "The language model writes the prompt → the image model draws it" becomes a swap between the two, which the separate processes already allow.
- No feature is left out.
- For adult scenes in the Text-Writer, the Mistral family and community variants refuse much less than safety-tuned models such as gpt-oss or stock Qwen3.

---

## 5. Tier 1 — Best case (no budget)

For reference only: nobody using media-view has this hardware, and the app won't ship models this large. An RTX PRO 6000 Blackwell (96 GB) or one or two RTX 5090s (32 GB), a Threadripper PRO or EPYC with 256 GB+ of RAM. Descriptions in 1–3 s, text at 30+ tok/s even with very large MoE models, SDXL in 2–5 s, Flux in 10–20 s. The best anime models are still SDXL derivatives, which are small, so this tier mostly buys speed, batches, high resolution and larger text models, not better anime images.

---

## 6. Runtimes and licences

**Which runtime runs what.** The app has three runtimes (`ai.md` §4): onnxruntime (phase 1 models, faces, image checks), `llama-server` (text, descriptions, the guard model) and one image runtime (open, `ai.md` §12.8).

- Text models run in `llama-server` as GGUF. Vision models (Qwen3-VL, Gemma 3, JoyCaption) need llama.cpp's multimodal support for that specific model: confirm per model in the phase 2 spike.
- Image models all run in Python `diffusers`. stable-diffusion.cpp covers SDXL and Flux; support for the newer ones (Qwen-Image, Z-Image, FLUX.2, the editing models) must be confirmed when the runtime is chosen.

**Licences** matter only for what friends' builds get, and only when a `complete` build bundles the files (`ai.md` §11.7). Generation models stay with the author and aren't listed. To confirm before any `complete` build:

| Model | Licence (believed) |
|---|---|
| WD v3 taggers | Apache 2.0 |
| SigLIP 2 | Apache 2.0 |
| YuNet, SFace | OpenCV Zoo, permissive |
| InsightFace `buffalo_l` | Non-commercial |
| Qwen3, Qwen3-VL, Qwen3Guard | Apache 2.0 |
| Mistral Nemo 12B, Mistral Small 3.2 | Apache 2.0; community fine-tunes vary |
| Gemma 3, ShieldGemma | Gemma terms |
| JoyCaption, Llama Guard | Llama community licence |

---

## 7. Summary

| | Tier 3 (CPU) | Tier 2 (3060 12 GB) | Tier 1 (top) |
|---|---|---|---|
| A1–A5, A7 | OK (indexing in hours) | OK (minutes) | OK (minutes) |
| A6 descriptions | 1–2 min | 5–15 s | 1–3 s |
| Text | 10–15 tok/s (MoE), needs the cache | 20–40 tok/s | 30+ tok/s, very large models |
| A13 images | 2–6 min (distilled SDXL) | 15–25 s (SDXL), 1–2 min (Flux) | 2–40 s, any model |
| A12 similar | SDXL img2img only | Quantized Kontext / Qwen-Edit | Everything, full precision |
| Every feature? | Yes, with distilled and MoE models | Yes, without real waits | Yes |
