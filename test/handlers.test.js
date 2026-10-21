import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, onRequestOptions } from '../functions/api/_middleware.js';
import * as stopsHandler from '../functions/api/stops.js';
import * as arrivalsHandler from '../functions/api/arrivals.js';
import * as linesHandler from '../functions/api/lines.js';
import * as searchStopsHandler from '../functions/api/search-stops.js';
import * as cronHandler from '../functions/api/_cron/rebuild-index.js';
import { indexStatus } from '../functions/_lib/searchIndex.js';

// Handler-level tests for the Workers API. The OASA upstream is stubbed via
// globalThis.fetch; the Cache API via a Map that honors Cache-Control
// max-age; KV via a plain Map.

const realFetch = globalThis.fetch;
const realCaches = globalThis.caches;

let calls = [];
let fakeCache;

const FIXTURE = {
  webGetLinesWithMLInfo: [
    { line_code: '1', line_id: 'Χ95', line_descr: 'ΣΥΝΤΑΓΜΑ - ΑΕΡΟΛΙΜΕΝΑΣ', line_descr_eng: 'SYNTAGMA - AIRPORT' },
  ],
  webGetRoutes: [{ RouteCode: '100', RouteDescr: 'ΑΘΗΝΑ - ΑΕΡΟΛΙΜΕΝΑΣ', RouteDescrEng: 'ATHINA - AIRPORT' }],
  webGetRoutesDetailsAndStops: {
    stops: [{
      StopCode: '101', StopDescr: 'ΣΥΝΤΑΓΜΑ', StopDescrEng: 'SYNTAGMA',
      StopStreet: 'ΑΜΑΛΙΑΣ', StopStreetEng: null,
      StopLat: '37.974908', StopLng: '23.7348845', RouteStopOrder: '1',
    }],
  },
  getClosestStops: [{
    StopCode: '101', StopDescr: 'ΣΥΝΤΑΓΜΑ', StopDescrEng: 'SYNTAGMA',
    StopStreet: 'ΑΜΑΛΙΑΣ', StopStreetEng: null,
    StopLat: '37.974908', StopLng: '23.7348845',
  }],
  getStopArrivals: [{ route_code: '100', veh_code: '50328', btime2: '5' }],
  webRoutesForStop: [{
    RouteCode: '100', LineID: 'Χ95', LineDescr: 'ΣΥΝΤΑΓΜΑ - ΑΕΡΟΛΙΜΕΝΑΣ',
    LineDescrEng: 'SYNTAGMA - AIRPORT', RouteDescr: 'ΑΘΗΝΑ - ΑΕΡΟΛΙΜΕΝΑΣ', RouteDescrEng: 'ATHINA - AIRPORT',
  }],
};

function stubOasa() {
  calls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const act = u.searchParams.get('act');
    calls.push(act);
    const body = FIXTURE[act];
    if (body === undefined) return new Response('[]', { status: 200 });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

class FakeCache {
  constructor() { this.store = new Map(); }
  async match(req) {
    const entry = this.store.get(req.url);
    if (!entry) return null;
    if (Date.now() - entry.storedAt > entry.maxAgeMs) {
      this.store.delete(req.url);
      return null;
    }
    return entry.response.clone();
  }
  async put(req, res) {
    const cc = res.headers.get('Cache-Control') ?? '';
    const maxAgeSec = Number(/max-age=(\d+)/.exec(cc)?.[1] ?? 0);
    this.store.set(req.url, { response: res.clone(), storedAt: Date.now(), maxAgeMs: maxAgeSec * 1000 });
  }
}

function makeEnv() {
  const kv = new Map();
  return {
    SEARCH_INDEX: {
      async get(key) { return kv.get(key) ?? null; },
      async put(key, value) { kv.set(key, value); },
    },
    CRON_SECRET: 'test-secret',
  };
}

function context(path, { method = 'GET', body, headers = {} } = {}) {
  return {
    request: new Request(`http://localhost${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env: makeEnv(),
    params: {},
  };
}

beforeEach(() => {
  stubOasa();
  fakeCache = new FakeCache();
  globalThis.caches = { default: fakeCache };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.caches = realCaches;
});

describe('middleware', () => {
  it('applies security headers and passes through', async () => {
    const res = await onRequest({
      request: new Request('http://localhost/api/health', { headers: { 'CF-Connecting-IP': '9.9.9.1' } }),
      next: async () => new Response('ok'),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  });

  it('rate limits the 61st request per IP per minute with 429', async () => {
    const ip = '9.9.9.2';
    let last;
    for (let i = 0; i < 61; i++) {
      last = await onRequest({
        request: new Request('http://localhost/api/health', { headers: { 'CF-Connecting-IP': ip } }),
        next: async () => new Response('ok'),
      });
    }
    assert.equal(last.status, 429);
    assert.equal((await last.json()).error, 'rate_limited');
  });

  it('answers OPTIONS preflight with CORS headers', async () => {
    const res = await onRequestOptions();
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
    assert.match(res.headers.get('Access-Control-Allow-Methods'), /POST/);
  });
});

describe('/api/stops', () => {
  it('returns nearest stops with computed distance for valid POST coordinates', async () => {
    const res = await stopsHandler.onRequestPost(context('/api/stops', {
      method: 'POST',
      body: { lat: 37.9838, lng: 23.7275, limit: 5 },
    }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.origin, { lat: 37.9838, lng: 23.7275 });
    assert.equal(body.stops.length, 1);
    assert.equal(body.stops[0].code, '101');
    assert.ok(Number.isFinite(body.stops[0].distanceMeters));
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  });

  it('supports GET query params for backward compatibility', async () => {
    const res = await stopsHandler.onRequestGet(context('/api/stops?lat=37.9838&lng=23.7275'));
    assert.equal(res.status, 200);
  });

  it('rejects invalid coordinates without touching OASA', async () => {
    const res = await stopsHandler.onRequestPost(context('/api/stops', {
      method: 'POST', body: { lat: 999, lng: 23.7275 },
    }));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'invalid_coordinates');
    assert.deepEqual(calls, []);
  });

  it('rejects coordinates outside Attica without touching OASA', async () => {
    const res = await stopsHandler.onRequestPost(context('/api/stops', {
      method: 'POST', body: { lat: 51.5, lng: -0.12 },
    }));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'outside_service_area');
    assert.deepEqual(calls, []);
  });
});

describe('/api/arrivals', () => {
  it('rejects non-numeric stop codes without touching OASA', async () => {
    const res = await arrivalsHandler.onRequestGet(context('/api/arrivals?stop=abc'));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'invalid_stop_code');
    assert.deepEqual(calls, []);
  });

  it('enriches arrivals with line names from the routes lookup', async () => {
    const res = await arrivalsHandler.onRequestGet(context('/api/arrivals?stop=101'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.stopCode, '101');
    assert.equal(body.arrivals.length, 1);
    assert.equal(body.arrivals[0].lineId, 'Χ95');
    assert.equal(body.arrivals[0].minutes, 5);
    assert.equal(body.arrivals[0].vehicleCode, '50328');
  });
});

describe('/api/lines', () => {
  it('returns all lines when q is empty', async () => {
    const res = await linesHandler.onRequestPost(context('/api/lines', {
      method: 'POST', body: { q: '' },
    }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).length, 1);
  });

  it('matches Greek line IDs with Latin queries (x95 → Χ95)', async () => {
    const res = await linesHandler.onRequestPost(context('/api/lines', {
      method: 'POST', body: { q: 'x95' },
    }));
    const body = await res.json();
    assert.equal(body.length, 1);
    assert.equal(body[0].lineId, 'Χ95');
  });

  it('matches English line names case-insensitively', async () => {
    const res = await linesHandler.onRequestPost(context('/api/lines', {
      method: 'POST', body: { q: 'airport' },
    }));
    assert.equal((await res.json()).length, 1);
  });
});

describe('/api/search-stops', () => {
  it('returns an empty result and index status for queries shorter than 2 chars', async () => {
    const res = await searchStopsHandler.onRequestPost(context('/api/search-stops', {
      method: 'POST', body: { q: 'σ' },
    }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.stops, []);
    assert.ok('ready' in body.index && 'building' in body.index);
  });

  it('finds stops once the (background) index build completes', async () => {
    const res = await searchStopsHandler.onRequestPost(context('/api/search-stops', {
      method: 'POST', body: { q: 'συνταγμα' },
    }));
    assert.equal(res.status, 200);

    // The build runs in the background; wait for it instead of sleeping.
    for (let i = 0; i < 200 && !indexStatus().ready; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(indexStatus().ready, true);

    const after = await searchStopsHandler.onRequestPost(context('/api/search-stops', {
      method: 'POST', body: { q: 'συνταγμα' },
    }));
    const body = await after.json();
    assert.equal(body.stops.length, 1);
    assert.equal(body.stops[0].code, '101');
  });
});

describe('/api/_cron/rebuild-index', () => {
  it('returns 404 without a token', async () => {
    const res = await cronHandler.onRequestGet(context('/api/_cron/rebuild-index'));
    assert.equal(res.status, 404);
  });

  it('returns 404 with a wrong token', async () => {
    const res = await cronHandler.onRequestGet(context('/api/_cron/rebuild-index', {
      headers: { Authorization: 'Bearer wrong' },
    }));
    assert.equal(res.status, 404);
  });

  it('rebuilds with a correct bearer token', async () => {
    const res = await cronHandler.onRequestGet(context('/api/_cron/rebuild-index', {
      headers: { Authorization: 'Bearer test-secret' },
    }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.stops >= 1);
  });
});
