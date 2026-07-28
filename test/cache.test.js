import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { cached, cacheStats, MAX_ENTRIES } from '../src/cache.js';

let keySeq = 0;
function nextKey() { return `test:${++keySeq}`; }

describe('cached', () => {
  it('miss calls produce exactly once and returns its value', async () => {
    const key = nextKey();
    let calls = 0;
    const result = await cached(key, 20, async () => { calls++; return 42; });
    assert.equal(result, 42);
    assert.equal(calls, 1);
  });

  it('hit inside TTL does not call produce again', async () => {
    const key = nextKey();
    let calls = 0;
    await cached(key, 50, async () => { calls++; return 'first'; });
    const result = await cached(key, 50, async () => { calls++; return 'second'; });
    assert.equal(result, 'first');
    assert.equal(calls, 1);
  });

  it('produce is called again after TTL expiry', async () => {
    const key = nextKey();
    let calls = 0;
    await cached(key, 10, async () => { calls++; return 'first'; });
    await setTimeout(15);
    const result = await cached(key, 10, async () => { calls++; return 'second'; });
    assert.equal(result, 'second');
    assert.equal(calls, 2);
  });

  it('singleflight: N concurrent calls produce exactly once and resolve to the same value', async () => {
    const key = nextKey();
    let calls = 0;
    const results = await Promise.all([
      cached(key, 30, async () => { calls++; await setTimeout(5); return 'shared'; }),
      cached(key, 30, async () => { calls++; await setTimeout(5); return 'shared'; }),
      cached(key, 30, async () => { calls++; await setTimeout(5); return 'shared'; }),
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(results, ['shared', 'shared', 'shared']);
  });

  it('singleflight releases: call after settle + TTL expiry calls produce again', async () => {
    const key = nextKey();
    let calls = 0;
    await cached(key, 10, async () => { calls++; return 'first'; });
    await setTimeout(15);
    const result = await cached(key, 10, async () => { calls++; return 'second'; });
    assert.equal(result, 'second');
    assert.equal(calls, 2);
  });

  it('negative cache: rethrows the SAME error object (identity)', async () => {
    const key = nextKey();
    const theError = new Error('oasa-down');
    let caught;
    try {
      await cached(key, 30, async () => { throw theError; });
    } catch (e) {
      caught = e;
    }
    assert.equal(caught, theError);
  });

  it('negative cache: immediate second call rethrows without calling produce again', async () => {
    const key = nextKey();
    let calls = 0;
    const theError = new Error('oasa-down');
    try { await cached(key, 30, async () => { calls++; throw theError; }); } catch {}
    calls = 0;
    try { await cached(key, 30, async () => { calls++; throw theError; }); } catch {}
    assert.equal(calls, 0);
  });

  it('negative cache: concurrent waiters on rejected singleflight all receive the same rejection', async () => {
    const key = nextKey();
    const theError = new Error('oasa-down');
    const caught = [];
    await Promise.allSettled([
      cached(key, 30, async () => { throw theError; }),
      cached(key, 30, async () => { throw theError; }),
      cached(key, 30, async () => { throw theError; }),
    ]);
    try { await cached(key, 30, async () => { throw theError; }); } catch (e) { caught.push(e); }
    try { await cached(key, 30, async () => { throw theError; }); } catch (e) { caught.push(e); }
    assert.equal(caught.length, 2);
    assert.equal(caught[0], theError);
    assert.equal(caught[1], theError);
  });

  it('cacheStats().inFlight returns to 0 after a call settles, on both paths', async () => {
    const keySuccess = nextKey();
    await cached(keySuccess, 20, async () => 'ok');
    assert.equal(cacheStats().inFlight, 0);

    const keyError = nextKey();
    const theError = new Error('oasa-down');
    try { await cached(keyError, 20, async () => { throw theError; }); } catch {}
    assert.equal(cacheStats().inFlight, 0);
  });

  it('eviction: inserting MAX_ENTRIES + 50 keys stays within MAX_ENTRIES', async () => {
    const total = MAX_ENTRIES + 50;
    const promises = [];
    for (let i = 0; i < total; i++) {
      promises.push(cached(`evict:${i}`, 30, async () => i));
    }
    await Promise.all(promises);
    assert.ok(cacheStats().entries <= MAX_ENTRIES);
  });

  it('eviction covers the error path too', async () => {
    const total = MAX_ENTRIES + 50;
    const theError = new Error('oasa-down');
    const promises = [];
    for (let i = 0; i < total; i++) {
      promises.push(
        cached(`evict-err:${i}`, 30, async () => { throw theError; }).catch(() => {})
      );
    }
    await Promise.all(promises);
    assert.ok(cacheStats().entries <= MAX_ENTRIES);
  });
});
