import {
  isValidLatitude, isValidLongitude, isWithinServiceArea,
  distanceInMeters,
} from '../_lib/geo.js';
import { fetchClosestStops } from '../_lib/oasaClient.js';

function parseStopLimit(rawLimit) {
  const DEFAULT_STOP_LIMIT = 5;
  const MAX_STOP_LIMIT = 20;
  if (rawLimit === undefined) return DEFAULT_STOP_LIMIT;
  const limit = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_STOP_LIMIT;
  return Math.min(limit, MAX_STOP_LIMIT);
}

// Coordinates are sent in the request body (POST) so they never end up in
// URLs/access logs. GET is kept for backward compatibility.
async function readParams(context) {
  const { searchParams } = new URL(context.request.url);
  if (context.request.method === 'POST') {
    const body = await context.request.json().catch(() => ({}));
    return {
      lat: Number(body.lat),
      lng: Number(body.lng),
      limit: body.limit,
    };
  }
  return {
    lat: Number(searchParams.get('lat')),
    lng: Number(searchParams.get('lng')),
    limit: searchParams.get('limit'),
  };
}

async function handleStops(context) {
  const { lat, lng, limit: rawLimit } = await readParams(context);

  if (!isValidLatitude(lat) || !isValidLongitude(lng)) {
    return new Response(
      JSON.stringify({ error: 'invalid_coordinates', message: 'Δώσε έγκυρα lat και lng.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!isWithinServiceArea(lat, lng)) {
    return new Response(
      JSON.stringify({ error: 'outside_service_area', message: 'Οι στάσεις του ΟΑΣΑ καλύπτουν μόνο την Αττική.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const limit = parseStopLimit(rawLimit);

  try {
    const stops = await fetchClosestStops(lat, lng);
    const nearest = stops
      .map((stop) => ({
        ...stop,
        distanceMeters: Math.round(distanceInMeters(lat, lng, stop.lat, stop.lng)),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, limit);

    return new Response(
      JSON.stringify({ origin: { lat, lng }, stops: nearest }),
      { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'oasa_unavailable', message: 'Δεν μπορέσαμε να επικοινωνήσουμε με το ΟΑΣΑ.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

export async function onRequestGet(context) {
  return handleStops(context);
}

export async function onRequestPost(context) {
  return handleStops(context);
}
