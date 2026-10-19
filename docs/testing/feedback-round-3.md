# Test guide — feedback round 3

Everything changed after the milestone 8 test round (2026-10-13), as a checklist. Tick each box when it behaves as described; when it doesn't, note the page, what you did and what happened.

**Before you start**

- Work on a **copy** of a library, or a test library.
- Build first: `npm run build`, then `npm start`.

---

## 1. Library Health

**WAS / NOW paths**
- [ ] In Explorer, move a folder one level deeper (`Images\Humor\Memes` → `Images\Humor\Funny\Memes`). On *Changed outside the app*, WAS reads `Images\Humor\Memes` — with the `\` — and NOW highlights `Funny`.
- [ ] Move it back up: WAS highlights the removed folder, NOW keeps its `\` too.

**Move out of an album**
- [ ] In Explorer, put a folder with a few images inside an album. After the scan: *Rule problems* → folder inside an album.
- [ ] Tag one of those images first, then **Move out**. The folder lands next to the album, and **no** *Changed outside the app* item appears for its images.
- [ ] The tagged image keeps its tags (open it from its new place).

**Unreadable images**
- [ ] Rename a text file to `x.png` and put it in an album. Within a few seconds it's listed under *Wrong file types* as unreadable (about 2 s later than before: the app reads it twice).
- [ ] Replace it with a real PNG of the same name: after the scan, open the album — the item goes away by itself once the thumbnail shows.
- [ ] Do it again, and this time recycle the bad file from the grid (not from Health): the item goes away on the next look at Health.
- [ ] *Recycle* on an item whose image is already gone says it was cleared, instead of doing nothing.
- [ ] Repeat the stress test (many files copied and moved at once, then *Fix all* / merge duplicates): no unreadable item stays for a file that's fine or gone.

**Blue card and rows**
- [ ] With only untagged images left in blue, the blue card opens a review page with an **Untagged images** row (*Open as grid*, *Review ▸*), not an empty page. The count next to *Blue* is the number of groups, as on the card.
- [ ] On the overview, a group's **name** opens its review (underlined on hover); the buttons do what they did. *Thumbnail cleanup*'s name isn't a link.
- [ ] *Changed outside the app* summaries name the file and where it went (`photo.jpg → Memes`, `3 images → Memes`) instead of "1 image moved".

**All in order**
- [ ] With nothing to report, the *All in order* page has **Open logs folder** and **Clear logs** under the tally.

## 2. Renaming a folder Windows is holding

- [ ] Open an album's folder in an Explorer window, select a file in it (so Explorer previews it), then rename the album in the app. Either it works after a short pause, or a message says something is using the folder and to close Explorer windows inside it. No raw `EPERM` text.
- [ ] Close the Explorer window and rename again: it works.

## 3. Random

- [ ] Open an album, then go to the Hub (or Tags, or Settings). **Random** in the top bar now picks from the **whole library** — hover it to check: *Random image from the whole library*.
- [ ] On an album, a tag, a collection or a search, it still picks from that page.
- [ ] In the viewer, **Random** in the top bar of the viewer, **⚄ Random** in the controls and **R** all pick from the list you came from. The tooltip names it.

## 4. Viewer

- [ ] Open an image: the viewer's bar is as tall as the top bar and the logo the same size — nothing jumps.
- [ ] **Right-click the image**: a menu with Open with…, Tags…, Add to collection…, Rename…, Move…, Copy…, Star, Cover of… and Recycle. Opened from a collection, *Remove from collection* and *Cover of* the collection are there too.
- [ ] Each item works (Tags… puts the cursor in the tag field; Recycle shows the next image).
- [ ] In fullscreen, right-click shows **no** menu at all (not even the browser's).

## 5. Hub

- [ ] Right-click the **Images** card: a menu with **Open**, which opens Images.
- [ ] Right-click a *coming soon* card: *Open · coming soon*, greyed out.
- [ ] Right-click the empty page: **Modules**, listing Images (works) and the other three (greyed out).
- [ ] The browser's own menu never shows on the Hub's page area (the top bar, and other pages, come later).

## 6. Collection order, reversed

- [ ] On a collection, the **↑ / ↓** button is there in *Collection order* too. **↓** shows the list last to first; the numbers keep their real places.
- [ ] While reversed, dragging doesn't reorder, and the hint says *Last to first · reordering works only first to last* with **↑ First to last**.
- [ ] Open an image while reversed: ← → in the viewer follow the reversed order.
- [ ] **▶ Slideshow** and **⚄ Random** in the header follow the grid's order (reversed, or sorted by name).
- [ ] Going back to *Collection order* from another sort (the hint's button) also goes back to first to last.

## 7. Search pins what you named

- [ ] Search `#animal`: the **Tags** tab (and *All*) shows **animal** first, marked *in your search*, even though no plain word was typed.
- [ ] Search `@chapter_3_refs`: the **Collections** tab shows that collection under *Named in your search*.
- [ ] `-#animal` doesn't pin it. `~#cat ~#dog` pins both.
- [ ] Mixed (`#animal forest`): *animal* first, then the tags whose names contain *forest*, with no duplicate rows.

## 8. + From library

**Into an album**
- [ ] An album's toolbar has **+ From library** (not on the Inbox, not on *All images in*).
- [ ] The dialog lists the Inbox first, newest first. Typing filters the Inbox by name and searches everywhere (`#tag`, `@collection` work).
- [ ] Click picks (accent outline, ✓), click again unpicks; Shift-click picks a range within a section. Picks stay while you change the search.
- [ ] The album's own images show dimmed, marked *Here*, and can't be picked.
- [ ] The side panel says how many come from the Inbox (**moved**) and from other albums, with **Copy | Move** (Copy by default).
- [ ] **Add**: Inbox images leave the Inbox; images from other albums are copied (tags too) — or moved, if you switched. Messages offer *Go to* (and *Undo* for moves).
- [ ] A name already in the album gets a number (`name (1)`).

**Into a collection**
- [ ] A collection's toolbar has **+ From library**. Images already on the list are dimmed (*On the list*).
- [ ] **Add** puts the picks at the end of the list; nothing moves on disk.

## 9. Help and the user guide

- [ ] F1 on the Hub, viewer, album, collection, search and Health pages mentions the new things above.
