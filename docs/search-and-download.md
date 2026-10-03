# media-view — Search and Download

> **Status:** planned feature, after the Videos and Audio modules exist · **Related:** `technical/images.md` §1 (offline rule), §8.3 (import)

---

## 1. What it does

A **Search and Download** button opens a search UI where the user:

1. Types a query and picks a source (YouTube, SoundCloud, …).
2. Sees the first **N** results (title, channel, duration, thumbnail).
3. Chooses **video** or **audio** for each result and downloads it.
4. The file lands in the matching module's Inbox: `Videos/Inbox/` or `Audio/Inbox/`.

Secondary: **download from a URL** (YouTube, Reddit, Twitter/X and other supported sites).

---

## 2. Feasibility

Built on two bundled command-line tools:

- **yt-dlp** — search and download.
  - Built-in search: `ytsearchN:<query>` (YouTube), `scsearchN:<query>` (SoundCloud).
  - Download by URL from hundreds of sites, including YouTube, SoundCloud, Reddit, Twitter/X.
  - Metadata as JSON (`--dump-json`) for the results list, without downloading.
- **ffmpeg** — audio extraction (`-x --audio-format mp3/m4a/opus`) and video+audio merging.

**Not included:** **Spotify**. Its audio is DRM-protected; the only workaround is matching tracks on YouTube, which isn't always the same recording. Dropped.

---

## 3. Isolation

The rest of media-view stays fully offline. The downloader is a **separate process** — that is what isolates it, not the port or the tab.

```
media-view server (offline) ──spawns/stops──► downloader process (only one allowed on the network)
        │                                           │
        │  proxies /api/downloader/*  ◄─────────────┘  runs yt-dlp / ffmpeg
        ▼
  normal import → Videos/Inbox or Audio/Inbox
```

- **Own process, own port** on `127.0.0.1`, started only when the feature is enabled (and stoppable). In Electron, a utility process.
- It never touches the library DB. Downloads go to a temp folder; when complete, the main server imports them through the **normal import path** (§8.3) into the module's Inbox. To the rest of the app it is just an import.
- The main server is the only thing the UI talks to; it proxies `/api/downloader/*` to the downloader's port (so no cross-origin setup, and it can refuse when the feature is off).
- The offline rule in the technical doc becomes: *"The network is used by `npm install` and by the downloader process — only when the user enables it and starts a search or download."*

### 3.1 Dialog or new tab?

Both work; isolation doesn't depend on it.

- **Dialog inside media-view (recommended):** consistent with the rest of the app, can show download progress and "open in Inbox" directly.
- **New tab on the downloader's own port:** possible too (the downloader serves its own small page; media-view knows the port and opens it). It makes the separation more visible, but loses the shared top bar, theme and in-app progress.

Either way, the UI can also be **bundled in media-view** while the network code lives only in the downloader process.

---

## 4. Availability: setting and connection

The button is **disabled** with an explanation when the feature can't work:

| State                         | Button   | Message                                                     |
|-------------------------------|----------|-------------------------------------------------------------|
| Setting off                   | Disabled | "Search and Download is turned off in Settings."            |
| No internet connection        | Disabled | "No internet connection available for this feature."        |
| Tools missing (yt-dlp/ffmpeg) | Disabled | "Downloader components are not installed."                  |
| Ready                         | Enabled  | —                                                           |

- **Connection check** is done by the downloader process (a quick request to the source, e.g. YouTube), not by `navigator.onLine`, which only knows about the network adapter. Rechecked when the dialog opens and periodically while the app is open; reported over `/api/events`.
- When the setting is off, the downloader process isn't running at all.

---

## 5. Settings

- **Search and Download:** on / off (default **off**).
- Default results count **N** (e.g. 10).
- Default audio format (mp3 / m4a / opus) and max video quality.
- **Update yt-dlp** button — sites change often and break yt-dlp, so it must be updatable from the app (this also uses the network).

---

## 6. Considerations

- **Terms of service / copyright:** downloading from these platforms may break their terms; the feature is meant for personal use, and that responsibility is left to the user. Worth a one-line note in the dialog or Settings.
- **Bundle size:** yt-dlp (~15 MB) and ffmpeg (~80 MB) are large; could be an optional download on first enable instead of shipped by default.
- **Metadata:** title, uploader and source URL can be saved as the file's description, and the uploader could become an Artist tag automatically.
- **Logging:** each download is logged like a bulk operation (§3.1 of the technical doc).
- **Order:** depends on the Videos and Audio modules (their Inboxes and import paths).
