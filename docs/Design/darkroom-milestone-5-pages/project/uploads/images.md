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
- **Drag and drop** images from Windows Explorer onto the app to add them: onto an album page or album card to add them there, anywhere else to send them to the Inbox.

### 3.1 Tags, wherever you see them

Tags appear as colored chips (the color comes from the tag's type). They behave the same everywhere:

| Action           | Result                                                                  |
|------------------|-------------------------------------------------------------------------|
| Hover            | Shows the tag's description                                             |
| Click            | Shows all images with that tag                                          |
| Ctrl + click     | Opens the tag's wiki page                                               |
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

- The folder's **cover** and **description** are shown at the top.
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

**Adding images** — **Add images** opens the Windows file picker, or drag files from Explorer onto the page. Either way, they're copied into this album.

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
  - Tags added automatically by an implication (see §5.4) are marked as such and can't be removed on their own — the tooltip tells you which tag implies them.
- **Collections panel:** which collections the image is in; add it to another one.
- **Favorite**, **Open With…** (opens the file in another program), **Rename**, **Move**, **Set as cover of ▸**, **Recycle**.

When opened from a collection, the viewer shows your position in it (e.g. *3 / 12 in "Chapter 3 refs"*).

**Keyboard shortcuts** *(to be revised)*

| Key          | Action                           |
|--------------|----------------------------------|
| `←` / `→`    | Previous / next image            |
| `+` / `-`    | Zoom in / out                    |
| `0`          | Reset zoom                       |
| `F`          | Fullscreen                       |
| `R`          | Random image                     |
| `S`          | Start / stop slideshow           |
| `Esc`        | Exit fullscreen / stop slideshow |
| `Backspace`  | Back to the previous page        |
| `F1`         | Help                             |

### 4.6 Search

Search from the box in the top bar on any page. Results cover your whole library, split into tabs:

- **Images** — matching images, with the same sorting, filtering, tag sidebar and bulk actions as an album.
- **Folders** — categories, sub-categories and albums whose names match.
- **Tags** — tags whose names or aliases match, linking to their wiki pages.
- **Collections** — collections whose names match.

Plain text and tag filters can be mixed in the same search; see §5.6.

### 4.7 Tags

A directory of every tag in your library.

- Tags are grouped by **type**, each type with its own color.
- Each tag shows how many images use it.
- Search the list, sort by name or count, and filter by type.
- **New tag** creates a tag in advance, before using it on any image.
- Select several tags to **merge** them (see §5.3) or delete them.

### 4.8 Tag wiki page

Every tag has its own wiki page.

- **Header** — the tag's main name, its type (in the type's color), its **cover image** (for example a character's portrait) and its aliases, shown as *"also known as …"*.
- **Info box** — the tag's **custom fields** (see §5.5), such as a character's species or an artist's website. Empty fields are hidden.
- **Description** — free text with basic formatting (headings, bold, lists, links). You can link to other tags by writing `[[character:frodo]]`, so pages connect to each other like a real wiki. The first paragraph is also the tooltip you see when hovering the tag anywhere in the app.
- **Preview** — a strip of images carrying the tag, with **See all** opening the full gallery with sorting, filtering and the tag sidebar.
- **Relationships**
  - **Implies / Implied by** — e.g. a character's page shows its source; a source's page lists its characters (see §5.4).
  - **Related tags** — tags that often appear together with this one, worked out automatically from your images.
- **Collections** — collections containing images with this tag.
- **Edit** the name, type, cover, description, fields, aliases and implications; choose which name is the main one (see §5.2); **merge** it into another tag; or **delete** it.

### 4.9 Tag types

Where you manage the kinds of tags that exist. The app comes with:

| Type          | Used for                                                  |
|---------------|-----------------------------------------------------------|
| **General**   | Anything descriptive: *sunset*, *red dress*, *forest*     |
| **Character** | Who appears in the image                                  |
| **Source**    | The story, book, game or series a character comes from    |
| **Artist**    | Who drew the image or took the picture                    |

You can **create new types**, rename them, pick their color, change the order they're shown in, and **define their custom fields** (see §5.5).

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

All your starred images from across the library, in one grid, with the usual sorting, filtering, tag sidebar and bulk actions.

### 4.13 Random

Show a random image — from the whole library, a category, sub-category or album, a tag, or a collection. The current image is never repeated immediately. Also available from the viewer with the `R` key.

### 4.14 Recycle Bin

Images and folders you delete go here first.

- **Restore** puts an item back where it came from (or somewhere you choose, if that place no longer exists), with its tags and collections intact.
- **Delete permanently** removes it from disk.
- Favorited images are protected — you'll be asked to unfavorite them before they can be recycled.

### 4.15 Library Health

A maintenance page that compares your library folder with what the app remembers and lists anything that needs attention, grouped and colored by severity (see §3.3). Each item comes with suggested fixes you can apply one by one, or all at once with **Apply to all**.

**Red — missing**
- **Missing folders** — folders the app remembers but can't find. *Recreate* them, or *Forget* them.
- **Missing images** — pictures the app remembers but can't find, shown with their old tags. *Locate…* them, or *Forget* them.

**Amber — needs a decision**
- **Changed outside the app** — folders or images that were moved or renamed in Windows Explorer. The app is already following them; *Keep* the change, or *Undo* it to put things back where they were. Images moved together are grouped into one item.
- **Unclear moves** — an image reappeared that matches several identical missing images, each with its own tags. Pick which one it is, or keep it as a new image.
- **Rule problems** — loose images in a category or sub-category, folders inside an album. *Fix: move the images into a new album; move the folder out.*
- **Unmarked folders** — new folders created outside the app. The app guesses their kind (folders with images → album; folders with folders → sub-category) and asks you to confirm; empty ones you choose yourself.
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

Tag names are case-insensitive.

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
| Date            | Source › *Release date*                         |
| Link            | Artist › *Website*                              |
| Choice          | Source › *Kind* (book, game, series, film…)     |
| Image           | Character › *Reference sheet*                   |
| Tag reference   | Character › *Related characters*                |

The app comes with a few suggested fields for the built-in types; you can rename, reorder or delete them, and add your own. Fields left empty are simply not shown.

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
