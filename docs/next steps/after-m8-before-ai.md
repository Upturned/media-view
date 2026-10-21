## Is milestone 8 done?

There's one formal item left: **the performance pass on your ~10k library.** `docs/technical/images.md` §18 still lists it under "to do", and everything else on the M8 list is built. Its targets (scan time, how fast a big album opens, search speed) were never set. The plan was to measure first and set them afterwards.

Smaller leftovers that are polish, not blockers:
- **Keyboard keys still missing from the design board:** ↑ ↓ and Space in the index sidebar, ← → along the top bar, and ↑ ↓ in dialog lists. Tab covers these for now.
- **The browser's own right-click menu** still shows on the top bar, Settings, Health, the Tags page background and so on. You said those can wait.
- **Tag merge:** the dialog doesn't warn you when both tags are linked to a profile. The target's link is kept without saying so.

## Code and bug review

Tests (173) and type checks pass. I reviewed the profiles commit and the M8 adjustments commit. Profiles look solid: passwords are hashed properly, stars are per profile everywhere, a star from anyone protects an image from recycling, and the locked state blocks what it should. I found four real problems:

1. **Bulk rename can leave files with temporary names** (`server/src/services/file-ops.ts:276`). The first step renames every file to `~mv-rename-<id>`. If Windows refuses partway (an Explorer preview, another program with the file open), the earlier files keep their temporary names on disk and the database still has the old ones. Health then reports them as moved outside the app. This could already happen before, but the new retry helper turns a busy file into an ordinary, expected error, so it's now more likely. The fix is to rename those files back when this happens. The second step (`:283`) should also use the retry.
2. **A move that hits a busy file stops partway** (`file-ops.ts:138`). Moving 10 images where the 5th is open in another program: 4 move, you get an error, and you lose the *Undo* for those 4. The grid doesn't refresh either, because the refresh is only sent after the whole loop finishes. The busy file should be listed as skipped and the move should carry on.
3. **Merging duplicates doesn't move a profile picture** (`server/src/services/health.ts:1060`). Collection and tag covers move to the kept copy, but `profiles.picture_file_id` doesn't. A profile whose picture was the recycled copy falls back to its initials.
4. **The one-time import of browser preferences can fail** (`server/src/routes/profiles.ts:67`). Builds before M8 saved `grid.group` as `true`/`false`. The server only accepts the newer text values, so the whole import is rejected. The app then shows an error on every load and the profile never gets its settings. This doesn't affect your browser, because M8 already rewrote that setting. It would hit anyone upgrading straight from an M7 zip. The fix is to convert the old value with `groupPref()` in `browserPrefs()`, or to drop bad values on the server one by one.

**Working as designed, mentioned so it isn't a surprise:** while the app is locked, `/media/*` still serves images and anyone can create a new profile from the picker. That matches profiles.md §1.1 ("a gate, not a vault").

## Recommended next step

1. **Fix the four findings.** They're all small: roughly an hour, with tests.
2. **Do the M8 performance pass if the 10k library is ready.** The AI phase 1 spike can run on the same library copy at the same time. The spike is ai.md §9 step 0: a script outside the app that times the models on the CPU and tests how well they recognise your Character tags. It touches no app code.
3. **Before building any AI in the app, answer ai.md §12 points 1–6.** Those are the phase 1 decisions: scope, adding models by hand, AI per library and off by default, existing tags only, shared rejections, the models folder. Points 7–11 can wait until phase 2 or 3.
4. **Optionally, the safe-for-work view** (ai.md §11.3 / profiles.md §8). It needs no AI and builds on profiles, so it could fill time while the spike runs.

If the 10k library isn't ready yet, go straight to the spike and the §12 decisions, and do the performance pass when it is. The keyboard and right-click leftovers can wait for your testers.

Should I start with the four fixes?