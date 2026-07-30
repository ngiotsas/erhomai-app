import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { cached } from './lib/cache.js';
import {
  distanceInMeters,
  isValidLatitude,
  isValidLongitude,
  isWithinServiceArea,
} from './lib/geo.js';
import {
  OasaError,
  fetchClosestStops,
  fetchRoutesForStop,
  fetchStopArrivals,
  fetchAllLines,
  fetchRoutesForLine,
  fetchRouteStops,
} from './lib/oasaClient.js';
import { searchStops, ensureSearchIndex, indexStatus, rebuildSearchIndex } from './lib/searchIndex.js';

const STOPS_TTL_MS = 5 * 60 * 1000;
const ARRIVALS_TTL_MS = 25 * 1000;
const ROUTES_TTL_MS = 12 * 60 * 60 * 1000;
const LINES_TTL_MS = 12 * 60 * 60 * 1000;

const DEFAULT_STOP_LIMIT = 5;
const MAX_STOP_LIMIT = 20;

// ── Rate limiter (in-isolate sliding window) ──

const rateLimitMap = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;

function rateLimiter(c, next) {
  const ip = c.req.header('CF-Connecting-IP') || '0.0.0.0';
  const key = `rl:${ip}`;
  const now = Date.now();

  let entry = rateLimitMap.get(key);
  if (!entry || now - entry.reset >= RATE_WINDOW_MS) {
    entry = { count: 0, reset: now + RATE_WINDOW_MS };
    rateLimitMap.set(key, entry);
  }

  entry.count++;
  if (entry.count > RATE_MAX) {
    return c.json(
      { error: 'rate_limited', message: 'Πολλά requests. Δοκίμασε ξανά σε λίγο.' },
      429,
    );
  }
  return next();
}

// ── Helpers ──

function parseStopLimit(rawLimit) {
  if (rawLimit === undefined) return DEFAULT_STOP_LIMIT;
  const limit = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_STOP_LIMIT;
  return Math.min(limit, MAX_STOP_LIMIT);
}

// ── App ──

const app = new Hono();

// Security headers on API responses
app.use('/api/*', async (c, next) => {
  await next();
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
});

// CORS for API
app.use('/api/*', cors({ origin: '*' }));

// Rate limiting on API routes
app.use('/api/*', rateLimiter);

// ── API routes ──

// GET /api/stops?lat=37.98&lng=23.73&limit=5
app.get('/api/stops', async (c) => {
  const lat = Number(c.req.query('lat'));
  const lng = Number(c.req.query('lng'));

  if (!isValidLatitude(lat) || !isValidLongitude(lng)) {
    return c.json(
      { error: 'invalid_coordinates', message: 'Δώσε έγκυρα lat και lng.' },
      400,
    );
  }

  if (!isWithinServiceArea(lat, lng)) {
    return c.json(
      { error: 'outside_service_area', message: 'Οι στάσεις του ΟΑΣΑ καλύπτουν μόνο την Αττική.' },
      400,
    );
  }

  const limit = parseStopLimit(c.req.query('limit'));
  const cacheKey = `stops:${lat.toFixed(4)}:${lng.toFixed(4)}`;
  const stops = await cached(cacheKey, STOPS_TTL_MS, () => fetchClosestStops(lat, lng));

  const nearest = stops
    .map((stop) => ({
      ...stop,
      distanceMeters: Math.round(distanceInMeters(lat, lng, stop.lat, stop.lng)),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);

  c.res.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  return c.json({ origin: { lat, lng }, stops: nearest });
});

// GET /api/arrivals?stop=400075
app.get('/api/arrivals', async (c) => {
  const stopCode = String(c.req.query('stop') ?? '').trim();

  if (!/^\d{1,10}$/.test(stopCode)) {
    return c.json(
      { error: 'invalid_stop_code', message: 'Ο κωδικός στάσης πρέπει να είναι αριθμός.' },
      400,
    );
  }

  const [arrivalsResult, routesResult] = await Promise.allSettled([
    cached(`arrivals:${stopCode}`, ARRIVALS_TTL_MS, () => fetchStopArrivals(stopCode)),
    cached(`routes:${stopCode}`, ROUTES_TTL_MS, () => fetchRoutesForStop(stopCode)),
  ]);

  if (arrivalsResult.status === 'rejected') {
    return c.json(
      { error: 'oasa_unavailable', message: 'Δεν μπορέσαμε να επικοινωνήσουμε με το ΟΑΣΑ αυτή τη στιγμή.' },
      502,
    );
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

  c.res.headers.set('Cache-Control', 'public, max-age=10');
  return c.json({
    stopCode,
    fetchedAt: new Date().toISOString(),
    arrivals: enriched,
  });
});

// GET /api/lines?q=...
app.get('/api/lines', async (c) => {
  try {
    const lines = await cached('lines:all', LINES_TTL_MS, () => fetchAllLines());
    const q = (c.req.query('q') ?? '').toString().toLowerCase().trim();
    let filtered = lines;
    if (q) {
      filtered = lines.filter(
        (l) => l.lineId.toLowerCase().includes(q) || l.lineName.toLowerCase().includes(q),
      );
    }
    c.res.headers.set('Cache-Control', 'public, max-age=300');
    return c.json(filtered.slice(0, 50));
  } catch {
    return c.json(
      { error: 'oasa_unavailable', message: 'Δεν μπορέσαμε να επικοινωνήσουμε με το ΟΑΣΑ.' },
      502,
    );
  }
});

// GET /api/lines/:lineId/stops
app.get('/api/lines/:lineId/stops', async (c) => {
  try {
    const lineId = c.req.param('lineId');
    const lines = await cached('lines:all', LINES_TTL_MS, () => fetchAllLines());
    const matching = lines.filter((l) => l.lineId === lineId);

    if (matching.length === 0) {
      return c.json({ error: 'line_not_found', message: 'Η γραμμή δεν βρέθηκε.' }, 404);
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
        routeNames.push({
          routeCode: route.routeCode,
          routeName: route.routeName,
          routeNameEn: route.routeNameEn,
        });
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

    c.res.headers.set('Cache-Control', 'public, max-age=600');
    return c.json({
      lineId,
      lineName: primary.lineName,
      lineNameEn: primary.lineNameEn,
      routes: routeNames.map((r) => ({
        ...r,
        stops: stopsByRoute[r.routeCode] ?? [],
      })),
    });
  } catch {
    return c.json(
      { error: 'oasa_unavailable', message: 'Δεν μπορέσαμε να επικοινωνήσουμε με το ΟΑΣΑ.' },
      502,
    );
  }
});

// GET /api/search-stops?q=...
app.get('/api/search-stops', (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (!q || q.length < 2) {
    return c.json({ stops: [], index: indexStatus() });
  }
  c.executionCtx.waitUntil(ensureSearchIndex(c.env));
  const stops = searchStops(q);
  c.res.headers.set('Cache-Control', 'public, max-age=300');
  return c.json({ stops, index: indexStatus() });
});

// GET /api/health
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// ── Cron: rebuild search index ──
// GET /api/_cron/rebuild-index (triggered by wrangler cron or manual call)
app.get('/api/_cron/rebuild-index', async (c) => {
  try {
    const size = await rebuildSearchIndex(c.env);
    return c.json({ ok: true, stops: size });
  } catch (err) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

// ── 404 for unmatched API routes ──
app.all('/api/*', (c) => {
  return c.json({ error: 'not_found', message: 'Άγνωστο endpoint.' }, 404);
});

// ── Fallback: serve static files via Pages ──
app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

// ── Error handling ──
app.onError((err, c) => {
  if (err instanceof OasaError) {
    console.error(`[oasa] ${err.action}${err.status ? ` (HTTP ${err.status})` : ''}: ${err.message}`, err.cause ?? '');
    return c.json(
      { error: 'upstream_unavailable', message: 'Το σύστημα τηλεματικής του ΟΑΣΑ δεν απαντάει αυτή τη στιγμή.' },
      502,
    );
  }
  console.error('[worker]', err);
  return c.json({ error: 'internal_error', message: 'Κάτι πήγε στραβά.' }, 500);
});

export default app;
