/**
 * server.js
 * Local dev server for geo-grid-places-search dashboard.
 *  - Serves static files from project root
 *  - GET  /api/manifest       → live scan of exports/cities/ + exports/enriched/
 *  - POST /api/save-enriched  → saves enriched CSV to exports/enriched/
 * Runs gen-config.js on startup to regenerate dashboard-config.js + exports/cities.json
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;

// ── Run gen-config on startup ─────────────────────────────────────────────────
try {
  require('./gen-config.js');
} catch (e) {
  console.warn('⚠ gen-config.js warning:', e.message);
}

// ── MIME map ──────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.csv':  'text/csv; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
};

// ── City manifest scanner ─────────────────────────────────────────────────────
function scanManifest() {
  const citiesDir = path.join(ROOT, 'exports', 'cities');
  const enrichDir = path.join(ROOT, 'exports', 'enriched');
  const cities    = [];
  const seen      = new Set();

  if (!fs.existsSync(citiesDir)) return cities;

  for (const f of fs.readdirSync(citiesDir).sort()) {
    if (!f.toLowerCase().endsWith('.csv')) continue;
    // Accept both "Austin.csv" and "places_Austin.csv" naming
    const raw     = f.replace(/\.csv$/i, '').replace(/^places_/i, '');
    const key     = raw;
    const display = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());

    // Find enriched CSVs for this city: any {key}_*.csv in exports/enriched/
    const enrichedPaths = [];
    if (fs.existsSync(enrichDir)) {
      for (const ef of fs.readdirSync(enrichDir).sort()) {
        const prefix = key.toLowerCase() + '_';
        if (ef.toLowerCase().startsWith(prefix) && ef.toLowerCase().endsWith('.csv')) {
          enrichedPaths.push(`exports/enriched/${ef}`);
        }
      }
    }

    cities.push({ name: display, key, csvPath: `exports/cities/${f}`, enrichedPaths });
  }

  return cities;
}

// ── HTTP request handler ──────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, `http://127.0.0.1:${PORT}`).pathname;
  } catch {
    pathname = '/';
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── GET /api/manifest ──────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/manifest') {
    const cities = scanManifest();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(cities, null, 2));
    return;
  }

  // ── POST /api/save-enriched ────────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/save-enriched') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const { filename, content } = JSON.parse(body);
        // Sanitize: only allow alphanumeric + _ - . characters, must end in .csv
        const safe = path.basename(filename).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        if (!safe.toLowerCase().endsWith('.csv')) {
          throw new Error('Only .csv files allowed');
        }
        const dir = path.join(ROOT, 'exports', 'enriched');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, safe), content, 'utf8');
        console.log(`  ✓ Saved exports/enriched/${safe}`);

        // Return updated manifest so dashboard can refresh city dropdown
        const cities = scanManifest();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, saved: safe, cities }));
      } catch (err) {
        console.error('  ✗ save-enriched error:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // ── Static file serving ────────────────────────────────────────────────────
  let rel = pathname === '/' ? 'dashboard.html' : pathname.replace(/^\//, '');
  // If path has no extension, try .html (handles extensionless preview URLs)
  if (!path.extname(rel)) rel += '.html';
  const filePath = path.join(ROOT, rel);

  // Prevent directory traversal
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end(`Not found: ${pathname}`); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n✓  Dashboard ready → http://127.0.0.1:${PORT}/dashboard.html\n`);
});
