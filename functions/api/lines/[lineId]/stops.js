import { fetchAllLines, fetchRoutesForLine, fetchRouteStops } from '../../../_lib/oasaClient.js';
import { cached } from '../../../_lib/cache.js';

const LINES_TTL_MS = 12 * 60 * 60 * 1000;
const ROUTES_TTL_MS = 12 * 60 * 60 * 1000;

const GREEK_TO_LATIN = {
  'α':'a','β':'b','γ':'g','δ':'d','ε':'e','ζ':'z','η':'h','ι':'i',
  'κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','ο':'o','π':'p','ρ':'r',
  'σ':'s','ς':'s','τ':'t','υ':'y','φ':'f','χ':'x','ψ':'ps','ω':'o',
  'ά':'a','έ':'e','ή':'h','ί':'i','ό':'o','ύ':'y','ώ':'o',
  'ϊ':'i','ϋ':'y',
};

function normalize(s) {
  return s.toLowerCase().split('').map((c) => GREEK_TO_LATIN[c] || c).join('');
}

export async function onRequestGet(context) {
  try {
    const lineId = context.params.lineId;
    const lines = await cached('lines:all', LINES_TTL_MS, () => fetchAllLines());
    const matching = lines.filter((l) => normalize(l.lineId) === normalize(lineId));

    if (matching.length === 0) {
      return new Response(
        JSON.stringify({ error: 'line_not_found', message: 'Η γραμμή δεν βρέθηκε.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
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
      { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' } },
    );
  } catch {
    return new Response(
      JSON.stringify({ error: 'oasa_unavailable', message: 'Δεν μπορέσαμε να επικοινωνήσουμε με το ΟΑΣΑ.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
