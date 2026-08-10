# StormLogic — Weather Concept App

A 10-day forecast site built on the [Open-Meteo](https://open-meteo.com/) API. No API key, no
account, no billing setup.

## What it shows

| Requirement | Source | Notes |
| --- | --- | --- |
| Current temperature | `current.temperature_2m` | Plus apparent temperature, humidity, pressure |
| Last 24h precip | hourly `precipitation` + `past_days=1` | Client sum of the 24 preceding-hour totals ending at now |
| 10-day forecast | `daily.*`, `forecast_days=11` | Starts at **tomorrow** — see below. Open-Meteo supports up to 16 |
| Clouds | `current.cloud_cover`, hourly `cloud_cover` | **Daily mean is computed client-side** — Open-Meteo has no daily cloud variable. Averaged over daylight hours only |
| Sunrise / sunset | `daily.sunrise`, `daily.sunset` | Plus `daylight_duration` and `sunshine_duration` |
| Rain | `rain_sum` + `showers_sum` | Split from total precipitation so rain and snow don't get conflated |
| Snow | `daily.snowfall_sum` | |
| Hail | WMO codes **96** and **99** only | See the caveat below |
| Wind | `wind_speed_10m_max`, `wind_gusts_10m_max`, `wind_direction_10m_dominant` | Rendered as a compass dial |
| Next 24 hours | hourly `temperature_2m`, `weather_code`, `precipitation_probability` | Scrollable strip with a temperature trend line |
| Radar | **RainViewer** (not Open-Meteo) | Separate tab; see below |
| Active alerts | **NWS** `/alerts/active` | Dedicated, lazy U.S.-coverage tab; see below |

Day/night for the hourly icons is derived from each date's sunrise/sunset rather than requesting
the hourly `is_day` field — one fewer variable that can invalidate the whole request, and the sun
times are already on hand.

### The list starts at tomorrow

`forecast_days` is **11, not 10**. The current-conditions card already carries today's high, low,
sun times, UV and rain chance, so a "Today" row in the list below duplicated it. `Forecast` drops
`days[0]` and the extra requested day keeps a full ten showing ahead.

`days[0]` is still fetched and still feeds the card — don't remove it from the request. `DayRow`
receives `index + 1` so day naming still reads from today, making the first row "Tomorrow".

### Daily conditions are derived, not reported

**Do not label a day with `daily.weather_code`.** Open-Meteo returns the most *severe* hourly code
of the day, not a representative one. One hour carrying code 51 brands a whole day "Drizzle" even
at 2% probability with zero accumulation — and the same aggregation makes days read "Overcast"
when their mean cloud cover is 45%.

`src/lib/daySummary.js` decides the label from the numbers instead. The weather code is used only
for the *type* of precipitation (rain vs snow vs thunder); whether to mention precipitation at all
comes from probability, accumulation and duration:

| Condition | Result |
| --- | --- |
| ≥40% probability **and** something forecast to fall | Named plainly — "Drizzle", "Heavy rain" |
| ≥20% (≥15% for snow) with corroboration | Hedged — "Chance of rain", "Isolated storms" |
| Otherwise | Described by daylight cloud cover — "Partly cloudy" |

Probability alone is never enough; `precipitation_sum > 0` or `precipitation_hours >= 1` has to
back it up, or a noisy 50% with nothing forecast to fall would still read as rain.

`scripts/summary-test.mjs` covers this — 12 cases including the original 2%-drizzle report.

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

In dev the browser calls Open-Meteo and NWS directly. In a production build the
same requests go through `/api/forecast` and `/api/alerts`, the Netlify functions
— see below.

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

## Alerts

Alerts stay out of Forecast entirely. Opening the lazy **Alerts** tab calls the
National Weather Service's active-alerts endpoint for the selected coordinates
and renders official watches, warnings, and advisories with their effective and
expiry times. It is intentionally U.S.-coverage only; outside that coverage the
tab says so plainly, and a temporary service failure never masquerades as “no
alerts.”

`netlify/functions/alerts.mjs` keeps the NWS response at the CDN for 30 seconds
(`s-maxage=30`, with one minute stale-while-revalidate). Coordinates are rounded
to two decimals, matching the forecast proxy's nearby-place cache buckets. The
NWS asks alert clients not to poll more often than every 30 seconds, so that
short cache is both the freshness boundary and a courtesy to the upstream
service.

## Licensing — read before shipping

Open-Meteo's free tier is **non-commercial**. Data is CC BY 4.0, so the attribution in the footer is
required, not decorative. If this becomes a commercial product, you need a paid Open-Meteo plan
(starts at 1M calls/month) — the code doesn't change, just the endpoint host and an API key.

## Structure

```
src/
  lib/
    forecastContract.js  Open-Meteo request shape (vars, days, units) — shared by browser + proxy
    api.js               fetch + reshape Open-Meteo's parallel arrays into per-day objects
    weatherCodes.js      WMO code table; the only place hail/snow/rain classification happens
    daySummary.js        derives each day's label from its numbers, not its weather code
    storage.js           localStorage wrapper; saved places, recents, last location, units
    radar.js             RainViewer frame index + tile URL construction
    format.js            units, compass points, local-time parsing
  components/
    LocationSearch    geocoding search + geolocation
    SavedPlaces       saved + recent location chips
    CurrentCard       big reading, badges, panels, stats
    CloudMeter        cloud cover ring
    WindDial          compass with needle + gusts
    SunArc            compact sunrise→sunset track with current position
    HourlyStrip       hourly columns + temperature trend (next-24 or a full day)
    RadarPanel        animated RainViewer radar (lazy-loaded)
    AlertsPanel       active NWS alerts (lazy-loaded, U.S. coverage)
    Forecast/DayRow   10-day list with expandable detail + that day's hourly strip
netlify/functions/
  forecast.mjs        cached upstream proxy (imports forecastContract — do not re-list vars here)
  alerts.mjs          short-lived cached NWS active-alerts proxy
scripts/
  summary-test.mjs            day-condition logic (pure, no browser)
  forecast-contract-test.mjs  captures real dev + proxy upstream URLs vs golden fields
  reverse-geocode-test.mjs    names a GPS fix; falls back to "My location" on failure
  alerts-proxy-test.mjs       NWS point/cache/coverage behaviour through the real handler
  smoke-test.mjs              renders the built app against a fixture
  contrast-check.mjs          WCAG audit of every sky theme
  persistence-test.mjs        saved locations, recents, restore-on-reload
  radar-test.mjs              radar frame logic + tab behaviour
```

### Upstream request contract

`src/lib/forecastContract.js` is the only place that lists Open-Meteo `current` /
`daily` / `hourly` variables and `forecast_days`. The browser (dev direct call)
and `netlify/functions/forecast.mjs` (prod proxy) both build from
`buildUpstreamForecastParams`. Coordinate precision still differs on purpose —
4 decimals in dev, 2 in the proxy so nearby visitors share a CDN cache entry —
but the field lists must never diverge.

`scripts/forecast-contract-test.mjs` asserts consumer behaviour, not module shape:
it builds the browser direct URL via `buildForecastUrl(..., { mode: 'direct' })`
and captures the URL the Netlify handler actually `fetch`es, then compares both
to the golden field lists.

### Reverse geocoding

Open-Meteo has no reverse endpoint (search + get-by-id only). After geolocation
succeeds, `currentPosition` calls BigDataCloud's keyless
`reverse-geocode-client` to name the fix. The GPS coordinates are kept — only
the display name/label change — so the place key still reflects the actual
position. The browser sends those coordinates and its request IP directly to
BigDataCloud; that disclosure appears beside the location control. The lookup
has a two-second deadline, so a slow or failed reverse service still loads the
weather under the generic "My location" label.

## Radar

Open-Meteo has no radar, so this is a second provider: **RainViewer**. Keyless like Open-Meteo,
global, 5-minute refresh, ~2 hours of past frames plus nowcast frames that run about half an hour
ahead. Attribution is required and the free tier is non-commercial — the same ceiling Open-Meteo
already imposes here.

It lives in its own **tab, not the main view**. Leaflet is ~42KB gzipped plus its CSS, and radar
tiles are heavy on mobile data, so `RadarPanel` is `React.lazy`-loaded and none of it is fetched
until the tab is opened. `radar-test.mjs` asserts that: zero tile requests while the Forecast tab
is showing.

Three things that will bite whoever touches this next:

1. **Tile size must match.** The size in the RainViewer path and Leaflet's `tileSize` have to
   agree. 512 additionally needs `zoomOffset: -1`. We use 256 and keep both tied to the
   `TILE_SIZE` constant in `radar.js`, with a regression test.
2. **Animate with opacity, not by adding and removing layers.** Every frame becomes a layer up
   front. Swapping layers per tick makes the loop flicker while the incoming frame's tiles are
   still downloading.
3. **`scrollWheelZoom` is off.** The page scrolls; a map that eats the wheel fights the user.

The basemap is CARTO `dark_matter`. Note it serves from `a.basemaps.cartocdn.com` and friends — a
glob route like `**/basemaps.cartocdn.com/**` will not match across the subdomain, which is why the
tests use regexes.

## Layout

Everything navigational — brand, tabs, search (with icon-only locate), units, refresh — sits on
**one header row**, with saved and recent locations on a single scrolling line below it. Locate is
icon-only (`◎`) so the search field stays elastic; the BigDataCloud privacy line expands on
hover/focus/locating rather than always claiming a row. This was previously
four stacked rows and pushed the weather itself off the top of a laptop screen. The search is the
only elastic item in the row; below 900px the wordmark drops, below 680px the search wraps to its
own line.

## Saved locations

Two separate lists, both in `localStorage`:

- **Saved** — explicit. Star the location in the card header to keep it; × removes it. Capped at 12.
- **Recent** — automatic. Anywhere you view lands here, newest first, capped at 6. Starring a
  recent promotes it to Saved; unstarring demotes it back rather than losing it.

They share one scrolling row rather than getting a labelled row each: saved chips lead and carry a
star, recents follow muted. They stay distinct in the data (`data-kind`), just not in vertical
space.

The last viewed location and your °F/°C choice are restored on reload. Places are keyed by
coordinates rounded to 3 decimals (~110m), so the same city reached by search and by geolocation
dedupes to one entry.

**First visit:** the default city paints immediately and the app asks for location in the
background, upgrading if permission is granted. Do not make the first render wait on
`getCurrentPosition` — an ignored permission prompt never rejects, so the user sits on a spinner
until the timeout expires. An `onboarded` flag keeps a declined prompt from being re-raised.

`storage.js` falls back to an in-memory store if `localStorage` throws at startup
(Safari private browsing, storage disabled by policy). The footer warns only in
that case (`isPersistent` is a startup probe). If a later write fails (quota or
revocation mid-session), that value is kept in memory for the rest of the session
but the footer will not flip to session-only mode.

### Checks

**Behavioural tests do not catch a deleted stylesheet.** A careless edit once removed the Tabs,
Radar and favourite-toggle CSS sections wholesale, and all 55 assertions still passed — the markup
was intact, so only the appearance broke. `smoke-test.mjs` and `radar-test.mjs` now assert a few
computed styles (tabs have a surface, the active tab is highlighted, the star sits beside the
location name rather than wrapping under it, the radar map has height). Add to those when you add
a new section.

The browser checks use the locked development dependencies. Install Chromium once
after installing packages (or set `CHROMIUM_PATH` to use a system-provided binary):

```bash
npm ci
npx playwright install chromium
npm test          # summary + contract + reverse + alerts + build + smoke + contrast + persistence + radar
```

`contrast-check.mjs` samples **rendered pixels**, not declared colours. Every surface here is
translucent, so text composites through two or three layers of glass before it reaches the sky
gradient — you cannot derive the effective contrast from computed styles. It screenshots each text
element twice, once with all glyphs set to `transparent`, and uses the second as the true
background.

This caught a real problem: the original palette put muted text at 48% white over a pale daytime
gradient, landing around **2.5:1** — well below the 4.5:1 AA floor. The fix was to tint the glass
dark rather than white, raise the muted ink alphas, and add a bottom vignette behind the footer
(the only text with no card behind it).

It caught a second one later. Night themes had kept a *white* glass tint on the theory that a dark
sky doesn't need darkening — but the night gradient still reaches `#2a3d61` at its base, and three
stacked translucent white layers lifted panel backgrounds to mid-slate, dropping accent-coloured
text to 3.1:1. **Glass is tinted dark on every theme, without exception.**

320 checks across 8 themes, including separate passes with the Radar and Alerts tabs open; every measured role meets AA.

One harness bug worth knowing: measuring injects `color: transparent` and removes it moments later,
so any element with a CSS colour *transition* gets read mid-animation at a fractional alpha and
reports a false ~1:1. The checker now disables transitions and animations for the whole run. Tabs
were the first elements here with a colour transition, and they surfaced it.

**If you change a colour token, re-run it.** The relationship between the tokens is not obvious by
eye — several combinations that look fine measure below AA.

### One gotcha worth knowing

With `timezone=auto`, Open-Meteo returns local wall-clock strings with **no offset**
(`2026-08-09T05:52`). Passing those to `new Date()` applies the *browser's* timezone, so a forecast
for Tokyo viewed from Chicago shows the wrong sunrise. `parseLocalIso()` in `format.js` reads the
string parts directly instead. Don't replace it with `new Date(iso)`.

## Selected-day hourly

The hourly series is already requested for daylight cloud averages. `api.js`
indexes every step by local calendar date and attaches `day.hours` (00–23) to
each day object. Expanding a forecast row renders that strip; the current card
still uses the separate rolling **next 24 hours** window from `data.hours`.

## Last 24h precipitation

`past_days=1` and hourly `precipitation` are on the shared forecast contract.
`sumPrecipLast24h` totals the 24 preceding-hour sums ending at the current hour
and the current card shows it as **Last 24h**. Because `past_days` also prepends
yesterday to `daily.time`, normalise drops any date before today so `days[0]`
stays the card/list anchor.

## Possible next steps

- Precipitation-type icons driven by `snow_depth` for winter accuracy
- Drag to reorder saved locations
