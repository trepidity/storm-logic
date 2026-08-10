---
title: "Severe weather desk: storm, tornado, and hail tracking"
date: 2026-08-10
version: 1.1
status: Draft
owner: Jared
category: research
tags:
  - severe-weather
  - radar
  - hail
  - tornado
  - nws
  - mrms
  - spc
  - rainviewer
---

# Severe weather desk: storm, tornado, and hail tracking

- **Date**: 2026-08-10
- **Version**: 1.0
- **Status**: Draft (research / product inventory — not an implementation approval)
- **Owner**: Jared
- **Audience**: Very nerdy meteorologist users; StormLogic product posture
- **Related**: [`api-and-product-brainstorm.md`](./api-and-product-brainstorm.md) §3.2–§3.3, §5; Radar + Alerts in [`README.md`](../README.md)
- **Roadmap**: [`severe-desk-waved-roadmap.md`](./severe-desk-waved-roadmap.md) — dependency-ready Waves 0–G; no Wave is implementation approval.

This document records what a credible **storm / tornado / hail tracking** surface needs, what StormLogic already has, which **APIs and data feeds** fill each gap, and whether each is **free** or **paid**.

---

## 1. Executive summary

| Question | Answer |
| --- | --- |
| Can we do real storm/tornado/hail tracking with **current** RainViewer + Open-Meteo + point NWS alerts? | **No.** That stack is a consumer reflectivity loop plus official warning polygons for a place. |
| Can a **nerd-grade US severe desk** be built largely **without paid APIs**? | **Yes for phases 1–2** (official geometry, SPC context, LSRs, cell attributes) via **NWS, SPC, IEM, MRMS open data**. |
| Where does money enter? | **Convenience** (hosted tiles, lightning networks, dual-pol packages) and **ops cost** of self-hosting MRMS/NEXRAD processing — not because the science data is secret. |
| What is **not** free/easy? | True dual-pol interrogation (velocity, CC/TDS), commercial lightning density, hyperlocal street-level hail, global severe desks. |

**Product rule:** never collapse official warnings, algorithm estimates, and spotter reports into one “storm score.” Nerds will reject that.

---

## 2. What StormLogic has today

| Capability | Source | Cost today | Enough for tracking? |
| --- | --- | --- | --- |
| Composite reflectivity loop (~2h past + short nowcast tiles) | **RainViewer** public weather-maps API | Free, **keyless**, **non-commercial** free tier; attribution required | Backdrop only |
| Active US alerts for selected point | **NWS** `/alerts/active?point=` via `/api/alerts` | Free, keyless, open US gov data | Official risk for place |
| Alert Polygon / MultiPolygon on Radar | NWS geometry in app | Free (same feed) | “Where is warned,” not track |
| Alert → Radar jump | App handoff | — | Desk glue |
| “Hail” badge | Open-Meteo WMO **96 / 99** only | Free (Open-Meteo non-commercial) | **Not** hail tracking — categorical model code |

**RainViewer public ceiling (as of this writing):** composite reflectivity tile pyramids + coverage mask. No velocity, no dual-pol, no MESH, no cell tracks, no hail swath product. Frame cadence is on the order of ~10 minutes for the public index (not NEXRAD volume time).

**Open-Meteo ceiling for hail:** no measured hail size or probability variable in the free forecast surface used here. Codes 96/99 are weather-interpretation categories only.

---

## 3. What “tracking” means (do not mix layers)

| Layer | Question answered | Source class | Must not be sold as |
| --- | --- | --- | --- |
| **Outlook / watch** | Synoptic risk today / next hours | SPC / NWS watch boxes | A storm on the ground |
| **Warning polygon (SBW)** | Official threat area *now* | NWS storm-based warnings | Exact tornado path |
| **Storm attributes / cell track** | Where radar algorithms think cells are and are going | NEXRAD Level III storm attributes | Confirmed tornado |
| **Local Storm Reports (LSR)** | What was *reported* (hail size, tornado, wind) | NWS LSR via IEM (or vendors) | Complete ground truth |
| **Radar-estimated hail (MESH, etc.)** | Algorithm max hail size estimate | MRMS | Measured hail on the ground |
| **Dual-pol debris (TDS)** | Possible lofted debris near a circulation | Single-site dual-pol | Confirmed tornado damage |
| **Surveyed tornado track** | After-the-fact damage path | NWS DAT / Storm Events | Live chase track |

Honest UI labels these separately, each with its own timestamp and source line.

---

## 4. Product shape (fits StormLogic traits)

Stay on-brand: **thin chrome, multi-source desk, no false precision, clear authority.**

### 4.1 Surface

Prefer **layer stack on the existing lazy Radar tab** (optional regional “desk mode” when severe is active), not a fourth generic dashboard tab.

Suggested z-order:

1. Basemap (CARTO dark — already)
2. Reflectivity (RainViewer now; later optional MRMS QC composite)
3. SPC Day 1 categorical / probabilistic underlay (optional toggle)
4. Watches and warning polygons (TOR / SVR / FF / others)
5. Storm attribute markers + motion vectors
6. LSR points (hail size, tornado, wind) with time fade
7. MESH contours or heat (hail estimate) — optional
8. Dual-pol / velocity — only if product graduates to single-site NEXRAD

### 4.2 Authority rules (non-negotiable)

1. **NWS polygon is law** — no “AI severity” that looks official.
2. **MESH = estimate**; **LSR = report**; **warning = official risk area**.
3. **No tornado path invented** from composite reflectivity motion alone unless it is a named algorithm product with a timestamp.
4. **US-only** for this desk (same posture as Alerts). Outside coverage: explicit message; no fake global severe.
5. **Fail closed** when geometry or product is missing — same pattern as ensemble confidence and outdoor-plan integrity.
6. **Do not rebrand Open-Meteo 96/99** as hail tracking.

### 4.3 Non-goals (unless product tier changes)

- Safety scores or medical advice from MESH/LSRs  
- Replacing NWS wording with generated impact advice  
- Global hail/tornado desk on free open data  
- Competing with RadarScope/GR-class interrogation on day one  
- Paid providers as the *default* path while the app stays keyless/non-commercial  

---

## 5. API and data inventory (free vs paid)

Cost legend:

| Label | Meaning |
| --- | --- |
| **Free / open** | No API key purchase required for lawful use; US gov open data or research host; still subject to rate limits, attribution, and terms |
| **Free + license box** | Free for non-commercial / personal / educational; commercial needs a paid plan |
| **Free data, ops cost** | Data is free to download; you pay compute, storage, tiling, and engineering |
| **Paid** | Commercial API key and subscription |

### 5.1 Already in StormLogic

| Need | Provider / API | Cost | Key? | Notes |
| --- | --- | --- | --- | --- |
| Reflectivity mosaic tiles | [RainViewer Weather Maps API](https://www.rainviewer.com/api/weather-maps-api.html) `weather-maps.json` + tile paths | **Free + license box** (non-commercial free tier) | No (public) | Composite only; attribution required |
| Active alerts + geometry | [NWS API](https://www.weather.gov/documentation/services-web-api) `/alerts/active` | **Free / open** | No | User-Agent required by NWS policy; rate limits apply |
| Forecast context, WMO hail codes | Open-Meteo Forecast | **Free + license box** (non-commercial free) | No | Not a hail tracker |

### 5.2 Official risk geometry and outlooks

| Need | Provider / API | Cost | Key? | Notes |
| --- | --- | --- | --- | --- |
| Active watches / warnings / advisories (point or area) | NWS `/alerts`, `/alerts/active` with `event`, `area`, `region`, status filters | **Free / open** | No | Expand beyond point-only for CONUS desk mode |
| Storm-based warning polygons (archive + rich SBW) | [IEM SBW GeoJSON](https://mesonet.agron.iastate.edu/geojson/sbw.py?help) | **Free / open** (as-is research host) | No | Complements live NWS; good for time windows |
| SPC convective outlooks (Day 1–3 categorical / probs) | [SPC GIS](https://www.spc.noaa.gov/gis); NOAA MapServer [SPC_wx_outlks](https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer); IEM [spcoutlook](https://mesonet.agron.iastate.edu/json/spcoutlook.py?help) | **Free / open** | No | Prefer geometry + issuance time over static GIFs alone |
| SPC watches | IEM [spcwatch](https://mesonet.agron.iastate.edu/json/spcwatch.py?help); SPC watch products | **Free / open** | No | Watch boxes for desk context |
| SPC mesoscale discussions | IEM [spcmcd](https://mesonet.agron.iastate.edu/json/spcmcd.py?help); SPC text | **Free / open** | No | Nerd-valued text + optional polygons |
| Impact-based warning tags | IEM [ibw_tags](https://mesonet.agron.iastate.edu/json/ibw_tags.py?help) | **Free / open** | No | “Destructive”, “considerable”, etc. when present |
| Outlooks packaged for apps | Xweather / other severe packages | **Paid** | Yes | Convenience, SLAs, multi-region |

### 5.3 Storm tracking (cells and motion)

| Need | Provider / API | Cost | Key? | Notes |
| --- | --- | --- | --- | --- |
| NEXRAD storm attributes (cell ID, motion, max Z, tops, algorithm flags) | [IEM NEXRAD storm attributes GeoJSON](https://mesonet.agron.iastate.edu/geojson/nexrad_attr.py?help); CGI bulk [nexrad_storm_attrs](https://mesonet.agron.iastate.edu/cgi-bin/request/gis/nexrad_storm_attrs.py?help) | **Free / open** (as-is) | No | Core of free “cell tracking” |
| Level III / Level II raw radar | NCEI archives; IEM Level II feeds; AWS NODD NEXRAD | **Free data, ops cost** | No for open buckets | You own decode + render |
| Storm tracks as a managed API | Xweather, Tomorrow.io, Weather Company severe, Baron, etc. | **Paid** | Yes | Hosted polygons, history, often lightning bundled |

### 5.4 Hail tracking

| Need | Provider / API | Cost | Key? | Notes |
| --- | --- | --- | --- | --- |
| Spotter / official **hail size reports** | [IEM LSR GeoJSON](https://mesonet.agron.iastate.edu/geojson/lsr.py?help); CGI [lsr](https://mesonet.agron.iastate.edu/cgi-bin/request/gis/lsr.py?help) | **Free / open** (as-is) | No | Best free ground-truth overlay; sparse and delayed |
| LSR via commercial API | Xweather `stormreports`, similar | **Paid** | Yes | SLA, history, unified schema |
| **MESH** (Maximum Estimated Size of Hail) | NOAA MRMS realtime [mrms.ncep.noaa.gov/data](https://mrms.ncep.noaa.gov/data/); AWS Open Data `noaa-mrms-pds` | **Free data, ops cost** | No | GRIB2 ~2 min / ~1 km CONUS; **not** browser tiles out of the box |
| MESH / severe layers as tiles or JSON | GribStream and similar MRMS hosts; severe packages from commercial vendors | **Paid** (hosting convenience) | Usually | Skip self-tiling |
| Dual-pol hail signatures (Z, ZDR, CC) | Single-site NEXRAD Level II dual-pol | **Free data, ops cost** or **Paid** tiles | — | Expert interrogation, not a badge |
| Model “hail risk” codes 96/99 | Open-Meteo (already) | **Free + license box** | No | Keep clearly separate from MESH/LSR |
| Probability of hail / hail size fields | Tomorrow.io, Xweather, Weather Company, etc. | **Paid** | Yes | Product-tier decision |

### 5.5 Tornado-specific

| Need | Provider / API | Cost | Key? | Notes |
| --- | --- | --- | --- | --- |
| Tornado **Warning** polygons | NWS alerts (event filter) + IEM SBW | **Free / open** | No | Live official area |
| Tornado / Severe **Watch** boxes | NWS + SPC/IEM watch feeds | **Free / open** | No | Prep context |
| Tornado **reports** (LSR) | IEM LSR (`TOR`, funnel, etc.) | **Free / open** | No | Report, not path |
| Debris signature (TDS) cue | Dual-pol CC + velocity couplet | **Free data, ops cost** or **Paid** | — | Advanced |
| Surveyed tracks (post-event) | NWS Damage Assessment Toolkit; NCEI Storm Events; FEMA/GIS layers | **Free / open** (various) | Often no | Archive / analysis mode, not live |
| Tropical storm tracks / cones | NHC products; commercial severe packages | Free gov products or **Paid** packages | — | Seasonal, different desk |

### 5.6 Lightning (supporting, not substitute)

| Need | Provider / API | Cost | Key? | Notes |
| --- | --- | --- | --- | --- |
| Dense CG/IC strike feed | Commercial lightning networks via Xweather, Tomorrow, etc. | **Paid** | Yes | What nerds expect next to cells |
| Sparse / research lightning | Various open datasets; coverage uneven | **Free / open** or research-only | Varies | Not a RadarScope substitute |
| RainViewer lightning | App ecosystem; **not** in public weather-maps reflectivity API inventory used today | Unclear / limited for free API | — | Do not assume free API access |

### 5.7 Reflectivity alternatives (if RainViewer posture changes)

| Need | Provider / API | Cost | Key? | Notes |
| --- | --- | --- | --- | --- |
| MRMS QC composite reflectivity | Same MRMS open feeds as MESH | **Free data, ops cost** | No | Better scientific mosaic; you tile it |
| Commercial radar tiles | Rainbow, Xweather, Tomorrow, OWM layers, etc. | **Paid** | Yes | SLA and multi-product bundles |

### 5.8 Cost summary matrix

| Desk capability | Realistic free path? | Primary free sources | When you pay |
| --- | --- | --- | --- |
| Official TOR/SVR polygons | **Yes** | NWS API (+ IEM SBW) | Never required |
| SPC outlooks / watches | **Yes** | SPC GIS, NOAA MapServer, IEM | Convenience APIs |
| Cell tracks / motion | **Yes (US)** | IEM NEXRAD attributes | Hosted storm-object APIs |
| Hail **reports** | **Yes (US)** | IEM LSR | Hosted stormreports |
| Hail **estimate (MESH)** | **Data yes; product hard** | MRMS open GRIB/S3 | Hosted MESH tiles/API |
| Velocity / dual-pol / TDS | **Data yes; product very hard** | NEXRAD L2/L3 open | Radar vendor tiles |
| Lightning density | **Mostly no** for quality | Fragmented open | Lightning network APIs |
| Composite loop only | **Yes** | RainViewer (non-commercial) | Commercial radar CDN |

**Bottom line on money:** a serious **US official + report + cell-track** desk can stay **$0 in API fees** if StormLogic accepts IEM “as-is,” NWS rate limits, self-caching, and engineering cost for MRMS later. **Paid APIs buy reliability, tiles, lightning, dual-pol convenience, and support — not exclusive ownership of warnings or LSRs.**

---

## 6. IEM posture (important)

Iowa Environmental Mesonet documents that services are free for lawful use **including commercial**, provided as-is, without warranty, and asks users not to abuse the hosts. That is **not** the same as a commercial SLA.

For StormLogic:

- Cache aggressively (same spirit as `/api/forecast` and `/api/alerts`)
- Prefer regional/time-bounded queries over full CONUS spam
- Attribute IEM / NWS / SPC clearly
- Treat outages as first-class unavailable states
- Expect schema/help-page drift on ad-hoc GeoJSON services

IEM is the highest-leverage **free** bridge from “alert list” to “nerd desk.”

---

## 7. MRMS / MESH posture (hail science)

**MESH** is the standard free scientific hail-size estimate nerds know: multi-radar vertical structure relative to freezing levels → maximum estimated hail size.

| Fact | Implication for StormLogic |
| --- | --- |
| Realtime MRMS is public (NCEP HTTP + AWS open data) | No data license fee for the science product |
| Format is GRIB2 (grids), not Leaflet-ready tiles | Need a worker: fetch → decode → contour or tile → CDN |
| ~2-minute updates, CONUS-focused | Fits severe season; still US desk |
| Algorithm estimate | UI must say “estimated max hail size,” never “hail falling here” |

**Self-host path:** free data + Netlify/other is usually the wrong place for GRIB processing — need a small always-on or scheduled pipeline (or a paid MRMS host).

**Paid path:** buy MESH (or “radar-derived hail”) as tiles/polygons from a vendor; keep labels honest.

---

## 8. Recommended build path

The phase ordering below is product context. The actionable dependency graph,
provider-decision gates, bounded work lanes, and closure evidence are in
[`severe-desk-waved-roadmap.md`](./severe-desk-waved-roadmap.md). No phase is
ordered for implementation until its named Wave receives explicit approval.

### Phase 0 — Honesty (no new provider)

- Clarify current hail badge: model weather-code signal only  
- Radar legend: composite reflectivity ≠ velocity ≠ hail  
- Document source lines for existing alert polygons  

**Cost:** free  

### Phase 1 — Official severe desk (free APIs)

- Multi-event polygon layers (Tornado Warning, Severe Thunderstorm Warning, Flash Flood Warning, watches)  
- Optional CONUS/regional alert query (not only selected-point)  
- SPC Day 1 outlook underlay + issuance time  
- Countdown, WFO, VTEC/event metadata for nerds  
- Still RainViewer for reflectivity  

**Cost:** **$0 API fees** (NWS + SPC/IEM); engineering + cache only  

### Phase 2 — Tracking people mean (free APIs)

- **LSR overlay** (hail inches, tornado, wind) from IEM  
- **Storm attribute** markers + motion vectors from IEM  
- Shared time scrubber across reflectivity + reports  
- Explicit “report vs estimate vs warning” legend  

**Cost:** **$0 API fees** if IEM-only; optional paid stormreports later  

### Phase 3 — Hail science (free data or paid tiles)

- MRMS **MESH** layer (self-tiled or vendor)  
- Dual legend: estimated size vs reported LSR size  
- Optional MESH swath / max-over-window  

**Cost:** **free data + ops**, or **paid** hosted MESH  

### Phase 4 — Interrogation mode (optional, expensive in engineering)

- Site picker for nearest NEXRAD  
- Reflectivity + storm-relative velocity + correlation coefficient  
- TDS cue only with dual-pol + careful copy  

**Cost:** free raw data + **high** eng, or **paid** dual-pol radar product  

### Phase 5 — Lightning (usually paid)

- Strike density / recent strikes next to cells  

**Cost:** typically **paid** for quality  

---

## 9. Suggested technical seams (when approved)

| Seam | Responsibility | Likely upstream |
| --- | --- | --- |
| Alert layers / filters | Event-type toggles, multi-polygon, CONUS mode | NWS (existing proxy extended) |
| `stormReports` client | Normalize LSR points (type, size, time, lat/lon) | IEM LSR GeoJSON (+ optional proxy) |
| `stormAttrs` client | Cell markers + motion vectors | IEM NEXRAD attributes |
| `spcOutlook` client | Day 1 categorical/prob geometry | SPC MapServer / IEM / SPC GIS |
| `mesh` path | Contours or tiles + cache + timestamp | MRMS open data or paid host |
| Radar layer registry | Toggle stack, z-order, per-layer clock, legends | App + `RadarPanel` |
| Proxies | Cache, User-Agent, coordinate bucketing, fail-closed | Netlify functions pattern |

**Forbidden without approval:** new paid default provider, safety scoring, LLM paraphrase of warnings, inventing tracks from RainViewer frames alone.

---

## 10. Decision guide

| If the goal is… | Do this | Pay? |
| --- | --- | --- |
| “See warnings on radar like a desk” | Phase 1 | No |
| “Track cells and plot hail reports” | Phase 1–2 | No (IEM) |
| “Show estimated hail size aloft” | Phase 3 MESH | Data free; tiles/ops maybe paid |
| “Interrogate couplets / debris” | Phase 4 | Eng-heavy free data or paid radar |
| “Lightning every flash” | Phase 5 | Usually yes |
| Stay keyless non-commercial forever | Cap at Phase 2 + careful Phase 3 self-host | Avoid commercial radar/lightning SKUs as defaults |

---

## 11. Explicit answer: free or pay?

| Stack | Free? |
| --- | --- |
| **Minimum credible nerd desk** (multi-warning polygons + SPC outlook + LSR + cell attributes + RainViewer) | **Yes — free APIs/data** (NWS, SPC, IEM, RainViewer non-commercial) |
| **Hail estimation (MESH)** | **Data free**; product delivery is **build cost** or **paid host** |
| **Dual-pol / velocity / TDS** | **Data free**; almost always **pay in engineering** or **vendor** |
| **Quality lightning** | **Usually pay** |
| **Commercial SLA / global / one-invoice severe package** | **Pay** |

StormLogic can remain aligned with its **keyless, non-commercial, honest multi-source** posture for a strong US severe desk **without buying an API key**, if it accepts IEM/NWS operational reality and invests engineering in layers, caching, and (for MESH) processing. Paying starts when we want hosted tiles, lightning, dual-pol convenience, or production SLAs.

---

## 12. Document history

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-08-10 | Initial research write-up: tracking layers, build path, free vs paid API inventory |
| 1.1 | 2026-08-10 | Linked dependency-ready waved roadmap; implementation remains explicitly deferred |
