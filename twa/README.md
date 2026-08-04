# Έρχομαι — Android app (Trusted Web Activity)

`erhomai.gr` is a fully installable PWA (manifest + icons + service worker). This
directory holds the **Trusted Web Activity (TWA)** configuration that wraps the
site in a real Android app you can ship to the Play Store.

Prerequisites the site already meets:

- HTTPS with a valid certificate
- `site.webmanifest` with `display: standalone`, a `start_url`, and PNG icons
  (192, 512, maskable 512)
- Service worker at `/sw.js`
- Manifest served with `Access-Control-Allow-Origin: *` (see `app/public/_headers`)

## Option A — PWABuilder (no local Android SDK, recommended)

1. Go to https://www.pwabuilder.com and enter `https://erhomai.gr`.
2. Under "Android", click **Package for store**. PWABuilder validates the PWA
   and downloads a TWA project (zip) based on `twa-manifest.json`.
3. Unzip it and open in Android Studio.
4. Generate a signing key (Build → Generate Signed Bundle/APK → create new key)
   and build an **AAB** (App Bundle) for Play Store upload.
5. Publish the SHA-256 fingerprint from the signing key as a **Digital Asset
   Link** (below).

## Option B — Bubblewrap (local build, needs JDK + Android SDK)

```sh
npm i -g @bubblewrap/cli
bubblewrap init --manifest=./twa-manifest.json
bubblewrap build
```

Requires JDK 11+ and the Android SDK (`ANDROID_HOME`). Produces `app-release.aab`.

## Digital Asset Link (required)

TWA shows the site without the browser URL bar only when the site verifies the
app's signing key. After generating your signing key, add a file at
`/.well-known/assetlinks.json` on `erhomai.gr` containing:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "gr.erhomai.app",
      "sha256_cert_fingerprints": ["<YOUR_SIGNING_KEY_SHA256>"]
    }
  }
]
```

Then deploy it (this repo serves static files from `app/public/`, so put it at
`app/public/.well-known/assetlinks.json`) and verify with
https://developers.google.com/digital-asset-links/tools/generator.

## Notes

- The site's SPA is at `https://erhomai.gr/`; the TWA simply loads it, so app
  updates are pushed by deploying the web app — no store update required.
- Offline: the service worker caches the app shell, so the TWA opens offline
  (arrivals still require a network connection).
