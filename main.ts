/// <reference lib="dom" />
import { writeFileSync } from "fs";

const API_KEY = process.env.GOOGLE_API_KEY as string;
if (!API_KEY) throw new Error("Missing GOOGLE_API_KEY");

const STEP_KM = 3;
const SEARCH_RADIUS = 3000;

/* ------------------ TYPES ------------------ */

type LatLng = { lat: number; lng: number };

interface GeocodeResponse {
  results: {
    geometry: {
      bounds?: {
        southwest: LatLng;
        northeast: LatLng;
      };
      viewport: {
        southwest: LatLng;
        northeast: LatLng;
      };
    };
  }[];
}

interface PlacesSearchResponse {
  places?: Place[];
}

interface Place {
  id: string;
  formattedAddress?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  rating?: number;
  websiteUri?: string;
  userRatingCount?: number;
  displayName?: {
    text: string;
    languageCode: string;
  };
}

/* ------------------ HELPERS ------------------ */

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const kmToDeg = (km: number) => km / 111;

/* ------------------ GEOCODE ------------------ */

async function geocodeCity(city: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", city);
  url.searchParams.set("key", API_KEY);

  const res = await fetch(url.toString());
  const json = (await res.json()) as GeocodeResponse;

  if (!json.results.length) {
    throw new Error("No geocode results");
  }

  const geometry = json.results[0].geometry;
  return geometry.bounds ?? geometry.viewport;
}

/* ------------------ GRID ------------------ */

function generateGrid(sw: LatLng, ne: LatLng): LatLng[] {
  const points: LatLng[] = [];
  const step = kmToDeg(STEP_KM);

  for (let lat = sw.lat; lat <= ne.lat; lat += step) {
    for (let lng = sw.lng; lng <= ne.lng; lng += step) {
      points.push({ lat, lng });
    }
  }
  return points;
}

/* ------------------ PLACES ------------------ */

async function searchNearby(
  lat: number,
  lng: number,
  types: string[]
): Promise<Place[]> {
  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.websiteUri"
      },
      body: JSON.stringify({
        includedTypes: types,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: SEARCH_RADIUS
          }
        }
      })
    }
  );

  const json = (await res.json()) as PlacesSearchResponse;
  return json.places ?? [];
}

/* ------------------ CSV ------------------ */

function toCsv(places: Place[]): string {
  const header = [
    "id",
    "name",
    "rating",
    "userRatingCount",
    "websiteUri",
    "formattedAddress",
    "latitude",
    "longitude"
  ];

  const escape = (value?: string | number) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const rows = places.map(p =>
    [
      escape(p.id),
      escape(p.displayName?.text),
      escape(p.rating),
      escape(p.userRatingCount),
      escape(p.websiteUri),
      escape(p.formattedAddress),
      escape(p.location?.latitude),
      escape(p.location?.longitude)
    ].join(",")
  );

  return [header.join(","), ...rows].join("\n");
}

/* ------------------ MAIN ------------------ */

async function run(
  city: string,
  types: string[],
  testLimit?: number
) {
  console.log(`📍 Geocoding ${city}`);
  console.log(`🏷️ Types: ${types.join(", ")}`);

  const bounds = await geocodeCity(city);
  const fullGrid = generateGrid(bounds.southwest, bounds.northeast);

  const grid =
    testLimit && testLimit > 0
      ? fullGrid.slice(0, testLimit)
      : fullGrid;

  if (testLimit) {
    console.log(`🧪 TEST MODE: ${grid.length}/${fullGrid.length} grid points`);
  } else {
    console.log(`🧭 Grid points: ${grid.length}`);
  }

  const unique = new Map<string, Place>();

  for (const p of grid) {
    const places = await searchNearby(p.lat, p.lng, types);
    for (const place of places) {
      unique.set(place.id, place);
    }
    await sleep(300);
  }

  const results = [...unique.values()];
  console.log(`✅ Found ${results.length} places`);

  const csv = toCsv(results);
  const fileName = `places_${city.replace(/\s+/g, "_")}.csv`;

  writeFileSync(fileName, csv, "utf8");
  console.log(`📄 CSV exported: ${fileName}`);
}

/* ------------------ CLI ------------------ */

const rawArgs = process.argv.slice(2);

let testLimit: number | undefined;
let types: string[] = ["restaurant", "cafe"];
const cityParts: string[] = [];

for (const arg of rawArgs) {
  if (arg.startsWith("--test=")) {
    testLimit = Number(arg.split("=")[1]);
  } else if (arg.startsWith("--types=")) {
    types = arg
      .split("=")[1]
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);
  } else {
    cityParts.push(arg);
  }
}

const city = cityParts.join(" ");

if (!city) {
  console.error(
    'Usage: npx ts-node main.ts "City Name" [--types=a,b] [--test=3]'
  );
  process.exit(1);
}

run(city, types, testLimit).catch(err => {
  console.error(err);
  process.exit(1);
});
