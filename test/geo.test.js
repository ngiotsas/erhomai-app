import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as srcGeo from '../src/geo.js';
import * as functionsGeo from '../functions/_lib/geo.js';

// The same module exists in both backends (Pages Functions cannot import
// outside functions/); run every case against both so they cannot drift.
for (const [label, geo] of [
  ['src/geo.js', srcGeo],
  ['functions/_lib/geo.js', functionsGeo],
]) {
  describe(label, () => {
    describe('distanceInMeters', () => {
      it('returns ~0 for the same point', () => {
        assert.ok(geo.distanceInMeters(37.9838, 23.7275, 37.9838, 23.7275) < 0.1);
      });

      it('returns ~8.3 km for Athens centre to Piraeus', () => {
        const d = geo.distanceInMeters(37.9838, 23.7275, 37.9432, 23.6459);
        assert.ok(d > 8000 && d < 9000, `expected ~8300m, got ${d}`);
      });

      it('calculates known Athens pair within 1m', () => {
        const d1 = geo.distanceInMeters(37.9838, 23.7275, 37.9839, 23.7275);
        const d2 = geo.distanceInMeters(37.9838, 23.7275, 37.9838, 23.7276);
        assert.ok(Math.abs(d1 - 11.1) < 1, `lat offset: ${d1}`);
        assert.ok(Math.abs(d2 - 8.7) < 1, `lng offset: ${d2}`);
      });
    });

    describe('isValidLatitude', () => {
      it('accepts valid values', () => {
        assert.equal(geo.isValidLatitude(0), true);
        assert.equal(geo.isValidLatitude(90), true);
        assert.equal(geo.isValidLatitude(-90), true);
        assert.equal(geo.isValidLatitude(37.98), true);
      });

      it('rejects out-of-range values', () => {
        assert.equal(geo.isValidLatitude(90.1), false);
        assert.equal(geo.isValidLatitude(-90.1), false);
        assert.equal(geo.isValidLatitude(Infinity), false);
        assert.equal(geo.isValidLatitude(-Infinity), false);
        assert.equal(geo.isValidLatitude(NaN), false);
      });
    });

    describe('isValidLongitude', () => {
      it('accepts valid values', () => {
        assert.equal(geo.isValidLongitude(0), true);
        assert.equal(geo.isValidLongitude(180), true);
        assert.equal(geo.isValidLongitude(-180), true);
        assert.equal(geo.isValidLongitude(23.73), true);
      });

      it('rejects out-of-range values', () => {
        assert.equal(geo.isValidLongitude(180.1), false);
        assert.equal(geo.isValidLongitude(-180.1), false);
        assert.equal(geo.isValidLongitude(Infinity), false);
        assert.equal(geo.isValidLongitude(-Infinity), false);
        assert.equal(geo.isValidLongitude(NaN), false);
      });
    });

    describe('isWithinServiceArea', () => {
      it('accepts Athens', () => {
        assert.equal(geo.isWithinServiceArea(37.9838, 23.7275), true);
      });
      it('rejects London and the poles', () => {
        assert.equal(geo.isWithinServiceArea(51.5, -0.12), false);
        assert.equal(geo.isWithinServiceArea(90, 0), false);
        assert.equal(geo.isWithinServiceArea(0, 0), false);
      });
    });
  });
}
