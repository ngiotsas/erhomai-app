# TODO — Code review findings (2026-10-21)

Full review of the Workers backend (`functions/`), Express backend (`src/`), frontend (`app/src`), PWA/TWA assets, and tests. All 29 tests pass, lint is clean. Checkboxes = open items, ordered by severity.

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

- [ ] **M1. Backend logic duplicated between `src/` and `functions/`, with drift already.**
  `geo.js`, `oasaClient.js`, `cache.js`, `searchIndex.js` exist twice with subtle differences, and tests only cover the `src/` copies. *(The specific drift noted in the review — Express `/api/lines` lacking Greek↔Latin normalization — was fixed by the parallel session in `f929202`.)*
  *Fix:* share one module between targets, or add parity tests for the `functions/` copies.

- [ ] **M2. `GREEK_TO_LATIN` duplicated three times, with drift.**
  In `functions/api/lines.js`, `functions/api/lines/[lineId]/stops.js`, and `app/src/components/SearchView/SearchView.jsx`. The client copy lacks accented vowels and `ϊ/ϋ` that the server copies have.
  *Fix:* one shared module (or a test asserting equality).

- [ ] **M3. Sequential upstream fetches in `/api/lines/:lineId/stops`.**
  `functions/api/lines/[lineId]/stops.js:51-54` fetches route stops one at a time with a 6s timeout each — up to 24s cold for a 4-route line, past the client timeout. Any single failure 502s the whole request instead of partial results.
  *Fix:* `Promise.all` with batching (same pattern as the index builder); return partial results on route failure.

- [x] **M4. UserWay SRI pin on a mutable URL will silently break.** *(fixed)*
  The SRI pin was removed by the parallel session (`0e38b92`), and the Express CSP now matches `_headers` (this pass). Both halves of this item are closed.

- [ ] **M5. `Cache-Control` / `stale-while-revalidate` headers on Function responses are inert.**
  `stops.js:66`, `arrivals.js:51`, `lines.js:55`, `lines/[lineId]/stops.js:70` set headers that Cloudflare ignores on Function responses (see H1) — they only affect browser caching of GETs.
  *Fix:* route through `cached()` or drop the misleading headers.

- [ ] **M6. Silent partial index corruption.**
  `doBuildIndex` swallows every per-line/per-route failure (`.catch(() => {})` / `.catch(() => [])`). After a partial OASA outage the build "succeeds" with an incomplete index, saves it to KV for 12h, and reports `ready: true`.
  *Fix:* track a failure count and mark the index `degraded` above a threshold.

- [ ] **M7. Frontend nits.**
  - `app/src/translations.js:48,135` — `privacyWhat3` has a stray leading space.
  - Hardcoded `aria-label="Clear"` (SearchView ×2) and `"Switch language"` (AppShell) — not localized.
  - `Legal.jsx:65` hardcodes `2026-08-03` as "last updated" — now stale.
  - `functions/sitemap.xml.js:2` sets `lastmod` to today's date on every generation.

## Low

- [ ] **L1.** `functions/_lib/cache.js:39,50` — `caches.default.put()` not awaited and no error handling; a rejected put is silently lost (cache misses only, correctness fine).
- [ ] **L2.** Negative caching on Workers (`cache.js:20-24`) rethrows a fresh plain `Error`, discarding `OasaError.name`/`action`; `__oasaError` is stored but never read.
- [ ] **L3.** `app/public/_headers:10-15` — immutable rules cover only `index-*`, `MapView-*`, `SearchView-*`; any other hashed chunk falls through to heuristic caching. Consider `/assets/*.js`.
- [ ] **L4.** `app/public/sw.js:24-30` — if `/index.html` fetch fails at install, a 503 app-shell is cached and offline users get stuck; the asset regex misses `modulepreload`/`preload` links.
- [ ] **L5.** `useStops.js` keeps showing the previous location's stops while new coordinates load.
- [ ] **L6.** `AbortSignal.any` needs Safari 17.4+/Firefox 124+ — note for older Android WebViews in the TWA.
- [ ] **L7.** `docs/code-review.md` open P3 item (`createStopElement` per stop per render in `MapView.jsx:14`) is still open and accurate.
- [ ] **L8.** No tests exercise the `functions/` handlers or any frontend code; 29 tests cover `src/` logic only.

## What not to change

Correct and should survive refactors: haversine + rejecting OASA's undocumented `distance` field; manual `JSON.parse` of upstream bodies with `AbortSignal.timeout`; singleflight + negative-cache design; `Promise.allSettled` in arrivals (routes failure degrades to route codes as `lineId`); POST-body coordinates; the transliterator's digraph/case handling; the stale-response guard in `useArrivals` (`activeStopRef`).

## History

Previous resolved item (English map tiles → OpenFreeMap/MapLibre) is documented in `docs/code-review.md` ("Licensing update").
