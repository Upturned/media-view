# media-view — Images Module · User Guide

> **Version:** 2.0 (draft) · **Module:** Images
> This guide describes how the Images module works for the person using it: how your library is organized, which pages exist, and what you can do on each of them.

---

## 1. What is media-view?

media-view is a personal, offline media library that runs on your own computer. It shows the pictures you keep in a folder on disk, lets you browse and view them comfortably, and adds a layer of organization on top — tags, collections, favorites, descriptions — without ever hiding where your files actually are.

Three ideas guide the whole app:

- **What you see on disk is what you get.** Categories, sub-categories and albums are real folders. If you open your library in Windows Explorer, you'll find exactly the same structure you see in the app.
- **Tags cut across folders.** A picture lives in one album, but it can carry as many tags as you like — who's in it, who drew it, which story it belongs to — so you can find it from many different angles.
- **Collections are lists, not places.** A collection gathers pictures from anywhere in your library into an ordered list, without moving any files.

Everything runs locally. No internet connection is needed and nothing leaves your computer.

---

## 2. Your library

### 2.1 The library folder

Your **library** is a folder you choose anywhere on your computer — for example `D:\MyLibrary`. It holds your media and everything the app knows about it:

```
D:\MyLibrary\
├── .mediaview\          ← hidden: the app's own data for this library
│   ├── library.db     ← tags, collections, favorites, descriptions...
│   ├── thumbnails\
│   ├── recycle-bin\
│   └── logs\
└── Images\            ← the Images module
    ├── Inbox\         ← where new images arrive (see §2.4)
    └── ...            ← your categories
```

Because everything lives inside that one folder:

- **Backing up is copying one folder.** Copy `D:\MyLibrary` and you have your pictures *and* all your tags, collections and descriptions.
- **It travels.** Put the library on an external drive, plug it into another computer running media-view, and open it.
- **The app and your pictures are separate.** Updating or reinstalling media-view never touches your library.

Most people will only ever have one library, and the app opens it automatically every time. If you want more than one — say, one for work and one personal — use **Open library…** in Settings to switch between them (see §4.16).

> Future modules (Videos, Audio, Text-Writer) will live in the same library, next to `Images\`, sharing the same tags and collections.

### 2.2 The rack, the drawer and the photo album

Inside `Images\`, think of your pictures as a room full of old-fashioned photo storage:

| In the app       | In real life                      | What it can hold                 |
|------------------|-----------------------------------|----------------------------------|
| **Category**     | A **rack**                        | Sub-categories and albums        |
| **Sub-category** | A **drawer** in the rack          | Other sub-categories and albums  |
| **Album**        | A **photo album** inside a drawer | Images only                      |

You put photos in albums, albums in drawers or directly on racks, and drawers on racks. You never leave a loose photo lying in a drawer or on a rack — it always goes into an album. And you never put anything but photos inside an album.

### 2.3 The rules

1. **Categories** are the top-level folders inside `Images\`.
2. **Categories and sub-categories work the same way:** each can contain sub-categories, albums, or a mix of both — but **never loose images**.
3. Sub-categories can be nested as deep as you want (a drawer inside a drawer).
4. An **album** contains **only images** — no sub-categories and no other albums.
5. Every image lives in **exactly one album**. If you want a picture to also appear somewhere else, add it to a **collection** (see §2.7) instead of copying it.
6. The only exception is the **Inbox** (see §2.4), a special album that sits at the top level.

Example:

```
Images\
├── Inbox\                       ← the Inbox (special album)
├── Fantasy\                     ← category (rack)
│   ├── Elves\                   ← sub-category (drawer)
│   │   ├── Portraits\           ← album
│   │   │   ├── aerin.png
│   │   │   └── lathir.jpg
│   │   └── Landscapes\          ← album
│   └── Maps\                    ← album, directly in the category
└── Photography\                 ← category
    └── 2025\                    ← sub-category
        └── Beach Trip\          ← album
```

### 2.4 The Inbox

The **Inbox** is where new images land when you haven't said where they should go — your desk, before things are filed into albums.

- Images added while you're **not** on an album (on the Library page, a folder page, search, …) go to the Inbox.
- You can also drop files into `Images\Inbox\` straight from Windows Explorer; the app picks them up.
- The Inbox is shown first on the Library page with its own look and an image count, so you always know how much is waiting to be sorted.
- From the Inbox, select images and **Move** them to their albums — tagging them along the way if you like.
- The Inbox can't be renamed, moved or deleted.

### 2.5 Telling folders apart

Each kind of folder has its own look everywhere in the app — on cards, in the page header and in the breadcrumb trail:

| Kind             | Icon          | Card                                    |
|------------------|---------------|-----------------------------------------|
| **Category**     | Rack          | Large tile with cover image             |
| **Sub-category** | Drawer        | Tile labeled *Sub-category*             |
| **Album**        | Photo album   | Stacked-photos tile labeled *Album*     |
| **Inbox**        | Tray          | Highlighted tile with the waiting count |

Empty folders tell you what they can hold: *"This drawer is empty — add an album or a sub-category."*

### 2.6 The app remembers

The app keeps a record of every folder and every image in your library, and that record is what it trusts. This means:

- **Nothing is forgotten by accident.** If a folder is deleted or goes missing outside the app, media-view still knows it existed — what kind it was, its description, its cover — and offers to recreate it. If its images come back, their tags come back with them.
- **Moves and renames are recognized.** Each image is recognized by its content, and each folder carries a small hidden marker file (`.category`, `.subcategory`, `.album` or `.inbox`) with its identity. So when a picture or folder is moved or renamed, its tags, favorite star and description stay with it.
- **…but changes made outside the app are confirmed with you.** Moves and renames done in the app are simply done. If a folder or images are moved or renamed **in Windows Explorer**, the app follows them (so everything keeps working) and lists the change on Library Health, where you choose **Keep** or **Undo** (see §4.15).
- **Duplicates are spotted.** Identical images stored in more than one place are detected automatically.

The marker files are hidden and tiny; leave them alone and the app will take care of them. If they go missing, the app recreates them.

### 2.7 Collections

A **collection** is an ordered list of images picked from anywhere in your library — a reference sheet for a chapter, a comic page by page, a set of wallpapers.

- An image can be in **any number of collections**, and each collection keeps its own order.
- Collections don't move or copy files. **An album is where an image lives; a collection is a list the image appears on.**
- Removing an image from a collection never deletes it. Deleting an image removes it from every collection it was in.

### 2.8 If the rules get broken

Because your library is made of ordinary folders, you can still change things in Windows Explorer. If something ends up breaking the rules — an image dropped straight into a sub-category, a folder created inside an album, a new folder with no marker — nothing is lost. The app lists it on the **Library Health** page (see §4.15) and offers to fix it.

---

## 3. Getting around

- The **top bar** is on every page: the media-view logo (back to the Hub), the search box, shortcuts to Tags, Collections, Favorites, Random and the Recycle Bin, the **Library Health** indicator, the theme picker, Settings and **Help** (`?`).
- A **breadcrumb trail** (e.g. *Images › Fantasy › Elves › Portraits*) shows where you are; click any part of it to jump back up.
- **Right-click** almost anything — a card, an image, a tag — for the actions available on it.
- **Drag and drop** images from Windows Explorer onto the app to add them: onto an album page or album card to add them there, anywhere else to send them to the Inbox. On a category or sub-category page, a dropped **folder** becomes a new album there, with its images.
- **Drag images out of a grid** to move them: a bar appears at the bottom with the Inbox and your recent albums; drop on one, or on *Other album…* to pick one.

### 3.1 Tags, wherever you see them

Tags appear as colored chips (the color comes from the tag's type). They behave the same everywhere:

| Action           | Result                                                                  |
|------------------|-------------------------------------------------------------------------|
| Hover            | Shows the tag's type, the first paragraph of its wiki page and how many images have it |
| Click            | Shows all images with that tag                                          |
| Ctrl + click     | Opens the tag's wiki page                                                |
| Middle-click     | Opens the tag's wiki page in a new tab                                  |
| Right-click      | Menu: *Open wiki page*, *Show all images*, *Edit tag*, *Copy name* (and *Remove from this image* where it applies) |

The one exception is the **tag sidebar** on grid pages, where clicking a tag **filters** the grid instead (see §3.2).

### 3.2 The tag sidebar

Grid pages (albums, folders, search, favorites, collections, tag galleries) have a side panel listing the tags used by the images you're looking at, grouped and colored by type, with counts.

| Action        | Result                                                                     |
|---------------|----------------------------------------------------------------------------|
| Click         | Cycles the tag through **include** → **exclude** → off                     |
| Ctrl + click  | Adds the tag to the **any of** group (images with at least one of them)    |
| Right-click   | The usual tag menu                                                         |

Included tags must all be present, excluded tags must all be absent, and at least one tag of the *any of* group must be present. The search box always shows the equivalent search (see §5.6), so you can tweak it by hand.

### 3.3 Library Health indicator

When Library Health has something waiting for you, its icon in the top bar shows a badge with the number of open items, colored by the most serious one:

| Color     | Meaning                                                                          |
|-----------|----------------------------------------------------------------------------------|
| **Red**   | Something is missing — folders or images the app can't find                      |
| **Amber** | Something needs a decision — rule problems, unmarked folders, changes made outside the app, wrong file types |
| **Blue**  | Just so you know — duplicates, new images, thumbnail cleanup                     |

No badge means everything is in order.

### 3.4 Keyboard

These work on every page; the image viewer adds its own (see §4.5). Press `F1` on any page to see the shortcuts available there.

| Key                  | Action                                                      |
|----------------------|-------------------------------------------------------------|
| `F1`                 | Help                                                        |
| `/`                  | Jump to the search box                                      |
| `Enter`              | Open the focused card or image (in selection mode: select it) |
| `Esc`                | Close the open menu or dialog; on the Search page, put the cursor back in the search box |
| `Enter` in a dialog  | Confirm                                                     |
| `Enter` or `,` while tagging | Add the typed tag                                   |

---

## 4. Pages

### 4.1 Hub

The starting page. It shows one card per module (Images, Videos, Audio, Text-Writer). For now, only **Images** is active; the others are shown as "coming soon". The name of the open library is shown at the top.

### 4.2 Library (Categories)

The front page of the Images module: the **Inbox** first, then a grid of all your **categories**, each with its cover image, name and total number of images.

- Click a category to open it.
- **New category** creates a new top-level folder.
- **Add images** (or drag files onto the page) sends images to the Inbox.
- Right-click a category to rename it, set its cover, edit its description, or send it to the Recycle Bin.

### 4.3 Folder page (Category / Sub-category)

Opening a category or sub-category shows what's inside it: its sub-categories and albums as cards, each with its kind, cover and image count.

- The folder's **cover** and **description** are shown at the top. Click the description to edit it — a short note (up to 500 characters) about what the folder holds.
- **New sub-category** and **New album** create folders right here.
- **View all images** shows every image under this folder — from all its albums, however deep — in one grid, with the tag sidebar.
- Drag files onto an **album card** to add them to that album.
- Right-click a card to rename, move, set a cover, edit the description, or recycle it.

### 4.4 Album page

The heart of the module: a grid of the images in one album. The Inbox uses this same page.

**Viewing**
- Thumbnail grid with adjustable size (2–10 columns); your choice is remembered.
- Images load as you scroll, so even large albums open quickly.
- A star (★) marks favorites.

**Sorting** — by name, date modified, date added, file size or random; ascending or descending.

**Group by collection** — splits the grid into one section per collection (collections in alphabetical order, images in each collection's own order, which you can reverse). An image in several collections appears in each of their sections; images in no collection come last, under *Not in a collection*.

**Filtering** — all filters stack:
- favorites only
- tags, through the tag sidebar (see §3.2) or the search syntax (see §5.6)
- file name text

**Selecting and bulk actions** — select several images (click, Ctrl-click, Shift-click, or *Select all*) and then:
- add or remove tags
- add them to a collection
- move or copy them to another album
- rename them in bulk
- favorite / unfavorite them
- send them to the Recycle Bin

**Moving and copying** — pick the destination album in the folder tree (filter it by typing; your recent albums are one click away). If you pick a category or sub-category, you can create a new album right there. When a name is already taken in the destination, choose **Keep both** (the new one becomes `name (1)`), **Replace** (the one already there goes to the Recycle Bin — starred images are never replaced) or **Skip**. After a move or copy, the message at the bottom offers **Go to** the destination album and, after a move, **Undo**, for a few seconds. When copying, **Copy tags** (on by default) gives the copies the same tags.

**Renaming in bulk** — write a pattern: `#` is a number and `*` the original name, so `ref_#` gives *ref_01, ref_02…* and `*_#` keeps the names and numbers them. Choose where numbering starts and how many digits it has. Images are numbered in the grid's current order, extensions are kept, and a live preview shows every new name — names that would clash are flagged before anything changes.

**Adding images** — **Add images** opens the Windows file picker, or drag files from Explorer onto the page. Either way, they're copied into this album and the originals are left untouched. A panel at the bottom right shows the progress (you can keep working) and, at the end, what wasn't imported and why: other file types, files that can't be read, or images already in this album (identical ones are skipped).

**Right-click an image** for: *Open*, *Open With…*, *Rename*, *Move*, *Copy*, *Add to collection*, *Favorite*, *Recycle*, and **Set as cover of ▸** — the album, any sub-category or the category above it, the current collection, or any of the image's tags (for example, as a character's portrait).

### 4.5 Image viewer

Opens when you click an image. Shows the image as large as possible with its details alongside.

- **Fit to screen** by default; large images are scaled down, small ones shown at natural size.
- **Zoom** from 0.1× to 10× with the mouse wheel; **pan** by clicking and dragging.
- **Previous / Next** follow the order of the page you came from — an album, a search, a tag, a collection.
- **Slideshow** with a configurable interval (1–30 s) and a progress bar.
- **Info panel:** file name, full folder path (clickable), size, dimensions, dates.
- **Tags panel:** the image's tags grouped by type (see §3.1 for clicking them).
  - Add tags by typing: suggestions appear with their type color and image count, and aliases are recognized.
  - If what you type doesn't exist yet, choose **Create "…" as [type ▾]** to create the tag on the spot. Typing `character:frodo` creates it directly as a Character.
  - Remove a tag with the **×** on it (or right-click → *Remove from this image*).
  - Tags added automatically by an implication (see §5.4) are marked as such and can't be removed on their own — the tooltip tells you which tag implies them.
- **Collections panel:** which collections the image is in; add it to another one.
- **Favorite**, **Open With…** (opens the file in another program), **Rename**, **Move**, **Set as cover of ▸**, **Recycle**. After a move or recycle you stay on the list you were browsing: if the image left it, the next one is shown.

When opened from a collection, the viewer shows your position in it (e.g. *3 / 12 in "Chapter 3 refs"*).

**Keyboard shortcuts**

| Key              | Action                                                                 |
|------------------|------------------------------------------------------------------------|
| `←` / `→`        | Previous / next image                                                  |
| `+` (or `=`) / `-` | Zoom in / out                                                        |
| `0`              | Reset zoom                                                             |
| `F`              | Fullscreen                                                             |
| `R`              | Random image                                                           |
| `S`              | Start / stop slideshow                                                 |
| `T`              | Type a tag: puts the cursor in the Tags panel (`Esc` goes back to the images) |
| `Esc`            | One step back, in this order: exit fullscreen → stop the slideshow → back to the previous page (in the tag field, `Esc` just leaves the field) |
| `Backspace`      | Back to the previous page                                              |
| `F1`             | Help                                                                   |

Keys that work everywhere are listed in §3.4.

### 4.6 Search

The search box is in the top bar. On a page with images (an album, the Inbox, *View all images*, a tag) it **filters that page as you type**; switch it to **Everywhere**, or press Enter on any other page, to open the Search page for your whole library. Press `/` to jump to it. While you type it suggests tags and shows how it reads your search (must / never / any of).

The Search page's first tab, **All**, shows the first few results of each kind, each with **See all**:

- **Images** — matching images, with the same sorting, filtering, tag sidebar and bulk actions as an album.
- **Albums** — albums whose names match.
- **Categories & sub-categories** — those whose names match.
- **Tags** — tags whose names or aliases match.
- **Collections** — collections whose names match (with collections).

Images are found by the full search (words and tags); folders and tags by the words. Plain text and tag filters can be mixed in the same search; see §5.6, or the *Search* tab of the Help window.

### 4.7 Tags

A directory of every tag in your library.

- Tags are grouped by **type**, each type with its own color.
- Each tag shows how many images use it.
- Search the list, sort by name or count, and filter by type.
- **New tag** creates a tag in advance, before using it on any image.
- Select several tags to **merge** them (see §5.3) or delete them.
- Click a tag to see its images; **Ctrl + click** opens its wiki page.
- **Edit tag** (right-click any tag, or the button on its wiki page) changes its name and type, its aliases and main name, what it implies, merges it into another tag or deletes it. Adding or removing an implication that touches more than 30 images asks first.
- To tag many images at once, select them and choose **Tags…** in the selection bar: it shows how many of them already have each tag, and nothing changes until you press *Apply*.

### 4.8 Tag wiki page

Every tag has its own wiki page. Open it with **Ctrl + click** on the tag (middle-click opens it in a new tab), *Open wiki page* in the tag's menu, or **Wiki page →** in its gallery.

- **Header** — the tag's main name, its type (in the type's color), its **cover image** (for example a character's portrait), its aliases (*"also known as …"*), how many images have it and when the page was last edited.
- **Description** — free text in Markdown: `**bold**`, `*italic*`, `## heading`, `- list`, `> quote`, and links. Link another tag by writing `[[name]]`, `[[type:name]]` or `[[type:name|text to show]]`, so pages connect like a real wiki; aliases work too. A link to a tag that doesn't exist yet shows **dashed in amber**, marked *missing*; click it to create the tag (you pick its type). The first paragraph is also the tooltip you see when hovering the tag anywhere in the app.
- **Images** — the 7 newest images with the tag, with **See all** opening the full gallery with sorting, filtering and the tag sidebar.
- **Implies / Implied by** — e.g. a character's page shows its source; a source's page lists its characters (see §5.4).
- **Related tags** — the 12 tags that most often appear on the same images, with the share of this tag's images that also have them.
- **Info** — the tag's **custom fields** (see §5.5), such as a character's species or an artist's website. Empty fields are hidden (the box says how many).
- **Collections** — collections containing images with this tag *(with collections, milestone 6)*.

**Editing.** **✎ Edit page** (or **E**) switches the whole page into one edit mode: the description, the cover (**Change cover…**) and every custom field. Nothing is saved until **Save page** (**Ctrl + S**); **Discard** (or **Esc**) drops the changes, asking first if there are any.

- The description editor has buttons for bold, italic, heading, list, quote and tag links, and shows the text, a live preview, or both side by side (**Edit / Split / Preview**). Typing `[[` suggests tags — ↑ ↓ to choose, **Enter** or **Tab** to insert, **Esc** to dismiss. Below it: how many links the page has and which are missing (click one to create it). Up to **20,000** characters.
- Each field has an editor that suits its kind (see §5.5); fields with something wrong are outlined in red, and the page can't be saved until they're fixed.
- Images (the cover, or an *Image* field) are chosen in the **image picker**: the tag's own images first, then — once you type — the whole library, by file name or search syntax. The side panel shows where the image is and whether it has the tag; any image can be used, and it's only referenced, never moved or tagged. Double-click uses an image right away.
- Name, type, aliases, implications, merge and delete stay in **Edit tag** (the button in the header); choose which name is the main one there too (see §5.2).

### 4.9 Tag types

Where you manage the kinds of tags that exist. The app comes with:

| Type          | Used for                                                  |
|---------------|-----------------------------------------------------------|
| **General**   | Anything descriptive: *sunset*, *red dress*, *forest*     |
| **Character** | Who appears in the image                                  |
| **Source**    | The story, book, game or series a character comes from    |
| **Artist**    | Who drew the image or took the picture                    |

The page has two tabs: **Name · color · order**, where you **create new types**, rename them, pick their color and change the order they're shown in; and **Custom fields**, where each type's fields are defined (see §5.5).

### 4.10 Collections

A list of all your collections, each with its cover, name and number of images.

- **New collection** creates an empty collection.
- Click a collection to open it.

### 4.11 Collection page

- **Header** — name, cover and description.
- **Images** in the collection's own order. Drag images to reorder them.
- Open any image to step through the collection in order in the viewer.
- **Remove from collection** (never deletes the file), plus the usual bulk actions.
- **Edit** the name, cover and description, or **delete** the collection (the images stay where they are).

### 4.12 Favorites

All your starred images from across the library, in one grid, with the usual sorting, filtering, tag sidebar and bulk actions. Open it from **Favorites** in the top bar or the **★ Favorites** button on the Library page.

It's a view, not a folder: starring an image doesn't move or copy it — it stays in its album, and unstarring it takes it off this page.

### 4.13 Random

Show a random image — from the whole library, a category, sub-category or album, a tag, or a collection. The current image is never repeated immediately. Also available from the viewer with the `R` key.

### 4.14 Recycle Bin

Images and folders you delete go here first.

- **Restore** puts an item back where it came from (or somewhere you choose, if that place no longer exists), with its tags and collections intact.
- **Delete permanently** removes it from disk.
- Favorited images are protected — you'll be asked to unfavorite them before they can be recycled. Recycling a selection that includes starred images recycles the others and keeps the starred ones; a folder with starred images inside can't be recycled until they're unstarred.
- **Empty the bin** deletes everything in it. Nothing is ever deleted from the bin automatically.

### 4.15 Library Health

A maintenance page that compares your library folder with what the app remembers and lists anything that needs attention, grouped and colored by severity (see §3.3). Each item comes with suggested fixes you can apply one by one, or all at once with **Apply to all**.

**Red — missing**
- **Missing folders** — folders the app remembers but can't find. *Recreate* them, or *Forget* them.
- **Missing images** — pictures the app remembers but can't find, shown with their old tags. *Locate…* them, or *Forget* them.

**Amber — needs a decision**
- **Changed outside the app** — folders or images that were moved or renamed in Windows Explorer. The app is already following them; *Keep* the change, or *Undo* it to put things back where they were. Images moved together are grouped into one item.
- **Unclear moves** — an image reappeared that matches several identical missing images, each with its own tags. Pick which one it is, or keep it as a new image.
- **Rule problems** — loose images in a category or sub-category, folders inside an album. *Fix: move the images into a new album; move the folder out.*
- **Unmarked folders** — new folders created outside the app. They show up right away with the kind the app guessed (folders with images → album; folders with folders → sub-category; empty ones → album, marked as a guess), and you confirm or change it here.
- **Wrong file types** — videos, audio or other files found among your images.

**Blue — for your information**
- **New images** — pictures added from outside the app, ready to be tagged.
- **Duplicates** — identical images stored in more than one place.
- **Thumbnail cleanup** — remove cached thumbnails that no longer belong to any image.

**Logs** — the app keeps a log of errors, every fix applied on this page and every bulk operation (see §7). This section shows how much space the logs use, with **Open logs folder** and **Clear logs**.

**Rescan** checks the whole library again on demand.

### 4.16 Settings

- **Library** — see which library is open, **Open library…** to switch to another folder, or **New library…** to start one. Recent libraries are listed for quick switching.
- **Theme** — see §4.18.
- **Grid defaults** — default column count and sort order.
- **Slideshow** — default interval.

### 4.17 Help

Click **?** in the top bar, or press `F1`, on any page. The Help window has four tabs:

- **This page** — what the page you're on is for and everything you can do on it.
- **Shortcuts** — the keyboard shortcuts available on this page.
- **Formats** — the file types each module supports.
- **About** — the app's version and release date, and who made it: Felipe, with Claude (Anthropic's AI).

### 4.18 Themes

This version comes with one style, **Darkroom**: dark, sharp and restrained, so your images stand out.

Other styles are being considered — **Mochi**, **Scriptorium** and **Sticker Riot**. Click the theme button in the top bar (or go to Settings) and choose **Check styles** to see a preview of each one. The previews are only for looking; they don't change the app.

When more styles are available, the same button will open a theme picker with a mini preview of each one.

---

## 5. Tags in depth

### 5.1 Tag types

Every tag belongs to exactly one type. The type gives the tag its color and tells you what it means: `alice` as a **Character** is the person in the picture; `alice` as an **Artist** is the person who drew it. Both can exist side by side.

Tag names are case-insensitive, and a space and an underscore count as the same: *red dress*, `red_dress` and *Red Dress* are all one tag. Tags are always shown with spaces; in the search box you write them with underscores (see §5.6).

### 5.2 Aliases and the main name

Every tag has one **main name** — the one shown everywhere — and can have any number of **aliases**: other names that lead to it. If `lotr` is an alias of the source `the lord of the rings`, typing `lotr` anywhere — when tagging or searching — uses `the lord of the rings`. Useful for abbreviations, nicknames, common typos, or names in another language.

The main name is the one the tag was created with. To change it, use **Make main name** on any alias in the tag's wiki page: the alias becomes the main name, and the old main name becomes an alias.

### 5.3 Merging tags

Merging is a one-time cleanup for when you've ended up with two tags that mean the same thing. Say some images are tagged `lotr` and others `the lord of the rings`. Merging `lotr` into `the lord of the rings`:

1. moves every image from `lotr` to `the lord of the rings`;
2. removes `lotr` as a tag;
3. turns `lotr` into an alias, so typing it still works (you can switch this off).

The tag you merge **into** keeps its main name; you can change it afterwards (see §5.2).

In short: **an alias is a rule for the future; a merge fixes the past and then creates the alias.**

### 5.4 Implications

An implication says "whenever an image has tag A, it also has tag B". The most common use is connecting a character to its source:

> `character:frodo` implies `source:the lord of the rings`

Tag an image with *frodo* and the source tag is added automatically. Implied tags are marked so you can tell them apart from the ones you added yourself. Implications can chain (A → B → C).

### 5.5 Custom fields

Each tag type can have its own set of **fields** — extra information every tag of that type can fill in, shown as the info box on its wiki page. You define them on the **Tag types** page.

Each field has a **name** and a **kind**:

| Kind            | Example                                         |
|-----------------|-------------------------------------------------|
| Text            | Character › *Full name*                         |
| Long text       | Character › *Personality*                       |
| Number          | Character › *Age*                               |
| Date            | Source › *Release date* — a year, year-month or full date (`1954`, `1954-07`, `1954-07-29`) |
| Link            | Artist › *Website* — starts with `http://`, `https://` or `file://` |
| Choice          | Source › *Kind* (book, game, series, film…)     |
| Image           | Character › *Reference sheet* — any image in the library |
| Tag reference   | Character › *Related characters* — one tag, or several in a chosen order |

The app comes with a few suggested fields for the built-in types; you can rename, reorder or delete them, and add your own. Fields left empty are simply not shown. Text holds up to 500 characters, long text up to 5,000.

On **Tag types › Custom fields**, pick a type on the left to see its fields: their order (▲ ▼), name, kind, and how many of the type's tags have filled each one in. **Settings ▾** holds what a kind needs: the **options** of a *Choice*, the **unit** shown after a *Number* (`cm`, `years`), and for a *Tag reference* which **types** it allows and whether it takes **multiple** tags. Removing a choice clears it from the tags that had it.

- **Changing a field's kind** keeps the values that can be read as the new kind: the menu shows, for each kind, whether all values convert or how many would be cleared. If some would be, the app says so and asks before clearing them. Turning a field into a *Choice* makes its existing values the options. *Image* and *Tag reference* fields can't convert to or from other kinds.
- **Deleting a field** removes its values from every tag, after asking.
- **Changing a tag's type** keeps the values of fields that the new type also has (same name and kind); before saving, **Edit tag** lists exactly which values would be lost.
- **Merging tags** fills the kept tag's empty fields from the merged ones, and tag references to the merged tags point to the kept one.

### 5.6 Search syntax

| You type                  | You get                                               |
|---------------------------|-------------------------------------------------------|
| `beach`                   | Images whose file name or folder contains "beach"     |
| `#sunset`                 | Images tagged *sunset*                                |
| `#sunset #forest`         | Tagged *sunset* **and** *forest*                      |
| `#sunset -#people`        | Tagged *sunset* but **not** *people*                  |
| `~#cat ~#dog`             | Tagged *cat* **or** *dog* (at least one)              |
| `#outdoor ~#cat ~#dog`    | Tagged *outdoor*, **and** *cat* or *dog*              |
| `#character:alice`        | Only the **Character** tag *alice*                    |
| `character:alice`         | Same as above — shorthand, booru style                |
| `-artist:bob`             | Excludes the **Artist** tag *bob*                     |
| `beach #sunset`           | Name/folder contains "beach" **and** tagged *sunset*  |
| `#red_dress`              | Tagged *red dress* — in search, spaces in tag names are written as `_` |

While you type, suggestions appear, colored by tag type and showing how many images use each tag. Aliases are resolved automatically.

---

## 6. Supported formats

JPG, JPEG, JFIF, PNG, GIF (including animated), WebP, SVG and AVIF.

---

## 7. Good to know

- **Offline and private.** The app never connects to the internet.
- **Desktop only.** Designed for a computer screen with mouse and keyboard.
- **Thumbnails** are generated in the background the first time images are seen, and kept so they only need to be made once.
- **Logs** are kept in `.mediaview\logs\` inside your library: errors, Library Health fixes and bulk operations, one file per day. Old logs are deleted automatically (at most 100 log files and 50 MB are kept, oldest removed first), and you can clear them from Library Health.
- **Back up the whole library folder**, including the hidden `.mediaview` folder — that's where your tags, collections and descriptions live.

---

## 8. Glossary

| Term             | Meaning                                                                  |
|------------------|--------------------------------------------------------------------------|
| **Library**      | The folder that holds your media and the app's data about it.            |
| **Category**     | A top-level folder inside `Images\` — a rack.                            |
| **Sub-category** | A folder inside a category or another sub-category — a drawer.           |
| **Album**        | A folder that holds images and nothing else — a photo album.             |
| **Inbox**        | The special album where new images arrive before being filed.            |
| **Collection**   | An ordered list of images from anywhere in the library. Moves no files.  |
| **Tag**          | A label attached to an image, with a type and its own wiki page.         |
| **Tag type**     | The kind of a tag: General, Character, Source, Artist, or your own.      |
| **Custom field** | A piece of information defined per tag type, shown in the info box.      |
| **Main name**    | The name a tag is shown with; its other names are aliases.               |
| **Alias**        | Another name that points to an existing tag.                             |
| **Merge**        | Folding one tag into another, leaving the old name as an alias.          |
| **Implication**  | A rule that automatically adds one tag whenever another is present.      |
| **Marker file**  | The hidden file (`.category`, `.subcategory`, `.album`, `.inbox`) identifying a folder. |
| **Favorite**     | An image you've starred; protected from accidental recycling.            |

---

## 9. For the future

- **Videos, Audio and Text-Writer modules**, built on the same library, folders, tags and collections — so a character's wiki page can show their images, videos and the stories they appear in.
- **A desktop app.** media-view will be packaged as a standalone desktop application (Electron): opened from the Start menu like any other program, with its own window, no browser and no launcher script.
- **Custom themes**, created and edited inside the app.
