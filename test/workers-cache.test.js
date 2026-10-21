import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cached } from '../functions/_lib/cache.js';

// functions/_lib/cache.js relies on the Workers Cache API (globalThis.caches)
// and Request/Response globals; emulate the Cache API surface it uses with a
// Map that honors Cache-Control max-age, so the contract is testable in Node.

const realNow = Date.now;
const realCaches = globalThis.caches;
let now;
let fakeCache;

class FakeCache {
  constructor() { this.store = new Map(); }
  async match(req) {
    const entry = this.store.get(req.url);
    if (!entry) return null;
    if (now - entry.storedAt > entry.maxAgeMs) {
      this.store.delete(req.url);
      return null;
    }
    return entry.response.clone();
  }
  async put(req, res) {
    const cc = res.headers.get('Cache-Control') ?? '';
    const maxAgeSec = Number(/max-age=(\d+)/.exec(cc)?.[1] ?? 0);
    this.store.set(req.url, { response: res.clone(), storedAt: now, maxAgeMs: maxAgeSec * 1000 });
  }
}

beforeEach(() => {
  now = realNow();
  Date.now = () => now;
  fakeCache = new FakeCache();
  globalThis.caches = { default: fakeCache };
});

afterEach(() => {
  Date.now = realNow;
  globalThis.caches = realCaches;
});

let keySeq = 0;
function nextKey() { return `test:${++keySeq}`; }

describe('functions/_lib/cache.js', () => {
  it('miss calls produce exactly once and returns its value', async () => {
    const key = nextKey();
    let calls = 0;
    const result = await cached(key, 20, async () => { calls++; return 42; });
    assert.equal(result, 42);
    assert.equal(calls, 1);
    assert.equal(fakeCache.store.size, 1);
  });

  it('stores the value with Cache-Control max-age derived from ttlMs', async () => {
    const key = nextKey();
    await cached(key, 25 * 1000, async () => 'arrivals');
    const entry = fakeCache.store.get(`https://cache.internal/${encodeURIComponent(key)}`);
    assert.ok(entry, 'entry written to Cache API');
    assert.match(entry.response.headers.get('Cache-Control'), /max-age=25/);
    const body = await entry.response.json();
    assert.equal(body.__value, 'arrivals');
  });

  it('hit inside TTL does not call produce again', async () => {
    const key = nextKey();
    let calls = 0;
    await cached(key, 60000, async () => { calls++; return 'first'; });
    const result = await cached(key, 60000, async () => { calls++; return 'second'; });
    assert.equal(result, 'first');
    assert.equal(calls, 1);
  });

  it('produce is called again after the Cache API entry expires', async () => {
    const key = nextKey();
    let calls = 0;
    await cached(key, 1000, async () => { calls++; return 'first'; });
    now += 2000; // fake clock: max-age was ceil(1000/1000) = 1s
    const result = await cached(key, 1000, async () => { calls++; return 'second'; });
    assert.equal(result, 'second');
    assert.equal(calls, 2);
  });

  it('singleflight: N concurrent calls produce exactly once and resolve to the same value', async () => {
    const key = nextKey();
    let calls = 0;
    const results = await Promise.all([
      cached(key, 30000, async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return 'shared'; }),
      cached(key, 30000, async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return 'shared'; }),
      cached(key, 30000, async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return 'shared'; }),
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(results, ['shared', 'shared', 'shared']);
  });

  it('negative cache: an error is stored with the 5s negative TTL and rethrown without new produce calls', async () => {
    const key = nextKey();
    let calls = 0;
    const theError = new Error('oasa-down');
    await assert.rejects(() => cached(key, 30000, async () => { calls++; throw theError; }), /oasa-down/);
    assert.equal(calls, 1);

    const entry = fakeCache.store.get(`https://cache.internal/${encodeURIComponent(key)}`);
    assert.ok(entry, 'negative response stored');
    assert.match(entry.response.headers.get('Cache-Control'), /max-age=5/);

    // Second call rethrows from the cache without touching produce.
    calls = 0;
    await assert.rejects(() => cached(key, 30000, async () => { calls++; return 'x'; }), /oasa-down/);
    assert.equal(calls, 0);

    // After the negative TTL expires, produce runs again.
    now += 6000;
    const result = await cached(key, 30000, async () => { calls++; return 'recovered'; });
    assert.equal(result, 'recovered');
    assert.equal(calls, 1);
  });
});
