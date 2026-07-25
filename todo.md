# TODO: English map tiles

## Problem

No free OSM raster tile server renders `name:en` labels and allows browser access:

| Provider | English labels | Free | Works in browser |
|---|---|---|---|
| `tile.openstreetmap.org` | No (local `name` tag) | Yes | Yes |
| `maps.wikimedia.org/osm-intl` | Yes (`name:en`) | Yes | **No** (403 for third-party sites) |
| CartoDB Positron | No | Yes | Yes |
| ESRI World Street Map | Uses proprietary data, not OSM | Yes | Yes |
| MapTiler | Yes | Free tier (100k/mo, needs API key) | Yes |
| Stadia Maps | Yes | Free tier (needs API key) | Yes |
| **OpenFreeMap** | Yes (OpenMapTiles schema, `name:en` fields) | Yes (no API key, no limits) | See below |

## Option A: OpenFreeMap vector tiles (recommended)

OpenFreeMap is an open-source project providing free OSM tiles with no API key, no registration, no usage limits. It uses the OpenMapTiles schema which includes language-specific name fields (`name:en`, `name:el`, `name:de`, etc.).

**How to switch languages with OpenFreeMap:**
1. Use vector tiles (`.pbf` format via MapLibre GL JS) instead of raster tiles
2. Use the `text-field` expression to select `name:en` or `name:el` based on language
3. Apply one of their open-source styles (Positron, Bright, Liberty, Dark, etc.)

**Dependencies to add:**
- `maplibre-gl` — renderer for vector tiles (Leaflet-compatible via `@maplibre/maplibre-gl-leaflet`)
- Or replace Leaflet entirely with MapLibre GL JS (more work but cleaner)

**Implementation steps:**
1. Install `maplibre-gl` and `@maplibre/maplibre-gl-leaflet`
2. Create a MapLibre style JSON that switches `{name_en}` / `{name}` based on language prop
3. Add vector tile layer using OpenFreeMap's endpoint: `https://tiles.openfreemap.org/planet/{z}/{x}/{y}.mvt`
4. Create a `VectorTileLayer` component in `MapView.jsx`
5. Keep Leaflet for markers, popups, and recenter button

**Pros:**
- True open-source, no API keys
- Clean rendering with multiple free styles
- Language switching is native (just change a style property)

**Cons:**
- Adds ~200KB `maplibre-gl` dependency
- More complex setup than raster tiles
- Need to configure style JSON for Greek look

## Option B: MapTiler free tier

Register at maptiler.com for a free API key (100,000 requests/month).

**Tile URL:** `https://api.maptiler.com/maps/openstreetmap/{z}/{x}/{y}.jpg?key=YOUR_KEY`

**Implementation:**
1. Get API key from maptiler.com
2. Add to `.env`: `VITE_MAPTILER_KEY=xxx`
3. Use in `TILES_EN` with `import.meta.env.VITE_MAPTILER_KEY`
4. Done — no other code changes needed

**Pros:** Dead simple, OSM style, works immediately
**Cons:** Requires API key, commercial dependency

## Option C: Keep current — OSM standard tiles for English

Use `tile.openstreetmap.org` for English mode. Labels stay Greek but the map is the recognizable OSM style. Already partially implemented.

**Pros:** Zero work, free forever
**Cons:** No visual difference in language for map labels

## Current state

- **Greek mode:** CartoDB Positron raster tiles (clean, light, Greek labels)
- **English mode:** Needs decision from above options
- **UI text:** Already translated via `i18n.jsx` + `transliterate.js` for OASA data

## Decision needed

Pick Option A, B, or C for English map tiles.
