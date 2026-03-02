# geo-grid-places-search — CLAUDE.md

## Stack
- `main.ts` → scrapes geo-grid → `exports/places_City.csv`
- `enrich.ts` → enriches CSV via Places API → `exports/data/enriched_City.json` + `.csv`
- `dashboard.html` — single-file static viewer, drop CSV or enriched JSON to load

## Run Commands
- `npx ts-node main.ts "Austin" --types=restaurant,cafe`
- `npx ts-node enrich.ts Austin [flags]`
- `node gen-config.js` — writes `dashboard-config.js` from `.env` (run before serving dashboard)
- `node test-api.js [placeId]` — smoke-test Places API + CDN photo resolution

## Places API (New) — Critical Gotchas
- Field `wheelchairAccessibleEntrance` is NOT top-level — use `accessibilityOptions` instead; using the wrong name causes `400 INVALID_ARGUMENT` on every request
- `generativeSummary` is valid and returns data
- Photo CDN URLs: `skipHttpRedirect=true` on media endpoint returns `{ photoUri: "https://lh3.googleusercontent.com/..." }` — no API key in URL
- lh3 URL size suffix: replace `=s100-p-k-no-mo` → `=s1200-p-k-no` (full) / `=s400-p-k-no` (thumb)

## API Key / Config
- API key lives in `.env` as `GOOGLE_API_KEY`
- `gen-config.js` parses `.env` without dotenv and writes `dashboard-config.js` (gitignored)
- `dashboard-config.js` sets `window.GOOGLE_API_KEY` for browser enrichment
- Both `main.ts` and `enrich.ts` self-parse `.env` — no dotenv package needed

## Preview Server
- Start via `.claude/launch.json` config named `dashboard` — runs `gen-config.js` first, then `npx serve . --listen 3000`
- Navigate to `http://127.0.0.1:3000/dashboard.html` (not `localhost`) for preview tools
- Use `preview_eval` with `window.location.replace(...)` to navigate in preview

## enrich.ts Flags
- `--resolve-photos` — CDN URLs via skipHttpRedirect (no API key in URL)
- `--scrape-website` — extracts emails + social from business websites
- `--place-ids=id1,id2` — target specific IDs
- `--min-reviews=N --min-rating=X --website=none|yes|any`
- Output always goes to `exports/data/`

## CSV Format (enrich.ts + dashboard export)
- 10 photo URL columns (`photo_1`…`photo_10`)
- 5 review triplets (`review_N_author`, `review_N_stars`, `review_N_text`)
- Instagram/Facebook fall back to name-slug guesses if no confirmed URL

## tel: Links
- Strip spaces before using in `href="tel:..."`: `phone.replace(/\s/g, '')`
- Display original value unchanged
