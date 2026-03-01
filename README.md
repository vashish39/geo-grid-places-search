# 🌍 Geo Grid Places Search + Enrichment Pipeline

A two-stage Google Places pipeline:

1. **`main.ts`** — Grid-scrapes a city and exports a lightweight CSV (existing)
2. **`enrich.ts`** — Filters the CSV, then fetches full details per business (new)
3. **`dashboard.html`** — Visual browser for enriched data; prep for website generation (new)

---

## 📦 Requirements

- Node.js **18+**
- Google Cloud project with **Geocoding API** + **Places API (New)** enabled

---

## 🔑 Setup

```bash
npm install
export GOOGLE_API_KEY=your_key_here
```

---

## 🚀 Step 1 — Scrape a city → CSV

```bash
# Default types (restaurant + cafe)
npx ts-node main.ts "Austin"

# Custom types
npx ts-node main.ts "Austin" --types=restaurant,cafe,gym,beauty_salon

# Test with 3 grid points first
npx ts-node main.ts "Austin" --test=3
```

Output: `places_Austin.csv`

CSV columns: `id, name, rating, userRatingCount, websiteUri, formattedAddress, latitude, longitude`

---

## 🔬 Step 2 — Enrich filtered businesses → JSON

Takes the CSV, filters to leads with no website + sufficient reviews + good rating, then fetches full Google Places details for each.

```bash
# Default filters: no website, >60 reviews, >3.7 rating
npx ts-node enrich.ts places_Austin.csv

# Custom filters
npx ts-node enrich.ts places_Austin.csv --min-reviews=100 --min-rating=4.0

# Test with 5 businesses
npx ts-node enrich.ts places_Austin.csv --limit=5

# Custom output path
npx ts-node enrich.ts places_Austin.csv --output=leads_Austin.json

# All options
npx ts-node enrich.ts places_Austin.csv \
  --min-reviews=60 \
  --min-rating=3.7 \
  --photos=8 \
  --limit=10 \
  --output=enriched_Austin.json
```

Output: `enriched_Austin.json`

### What gets fetched per business

| Field | Source |
|-------|--------|
| Name, address, phone | Places API (New) |
| Rating + review count | Places API (New) |
| Opening hours (all 7 days) | Places API (New) |
| Business type + price level | Places API (New) |
| Editorial + AI summary | Places API (New) |
| Up to 8 direct photo URLs | Places Photos API |
| Up to 10 customer reviews | Places API (New) |
| Amenities (dine-in, delivery, etc.) | Places API (New) |
| Google Maps link | Places API (New) |
| Yelp / Instagram / Facebook guesses | Derived |

---

## 📊 Step 3 — Browse in dashboard

Open `dashboard.html` in any browser, then drag & drop your `enriched_*.json` file onto it.

Features:
- Filterable list with thumbnails, ratings, types
- Full detail view: photos, hours, reviews, amenities, social links
- **Click any photo to copy its direct URL** (ready for `<img src="">`)
- Copy phone, Place ID, coordinates with one click
- Export individual business JSON

---

## 📁 File structure

```
geo-grid-places-search/
├── main.ts              ← Step 1: grid scraper → CSV
├── enrich.ts            ← Step 2: CSV → enriched JSON
├── dashboard.html       ← Step 3: visual data browser
├── tsconfig.json
├── package.json
├── .gitignore
└── README.md
```

---

## ⚠️ API cost estimate

| Operation | Cost |
|-----------|------|
| `main.ts` Nearby Search | ~$32 / 1,000 calls |
| `enrich.ts` Place Details | ~$17 / 1,000 calls |
| `enrich.ts` Photo URLs | ~$7 / 1,000 calls |

For 79 businesses: **~$10–15 total** for enrichment.  
Always test with `--test` / `--limit` first.

---

## 📜 License

MIT
