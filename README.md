# Έρχομαι

Bus arrival times for the nearest OASA stop in Athens.

You open the site, it asks for your location, it finds the stops around you, and it tells you how many minutes until the next bus. That is the whole product.

**Status:** backend + React frontend (list view + MapLibre GL JS map) are built and working. Greek/English i18n with transliteration.

## Why a backend exists at all

The OASA telematics API could in theory be called straight from the browser. It cannot, for three reasons:

1. **No HTTPS.** `telematics.oasa.gr` is served over plain HTTP by default (port 80 is firewalled). A browser on an HTTPS page blocks those requests as mixed content, and the site needs HTTPS anyway because the Geolocation API refuses to run without it. The API does respond on HTTPS (port 443), which this code uses.
2. **No CORS headers.** Even over HTTP, the browser would reject the response.
3. **A fragile upstream.** The OASA API goes down often and rate-limits aggressively. HTTP (port 80) is firewalled, so HTTPS (port 443) must be used.

So this server sits in the middle. It proxies the calls, caches the answers so one busy stop does not generate hundreds of upstream requests, and hands the frontend clean JSON with real line names instead of internal route codes.

## Requirements

- Node.js 20 or newer (developed and tested on 22)
- Network connectivity to `telematics.oasa.gr` over HTTPS (port 443)

## Install

```bash
git clone https://github.com/ngiotsas/erhomai-app.git erhomai
cd erhomai
npm install           # Backend (Express)
cd app && npm install # Frontend (React + Vite + MapLibre GL JS)
cd ..
```

## Run

### Development

Backend alone (auto-restart on file changes):

```bash
npm run dev
```

Frontend alone (Vite with HMR on port 5173, proxies /api to :3000):

```bash
npm --prefix app run dev
```

Both together:

```bash
npm run dev:ui
```

### Production

Build the frontend, then start the server:

```bash
npm run build:ui
npm start
```

The server listens on port 3000 and serves the built frontend from `app/dist/`. Override the port:

```bash
PORT=8080 npm start
```

When deploying behind a reverse proxy (Caddy, nginx), set `TRUST_PROXY` to the number of proxy hops so the rate limiter sees real client IPs:

```bash
TRUST_PROXY=1 npm start
```

## Tests

```bash
npm test
```

## Check that it works

```bash
curl "http://localhost:3000/health"
curl "http://localhost:3000/api/stops?lat=37.9838&lng=23.7275"
curl "http://localhost:3000/api/arrivals?stop=400075"
```

The first coordinates point at Syntagma Square, and stop 400075 is ΗΣΑΠ Ν. ΦΑΛΗΡΟΥ. If the second and third commands return `502 upstream_unavailable`, the OASA API is either down or temporarily unreachable.

## API

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

### Errors

| Status | `error` | Meaning |
|---|---|---|
| 400 | `invalid_coordinates` | `lat` or `lng` missing or out of range |
| 400 | `invalid_stop_code` | `stop` is not a number |
| 404 | `not_found` | Unknown endpoint |
| 502 | `upstream_unavailable` | OASA timed out, refused the request, or returned malformed data |
| 500 | `internal_error` | A bug in this code |

## Layout

```
├── src/                         # Backend (Express API)
│   ├── server.js                # Express setup, static file serving, error handling
│   ├── api.js                   # /api/stops and /api/arrivals endpoints
│   ├── oasaClient.js            # Calls to telematics.oasa.gr, response normalization
│   ├── cache.js                 # TTL cache with singleflight
│   └── geo.js                   # Haversine distance and coordinate validation
│
├── app/                         # Frontend (React + Vite + MapLibre GL JS)
│   ├── index.html               # HTML shell with SEO meta tags, OG, JSON-LD
│   ├── vite.config.js           # Vite config, /api proxy to :3000
│   ├── public/robots.txt
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
│           ├── StatusMessage/      # Loading/error/empty states
│           ├── Legal/              # Attribution / legal notice
│           ├── AppShell/           # App layout shell
│           └── SecondsAgo/         # "X seconds ago" freshness indicator
│
├── package.json                 # Root: backend deps + dev/ui/build scripts
├── todo.md                      # Pending: English map tile options
└── README.md
```

## Frontend

### Features

- **List view** — nearest 5 stops with distance, expandable arrival times
- **Map view** — MapLibre GL JS map with bus-stop pin markers, tap for arrivals panel, re-centre button
- **View toggle** — Λίστα / Χάρτης segmented button
- **Greek / English** — i18n with automatic browser language detection, localStorage persistence. Stop names, line names, and directions use OASA's English translations when available, otherwise transliterate Greek to Latin.
- **Auto-refresh** — Arrivals poll every 25 seconds with a "X seconds ago" freshness indicator
- **Accessibility** — Semantic HTML (`<main>`, `<article>`, `<section>`), ARIA labels, keyboard navigation, `aria-live` regions, `focus-visible` outlines, 44px touch targets
- **Mobile-first responsive** — Dynamic viewport units (`dvh`), safe area padding, responsive map height
- **Technical SEO** — Open Graph, Twitter Cards, JSON-LD structured data, canonical URL, robots.txt

## Caching

The cache lives in process memory. It disappears on restart, which is fine because everything in it is cheap to refetch.

| Data | Lifetime | Reason |
|---|---|---|
| Arrivals | 25 seconds | Buses move, but nobody needs sub-minute precision |
| Routes per stop | 12 hours | Which lines serve a stop changes a few times a year |
| Nearest stops | 5 minutes | Keyed by coordinates rounded to four decimals, roughly 11 metres |

Requests that miss the cache go through singleflight. Fifty users loading the same stop at the same moment produce one upstream call, not fifty.

If you later run more than one instance of this server, replace the in-memory map in `src/cache.js` with Redis. Nothing else needs to change.

## Deploying

Serve the app behind a reverse proxy that terminates TLS. Caddy handles this in two lines:

```
erhomai.gr {
    reverse_proxy localhost:3000
}
```

Start the server with `TRUST_PROXY=1` so the rate limiter sees real client IPs instead of the proxy's:

```bash
TRUST_PROXY=1 npm start
```

HTTPS is mandatory, not a nicety. Without a valid certificate the browser will never give you the user's location, and the site has nothing to show.

## Known rough edges

**Parameter order in `getClosestStops`.** The upstream documentation calls the two parameters `x` and `y` without saying which is which. This code sends latitude as `p1`. If the stops come back from the wrong part of Athens, swap the two arguments in `fetchClosestStops`.

**Silent empty results.** When OASA returns an error object instead of an array, the client turns it into an empty list. Users see "no arrivals" rather than an error. The upstream API has no consistent error format to detect, so distinguishing the two cases reliably is not possible today.

**Attica-only.** `/api/stops` rejects coordinates outside the Athens metropolitan area (37.6–38.4°N, 23.3–24.2°E) with a dedicated message. If OASA ever adds service outside Attica, expand the bounding box in `src/geo.js`.

**English map tiles.** Map labels are rendered from OpenFreeMap vector tiles. Greek mode uses the `name` field; English mode uses `coalesce(name_en, name)` to show English names when available, with a Greek fallback.

## Credit

Built on the community documentation of the OASA telematics API by Giannis Papaioannou: https://oasa-telematics-api.readthedocs.io/

This project has no affiliation with OASA.
