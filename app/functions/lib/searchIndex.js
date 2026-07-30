import { cached } from './cache.js';
import { fetchAllLines, fetchRoutesForLine, fetchRouteStops } from './oasaClient.js';

const TWELVE_HOURS = 12 * 60 * 60 * 1000;
const CONCURRENCY = 5;
const KV_KEY = 'search-index';
const INDEX_TTL = TWELVE_HOURS;

let stopsByCode = new Map();
let indexBuiltAt = 0;

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
  const lines = await cached('lines:all', TWELVE_HOURS, () => fetchAllLines());
  const routeCodeSet = new Set();

  const routePromises = lines.map((line) =>
    cached(`routes:${line.lineCode}`, TWELVE_HOURS, () => fetchRoutesForLine(line.lineCode))
      .then((routes) => {
        for (const route of routes) routeCodeSet.add(route.routeCode);
      })
      .catch(() => {}),
  );
  await Promise.all(routePromises);

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
}

// Load index lazily; if neither in-memory nor KV has it, start building in background.
export async function ensureSearchIndex(env) {
  if (isIndexValid()) return;
  const loaded = await loadFromKV(env);
  if (loaded) return;

  env.ctx?.waitUntil?.(
    doBuildIndex()
      .then((size) => {
        console.log(`[searchIndex] built with ${size} stops`);
        return saveToKV(env);
      })
      .catch((err) => {
        console.error('[searchIndex] build failed:', err.message);
      }),
  );
}

// Full rebuild + save to KV (called by cron / manual trigger).
export async function rebuildSearchIndex(env) {
  const size = await doBuildIndex();
  await saveToKV(env);
  console.log(`[searchIndex] rebuilt with ${size} stops`);
  return size;
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
  return {
    ready: isIndexValid(),
    building: false,
    stops: stopsByCode.size,
  };
}
