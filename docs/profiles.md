# media-view — Local Profiles

> **Status:** built 2026-10-14 (migration 007, `services/profiles.ts`, `routes/profiles.ts`, `stores/profile.svelte.ts`); tester checklist in `testing/profiles-test-guide.md` · **Related:** `technical/images.md` §1 (single user), §5 (config and library), §6 (data model) · `archive/future-features-ai-and-downloader.md` §2 · `archive/Ai-features-runtime-and-consent.md` §3–§4 · `archive/review-features-and-ai-docs.md` §2.1, §6.3
>
> Replaces future-features §2. Answers review §6.3 (single-user profiles or users with passwords): **several local profiles, each with an optional password**. Decisions are recorded in §11.

---

## 1. What a profile is

A **profile** is a name, a picture and a few things that belong to one person, so several people can share a library on one computer, without stepping on each other's favorites and settings. Some of it also tells the app **who you are** in the library: the tags that are *you* (as an artist, as a model, as a character), which feed **Images by me** and **Featuring you**, and, later, AI consent for your own likeness.

- **Not an account.** No server, no email, no recovery service, no network. Fully offline.
- **No change for a single user.** A library always has at least one profile. With one profile and no password, the app opens straight into it and nothing new appears except the avatar in the top bar.
- **Shared library, personal layer.** Folders, images, tags, the wiki, collections, Library Health and the Recycle Bin stay shared: they describe the files, and the files are the same for everyone. A profile adds a personal layer on top (§3).

### 1.1 What a password protects (and what it doesn't)

A password stops someone **using the app as you**: opening your profile, changing your favorites and settings, linking tags to you, and (later) your AI content settings. It does **not** hide images: the library is a normal folder on disk, and anyone who can open the app or Explorer can see it. The UI says so in one line where a password is set:

> *A password keeps others from using media-view as you. It doesn't hide your images: anyone with access to this computer can still open the library folder.*

Passwords are **hashed, never encrypted or stored as typed**, including in test builds (review §2.1): Node's built-in `crypto.scrypt`, a random salt per profile, compared with `timingSafeEqual`. Same effort as plaintext, no new dependency.

Hiding content (private albums, encrypted libraries) is a different feature. If it's ever wanted, it needs real encryption at rest and is out of scope here (§10).

---

## 2. Where profiles live

**In the library DB.** Everything a profile owns is about the library's content (favorites point at files, links point at tags, consent will point at tags and files), and the library is what travels: a library on an external drive opened on another computer brings its profiles along, with their favorites and links intact.

| Where | What | Why |
|---|---|---|
| `<library>/.mediaview/library.db` | Profiles, password hashes, favorites, tag links, per-profile preferences | Owned by the library's content; travels with it |
| `%APPDATA%\media-view\config.json` | `lastProfile` per library (by library id), port, recent libraries | About this machine, not the library |

The same person in two libraries has two profiles. That's acceptable: libraries are separate worlds already (tags are per library). If it ever becomes annoying, *Copy profile from another library…* can bring over name, picture and preferences; links and favorites can't follow, since they point at things in the other library.

**Rejected:** a global `%APPDATA%\media-view\user.db` with links in each library (future-features §2). It splits one profile across two places, needs reconciling when a library moves to a computer that doesn't know its profiles, and gains nothing while every per-profile thing is library content.

---

## 3. What belongs to a profile

| Thing | Today | With profiles |
|---|---|---|
| **Favorites (stars)** | `files.favorited` — one set for the library | **Per profile.** Each profile has its own stars and its own Favorites page |
| **Grid and slideshow preferences** | `localStorage` — per browser | **Per profile**, stored in the DB; `localStorage` stays only as a cache for fast startup |
| **Theme** | `config.json` `ui.theme` — per machine | **Per profile**; `ui.theme` keeps the last one used on this computer, for the picker (§4.1) |
| **Tag links** (*by me*, *featuring you*) | — | **Per profile** (§5) |
| **Picture** | — | Per profile (§4.3) |
| **AI settings** (NSFW opt-in, own likeness) | — | Per profile, when AI lands (§8) |
| Folders, images, tags, wiki, descriptions | Library | **Shared**, unchanged |
| Collections | Library | **Shared**, with *created by* shown (§11) |
| Recycle Bin, Library Health, logs | Library | **Shared**; bulk operations and fixes log who did them (§7) |
| Keyboard hints seen (`kbd.hinted.*`) | `localStorage` | Stays in `localStorage` (harmless if shared) |

### 3.1 Stars that protect files

Stars do more than mark favorites: they protect images. With per-profile stars, every protection uses **"starred by anyone"**: an image one profile cares about is protected for everybody. The grid shows only your own stars; wherever a protection kicks in, the message names who starred it (*Starred by Felipe, Rubio*). Nobody can remove someone else's star, so the person who starred an image is the only one who can lift its protection.

- **Name clashes** (images.md §8.4): an image starred by anyone is never replaced; *Replace* keeps both instead, as today.
- **Recycling** (user guide §4.14):
  - An image **you** starred: asked to unstar it first, as today.
  - An image **someone else** starred: refused, with the reason (*Starred by Felipe*). In a selection, the others are recycled and the starred ones are kept and reported, as today, now with who starred them.
  - A **folder** holding images starred by anyone: refused, naming who (*“Memes” contains 3 images starred by Felipe and 1 by Rubio*).
- **Duplicates** (images.md §7.4): the suggested copy is the one starred by anyone; two copies starred (by the same or different profiles) have no default, as today. **Merge into…** gives the kept copy **every profile's stars** from all the copies, not one star.
- **Forget** (missing images) deletes every profile's stars with the rest; its confirmation names whose stars go.

---

## 4. Using profiles

### 4.1 Starting the app

- **One profile, no password:** opens straight in, as today.
- **Several profiles:** opens into the **last one used on this computer** (`lastProfile`) if it has no password. If it has one, or there's no last profile, the app shows the **profile picker**.
- **Profile picker:** a full page with one card per profile (picture or initials, name, a lock icon if it has a password) and **+ New profile**. Click a card → opens it, asking for the password if there is one. Keyboard: arrows move between cards, Enter opens (the usual `use:navItems`).
- **The picker's theme:** no profile is active yet, so it uses the last theme used on this computer (`config.json` `ui.theme`, updated whenever the active profile's theme changes), or Darkroom when there's none.

### 4.2 The top bar

The **avatar** (picture or initials) sits at the right end of the top bar. Click it (or right-click) for the profile menu:

- **Your profile** — opens the profile page (§4.4).
- **Switch profile…** — the picker.
- **Lock** — only when the profile has a password: back to the picker without closing anything else.
- **Settings**.

### 4.3 Name and picture

- **Name:** up to 50 characters, unique in the library (compared like collection names: case and space vs. `_` don't count).
- **Picture:** any image in the library, chosen in its own picker (`ProfilePictureDialog`: your favorites first, any image with a search), shown as a square crop of its thumbnail. No picture → initials on a color chosen from a small palette. Recycling or forgetting the image falls back to initials (`ON DELETE SET NULL`).

### 4.4 The profile page (`#/profile/:id`)

- **Header:** picture, name, *Edit* (name, picture, color), *Password…* (set, change, remove).
- **Images by me:** the images tagged with any of the profile's *creator* tags (§5), as a strip with **See all**, which opens the Search page with that query.
- **Featuring you:** same, for *subject* tags.
- **Favorites:** your stars, with **See all** → the Favorites page.
- **Linked tags:** chips grouped by role, each with *Unlink*, and **Link a tag…**.
- Other profiles' pages can be **viewed** (their links and sections, not their favorites). Editing one means switching to it.

Each section is a saved search over the linked tags, so no new search machinery is needed. The query always names each tag **with its type** (`~#artist:alice ~#character:aerin`), because the same name can exist in two types (user guide §5.1) and `~#alice` would match both. A section with **no linked tags** shows *No tags linked yet · Link a tag…* and runs no search at all (an empty query would match every image). When the Videos, Audio and Texts modules exist, the same sections list those too.

### 4.5 Settings → Profiles

Lists every profile, with **New profile…**. Only the active profile can be changed (every change is made as yourself, §7.2), so its row has **Rename**, **Picture…** and **Password…**; the other rows have **Switch to…** and **Delete…**. Deleting:

- is refused for the **last** profile, and for a protected profile unless its password is given;
- removes its favorites, links and preferences, and nothing else (images, tags and collections are shared); collections it created keep existing, with *created by* cleared;
- asks first, listing what goes: *Rubio's 214 favorites and 3 tag links will be removed. Images and tags stay.*

### 4.6 Forgotten passwords

There's no recovery: nothing to email, and a "security question" would be weaker than the password. Since a password only gates the app (§1.1), the honest fallback is a maintenance command run from the app folder:

```
npm run profile:reset-password -- "<library path>" "<profile name>"
```

It clears the hash and logs it. Anyone who can run commands on the computer can already read the library, so this gives away nothing. In the portable zip it's a `reset-password.bat` next to `start.bat`.

---

## 5. Linking tags to a profile

A link says *this tag is me, in this role*. Roles:

| Role | Meaning | Section |
|---|---|---|
| **creator** | Your artist name, your studio, your pen name | **Images by me** |
| **subject** | You as a model, your self-portrait tag, a character you play or cosplay | **Featuring you** |

- A profile can link **any number of tags** in each role, of any type (an *Artist* tag and a *Character* tag are both fine). A tag can be linked to **one profile per role**: two people can't both be the creator `felipe_art`.
- **Implications count.** Links are matched like a search, so an image tagged with something that implies a linked tag shows up too.
- **Where links are made:**
  - the profile page (*Link a tag…*);
  - the tag's wiki page: a **Linked to** line under the title (*Felipe · creator*), and a **This is me ▸** button in its header (Creator / Subject; choosing a role you hold unlinks it);
  - the tag context menu everywhere (*This is me · Images by me*, *This is me · Featuring you*).
- **Merging tags** (A into B) moves A's links to B, unless that would give B two profiles in one role; then B's link stays and A's goes. (The merge dialog doesn't list the clash yet.)
- **Deleting a tag** removes its links (`ON DELETE CASCADE`).

### 5.1 Later: search shortcuts

`by:me` and `featuring:me` (and `by:"Rubio"`) as search terms, expanding to the linked tags. Cheap to add once links exist; not in the first version.

---

## 6. Data model

Migration `007_profiles.sql`:

```sql
CREATE TABLE profiles (
  id              INTEGER PRIMARY KEY,
  uuid            TEXT    NOT NULL UNIQUE,
  name            TEXT    NOT NULL,
  name_norm       TEXT    NOT NULL UNIQUE,              -- compared like collection names
  picture_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  color           TEXT    NOT NULL,                     -- '#RRGGBB', initials background
  pass_hash       TEXT,                                 -- 'scrypt$N$r$p$<salt b64>$<hash b64>'; null = no password
  prefs           TEXT    NOT NULL DEFAULT '{}',        -- JSON: grid.*, viewer.*, theme
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_used_at    INTEGER
);

CREATE TABLE profile_favorites (
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_id    INTEGER NOT NULL REFERENCES files(id)    ON DELETE CASCADE,
  added_at   INTEGER NOT NULL,
  PRIMARY KEY (profile_id, file_id)
);
CREATE INDEX profile_favorites_file ON profile_favorites(file_id);

CREATE TABLE profile_tags (
  tag_id     INTEGER NOT NULL REFERENCES tags(id)     ON DELETE CASCADE,
  role       TEXT    NOT NULL CHECK (role IN ('creator','subject')),
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tag_id, role)                            -- one profile per tag and role
);
CREATE INDEX profile_tags_profile ON profile_tags(profile_id);

ALTER TABLE collections ADD COLUMN created_by INTEGER REFERENCES profiles(id) ON DELETE SET NULL;
```

### 6.1 Upgrading an existing library

The favorites move **inside migration 007**, in the same transaction that creates the tables, so no order of builds can drop `files.favorited` before it's copied. SQL can't know the user's name, so the first profile gets a placeholder that the service renames on first open:

```sql
-- 007_profiles.sql, after the CREATE TABLEs above
INSERT INTO profiles (uuid, name, name_norm, color, prefs, created_at, updated_at)
VALUES (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-'
              || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
        'Me', 'me', '#ff4b2b', '{"_import":true}',
        CAST(unixepoch('subsec') * 1000 AS INTEGER), CAST(unixepoch('subsec') * 1000 AS INTEGER));

INSERT INTO profile_favorites (profile_id, file_id, added_at)
SELECT (SELECT id FROM profiles), id, CAST(unixepoch('subsec') * 1000 AS INTEGER) FROM files WHERE favorited = 1;

INSERT INTO settings (key, value) VALUES ('profiles.nameFirst', '1');

DROP INDEX files_fav;
ALTER TABLE files DROP COLUMN favorited;
```

Then, on first open:

1. **Name.** `services/profiles.ts` sees `profiles.nameFirst`, renames the profile to the Windows user (`os.userInfo().username`; stays *Me* if that name is unusable), sets its theme from `config.json` `ui.theme`, and deletes the setting.
2. **Preferences.** `prefs` starts as `{"_import": true}`. The client sees the marker on first load and sends its `localStorage` grid and slideshow preferences (`POST /api/profiles/me/import-prefs`), since only the browser can read them; the server merges them and drops the marker.
3. **Log:** `profiles · first profile created · { uuid, name, favorites: 312 }`.

A new library gets the same first profile from the same migration (with no favorites to copy).

Because 007 drops `files.favorited`, it ships in the same build as the services that stop reading it. An older build opened against a migrated library would fail on the missing column, so `FORMAT_VERSION` in `library.json` is bumped: older builds refuse the library with their existing "made by a newer version" message (`services/library.ts`).

### 6.2 Queries that change

- **`favorited` on file rows** becomes `EXISTS (SELECT 1 FROM profile_favorites WHERE profile_id = :me AND file_id = f.id)`; `q.favorites` becomes a join on the same table.
- **"Starred by anyone"** (§3.1): `EXISTS (SELECT 1 FROM profile_favorites WHERE file_id = f.id)`. Used by `file-ops.ts` (name clashes), `recycle.ts` (images and folders) and `health.ts` (duplicate suggestions). Refusals look up who starred (`JOIN profiles`) for the message.
- **Merge into…** (`health.ts`, today `UPDATE files SET favorited = 1` on the kept copy): `INSERT OR IGNORE INTO profile_favorites SELECT profile_id, :keepId, added_at FROM profile_favorites WHERE file_id IN (:others)`, so every profile's stars land on the kept copy.
- **The active profile** is passed to services explicitly (`me: number`), never read from a global inside a service, so services stay testable and reusable by Electron IPC (images.md §3).

---

## 7. Server and API

### 7.1 The active profile

The server already holds **one open library at a time**. It now also holds **one active profile** for it, the same way: switching profile is like a light library switch. It emits `profile-changed`, and every open tab whose profile is no longer the one in use reloads. Smaller changes (a rename, a picture, a password, links, a profile added or deleted) emit `profile-updated`, and tabs refresh the profile data in place. Two tabs with two different profiles at once isn't supported; it's a single-user-at-a-time app, as Electron will be.

- **Locked state:** when the library opens and its last profile has a password (or several profiles exist and there's no last one), no profile is active. Routes that read or change per-profile data answer **`401 { error: 'profile-required' }`** and the UI shows the picker. Library-level work (scan, hashing, thumbnails, watcher) runs regardless.
- **Wrong password:** `403`, after a fixed 500 ms delay (no lockout; this is a gate, not a vault).
- **Logs:** while a library has two or more profiles, log lines for bulk operations, Health fixes and deletions carry `profile: { uuid, name }`. The uuid is what identifies it (names change, and integer ids can be reused after a delete); the name is there for reading. With one profile it's left out, so logs look exactly as they do today.

### 7.2 Routes

Every change is made **as the active profile**, so writes go to `/me`; `:id` appears only where another profile is read, switched to or deleted.

| Method | Path | Purpose |
|---|---|---|
| GET    | `/api/profiles`                  | List: id, name, color, picture, `hasPassword`, `active` |
| POST   | `/api/profiles`                  | Create `{ name, password? }` |
| POST   | `/api/profiles/switch`           | `{ id, password? }` |
| POST   | `/api/profiles/lock`             | Back to the picker |
| DELETE | `/api/profiles/:id`              | `{ password? }` (that profile's); refused for the last profile |
| GET    | `/api/profiles/:id`              | One profile (any profile's page, §4.4) |
| GET    | `/api/profiles/:id/tags`         | Linked tags, by role (any profile's page, §4.4) |
| GET    | `/api/profiles/:id/impact`       | What deleting it removes: `{ favorites, links }` (the confirmation) |
| GET    | `/api/profiles/me`               | The active profile, with its prefs |
| PATCH  | `/api/profiles/me`               | `{ name, pictureFileId, color }` |
| POST   | `/api/profiles/me/password`      | `{ current?, next }`; `next: null` removes it |
| PATCH  | `/api/profiles/me/prefs`         | Partial prefs (replaces `PATCH /api/settings/ui` for the theme) |
| POST   | `/api/profiles/me/import-prefs`  | One-time move from `localStorage` (§6.1) |
| PUT    | `/api/profiles/me/tags`          | `{ tagId, role }` link |
| DELETE | `/api/profiles/me/tags`          | `{ tagId, role }` unlink |

The existing `POST /api/files/favorite` and `PATCH /api/files/:id { favorited }` keep their shape and act on the active profile. Recycle, move/copy and Health responses that refuse or skip starred images add who starred them (`starredBy: [{ id, name }]`, §3.1).

### 7.3 Frontend

- `stores/profile.svelte.ts`: the active profile and its prefs. `prefs.ts` reads from it and writes through `PATCH /api/profiles/me/prefs` (debounced), keeping `localStorage` as a startup cache.
- New pages: **Profile picker** (`#/profiles`), **Profile** (`#/profile/:id`). Settings gets a **Profiles** section.
- `Avatar.svelte`: picture or initials; used in the top bar, the picker, the profile page and the duplicate review's *Starred by*.
- Help: *This page* text for both new pages; user guide §2.6 (*The app remembers*), §4.12 (Favorites), §4.16 (Settings) updated, new §4.x *Profiles*.

---

## 8. What AI needs from profiles

Profiles come before AI because several AI decisions attach to *who*. Revised 2026-10-17 to match `ai.md` §11.

- **Show NSFW, per profile** (`ai.md` §11.3). A safe-for-work view, not a lock: with it off, images carrying a tag marked *Not safe for work* (directly or implied) are left out of grids, search, random, slideshows and viewer navigation, and the AI writes non-explicit text for that profile. Off for new profiles; turning it on the first time asks for a one-time confirmation, stored with its date. A field of its own with its own route, not inside `prefs`; no password needed beyond the profile's own. Needs no AI, so it can be built before `ai.md` phase 1.
- **The hard limit** (minors) applies to every profile and isn't a setting at all (`ai.md` §11.1).
- **Profile names** are matched like real-person tags: a generation prompt naming a profile is blocked (`ai.md` §11.1).
- **Your own likeness** isn't needed for now: nothing planned uses reference images. The profile's *subject* links only feed *Featuring you*. Revisit only if generating similar images (A12) is built from the image itself (`ai.md` §11.6).
- **Who asked.** AI jobs record the requesting profile in their trace and log line (future-features §8.1), and generated files can record it with their provenance (review §4.2 point 7).
- **Consent records** are dropped (`ai.md` §11.2): face recognition is a plain opt-in per library.

---

## 9. Testing

- **Services:** create, rename, delete (last one refused), password set / check / change / remove, scrypt hash format, wrong-password delay, favorites isolated per profile, "starred by anyone" for name clashes, recycling (own star, someone else's star, a folder holding either) and duplicate suggestions, *Merge into…* combining every profile's stars, links unique per tag and role, tag merge moving links (and the clash case), the profile sections' queries using typed tags and returning nothing with no links.
- **Migration 007:** on a database at 006 with starred images, the first profile exists, holds exactly those stars, `files.favorited` is gone, and the first open renames *Me* and clears `profiles.nameFirst`.
- **Routes:** `401 profile-required` while locked; switching emits `profile-changed`.
- **Upgrade:** open a copy of a real library from before migration 007; favorites and theme come through; an older build refuses the upgraded library.
- **UI checklist** for testers (as `docs/testing/`): single-profile library looks unchanged; picker; lock; two profiles starring different images; *Images by me* after linking a tag; the reset command.

---

## 10. Out of scope

- **Hiding content** per profile (private albums, private collections, hidden tags). Needs encryption to mean anything; revisit only if asked for.
- **Accounts across libraries** (one profile shared by every library). See §2, *Rejected*.
- **Remote or simultaneous users.** Still a local, one-person-at-a-time app (images.md §1).
- **Per-profile tags or wiki edits.** Tags describe files and stay shared. A "last edited by" line on wiki pages is possible later, with no access control.

---

## 11. Decisions

Confirmed 2026-10-13:

1. **Several profiles with optional passwords** (not single-user).
2. **Profiles live in the library DB** (§2), not in `%APPDATA%`.
3. **Collections stay shared**, showing *created by*. Private collections are a possible later addition (§11.1).
4. **Stars are per profile**, and "starred by anyone" protects files (§3.1).
5. **Theme and grid/slideshow preferences move to the profile** (§3).
6. **Forgotten password → a maintenance command** (§4.6), no in-app recovery.
7. **The first profile is named after the Windows user** on upgrade (§6.1), and can be renamed.

### 11.1 Later: private collections

Not planned; noted so `created_by` is enough to add them without reshaping anything. Cost: about a day or two.

- **Data:** one column, `collections.private INTEGER NOT NULL DEFAULT 0`, plus `created_by` (already added by 007).
- **Visibility:** one helper (`visibleCollections(me)`: shared, or private and mine) used wherever collections are read: the Collections page, a collection page, `@name` in searches, the index's Collections section, group by collection, *Add to collection…* and *Cover of ▸*, the wiki's "collections holding this tag's images" and the per-image collection counts. Most of these live in `services/collections.ts` and `services/files.ts`.
- **Decisions it would need:**
  - **Names:** unique per library today (`name_norm`). A private name blocking a shared one tells others it exists, so names would become unique among what each profile can see. `@name` then resolves to the visible one.
  - **Invisible places still count:** duplicate *Merge into…*, *Forget* and recycle/restore keep updating every collection, private ones included. Messages only count the ones you can see.
  - **Deleting the owner:** their private collections are deleted with them, or become shared. The delete dialog would ask.
- **Same caveat as passwords (§1.1):** private means hidden in the app, not encrypted.
