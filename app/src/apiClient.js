// Data layer: talks to the Express backend when VITE_API_BASE is set,
// otherwise calls OASA directly from the browser (HTTPS + ACAO:* allow it).
// Both paths return identical shapes; the UI cannot tell them apart.

import { api, API_BASE } from './apiBase.js';
import { ApiError, directStops, directArrivals, directLines, directLineStops, searchStaticStops } from './oasaDirect.js';

export { ApiError };

const hasBackend = () => API_BASE !== '';
const BACKEND_TIMEOUT_MS = 9000;

function withTimeout(signal, ms = BACKEND_TIMEOUT_MS) {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function throwBackendError(res, body) {
  throw new ApiError(body?.error || `http_${res.status}`, body?.message);
}

export async function fetchStops({ lat, lng, limit }, signal) {
  if (!hasBackend()) return directStops({ lat, lng, limit }, signal);
  const res = await fetch(api('/api/stops'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, limit }),
    signal: withTimeout(signal),
  });
  const data = await readJson(res);
  if (!res.ok) throwBackendError(res, data);
  return { stops: Array.isArray(data.stops) ? data.stops : [] };
}

export async function fetchArrivals(stopCode, signal) {
  if (!hasBackend()) return directArrivals(stopCode, signal);
  const res = await fetch(api(`/api/arrivals?stop=${encodeURIComponent(stopCode)}`), {
    signal: withTimeout(signal, 8000),
  });
  const data = await readJson(res);
  if (!res.ok) throwBackendError(res, data);
  return { arrivals: data.arrivals ?? [], fetchedAt: data.fetchedAt ?? null };
}

export async function searchLines(q, signal) {
  if (!hasBackend()) return directLines(q, signal);
  const res = await fetch(api('/api/lines'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: q.trim() }),
    signal: withTimeout(signal, 6000),
  });
  if (!res.ok) throw new ApiError(`http_${res.status}`);
  const data = await readJson(res);
  return Array.isArray(data) ? data : [];
}

export async function fetchLineStops(lineId) {
  if (!hasBackend()) return directLineStops(lineId);
  const res = await fetch(api(`/api/lines/${encodeURIComponent(lineId)}/stops`));
  const data = await readJson(res);
  if (!res.ok) throwBackendError(res, data);
  return data;
}

export async function searchStopNames(q, signal) {
  if (!hasBackend()) return searchStaticStops(q);
  const res = await fetch(api('/api/search-stops'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: q.trim() }),
    signal: withTimeout(signal, 6000),
  });
  if (!res.ok) throw new ApiError(`http_${res.status}`);
  const data = await readJson(res);
  return { stops: data.stops ?? [], index: data.index ?? null };
}
