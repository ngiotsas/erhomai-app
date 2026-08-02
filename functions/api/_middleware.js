const rateLimitMap = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;
const RATE_MAX_SEARCH = 120;

// Search endpoints are cheap (served from cache/in-memory index) and fire on
// every keystroke, so they get their own budget. This stops heavy searching
// from exhausting the budget that the core stops/arrivals calls need.
function poolFor(url) {
  const path = new URL(url).pathname;
  if (path.startsWith('/api/lines') || path.startsWith('/api/search-stops')) return 'search';
  return 'data';
}

const SECURITY_HEADERS = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Access-Control-Allow-Origin': '*',
};

function applySecurityHeaders(response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export async function onRequest(context) {
  // Prune expired entries so an IP is never retained beyond the rate-limit window.
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now >= entry.reset) rateLimitMap.delete(key);
  }

  // Rate limiting
  const ip = context.request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const pool = poolFor(context.request.url);
  const key = `rl:${pool}:${ip}`;
  const max = pool === 'search' ? RATE_MAX_SEARCH : RATE_MAX;

  let entry = rateLimitMap.get(key);
  if (!entry) {
    entry = { count: 0, reset: now + RATE_WINDOW_MS };
    rateLimitMap.set(key, entry);
  }

  entry.count++;
  if (entry.count > max) {
    return applySecurityHeaders(new Response(
      JSON.stringify({ error: 'rate_limited', message: 'Πολλά requests. Δοκίμασε ξανά σε λίγο.' }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } },
    ));
  }

  return applySecurityHeaders(await context.next());
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
