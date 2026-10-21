# Next steps: the `jedi` and `ai` branches

> Written 2026-10-19, after milestone 8 and the four review fixes (`after-m8-before-ai.md`). Splits the work into two lines: `jedi` carries the app without AI and stays public; `ai` builds the AI features (`ai.md`) and lives in a private repo. Each line gets its own folder through a git worktree.

---

## 1. Where things stand

- **Milestone 8 is done.** The performance pass ran on a ~12k-file library (~10k images, ~2k videos, texts and unsupported files): about 50 s for the first scan, 20–40 s for a rescan after big changes made outside the app, less for small fixes (duplicates, images out of place). Rescans skip files whose size and modified time haven't changed (`reconcile.ts`), so the time goes to hashing new and moved files. These numbers become the baseline in `images.md` §18.
- **The four review fixes are in the code**, still to be tested: bulk rename restoring the temporary names, a move that skips a busy file and carries on, profile pictures moving when duplicates merge, and the browser-preferences import accepting old `grid.group` values.
- **Polish left for testers:** keyboard keys missing from the design board, the browser's right-click menu on the remaining pages, and the tag-merge warning for tags linked to a profile.

---

## 2. The two lines

| | `jedi` | `ai` |
|---|---|---|
| What | The app without AI: fixes, polish, next module (Videos and Audio, or Texts) | AI phase 1 onwards (`ai.md` §9) |
| GitHub | `origin`, public, as today | A second, private repo (§5) |
| Folder | `media-view/` (this one) | `media-view-ai/`, a worktree (§3) |
| Migrations | Starts at **009** | Owns **008** (`ai.md` §6) |
| Library | Your real library | A copy (§4) |
| Ports (dev) | Server 4321, web 2080 | Server 4322, web 2081 |

**Direction of merges:** `jedi` → `ai`, often (every few commits on `jedi`, or at least after each feature). `ai` → `jedi` only once, when phase 1 is done and tested, and only if the AI part becomes public by then; otherwise the merge stays in the private repo (§5.3).

**Migration numbers:** 008 is reserved for AI. Anything on `jedi` that needs a migration (the safe-for-work view, a new module) takes 009, 010 and so on. Migrations run in number order on top of `PRAGMA user_version` (`migrate.ts`). A library that has run 009 without 008 would skip 008 later, so **a `jedi` migration that lands before the AI merge must not be run on a library the merged build will open**, or 008 must be merged first. The simplest way to stay safe: keep `jedi` migration-free until the AI merge, or merge 008 into `jedi` as soon as it is final (it's only tables, and harmless with AI off).

---

## 3. Git worktree

A worktree is a second folder linked to the same repository, with another branch checked out. Both folders share one history: a commit made in either one shows up in the other at once, with no push or pull. Each can be open in its own VS Code window, and both apps can run at the same time. One rule: a branch can be checked out in only one worktree at a time.

```sh
# from media-view/, after jedi has the fixes (§6 step 1)
git fetch origin
git branch ai origin/jedi
git worktree add ../media-view-ai ai
cd ../media-view-ai
npm install                 # node_modules isn't shared between worktrees
```

Day to day:

```sh
# bring jedi's work into ai (from media-view-ai/)
git fetch origin
git merge origin/jedi

# list or remove worktrees (the branch and its commits stay)
git worktree list
git worktree remove ../media-view-ai
```

Files ignored by git (`node_modules/`, `dist/`, `release/`, `testing/`) are per folder: each worktree builds and installs its own.

---

## 4. Running both side by side

### 4.1 What each part of the app keeps, and where

| Data | Where | Shared if nothing changes? |
|---|---|---|
| Library database, thumbnails, recycle bin, library logs | `<library>/.mediaview/` | Yes, if both open the same library |
| App config: last library, recent libraries, last profile per library, port, theme | `%APPDATA%\media-view\config.json` | Yes |
| App logs (no library open) | `%APPDATA%\media-view\logs\` | Yes |
| Browser storage (window layout, drafts) | Per origin, so per port | No, once the ports differ |
| Models (`ai.md` §5.3) | `modelsDir` in the config | AI only |

### 4.2 What to separate

1. **Port.** Already planned. Server on 4322, set with `PORT`.
2. **App data folder.** Set `MEDIA_VIEW_APPDATA` to a folder of its own (for example `E:\media-view-ai-data`). Otherwise both builds rewrite the same `config.json`: each one's last library and recent list overwrite the other's, and the AI build's `modelsDir` lands in the normal app's config. The packaged *H* variant already does the same thing (`scripts/package.mjs`: `PORT=2070`, `MEDIA_VIEW_APPDATA=%~dp0data`).
3. **The library: keep a separate copy until the merge.** The database lives inside the library (`.mediaview/library.db`), so a separate app data folder alone doesn't protect it. Sharing one library between the two builds would cause:
   - **Migration 008 runs on it.** The `jedi` build then opens a database whose version it doesn't know. It works for now, but it's the mix-up described in §2 waiting to happen.
   - **Two servers write to one database**, each with its own file watcher. A move or rename made by one is seen by the other as a change made outside the app, so Health and the scan undo each other's work.
   - **AI data (embeddings, suggestions, rejections) builds up** in a library that the normal app can't show or clean up.

   Use the ~12k test library for the AI branch. It's the same library the phase 1 spike runs on (`ai.md` §9 step 0), and it's large enough to show real indexing times.
4. **Web dev port.** *(Done 2026-10-20.)* Vite (`web/vite.config.ts`) and the server's allowed dev origin (`server/src/index.ts`, `DEV_WEB_PORT`) both read `WEB_PORT`, defaulting to 2080, so two dev setups can run at once.
5. **Models folder.** Outside both libraries and outside the repo (models are gigabytes; they must never reach git). Its path goes in the AI build's own config.

### 4.3 Starting the AI build

```bat
rem media-view-ai\dev-ai.bat (or set these in the terminal)
set PORT=4322
set WEB_PORT=2081
set MEDIA_VIEW_APPDATA=E:\media-view-ai-data
npm run dev
```

Then open the library copy from the library picker. The AI build remembers it in its own config, so it reopens it next time.

### 4.4 After the merge

Once phase 1 is merged and tested, the merged build opens your real library and runs migration 008 on it, once. **Back up `<library>\.mediaview\` before that first run.** From then on there is one app, one port, one app data folder; the library copy and the AI data folder can be deleted.

---

## 5. Public app, private AI

### 5.1 Why a second repo

GitHub sets visibility per repository, not per branch: every branch in a public repo is public. So the AI-less version stays in `Upturned/media-view` (public, `jedi`), and the AI work goes to a new private repo. Anyone can still clone the public one; only you, and the collaborators you invite, see the private one.

A GitHub fork doesn't work for this: forks of a public repo are always public. Use a plain new repo and a second remote instead.

### 5.2 Setting it up

1. On GitHub, create **`Upturned/media-view-ai`**, **private**, completely empty (no README, licence or `.gitignore`, so the first push has nothing to merge with).
2. Add it as a second remote and push the `ai` branch there only:

   ```sh
   git remote add private git@github.com:Upturned/media-view-ai.git
   git push -u private ai
   ```

   `-u` makes `private` the branch's default, so a plain `git push` or `git pull` from `media-view-ai/` goes to the private repo.
3. Optional: push `jedi` to the private repo too (`git push private jedi`), so it holds the full picture. That's harmless; the public repo is the one that must never get `ai`.

### 5.3 Rules that keep it private

- **Never `git push origin ai`,** and never `git push --all` or `--mirror` to `origin`. Either one publishes the AI work.
- **Never merge `ai` into `jedi`** while the AI part is meant to stay private. The merge would carry every AI commit into the public repo on the next push. The flow stays one way: `jedi` → `ai`.
- **Pull requests:** `testing` → `jedi` stays on the public repo as today. AI pull requests (if you want them) are opened inside the private repo.
- **Already public:** `docs/ai.md` (commit `aa1efce`) is on `origin/testing`, so the AI *design* is public already. If the new AI docs (`ai-hardware.md`, `text-writer.md`, the `ai.md` revisions, `docs/new stuff/`) should stay private, commit them on `ai`, not on `testing`/`jedi`. If the design can stay public and only the code is private, commit them as planned.

### 5.4 Making the AI part public later

When AI is ready to ship: merge `ai` into `jedi` and push to `origin` as usual. Or make `media-view-ai` public and point people to it. Either way, nothing about the local folders changes.

---

## 6. Order of work

1. **Finish `jedi`.**
   - Test the four fixes; commit them on `testing` with the current docs (see §5.3 on which docs go where).
   - Record the performance baseline in `images.md` §18 and mark milestone 8 done.
   - Pull request `testing` → `jedi`, merge, `git fetch origin`. (The local `jedi` branch is still at the first commit; branch from `origin/jedi`, not `jedi`.)
   - Optionally, the `WEB_PORT` change (§4.2 point 4), so both lines can run in dev at once.
2. **Set up `ai`.** Create the private repo (§5.2), the branch and the worktree (§3), the AI data folder and the library copy (§4).
3. **On `ai`:** the phase 1 spike (`ai.md` §9 step 0), then the §12 decisions 1–6, then phase 1 itself, starting with migration 008.
4. **On `jedi`, in parallel:** the next module (Videos and Audio, or Texts; `images.md` §19), the safe-for-work view if wanted (`ai.md` §11.3; mind the migration rule in §2), and tester feedback. Merge `jedi` into `ai` after each piece.
