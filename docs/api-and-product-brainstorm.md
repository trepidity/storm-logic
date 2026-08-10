---
title: "API inventory and product brainstorm"
date: 2026-08-10
version: 1.4
status: Draft
owner: Jared
category: research
tags:
  - open-meteo
  - nws-alerts
  - rainviewer
  - product-brainstorm
  - weather-apis
  - us-aqi
  - air-quality
  - nowcasting
---

# API inventory and product brainstorm

- **Date**: 2026-08-10
- **Version**: 1.4
- **Status**: Draft
- **Owner**: Jared

Brainstorm and decision log. Sections 1–9 remain exploratory context. **§10
Locked decisions** is binding product direction until superseded.

---

## 1. What we call today

| Provider | Endpoint / role | Keyless? | Caching | Used for |
| --- | --- | --- | --- | --- |
| **Open-Meteo Forecast** | `api.open-meteo.com/v1/forecast` | Yes (non-commercial free) | Netlify `/api/forecast` ~15 min CDN | Current conditions, 11-day daily, hourly (cloud, temp, weather code, precip probability + amount), `past_days=1` |
| **Open-Meteo Ensemble** | `ensemble-api.open-meteo.com/v1/ensemble` | Yes (non-commercial free) | Netlify `/api/confidence` 3h CDN | Tomorrow-only NCEP GEFS member spread (expanded Tomorrow row) |
| **Open-Meteo Geocoding** | `geocoding-api.open-meteo.com/v1/search` | Yes | Browser direct | City search |
| **BigDataCloud** | reverse-geocode-client | Yes | None (2s abort) | Name a GPS fix after geolocation |
| **RainViewer** | weather-maps.json + radar tiles | Yes (non-commercial) | Lazy Radar tab only | Animated radar + short nowcast |
| **NWS** | `api.weather.gov/alerts/active?point=` | Yes | Netlify `/api/alerts` 30s CDN | US watches, warnings, advisories |
| **CARTO** | dark basemap tiles | Yes | Via Leaflet | Radar basemap only |

### Open-Meteo request surface

One shared contract (`src/lib/forecastContract.js`) builds the upstream query
for both the browser (dev, direct) and the Netlify forecast proxy (prod):

- **Current** — temperature, humidity, apparent temp, day/night, precip components, weather code, cloud, pressure, wind
- **Daily** — highs/lows, sun times, UV, rain/showers/snow sums, precip hours/probability, wind max/gusts/direction
- **Hourly** — cloud cover, temperature, precip probability, precipitation amount, weather code
- **Window** — `forecast_days=11`, `past_days=1`, `timezone=auto`, unit presets

### Derived product logic (not raw API labels)

| Behavior | Where it lives |
| --- | --- |
| Honest day condition labels | `daySummary.js` (not max daily weather code) |
| Daylight-only cloud means | Client average of hourly cloud between sunrise/sunset |
| Rolling last-24h precip | Sum of 24 preceding-hour precip values ending at now |
| Hail badge | WMO codes 96 and 99 only (categorical, not measured) |
| Forecast list starts tomorrow | `days[0]` feeds the card; list is `days.slice(1)` |

### Runtime paths

| Environment | Forecast | Alerts | Geocode / reverse | Radar |
| --- | --- | --- | --- | --- |
| **Dev** | Browser → Open-Meteo | Browser → NWS | Browser direct | Browser → RainViewer |
| **Prod** | Browser → `/api/forecast` → Open-Meteo | Browser → `/api/alerts` → NWS | Browser direct | Browser → RainViewer |

This mix is already opinionated: **honest labels + multi-source depth (forecast +
radar + US alerts) without API keys.**

---

## 2. Product traits to protect

Any new idea should strengthen—not dilute—these:

1. **Trust over severity theater** — day labels from corroborating numbers, not the most severe hourly code.
2. **Thin chrome, dense weather** — one navigational header row; optional weight (radar, alerts, day hourly) loads when needed.
3. **Clear provider boundaries** — Forecast / Radar / Alerts as separate jobs, not one overloaded scroll.
4. **Free-tier realism** — CDN caching, coordinate bucketing, non-commercial license awareness, attribution.

Best new work either **extends honesty** or **adds a new dimension** without turning the app into a generic dashboard.

---

## 3. More power from APIs we already have

### 3.1 Open-Meteo (highest leverage, no new vendor)

| Idea | Why it is useful or unique | Notes |
| --- | --- | --- |
| **When does precip start / stop?** | Timeline for next onset and end from hourly precip + probability | Fits honesty better than another bare % badge |
| **Precip type timeline** | Hourly rain vs snow vs showers | Winter differentiator; daily already splits rain/showers/snow |
| **Dewpoint / “how muggy”** | Feels-like alone is weak; dewpoint is the readable humidity story | Small field add |
| **Visibility / fog narrative** | Codes plus optional visibility | Complements fog sky theme |
| **Convective ingredients** | Model fields for storm interest (e.g. CAPE-class variables where available) | Pair with NWS alerts: ingredients + official risk |
| **Snow depth** | Ground truth for “is there still snow?” | Better winter icons without a new provider |
| **Air quality** | Separate Open-Meteo Air Quality API | New tab or strip: AQI (+ pollen where available) |
| **Marine / waves** | Coastal places | Niche but strong for the right users |
| **Flood / water proxies** | Multi-day accumulation and rates | Extends last-24h thinking into “this event” |
| **Ensemble / uncertainty** | Open-Meteo ensemble API | Show confidence bands — anti-false-precision |
| **Historical context** | Historical or previous-runs APIs | “How unusual is this high?” / vs normal |
| **Model run / “as of”** | Generation or update time | Transparency; pairs with honesty |
| **Minutely / 15-min precip** | Where the model provides it | Short-term “will it rain on my walk?” |

### 3.2 RainViewer

| Idea | Why |
| --- | --- |
| Storm motion / track cue | Next 30–60 min intuition without a second mental model |
| Precip under pin vs metro | “Over you” vs “in the city” |
| Radar + alert geometry | NWS polygons on the same map |
| Jump map from an alert | Alerts tab → radar centered on the area |
| Lightning layer (if in index) | Storm intensity story |

### 3.3 NWS (US-only — already framed correctly)

| Idea | Why |
| --- | --- |
| Area Forecast Discussion (AFD) | Official “why” behind the forecast — rare in consumer apps |
| Gridpoint / points forecast | Official short-term wording next to Open-Meteo numbers |
| SPC convective outlook | Slight / Enhanced / etc. for severe season |
| WPC excessive rain / winter | Same pattern for flood and snow |
| NHC / tropical products | Seasonal Atlantic desk |
| Full alert polygons | GeoJSON on map, not only list cards |
| Impact one-liners | Careful plain-language distill with clear official attribution |

### 3.4 Geocoding and places

| Idea | Why |
| --- | --- |
| Weather on saved chips | Mini current temp per place (call cost tradeoff) |
| Home / Work roles | Product structure, not more API |
| Elevation / timezone in UI | Already present on forecast payload |
| Multi-point compare | Two places, side-by-side “leave now?” |

---

## 4. Ideas that would feel unique (StormLogic-shaped)

These favor decision quality and honesty over feature count.

### 4.1 Decision modes (“Should I…?”)

Not another chart — answers with evidence:

- **Commute window** — next ~2h precip probability + radar nowcast + wind
- **Outdoor event** — selected-day hourly + peak wind/gust + UV + storm chance
- **Travel day** — morning low, freezing signals, wind at destination

Mostly Open-Meteo hourly + existing radar.

### 4.2 Confidence and disagreement

Rare in free apps and on-brand:

- Ensemble spread on tomorrow’s high or precip
- “Models agree / disagree on rain”
- Open-Meteo vs NWS gridpoint when both available (US)

Positioning: *StormLogic does not pretend certainty.*

### 4.3 Event-centric precip (not only calendar-centric)

Started with last-24h total:

- Storm total so far (while raining)
- Storm total expected over the next N wet hours
- Dry-spell length / first dry hour

### 4.4 Explain this day

Selected day already has metrics and hourly. Add a short explanation **from numbers only** (no LLM required), e.g.:

> Mostly cloudy, small chance of rain after 4pm (20–30%), breezy NW 15–25, cool high near 58°.

Productized `daySummary` + hourly — strongly on-brand.

### 4.5 Alert intelligence without stealing authority

- Severity sort, end-time countdown, “new since last visit”
- Alert → radar + next 6h strip
- Dedupe nested / overlapping warnings (expired already suppressed)

### 4.6 Place memory that matters

- Starred places: last known condition + alert badge
- “Changed a lot since you looked” (Δ temp / new alert)

---

## 5. Gaps that need other providers

| Gap | Free / open-ish options | Paid / key |
| --- | --- | --- |
| Real hail probability / size | NWS alert text; otherwise limited | Tomorrow.io, Xweather |
| Lightning density | Some open datasets; RainViewer ecosystem | Specialized networks |
| Hyperlocal street-level | Hard on free tier | Commercial hyperlocal |
| Global alerts | Meteoalarm (EU), Environment Canada, etc. | Fragmented by region |
| Satellite / cloud tops | Various open tiles | Often a separate stack |
| Tides / marine charts | NOAA tides (US) | — |
| Webcams | Scattered | Reliability and privacy issues |
| High-quality pollen | Partial open coverage | Specialty APIs |

For StormLogic’s keyless, non-commercial posture, **Open-Meteo + NWS + RainViewer** remains the right core. Paid hail/lightning is a product-tier decision, not a free default.

---

## 6. Nice vs useful vs powerful

### Useful soon (mostly existing APIs)

1. Next precip start/stop + type timeline  
2. Event storm totals (extend last-24h thinking)  
3. Dewpoint / better humidity story  
4. Snow depth / winter fidelity  
5. Alerts ↔ radar deep link  
6. Air quality (Open-Meteo AQ) if a fourth dimension is wanted  

### Unique / differentiating

1. Ensemble uncertainty on high/low or precip  
2. Historical “vs normal” for today/tomorrow  
3. NWS Area Forecast Discussion as optional “meteorologist notes” (US)  
4. Decision modes with explicit evidence  
5. Model / “as of” transparency  

### Nice but lower leverage

- Drag-reorder saved places  
- Richer icon sets alone  
- Moon phase / low-signal clutter  
- Walls of every Open-Meteo variable  

### Constraints to keep in mind

| Constraint | Implication |
| --- | --- |
| **Call budget** | New *endpoints* (AQ, ensemble, historical) multiply traffic — keep CDN proxy patterns |
| **Tab sprawl** | Three tabs already; a fourth needs a clear job |
| **Authority** | Do not paraphrase NWS into liability-looking advice without clear official sourcing |
| **License** | Open-Meteo and RainViewer free tiers are non-commercial; attribution is required |

---

## 7. Strategic north stars

Choosing one makes feature sorting easier.

| North star | Lean into |
| --- | --- |
| **Honest forecast** | Ensemble, explanations, anti-false-precision, model time |
| **Nowcasting companion** | Radar + short-term precip, onset/end, storm totals, lightning |
| **US severe weather desk** | NWS + SPC + polygons + AFD + radar overlay |
| **Decision helper** | Commute/event modes, place compare, “changed since last visit” |
| **Climate-aware local** | vs normal, seasonal context, multi-day water totals |

**Today’s position:** honest forecast + light multi-source desk (radar + US alerts).

**Strongest next chapters** (either fits existing providers and feels less commodity than “add more stats”):

1. **Confidence / uncertainty**  
2. **Nowcast decision timing**  

---

## 8. Sticky-note shortlist

If only five ideas stay on the wall:

1. **Precip story arc** — last 24h (shipped) + next precip window + event total  
2. **Confidence** — ensemble band on tomorrow’s high or precip  
3. **US desk glue** — alert polygons on radar + jump-to-radar from Alerts  
4. **Explain the day** — prose from derived numbers for the expanded day  
5. **vs normal** — one historical comparison for “how unusual is this?”  

---

## 9. Related repo docs

- Product and architecture notes: [`README.md`](../README.md)
- Forecast request contract: `src/lib/forecastContract.js`
- Day label rules: `src/lib/daySummary.js`
- Forecast / alerts proxies: `netlify/functions/forecast.mjs`, `netlify/functions/alerts.mjs`

---

## 10. Locked decisions and near-term roadmap

Recorded 2026-08-10. These override vague brainstorm options where they conflict.

### 10.1 Air Quality — locked scale and scope

| Decision | Rule |
| --- | --- |
| **Scale** | **US AQI** (EPA bands) — not European AQI or other national indices |
| **Coverage** | **U.S. locations only** (CONUS, AK, HI, PR/USVI). Outside coverage: explicit message; **no upstream call** |
| **Label** | UI copy is exactly **`US AQI`** — not bare “AQI”, not “EPA AQI” as the primary label |
| **Surface** | Compact **US AQI** widget in the current-card stat row; no Air tab |
| **Initial scope** | Current US AQI value, category band, and compact **loading / unavailable / no-data / out-of-coverage** states |
| **Out of scope (v1)** | Pollen, multi-pollutant dashboard, non-U.S. AQI products, per-species charts |

Rationale: AQI now earns a single stat-sized place beside humidity, pressure,
UV, precip total, and rain chance. It remains U.S.-scoped, cached, and honest
about unavailable data without creating a second navigation job.

### 10.2 Ordered roadmap (execution sequence)

1. **24-hour precipitation integrity closeout** — **done**
   Complete lookback only; partial/gapped history → unavailable (`—`); full dry
   window → zero amount.

2. **Current-card US AQI widget** — **done**
   Current US AQI and category in the stat row, with compact loading and
   unavailable/no-data/U.S.-only states. No pollen or pollutant dashboard.

3. **Precipitation timing from the existing hourly forecast** — **done**
   Onset/end from next-24h hourly series on the current card.

4. **Event-centric precipitation** — **done**
   When both event boundaries are known, Forecast shows precipitation so far,
   expected remaining total, complete event total, and the first dry hour. An
   event that reaches beyond retained history or the forecast horizon shows no
   partial aggregate.

5. **U.S. severe-weather desk connection** — **done**
   Alert cards open the lazy Radar view. Official active NWS Polygon and
   MultiPolygon geometry is displayed exactly when supplied; otherwise Radar
   explicitly stays centered on the selected place without inventing a shape.

6. **Forecast confidence** — **done**
   Tomorrow's expanded row lazily loads the NCEP GEFS member ensemble through
   `/api/confidence` and reports its middle-80% range for daily high and rain
   total. Missing/gapped member data is shown as unavailable; no subjective
   confidence threshold is invented.

7. **Explain this day** — **done**
   Expanded forecast days render a bounded sentence derived only from existing
   normalized day and hourly values—no generated prose or new provider.

8. **Decision helpers** — **decision pending**
   Choose the first flow (commute or outdoor event), decision horizon,
   thresholds, evidence presentation, and surface before implementation.

### 10.3 Explicitly deferred (still valid later, not next)

- Decision helpers, vs-normal historical, NWS AFD,
  drag-reorder places, and richer icons — see §6–§8. Confidence and decision
  helpers remain pending their explicit product decisions.

---

## Document history

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-08-10 | Initial brainstorm from live API inventory and product discussion |
| 1.1 | 2026-08-10 | Locked US AQI rules + ordered roadmap (precip integrity → Air tab → precip timing) |
| 1.2 | 2026-08-10 | Air coverage locked to U.S. only (not global US AQI display) |
| 1.3 | 2026-08-10 | Phase 6 locked and delivered: lazy Tomorrow NCEP GEFS middle-80% spread |
| 1.4 | 2026-08-10 | US AQI moved from a dedicated tab into the current-card stat row |
