import { cached } from './cache.js';
import { fetchAllLines, fetchRoutesForLine, fetchRouteStops } from './oasaClient.js';

const TWELVE_HOURS = 12 * 60 * 60 * 1000;
const INDEX_TTL = TWELVE_HOURS;
const CONCURRENCY = 5;
// If more than this share of the per-route fetches fails, the index is
// incomplete: mark it degraded (surfaced to clients) and let it expire
// sooner than a healthy index so it heals on the next build.
const DEGRADED_FAILURE_RATIO = 0.1;
const DEGRADED_TTL_MS = 60 * 60 * 1000;

let stopsByCode = new Map();
let buildPromise = null;
let indexBuiltAt = 0;
let indexDegraded = false;
let lastBuildFailedAt = 0;

function isIndexValid() {
  const ttl = indexDegraded ? DEGRADED_TTL_MS : INDEX_TTL;
  return stopsByCode.size > 0 && (Date.now() - indexBuiltAt) < ttl;
}

export function initSearchIndex() {
  if (buildPromise) return;
  buildPromise = (async () => {
    let fetches = 0;
    let failures = 0;
    try {
      const lines = await cached('lines:all', TWELVE_HOURS, () => fetchAllLines());
      const routeCodeSet = new Set();

      // Bounded batches: firing all ~350 lines in parallel would hammer
      // OASA's rate limiting. CONCURRENCY keeps the burst small.
      for (let i = 0; i < lines.length; i += CONCURRENCY) {
        const batch = lines.slice(i, i + CONCURRENCY);
        fetches += batch.length;
        const results = await Promise.all(
          batch.map((line) =>
            cached(`routes:${line.lineCode}`, TWELVE_HOURS, () => fetchRoutesForLine(line.lineCode))
              .catch(() => {
                failures++;
                return [];
              }),
          ),
        );
        for (const routes of results) {
          for (const route of routes) routeCodeSet.add(route.routeCode);
        }
      }

      const routeCodes = [...routeCodeSet];
      const newStops = new Map();

      for (let i = 0; i < routeCodes.length; i += CONCURRENCY) {
        const batch = routeCodes.slice(i, i + CONCURRENCY);
        fetches += batch.length;
        const results = await Promise.all(
          batch.map((rc) =>
            cached(`stops:route:${rc}`, TWELVE_HOURS, () => fetchRouteStops(rc))
              .catch(() => {
                failures++;
                return [];
              }),
          ),
        );
        for (const stops of results) {
          for (const stop of stops) {
            newStops.set(stop.code, { ...stop, routes: undefined });
          }
        }
      }

      stopsByCode = newStops;
      indexBuiltAt = Date.now();
      // A build that completes with many swallowed failures produces an
      // incomplete index; say so instead of pretending it is complete.
      indexDegraded = fetches > 0 && failures / fetches >= DEGRADED_FAILURE_RATIO;
      lastBuildFailedAt = 0;
      console.log(`[searchIndex] built with ${stopsByCode.size} stops${indexDegraded ? ' (degraded)' : ''}`);
    } catch (err) {
      lastBuildFailedAt = Date.now();
      console.error('[searchIndex] build failed:', err.message);
    } finally {
      buildPromise = null;
    }
  })();
}

export function searchStops(query) {
  if (!query) return [];
  if (!isIndexValid()) initSearchIndex();
  const q = query.toLowerCase().trim();
  const results = [];
  for (const stop of stopsByCode.values()) {
    if ((stop.name && stop.name.toLowerCase().includes(q)) ||
        (stop.nameEn && stop.nameEn.toLowerCase().includes(q)) ||
        (stop.street && stop.street.toLowerCase().includes(q)) ||
        (stop.streetEn && stop.streetEn.toLowerCase().includes(q))) {
      results.push(stop);
    }
    if (results.length >= 20) break;
  }
  return results;
}

export function indexStatus() {
  const age = indexBuiltAt ? Date.now() - indexBuiltAt : null;
  return {
    ready: isIndexValid(),
    building: !!buildPromise,
    stale: stopsByCode.size > 0 && age !== null && age >= INDEX_TTL,
    degraded: indexDegraded,
    failed: stopsByCode.size === 0 && lastBuildFailedAt > 0,
    stops: stopsByCode.size,
  };
}
