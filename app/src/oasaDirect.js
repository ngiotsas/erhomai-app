// Direct OASA access from the browser — no backend required.
//
// OASA serves HTTPS with `Access-Control-Allow-Origin: *`, so plain GET
// requests are CORS-simple (no preflight). Rules for this file:
// - GET only, no custom headers. Anything else risks a preflight that the
//   ancient Apache stack does not answer with CORS headers.
// - Shapes returned here mirror the Express backend responses 1:1, so the
//   UI cannot tell which path served it.

const BASE_URL = 'https://telematics.oasa.gr/api/';
const TIMEOUT_MS = 10000;

const ATTICA = { minLat: 37.6, maxLat: 38.4, minLng: 23.3, maxLng: 24.2 };

const GREEK_TO_LATIN = {
  'α': 'a', 'β': 'b', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'h', 'ι': 'i',
  'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p', 'ρ': 'r',
  'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'y', 'φ': 'f', 'χ': 'x', 'ψ': 'ps', 'ω': 'o',
  'ά': 'a', 'έ': 'e', 'ή': 'h', 'ί': 'i', 'ό': 'o', 'ύ': 'y', 'ώ': 'o',
  'ϊ': 'i', 'ϋ': 'y',
};

export class ApiError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export function normalizeLineText(s) {
  return s.toLowerCase().split('').map((c) => GREEK_TO_LATIN[c] || c).join('');
}

const EARTH_RADIUS_METERS = 6371008.8;
const toRadians = (d) => (d * Math.PI) / 180;

export function distanceInMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

function oasaUrl(act, params) {
  const url = new URL(BASE_URL);
  url.searchParams.set('act', act);
  params.forEach((value, index) => {
    url.searchParams.set(`p${index + 1}`, String(value));
  });
  return url;
}

async function oasaGet(act, params = [], signal) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  let res;
  try {
    res = await fetch(oasaUrl(act, params), {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (err) {
    if (err?.name === 'AbortError' || err?.name === 'TimeoutError') throw err;
    throw new ApiError('oasa_unavailable', err?.message);
  }
  if (!res.ok) throw new ApiError('oasa_unavailable', `HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new ApiError('oasa_unavailable', 'bad JSON');
  }
}

const asArray = (v) => (Array.isArray(v) ? v : []);

function mapStop(stop) {
  return {
    code: String(stop.StopCode),
    name: stop.StopDescr,
    nameEn: stop.StopDescrEng ?? null,
    street: stop.StopStreet ?? null,
    streetEn: stop.StopStreetEng ?? null,
    lat: Number(stop.StopLat),
    lng: Number(stop.StopLng),
  };
}

export async function directStops({ lat, lng, limit = 5 }, signal) {
  if (
    !Number.isFinite(lat) || lat < -90 || lat > 90 ||
    !Number.isFinite(lng) || lng < -180 || lng > 180
  ) {
    throw new ApiError('invalid_coordinates');
  }
  if (lat < ATTICA.minLat || lat > ATTICA.maxLat || lng < ATTICA.minLng || lng > ATTICA.maxLng) {
    throw new ApiError('outside_service_area');
  }
  let raw;
  try {
    raw = await oasaGet('getClosestStops', [lat, lng], signal);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw err;
  }
  const stops = asArray(raw)
    .map((s) => ({ ...mapStop(s) }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map((s) => ({ ...s, distanceMeters: Math.round(distanceInMeters(lat, lng, s.lat, s.lng)) }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, Math.min(Math.max(limit, 1), 20));
  return { stops };
}

export async function directArrivals(stopCode, signal) {
  if (!/^\d{1,10}$/.test(String(stopCode ?? '').trim())) {
    throw new ApiError('invalid_stop_code');
  }
  const code = String(stopCode).trim();
  const [arrivalsRaw, routesRaw] = await Promise.all([
    oasaGet('getStopArrivals', [code], signal).catch(() => {
      throw new ApiError('oasa_unavailable');
    }),
    oasaGet('webRoutesForStop', [code], signal).catch(() => []),
  ]);
  const routesByCode = new Map(
    asArray(routesRaw).map((r) => [String(r.RouteCode), r]),
  );
  const arrivals = asArray(arrivalsRaw)
    .map((a) => ({
      routeCode: String(a.route_code),
      vehicleCode: String(a.veh_code),
      minutes: Number.parseInt(a.btime2, 10),
    }))
    .filter((a) => Number.isFinite(a.minutes))
    .map((a) => {
      const route = routesByCode.get(a.routeCode);
      return {
        lineId: route?.LineID ?? a.routeCode,
        lineName: route?.LineDescr ?? null,
        lineNameEn: route?.LineDescrEng ?? null,
        direction: route?.RouteDescr ?? null,
        directionEn: route?.RouteDescrEng ?? null,
        minutes: a.minutes,
        vehicleCode: a.vehicleCode,
      };
    })
    .sort((a, b) => a.minutes - b.minutes);
  return { stopCode: code, fetchedAt: new Date().toISOString(), arrivals };
}

let linesCache = null;

async function getAllLines(signal) {
  if (!linesCache) {
    linesCache = oasaGet('webGetLinesWithMLInfo', [], signal)
      .then((raw) =>
        asArray(raw).map((l) => ({
          lineCode: String(l.line_code),
          lineId: String(l.line_id),
          lineName: l.line_descr,
          lineNameEn: l.line_descr_eng ?? null,
        })),
      )
      .catch((err) => {
        linesCache = null;
        throw err instanceof ApiError ? err : new ApiError('oasa_unavailable');
      });
  }
  return linesCache;
}

export async function directLines(q = '', signal) {
  const lines = await getAllLines(signal);
  const query = q.trim();
  if (!query) return lines.slice(0, 50);
  const qNorm = normalizeLineText(query);
  const qLower = query.toLowerCase();
  return lines
    .filter(
      (l) =>
        normalizeLineText(l.lineId).includes(qNorm) ||
        normalizeLineText(l.lineName).includes(qNorm) ||
        (l.lineNameEn && l.lineNameEn.toLowerCase().includes(qLower)),
    )
    .slice(0, 50);
}

export async function directLineStops(lineId, signal) {
  const lines = await getAllLines(signal);
  const matching = lines.filter(
    (l) => normalizeLineText(l.lineId) === normalizeLineText(String(lineId)),
  );
  if (matching.length === 0) throw new ApiError('line_not_found');
  const primary = matching[0];
  const routeNames = [];
  const routeCodes = new Set();
  await Promise.all(
    matching.map(async (line) => {
      const routes = asArray(await oasaGet('webGetRoutes', [line.lineCode], signal));
      for (const r of routes) {
        routeCodes.add(String(r.RouteCode));
        routeNames.push({
          routeCode: String(r.RouteCode),
          routeName: r.RouteDescr,
          routeNameEn: r.RouteDescrEng ?? null,
        });
      }
    }),
  );
  const stopsByRoute = {};
  await Promise.all(
    [...routeCodes].map(async (rc) => {
      const raw = await oasaGet('webGetRoutesDetailsAndStops', [rc], signal);
      const stops = asArray(raw?.stops)
        .map((s) => ({
          code: String(s.StopCode),
          name: s.StopDescr,
          nameEn: s.StopDescrEng ?? null,
          street: s.StopStreet ?? null,
          streetEn: s.StopStreetEng ?? null,
          lat: Number(s.StopLat),
          lng: Number(s.StopLng),
          order: Number(s.RouteStopOrder),
        }))
        .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
      stopsByRoute[rc] = stops;
    }),
  );
  return {
    lineId: primary.lineId,
    lineName: primary.lineName,
    lineNameEn: primary.lineNameEn,
    routes: routeNames.map((r) => ({ ...r, stops: stopsByRoute[r.routeCode] ?? [] })),
  };
}

let stopsIndexCache = null;

export async function searchStaticStops(q) {
  const query = q.trim().toLowerCase();
  if (!stopsIndexCache) {
    stopsIndexCache = import('./stopsIndex.json').then((m) => m.default ?? m);
  }
  const index = await stopsIndexCache;
  const results = [];
  if (query.length >= 2) {
    for (const stop of index) {
      if (
        (stop.name && stop.name.toLowerCase().includes(query)) ||
        (stop.nameEn && stop.nameEn.toLowerCase().includes(query)) ||
        (stop.street && stop.street.toLowerCase().includes(query)) ||
        (stop.streetEn && stop.streetEn.toLowerCase().includes(query))
      ) {
        results.push(stop);
      }
      if (results.length >= 20) break;
    }
  }
  return {
    stops: results,
    index: { ready: true, building: false, stale: false, failed: false, stops: index.length },
  };
}
