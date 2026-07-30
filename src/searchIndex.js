import { cached } from './cache.js';
import { fetchAllLines, fetchRoutesForLine, fetchRouteStops } from './oasaClient.js';

const TWELVE_HOURS = 12 * 60 * 60 * 1000;
const INDEX_TTL = TWELVE_HOURS;
const CONCURRENCY = 5;

let stopsByCode = new Map();
let buildPromise = null;
let indexBuiltAt = 0;

function isIndexValid() {
  return stopsByCode.size > 0 && (Date.now() - indexBuiltAt) < INDEX_TTL;
}

export function initSearchIndex() {
  if (buildPromise) return;
  buildPromise = (async () => {
    try {
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
        for (const stops of results) {
          for (const stop of stops) {
            newStops.set(stop.code, { ...stop, routes: undefined });
          }
        }
      }

      stopsByCode = newStops;
      indexBuiltAt = Date.now();
      console.log(`[searchIndex] built with ${stopsByCode.size} stops`);
    } catch (err) {
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
  return {
    ready: isIndexValid(),
    building: !!buildPromise,
    stops: stopsByCode.size,
  };
}
