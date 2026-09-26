// One-time generator for the static stop-name search index.
//
// OASA has no stop-name search endpoint, and crawling thousands of routes
// from every browser is abusive. So crawl once from a network that can
// reach OASA and ship the compact result with the app:
//
//   node app/scripts/gen-stops-index.mjs
//
// Writes app/src/stopsIndex.json (lazy-loaded only by the stop-search tab).
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAllLines, fetchRoutesForLine, fetchRouteStops } from '../../src/oasaClient.js';

const CONCURRENCY = 4;
const SLEEP_MS = 150;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
      await sleep(SLEEP_MS);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const lines = await fetchAllLines();
console.log(`lines: ${lines.length}`);

const routeCodeSet = new Set();
await mapLimit(lines, CONCURRENCY, async (line) => {
  try {
    const routes = await fetchRoutesForLine(line.lineCode);
    for (const r of routes) routeCodeSet.add(r.routeCode);
  } catch (err) {
    console.error(`routes for line ${line.lineCode} failed: ${err.message}`);
  }
});
const routeCodes = [...routeCodeSet];
console.log(`routes: ${routeCodes.length}`);

const stopsByCode = new Map();
let done = 0;
await mapLimit(routeCodes, CONCURRENCY, async (rc) => {
  try {
    const stops = await fetchRouteStops(rc);
    for (const s of stops) {
      if (!stopsByCode.has(s.code)) {
        stopsByCode.set(s.code, {
          code: s.code,
          name: s.name,
          nameEn: s.nameEn,
          street: s.street,
          streetEn: s.streetEn,
          lat: s.lat,
          lng: s.lng,
        });
      }
    }
  } catch (err) {
    console.error(`stops for route ${rc} failed: ${err.message}`);
  }
  done++;
  if (done % 200 === 0) console.log(`... ${done}/${routeCodes.length} routes, ${stopsByCode.size} stops`);
});

const stops = [...stopsByCode.values()];
const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'src', 'stopsIndex.json');
await writeFile(outPath, JSON.stringify(stops));
console.log(`wrote ${stops.length} stops to ${outPath}`);
