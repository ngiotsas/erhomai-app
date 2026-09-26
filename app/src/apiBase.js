// Base URL for the JSON API.
//
// Same-origin by default (empty string). Set VITE_API_BASE at build time to
// point the static frontend at an external backend, e.g. when the static
// host's network cannot reach OASA directly:
//
//   VITE_API_BASE=https://api.example.com npm --prefix app run build
//
// The external backend must allow CORS (src/server.js does).
const raw = ((import.meta.env ?? {}).VITE_API_BASE ?? '').trim().replace(/\/+$/, '');

export const API_BASE = raw;

export function api(path) {
  return `${API_BASE}${path}`;
}
