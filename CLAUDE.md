# geo-grid-places-search — CLAUDE.md

## Stack
- `main.ts` → scrapes geo-grid → `exports/cities/places_City.csv`
- `enrich.ts` → enriches CSV via Places API → `exports/data/enriched_City.json` + `.csv`
- `server.js` → local dev server; auto-runs `gen-config.js`; exposes `/api/manifest` + `/api/save-enriched`
- `dashboard.html` — city dropdown auto-load, browser enrichment, website generator, GitHub commit

## Folder Structure
- `exports/cities/*.csv` — raw city scrapes (was `exports/places_*.csv`)
- `exports/enriched/{CityKey}_{BizSlug}.csv` — auto-saved browser-enriched CSVs (one per place)
- `exports/data/` — CLI `enrich.ts` output only (unchanged)

## Run Commands
- `node server.js` — starts dashboard; auto-runs `gen-config.js`; no separate step needed
- `npx ts-node main.ts "Austin" --types=restaurant,cafe`
- `npx ts-node enrich.ts Austin [flags]`
- `node test-api.js [placeId]` — smoke-test Places API + CDN photo resolution

## Server API (server.js)
- `GET /api/manifest` — live-scans `exports/cities/` + `exports/enriched/`, returns cities array with `enrichedPaths`
- `POST /api/save-enriched` `{ filename, content }` → saves to `exports/enriched/`, returns updated manifest
- Extension-less URLs (e.g. `/dashboard`) → server appends `.html` automatically (preview tool strips extension)

## Places API (New) — Critical Gotchas
- Field `wheelchairAccessibleEntrance` is NOT top-level — use `accessibilityOptions` instead; using the wrong name causes `400 INVALID_ARGUMENT` on every request
- `generativeSummary` is valid and returns data
- Photo CDN URLs: `skipHttpRedirect=true` on media endpoint returns `{ photoUri: "https://lh3.googleusercontent.com/..." }` — no API key in URL
- lh3 URL size suffix: replace `=s100-p-k-no-mo` → `=s1200-p-k-no` (full) / `=s400-p-k-no` (thumb)

## API Key / Config
- API key lives in `.env` as `GOOGLE_API_KEY`
- `gen-config.js` parses `.env` without dotenv and writes `dashboard-config.js` (gitignored)
- `dashboard-config.js` sets `window.GOOGLE_API_KEY`, `window.GITHUB_TOKEN`, `window.GITHUB_REPO`
- Add `GITHUB_TOKEN` (PAT with `repo` scope) + `GITHUB_REPO` (default: `vashish39/business-webpages`) to `.env` for one-click website commits
- Both `main.ts` and `enrich.ts` self-parse `.env` — no dotenv package needed

## Preview Server
- Start via `.claude/launch.json` config named `dashboard` — runs `node server.js` (gen-config.js runs inside it)
- Navigate to `http://127.0.0.1:3000/dashboard.html` (not `localhost`) for preview tools
- Use `preview_eval` with `window.location.replace(...)` to navigate in preview

## Dashboard — City Loading
- On startup: fetches `/api/manifest`, shows city `<select>` dropdown, auto-loads first city
- Loads raw city CSV + all matching `exports/enriched/{Key}_*.csv` files; merges by `placeId` (enriched wins)
- `enrichedCsvRowToBusiness(row)` — parses enriched CSV columns (`place_id`, `photo_1..10`, `review_N_author/stars/text`, `hours_mon..sun`) back to full business object; sets `_browserEnriched: true`
- After browser enrichment: auto-POSTs each CSV to `/api/save-enriched` as `{CityKey}_{BizSlug}.csv`; dropdown count updates live

## Dashboard — Website Generator
- `generateWebsiteHTML(b)` — full standalone HTML page; color scheme adapts by `primaryType` (restaurant/cafe/bar/hotel/spa/gym)
- `🌐 Generate Website` button appears on enriched (non-CSV-only) places in detail view
- GitHub commit: `PUT https://api.github.com/repos/{repo}/contents/{path}` with `base64(html)` and `sha` if updating existing file
- Committed path: `{city-slug}/{biz-slug}/index.html`; uses `window.GITHUB_TOKEN`

## enrich.ts Flags
- `--resolve-photos` — CDN URLs via skipHttpRedirect (no API key in URL)
- `--scrape-website` — extracts emails + social from business websites
- `--place-ids=id1,id2` — target specific IDs
- `--min-reviews=N --min-rating=X --website=none|yes|any`
- Output always goes to `exports/data/`

## CSV Format (enrich.ts + dashboard export)
- Header `place_id` (not `id`) in enriched CSVs; raw city CSV uses `id`
- 10 photo URL columns (`photo_1`…`photo_10`)
- 5 review triplets (`review_N_author`, `review_N_stars`, `review_N_text`)
- 7 hours columns (`hours_mon`…`hours_sun`)
- Instagram/Facebook fall back to name-slug guesses if no confirmed URL

## tel: Links
- Strip spaces before using in `href="tel:..."`: `phone.replace(/\s/g, '')`
- Display original value unchanged
