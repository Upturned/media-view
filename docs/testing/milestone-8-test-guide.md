# Test guide — feedback round 2 and milestone 8

Everything added or changed on 2026-10-11, as a checklist. Tick each box when it behaves as described; when it doesn't, note the page, what you did and what happened.

**Before you start**

- Work on a **copy** of a library, or a test library, not your only copy.
- Build first: `npm run build`, then `npm start` (or use the zip, §10).
- Gather a few test files:
  - **BMP:** Paint → *Save as* → BMP.
  - **ICO:** any `.ico`; Windows has some in `C:\Windows\System32`.
  - **TIFF:** Paint → *Save as* → TIFF. A large one (several thousand pixels) and two or three small ones.
  - **JPE:** copy any `.jpg` and rename it `.jpe`.
  - **SVGZ:** compress an `.svg` with 7-Zip as *gzip*, then rename the `.gz` to `.svgz`.
  - **Others:** a few ordinary JPG / PNG / GIF images.
- Leave the browser's developer tools closed unless something breaks.

---

## 1. Library Health (tester feedback)

- [ ] On **Health**, each summary card (*Missing*, *Need a decision*, *Just so you know*) opens the review page of its colour.
- [ ] A fourth, white **notices** card sits to the right, with the number of notices; clicking it opens the white review page.
- [ ] **Open logs folder** (bottom of Health) opens the folder in a visible Explorer window. With no logs yet, a message says so instead.
- [ ] With no duplicates, there's **no** "Duplicates · 0 groups" row.

**Duplicates**
- [ ] Import an image that's already in another album (**+ Add images**). Within a second or two, Health shows a duplicate group.
- [ ] Do the same with **Copy…** to another album: a duplicate group appears.
- [ ] Copy a file in Explorer into a second album. After the scan, it's listed as a duplicate.

**Folders made in Explorer**
- [ ] With the app running, create an **empty** folder inside a category in Explorer. Health lists it under *Unmarked folders* with a guessed kind.
- [ ] Put a **folder** inside it (not images). After the scan, it's guessed as a **sub-category**, with no "folder inside an album" problem.
- [ ] A folder you already confirmed or changed in the app is **not** re-guessed when you add things to it in Explorer.
- [ ] Create a folder **directly in Images** in Explorer and put only images in it. Health shows it under *Unmarked folders* as **"Looks like an album"**, with **Move as album…** as the main button.
- [ ] **Apply to all** skips that folder, and the dialog counts it as skipped. It doesn't create a "Loose images" album inside it.

**Unclear moves**
- [ ] Make one:
  1. Put the same image into two albums (a duplicate) and let the app scan.
  2. Close the app, and in Explorer move both copies **out of** the library.
  3. Put **one** copy back into a third album, then start the app again.
- [ ] The review shows the found image and each candidate **side by side**: name, folder, tags, star, collections, note.
- [ ] Clicking a candidate column picks it, and the other columns are differences you can read at a glance.

## 2. Header

- [ ] Next to the logo: **› IMAGES**. Clicking it opens the Images library page.
- [ ] Clicking the logo opens the Hub (all modules).
- [ ] On the Hub and Settings, the **› IMAGES** part isn't shown.

## 3. New formats

Put the test files into an album **through Explorer**, and also **import** some through **+ Add images** and drag and drop.

- [ ] **BMP, ICO, JPE, SVGZ** each get a thumbnail in the grid, and the viewer shows each one.
- [ ] An ICO with several sizes shows its largest picture; transparent parts look transparent.
- [ ] **TIFF:**
  - While the copies for the viewer are being made, the top bar shows **TIFF 3 / 12**, with a thin line along the bottom growing as it goes.
  - When it finishes, it shows **✓ TIFF 12**, which fades out after about 3 s.
  - Hovering the pill says "Making viewer copies of TIFF images — you can keep working."
- [ ] Open a big TIFF **right after** adding it, before the pill finishes: it opens, maybe a little slower. The caption at the bottom left says **TIFF**.
- [ ] *Open with…* on a TIFF opens the **original** file in the other program.
- [ ] Recycle a TIFF and empty the Bin. **Health → Thumbnail cleanup** counts its unused viewer copy, and cleaning removes it.
- [ ] If you'd marked a `.bmp` or `.tif` as *Ignore* in Health before today, it's now an ordinary image after a rescan, and it's gone from *Not tracked*.
- [ ] A text file renamed `x.bmp` is reported as unreadable, and the app doesn't crash.

## 4. Sort and group by format

- [ ] **Sort → Format** (cycle the Sort button): images are ordered by format, then by name. **↑ / ↓** flips both.
- [ ] Hovering a frame shows a small, quiet format label at its bottom right. GIFs keep their orange badge and get no extra label.
- [ ] **Group → Format:**
  - The grid splits into sections (BMP, GIF, ICO, JPG, PNG, SVG, TIFF…), each with the count and "sorted by …".
  - `.jpeg` / `.jfif` / `.jpe` images are in the **JPG** section.
- [ ] Group by format with **Sort → Date modified**: inside each section, newest or oldest first, as chosen.
- [ ] Open an image from a format section. **← →** in the viewer go through the same order as the grid, crossing into the next format.
- [ ] Shift-click two frames in different format sections: everything between them is selected.
- [ ] Switch **Group** between *None*, *Collection* and *Format* a few times: no empty grid, no stuck page.
- [ ] Reload the page: the grouping you chose is remembered.

## 5. Random (top bar)

- [ ] On an album, hover **RANDOM**: the tooltip says "Random image from <album name>". Clicking it opens an image from that album.
- [ ] Same on a tag gallery, a collection, Favorites and a search result: the image always comes from that page's images.
- [ ] On the Library, Tags, Health or Settings page: the tooltip says "the whole library".
- [ ] On an **empty** album, it picks from the whole library instead.
- [ ] Clicking it repeatedly doesn't show the same image twice in a row (when there's more than one).

## 6. Settings

- [ ] **Grids**:
  - Columns, Sort (with ↑ ↓ set apart), Group (None / By collection / By format) and Index.
  - Labels line up in one column, and each row reads as one control.
- [ ] Change them in Settings, then open an album **you haven't opened in this session**: it opens with those settings.
- [ ] Change the columns on a grid, then go back to Settings: it shows the new value.
- [ ] **Slideshow**: *Each image* 2–30 s, *At the end* Start over / Stop, *Order* The list's order / Shuffle.
- [ ] Settings survive reloading the page and restarting the app (they're kept in the browser).

## 7. Slideshow

- [ ] **▶ Slideshow** in the viewer. **‹ ›** step through 2, 3, 5, 8, 10, 15, 20, 30 s; a non-listed value doesn't stick.
- [ ] **⟳ loop** and **⤨ shuffle** are small squares. The one that's on is orange **with a short bar under it**, and its tooltip says "on" or "off".
- [ ] Loop **off**, list order: at the last image it stops, and a message says "End of the slideshow — loop is off."
- [ ] Shuffle **on**, loop off: every image of the list is shown once, in a random order, then it stops.
- [ ] Shuffle on, loop on: after a full round it carries on with a new random order.
- [ ] Changing these in the viewer is reflected in Settings, and the other way round.
- [ ] A collection's **▶ Slideshow** button still starts right away.

## 8. Dropping files onto a collection

- [ ] Open a collection and drag image files from Explorer over it. A full-page overlay says **"Drop to add them to the list."** with **INBOX → <collection>**.
- [ ] Drop them:
  - The import panel shows "→ Inbox → <collection>".
  - The images land in the **Inbox**, and a message says "Added N to <collection>".
  - They're at the **end** of the list.
- [ ] Drop a **folder**: its images (subfolders too) are added the same way.
- [ ] Drop an image that's **already in the Inbox**: it's not copied again, but it is added to the list.
- [ ] Cancel a big drop halfway: the images imported before cancelling are added to the list.
- [ ] Drop a video or a text file: it's reported as not imported, and nothing is added.

## 9. Pages load (smaller download)

These pages now load the first time they're opened. Each should appear without errors (a blink on first open is fine):

- [ ] Library Health, its review pages, *Untagged*
- [ ] A tag's wiki page, Tag types
- [ ] Recycle Bin
- [ ] Settings
- [ ] The Welcome screen (no library open)
- [ ] Help (`F1` / `?`), and **Check styles** (the theme button)

## 10. The portable zip

- [ ] `npm run package` finishes with `✓ release\media-view-<version>-win-x64.zip`. The first time it downloads Node.js (needs internet); a second run says "from the cache".
- [ ] Unzip it **somewhere else**, ideally on another Windows 10/11 PC **without Node installed**, and with the internet off.
- [ ] Double-click **start.bat**: a black window opens and the browser opens the app. The library and settings are those of `%APPDATA%\media-view` on that PC.
- [ ] Double-click **start.bat** again while it runs: the browser opens the same app, and the second window closes by itself.
- [ ] Close the black window: the app stops (the page can't reach it any more).
- [ ] If another program uses port 4321, the window says so and which setting to change, and waits for a key.
- [ ] In the app from the zip, the formats, TIFF copies and thumbnails all work (sharp and SQLite came along).

## 11. Keyboard

Use the keyboard alone where it says so; touch the mouse only where a step asks for it.

**The ring**
- [ ] On an album, press **→**: a **white ring** appears on the first frame (the first key lands there; it doesn't move yet). The next arrows move it.
- [ ] Move the mouse over **another** frame: the ring disappears, and hover looks as usual. Press an arrow: the ring comes back **where it was**, not where the mouse is.
- [ ] Click a frame (Ctrl+click to avoid opening it): no ring. Then press an arrow: it continues **from the clicked frame**.
- [ ] The first time arrows move the ring on a grid, a quiet bar at the bottom lists the keys. It goes away after ~5 s or when you move the mouse, and doesn't come back on grids. Card pages and the viewer's strip each show their own once.

**Image grids** (album, All images, Favorites, tag gallery, search, collection, Untagged)
- [ ] ← → ↑ ↓ move. At the edges it stops, with no wrapping. **Home / End** jump to the first and last frame. **PgUp / PgDn** move a screen at a time, and the grid scrolls to keep the ring visible.
- [ ] **Space** selects or deselects the frame. **Shift + arrows** selects the range from where you started. **Ctrl + arrows** moves without changing the selection.
- [ ] **Enter** opens the viewer. With a selection active, Enter selects instead. **Esc** clears the selection.
- [ ] Open an image with Enter, go back (**Backspace** or **Esc**): the ring is on the image you opened, also after stepping to other images in the viewer.
- [ ] With **Group: Collection** and **Group: Format**, ↑ ↓ cross from one section into the next, and the pinned header doesn't hide the ring.
- [ ] Sorted by format, the focused frame shows its format label too.

**Up one level (Backspace)**
- [ ] Album → its drawer or rack → Library → Hub.
- [ ] *All images in* → that folder's page. Inbox → Library.
- [ ] Tag gallery → its wiki page → Tags → Library. Collection → Collections.
- [ ] A Health review page → Health. *Untagged grid* → *Untagged*.
- [ ] Backspace in a text field (search, name filter, tag field) deletes text and **doesn't** navigate.
- [ ] In the viewer, Backspace still goes back to where you came from.

**Card pages** (Library, a rack, a drawer, Collections)
- [ ] Arrows move between cards by where they sit on screen; ↑ ↓ go to the card above or below. Enter opens.
- [ ] On the Library, the Inbox banner is the first stop. Album cards have the ring around the whole stacked card.
- [ ] Go into a card and come back: the ring is on the card you opened.

**Lists**
- [ ] **Tags:** arrows move between tags, with the ring **inside** the row. Enter opens the tag's gallery; Space selects it (checkbox).
- [ ] **Library Health:** ↑ ↓ move between the group rows; that row's **Review ▸** border lights up. Enter opens the review.
- [ ] **Recycle Bin:** ↑ ↓ move. Space selects. Enter **restores**. **Delete** asks, then deletes permanently.

**Buttons and toolbars**
- [ ] **Tab** moves through the top bar, toolbars and buttons with a smaller white ring. A mouse click on a button shows **no** ring.
- [ ] A row of joined buttons is **one** Tab stop; ← → move inside it, and Space or Enter picks:
  - in the grid toolbar: **Group** and **Cols**
  - in Settings: every row
- [ ] The ring isn't cut off by neighbouring buttons.

**Viewer**
- [ ] ← → change the image as before.
- [ ] **Tab** until the film strip: the ring is on the current image.
  - ← → move the ring along the strip **without** changing the image.
  - **Enter** shows the image under the ring. **Esc** leaves the strip; then ← → change images again.
- [ ] Tab into the Info / Tags / Collections panel, press Esc: you leave the panel first. The next Esc goes back as before (fullscreen → slideshow → back).
- [ ] The key bar for the strip appears **above** the strip, not over it.

**Dialogs**
- [ ] Esc closes any dialog. Tab moves through its fields and buttons with the ring.

## 12. Help and docs

- [ ] `F1` on an album, a collection, the viewer, Settings and Health: the help mentions what's new on that page — keyboard, format sort and grouping, drop on a collection, loop / shuffle, TIFF.
- [ ] The user guide (`docs/user-guide/user-guide.md`) and the technical doc read correctly where they mention today's features.

---

**Known gaps (not bugs):**
- The index sidebar has no arrow keys yet (use Tab).
- The top bar doesn't move with ← → (use Tab).
- Lists inside dialogs don't move with ↑ ↓ (use Tab).
- The performance pass waits for your 10k library.
