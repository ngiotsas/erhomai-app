import { Router } from 'express';
import { cached } from './cache.js';
import { distanceInMeters, isValidLatitude, isValidLongitude } from './geo.js';
import { fetchClosestStops, fetchRoutesForStop, fetchStopArrivals } from './oasaClient.js';

const STOPS_TTL_MS = 5 * 60 * 1000;
const ARRIVALS_TTL_MS = 25 * 1000;
const ROUTES_TTL_MS = 12 * 60 * 60 * 1000;

const DEFAULT_STOP_LIMIT = 5;
const MAX_STOP_LIMIT = 20;

function parseStopLimit(rawLimit) {
  if (rawLimit === undefined) return DEFAULT_STOP_LIMIT;
  const limit = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_STOP_LIMIT;
  return Math.min(limit, MAX_STOP_LIMIT);
}

export function createApiRouter() {
  const router = Router();

  // GET /api/stops?lat=37.98&lng=23.73&limit=5
  router.get('/stops', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (!isValidLatitude(lat) || !isValidLongitude(lng)) {
      res.status(400).json({
        error: 'invalid_coordinates',
        message: 'Δώσε έγκυρα lat και lng.',
      });
      return;
    }

    const limit = parseStopLimit(req.query.limit);
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

    res.json({ origin: { lat, lng }, stops: nearest });
  });

  // GET /api/arrivals?stop=400075
  router.get('/arrivals', async (req, res) => {
    const stopCode = String(req.query.stop ?? '').trim();

    if (!/^\d+$/.test(stopCode)) {
      res.status(400).json({
        error: 'invalid_stop_code',
        message: 'Ο κωδικός στάσης πρέπει να είναι αριθμός.',
      });
      return;
    }

    const [arrivals, routes] = await Promise.all([
      cached(`arrivals:${stopCode}`, ARRIVALS_TTL_MS, () => fetchStopArrivals(stopCode)),
      cached(`routes:${stopCode}`, ROUTES_TTL_MS, () => fetchRoutesForStop(stopCode)),
    ]);

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

    res.json({
      stopCode,
      fetchedAt: new Date().toISOString(),
      arrivals: enriched,
    });
  });

  return router;
}
