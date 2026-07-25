# Code review: `erhomai-app`

**Repo:** https://github.com/ngiotsas/erhomai-app
**Reviewed at:** `main`, 3 commits, 2026-07-25
**Scope:** full repo (Express backend in `src/`, React + Vite + Leaflet frontend in `app/`)

## How to use this document

Findings are grouped by priority. Each item states the location, the defect, the fix, and a
check that proves the fix worked. Work top to bottom. P0 and P1 are worth doing before the
site takes real traffic; P2 and P3 are cleanup.

Nothing here requires a redesign. The architecture is sound: the backend/frontend split is
justified by the upstream API's lack of HTTPS-by-default and CORS, the TTL cache with
singleflight is the right shape, and the module boundaries are clean.

---

## P0: fix before the site is public

### P0-1. Map attribution is disabled, which breaks the tile licences

**File:** `app/src/components/MapView/MapView.jsx:93`

`attributionControl={false}` removes credit for both tile providers. CARTO Positron is
derived from OpenStreetMap and carries ODbL attribution requirements; ESRI World Street Map
has its own credit requirement.

**Fix:** remove `attributionControl={false}` and set `attribution` on each `TileLayer`.

```jsx
const TILES = {
  el: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  en: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
};
```

**Check:** the attribution control renders in the map corner in both languages.

### P0-2. Inbound requests are unlimited, which defeats the cache and risks an OASA block

**Files:** `src/server.js`, `src/api.js:24`

`/api/stops` accepts any coordinate pair on Earth. Each distinct pair rounds to a distinct
cache key, so a caller walking a grid produces one upstream request per call and grows the
cache without bound. The README already notes there is no rate limiting toward OASA; the
missing half is a limit on the inbound side.

**Fix:** two changes.

1. Add `express-rate-limit` on `/api` (suggested: 60 requests per minute per IP).
2. Reject coordinates outside Attica in `src/geo.js`, since every legitimate user is there.

```js
// src/geo.js
const ATTICA = { minLat: 37.6, maxLat: 38.4, minLng: 23.3, maxLng: 24.2 };

export function isWithinServiceArea(lat, lng) {
  return (
    lat >= ATTICA.minLat && lat <= ATTICA.maxLat &&
    lng >= ATTICA.minLng && lng <= ATTICA.maxLng
  );
}
```

Return `400 outside_service_area` when the check fails, and give the frontend a matching
message so a user in London sees an explanation rather than an empty list.

**Check:** `curl "localhost:3000/api/stops?lat=51.5&lng=-0.12"` returns 400 without touching
OASA. Sixty-one rapid requests from one IP yield a 429.

### P0-3. The cache never evicts, so memory grows without bound

**File:** `src/cache.js:6,34`

`MAX_ENTRIES` is a sweep trigger, not a cap. `deleteExpiredEntries()` removes only expired
keys, then the write proceeds regardless. Route data lives for 12 hours across thousands of
possible stop codes, so the map passes 2000 entries and keeps climbing.

**Fix:**

```js
if (entries.size >= MAX_ENTRIES) {
  deleteExpiredEntries();
  while (entries.size >= MAX_ENTRIES) {
    entries.delete(entries.keys().next().value); // Map preserves insertion order
  }
}
```

For true LRU, re-`set` the entry on every cache hit in the fast path so that reads refresh
insertion order.

**Check:** a script inserting 5000 unique keys with a long TTL leaves `cacheStats().entries`
at `MAX_ENTRIES`, not 5000.

---

## P1: user-visible bugs

### P1-1. Browser language detection is dead code

**File:** `app/src/i18n.jsx:75-77`

```js
const browserLang = navigator.language?.split('-')[0];
if (browserLang === 'el') return 'el';
return 'el';   // both branches identical
```

`browserLang` is computed and discarded. Every visitor without a stored preference gets Greek,
contradicting the README's claim of automatic detection.

**Fix:**

```js
return navigator.language?.split('-')[0] === 'el' ? 'el' : 'en';
```

**Check:** launch with an `en-GB` browser locale and no `localStorage` entry; the UI opens in
English.

### P1-2. Arrivals blank out every 25 seconds

**File:** `app/src/hooks/useArrivals.js:22,56-58`

Every poll sets `FETCH_STATES.LOADING`, so the list unmounts and the loading message replaces
it once per cycle. A user watching a bus two minutes away sees the panel flash repeatedly. A
failed background poll also replaces a good list with an error banner.

**Fix:** distinguish the first fetch from a refresh.

```js
const fetchArrivals = useCallback(async (code, { background = false } = {}) => {
  if (!code) return;
  if (!background) setState(FETCH_STATES.LOADING);
  try {
    const res = await fetch(`/api/arrivals?stop=${code}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (activeStopRef.current !== code) return;
    setArrivals(data.arrivals ?? []);
    setFetchedAt(Date.now());
    setSecondsAgo(0);
    setState(FETCH_STATES.READY);
  } catch (error) {
    console.error('[arrivals]', error);
    if (activeStopRef.current !== code) return;
    if (!background) setState(FETCH_STATES.ERROR);
  }
}, []);
```

Call it plainly on selection and with `{ background: true }` from the interval. When a
background refresh fails, the stale list stays visible and the "X seconds ago" counter keeps
climbing, which communicates more than an error banner does.

**Check:** select a stop, watch for 60 seconds; the list never disappears.

### P1-3. Polling continues while the tab is hidden

**File:** `app/src/hooks/useArrivals.js:56-58`

A phone in a pocket keeps firing a request every 25 seconds indefinitely, against an API the
README describes as rate-limiting aggressively.

**Fix:**

```js
useEffect(() => {
  if (!stopCode) return;
  const tick = () => {
    if (document.visibilityState === 'visible') {
      fetchArrivals(stopCode, { background: true });
    }
  };
  const poll = setInterval(tick, POLL_INTERVAL_MS);
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') tick();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    clearInterval(poll);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}, [stopCode, fetchArrivals]);
```

**Check:** with a stop selected, switch tabs for two minutes; the network panel shows no
requests during that window and exactly one on return.

### P1-4. The stop card prints the same name twice in English

**File:** `app/src/components/StopCard/StopCard.jsx:37-41`

The heading uses `display(stop.name, stop.nameEn)` and the subtitle uses
`stop.nameEn ? stop.nameEn : stop.name`. In English mode both resolve to `nameEn`.

**Fix:** mirror the "other language" logic already correct in `MapView.jsx:155`. Extract it
into a helper so the two components share one implementation:

```js
// app/src/i18n.jsx, exposed alongside display()
const alternate = (greekText, englishText) =>
  lang === 'el' ? englishText : greekText;
```

**Check:** in English mode the subtitle shows the Greek name; in Greek mode it shows the
English one, and it is omitted when the alternate is missing.

### P1-5. Greek plural forms are wrong

**File:** `app/src/i18n.jsx:23,29`

English handles the plural (`n !== 1 ? 's' : ''`); Greek does not. The UI renders
"σε 1 λεπτά" and "πριν από 1 δευτερόλεπτα".

**Fix:**

```js
secondsAgo: (n) => `πριν από ${n} ${n === 1 ? 'δευτερόλεπτο' : 'δευτερόλεπτα'}`,
inMinutes: (n) => `σε ${n} ${n === 1 ? 'λεπτό' : 'λεπτά'}`,
```

Consider a special case for `n === 0`: "τώρα" and "now" read better than "σε 0 λεπτά".

**Check:** an arrival at 1 minute reads "σε 1 λεπτό".

### P1-6. The distance unit is hardcoded Greek

**Files:** `app/src/components/StopCard/StopCard.jsx:34`,
`app/src/components/MapView/MapView.jsx:129,156`

Visible text says `μ` in both languages while `t.stopLabel` announces "meters away" to screen
readers, so the two disagree in English mode.

**Fix:** add `metersShort: 'μ'` / `metersShort: 'm'` to the translation tables and use
`t.metersShort` at all three call sites.

**Check:** switch to English; every distance reads `143 m`.

### P1-7. Transliteration mangles title case and abbreviations

**File:** `app/src/transliterate.js:59,66,71`

Verified against real OASA-style strings:

| Input | Current output | Expected |
|---|---|---|
| `Τσακάλωφ` | `TSakalof` | `Tsakalof` |
| `ΑΓ.ΝΤΙΜΗΤΡΙΟΣ` | `AG.NTIMITRIOS` | `AG.DIMITRIOS` |
| `ΜΠΑΚΑΛΗΣ` | `BAKALIS` | `BAKALIS` (correct) |
| `ΓΡ.ΛΑΜΠΡΑΚΗ` | `GR.LAMPRAKI` | `GR.LAMPRAKI` (correct) |

Two separate defects:

1. **Case.** `origCase` uppercases the entire digraph value, so multi-character mappings
   (`ts`, `th`, `ch`, `ps`, `ng`) break when only the first Greek letter is capitalised.
2. **Word boundary.** The word-start test is `/\s/.test(stripped[i - 1])`, but OASA stop names
   abbreviate with periods constantly ("Ν.ΦΑΛΗΡΟΥ", "ΑΓ.", "ΓΡ."), so a digraph after a period
   takes the mid-word form.

**Fix:**

```js
// case
const firstUpper = stripped[i] === stripped[i].toUpperCase() && /\p{L}/u.test(stripped[i]);
const secondUpper = stripped[i + 1] === stripped[i + 1].toUpperCase();
result += firstUpper
  ? (secondUpper ? val.toUpperCase() : val[0].toUpperCase() + val.slice(1))
  : val;

// word boundary
} else if (i === 0 || !isGreek(stripped[i - 1])) {
  val = dg.start;
}
```

**Check:** the four rows in the table above all produce the expected column. Add them as unit
tests (see P2-1).

### P1-8. A malformed API response blanks the page

**Files:** `app/src/hooks/useStops.js:39`, `app/src/App.jsx:100`

`setStops(data.stops)` has no fallback. If `data.stops` is undefined, `App.jsx` then reads
`stops.length` and throws. There is no error boundary, so React unmounts the tree and the user
sees a white screen.

**Fix:** `setStops(Array.isArray(data.stops) ? data.stops : [])`, and add a top-level error
boundary in `main.jsx` that renders the telematics-unavailable message on any render error.

**Check:** stub the endpoint to return `{}`; the app shows "no stops found" instead of a blank
page.

---

## P2: robustness and maintainability

### P2-1. There are no tests

`src/geo.js`, `app/src/transliterate.js`, `parseStopLimit` in `src/api.js`, and the three
normalizers in `src/oasaClient.js` are pure functions with no dependencies. Node 20 ships
`node --test`, so this costs zero new packages.

Start with:

- `distanceInMeters` against two known Athens coordinate pairs, tolerance 1 m.
- `isValidLatitude` / `isValidLongitude` boundaries at ±90 and ±180, plus `NaN`.
- `toLatin` against the four rows in P1-7 plus `ΕΥΑΓΓΕΛΙΣΜΟΣ` and `ΑΥΤΟΚΙΝΗΤΟ`.
- `parseStopLimit` with `undefined`, `'abc'`, `'0'`, `'7'`, `'999'`.
- The `oasaClient` mappers against a recorded upstream payload and against a non-array error
  object.

Add `"test": "node --test"` to the root `package.json`.

### P2-2. Input validation gaps in the backend

| File | Issue | Fix |
|---|---|---|
| `src/api.js:57` | `/^\d+$/` accepts a stop code of unbounded length | `/^\d{1,10}$/` |
| `src/server.js:9` | `PORT=abc` yields `NaN`; `listen(NaN)` binds a random port silently | validate and exit with a clear message |
| `src/server.js` | `app.listen` has no `error` handler, so `EADDRINUSE` prints a raw stack | attach one |
| `src/server.js:28` | `startsWith('/api/')` misses a request to exactly `/api` | test `=== '/api'` too |

### P2-3. Errors are swallowed on the client

**Files:** `app/src/hooks/useStops.js:44`, `app/src/hooks/useArrivals.js:32`

Bare `catch {}` blocks discard the cause, so a network failure, an HTTP 502, and malformed JSON
all present identically and leave nothing in the console to debug from. Log the error before
setting `ERROR` state.

### P2-4. Selection toggling is implemented twice

**Files:** `app/src/App.jsx:24-26`, `app/src/components/MapView/MapView.jsx:72-77`

`App` toggles (`prev === code ? null : code`) and `MapView` toggles again before calling it.
The double negation cancels out today, so behaviour is correct by accident. Changing either
side in isolation breaks selection with no error.

**Fix:** `MapView` should call `onStopSelect(stop.code)` and let `App` own the toggle. Its
close button passing `null` continues to work.

### P2-5. `useGeolocation` duplicates its entire body

**File:** `app/src/hooks/useGeolocation.js:14-63`

The effect and `retry` are byte-identical. Extract one `requestPosition` callback and call it
from both. Add a `cancelled` flag in the effect cleanup so a late callback does not set state
after unmount.

Separately, calling `getCurrentPosition` again after a hard permission denial fails instantly
with no prompt. `navigator.permissions.query({ name: 'geolocation' })` distinguishes "denied
for this session" from "blocked in settings", which lets the retry button show honest text.

### P2-6. Dead code and unused dependencies

| Location | Item |
|---|---|
| `app/src/App.jsx:22,28-36,90` | The `aria-live` region is never written to. The effect reads `''`, clears `''`, restores `''`. Delete the ref, the effect, and the div; `StatusMessage`'s `role="status"` already handles announcements. |
| `package.json:20`, `app/package.json:19` | `concurrently` is installed but unused; `dev:ui` uses shell backgrounding instead |
| `app/package.json:17` | `@types/leaflet` in a project with no TypeScript |
| `app/src/components/MapView/MapView.jsx:28` | `ariaLabel: null` is not a Leaflet `divIcon` option |
| `app/src/components/StatusMessage/StatusMessage.jsx:5,8` | `isError` computed, then `type === 'error'` recomputed inline |
| `app/src/i18n.jsx:30` | `t.soon` reaches only an `aria-label`; sighted users get no equivalent |

### P2-7. `npm run dev:ui` leaves an orphan process

**File:** `package.json:13`

`node --watch src/server.js & npm --prefix app run dev` backgrounds the server with `&`, so
Ctrl-C kills Vite and leaves the backend running on port 3000. The next `npm run dev:ui` then
fails with `EADDRINUSE`. `concurrently` is already a dependency; use it.

```json
"dev:ui": "concurrently -k -n api,web \"node --watch src/server.js\" \"npm --prefix app run dev\""
```

### P2-8. No lint configuration

ESLint with `eslint-plugin-react-hooks` would have caught the dead `browserLang` branch, the
unused `isError`, and both unused dependencies at zero ongoing cost.

### P2-9. `.gitignore` does not cover `.env`

`todo.md` Option B proposes storing a MapTiler API key there. Add `.env` and `.env.*` before
that happens, not after.

---

## P3: performance and polish

None of these matter at current traffic. They are cheap, so fold them into whichever file the
agent is already touching.

| Location | Issue | Fix |
|---|---|---|
| `app/src/components/MapView/MapView.jsx:111` | `createStopIcon` builds a new `L.divIcon` per stop per render, so react-leaflet reassigns icons once per second while the freshness timer ticks | The SVG depends only on `isSelected`; hoist two module-level icons |
| `app/src/App.jsx:133-135` | `arrivals` and `secondsAgo` pass to all five `StopCard`s though only the selected one reads them, so the 1s timer re-renders every card and every `ArrivalItem` | Move the freshness counter into its own component, or wrap `ArrivalItem` in `React.memo` |
| `app/src/hooks/useArrivals.js:17,70-75` | `timerRef` is used by one effect only and the cleanup reads it indirectly | Use a local `const id = setInterval(...)` and drop the ref |
| `src/server.js:17,32` | `existsSync(distPath)` runs synchronously on every unmatched request | Hoist to a constant at startup |
| `src/server.js:18` | Static assets ship with no cache headers although Vite fingerprints filenames | `immutable, max-age=31536000` for `/assets/*`, `no-cache` for `index.html` |
| `app/src/i18n.jsx:100` | The context value object is recreated on every render, re-rendering all consumers | `useMemo` the provider value |
| `app/src/i18n.jsx:67` | The default context value omits `display`, so a consumer mounted outside the provider throws | Include a passthrough `display` in the default |
| `app/src/hooks/useStops.js:5-7` | Module-level mutable cache shared across all consumers, with no `AbortController` for in-flight requests | The server already caches these for 5 minutes on the same origin; deleting the client cache removes a class of state bugs at negligible cost |
| `app/src/components/MapView/MapView.jsx:155` | A nested ternary computes the alternate-language name inline | Covered by the shared helper in P1-4 |
| `app/src/components/MapView/MapView.jsx:89` | `MapContainer center` applies only at mount, so a coordinate update will not move the map | Harmless today since coordinates are fetched once; note it if background location updates are ever added |
| `package.json:2` | Package name `oasa-arrivals` does not match the project name | Rename to `erhomai` |

---

## What not to change

These are correct and should survive any refactor:

- The haversine implementation in `src/geo.js`, including the decision to ignore OASA's
  undocumented `distance` field.
- The `OasaError` class and the way `src/server.js` maps it to a 502 with a user-facing Greek
  message while logging the upstream detail.
- Reading the upstream body as text and calling `JSON.parse` manually rather than trusting
  `response.json()`, given an API with no stable content type.
- The singleflight in `src/cache.js`, and the choice never to cache errors.
- The Greek comments in the backend. They explain why rather than what, which is the useful
  kind.

## Suggested commit sequence

1. P0-1 attribution (one file, no behaviour change elsewhere)
2. P1-1 language detection, P1-5 plurals, P1-6 distance unit (i18n only)
3. P2-1 tests for `geo.js` and `transliterate.js`, red at first
4. P1-7 transliteration fixes, turning those tests green
5. P1-2 and P1-3 polling behaviour
6. P1-4 and P1-8 display and resilience
7. P0-2 rate limiting and service-area bounds, P0-3 cache eviction, P2-2 validation
8. P2 cleanup, then P3 as convenient
