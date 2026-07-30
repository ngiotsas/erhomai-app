# Έρχομαι

Bus arrival times for the nearest OASA stop in Athens.

You open the site, it asks for your location, it finds the stops around you, and it tells you how many minutes until the next bus. That is the whole product.

**Status:** deployed to [erhomai.gr](https://erhomai.gr) on Cloudflare Pages with Workers Functions. React frontend with MapLibre GL JS map, list view, line/stop search, Greek/English i18n with transliteration.

## Why a backend exists at all

The OASA telematics API could in theory be called straight from the browser. It cannot, for three reasons:

1. **No HTTPS.** `telematics.oasa.gr` is served over plain HTTP by default (port 80 is firewalled). A browser on an HTTPS page blocks those requests as mixed content, and the site needs HTTPS anyway because the Geolocation API refuses to run without it. The API does respond on HTTPS (port 443), which this code uses.
2. **No CORS headers.** Even over HTTP, the browser would reject the response.
3. **A fragile upstream.** The OASA API goes down often and rate-limits aggressively. HTTP (port 80) is firewalled, so HTTPS (port 443) must be used.

So a backend sits in the middle. It proxies the calls, caches the answers so one busy stop does not generate hundreds of upstream requests, and hands the frontend clean JSON with real line names instead of internal route codes.

## Deploying

### Cloudflare Workers (recommended)

The site runs on Cloudflare Pages with Functions:

```
erhomai.gr → Cloudflare Pages (static assets + Functions)
├── app/dist/                  → React SPA (Vite build)
├── functions/                 → Pages Functions (API handlers)
│   ├── _lib/                  → Shared: geo, OASA client, caching, search index
│   └── api/                   → Route handlers: stops, arrivals, lines, search
└── wrangler.toml              → Cloudflare config + KV namespace
```

**Prerequisites:** Cloudflare account, `wrangler` CLI, API token with Pages + KV permissions.

```bash
git clone https://github.com/ngiotsas/erhomai-app.git erhomai
cd erhomai
cd app && npm install && cd ..

# Build frontend
npm --prefix app run build

# Create KV namespace (one-time)
wrangler kv namespace create "SEARCH_INDEX"

# Update wrangler.toml with the namespace ID, then deploy
wrangler pages deploy app/dist --project-name erhomai --branch main
```

**Custom domain:** add `erhomai.gr` via the Pages dashboard or API. Pages auto-provisions DNS + SSL for Cloudflare-managed domains.

### Node.js (alternative)

The original Express backend is preserved in `src/`. Deploy it behind a reverse proxy:

```bash
npm install
cd app && npm install && cd ..
npm run build:ui
TRUST_PROXY=1 PORT=3000 npm start
```

Caddy example:

```
erhomai.gr {
    reverse_proxy localhost:3000
}
```

## Development

### Workers (current default)

```bash
# Frontend dev server (Vite HMR on port 5173)
npm --prefix app run dev

# Functions are deployed to Cloudflare for testing:
wrangler pages deploy app/dist --project-name erhomai
```

### Node.js

```bash
# Backend (auto-restart on file changes)
npm run dev

# Both backend + frontend
npm run dev:ui
```

## Tests

```bash
npm test
```

## API

All endpoints return JSON. Greek/Latin character normalization is applied to line IDs — typing "X95" finds "Χ95", "B5" finds "Β5".

### `GET /api/stops`

Finds the stops nearest to a point.

| Parameter | Required | Description |
|---|---|---|
| `lat` | yes | Latitude, between -90 and 90 |
| `lng` | yes | Longitude, between -180 and 180 |
| `limit` | no | How many stops to return. Defaults to 5, capped at 20 |

```json
{
  "origin": { "lat": 37.9838, "lng": 23.7275 },
  "stops": [
    {
      "code": "400058",
      "name": "ΒΕΝΙΖΕΛΟΥ",
      "nameEn": "VENIZELOY",
      "street": "ΓΡ.ΛΑΜΠΡΑΚΗ",
      "streetEn": null,
      "lat": 37.9432677,
      "lng": 23.6520113,
      "distanceMeters": 143
    }
  ]
}
```

The server calculates `distanceMeters` itself with the haversine formula. OASA returns its own `distance` field, but the documentation never says what unit it uses, so this code ignores it.

### `GET /api/arrivals`

Lists the buses approaching a stop.

| Parameter | Required | Description |
|---|---|---|
| `stop` | yes | Stop code, digits only. Get it from `/api/stops` |

```json
{
  "stopCode": "400075",
  "fetchedAt": "2026-07-25T09:14:03.221Z",
  "arrivals": [
    {
      "lineId": "550",
      "lineName": "ΠΕΙΡΑΙΑΣ - Ν. ΣΜΥΡΝΗ (ΚΥΚΛΙΚΗ)",
      "lineNameEn": "PEIRAIAS - N. SMYRNI (CIRCULAR)",
      "direction": "ΠΕΙΡΑΙΑΣ - Ν. ΣΜΥΡΝΗ",
      "directionEn": "PEIRAIAS - N. SMYRNI",
      "minutes": 5,
      "vehicleCode": "50328"
    }
  ]
}
```

Behind one call, the server makes two upstream requests in parallel. `getStopArrivals` returns route codes and minutes, `webRoutesForStop` returns the mapping from route codes to line names (with English translations when available), and this endpoint joins them.

### `GET /api/lines`

Search all OASA bus lines.

| Parameter | Required | Description |
|---|---|---|
| `q` | no | Search term. Matches line ID, Greek name, or English name |

```json
[
  {
    "lineCode": "1025",
    "lineId": "X95",
    "lineName": "ΣΥΝΤΑΓΜΑ - ΑΕΡΟΛ. ΑΘΗΝΩΝ (EXPRESS)",
    "lineNameEn": "SYNTAGMA - AEROL. ATHINON (EXPRESS)"
  }
]
```

Searches are case-insensitive and normalize Greek ↔ Latin lookalike characters (X ↔ Χ, B ↔ Β, etc.).

### `GET /api/lines/:lineId/stops`

Returns all stops for a bus line, grouped by route direction.

```json
{
  "lineId": "X95",
  "lineName": "ΣΥΝΤΑΓΜΑ - ΑΕΡΟΛ. ΑΘΗΝΩΝ (EXPRESS)",
  "lineNameEn": "SYNTAGMA - AEROL. ATHINON (EXPRESS)",
  "routes": [{
    "routeCode": "2051",
    "routeName": "ΣΥΝΤΑΓΜΑ - ΑΕΡΟΛ. ΑΘΗΝΩΝ [EXPRESS]",
    "routeNameEn": "SYNTAGMA - AEROL. ATHINON [EXPRESS]",
    "stops": [{
      "code": "10361",
      "name": "ΣΥΝΤΑΓΜΑ",
      "nameEn": "SYNTAGMA",
      "lat": 37.974908,
      "lng": 23.7348845,
      "order": 1
    }]
  }]
}
```

### `GET /api/search-stops`

Search stops by name (Greek, English, or street).

| Parameter | Required | Description |
|---|---|---|
| `q` | yes | Search term, minimum 2 characters |

Returns up to 20 matching stops with their coordinates. The search index is built from all OASA routes and cached in KV for 12 hours.

### `GET /api/health`

```json
{ "status": "ok" }
```

### Errors

| Status | `error` | Meaning |
|---|---|---|
| 400 | `invalid_coordinates` | `lat` or `lng` missing or out of range |
| 400 | `outside_service_area` | Coordinates outside the Athens metropolitan area |
| 400 | `invalid_stop_code` | `stop` is not a number |
| 404 | `line_not_found` | The line ID does not exist in the OASA data |
| 404 | `not_found` | Unknown endpoint |
| 502 | `oasa_unavailable` | OASA timed out, refused the request, or returned malformed data |
| 500 | `internal_error` | A bug in this code |

## Layout

```
├── src/                         # Original Express backend (preserved)
│   ├── server.js                # Express setup, static file serving, error handling
│   ├── api.js                   # /api/stops, /api/arrivals, /api/lines, /api/search-stops
│   ├── oasaClient.js            # Calls to telematics.oasa.gr, response normalization
│   ├── cache.js                 # TTL cache with singleflight
│   ├── geo.js                   # Haversine distance and coordinate validation
│   └── searchIndex.js           # In-memory stop search index
│
├── functions/                   # Cloudflare Pages Functions (current backend)
│   ├── _lib/
│   │   ├── geo.js               # Haversine, coordinate validation
│   │   ├── oasaClient.js        # OASA API client (standard fetch)
│   │   ├── cache.js             # Two-layer: Cache API + in-memory singleflight
│   │   └── searchIndex.js       # KV-backed search index with lazy build
│   ├── api/
│   │   ├── _middleware.js       # Rate limiting + security headers
│   │   ├── stops.js             # GET /api/stops
│   │   ├── arrivals.js          # GET /api/arrivals
│   │   ├── lines.js             # GET /api/lines (with Greek/Latin normalization)
│   │   ├── search-stops.js      # GET /api/search-stops
│   │   ├── health.js            # GET /api/health
│   │   ├── _cron/rebuild-index.js  # Cron: rebuild search index
│   │   └── lines/[lineId]/stops.js  # GET /api/lines/:lineId/stops
│   └── sitemap.xml.js           # Dynamic sitemap with hreflang
│
├── app/                         # Frontend (React + Vite + MapLibre GL JS)
│   ├── index.html               # HTML shell with SEO: OG, Twitter, JSON-LD, hreflang
│   ├── vite.config.js           # Vite config, /api proxy to :3000
│   ├── public/
│   │   ├── _headers             # Cache rules for static assets
│   │   ├── _redirects           # www → apex 301 redirect
│   │   ├── robots.txt           # Allow /, disallow /api/, sitemap reference
│   │   └── assets/              # MapLibre worker files
│   └── src/
│       ├── main.jsx             # React entry point
│       ├── index.css            # CSS variables, reset, focus-visible, sr-only
│       ├── i18n.jsx             # Translations (el/en) + LangProvider context
│       ├── translations.js      # Translation strings (el/en)
│       ├── transliterate.js     # Greek→Latin transliteration
│       ├── mapStyle.js          # OpenFreeMap style with language-aware labels
│       ├── ErrorBoundary.jsx    # Error boundary with user-friendly fallback
│       ├── App.jsx              # Orchestration: geolocation → stops → arrivals
│       ├── App.module.css
│       ├── hooks/
│       │   ├── useGeolocation.js   # Browser Geolocation API
│       │   ├── useStops.js         # /api/stops with client-side cache
│       │   └── useArrivals.js      # /api/arrivals with 25s auto-poll
│       └── components/
│           ├── LocationGate/       # Location permission prompt + error states
│           ├── StopCard/           # Stop row with expandable arrivals
│           ├── ArrivalItem/        # Line badge + name + minutes
│           ├── MapView/            # MapLibre GL JS map with bus-stop pins + arrivals panel
│           ├── SearchView/         # Line search + stop name search
│           ├── StatusMessage/      # Loading/error/empty states
│           ├── Legal/              # Privacy policy
│           ├── AppShell/           # App layout shell
│           └── SecondsAgo/         # "X seconds ago" freshness indicator
│
├── wrangler.toml                # Cloudflare Pages configuration
├── package.json                 # Root: Express deps + dev scripts
├── todo.md
└── README.md
```

## Frontend

### Features

- **List view** — nearest stops with distance, expandable arrival times
- **Map view** — MapLibre GL JS map with bus-stop pin markers, tap for arrivals panel, re-centre button
- **Search** — Search bus lines by number (e.g., "X95", "021") or stop by name
- **Line stops** — View all stops along a bus line grouped by direction
- **View toggle** — Λίστα / Χάρτης / Αναζήτηση segmented button
- **Greek / English** — i18n with automatic browser language detection, `?lang=el` / `?lang=en` URL parameters, localStorage persistence. Stop names, line names, and directions use OASA's English translations when available, otherwise transliterate Greek to Latin.
- **Auto-refresh** — Arrivals poll every 25 seconds with a "X seconds ago" freshness indicator
- **Accessibility** — Semantic HTML (`<main>`, `<article>`, `<section>`), ARIA labels, keyboard navigation, `aria-live` regions, `focus-visible` outlines, 44px touch targets
- **Mobile-first responsive** — Dynamic viewport units (`dvh`), safe area padding, responsive map height
- **SEO** — Open Graph, Twitter Cards (`summary` + image), JSON-LD (`WebApplication` + `Organization` + `BreadcrumbList`), hreflang (`el`, `en`, `x-default`), canonical URL, dynamic sitemap.xml, noscript fallback, `_headers` for asset caching, `_redirects` for www→apex

## Caching

Two layers depending on deployment target:

**Workers:** Cloudflare Cache API (cross-isolate, CDN-level) + in-memory Map (singleflight within one isolate). Negative caching: OASA errors are cached for 5 seconds to prevent retry storms.

**Node.js:** In-memory Map with TTL, singleflight, and LRU eviction.

| Data | Lifetime | Reason |
|---|---|---|
| Arrivals | 25 seconds | Buses move, but nobody needs sub-minute precision |
| Routes per stop | 12 hours | Which lines serve a stop changes a few times a year |
| Nearest stops | 5 minutes | Keyed by coordinates rounded to four decimals, roughly 11 metres |
| All lines | 12 hours | The OASA line list changes very rarely |
| Search index | 12 hours | Stop name index, stored in KV on Workers |

Requests that miss the cache go through singleflight. Fifty users loading the same stop at the same moment produce one upstream call, not fifty.

## Known rough edges

**Parameter order in `getClosestStops`.** The upstream documentation calls the two parameters `x` and `y` without saying which is which. This code sends latitude as `p1`. If the stops come back from the wrong part of Athens, swap the two arguments in `fetchClosestStops`.

**Silent empty results.** When OASA returns an error object instead of an array, the client turns it into an empty list. Users see "no arrivals" rather than an error. The upstream API has no consistent error format to detect, so distinguishing the two cases reliably is not possible today.

**Attica-only.** `/api/stops` rejects coordinates outside the Athens metropolitan area (37.6–38.4°N, 23.3–24.2°E) with a dedicated message. If OASA ever adds service outside Attica, expand the bounding box in `src/geo.js`.

**English map tiles.** Map labels are rendered from OpenFreeMap vector tiles. Greek mode uses the `name` field; English mode uses `coalesce(name_en, name)` to show English names when available, with a Greek fallback.

**Greek line IDs in URLs.** Some OASA line IDs contain Greek characters (e.g., "Χ95", "Β5"). The frontend normalizes them to Latin before constructing API URLs. The lines search also normalizes Greek ↔ Latin for matching.

## Credit

Built on the community documentation of the OASA telematics API by Giannis Papaioannou: https://oasa-telematics-api.readthedocs.io/

This project has no affiliation with OASA.
