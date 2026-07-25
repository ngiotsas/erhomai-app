# TODO: English map tiles — RESOLVED

**Decision:** Option A (OpenFreeMap vector tiles) — implemented in commit (pending).

OpenFreeMap provides free OSM vector tiles with no API key, no registration, and no usage limits. It uses the OpenMapTiles schema which includes language-specific name fields (`name:en`, `name:el`).

## What changed

- Replaced `leaflet` + `react-leaflet` with `maplibre-gl` (direct MapLibre GL JS integration)
- Replaced CARTO Positron raster tiles (Greek) and ESRI raster tiles (English) with OpenFreeMap vector tiles using the Positron style
- Language switching changes the `text-field` expression in label layers: `name` for Greek, `coalesce(name_en, name)` for English
- Removed `@maplibre/maplibre-gl-leaflet` (CJS/ESM interop issues with rolldown bundler)

## Implementation details

- `app/src/positron.json` — base OpenFreeMap Positron style JSON
- `app/src/mapStyle.js` — `createStyle(lang)` transforms label expressions per language
- `app/src/components/MapView/MapView.jsx` — uses `Map`, `Marker`, `Popup`, `NavigationControl` from maplibre-gl directly
- MapLibre GL ~800KB added to bundle (expected for vector tile renderer)
- Attribution handled by MapLibre GL's built-in control (OpenMapTiles + OpenStreetMap)

## Licensing resolved

- No more ESRI tiles (was: anonymous access questionable, no API key)
- No more CARTO tiles (was: free with attribution at low volume, terms change over time)
- OpenFreeMap is MIT-licensed, OpenStreetMap data under ODbL
- Attribution is automatic via MapLibre GL control

## Tile alternatives considered

| Provider | English labels | Free | Works in browser |
|---|---|---|---|
| OpenFreeMap (chosen) | Yes (`name:en` + fallback) | Yes (donations) | Yes (vector tiles) |
| MapTiler | Yes | Free tier (100k/mo) | Yes |
| Stadia Maps | Yes | Free tier | Yes |
