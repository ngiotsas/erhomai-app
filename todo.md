# TODO — Code review findings (2026-10-21)

Full review of the Workers backend (`functions/`), Express backend (`src/`), frontend (`app/src`), PWA/TWA assets, and tests. All 106 tests pass, lint is clean. Checkboxes = open items, ordered by severity.

## Fixed 2026-10-22 (map pin misplacement, user-reported)

- [x] **Stop pins sat off their true location and scattered as the user zoomed.**
  Three compounding causes, all now fixed:
  1. **Anchor geometry.** The pin was a 32px circle with a 6px pointer triangle hanging below it, anchored `bottom` with `offset: [0, -4]` — the circle's visual center sat ~12px above the true coordinate (~45 m at zoom 15) while the tip dangled ~10px below. Fixed by anchoring the circle at its `center` and dropping the dangling triangle.
  2. **CSS cascade collision.** `.pin` set `position: relative` on the same element as MapLibre's `maplibregl-marker` (`position: absolute`); equal specificity and later source order meant the app rule won. Fixed by removing `position` from `.pin`/`.pinSelected`.
  3. **THE REAL ONE: `applySelectionStyle` wiped MapLibre's classes.** It assigned `el.className = styles.pin`, replacing the whole class attribute and deleting `maplibregl-marker` / `maplibregl-marker-anchor-center`. Without them the pins were `position: static` and stacked in document flow — measured in the browser as `dy = 0, 32, 64, …, 608px` per pin. The user's location dot was unaffected (it never passed through this function). Fixed by toggling only the app's own `pinSelected` class via `classList.toggle`.
  *Diagnosis tooling:* build `ade2795` added runtime diagnostics (`window.__erhomaiPinDiag`, console logging of per-pin rendered-vs-projected deltas on move and moveend) — the browser log `~/Downloads/erhomai.gr-1792619171334.log` is what exposed cause #3. Diagnostics are still in the bundle; remove them once the fix is verified on production.

## Fixed 2026-10-21 (map blank bug)

- [x] **Map not rendering — CSP `worker-src blob:` blocked the MapLibre worker.**
  Commit `7bec06b` ("explicit CSP headers") set `worker-src blob:`. MapLibre creates its worker directly from the same-origin URL `/assets/maplibre-gl-worker.mjs` (blob is only used cross-origin), so the worker was blocked, tiles never parsed, and the map stayed blank. The same directive also blocked service-worker registration (`/sw.js`) — the PWA was broken. Fixed in `app/public/_headers` (both rules) and `src/server.js`: `worker-src 'self' blob:`. Verified headless: map renders, 22 pins, 13 tile requests, 0 CSP violations.
- [x] **UserWay widget broken twice over.**
  1. CSP `style-src` lacked `cdn.userway.org`, blocking the widget's stylesheet (`widget_base.css`). Added `https://cdn.userway.org` to `style-src` in `_headers` + `src/server.js`.
  2. The `integrity` SRI pin on `cdn.userway.org/widget.js` (unversioned URL) went stale — UserWay's current file computes a different SHA-384, so browsers blocked the script. Removed the pin from `app/index.html`.
- [x] **Express CSP parity** — `src/server.js` now matches `_headers` (added `static.cloudflareinsights.com` to `script-src`, UserWay to `style-src`, `'self'` to `worker-src`).

Known follow-up (from the same session): when a browser lacks WebGL2, `MapView` crashes the whole app via the error boundary (`Cannot read properties of undefined`). Consider catching map init errors and showing a graceful fallback message.

## Fixed 2026-10-21 (H1–H4)

A parallel session (commits `f929202`–`b17cdb6`) had already implemented parts of H1/H3/H4; the merge kept their conventions (`CRON_SECRET`) and applied the rest of this review's fixes on top.

- [x] **H1. `/api/stops` caching on Workers.** Already implemented in the parallel session (`0e38b92`): `cached()` keyed by coordinates rounded to 4 decimals, TTL 5 min — identical to the review's recommendation and the Express backend.
- [x] **H2. Index build: bounded parallelism + non-blocking.** `functions/_lib/searchIndex.js` and `src/searchIndex.js` fetch per-line routes in batches of `CONCURRENCY` (5) instead of ~350 parallel calls. `ensureSearchIndex` now returns immediately after the KV read and runs the full build in the background — the triggering request responds with `index.building` instead of blocking for minutes. `indexStatus().building` now covers the KV-load phase too. Frontend (`SearchView.jsx`) suppresses "no stop found" while the index is building.
- [x] **H3. Rebuild endpoint auth.** The parallel session gated the endpoint behind `CRON_SECRET` (Bearer header or `?secret=`, 404 on failure). This pass added a constant-time comparison. README documents `wrangler pages secret put CRON_SECRET` and that Pages has no cron triggers — use an external scheduler, with the lazy background rebuild as fallback.
- [x] **H4. Rate-limit caveat documented.** `functions/api/_middleware.js` comments explain per-isolate semantics and the shared-bucket behavior when `CF-Connecting-IP` is absent (local dev). README "Known rough edges" advises a Cloudflare Rate Limiting rule or Durable Object for a hard per-IP limit.

Deploy steps after these fixes: `wrangler pages secret put CRON_SECRET --project-name erhomai`, then `wrangler pages deploy app/dist --project-name erhomai --branch main`.

Known follow-up (from the same session): when a browser lacks WebGL2, `MapView` crashes the whole app via the error boundary (`Cannot read properties of undefined`). Consider catching map init errors and showing a graceful fallback message.

## High

- [x] **H1. `/api/stops` has no server-side cache on Workers — every request hits OASA.** *(fixed — see above)*
- [x] **H2. Search-index build: unbounded parallelism + blocks user requests.** *(fixed — see above)*
- [x] **H3. `/api/_cron/rebuild-index` is an unauthenticated OASA DoS trigger.** *(fixed — see above)*
- [x] **H4. Workers rate limiting is per-isolate, not a hard per-IP limit.** *(documented — see above; a hard limit needs CF Rate Limiting rules or a Durable Object)*

## Medium

- [x] **M1. Backend logic duplicated between `src/` and `functions/`, with drift already.** *(fixed via parity tests)*
  Pages Functions cannot import outside `functions/`, so the copies must stay — but they can no longer drift silently. `test/geo.test.js` and `test/oasaClient.test.js` now run every case against both copies; `test/workers-cache.test.js` covers the Workers cache contract (singleflight, TTL, negative cache) with a stubbed Cache API. The one shared-module exception: `functions/_lib/normalize.js` is now the single server-side source for Greek↔Latin normalization, imported by `functions/api/lines.js`, `functions/api/lines/[lineId]/stops.js`, and `src/api.js`.

- [x] **M2. `GREEK_TO_LATIN` duplicated three times, with drift.** *(fixed)*
  Server: one module, `functions/_lib/normalize.js`, imported by all three server call sites. Client: extracted to `app/src/normalizeLineId.js` with the complete map (accents + dialytics added). `test/normalize.test.js` asserts the maps are identical and normalize identically over a Greek/Latin corpus.

- [x] **M3. Sequential upstream fetches in `/api/lines/:lineId/stops`.** *(fixed)*
  Both Workers (`functions/api/lines/[lineId]/stops.js`) and Express (`src/api.js`) now fetch routes-for-line and stops-for-route in parallel (`Promise.all`), and a single route/line failure degrades to an empty list for that route instead of a 502 for the whole request. A line with 4 routes is now ~4× faster on a cold cache.

- [x] **M4. UserWay SRI pin on a mutable URL will silently break.** *(fixed earlier — pin removed by the parallel session, CSP parity fixed in the H-round)*

- [x] **M5. `Cache-Control` / `stale-while-revalidate` headers on Function responses are inert.** *(fixed)*
  All API responses (stops, arrivals, lines, line stops, search-stops) on both backends now send `Cache-Control: no-store` — freshness is owned by the two server-side cache layers, and the app POSTs, which browsers never cache anyway. README Caching section documents this.

- [x] **M6. Silent partial index corruption.** *(fixed)*
  `doBuildIndex` (both backends) counts fetch attempts and failures; if ≥10% fail, the index is marked `degraded`, exposed via `indexStatus().degraded`, persisted in KV, and expires in 1h instead of 12h so it heals sooner. The frontend shows a soft "index incomplete" message when degraded. New translation keys `indexDegraded` (el/en).

- [x] **M7. Frontend nits.** *(fixed)*
  - `privacyWhat3` indentation fixed in `translations.js`.
  - `aria-label="Clear"` (SearchView ×2) and `"Switch language"` (AppShell) are now localized (`clearInput`, `switchLanguage`).
  - Privacy "last updated" date moved to translations (`privacyUpdatedDate: 2026-10-21`) in `Legal.jsx`.
  - `functions/sitemap.xml.js` uses a fixed `LAST_MODIFIED` constant instead of a per-request timestamp.

## Low

- [x] **L1.** `functions/_lib/cache.js` — `caches.default.put()` was fire-and-forget with no error handling. *(fixed)*
  Both put paths are now awaited inside `bestEffortPut`, which swallows failures: a failed cache write only costs a future miss, and can no longer surface as an unhandled rejection.

- [x] **L2.** Negative caching on Workers discarded `OasaError` metadata. *(fixed)*
  The negative-cache body now stores `__name`, `__action`, `__status` alongside the message, and cache hits reconstruct the error with that metadata, so callers inspecting `err.name`/`err.action` behave identically on hits and misses.

- [x] **L3.** `_headers` immutable rules only covered three chunk prefixes. *(fixed)*
  Replaced with `/assets/*.js` + `/assets/*.css` (1y, immutable). The non-hashed MapLibre files use `.mjs`, which does not match `*.js`, so they still fall through to the `/assets/maplibre-*` 1-week rule. Future hashed chunks are covered automatically.

- [x] **L4.** Service worker could cache a 503 app shell. *(fixed)*
  `sw.js` install only overwrites the cached shell when the `/index.html` fetch succeeds; a failed fetch no longer leaves a permanent 503 shell. The asset regex already covered `modulepreload`/`preload` links via the generic `href="…"` pattern (verified against the build output).

- [x] **L5.** `useStops.js` kept showing the previous location's stops. *(fixed)*
  The effect clears `stops` when coordinates change, so the list shows the loading state instead of flashing the wrong neighbourhood's stops.

- [x] **L6.** `AbortSignal.any` requires Chrome 116+/Safari 17.4+/Firefox 124+. *(fixed)*
  New `app/src/abort.js` (`signalWithTimeout`) wraps the native API with a manual-AbortController fallback for older engines; all four call sites use it. `twa/README.md` documents the compatibility note.

- [x] **L7.** `docs/code-review.md` open P3 items. *(fixed)*
  `createStopElement` now clones a pre-parsed `<template>` instead of re-parsing the SVG per stop; the ESLint-configuration item was already closed (`app/eslint.config.js`). The review doc's status section is updated.

- [x] **L8.** No tests for the `functions/` request handlers. *(fixed)*
  New `test/handlers.test.js` covers the middleware (security headers, 429 on the 61st request, OPTIONS preflight), `/api/stops` (valid/invalid/outside-area, GET compat, no upstream call on 400s), `/api/arrivals` (bad stop code, enrichment), `/api/lines` (Greek↔Latin matching), `/api/search-stops` (short query, background build → results), and `/api/_cron/rebuild-index` (404 without/wrong token, 200 with the secret). Suite total: 106 tests.

## What not to change

Correct and should survive refactors: haversine + rejecting OASA's undocumented `distance` field; manual `JSON.parse` of upstream bodies with `AbortSignal.timeout`; singleflight + negative-cache design; `Promise.allSettled` in arrivals (routes failure degrades to route codes as `lineId`); POST-body coordinates; the transliterator's digraph/case handling; the stale-response guard in `useArrivals` (`activeStopRef`).

## History

Previous resolved item (English map tiles → OpenFreeMap/MapLibre) is documented in `docs/code-review.md` ("Licensing update").
