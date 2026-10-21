import { fetchAllLines, fetchRoutesForLine, fetchRouteStops } from '../../../_lib/oasaClient.js';
import { cached } from '../../../_lib/cache.js';
import { normalizeLineText } from '../../../_lib/normalize.js';

const LINES_TTL_MS = 12 * 60 * 60 * 1000;
const ROUTES_TTL_MS = 12 * 60 * 60 * 1000;

export async function onRequestGet(context) {
  try {
    const lineId = context.params.lineId;
    const lines = await cached('lines:all', LINES_TTL_MS, () => fetchAllLines());
    const matching = lines.filter((l) => normalizeLineText(l.lineId) === normalizeLineText(lineId));

    if (matching.length === 0) {
      return new Response(
        JSON.stringify({ error: 'line_not_found', message: 'Η γραμμή δεν βρέθηκε.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const primary = matching[0];

    // Fetch routes for every matching line in parallel. One failing line
    // degrades to an empty route list instead of a 502 for everything.
    const routesResults = await Promise.all(
      matching.map((line) =>
        cached(`routes:${line.lineCode}`, ROUTES_TTL_MS, () => fetchRoutesForLine(line.lineCode))
          .catch(() => []),
      ),
    );

    const allRouteCodes = new Set();
    const routeNames = [];
    routesResults.forEach((routes) => {
      for (const route of routes) {
        allRouteCodes.add(route.routeCode);
        routeNames.push({
          routeCode: route.routeCode,
          routeName: route.routeName,
          routeNameEn: route.routeNameEn,
        });
      }
    });

    // Fetch stops for all routes in parallel; a single route failure
    // degrades to an empty stop list for that route only.
    const routeStops = await Promise.all(
      [...allRouteCodes].map((rc) =>
        cached(`stops:route:${rc}`, ROUTES_TTL_MS, () => fetchRouteStops(rc))
          .then((stops) => ({ routeCode: rc, stops }))
          .catch(() => ({ routeCode: rc, stops: [] })),
      ),
    );

    const stopsByRoute = Object.fromEntries(
      routeStops.map((rs) => [rs.routeCode, rs.stops]),
    );

    return new Response(
      JSON.stringify({
        lineId,
        lineName: primary.lineName,
        lineNameEn: primary.lineNameEn,
        routes: routeNames.map((r) => ({
          ...r,
          stops: stopsByRoute[r.routeCode] ?? [],
        })),
      }),
      { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
    );
  } catch {
    return new Response(
      JSON.stringify({ error: 'oasa_unavailable', message: 'Δεν μπορέσαμε να επικοινωνήσουμε με το ΟΑΣΑ.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
