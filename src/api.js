import { Router } from 'express';
import { cached } from './cache.js';
import { distanceInMeters, isValidLatitude, isValidLongitude, isWithinServiceArea } from './geo.js';
import { fetchClosestStops, fetchRoutesForStop, fetchStopArrivals, fetchAllLines, fetchRoutesForLine, fetchRouteStops } from './oasaClient.js';
import { searchStops, initSearchIndex, indexStatus } from './searchIndex.js';

const STOPS_TTL_MS = 5 * 60 * 1000;
const ARRIVALS_TTL_MS = 25 * 1000;
const ROUTES_TTL_MS = 12 * 60 * 60 * 1000;
const LINES_TTL_MS = 12 * 60 * 60 * 1000;

const DEFAULT_STOP_LIMIT = 5;
const MAX_STOP_LIMIT = 20;

function parseStopLimit(rawLimit) {
  if (rawLimit === undefined) return DEFAULT_STOP_LIMIT;
  const limit = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_STOP_LIMIT;
  return Math.min(limit, MAX_STOP_LIMIT);
}

// Coordinates are read from the POST body so they never end up in URLs/access
// logs. GET query params are kept for backward compatibility.
function stopsParams(req) {
  if (req.method === 'POST') {
    const body = req.body ?? {};
    return { lat: Number(body.lat), lng: Number(body.lng), limit: body.limit };
  }
  return { lat: Number(req.query.lat), lng: Number(req.query.lng), limit: req.query.limit };
}

export function createApiRouter() {
  const router = Router();

  // GET /api/stops?lat=37.98&lng=23.73&limit=5 | POST /api/stops {lat, lng, limit}
  async function handleStops(req, res) {
    const { lat, lng, limit: rawLimit } = stopsParams(req);

    if (!isValidLatitude(lat) || !isValidLongitude(lng)) {
      res.status(400).json({
        error: 'invalid_coordinates',
        message: 'Δώσε έγκυρα lat και lng.',
      });
      return;
    }

    if (!isWithinServiceArea(lat, lng)) {
      res.status(400).json({
        error: 'outside_service_area',
        message: 'Οι στάσεις του ΟΑΣΑ καλύπτουν μόνο την Αττική.',
      });
      return;
    }

    const limit = parseStopLimit(rawLimit);
    // Στρογγυλοποιούμε στο cache key ώστε δύο χρήστες 10 μέτρα μακριά
    // να μοιράζονται το ίδιο αποτέλεσμα.
    const cacheKey = `stops:${lat.toFixed(4)}:${lng.toFixed(4)}`;
    const stops = await cached(cacheKey, STOPS_TTL_MS, () => fetchClosestStops(lat, lng));

    const nearest = stops
      .map((stop) => ({
        ...stop,
        distanceMeters: Math.round(distanceInMeters(lat, lng, stop.lat, stop.lng)),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, limit);

    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    res.json({ origin: { lat, lng }, stops: nearest });
  }

  router.get('/stops', handleStops);
  router.post('/stops', handleStops);

  // GET /api/arrivals?stop=400075
  router.get('/arrivals', async (req, res) => {
    const stopCode = String(req.query.stop ?? '').trim();

    if (!/^\d{1,10}$/.test(stopCode)) {
      res.status(400).json({
        error: 'invalid_stop_code',
        message: 'Ο κωδικός στάσης πρέπει να είναι αριθμός.',
      });
      return;
    }

    const [arrivalsResult, routesResult] = await Promise.allSettled([
      cached(`arrivals:${stopCode}`, ARRIVALS_TTL_MS, () => fetchStopArrivals(stopCode)),
      cached(`routes:${stopCode}`, ROUTES_TTL_MS, () => fetchRoutesForStop(stopCode)),
    ]);

    if (arrivalsResult.status === 'rejected') {
      res.status(502).json({ error: 'oasa_unavailable', message: 'Δεν μπορέσαμε να επικοινωνήσουμε με το ΟΑΣΑ αυτή τη στιγμή.' });
      return;
    }

    const arrivals = arrivalsResult.value;
    const routes = routesResult.status === 'fulfilled' ? routesResult.value : [];

    const routesByCode = new Map(routes.map((route) => [route.routeCode, route]));

    const enriched = arrivals
      .map((arrival) => {
        const route = routesByCode.get(arrival.routeCode);
        return {
          lineId: route?.lineId ?? arrival.routeCode,
          lineName: route?.lineName ?? null,
          lineNameEn: route?.lineNameEn ?? null,
          direction: route?.routeName ?? null,
          directionEn: route?.routeNameEn ?? null,
          minutes: arrival.minutes,
          vehicleCode: arrival.vehicleCode,
        };
      })
      .sort((a, b) => a.minutes - b.minutes);

    res.setHeader('Cache-Control', 'public, max-age=10');
    res.json({
      stopCode,
      fetchedAt: new Date().toISOString(),
      arrivals: enriched,
    });
  });

  // GET /api/lines — όλες οι γραμμές
  router.get('/lines', async (req, res) => {
    try {
      const lines = await cached('lines:all', LINES_TTL_MS, () => fetchAllLines());
      const q = (req.query.q ?? '').toString().toLowerCase().trim();
      let filtered = lines;
      if (q) {
        filtered = lines.filter(
          (l) => l.lineId.toLowerCase().includes(q) || l.lineName.toLowerCase().includes(q),
        );
      }
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(filtered.slice(0, 50));
    } catch {
      res.status(502).json({ error: 'oasa_unavailable', message: 'Δεν μπορέσαμε να επικοινωνήσουμε με το ΟΑΣΑ.' });
    }
  });

  // GET /api/lines/:lineId/stops — στάσεις για μία γραμμή
  router.get('/lines/:lineId/stops', async (req, res) => {
    try {
      const { lineId } = req.params;
      const lines = await cached('lines:all', LINES_TTL_MS, () => fetchAllLines());
      const matching = lines.filter((l) => l.lineId === lineId);

      if (matching.length === 0) {
        res.status(404).json({ error: 'line_not_found', message: 'Η γραμμή δεν βρέθηκε.' });
        return;
      }

      const primary = matching[0];
      const allRouteCodes = new Set();
      const routeNames = [];

      for (const line of matching) {
        const routes = await cached(`routes:${line.lineCode}`, ROUTES_TTL_MS, () =>
          fetchRoutesForLine(line.lineCode),
        );
        for (const route of routes) {
          allRouteCodes.add(route.routeCode);
          routeNames.push({ routeCode: route.routeCode, routeName: route.routeName, routeNameEn: route.routeNameEn });
        }
      }

      const routeStops = [];
      for (const rc of allRouteCodes) {
        const stops = await cached(`stops:route:${rc}`, ROUTES_TTL_MS, () => fetchRouteStops(rc));
        routeStops.push({ routeCode: rc, stops });
      }

      const stopsByRoute = Object.fromEntries(
        routeStops.map((rs) => [rs.routeCode, rs.stops]),
      );

      res.setHeader('Cache-Control', 'public, max-age=600');
      res.json({
        lineId,
        lineName: primary.lineName,
        lineNameEn: primary.lineNameEn,
        routes: routeNames.map((r) => ({
          ...r,
          stops: stopsByRoute[r.routeCode] ?? [],
        })),
      });
    } catch {
      res.status(502).json({ error: 'oasa_unavailable', message: 'Δεν μπορέσαμε να επικοινωνήσουμε με το ΟΑΣΑ.' });
    }
  });

  // GET /api/search-stops?q=... — αναζήτηση στάσεων με όνομα
  router.get('/search-stops', (req, res) => {
    const q = (req.query.q ?? '').trim();
    if (!q || q.length < 2) {
      res.json({ stops: [], index: indexStatus() });
      return;
    }
    const stops = searchStops(q);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ stops, index: indexStatus() });
  });

  return router;
}
