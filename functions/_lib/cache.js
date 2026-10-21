// Two-layer cache: in-memory Map (singleflight + fast) + Cloudflare Cache API (cross-isolate).
// Singleflight ensures only one request per key is in-flight to OASA.
// The Cache API shares results across all Worker isolates.

const NEGATIVE_TTL_MS = 5000;
export { NEGATIVE_TTL_MS };

const inFlight = new Map();

function makeCacheRequest(key) {
  return new Request(`https://cache.internal/${encodeURIComponent(key)}`);
}

// Cache writes are best-effort: a failed put only costs a future cache miss,
// it must never fail (or slow down) the caller's request.
async function bestEffortPut(cacheReq, response) {
  try {
    await caches.default.put(cacheReq, response);
  } catch {
    // ignored on purpose
  }
}

export async function cached(key, ttlMs, produce) {
  // Cross-isolate: check CF Cache API
  const cacheReq = makeCacheRequest(key);
  let hit = await caches.default.match(cacheReq);
  if (hit) {
    const body = await hit.json();
    if (body.__error) {
      // Reconstruct the error with the metadata captured when it was stored,
      // so callers that inspect err.name/err.action keep working on cache hits.
      const err = new Error(body.__message);
      err.name = body.__name ?? 'Error';
      if (body.__action) err.action = body.__action;
      if (body.__status) err.status = body.__status;
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
      await bestEffortPut(cacheReq, response);
      return value;
    } catch (err) {
      const response = new Response(
        JSON.stringify({
          __error: true,
          __message: err.message,
          __name: err.name,
          __action: err.action,
          __status: err.status,
        }),
        { headers: { 'Cache-Control': `public, max-age=${Math.ceil(NEGATIVE_TTL_MS / 1000)}` } },
      );
      await bestEffortPut(cacheReq, response);
      throw err;
    }
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}
