# media-view

A personal, offline media library. Design docs live in [`docs/`](docs/).

## Run

```sh
npm install
npm run dev      # server on :4321 + Vite on http://localhost:2080 (hot reload)
```

Production-style: `npm run build` then `npm start` → http://localhost:4321.

## Package

```sh
npm run package  # release\media-view-<version>-win-x64.zip — unzip anywhere, double-click start.bat
```

A portable build for Windows 10/11 64-bit: the bundled server, the web app, the native modules and
a `node.exe` of the same version as yours (downloaded once into `release\.cache`). Run it on Windows x64.
See technical doc §14.1.

## Checks

```sh
npm test         # Vitest (server services against temporary libraries)
npm run check    # TypeScript (server) + svelte-check (web)
```

## Layout

- `shared/` — types and helpers used by both sides
- `server/` — Hono API, SQLite (better-sqlite3), services, workers
- `web/` — Svelte 5 frontend
