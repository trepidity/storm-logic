---
title: "Severe weather desk: storm, tornado, and hail tracking"
date: 2026-08-10
version: 1.3
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
- **Version**: 1.3
- **Status**: Draft (research / product inventory — not an implementation approval)
- **Owner**: Jared
- **Audience**: Very nerdy meteorologist users; StormLogic product posture
- **Related**: [`api-and-product-brainstorm.md`](./api-and-product-brainstorm.md) §3.2–§3.3, §5; Radar + Alerts in [`README.md`](../README.md)
- **Roadmap**: [`severe-desk-waved-roadmap.md`](./severe-desk-waved-roadmap.md) — dependency-ready Waves 0–G; no Wave is implementation approval.
- **Provider decisions**: [`severe-desk-provider-contracts.md`](./severe-desk-provider-contracts.md) v1.2 — **sources accepted 2026-08-10** (Wave 0 ratified); **contract fixtures pending, and they gate Waves C–D adapter work.**

> **v1.2 verification note.** Sections 5.1, 5.2, 5.6, 5.7, 5.8, 6 and 11 were
> re-checked against primary sources on 2026-08-10. Four inventory entries were
> **wrong or incomplete** and are corrected inline, each marked
> **`[corrected v1.2]`** with the evidence. The corrections are summarised in
> §1.1 and reasoned through in
> [`severe-desk-provider-contracts.md`](./severe-desk-provider-contracts.md) §3.
> Uncorrected sections were not re-verified and should be treated as v1.0
> research until they are.

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

### 1.1 Corrections in v1.2

Primary-source verification on 2026-08-10 changed four conclusions. The net
effect is that **the free surface is larger than v1.0 claimed**, and one licence
is **narrower** than v1.0 claimed.

| § | v1.0 said | Verified reality | Effect |
| --- | --- | --- | --- |
| 5.7 | MRMS reflectivity = “free data, ops cost — you tile it” | **NOAA already hosts and tiles it** as a time-enabled WMS/ImageServer — but it is **base** reflectivity, not composite **`[corrected again v1.3]`** | Public-domain reflectivity with no licence box; a sound **fallback**, but a *different product* from RainViewer's composite — see provider-contracts §3.1 |
| 5.1 | RainViewer = “non-commercial free tier” | **“Personal or educational use only”**, plus an explicit *no availability guarantee* | Narrower than recorded; fine for two private users, but it can never be the only reflectivity leg |
| 5.6 / 5.8 | Quality lightning = “mostly no” for free / “usually pay” | **GOES GLM L2 is free on public S3**, ~20 s files, 30–60 s latency | Lightning moves from **Paid** to **Free data, ops cost** — same class as MESH. Still blocked, but the question changed |
| 5.2 | Three SPC routes listed without preference | NOAA `SPC_wx_outlks` has **per-hazard probabilistic layers** and native **geoJSON** | Decisive winner for the SPC leg; first-party and more granular |

**`[v1.3]` One v1.2 correction was itself wrong and is corrected again above:**
the hosted NOAA service is **base** reflectivity, not composite. See §5.7.

**One conclusion was re-checked and survived unchanged:** there is **no free
hosted MESH service.** NOAA's raster catalogue was enumerated exhaustively —
it hosts `mrms_qpe` (precipitation) but no hail product anywhere. §7 stands and
the MESH delivery blocker is real. See provider-contracts §3.6.

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
| Reflectivity mosaic tiles | [RainViewer Weather Maps API](https://www.rainviewer.com/api/weather-maps-api.html) `weather-maps.json` + tile paths | **Free + license box** — **`[corrected v1.2]`** *"personal or educational use only"*, narrower than "non-commercial" | No (public) | Composite only. Attribution is **requested, not mandated**. RainViewer **explicitly disclaims availability**: *"we do not guarantee the availability of radar data… sometimes the owners just stop providing the images."* Keep, but never as the only reflectivity leg — see §5.7 |
| Active alerts + geometry | [NWS API](https://www.weather.gov/documentation/services-web-api) `/alerts/active` | **Free / open** | No | User-Agent required by NWS policy; rate limits apply |
| Forecast context, WMO hail codes | Open-Meteo Forecast | **Free + license box** (non-commercial free) | No | Not a hail tracker |

### 5.2 Official risk geometry and outlooks

| Need | Provider / API | Cost | Key? | Notes |
| --- | --- | --- | --- | --- |
| Active watches / warnings / advisories (point or area) | NWS `/alerts`, `/alerts/active` with `event`, `area`, `region`, status filters | **Free / open** | No | Expand beyond point-only for CONUS desk mode. Verified: User-Agent **required** (contact info recommended); rate limit is **not published** — *"allows a generous amount for typical use"*, clears *"typically within 5 seconds"*; *"free to use for any purpose"*, no fees |
| Watches / warnings / advisories as vector features | **`[new v1.2]`** NOAA [WWA/watch_warn_adv](https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/FeatureServer) — FeatureServer + MapServer | **Free / open** (US Gov public domain) | No | Layers `CurrentWarnings` (0), `WatchesWarnings` (1); **5-minute refresh**; `maxRecordCount` 4000. Good **fallback** for NWS API. **`[resolved v1.3]`** metadata advertises **JSON only**, but a live probe confirms **`f=geojson` works** — so no Esri-JSON conversion is needed. Undocumented behaviour, so pin it with a fixture |
| Storm-based warning polygons (archive + rich SBW) | [IEM SBW GeoJSON](https://mesonet.agron.iastate.edu/geojson/sbw.py?help) | **Free / open** (as-is research host) | No | Complements live NWS; good for time windows |
| SPC convective outlooks (Day 1–3 categorical / probs) | **`[corrected v1.2]`** NOAA MapServer [SPC_wx_outlks](https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer) is the **preferred** route; [SPC GIS](https://www.spc.noaa.gov/gis) and IEM [spcoutlook](https://mesonet.agron.iastate.edu/json/spcoutlook.py?help) are fallbacks | **Free / open** | No | NOAA service exposes **per-hazard** layers, not just categorical — Day 1: categorical `1`, prob. tornado `3`, prob. hail `5`, prob. wind `7`; Day 2: `9/11/13/15`; Day 3: `17/19`. Supported query formats: **JSON, geoJSON, PBF**. Carry **issuance time**, not fetch time |
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

**`[corrected v1.2]`** v1.0 concluded free lightning was "mostly no." That holds
for **ground-based** strike networks only. It is wrong as a blanket statement —
**GOES GLM is free, public domain, and near-real-time.**

| Need | Provider / API | Cost | Key? | Notes |
| --- | --- | --- | --- | --- |
| **Satellite total lightning (flash-level)** | **`[new v1.2]`** NOAA **GOES GLM** Level 2 via [NODD](https://www.noaa.gov/nodd/datasets) / [AWS Open Data](https://registry.opendata.aws/noaa-goes/) — public `noaa-goes19` S3 bucket | **Free data, ops cost** | No | Files ~every **20 s**, latency **~30–60 s**. US Gov public domain. **NetCDF4 — not browser-consumable**; needs decode → cluster → render. See caveat below |
| Dense CG/IC strike feed (precise geolocation) | Commercial lightning networks via Xweather, Tomorrow, etc. | **Paid** | Yes | What nerds expect next to cells; still the only *ground-based* option |
| Community network | **Blitzortung / LightningMaps** | **Rejected — terms conflict** | — | Free, but *"private and entertainment purposes"* only, raw data limited to network participants, and **explicitly prohibits use for storm warning systems.** Direct conflict with this product's purpose. Do not reconsider on price |
| RainViewer lightning | App ecosystem; **not** in public weather-maps reflectivity API inventory used today | Unclear / limited for free API | — | Do not assume free API access |

**The GLM caveat that must survive into any UI:** GLM is *satellite optical
total lightning*. It detects flashes, groups, and events by optical transient
from geostationary orbit. It is **not** the precisely-geolocated cloud-to-ground
stroke data a commercial network sells, and must never be labelled as such.
Different instrument, different question, different honest label.

**Net effect:** lightning moves from **Paid** to **Free data, ops cost** — the
same category as MESH. Phase 5 stays blocked (`D-SD-05`), but its foundation
question changes from *"which vendor"* to *"GLM self-process vs. vendor CG
network."*

### 5.7 Reflectivity alternatives (if RainViewer posture changes)

**`[corrected v1.2]`** v1.0 said MRMS reflectivity was "free data, ops cost —
you tile it." **NOAA already tiles it.** No pipeline required.

**`[corrected v1.3]`** v1.2 then called the hosted service *composite*
reflectivity. It is **base** reflectivity — the service self-describes as *"The
Radar Base Reflective Time Imagery Service."* v1.2 misread its coverage sentence
(*"all the composite Weather Service Doppler Radars"*), where "composite"
describes the **radar network being mosaicked**, not the product. This matters:
composite is column-maximum, base is the lowest usable tilt, so **an elevated
hail core visible in RainViewer's composite can be absent from the NOAA base
product.** The service is still an excellent public-domain fallback — it is just
not the same picture. See provider-contracts §3.1 and risk R-7.

| Need | Provider / API | Cost | Key? | Notes |
| --- | --- | --- | --- | --- |
| **MRMS QC *base* reflectivity, hosted** | **`[corrected v1.3]`** NOAA [radar_base_reflectivity_time](https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer) (ImageServer) | **Free / open** — US Gov public domain, **no ops cost** | No | Time-enabled **WMS 1.3.0** + WCS + REST export. **4-hour rolling window**, data refresh **5 min** (extent ~10 min), **564.77 m/px**, EPSG:3857, CONUS + AK + Caribbean + Guam + HI. Epoch-ms time param; omit for latest. **Past-time only — no nowcast frames.** ⚠️ **Base, not composite** — lowest usable tilt, not column max |
| MRMS **composite** from raw feeds | Same MRMS open feeds as MESH (`MergedReflectivityQCComposite`) | **Free data, ops cost** | No | **`[v1.3]`** The only route to a *like-for-like* composite fallback. NOAA hosts no composite service — needed for products NOAA does not host (MESH, and composite reflectivity) |
| Commercial radar tiles | Rainbow, Xweather, Tomorrow, OWM layers, etc. | **Paid** | Yes | SLA and multi-product bundles |

**Trade-off vs. RainViewer `[revised v1.3]`:** the NOAA service is public domain
and MRMS quality-controlled (564.77 m), but it differs on **two** axes, not one:

| | RainViewer | NOAA service |
|---|---|---|
| Product | **Composite** (column max) | **Base** (lowest usable tilt) |
| Time | past + short **nowcast** | past 4 h only, **no nowcast** |

v1.2 described only the second row and called the NOAA service "scientifically
better-conditioned"; that comparison is withdrawn, because the two are different
products rather than better and worse versions of one. Both differences are why
provider-contracts §6.1 keeps RainViewer canonical and makes NOAA the fallback
rather than swapping them outright — and why §10.3 requires a fallback to
disclose the **product** change, not just the source.

**Dead host warning:** `idpgis.ncep.noaa.gov` **was shut down 29 June 2023** and
migrated to `mapservices.weather.noaa.gov`. Most tutorials still cite the dead
host. Use only the live one above.

### 5.8 Cost summary matrix

| Desk capability | Realistic free path? | Primary free sources | When you pay |
| --- | --- | --- | --- |
| Official TOR/SVR polygons | **Yes** | NWS API (+ IEM SBW) | Never required |
| SPC outlooks / watches | **Yes** | SPC GIS, NOAA MapServer, IEM | Convenience APIs |
| Cell tracks / motion | **Yes (US)** | IEM NEXRAD attributes | Hosted storm-object APIs |
| Hail **reports** | **Yes (US)** | IEM LSR | Hosted stormreports |
| Hail **estimate (MESH)** | **Data yes; product hard** | MRMS open GRIB/S3 | Hosted MESH tiles/API — **verified: NOAA hosts no MESH service** |
| Velocity / dual-pol / TDS | **Data yes; product very hard** | NEXRAD L2/L3 open | Radar vendor tiles |
| Lightning — **satellite total** | **`[corrected v1.2]` Yes — data free, ops cost** | **GOES GLM L2 via NODD / AWS S3** | Only for convenience/tiles |
| Lightning — **ground-based CG geolocation** | **No** | — | Lightning network APIs |
| **Base** reflectivity loop (past) | **Yes — public domain** | **`[corrected v1.3]` NOAA MRMS *base* reflectivity WMS** | Never required |
| **Composite** loop, past or with nowcast | **Yes** | RainViewer (personal/educational) | Commercial radar CDN — **`[v1.3]`** or self-processing MRMS `MergedReflectivityQCComposite`; NOAA hosts no composite service |

**Bottom line on money `[updated v1.2]`:** a serious **US official + report +
cell-track** desk stays **$0 in API fees** — and after v1.2 verification, more of
it is US Government public domain than v1.0 assumed. Paid entry points shrink to
**two**: hosted MESH delivery, and *ground-based* lightning geolocation.
Everything else — warnings, watches, SPC outlooks (incl. probabilistic), LSRs,
storm attributes, QC'd **base** reflectivity, and satellite total lightning —
is free at the source. **Paid APIs buy reliability, tiles, ground-strike
precision, dual-pol convenience, and support — not exclusive ownership of
warnings or LSRs.**

---

## 6. IEM posture (important)

**`[corrected v1.2 — sourcing]`** IEM's disclaimer states verbatim: *"The
materials found on this website are in the public domain and may be used freely
by anyone for any lawful purpose,"* and *"we therefore provide this information
without any warranty of accuracy."* Public domain, no warranty — v1.0's
substance was right.

One sourcing correction: the "asks users not to abuse the hosts" language could
**not** be located on the disclaimer page during v1.2 verification. It may live
on individual service help pages. The cache-aggressively posture below stands on
its own merits regardless — an as-is academic host carrying no warranty deserves
it — but should not be attributed to a page that does not carry it.

For StormLogic:

- Cache aggressively (same spirit as `/api/forecast` and `/api/alerts`)
- Prefer regional/time-bounded queries over full CONUS spam
- Attribute IEM / NWS / SPC clearly
- Treat outages as first-class unavailable states
- Expect schema/help-page drift on ad-hoc GeoJSON services

**`[updated v1.2]`** v1.0 called IEM "the highest-leverage free bridge from
alert list to nerd desk." After verification that is **half true, and the half
that changed matters**. NOAA now covers warnings *(fallback)*, SPC outlooks
*(better than IEM's — per-hazard, geoJSON-native)*, and base reflectivity
*(fallback)*. IEM's irreplaceable contribution narrows to **two layers — LSR and
NEXRAD storm attributes — where no free substitute exists at all.**

That is a **better** posture, not a demotion: it drops IEM from five
single-point-of-failure layers to two, and puts a public-domain government leg
behind three of them. IEM remains essential and un-substitutable for reports and
cell tracking. See provider-contracts §6.3.

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
| **Minimum credible nerd desk** (multi-warning polygons + SPC outlook + LSR + cell attributes + reflectivity) | **Yes — free APIs/data.** **`[updated v1.3]`** And now largely **US Gov public domain**: NWS + NOAA MapServices cover warnings, SPC (incl. probabilistic), and QC'd **base** reflectivity; IEM covers LSR + attributes; RainViewer is needed for **nowcast frames and for composite** reflectivity, which NOAA does not host |
| **Hail estimation (MESH)** | **Data free**; product delivery is **build cost** or **paid host**. **`[verified v1.2]`** NOAA hosts **no** MESH service — checked exhaustively |
| **Dual-pol / velocity / TDS** | **Data free**; almost always **pay in engineering** or **vendor** |
| **Lightning — satellite total (GLM)** | **`[corrected v1.2]` Data free**, ops cost — same class as MESH |
| **Lightning — ground-based CG geolocation** | **Pay** |
| **Commercial SLA / global / one-invoice severe package** | **Pay** |

StormLogic can remain aligned with its **keyless, non-commercial, honest
multi-source** posture for a strong US severe desk **without buying an API key**,
if it accepts IEM/NWS operational reality and invests engineering in layers,
caching, and (for MESH) processing.

**`[updated v1.2]`** After verification, the paid frontier is **narrower and
sharper** than v1.0 described. Only two things genuinely require money:
**hosted MESH delivery**, and **ground-based lightning stroke geolocation**.
Both remain blocked behind their named decisions (`D-SD-04`, `D-SD-05`), and
neither blocks Phases 0–2. Everything the "minimum credible nerd desk" needs is
free at the source, and most of it is public domain with no licence box at all.

---

## 12. Document history

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-08-10 | Initial research write-up: tracking layers, build path, free vs paid API inventory |
| 1.1 | 2026-08-10 | Linked dependency-ready waved roadmap; implementation remains explicitly deferred |
| 1.3 | 2026-08-10 | **Correction to a v1.2 correction.** The hosted NOAA service is **base** reflectivity, not composite — v1.2 misread *"all the composite Weather Service Doppler Radars"* as a product name. Composite (column max) and base (lowest usable tilt) differ in a way that matters for elevated hail cores, so RainViewer→NOAA is a *product substitution*, not a like-for-like source swap. Also: MRMS `MergedReflectivityQCComposite` named as the only like-for-like composite route; **WWA geoJSON confirmed working** by live probe despite metadata advertising JSON only; `maxRecordCount` recorded. See provider-contracts v1.2 §3.1, §3.5, R-7 |
| 1.2 | 2026-08-10 | Primary-source verification of §5.1, §5.2, §5.6, §5.7, §5.8, §6, §11. Corrected: MRMS reflectivity is NOAA-hosted (not self-tiled); RainViewer is personal/educational-only; GOES GLM makes satellite lightning free; SPC has a first-party per-hazard geoJSON service. Added NOAA WWA as warning fallback; rejected Blitzortung on terms; flagged dead `idpgis` host. Re-verified and **confirmed** no free hosted MESH. Reasoning and provider decisions in `severe-desk-provider-contracts.md` |
