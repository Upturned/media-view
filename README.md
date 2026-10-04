# media-view

A personal, offline media library. Design docs live in [`docs/`](docs/).

## Run

```sh
npm install
npm run dev      # server on :4321 + Vite on http://localhost:2080 (hot reload)
```

Production-style: `npm run build` then `npm start` → http://localhost:4321.

## Checks

```sh
npm test         # Vitest (server services against temporary libraries)
npm run check    # TypeScript (server) + svelte-check (web)
```

## Layout

- `shared/` — types and helpers used by both sides
- `server/` — Hono API, SQLite (better-sqlite3), services, workers
- `web/` — Svelte 5 frontend
