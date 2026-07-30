import { fetchStopArrivals, fetchRoutesForStop } from '../_lib/oasaClient.js';
import { cached } from '../_lib/cache.js';

const ARRIVALS_TTL_MS = 25 * 1000;
const ROUTES_TTL_MS = 12 * 60 * 60 * 1000;

export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const stopCode = String(searchParams.get('stop') ?? '').trim();

  if (!/^\d{1,10}$/.test(stopCode)) {
    return new Response(
      JSON.stringify({ error: 'invalid_stop_code', message: 'Ο κωδικός στάσης πρέπει να είναι αριθμός.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const [arrivalsResult, routesResult] = await Promise.allSettled([
    cached(`arrivals:${stopCode}`, ARRIVALS_TTL_MS, () => fetchStopArrivals(stopCode)),
    cached(`routes:${stopCode}`, ROUTES_TTL_MS, () => fetchRoutesForStop(stopCode)),
  ]);

  if (arrivalsResult.status === 'rejected') {
    return new Response(
      JSON.stringify({ error: 'oasa_unavailable', message: 'Δεν μπορέσαμε να επικοινωνήσουμε με το ΟΑΣΑ αυτή τη στιγμή.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
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

  return new Response(
    JSON.stringify({ stopCode, fetchedAt: new Date().toISOString(), arrivals: enriched }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=10' } },
  );
}
