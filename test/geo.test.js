import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { distanceInMeters, isValidLatitude, isValidLongitude } from '../src/geo.js';

describe('distanceInMeters', () => {
  it('returns ~0 for the same point', () => {
    assert.ok(distanceInMeters(37.9838, 23.7275, 37.9838, 23.7275) < 0.1);
  });

  it('returns ~11 km for Athens centre to Piraeus', () => {
    const d = distanceInMeters(37.9838, 23.7275, 37.9432, 23.6459);
    assert.ok(d > 8000 && d < 9000, `expected ~8300m, got ${d}`);
  });

  it('calculates known Athens pair within 1m', () => {
    const d1 = distanceInMeters(37.9838, 23.7275, 37.9839, 23.7275);
    const d2 = distanceInMeters(37.9838, 23.7275, 37.9838, 23.7276);
    assert.ok(Math.abs(d1 - 11.1) < 1, `lat offset: ${d1}`);
    assert.ok(Math.abs(d2 - 8.7) < 1, `lng offset: ${d2}`);
  });
});

describe('isValidLatitude', () => {
  it('accepts valid values', () => {
    assert.equal(isValidLatitude(0), true);
    assert.equal(isValidLatitude(90), true);
    assert.equal(isValidLatitude(-90), true);
    assert.equal(isValidLatitude(37.98), true);
  });

  it('rejects out-of-range values', () => {
    assert.equal(isValidLatitude(90.1), false);
    assert.equal(isValidLatitude(-90.1), false);
    assert.equal(isValidLatitude(Infinity), false);
    assert.equal(isValidLatitude(-Infinity), false);
    assert.equal(isValidLatitude(NaN), false);
  });
});

describe('isValidLongitude', () => {
  it('accepts valid values', () => {
    assert.equal(isValidLongitude(0), true);
    assert.equal(isValidLongitude(180), true);
    assert.equal(isValidLongitude(-180), true);
    assert.equal(isValidLongitude(23.73), true);
  });

  it('rejects out-of-range values', () => {
    assert.equal(isValidLongitude(180.1), false);
    assert.equal(isValidLongitude(-180.1), false);
    assert.equal(isValidLongitude(Infinity), false);
    assert.equal(isValidLongitude(-Infinity), false);
    assert.equal(isValidLongitude(NaN), false);
  });
});
