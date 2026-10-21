import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as srcClient from '../src/oasaClient.js';
import * as functionsClient from '../functions/_lib/oasaClient.js';

// The OASA client exists in both backends (Pages Functions cannot import
// outside functions/); run every case against both so they cannot drift.

const realFetch = globalThis.fetch;
let mock;
let calls = [];

function stubFetch(impl) {
  mock = impl;
  globalThis.fetch = impl;
}

function jsonBody(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

for (const [label, client] of [
  ['src/oasaClient.js', srcClient],
  ['functions/_lib/oasaClient.js', functionsClient],
]) {
  describe(label, () => {
    it('fetchClosestStops maps fields and drops stops without coordinates', async () => {
      stubFetch(async (url, init) => {
        calls.push({ url, init });
        return jsonBody([
          {
            StopCode: '400058', StopDescr: 'ΒΕΝΙΖΕΛΟΥ', StopDescrEng: 'VENIZELOY',
            StopStreet: 'ΓΡ.ΛΑΜΠΡΑΚΗ', StopStreetEng: null,
            StopLat: '37.9432677', StopLng: '23.6520113',
          },
          { StopCode: 'bad', StopLat: 'abc', StopLng: '23.5' },
        ]);
      });
      const stops = await client.fetchClosestStops(37.9838, 23.7275);
      assert.equal(stops.length, 1);
      assert.deepEqual(stops[0], {
        code: '400058', name: 'ΒΕΝΙΖΕΛΟΥ', nameEn: 'VENIZELOY',
        street: 'ΓΡ.ΛΑΜΠΡΑΚΗ', streetEn: null,
        lat: 37.9432677, lng: 23.6520113,
      });
      const url = new URL(calls[0].url);
      assert.equal(url.searchParams.get('act'), 'getClosestStops');
      assert.equal(url.searchParams.get('p1'), '37.9838');
      assert.equal(url.searchParams.get('p2'), '23.7275');
    });

    it('fetchClosestStops returns [] for null, object, and empty-array bodies', async () => {
      for (const body of [null, {}, [], { error: 'nope' }]) {
        stubFetch(async () => jsonBody(body));
        assert.deepEqual(await client.fetchClosestStops(37.98, 23.73), []);
      }
    });

    it('fetchStopArrivals maps route/vehicle/minutes and drops non-numeric minutes', async () => {
      stubFetch(async () => jsonBody([
        { route_code: '2051', veh_code: '50328', btime2: '5' },
        { route_code: '2051', veh_code: '99999', btime2: 'garbage' },
      ]));
      const arrivals = await client.fetchStopArrivals('400058');
      assert.deepEqual(arrivals, [{ routeCode: '2051', vehicleCode: '50328', minutes: 5 }]);
    });

    it('fetchRoutesForStop maps route metadata', async () => {
      stubFetch(async () => jsonBody([
        { RouteCode: '2051', LineID: '1025', LineDescr: 'ΣΥΝΤΑΓΜΑ', LineDescrEng: 'SYNTAGMA', RouteDescr: 'ΑΠΟ Α', RouteDescrEng: 'FROM A' },
      ]));
      assert.deepEqual(await client.fetchRoutesForStop('400058'), [{
        routeCode: '2051', lineId: '1025', lineName: 'ΣΥΝΤΑΓΜΑ',
        lineNameEn: 'SYNTAGMA', routeName: 'ΑΠΟ Α', routeNameEn: 'FROM A',
      }]);
    });

    it('fetchAllLines maps line metadata', async () => {
      stubFetch(async () => jsonBody([
        { line_code: '999', line_id: 'X95', line_descr: 'ΕΞΠΡΕΣ', line_descr_eng: 'EXPRESS' },
      ]));
      assert.deepEqual(await client.fetchAllLines(), [{
        lineCode: '999', lineId: 'X95', lineName: 'ΕΞΠΡΕΣ', lineNameEn: 'EXPRESS',
      }]);
    });

    it('fetchRouteStops maps stops and returns [] for null or missing stops', async () => {
      stubFetch(async () => jsonBody({
        stops: [{ StopCode: '10361', StopDescr: 'ΣΥΝΤΑΓΜΑ', StopDescrEng: 'SYNTAGMA', StopLat: '37.974908', StopLng: '23.7348845', RouteStopOrder: '1' }],
      }));
      assert.deepEqual(await client.fetchRouteStops('2051'), [{
        code: '10361', name: 'ΣΥΝΤΑΓΜΑ', nameEn: 'SYNTAGMA', street: null, streetEn: null,
        lat: 37.974908, lng: 23.7348845, order: 1,
      }]);

      for (const body of [null, {}, { notStops: [] }]) {
        stubFetch(async () => jsonBody(body));
        assert.deepEqual(await client.fetchRouteStops('2051'), []);
      }
    });

    it('throws OasaError on HTTP errors', async () => {
      stubFetch(async () => new Response('no', { status: 503 }));
      await assert.rejects(
        () => client.fetchAllLines(),
        (err) => err.name === 'OasaError' && err.status === 503 && err.action === 'webGetLinesWithMLInfo',
      );
    });

    it('throws OasaError on network failure', async () => {
      stubFetch(async () => { throw new Error('ECONNREFUSED'); });
      await assert.rejects(
        () => client.fetchStopArrivals('400058'),
        (err) => err.name === 'OasaError' && err.action === 'getStopArrivals',
      );
    });

    it('throws OasaError on invalid JSON', async () => {
      stubFetch(async () => new Response('<html>oops</html>', { status: 200 }));
      await assert.rejects(
        () => client.fetchAllLines(),
        (err) => err.name === 'OasaError' && /JSON/.test(err.message),
      );
    });
  });
}
