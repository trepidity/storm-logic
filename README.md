# StormLogic — Weather Concept App

A 10-day forecast site built on the [Open-Meteo](https://open-meteo.com/) API. No API key, no
account, no billing setup.

## What it shows

| Requirement | Source | Notes |
| --- | --- | --- |
| Current temperature | `current.temperature_2m` | Plus apparent temperature, humidity, pressure |
| 10-day forecast | `daily.*`, `forecast_days=10` | Open-Meteo supports up to 16 if you want more |
| Clouds | `current.cloud_cover`, hourly `cloud_cover` | **Daily mean is computed client-side** — Open-Meteo has no daily cloud variable |
| Sunrise / sunset | `daily.sunrise`, `daily.sunset` | Plus `daylight_duration` and `sunshine_duration` |
| Rain | `rain_sum` + `showers_sum` | Split from total precipitation so rain and snow don't get conflated |
| Snow | `daily.snowfall_sum` | |
| Hail | WMO codes **96** and **99** only | See the caveat below |
| Wind | `wind_speed_10m_max`, `wind_gusts_10m_max`, `wind_direction_10m_dominant` | Rendered as a compass dial |

### The hail caveat

Open-Meteo exposes no measured hail variable — not in the forecast API, not in the historical
archive. Hail appears **only** inside the WMO 4677 weather interpretation code, as:

- `96` — thunderstorm with slight hail
- `99` — thunderstorm with heavy hail

So the "Hail risk" badge is a categorical signal derived from the weather code, not an amount or a
probability. `src/lib/weatherCodes.js` is the single place that decision lives.

If you need real hail probability later, it takes a different provider — Tomorrow.io and
Xweather both expose hail-specific fields, and the NWS `/alerts` endpoint carries severe
thunderstorm warnings with hail size in the US.

## Running locally

```bash
npm install
npm run dev      # http://localhost:5173
```

In dev the browser calls `api.open-meteo.com` directly (their CORS headers allow it). In a
production build the same request goes through `/api/forecast`, the Netlify function — see below.

## Deploying to Netlify

```bash
npm i -g netlify-cli
netlify deploy --build --prod
```

Or connect the repo in the Netlify UI; `netlify.toml` already sets the build command (`npm run
build`), publish directory (`dist`), and Node version. There are no environment variables to
configure — Open-Meteo needs no key.

### Why there's a serverless function

`netlify/functions/forecast.mjs` proxies Open-Meteo and adds CDN caching:

```
Netlify-CDN-Cache-Control: public, s-maxage=900, stale-while-revalidate=3600
```

One upstream call then serves every visitor in a region for 15 minutes instead of one call per page
load. That matters because Open-Meteo's free tier is capped around 10k calls/day. Coordinates are
also rounded to 2 decimals (~1 km) so nearby visitors share a cache entry.

**Order matters in `netlify.toml`:** the `/api/*` redirect must come before the SPA catch-all, or
`/index.html` swallows the function route.

## Licensing — read before shipping

Open-Meteo's free tier is **non-commercial**. Data is CC BY 4.0, so the attribution in the footer is
required, not decorative. If this becomes a commercial product, you need a paid Open-Meteo plan
(starts at 1M calls/month) — the code doesn't change, just the endpoint host and an API key.

## Structure

```
src/
  lib/
    api.js            fetch + reshape Open-Meteo's parallel arrays into per-day objects
    weatherCodes.js   WMO code table; the only place hail/snow/rain classification happens
    format.js         units, compass points, local-time parsing
  components/
    LocationSearch    geocoding search, geolocation, pinned places
    CurrentCard       big reading, badges, panels, stats
    CloudMeter        cloud cover ring
    WindDial          compass with needle + gusts
    SunArc            sun position along a sunrise→sunset arc
    Forecast/DayRow   10-day list with expandable detail
netlify/functions/
  forecast.mjs        cached upstream proxy
scripts/
  smoke-test.mjs      renders the built app against a fixture
  contrast-check.mjs  WCAG audit of every sky theme
```

### Design checks

Both scripts are dev-only and deliberately not dependencies. To run them:

```bash
npm i -D playwright pngjs
npm run build
node scripts/smoke-test.mjs      # renders + asserts no console errors
node scripts/contrast-check.mjs  # 152 contrast checks across 8 sky themes
```

`contrast-check.mjs` samples **rendered pixels**, not declared colours. Every surface here is
translucent, so text composites through two or three layers of glass before it reaches the sky
gradient — you cannot derive the effective contrast from computed styles. It screenshots each text
element twice, once with all glyphs set to `transparent`, and uses the second as the true
background.

This caught a real problem: the original palette put muted text at 48% white over a pale daytime
gradient, landing around **2.5:1** — well below the 4.5:1 AA floor. The fix was to tint the glass
dark rather than white, raise the muted ink alphas, and add a bottom vignette behind the footer
(the only text with no card behind it). Worst case is now 4.94:1.

**If you change a colour token, re-run it.** The relationship between the tokens is not obvious by
eye — several combinations that look fine measure below AA.

### One gotcha worth knowing

With `timezone=auto`, Open-Meteo returns local wall-clock strings with **no offset**
(`2026-08-09T05:52`). Passing those to `new Date()` applies the *browser's* timezone, so a forecast
for Tokyo viewed from Chicago shows the wrong sunrise. `parseLocalIso()` in `format.js` reads the
string parts directly instead. Don't replace it with `new Date(iso)`.

## Possible next steps

- Hourly strip for the selected day (the hourly data is already being fetched for cloud cover)
- Radar overlay — RainViewer tiles are free and pair well with Leaflet
- NWS `/alerts/active` for US severe weather banners
- Persist pinned locations to `localStorage`
- Precipitation-type icons driven by `snow_depth` for winter accuracy
