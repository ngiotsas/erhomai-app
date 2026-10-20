import { cached } from './cache.js';
import { fetchAllLines, fetchRoutesForLine, fetchRouteStops } from './oasaClient.js';

const TWELVE_HOURS = 12 * 60 * 60 * 1000;
const CONCURRENCY = 5;
const KV_KEY = 'search-index';
const INDEX_TTL = TWELVE_HOURS;
const BUILD_RETRY_MS = 15 * 60 * 1000;

let stopsByCode = new Map();
let indexBuiltAt = 0;
let buildingNow = false;
let buildPromise = null;
let lastBuildFailedAt = 0;

function isIndexValid() {
  return stopsByCode.size > 0 && (Date.now() - indexBuiltAt) < INDEX_TTL;
}

async function loadFromKV(env) {
  try {
    const raw = await env.SEARCH_INDEX.get(KV_KEY, 'json');
    if (raw && raw.stops && raw.builtAt && (Date.now() - raw.builtAt) < INDEX_TTL) {
      stopsByCode = new Map(Object.entries(raw.stops));
      indexBuiltAt = raw.builtAt;
      return true;
    }
  } catch {
    // KV may not be bound in dev
  }
  return false;
}

async function saveToKV(env) {
  try {
    await env.SEARCH_INDEX.put(KV_KEY, JSON.stringify({
      builtAt: indexBuiltAt,
      stops: Object.fromEntries(stopsByCode),
    }));
  } catch {
    // KV may not be bound in dev
  }
}

async function doBuildIndex() {
  buildingNow = true;
  try {
    const lines = await cached('lines:all', TWELVE_HOURS, () => fetchAllLines());
    const routeCodeSet = new Set();

    // Fetch routes in bounded batches. Firing all ~350 lines in parallel
    // would hammer a rate-limiting upstream; CONCURRENCY keeps the burst
    // small while still overlapping the slow round trips.
    for (let i = 0; i < lines.length; i += CONCURRENCY) {
      const batch = lines.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map((line) =>
          cached(`routes:${line.lineCode}`, TWELVE_HOURS, () => fetchRoutesForLine(line.lineCode))
            .catch(() => []),
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
      const results = await Promise.all(
        batch.map((rc) =>
          cached(`stops:route:${rc}`, TWELVE_HOURS, () => fetchRouteStops(rc))
            .catch(() => []),
        ),
      );
      for (const stopList of results) {
        for (const stop of stopList) {
          newStops.set(stop.code, { ...stop, routes: undefined });
        }
      }
    }

    stopsByCode = newStops;
    indexBuiltAt = Date.now();
    return stopsByCode.size;
  } finally {
    buildingNow = false;
  }
}

// Load index lazily; if neither in-memory nor KV has it, build it. The build
// itself runs in the BACKGROUND — the request that triggers it returns
// immediately with indexStatus().building so the client can show "building…"
// instead of waiting minutes for a full crawl. Concurrent calls share one
// build; a failed build is not retried until the cooldown expires, so a
// request burst can't hammer OASA.
export function ensureSearchIndex(env) {
  if (isIndexValid()) return Promise.resolve();
  if (buildPromise) return Promise.resolve();
  if (lastBuildFailedAt > 0 && Date.now() - lastBuildFailedAt < BUILD_RETRY_MS) {
    return Promise.resolve();
  }

  buildPromise = loadFromKV(env)
    .then((loaded) => {
      if (loaded) {
        buildPromise = null;
        return;
      }
      doBuildIndex()
        .then((size) => {
          console.log(`[searchIndex] built with ${size} stops`);
          return saveToKV(env);
        })
        .catch((err) => {
          console.error('[searchIndex] build failed:', err.message);
          lastBuildFailedAt = Date.now();
        })
        .finally(() => {
          buildPromise = null;
        });
    })
    .catch(() => {
      buildPromise = null;
    });

  return buildPromise;
}

// Full rebuild + save to KV (called by cron / manual trigger).
export async function rebuildSearchIndex(env) {
  try {
    const size = await doBuildIndex();
    await saveToKV(env);
    lastBuildFailedAt = 0;
    console.log(`[searchIndex] rebuilt with ${size} stops`);
    return size;
  } catch (err) {
    lastBuildFailedAt = Date.now();
    throw err;
  }
}

export function searchStops(query) {
  if (!query) return [];
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
    building: buildingNow || !!buildPromise,
    stale: stopsByCode.size > 0 && age !== null && age >= INDEX_TTL,
    failed: stopsByCode.size === 0 && lastBuildFailedAt > 0,
    stops: stopsByCode.size,
  };
}
