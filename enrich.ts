/// <reference lib="dom" />

/**
 * enrich.ts
 *
 * Step 2 of the pipeline: takes a CSV produced by main.ts, filters businesses
 * with no website / enough reviews / high enough rating, then fetches full
 * Google Places (New) details for each one and writes a rich JSON file.
 *
 * Usage:
 *   npx ts-node enrich.ts places_Austin.csv [options]
 *
 * Options:
 *   --min-reviews=60       Minimum review count  (default: 60)
 *   --min-rating=3.7       Minimum rating        (default: 3.7)
 *   --limit=10             Cap results (for testing)
 *   --output=out.json      Output filename        (default: enriched_<city>.json)
 *   --photos=8             Max photos per place   (default: 8)
 */

import { readFileSync, writeFileSync } from "fs";
import * as path from "path";

const API_KEY = process.env.GOOGLE_API_KEY as string;
if (!API_KEY) throw new Error("Missing GOOGLE_API_KEY");

/* ─── CLI args ──────────────────────────────────────────────────────────────── */

const rawArgs = process.argv.slice(2);

const getFlag = (flag: string): string | undefined => {
  const match = rawArgs.find(a => a.startsWith(`--${flag}=`));
  return match ? match.split("=").slice(1).join("=") : undefined;
};

const CSV_PATH = rawArgs.find(a => !a.startsWith("--")) ?? "";
if (!CSV_PATH) {
  console.error(
    "Usage: npx ts-node enrich.ts <places_City.csv> [--min-reviews=60] [--min-rating=3.7] [--limit=N] [--output=file.json] [--photos=8]"
  );
  process.exit(1);
}

const MIN_REVIEWS = parseFloat(getFlag("min-reviews") ?? "60");
const MIN_RATING  = parseFloat(getFlag("min-rating")  ?? "3.7");
const LIMIT       = parseInt(getFlag("limit")          ?? "9999");
const MAX_PHOTOS  = parseInt(getFlag("photos")         ?? "8");

// Derive default output name from the CSV filename  e.g. places_Austin.csv → enriched_Austin.json
const csvBase = path.basename(CSV_PATH, ".csv").replace(/^places_/, "");
const OUTPUT  = getFlag("output") ?? `enriched_${csvBase}.json`;

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface CsvRow {
  id: string;
  name: string;
  rating: string;
  userRatingCount: string;
  websiteUri: string;
  formattedAddress: string;
  latitude: string;
  longitude: string;
}

interface PhotoInfo {
  name: string;
  url: string;
  thumbUrl: string;
  authorName: string;
  authorUri: string;
}

interface ReviewInfo {
  author: string;
  authorPhoto: string;
  rating: number;
  text: string;
  publishTime: string;
  relativeTime: string;
}

interface HoursInfo {
  weekdayDescriptions: string[];
  openNow?: boolean;
}

interface AmenitiesInfo {
  dineIn?: boolean;
  takeout?: boolean;
  delivery?: boolean;
  reservable?: boolean;
  outdoorSeating?: boolean;
  liveMusic?: boolean;
  wheelchairAccessible?: boolean;
  servesBeer?: boolean;
  servesWine?: boolean;
  servesBreakfast?: boolean;
  servesLunch?: boolean;
  servesDinner?: boolean;
}

interface SocialInfo {
  googleMapsUri: string;
  yelpSearch: string;
  instagramGuess: string;
  facebookGuess: string;
}

export interface EnrichedPlace {
  placeId: string;
  googleMapsUri: string;
  name: string;
  address: string;
  shortAddress: string;
  phone: string;
  phoneIntl: string;
  website: string;
  types: string[];
  primaryType: string;
  priceLevel: string;
  businessStatus: string;
  rating: number;
  reviewCount: number;
  latitude: number;
  longitude: number;
  editorialSummary: string;
  generativeSummary: string;
  hours: HoursInfo | null;
  hoursDisplay: string[];
  photos: PhotoInfo[];
  heroPhotoUrl: string;
  heroPhotoThumb: string;
  reviews: ReviewInfo[];
  bestReview: ReviewInfo | undefined;
  reviewQuotes: { text: string; author: string; rating: number }[];
  amenities: AmenitiesInfo;
  social: SocialInfo;
  gatheredAt: string;
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function parseCSV(filePath: string): CsvRow[] {
  const content = readFileSync(filePath, "utf8");
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());

  return lines.slice(1).map(line => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { values.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    values.push(current.trim());

    return Object.fromEntries(
      headers.map((h, i) => [h, values[i] ?? ""])
    ) as unknown as CsvRow;
  });
}

/* ─── Places API ─────────────────────────────────────────────────────────────── */

// All fields we want from the Places (New) Details endpoint
const FIELD_MASK = [
  "id", "displayName", "formattedAddress", "shortFormattedAddress",
  "location", "rating", "userRatingCount", "websiteUri",
  "nationalPhoneNumber", "internationalPhoneNumber",
  "regularOpeningHours", "businessStatus", "priceLevel",
  "types", "primaryType", "photos", "reviews",
  "editorialSummary", "generativeSummary",
  "googleMapsUri", "plusCode",
  "dineIn", "takeout", "delivery", "reservable",
  "outdoorSeating", "liveMusic",
  "servesBeer", "servesWine",
  "servesBreakfast", "servesLunch", "servesDinner",
  "wheelchairAccessibleEntrance",
].join(",");

async function fetchPlaceDetails(placeId: string): Promise<Record<string, unknown>> {
  const url = `https://places.googleapis.com/v1/places/${placeId}?fields=${FIELD_MASK}&key=${API_KEY}&languageCode=en`;
  const res = await fetch(url);
  const json = await res.json() as Record<string, unknown>;

  if (json["error"]) {
    const err = json["error"] as { message: string };
    throw new Error(`Places API: ${err.message}`);
  }
  return json;
}

/* ─── Data builders ──────────────────────────────────────────────────────────── */

function buildPhotos(photos: unknown[], maxPhotos: number): PhotoInfo[] {
  if (!Array.isArray(photos)) return [];
  return photos.slice(0, maxPhotos).map(p => {
    const photo = p as Record<string, unknown>;
    const name = photo["name"] as string;
    const attrs = (photo["authorAttributions"] as Record<string, string>[] | undefined) ?? [];
    return {
      name,
      url:      `https://places.googleapis.com/v1/${name}/media?maxWidthPx=1200&key=${API_KEY}`,
      thumbUrl: `https://places.googleapis.com/v1/${name}/media?maxWidthPx=400&key=${API_KEY}`,
      authorName: attrs[0]?.["displayName"] ?? "",
      authorUri:  attrs[0]?.["uri"] ?? "",
    };
  });
}

function buildReviews(reviews: unknown[]): ReviewInfo[] {
  if (!Array.isArray(reviews)) return [];
  return reviews
    .map(r => {
      const rev = r as Record<string, unknown>;
      const attr = rev["authorAttribution"] as Record<string, string> | undefined;
      const textObj = rev["text"] as Record<string, string> | undefined;
      const relTime = rev["relativePublishTimeDescription"] as string | undefined;
      return {
        author:      attr?.["displayName"] ?? "Anonymous",
        authorPhoto: attr?.["photoUri"] ?? "",
        rating:      (rev["rating"] as number) ?? 0,
        text:        textObj?.["text"] ?? "",
        publishTime: (rev["publishTime"] as string) ?? "",
        relativeTime: relTime ?? "",
      };
    })
    .filter(r => r.text.length > 20);
}

function buildHours(openingHours: unknown): HoursInfo | null {
  if (!openingHours || typeof openingHours !== "object") return null;
  const h = openingHours as Record<string, unknown>;
  return {
    weekdayDescriptions: (h["weekdayDescriptions"] as string[]) ?? [],
    openNow: h["openNow"] as boolean | undefined,
  };
}

function buildSocial(name: string, placeId: string, mapsUri: string, shortAddress: string): SocialInfo {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return {
    googleMapsUri:   mapsUri || `https://maps.google.com/?place_id=${placeId}`,
    yelpSearch:      `https://www.yelp.com/search?find_desc=${encodeURIComponent(name)}&find_loc=${encodeURIComponent(shortAddress)}`,
    instagramGuess:  `https://www.instagram.com/${slug}/`,
    facebookGuess:   `https://www.facebook.com/${slug}/`,
  };
}

function enrich(row: CsvRow, detail: Record<string, unknown>): EnrichedPlace {
  const name       = (detail["displayName"] as Record<string, string> | undefined)?.["text"] ?? row.name;
  const mapsUri    = (detail["googleMapsUri"] as string) ?? "";
  const shortAddr  = (detail["shortFormattedAddress"] as string) ?? "";
  const photos     = buildPhotos((detail["photos"] as unknown[]) ?? [], MAX_PHOTOS);
  const reviews    = buildReviews((detail["reviews"] as unknown[]) ?? []);
  const hours      = buildHours(detail["regularOpeningHours"]);

  const bestReview = [...reviews]
    .filter(r => r.rating >= 4)
    .sort((a, b) => b.text.length - a.text.length)[0];

  return {
    placeId:          row.id,
    googleMapsUri:    mapsUri,
    name,
    address:          (detail["formattedAddress"] as string) ?? row.formattedAddress,
    shortAddress:     shortAddr,
    phone:            (detail["nationalPhoneNumber"] as string) ?? "",
    phoneIntl:        (detail["internationalPhoneNumber"] as string) ?? "",
    website:          (detail["websiteUri"] as string) ?? "",
    types:            (detail["types"] as string[]) ?? [],
    primaryType:      (detail["primaryType"] as string) ?? "",
    priceLevel:       (detail["priceLevel"] as string) ?? "",
    businessStatus:   (detail["businessStatus"] as string) ?? "OPERATIONAL",
    rating:           (detail["rating"] as number) ?? parseFloat(row.rating),
    reviewCount:      (detail["userRatingCount"] as number) ?? parseInt(row.userRatingCount),
    latitude:         ((detail["location"] as Record<string, number> | undefined)?.["latitude"]) ?? parseFloat(row.latitude),
    longitude:        ((detail["location"] as Record<string, number> | undefined)?.["longitude"]) ?? parseFloat(row.longitude),
    editorialSummary: ((detail["editorialSummary"] as Record<string, string> | undefined)?.["text"]) ?? "",
    generativeSummary:((detail["generativeSummary"] as Record<string, Record<string, string>> | undefined)?.["overview"]?.["text"]) ?? "",
    hours,
    hoursDisplay:     hours?.weekdayDescriptions ?? [],
    photos,
    heroPhotoUrl:     photos[0]?.url ?? "",
    heroPhotoThumb:   photos[0]?.thumbUrl ?? "",
    reviews,
    bestReview,
    reviewQuotes:     reviews.slice(0, 3).map(r => ({
      text:   r.text.slice(0, 200),
      author: r.author,
      rating: r.rating,
    })),
    amenities: {
      dineIn:               detail["dineIn"] as boolean | undefined,
      takeout:              detail["takeout"] as boolean | undefined,
      delivery:             detail["delivery"] as boolean | undefined,
      reservable:           detail["reservable"] as boolean | undefined,
      outdoorSeating:       detail["outdoorSeating"] as boolean | undefined,
      liveMusic:            detail["liveMusic"] as boolean | undefined,
      wheelchairAccessible: detail["wheelchairAccessibleEntrance"] as boolean | undefined,
      servesBeer:           detail["servesBeer"] as boolean | undefined,
      servesWine:           detail["servesWine"] as boolean | undefined,
      servesBreakfast:      detail["servesBreakfast"] as boolean | undefined,
      servesLunch:          detail["servesLunch"] as boolean | undefined,
      servesDinner:         detail["servesDinner"] as boolean | undefined,
    },
    social: buildSocial(name, row.id, mapsUri, shortAddr),
    gatheredAt: new Date().toISOString(),
  };
}

/* ─── Main ───────────────────────────────────────────────────────────────────── */

async function run() {
  console.log(`📂  Reading: ${CSV_PATH}`);
  const rows = parseCSV(CSV_PATH);
  console.log(`    Total rows in CSV: ${rows.length}`);

  // Apply filters
  const targets = rows
    .filter(r =>
      (!r.websiteUri || r.websiteUri.trim() === "") &&
      parseFloat(r.userRatingCount || "0") > MIN_REVIEWS &&
      parseFloat(r.rating || "0") > MIN_RATING
    )
    .slice(0, LIMIT);

  console.log(`🎯  Matching (no site, >${MIN_REVIEWS} reviews, >${MIN_RATING}★): ${targets.length}`);
  console.log("");

  const results: EnrichedPlace[] = [];
  const errors: { placeId: string; name: string; error: string }[] = [];

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    const tag = `[${i + 1}/${targets.length}]`;

    try {
      process.stdout.write(`${tag} ${row.name}... `);
      const detail = await fetchPlaceDetails(row.id);
      const enriched = enrich(row, detail);
      results.push(enriched);
      console.log(`✅  ${enriched.rating}★  ${enriched.reviewCount} reviews  ${enriched.photos.length} photos`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`❌  ${msg}`);
      errors.push({ placeId: row.id, name: row.name, error: msg });
    }

    // Stay well within the 10 req/s limit
    if (i < targets.length - 1) await sleep(150);
  }

  // Output
  const output = {
    generatedAt:     new Date().toISOString(),
    sourceFile:      CSV_PATH,
    filters:         { minReviews: MIN_REVIEWS, minRating: MIN_RATING },
    totalBusinesses: results.length,
    errorCount:      errors.length,
    businesses:      results,
    errorLog:        errors,
  };

  writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");

  console.log("");
  console.log(`✅  Done — ${results.length} enriched, ${errors.length} errors`);
  console.log(`📁  Output: ${OUTPUT}`);

  // Coverage summary
  const withPhotos  = results.filter(b => b.photos.length  > 0).length;
  const withHours   = results.filter(b => b.hours          !== null).length;
  const withReviews = results.filter(b => b.reviews.length > 0).length;
  const withPhone   = results.filter(b => b.phone          !== "").length;

  console.log("");
  console.log("📊  Data coverage:");
  console.log(`    Photos:  ${withPhotos}/${results.length}`);
  console.log(`    Hours:   ${withHours}/${results.length}`);
  console.log(`    Reviews: ${withReviews}/${results.length}`);
  console.log(`    Phone:   ${withPhone}/${results.length}`);
  console.log("");
  console.log("💡  Next: open dashboard.html in your browser and drop in the JSON file");
}

run().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
