# 🌍 Geo Grid Places Search

A **grid-based Google Places scraper** that scans an entire city using a geographic grid and exports business data to CSV.

This version is intentionally **simple and stable**, based on a working Google Places Nearby Search setup.

---

## ✨ Features

- Full city coverage using grid scanning
- Supports **restaurant / cafe filtering**
- Custom business types via CLI
- Built-in **test mode** to limit grid points
- Automatic de-duplication by place ID
- CSV export
- No pagination / nextPageToken (by design)

---

## 📦 Requirements

- Node.js **18+** (for native `fetch`)
- npm
- Google Cloud project with:
  - **Geocoding API**
  - **Places API (New)** enabled

---

## 🔑 Setup

### 1️⃣ Clone the repo

```bash
git clone git@github.com:vashish39/geo-grid-places-search.git
cd geo-grid-places-search
```

---

### 2️⃣ Install dependencies

```bash
npm install
```

---

### 3️⃣ Set Google API Key (IMPORTANT)

#### Git Bash / macOS / Linux
```bash
export GOOGLE_API_KEY=your_google_api_key
```

#### Windows PowerShell
```powershell
$env:GOOGLE_API_KEY="your_google_api_key"
```

> 🔒 Never hardcode API keys.  
> `.env` files are ignored by git.

---

## 🚀 Usage

### Basic usage (default: restaurant + cafe)

```bash
npx ts-node main.ts "Mumbai"
```

---

### Specify business types

```bash
npx ts-node main.ts "Mumbai" --types=restaurant,cafe
```

```bash
npx ts-node main.ts "Bangalore" --types=gym,spa,beauty_salon
```

---

## 🧪 Test Mode (Recommended)

Limit grid points to avoid heavy API usage.

### Test with 3 grid points

```bash
npx ts-node main.ts "Mumbai" --test=3
```

### Test + custom types

```bash
npx ts-node main.ts "Mumbai" --types=restaurant,cafe --test=3
```

---

## 📄 Output

A CSV file is generated in the project root:

```
places_Mumbai.csv
```

### CSV Columns

- id
- name
- rating
- userRatingCount
- websiteUri
- formattedAddress
- latitude
- longitude

---

## 🧠 How it works

1. Geocodes the city to get map bounds
2. Creates a grid (~3 km spacing)
3. Runs Nearby Search for each grid point
4. Merges and deduplicates results
5. Exports CSV

This avoids the coverage limits of single-radius searches.

---

## ⚠️ Cost & Quota Notes

API usage grows with:

```
Grid Points × Searches
```

Always test with `--test` first.

---

## 📜 License

MIT
