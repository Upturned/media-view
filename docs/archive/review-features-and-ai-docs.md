# Review — future features and AI runtime/consent docs

> **Status:** review notes, 2026-10-11 · **Covers:** `Media View features and suggestions.md` ("features doc"), `Ai-features-runtime-and-consent.md` ("consent doc"), `future-features-ai-and-downloader.md` ("future-features", referenced elsewhere as `future-features.md`)
>
> Contradictions between the three docs are in §6.

---

## 1. Overall

The direction is coherent: the original idea (tags linking stories, drawings and other media) is what most new features grow from. The AI runtime/consent doc is the strongest piece and is careful where it matters. The main issues are **sequencing** and a couple of **contradictions between the docs**.

---

## 2. Features doc

### 2.1 Local users / profiles

Good idea, and more load-bearing than it looks: the consent doc attaches consent records to "their *Model* tag or profile", so this entity is a shared prerequisite. Note that future-features §2 already designs this as single-user profiles **without passwords**; see §6.1.

- **Password (if kept):** don't invent encryption, and don't store plaintext even while testing. What's needed is **hashing**, not encryption. Node's built-in `crypto.scrypt` does it in one call; same effort as plaintext.
- Be honest in the UI that it's a **UI gate**: anyone with the library DB file can read its contents.

### 2.2 Collections with purposes

Best product idea in the doc; fits because collections already exist.

- **Comic booklet:** right first purpose. Mostly print CSS (`@page`, two pages per A4 sheet), no AI or new backend. Decide early on page order:
  - **Nested sheets folded together (saddle-stitch):** needs imposition and duplex printing (8 pages → sheet 1 front = 8|1, back = 2|7).
  - **Each sheet folded separately and stacked:** simpler order, binds differently.
  - Small code either way, but easy to get wrong if not decided up front.
- **Photo montage:** effectively a canvas editor (drag, resize, rotate, export). Much bigger than the comic; its own milestone.
- **Magazine:** depends on the text module, which doesn't exist yet. Park it explicitly.

### 2.3 Build profiles (testing / complete / normal)

Useful, and the AI doc needs them: test-only options (quarantine, verbose traces) "can't ship enabled". The build profile is the enforcement: make those options **fail to build** outside `testing`, not just default to off. `complete` means bundling runtimes and models: many GB.

---

## 3. AI features (features doc)

| Feature | Verdict |
|---|---|
| VLM descriptions → tag suggestions → search | **Start here.** Highest leverage, lowest risk |
| Medium LLMs for stories / descriptions | Second. Matches the app's original purpose |
| Tiny LMs for minigames | Low value for the cost. Cut or defer |
| Image generation | Last. Heaviest, and where all the safety complexity lives |

### 3.1 Contradiction: "no restrictions, warn but don't limit"

The consent doc has **hard blocks** (non-consented real people, minors), correctly. Proposed policy wording:

- **Open:** adult and fictional themes.
- **Hard block:** real people without consent; anything involving minors.
- **Warn:** everything else.

With uncensored models, the app's guard is the only line, so it can't be advisory for the hard-block categories.

---

## 4. AI runtime and consent doc

### 4.1 What's right

- `llama-server` pinned to one build, `127.0.0.1`, per-session API key, orphan-PID cleanup, engine adapter.
- Check the actual pixels, not tags; fail closed; tags only tighten.
- Blocks inherited by derived images.
- Minors block tested in pieces, never by generating the content.

### 4.2 Pushback and additions

1. **Minors block must cover illustrations, not only photos.** Brazil's ECA (art. 241-C) covers simulated and altered depictions, and this app is heavily about drawings and characters. Apparent-age detectors are weak on anime and illustrated styles. Add a cheap **prompt-side check** before generation alongside the output check, and keep thresholds conservative.
2. **Face matching can unlock as well as block.** "Every face must match a consented person" means a false match on someone who hasn't consented *unlocks* generation. Tune the match threshold strictly for that direction, even if it causes more false blocks.
3. **Question the quarantine.** VeraCrypt, automatic expiry and avoiding Explorer's thumbnail cache add a lot of machinery. Metadata-only logs (detector scores, seed, prompt) are probably enough to debug detectors. Start with "discard everything blocked", as the minors block already does; add quarantine only if debugging actually needs it.
4. **Contradiction on descriptions.** §4.1 has a consent scope for "AI descriptions of their photos", but §3.3 lets descriptions run locally without one. Decide whether descriptions are gated. If they are, the first AI feature (§3 above) already depends on consent records.
5. **ID numbers on the form.** Every field collected is sensitive data stored in the library. For personal use, consider whether the form needs them.
6. **Electron `printToPDF`:** Electron is planned (future-features §2 mentions `userData`) but not in the app yet. Keep the browser print path as the working option until it lands.
7. **Unbuilt prerequisite: provenance.** Revocation ("list everything generated from that person") and block inheritance both need a **provenance link** between images that doesn't exist yet. Future-features §3.3 plans a "generated" **flag**, which isn't enough: inheritance needs to know *which* source images an output came from. The AI trace already records references (future-features §8.1), so store that link in the DB too, from day one, alongside the flag. Plan it as its own item.

---

## 5. Suggested order (after M8 and testing)

1. Profiles/users (needed for "by me" and for consent records)
2. Comic-purpose collections (pure web, quick win)
3. AI runtime + VLM descriptions and tag suggestions (resolve §4.2 point 4 first)
4. Provenance tracking + consent records
5. Story / text generation
6. Image generation, with the full safety stack

---

## 6. Contradictions between the three docs

Ordered by how much they affect the design.

### 6.1 Missing: future-features §7.3 (hard limits)

§7 says "**Three tiers**" but only §7.1 (NSFW off) and §7.2 (NSFW on) exist. The consent doc says it refines "§7.3: real people are blocked as references", and §8.3 refers to "a hard-limit block". The hard-limits tier (minors, non-consented real people) is the most important one and isn't written down anywhere. **Write §7.3** (the three-tier policy in §3.1 of this review fits there).

### 6.2 NSFW policy

| Doc | Says |
|---|---|
| Features doc | Models should have no restrictions at all; warn, but don't limit |
| Future-features §7.1 | **Default NSFW off**, enforced by request and output checks (blocking) |
| Future-features §7.2 | NSFW on is opt-in with adult confirmation; warnings only |
| Consent doc §3–§5 | Hard blocks (real people, minors) regardless of setting |
| Future-features §5.1 | Default text model is Gemma 4, which "ships with safety tuning and may refuse some fiction" |

Future-features + consent doc are consistent with each other; the features doc is the outlier. Suggested resolution: the features doc's "no restrictions" applies **only to NSFW on** and **never to hard limits**. Separately, decide whether the default text model should be Gemma (refuses some fiction) or a less restrictive fine-tune, since the features doc ranks "no theme restrictions" right after quality.

### 6.3 Profiles: users with passwords vs single-user profiles

- Features doc: users register, select a local user, optional password, encryption for the shipped version.
- Future-features §2: **single-user**, "profile" rather than "register/account", **no passwords**, unless several people sharing one computer becomes a goal.

The features doc implies that goal has arrived. Pick one. If multi-user: hash passwords (§2.1 of this review), and decide what a password actually protects, since profile links live in each library's DB, which any user can open.

### 6.4 Blocked content: never kept vs quarantined

- Future-features §8.3: a hard-limit block logs that it happened, "**never the blocked content**".
- Consent doc §5.1: test builds keep real-person blocks (which are hard limits per §6.1) in a quarantine folder for review.

This contradicts §8.3 directly. Either narrow §8.3 to "never in shipped builds; test builds may quarantine real-person blocks with the test subjects' consent", or drop the quarantine (§4.2 point 3 of this review). The minors block is never quarantined in either doc, which is consistent.

### 6.5 Verbose traces: user setting vs test-only

- Future-features §8.3: trace level *off / metadata only / **full***, as a normal Settings option (default metadata only).
- Consent doc §5.1: "verbose AI traces" are a **test-build-only option** that can't ship enabled.

Clarify whether "verbose" (test-only) is something beyond "full" (e.g. per-step detector internals). If they're the same thing, one doc is wrong.

### 6.6 Face recognition and consent

- Future-features §3.2 / §5.3: face recognition for real people (models, the user) is a light, normal feature; no mention of consent.
- Consent doc §3.3: face recognition "stays a local tool for finding and tagging people", also without consent.
- Consent doc §4.1: face recognition (biometric data) is a **consent scope**, and the form has a highlighted biometric checkbox.

The consent doc contradicts itself, and future-features follows §3.3. Decide whether recognizing a model's face requires their consent record. If yes, real-person recognition moves behind consent records in the build order; drawn-character recognition (embeddings) doesn't need it and can still go early.

### 6.7 "Similar images": from description or from the image

- Features doc: "generating similar images from a image's description".
- Future-features §3.2: generate **image-to-image**, not from the description ("a description loses most of what made the picture distinctive").
- Consent doc §3.3: a "Similar from description" feature on real photos, with name stripping.

Future-features' reasoning is right for quality. Note that image-to-image on a real photo **is** reference use, so the real-person block (consent doc §3.1) applies fully. The description route is the only one that might run on a non-consented photo, which is presumably why the consent doc mentions it. Decide whether both modes exist.

### 6.8 Firewall rule target

- Future-features §9.3: firewall blocks "the AI process executable".
- Consent doc §2.4: firewall rule on `llama-server.exe`; §1.2: block `ollama.exe` during development.

The AI process (Node) and `llama-server.exe` (and the image runtime, and Ollama in development) are **separate executables**. Each needs its own rule. Also, Ollama's automatic update checks (consent doc §1.2) break future-features §9's "the only network traffic is the downloader's" during development. Fine if acknowledged; worth a line in §9.2's runtime table.

### 6.9 Image descriptions on CPU

- Future-features §3.1: descriptions run on a normal CPU in "**seconds** per image", weight Light.
- Future-features §6.1: image description on CPU is **30–60 s** per image.

Internal inconsistency; §6.1 is the more realistic figure (VLM descriptions on CPU), so §3.1 should say "~1 min per image" and probably "Medium".

### 6.10 Distribution and licensing

- Features doc: not officially distributed; used by the creator and close friends.
- Future-features §5.4: licensing "only matters if media-view is distributed"; InsightFace pretrained models are non-commercial.
- Features doc build profile `complete`: packages everything, no downloads on the target machine.

Giving a build to friends is distribution, and `complete` means **bundling** models, which is exactly where licenses apply. Non-commercial models are fine for free sharing among friends, but check each model's license allows redistribution before putting it in a `complete` build (some only allow download from the original source).

### 6.11 Minor

- **Build profiles vs model download:** future-features §3.1 says models are an optional download on first enable; the `complete` profile skips it. Not a contradiction; just note in §3.1 that `complete` builds ship models preinstalled.
- **Image runtime:** future-features §9.2 lists Hugging Face libraries (`HF_HUB_OFFLINE=1`), implying the Python `diffusers` route that consent doc §2.6 still lists as open. Fine while the choice is open; remove whichever loses.
