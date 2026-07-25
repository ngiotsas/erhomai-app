# Έρχομαι

Bus arrival times for the nearest OASA stop in Athens.

You open the site, it asks for your location, it finds the stops around you, and it tells you how many minutes until the next bus. That is the whole product.

**Status:** the backend works. The React frontend with the map is not built yet.

## Why a backend exists at all

The OASA telematics API could in theory be called straight from the browser. It cannot, for three reasons:

1. **No HTTPS.** `telematics.oasa.gr` serves plain HTTP. A browser on an HTTPS page blocks those requests as mixed content, and the site needs HTTPS anyway because the Geolocation API refuses to run without it.
2. **No CORS headers.** Even over HTTP, the browser would reject the response.
3. **A fragile upstream.** The OASA API goes down often, rate-limits aggressively, and filters requests from IP addresses outside Greece.

So this server sits in the middle. It proxies the calls, caches the answers so one busy stop does not generate hundreds of upstream requests, and hands the frontend clean JSON with real line names instead of internal route codes.

## Requirements

- Node.js 20 or newer (developed and tested on 22)
- A network path to `telematics.oasa.gr`, which in practice means a Greek IP address or a VPN endpoint in Greece

## Install

```bash
git clone <your-repo-url> erhomai
cd erhomai
npm install
```

That pulls a single dependency, Express. Everything else comes from the Node standard library.

## Run

Development, with automatic restart on file changes:

```bash
npm run dev
```

Production:

```bash
npm start
```

The server listens on port 3000. Override it with the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## Check that it works

```bash
curl "http://localhost:3000/health"
curl "http://localhost:3000/api/stops?lat=37.9838&lng=23.7275"
curl "http://localhost:3000/api/arrivals?stop=400075"
```

The first coordinates point at Syntagma Square, and stop 400075 is ΗΣΑΠ Ν. ΦΑΛΗΡΟΥ. If the second and third commands return `502 upstream_unavailable`, the OASA API is either down or blocking your IP address.

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
      "direction": "ΠΕΙΡΑΙΑΣ - Ν. ΣΜΥΡΝΗ",
      "minutes": 5,
      "vehicleCode": "50328"
    }
  ]
}
```

Behind one call, the server makes two upstream requests in parallel. `getStopArrivals` returns route codes and minutes, `webRoutesForStop` returns the mapping from route codes to line names, and this endpoint joins them.

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
server.js            Express setup, health check, error handling
src/api.js           The two public endpoints and the caching policy
src/oasaClient.js    Calls to telematics.oasa.gr, plus response normalization
src/cache.js         TTL cache with singleflight
src/geo.js           Haversine distance and coordinate validation
```

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

HTTPS is mandatory, not a nicety. Without a valid certificate the browser will never give you the user's location, and the site has nothing to show.

## Known rough edges

**Parameter order in `getClosestStops`.** The upstream documentation calls the two parameters `x` and `y` without saying which is which. This code sends latitude as `p1`. If the stops come back from the wrong part of Athens, swap the two arguments in `fetchClosestStops`.

**Silent empty results.** When OASA returns an error object instead of an array, the client turns it into an empty list. Users see "no arrivals" rather than an error. The upstream API has no consistent error format to detect, so distinguishing the two cases reliably is not possible today.

**No rate limiting toward OASA.** Caching and singleflight cut the request volume a lot, but under real traffic you should add a concurrency limit in `src/oasaClient.js` before OASA starts refusing your IP address.

## Credit

Built on the community documentation of the OASA telematics API by Giannis Papaioannou: https://oasa-telematics-api.readthedocs.io/

This project has no affiliation with OASA.
