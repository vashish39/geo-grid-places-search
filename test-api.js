/**
 * test-api.js — quick smoke test for the Google Places API
 * Run: node test-api.js
 */
const fs = require('fs');

function parseDotEnv(fp) {
  try {
    const lines = fs.readFileSync(fp, 'utf8').split('\n');
    const env = {};
    for (const line of lines) {
      const m = line.match(/^\s*([^#=][^=]*?)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      env[m[1].trim()] = val;
    }
    return env;
  } catch { return {}; }
}

const dotEnv = parseDotEnv('.env');
const API_KEY = dotEnv.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;
if (!API_KEY) { console.error('❌ No GOOGLE_API_KEY in .env'); process.exit(1); }
console.log('✅ API key loaded from .env');

// Use a Nashville restaurant as test (more representative of actual usage)
const PLACE_ID = process.argv[2] || 'ChIJ3SHTbwB_ZIgRVdv1e5TFKk0'; // Dairy Queen Franklin TN

// EXACT same field list as dashboard.html PLACES_FIELDS
const FIELDS = [
  'id', 'displayName', 'formattedAddress', 'shortFormattedAddress',
  'location', 'rating', 'userRatingCount', 'websiteUri',
  'nationalPhoneNumber', 'internationalPhoneNumber',
  'regularOpeningHours', 'businessStatus', 'priceLevel',
  'types', 'primaryType', 'photos', 'reviews',
  'editorialSummary', 'generativeSummary', 'googleMapsUri',
  'dineIn', 'takeout', 'delivery', 'reservable',
  'outdoorSeating', 'liveMusic',
  'servesBeer', 'servesWine', 'servesBreakfast', 'servesLunch', 'servesDinner',
  'accessibilityOptions',
].join(',');

const url = `https://places.googleapis.com/v1/places/${PLACE_ID}?fields=${FIELDS}&key=${API_KEY}&languageCode=en`;

console.log('\n🌐 Testing Places API (New) — GET place details');
console.log('   Place ID:', PLACE_ID);

fetch(url)
  .then(r => r.json())
  .then(data => {
    if (data.error) {
      console.error('\n❌ API ERROR:');
      console.error('   Code:    ', data.error.code);
      console.error('   Status:  ', data.error.status);
      console.error('   Message: ', data.error.message);

      if (data.error.details) {
        console.error('   Details: ', JSON.stringify(data.error.details, null, 2));
      }
      process.exit(1);
    }

    console.log('\n✅ SUCCESS — full field list (same as dashboard)');
    console.log('   Name:              ', data.displayName?.text || '(none)');
    console.log('   Rating:            ', data.rating || '(none)');
    console.log('   Reviews:           ', data.userRatingCount || '(none)');
    console.log('   Phone:             ', data.nationalPhoneNumber || '(none)');
    console.log('   Phone (intl):      ', data.internationalPhoneNumber || '(none)');
    console.log('   Website:           ', data.websiteUri || '(none)');
    console.log('   Photos returned:   ', (data.photos || []).length);
    console.log('   Reviews returned:  ', (data.reviews || []).length);
    console.log('   Hours:             ', data.regularOpeningHours ? 'YES ✓' : 'not returned');
    console.log('   generativeSummary: ', data.generativeSummary ? 'YES ✓' : '(not available)');
    console.log('   editorialSummary:  ', data.editorialSummary?.text || '(none)');
    console.log('   dineIn:            ', data.dineIn ?? '(none)');
    console.log('   delivery:          ', data.delivery ?? '(none)');
    console.log('   Maps URI:          ', data.googleMapsUri || '(none)');

    // Check CORS headers (will only show up in HTTP responses, not real CORS scenario)
    console.log('\n📋 All returned top-level keys:', Object.keys(data).join(', '));

    if (data.photos && data.photos.length > 0) {
      console.log('\n🖼  First photo name:', data.photos[0].name);

      // Test photo CDN URL resolution
      const photoName = data.photos[0].name;
      const photoUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1200&skipHttpRedirect=true&key=${API_KEY}`;
      console.log('\n🌐 Testing photo CDN URL resolution (skipHttpRedirect=true)...');

      return fetch(photoUrl).then(r2 => {
        if (!r2.ok) {
          return r2.text().then(t => {
            console.error('❌ Photo CDN resolution failed:', r2.status, t.slice(0, 200));
          });
        }
        return r2.json().then(photoData => {
          if (photoData.photoUri) {
            console.log('✅ CDN URL resolved:', photoData.photoUri.substring(0, 80) + '...');
          } else {
            console.error('❌ No photoUri in response:', JSON.stringify(photoData).slice(0, 200));
          }
        });
      });
    }
  })
  .catch(err => {
    console.error('\n❌ FETCH ERROR:', err.message);
    process.exit(1);
  });
