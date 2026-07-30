// Two-layer cache: in-memory Map (singleflight + fast) + Cloudflare Cache API (cross-isolate).
// Singleflight ensures only one request per key is in-flight to OASA.
// The Cache API shares results across all Worker isolates.

const NEGATIVE_TTL_MS = 5000;
export { NEGATIVE_TTL_MS };

const inFlight = new Map();

function makeCacheRequest(key) {
  return new Request(`https://cache.internal/${encodeURIComponent(key)}`);
}

export async function cached(key, ttlMs, produce) {
  // Cross-isolate: check CF Cache API
  const cacheReq = makeCacheRequest(key);
  let hit = await caches.default.match(cacheReq);
  if (hit) {
    const body = await hit.json();
    if (body.__error) {
      const err = new Error(body.__message);
      err.__oasaError = body.__oasaError || false;
      throw err;
    }
    return body.__value;
  }

  // Singleflight: deduplicate concurrent requests within this isolate
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const value = await produce();
      const response = new Response(
        JSON.stringify({ __value: value }),
        { headers: { 'Cache-Control': `public, max-age=${Math.ceil(ttlMs / 1000)}` } },
      );
      caches.default.put(cacheReq, response);
      return value;
    } catch (err) {
      const response = new Response(
        JSON.stringify({
          __error: true,
          __message: err.message,
          __oasaError: err.name === 'OasaError',
        }),
        { headers: { 'Cache-Control': `public, max-age=${Math.ceil(NEGATIVE_TTL_MS / 1000)}` } },
      );
      caches.default.put(cacheReq, response);
      throw err;
    }
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}
