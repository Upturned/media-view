# Before milestone 8 — test & decide

A checklist for testing milestones 6 (Collections) and 7 (Library Health) by hand, plus the questions to settle so milestone 8 (Polish) can start with everything decided.

Tick items as you go (`[x]`). When something is off, write a short note under it (what you did, what you expected, what happened) — that's all I need to fix it.

---

## 0. Setup

- [ ] Use a **copy** of a real library, or a fresh test library — Library Health's fixes move and recycle real files.
- [ ] Note your library's state before starting the app: migrations **004** and **005** run on the first start (new columns on images, the Not tracked list, the format counters). Nothing should look different afterwards except that Library Health now has content.
- [ ] For Library Health, make some problems in **Windows Explorer while the app is closed**, then start it (or press *Rescan*):
  - rename or move a folder (→ *Changed outside the app*)
  - move a few images between albums (→ *Changed outside the app*, grouped)
  - delete or move out an image, and delete a whole sub-category with albums in it (→ *Missing*)
  - copy an image into another album (→ *Duplicates*)
  - put an image directly into a category or sub-category (→ *Rule problems · loose images*)
  - create a folder inside an album, with an image in it (→ *Rule problems · folder inside an album*)
  - create new folders under a category, one empty, one with images (→ *Unmarked folders*)
  - drop a `.psd` / `.heic` / `.tif` (→ *Not supported*), a `.zip` (→ *Wrong file types*) and an `.mp4` / `.mp3` / `.txt` (→ moved automatically + a white notice)
  - copy a few new images into an album (→ *Untagged images* with **NEW**)

---

## 1. Milestone 6 — Collections

### Collections page (`Collections` in the top bar, or on the Library page)
- [ ] Top-bar link and the Library page button (with its count) both open it.
- [ ] Empty state looks right with no collections; **+ New collection** works from it.
- [ ] Cards: cover as frame 01, next four frames numbered, `+N` for the rest, name, count, first line of the description, "changed … ago".
- [ ] Sort by name / images / recently changed, ↑↓ flips; the choice is remembered.
- [ ] Name filter highlights the match; "No list by that name" offers *Clear* and *+ New collection “…”*.

### New / Edit collection
- [ ] A name that exists (different capitals, or `_` instead of spaces) shows the red error with *Open it →*.
- [ ] "Searchable as @…" hint matches what the search box accepts.
- [ ] Description counter (500), first line shows on the card.
- [ ] Cover: *First image* by default; *Choose…* disabled while the list is empty; the picker shows only the list's images in order, filter works, double-click uses one; *Use first image instead* works.
- [ ] Removing the chosen cover from the list makes the first image the cover again.

### Collection page
- [ ] Header: cover tag (first image / chosen), counts (images, albums, since last change), description.
- [ ] **Drag to reorder** (I couldn't test this one): one image; a selection dragged together; the accent bar shows where they land; *→ to the end*; the message says the new position and *Undo* restores the old order.
- [ ] Sort by Name or Size: dragging is off, the hint says why, *↺ Collection order* goes back; frame numbers stay the list's own order.
- [ ] With a filter on (☆ Favorites, name, or the index): dragging is off, *✕ Clear* clears them.
- [ ] Selection bar: **− Remove from collection** (files stay, *Undo* puts them back in place), plus the usual actions (+ Collection, Tags, Move…).
- [ ] Right-click an image: *Remove from collection*, *Cover of <collection>*.
- [ ] *⚄ Random* and *▶ Slideshow* (starts playing, in list order).
- [ ] *Delete*: confirmation lists the albums the images live in; *Undo* in the message brings the list back (same link, same order, same cover).

### Add to collection
- [ ] From the selection bar (**+ Collection**) and from right-click (*Add to collection…*), on any grid.
- [ ] Recent (last added to) on top, then all a→z; typing filters; a new name offers *New collection “…”*; ↑↓ + Enter work; double-click adds.
- [ ] "N of M already here" bar; the message reports duplicates ("Added 2 · 3 were already in it") with *Go to →*.

### Group by collection (every image grid)
- [ ] *Group: None / Collection* next to Sort on albums, All images, Favorites, Search › Images, tag galleries — and **not** on collection pages or folder-card pages.
- [ ] Sections a→z, *Not in a collection* last; headers stay pinned while scrolling; counts ("N of these · the list holds M"); *Open collection ↗*; *⇅ Reverse* per section.
- [ ] An image on two lists shows in both with *2×*; selecting it counts once.
- [ ] Page header's image count stays the real number (not the grouped rows).

### Index, search and the rest
- [ ] Index: *Collections* section on top (not on the collection page itself); click cycles must → never → off, Ctrl+click any of; ↗ opens the list; every section title collapses/expands and it's remembered.
- [ ] Search box: typing `@` suggests collections; picking writes `@Name_with_underscores` or `@"Name — with punctuation"`; `-@x` and `~@x ~#tag` behave as documented.
- [ ] Search page: *Collections* row on *All* and its own tab.
- [ ] Viewer: *03 · Collections* panel (position in each list, open, ✕ removes from that list, + Add to collection); opened from a collection: "2 / 8 in collection", back button names it, strip numbered 01, 02…; ✕ on the list you're browsing shows the next image; *Cover of ▸ Collection*.
- [ ] Tag wiki: *Collections* section under Images ("N of M tagged"), *See all* expands in place; header shows the number of lists.

---

## 2. Milestone 7 — Library Health

### Badge (top bar)
- [ ] Red with a number when something is missing; amber with a number when only decisions are left; a blue dot only when only blue items are left; nothing when all is clear.
- [ ] The number = red + amber items only; it updates by itself after fixes and scans.

### Overview (`/health`)
- [ ] Summary cards; groups by colour with a sample line; *needs your choice* where there's no default.
- [ ] Group buttons (*Recreate N*, *Keep all N*, *Fix all N*, *Confirm N*, *Keep suggested (N)*, *OK all N*) **ask first**, then fix the whole group.
- [ ] **Apply to all…** lists what it will do (red and amber only, Recreate never Forget, outside changes Kept, "Loose images" albums…) and how many it skips; afterwards the message says what was fixed / skipped / failed.
- [ ] *Rescan*: the page dims, fixes wait, and it refreshes when the scan ends.
- [ ] *All in order* state when nothing is left.
- [ ] Bottom: *Unsupported formats* table (after Ignore / Record) and *Logs* (*Open logs folder*, *Clear logs* asks first).
- [ ] Thumbnail cleanup: *Delete* asks first and frees the space.

### Red — missing
- [ ] A missing sub-category with albums inside is **one** item (folders and images counted inside it), not one per album/image.
- [ ] *Recreate*: the folder **and the folders inside** come back with their markers; afterwards its images show up as ordinary missing images.
- [ ] *Locate…*: picking a different file shows "Not the same image" with *Pick another file…*; the right file inside the library relinks it; the right file outside gets copied back into its album (the original stays where it was). (Not tested in a browser yet.)
- [ ] *Forget…*: the confirmation lists what goes, then *Are you sure?* — *No* cancels, *Yes, forget* deletes. (Not tested in a browser yet.)

### Amber — needs a decision
- [ ] Changed outside the app: WAS / NOW with the changed part highlighted; images moved together are one item with a strip of thumbnails; *Keep* (message has *Undo*, which brings the item back); *Undo* moves things back — and is refused with a clear message when the old place is gone or taken.
- [ ] Unclear moves: the found image next to the candidates (tags, star, lists); pick one → *It's X · bring back its tags*; *Keep as a new image*; the others go back to Missing images.
- [ ] Loose images: *Move into a new album…* (name prefilled "Loose images", editable); *Into an existing album…* (album picker); loose images directly in `Images\` only offer an existing album.
- [ ] Folder inside an album: *Move it out* (it lands next to the album and shows up under Unmarked folders); *Convert…* shows what it does, asks for the new album's name, then converts. (Convert not tested in a browser yet.)
- [ ] Unmarked folders: every row marked GUESSED; *Album / Sub-category* switch; *Confirm …* / *Make it …* writes the marker; top-level folders never appear here.
- [ ] Not supported: *Ignore* (file stays, moves to *Not tracked*) and *Record* (tooltip explains; file goes to `.mediaview\Invalid\…` with its path); both count in the table.
- [ ] Wrong file types: *Recycle* (shows in the Recycle Bin as "File", *Restore* puts it back) and *Ignore*.

### Blue — for your information
- [ ] Duplicates, clear default: suggested copy marked; click another copy to keep that one instead; warning when the chosen copy would lose tags; *Keep copy N · recycle M*.
- [ ] Duplicates, different tags: *Keep one…* (shows what's lost) and *Merge into…* (shows what the kept copy gets); merged copy has all tags, the star, a description and every collection place; others in the Recycle Bin. (Merge not tested in a browser yet.)
- [ ] Duplicates, two starred: *Keep one* disabled until you ☆ Unstar one; *Merge into…* works and moves the star.
- [ ] One starred copy with different tags: suggested, but still asks.

### Untagged images (`/health/untagged`)
- [ ] Grouped by album; NEW only on images that arrived from outside the app (not on images that were there before the library's first scan).
- [ ] Type a tag + Enter: the row shows the tag and "leaving the list", then leaves; *Undo* in the message.
- [ ] *Mark as seen* (NEW cleared, stays) vs *Leave untagged* (off the list) — single and bulk; both have *Undo*.
- [ ] *All untagged / New from outside* filter; *Select all*; bulk *Tags…*.
- [ ] *Left untagged (n) ▸* lists them, with *Put back on the list*.
- [ ] Images in the Inbox are never listed.

### Untagged grid (`/health/untagged/grid`)
- [ ] Album chips and *NEW only*; NEW marks on frames.
- [ ] Bulk *# Tags…*, *Mark as seen*, *Leave untagged*.
- [ ] Tagged frames stay dimmed (no jumping) until *↻ Refresh · N done*.
- [ ] Opening an image: ← → stay inside the untagged images; the back button says "Untagged".

### White — notices
- [ ] A video/audio/text dropped among images is moved to `Videos\` / `Audio\` / `Texts\` on the next scan (same folders), with a notice; *OK* dismisses it; it never counts on the badge.
- [ ] *Not tracked* lists ignored files; *Track again* (back to Not supported) and *Record*.

---

## 3. Earlier fixes worth a re-check

- [ ] Viewer: moving an image keeps you on the list you were browsing (next image), message offers *Go to* and *Undo*.
- [ ] Viewer: `Esc` exits fullscreen → stops the slideshow → goes back; in the tag field it only leaves the field.
- [ ] Favorites → viewer steps through all favorites, not just one album.
- [ ] Removing a tag with the × on the chip in the viewer.

---

## 4. To decide before milestone 8

Write your answer under each question. My suggestion is in *italics*.

### Formats
1. **TIFF in the viewer** — browsers can't show TIFF, so the viewer needs a converted copy. Convert on demand and cache it next to the thumbnails, or convert once when the image is found? Max size of the converted copy (full size, or e.g. 4096 px)?
   *On demand, cached, full size up to 8192 px.*
2. **BMP and ICO** — add them (needs a small decoder for thumbnails), yes/no?
   *Yes.*
3. Anything else from the "Not supported" list you'd like first (HEIC, PSD, RAW…)? Each needs its own decoder and some have licensing issues — the counters will tell us over time.

### Sort by format
4. Order of formats when sorting: alphabetical by extension (AVIF, GIF, JPG, PNG…), or grouped (photos, graphics, animated)? And `jpg` / `jpeg` / `jfif` treated as one format?
   *Alphabetical, with jpg/jpeg/jfif/jpe as one "JPG".*
5. Type label on every frame when sorted by format: same style as the GIF badge (accent colour), or a quieter label so GIF still stands out?

### Keyboard navigation
6. Scope for milestone 8: grids (arrows move a focus ring, Enter opens, Space selects, Shift+arrows extend), card pages (Library, racks, drawers, Collections), and Backspace = up one level everywhere? Anything else (dialogs, the index, the viewer panels)?
7. Should the focus ring be visible only after the first key press (like Explorer), or always?
8. Does this need a Claude Design pass (focus states for frames, cards, rows)? *A small one: a single board with the focus look on each component.*

### Drop files onto a collection page
9. Dropped files go to the Inbox and are added to the end of the list — or should the drop position decide where they land in the list?
   *End of the list, like Add to collection.*

### Random, Settings, help
10. **Random** in the top bar: from the whole library, or from the page you're on (album, tag, collection) when there is one?
    *The page you're on, else the whole library.*
11. **Settings · Grid defaults**: default columns and sort for new pages — also a default for *Group by collection* and the index (shown/hidden)?
12. **Settings · Slideshow**: default interval only, or also loop / shuffle?
13. Per-page help: anything you found unclear while testing? Note the page and what was missing.

### Performance (50k images)
14. Test library for the performance pass: should I generate a synthetic 50,000-image library (small generated images, realistic folder tree, some tags and collections), or do you have a big real one to try?
15. Targets — e.g. first scan of 50k under N minutes, an album of 5,000 opens in under 1 s, search/index under 300 ms. Any numbers you care about, or should I propose them after measuring?
16. The web bundle is now ~520 KB (one file), just over the 500 KB the build warns about. Split it by page in milestone 8, or leave it (it's a local app)?
    *Split the biggest pages; it's cheap.*

### Packaging (`npm run package`)
17. Zip name and where it's written (e.g. `release\media-view-<version>.zip`)? Should the version come from `package.json`, and should `start.bat` open the browser by itself?
    *`release\media-view-<version>-win-x64.zip`, version from package.json, browser opens by itself.*
18. Bundle the `node.exe` download in the repo, or have the script download it once (it needs internet the first time, on your machine only)?
    *Download once into a cache folder; the zip itself never needs internet.*

### Anything else
19. Anything from testing that should go into milestone 8 rather than be fixed right away?
