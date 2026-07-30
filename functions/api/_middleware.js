const rateLimitMap = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;

export async function onRequest(context) {
  // Rate limiting
  const ip = context.request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const key = `rl:${ip}`;
  const now = Date.now();

  let entry = rateLimitMap.get(key);
  if (!entry || now - entry.reset >= RATE_WINDOW_MS) {
    entry = { count: 0, reset: now + RATE_WINDOW_MS };
    rateLimitMap.set(key, entry);
  }

  entry.count++;
  if (entry.count > RATE_MAX) {
    return new Response(
      JSON.stringify({ error: 'rate_limited', message: 'Πολλά requests. Δοκίμασε ξανά σε λίγο.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const response = await context.next();

  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Access-Control-Allow-Origin', '*');

  return response;
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
