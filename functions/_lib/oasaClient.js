const BASE_URL = 'https://telematics.oasa.gr/api/';
const REQUEST_TIMEOUT_MS = 6000;

export class OasaError extends Error {
  constructor(message, { action, status, cause } = {}) {
    super(message);
    this.name = 'OasaError';
    this.action = action;
    this.status = status;
    this.cause = cause;
  }
}

async function callOasa(action, params) {
  const url = new URL(BASE_URL);
  url.searchParams.set('act', action);
  params.forEach((value, index) => {
    url.searchParams.set(`p${index + 1}`, String(value));
  });

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'User-Agent': 'erhomai/0.1 (+https://erhomai.gr)' },
    });
  } catch (cause) {
    throw new OasaError(`Το OASA δεν απάντησε στο ${action}`, { action, cause });
  }

  if (!response.ok) {
    throw new OasaError(`Το OASA γύρισε HTTP ${response.status} στο ${action}`, {
      action,
      status: response.status,
    });
  }

  const body = await response.text();
  if (body.trim() === '') return null;

  try {
    return JSON.parse(body);
  } catch (cause) {
    throw new OasaError(`Μη έγκυρο JSON από το ${action}`, { action, cause });
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export async function fetchClosestStops(latitude, longitude) {
  const raw = await callOasa('getClosestStops', [latitude, longitude]);
  return asArray(raw)
    .map((stop) => ({
      code: String(stop.StopCode),
      name: stop.StopDescr,
      nameEn: stop.StopDescrEng ?? null,
      street: stop.StopStreet ?? null,
      streetEn: stop.StopStreetEng ?? null,
      lat: Number(stop.StopLat),
      lng: Number(stop.StopLng),
    }))
    .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
}

export async function fetchStopArrivals(stopCode) {
  const raw = await callOasa('getStopArrivals', [stopCode]);
  return asArray(raw)
    .map((arrival) => ({
      routeCode: String(arrival.route_code),
      vehicleCode: String(arrival.veh_code),
      minutes: Number.parseInt(arrival.btime2, 10),
    }))
    .filter((arrival) => Number.isFinite(arrival.minutes));
}

export async function fetchRoutesForStop(stopCode) {
  const raw = await callOasa('webRoutesForStop', [stopCode]);
  return asArray(raw).map((route) => ({
    routeCode: String(route.RouteCode),
    lineId: route.LineID ?? null,
    lineName: route.LineDescr ?? null,
    lineNameEn: route.LineDescrEng ?? null,
    routeName: route.RouteDescr ?? null,
    routeNameEn: route.RouteDescrEng ?? null,
  }));
}

export async function fetchAllLines() {
  const raw = await callOasa('webGetLinesWithMLInfo', []);
  return asArray(raw).map((line) => ({
    lineCode: String(line.line_code),
    lineId: String(line.line_id),
    lineName: line.line_descr,
    lineNameEn: line.line_descr_eng ?? null,
  }));
}

export async function fetchRoutesForLine(lineCode) {
  const raw = await callOasa('webGetRoutes', [lineCode]);
  return asArray(raw).map((route) => ({
    routeCode: String(route.RouteCode),
    routeName: route.RouteDescr,
    routeNameEn: route.RouteDescrEng ?? null,
  }));
}

export async function fetchRouteStops(routeCode) {
  const raw = await callOasa('webGetRoutesDetailsAndStops', [routeCode]);
  if (!raw || !raw.stops) return [];
  return asArray(raw.stops)
    .map((stop) => ({
      code: String(stop.StopCode),
      name: stop.StopDescr,
      nameEn: stop.StopDescrEng ?? null,
      street: stop.StopStreet ?? null,
      streetEn: stop.StopStreetEng ?? null,
      lat: Number(stop.StopLat),
      lng: Number(stop.StopLng),
      order: Number(stop.RouteStopOrder),
    }))
    .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
}
