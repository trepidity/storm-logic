---
title: "Severe desk provider contracts: verified sources, architecture, and path forward"
date: 2026-08-10
version: 1.3
status: Sources accepted; Wave 0 fixture closure complete
owner: Jared
category: adr
tags:
  - severe-weather
  - provider-selection
  - nws
  - mrms
  - spc
  - lightning
  - radar
  - caching
---

# Severe desk provider contracts

- **Date**: 2026-08-10
- **Version**: 1.3
- **Status**: **Sources accepted — Wave 0 ratified 2026-08-10; fixture closure
  complete 2026-08-11.** This document is the binding provider contract for Waves B–D. The
  **source, time, and load decisions below are locked**; they are not reopened by
  anything outstanding. `SC-SD-PROVIDER` is **decision-accepted, fixture-closed**:
  recorded contract fixtures (§10.4) are available before **source-adapter work
  in Waves C and D**. Wave B (`layerState.js` +
  registry) touches no provider payload and may be approved independently.
- **Owner**: Jared
- **Implements**: [`severe-desk-waved-roadmap.md`](./severe-desk-waved-roadmap.md) → T-SD-00 / `SC-SD-PROVIDER`
- **Resolves**: `D-SD-01`, `D-SD-02`, `D-SD-03` (ratified; request-model,
  LSR-clock, and count-policy gaps closed in v1.2 — see §6.4, §7.2, §8.2)
- **Leaves open**: `D-SD-04` (MESH delivery), `D-SD-05` (interrogation, lightning)
- **Related**: [`severe-desk-radar-hail-tornado.md`](./severe-desk-radar-hail-tornado.md) (research inventory, v1.3)
- **Ratification**: Interactive review 2026-08-10; all recommended options
  accepted, including RainViewer-canonical reflectivity with NOAA WMS fallback.

> **v1.2 amendment.** Post-ratification review found one **factual error** (the
> NOAA service is *base* reflectivity, not *composite* — §3.1), one **hole in the
> enforcement mechanism** (`authority` could not type a reflectivity layer —
> §10.2), and four **under-specifications** that would have stalled an adapter
> author (NWS request model §6.4, LSR clock §7.2, count/pagination policy §8.2,
> cache-TTL rationale §8.3). One recorded risk (**R-3**) was **closed by live
> probe**. No source choice changed.

> **v1.3 execution amendment.** Wave C ratifies the executable initial desk
> profile: one contiguous-state/District-of-Columbia `Place.admin1` mapping,
> a fixed Census-derived SPC envelope, and a 750 ms selected-place settle with
> no map-gesture refetch. Wave D records the IEM boundary actually captured:
> a six-hour global LSR window and a parameterless global attributes feed,
> each visibly restricted client-side after normalisation. Alaska, Hawaii,
> territories, foreign, and unknown places remain typed `not-configured` until
> their own geometry/coverage contract exists.

---

## 1. Why this document exists

The roadmap makes `FND-SD-PROVIDER-CONTRACTS` the foundation root: nothing in
Waves B–D is dispatchable until one canonical source and one fallback/no-data
rule exists per layer. The research inventory
(`severe-desk-radar-hail-tornado.md` §5) deliberately listed **alternatives**
and explicitly refused to choose — *"it does not authorize a coder to choose."*

This document does the choosing, and shows the work.

It exists as a separate file rather than as edits to the research doc because
the two have different jobs and different lifecycles. Research is a survey that
ages slowly. A provider contract is an operational commitment that must be
re-verified whenever an upstream host changes. Collapsing them would make it
impossible to tell which statements are *observed* and which are *committed to*.

---

## 2. Verification method

Every claim in §3 and §4 was checked against a primary source on **2026-08-10**,
not carried over from the research inventory and not answered from model memory.
Where a search result and a primary source disagreed, the primary source wins
and the disagreement is recorded.

**What "primary source" means here:** the provider's own documentation page, or
the live service metadata endpoint itself (an ArcGIS REST service description
is self-describing — it states its own cadence, extent, and supported formats).

**Explicitly not verified:** live response payloads under severe-weather load,
schema stability over time, and actual observed latency. Those are Wave 0
fixture work (§10.4), not documentation review. **This document is a contract
proposal backed by documentation review. It is not evidence that these services
behave correctly during a live severe event.**

---

## 3. Findings that change the research inventory

Six findings materially alter the picture the research doc painted. Four of them
*expand* the free surface; one *narrows* a licence assumption; one is a *verified
negative* that preserves an existing blocker.

### 3.1 MRMS reflectivity is already hosted and tiled — correction (**revised v1.2**)

Research doc §5.7 listed MRMS reflectivity as **"Free data, ops cost — you tile
it."** That is wrong. NOAA hosts it:

```
https://mapservices.weather.noaa.gov/eventdriven/rest/services/
  radar/radar_base_reflectivity_time/ImageServer
```

Service metadata states: sourced from MRMS; four-hour moving time window; data
refresh every 5 minutes with time extent updating roughly every 10 minutes;
564.77 m/px in EPSG:3857; CONUS, Alaska, Caribbean, Guam and Hawaii. It exposes
**WMS 1.3.0** (time-enabled), WCS, and ArcGIS REST export. Time is an
epoch-millisecond parameter; omitting it returns the most recent image.

#### It is BASE reflectivity, not COMPOSITE — v1.1 got this wrong

v1.1 called this service "MRMS **composite** reflectivity" and carried that
label into §6, the research doc, and the cost matrix. It is wrong. The service
self-describes as *"The Radar Base **Reflective** Time Imagery Service."* The
error came from misreading its coverage sentence — *"all the composite Weather
Service Doppler Radars (WSR 88-D)"* — where **"composite" modifies the radar
network being mosaicked, not the reflectivity product.**

This is not pedantry, and it is the exact class of mislabelling §5 criterion 5
forbids:

| | RainViewer (canonical) | NOAA service (fallback) |
|---|---|---|
| Product | **Composite** reflectivity | **Base** reflectivity (lowest usable tilt) |
| Pixel means | column maximum | returned power at the sampled tilt |
| Severe-desk consequence | elevated cores are visible | a **high-based core aloft can be absent entirely** |

**Why this matters, and it changes §6.1's reasoning:** the two legs are *not*
the same product. Failing over from RainViewer to NOAA does not merely change
the source line — **it changes what a pixel means.** A user reading an elevated
hail core in composite will not find it in base. So the fallback remains correct
and remains public domain, but it is a **product substitution**, and §10.3 now
requires it to be labelled as one rather than disclosed as a mere source swap.

The claim that the government service is "scientifically better-conditioned
than a consumer composite" is withdrawn — it compares unlike products. What
survives is narrower and still true: MRMS is quality-controlled and
public-domain, which is why it is a sound fallback.

### 3.2 RainViewer's licence is narrower than recorded — correction

Research doc §5.1 recorded RainViewer as **"Free + license box (non-commercial
free tier)."** RainViewer's own API page says something stricter: the API is
**"free for personal or educational use only."** Personal-or-educational is a
narrower grant than non-commercial.

It also carries a availability caveat the research doc does not: *"We do not
guarantee the availability of radar data… sometimes the owners just stop
providing the images."* Attribution is **requested**, not mandated
(*"We kindly ask you to mention the RainViewer API as a source"*).

**Why this matters:** for two private users this licence is satisfied, so this
is not a forced migration. But it means RainViewer can never be the *only*
reflectivity leg — the Wave 0 gate requires a fallback, and §3.1 now supplies
a public-domain one. It also means the roadmap's non-goal *"paid providers as
the default path while the app stays keyless/non-commercial"* is better served
by treating the government service as the durable leg.

### 3.3 Free lightning exists — GOES GLM. Category correction

Research doc §5.6 and §5.8 conclude quality lightning is **"Mostly no"** for
free and **"usually paid."** That is true for *ground-based* CG/IC strike
networks. It is not true for lightning as a whole.

GOES GLM (Geostationary Lightning Mapper) Level 2 data is pushed to the public
`noaa-goes19` S3 bucket through NOAA Open Data Dissemination. Files arrive on
roughly a 20-second cadence with typical latency of 30–60 seconds from
observation. No key, no fee, US Government public domain.

**The honest caveat, which must survive into any UI:** GLM is *satellite optical
total lightning* — it detects flashes, groups and events by optical transient,
producing cluster/flash-area products. It is **not** the ground-based,
precisely-geolocated CG/IC stroke data that a commercial network (Vaisala NLDN
and equivalents) sells, and it must never be labelled as such. It also ships
NetCDF4, which is not browser-consumable.

**Why this matters:** in the research doc's own cost taxonomy, GLM is
**"Free data, ops cost"** — the same category as MESH — not **"Paid."** This
reclassifies Wave G's foundation question from *"which vendor do we buy"* to
*"GLM self-process versus a vendor CG network,"* which is a cheaper and more
interesting decision. It does **not** unblock Wave G; `D-SD-05` still stands.

### 3.4 SPC outlooks are more granular, first-party, and geoJSON-native — expansion

Research doc §5.2 lists three possible SPC routes without distinguishing them.
The NOAA vector service is decisively the best of the three:

```
https://mapservices.weather.noaa.gov/vector/rest/services/
  outlooks/SPC_wx_outlks/MapServer
```

| Day | Categorical | Prob. tornado | Prob. hail | Prob. wind |
|---|---|---|---|---|
| 1 | layer 1 | layer 3 | layer 5 | layer 7 |
| 2 | layer 9 | layer 11 | layer 13 | layer 15 |
| 3 | layer 17 | layer 19 (combined severe) | — | — |

Supported query formats are **JSON, geoJSON, and PBF**, and the service reports
`Supports Query Data Elements: true`.

**Why this matters:** separate probabilistic tornado and hail layers is exactly
the granularity a weather-literate user wants, geoJSON output removes a format
shim, and being first-party NOAA removes a hop through a research host.

### 3.5 A second official-geometry source exists — expansion

```
https://mapservices.weather.noaa.gov/eventdriven/rest/services/
  WWA/watch_warn_adv/{FeatureServer|MapServer}
```

Two layers — `CurrentWarnings` (0) and `WatchesWarnings` (1) — refreshed every
5 minutes. `maxRecordCount` is 4000; `returnCountOnly=true` is supported.

**R-3 — probed and answered 2026-08-10.** v1.1 flagged that this service's
metadata lists `supportedQueryFormats: JSON` and does *not* advertise geoJSON the
way SPC explicitly does, and refused to assume. A live probe settles it:

```
GET .../WWA/watch_warn_adv/FeatureServer/0/query
      ?where=1=1&outFields=*&resultRecordCount=1&f=geojson
→ {"type":"FeatureCollection","features":[{"type":"Feature", … }],
   "exceededTransferLimit": …}
```

**`f=geojson` works.** The WWA fallback adapter does **not** need an
Esri-JSON→GeoJSON conversion step, and the cost estimate for that leg stands.

**But the caution was right, and it converts rather than disappears.** The
service *behaves* better than it *advertises*, and undocumented behaviour is not
contracted behaviour — NOAA can withdraw it without breaking its own published
metadata. So R-3 closes as a **blocker** and re-opens as a **standing
regression**: the WWA fixture must capture a `f=geojson` response so an adapter
break is caught by our own tests rather than in a live event. See §12, R-3.

Note also `exceededTransferLimit` in the payload — server-side truncation that is
distinct from our display caps, and which §8.2 now handles explicitly.

### 3.6 MESH has no free hosted service — verified negative, blocker survives

I enumerated NOAA's raster service catalogue rather than assuming. The `obs`
folder contains exactly four services:

- `obs/mrms_qpe` (ImageServer) — quantitative *precipitation* estimate
- `obs/NWM_Land_Analysis` (MapServer)
- `obs/rfc_qpe` (MapServer)
- `obs/usnic_ims_snow_ice_1km` (ImageServer)

**There is no MESH service, and no hail ImageServer anywhere in the catalogue.**
The `raster` root exposes `air_quality`, `climate`, `hazards`, `NDFD`, `obs`,
`precip`, `snow`, `Utilities` — none of which carries MESH.

**Why this matters:** it would have been convenient to assume that because NOAA
hosts reflectivity (§3.1) and QPE, it also hosts MESH. It does not. `D-SD-04`
survives intact: MESH remains *self-process GRIB2 or pay a host*. Recording
this as a checked negative prevents the question being reopened on a hunch.

### 3.7 Host and terms notes

**IEM is public domain.** Verbatim from its disclaimer: *"The materials found on
this website are in the public domain and may be used freely by anyone for any
lawful purpose,"* and *"we provide this information without any warranty of
accuracy."* Research doc §6's substance is right.

One sourcing correction: I could **not** locate the "asks users not to abuse the
hosts" language on the disclaimer page. It plausibly lives on individual service
help pages. §6's cache-aggressively posture remains correct on the merits — an
as-is academic host with no warranty deserves it regardless — but the doc should
not attribute a specific request to a page that does not carry it.

**`idpgis.ncep.noaa.gov` was shut down on 29 June 2023**, migrated to AWS as
`mapservices.weather.noaa.gov`. The research doc already cites the live host
correctly. This is recorded because most tutorials and Stack Overflow answers
still cite the dead one, and a future contributor will otherwise reintroduce it.

**NWS API rate limit.** NWS's own documentation states: *"The rate limit is not
public information, but allows a generous amount for typical use,"* and that an
exceeded limit clears *"typically within 5 seconds."* All information is
*"free to use for any purpose"* with *"no fees."* A User-Agent identifying the
application is **required**, and NWS recommends it carry contact information.

Two consequences for this repo:

1. `netlify/functions/alerts.mjs` carries the comment *"NWS asks clients not to
   poll its alert feed more often than every 30 seconds."* That 30-second figure
   is **not** in NWS's published documentation. It is a sound self-imposed
   cadence and should be kept — but relabelled as our convention, not upstream
   policy, so nobody later "discovers" it is unsourced and removes it.
2. The same file sends `User-Agent: 'StormLogic weather alert viewer'`, which
   identifies the app but carries no contact. NWS recommends contact detail.
   Worth correcting whenever that file is next legitimately in scope.

---

## 4. Evidence table

| # | Claim | Primary source | Confidence |
|---|---|---|---|
| 3.1 | MRMS reflectivity hosted, WMS 1.3.0, 4 h window, 5 min refresh, 564.77 m/px | `radar_base_reflectivity_time/ImageServer` service metadata | High — service self-describes |
| 3.1 | Service is **base**, not composite, reflectivity **`[v1.2 correction]`** | Same metadata, verbatim: *"The Radar Base Reflective Time Imagery Service"* | High — v1.1 misread "composite … Doppler Radars" as a product name |
| 3.2 | RainViewer is personal/educational only; availability not guaranteed | rainviewer.com/api.html | High — provider's own page |
| 3.3 | GLM L2 on public S3, ~20 s files, 30–60 s latency | NOAA NODD; AWS Registry of Open Data (`noaa-goes`); NESDIS GLM page | Medium-high — latency figures are secondary |
| 3.4 | SPC layer IDs; JSON/geoJSON/PBF query formats | `SPC_wx_outlks/MapServer` service metadata | High — service self-describes |
| 3.5 | WWA two layers, 5 min refresh, `maxRecordCount` 4000; geoJSON **not** advertised in metadata | `WWA/watch_warn_adv/FeatureServer` metadata | High — service self-describes |
| 3.5 | WWA nonetheless **serves `f=geojson`** — R-3 closed **`[v1.2]`** | Live query probe 2026-08-10 returning a valid `FeatureCollection` | High for behaviour; **undocumented**, so treated as uncontracted |
| 6.4 | NWS `region` is **marine-only** (`AL AT GL GM PA PI`); cannot express a land region **`[v1.2]`** | `api.weather.gov/alerts/active?region=CONUS` → HTTP 400 quoting the enum | High — API's own validation error |
| 8.2 | `/alerts/active` has **no `limit` and no pagination**; returns the complete filtered set **`[v1.2]`** | `api.weather.gov/openapi.json` parameter list; `limit` → *"not recognized"* | High — spec plus live rejection |
| 8.2 | ArcGIS layers support `returnCountOnly=true` and signal `exceededTransferLimit` **`[v1.2]`** | WWA query probe returning `{"count":40}` | High — observed |
| 3.6 | No MESH in NOAA hosted catalogue | Enumerated `raster/rest/services` and `.../obs` | High — exhaustive folder enumeration |
| 3.7 | IEM public domain, no warranty | mesonet.agron.iastate.edu/disclaimer.php | High — verbatim quote |
| 3.7 | NWS rate limit unpublished; UA required; no fees | weather.gov/documentation/services-web-api | High — verbatim quote |
| 3.7 | idpgis shut down 2023-06-29 | weather.gov/gis/WebServices migration notice | High |

---

## 5. Selection criteria — the reasoning (**ratified 2026-08-10**)

Choices below were made against these criteria, in this priority order. The
order is itself a decision, and it follows from the product's stated posture
(private, two users, keyless, honesty-first) rather than from generic
best-practice.

1. **Licence durability over convenience.** A public-domain US Government
   source outranks a free-tier commercial one even when the commercial one is
   easier, because a licence that can change is a dependency that can vanish.
   This is why §3.1 reorders the reflectivity decision.
2. **Authority proximity.** Prefer the agency that *authors* the product over a
   re-publisher. SPC outlooks from NOAA beat SPC outlooks from a mirror — fewer
   hops, fewer schema translations, fewer parties who can drift.
3. **Fallback existence is a gate, not a nice-to-have.** The Wave 0 closure
   gate demands one canonical source *and* one fallback rule per layer. A layer
   with no second source is not disqualified, but it must be explicitly recorded
   as single-sourced so the risk is visible rather than assumed away.
4. **Concentration risk is a real cost.** The prior de-facto plan routed five of
   five layers through one as-is academic host. That is a single point of
   failure with no warranty behind it. Spreading load is worth accepting a
   second adapter shape.
5. **Never trade honesty for coverage.** Where no free source exists at the
   required quality (ground-based lightning, MESH), the answer is a recorded
   blocker — not a lower-quality substitute wearing the same label.

---

## 6. Decision D-SD-01 — canonical sources (**ratified 2026-08-10**)

| Layer | Canonical | Fallback | Change vs. prior plan |
|---|---|---|---|
| Warning / watch geometry | NWS API `/alerts/active`, `area=` state codes (**see §6.4**) | NOAA `WWA/watch_warn_adv` (`f=geojson`) | **fallback is new** |
| SPC outlooks | NOAA `SPC_wx_outlks` MapServer (geoJSON, per-hazard layers) | IEM `json/spcoutlook.py` | **promoted over IEM** |
| Local Storm Reports | IEM `geojson/lsr.py` | *none — single-sourced* | unchanged |
| Storm attributes | IEM `geojson/nexrad_attr.py` | *none — single-sourced* | unchanged |
| Reflectivity — **composite** | RainViewer (retains nowcast frames) | NOAA `radar_base_reflectivity_time` WMS — **base, a different product (§3.1)** | **fallback is new** |

### 6.1 Why RainViewer stays canonical for reflectivity (**revised v1.2**)

**Ratified:** RainViewer canonical + NOAA WMS fallback. Unchanged by v1.2.

Criterion 1 (licence durability) argued for promoting the NOAA service to
canonical. Two things outweigh it:

1. **RainViewer carries short-term nowcast frames and the NOAA service does
   not** — the government service is a past-4-hour rolling window only.
   Demoting RainViewer would silently delete a capability the Radar surface
   already ships, and the roadmap's scope explicitly forbids quietly narrowing
   existing behaviour.
2. **`[v1.2]` RainViewer is composite; the NOAA service is base (§3.1).**
   Promoting NOAA to canonical would not just remove the nowcast — it would
   silently change the meaning of every pixel on the shipped Radar surface, and
   would *lose elevated cores* that the current composite shows. That is a
   downgrade in severe-weather utility, not merely a licence trade.

So: RainViewer stays canonical *because of the nowcast and the composite
product*, and the NOAA service is the fallback the Wave 0 gate requires. If
RainViewer's terms or availability change — and §3.2 records that they disclaim
availability — the fallback is already specified and already public domain.

**`[v1.2]` The fallback is a product substitution, not a source swap.** Because
base ≠ composite, failing over must change the *product label* the user sees, not
only the source line. §10.3 rule 2 is amended accordingly. A future amendment may
add MRMS `MergedReflectivityQCComposite` as a like-for-like leg if NOAA ever
hosts it; §3.6's enumeration found no such hosted service today.

The rejected alternative (NOAA canonical + labelled RainViewer nowcast-only
enhancement) remains available only via a future authority amendment; it is not
the active contract.

### 6.2 Why SPC moves from IEM to NOAA

Criterion 2 (authority proximity) plus three concrete gains: per-hazard
probabilistic layers instead of a categorical blob (§3.4), native geoJSON
removing a format shim, and one fewer party between SPC and the user. IEM's
`spcoutlook.py` remains an excellent fallback and stays named as one.

### 6.3 Why LSR and storm attributes stay on IEM, single-sourced

There is no free substitute. Nothing else publishes normalised Local Storm
Reports or NEXRAD Level III storm attributes as queryable GeoJSON without a
commercial key. This is recorded as accepted single-source risk, not solved —
per criterion 3, an unfilled fallback must be visible.

Consequence: **IEM drops from five layers to two.** It remains essential and
irreplaceable for those two, but a warning-geometry or SPC outage on the
research host no longer takes the official desk down with it.

### 6.4 The NWS regional request model (**new in v1.2**)

v1.1 named *"`area`, `region`, `event` filters"* — a list of options, not a
request model. §8.1 then chose a state/CWA-scale region cache key without ever
saying how a region becomes an NWS request. An adapter author could not proceed.
Closed here.

**Verified constraint that forces the answer:** `region` **cannot express a land
region.** `/alerts/active?region=CONUS` returns HTTP 400 with the enum
`["AL","AT","GL","GM","PA","PI"]` — Alaska, Atlantic, Great Lakes, Gulf of
Mexico, Pacific, Pacific Islands. These are **marine** regions, paired with
`region_type=marine`. Listing `region` as part of a CONUS land query model was a
dead parameter.

**Ratified request model — `area` only:**

| Element | Contract |
|---|---|
| Region unit | **One selected contiguous U.S. state or District of Columbia postal code.** This Wave-C desk profile deliberately excludes Alaska, Hawaii, and territories until their coverage/dateline contract is ratified. `zone` and `point` are out of scope. |
| Region → request | `GET /alerts/active?area={CODE}` — exactly one `area` code for this profile. |
| Region derivation | `Place.admin1` name (or postal abbreviation) maps through the embedded contiguous-state registry to its one postal code and fixed Census-derived envelope. No coordinate-to-state inference, border expansion, or viewport input is permitted. |
| `region` / `region_type` | **Not used.** Marine-only; a land desk must never send them. |
| `event` | Optional severe-event filter, applied server-side to cut payload. |
| Zones / points | **Not used** as the desk query. `point=` is the *existing* single-location Alerts panel behaviour and is out of scope here. |

**Wave-C region breadth:** one state code only. Multi-state/nearest-state
expansion is not an implementation option; it needs a later authority decision
and explicit request/extent disclosure.

**Fallback mapping.** NOAA WWA is not state-indexed, so the same region becomes a
bounding-box `geometry` query with `geometryType=esriGeometryEnvelope` and
`inSR=4326`. The two legs therefore have **non-identical extents** — state
boundaries versus a rectangle. That is acceptable (both are `warning` authority,
§10.3 rule 1) but the adapter must not present the fallback as an identical view;
the region-basis difference rides along with the source line.

---

## 7. Decision D-SD-02 — time contract (**ratified 2026-08-10**)

Every layer carries its **own** clock. The map's selected time is a *query*
against each layer independently, never a shared assumption. Verified upstream
cadences:

| Layer | Upstream cadence | Clock semantics |
|---|---|---|
| NWS alerts | event-driven | issued / effective / expires / ends |
| NOAA WWA | 5 min service refresh | issued + expires |
| SPC outlooks | issuance-driven | **issuance time**, not fetch time |
| NOAA reflectivity | 5 min data, ~10 min extent | observation time (epoch ms) |
| RainViewer | ~10 min public index | frame time; nowcast frames are *forecast*, flagged distinctly |
| IEM LSR | report-driven, sparse and delayed | **report time**, not receipt time |
| IEM storm attributes | per volume scan (~4–6 min) | scan / volume time |

### 7.1 Freshness state machine

Ratified, expressed as multiples of each layer's own declared cadence so one
rule covers every source:

| State | Condition | UI obligation |
|---|---|---|
| `fresh` | age ≤ 1× cadence | normal render |
| `aging` | 1× < age ≤ 3× cadence | render + visible age |
| `stale` | 3× < age ≤ 6× cadence | render + explicit stale marking |
| `unavailable` | age > 6× cadence, fetch failure, or malformed | **render labelled absence — never the last good data** |

This table governs **cadenced** layers. Event-driven layers (alerts, LSR) do not
have a cadence to take multiples of, and v1.1's one-line substitution rule was
not sufficient to implement them — see **§7.2**, which replaces it.

**Nearest-frame tolerance:** a layer may render at a selected map time only if
a sample exists within ±1× its cadence. Outside that, the layer is
`unavailable` **for that time** — it does not borrow the nearest sample and it
does not interpolate. This is the concrete mechanism behind the roadmap's
"no data invented outside each layer's valid window."

**The fail-closed rule, stated once:** `unavailable` renders a labelled absence.
Stale-plausible data is a worse failure than a visible hole, because a hole is
honest and stale data lies with a straight face.

### 7.2 Event-driven layers: feed clock vs. content clock (**new in v1.2**)

v1.1 said event-driven layers *"substitute their own valid window for cadence:
an alert is `fresh` while within `effective`–`expires`, and `unavailable`
outside it."* That defined alerts only, and it defined them wrongly. It is
unimplementable for LSR, which is the layer that most needed it: **a Local Storm
Report is a point-in-time historical fact with no validity window at all.** A
hail report from 40 minutes ago has not decayed — it is exactly as true as when
filed. Ageing it out through a 1×/3×/6× state machine would mark true
observations `stale` and eventually erase them.

The v1.1 rule also conflated two failures that must never be conflated: *we
could not reach the feed* and *the feed says nothing happened*.

**The resolution: every event-driven layer carries two independent clocks.**

| Clock | What it measures | What it governs |
|---|---|---|
| **Feed clock** | Time since our last *successful* fetch | The layer's `freshness` and `status` |
| **Content clock** | Each feature's own report / validity time | Which features render at the selected map time |

**Rule 1 — `freshness` is a property of the feed, never of the content.** Apply
the §7.1 state machine to *time since last successful fetch*, against a declared
**poll cadence**, not against the age of the newest report:

| Layer | Declared poll cadence | `fresh` / `aging` / `stale` / `unavailable` |
|---|---|---|
| IEM LSR | **60 s** (matches its §8.3 TTL) | ≤60 s / ≤180 s / ≤360 s / >360 s or fetch failure |
| NWS alerts | **30 s** (our self-imposed cadence, §3.7) | ≤30 s / ≤90 s / ≤180 s / >180 s or fetch failure |

A three-hour-old hail report in a freshly-fetched feed is `fresh`. That is
correct: the *feed* is current, and the report's own age is carried per-feature
and rendered per-feature.

**Rule 2 — content selection is a window query, not a freshness test.**

- **LSR:** render every report whose **report time** falls in the trailing
  window ending at the selected map time. Window = **6 h** (matches the §8.2
  cap). Reports outside it are simply not selected — this is not an
  `unavailable` condition.
- **Alerts:** render every alert whose `effective`–`expires` interval contains
  the selected map time. An alert that has expired is *not rendered*; the
  **layer** does not become `unavailable` because of it.

**Rule 3 — empty is `ready`, not `unavailable`. This is the load-bearing one.**

| Situation | Status | What the user sees |
|---|---|---|
| Feed reached, zero features in window | **`ready`**, `features: []` | *"No storm reports in the last 6 hours"* — a real, useful meteorological statement |
| Feed unreachable / malformed | **`unavailable`** | *"Storm reports unavailable"* — a statement about **us**, not the weather |

Collapsing these is the single most damaging bug this layer can have: it would
render a **calm-day** and a **broken-pipeline** identically, which is precisely
the "honest about unavailable data" posture the product is built on, inverted.
§10.4 already warns that *"the quiet day is the one that breaks naive code"*;
this rule is what makes that warning enforceable rather than advisory.

**Rule 4 — no nearest-frame borrowing.** §7.1's ±1× tolerance is a *cadenced*-
layer concept and does **not** apply to event-driven layers. There is no "nearest
LSR frame" to snap to; a window query either selects a report or it does not.

**Consequence for `LayerState` (§10.2):** the `ready` variant gains an `emptiness`
discriminator so an empty layer cannot be silently rendered as a failed one, and
`clock` carries `polledAt` alongside `observedAt`.

---

## 8. Decision D-SD-03 — extent, load, and cache (**ratified 2026-08-10**)

### 8.1 Extent

**Fixed-region, not viewport-following.** Queries key on a coarse region
(state/CWA-scale bounding box), recomputed only when the selected place/region
changes. Rationale: viewport-following queries generate one upstream request
per pan/zoom gesture, which is precisely the abuse pattern an as-is academic
host cannot absorb, and it makes the cache key unbounded.

Movement debounce: **750 ms** settle before a selected-place region is fetched.
Panning or zooming never re-evaluates the region.

**Wave-C executable profile.** The registry covers the 48 contiguous states and
the District of Columbia. For each selected `Place.admin1`, it embeds a stable
state-scale envelope derived from the [U.S. Census Bureau 2024 1:500,000
cartographic boundary file](https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html)
(`cb_2024_us_state_500k`), alongside the NWS postal code. This is a request
basis, not a claim that a rectangle equals a state boundary. It is selected on
Radar entry or place change after the 750 ms settle; map gesture changes make no
provider request. Alaska, Hawaii, all territories, and foreign/unknown places
are typed `not-configured` official layers with no NWS or SPC request. No
cross-border expansion is performed.

### 8.2 Caps

| Layer | Cap | Behaviour at cap |
|---|---|---|
| Warning geometry | 250 features | render cap + explicit "N more not shown" |
| SPC outlook | 1 day, selected hazard layers only | — |
| LSR | 500 points / 6 h window | oldest dropped, count disclosed |
| Storm attributes | 300 cells / scan | render cap + disclosure |

Caps are **disclosed, never silent.** A truncated layer that looks complete is
the same class of lie as stale data rendered as fresh.

#### Count and pagination policy (**new in v1.2**)

v1.1 mandated *"N more not shown"* without saying how `N` is obtained. `N`
requires a true total, and whether a true total is even knowable differs per
provider. Verified, then decided:

| Provider | Does the response carry the complete set? | Exact total available? |
|---|---|---|
| **NWS `/alerts/active`** | **Yes.** Verified: no `limit` parameter (`limit` → *"not recognized"*), no cursor, no pagination in the OpenAPI parameter list. The filtered set is returned whole. | **Yes, free** — count the features we received |
| **IEM GeoJSON** (`lsr.py`, `nexrad_attr.py`) | Yes — bounded by the request's own time/region arguments | **Yes, free** |
| **ArcGIS** (WWA, SPC) | **No.** Server-side `maxRecordCount` (4000 WWA / 2000 SPC) plus an `exceededTransferLimit` flag | **Yes, one extra request** — `returnCountOnly=true` (probed: `{"count":40}`) |

**Two distinct truncations, never merged.** They have different causes and
different honest copy:

1. **Display truncation (ours).** We received the whole set and chose to render
   less. Exact and always disclosable: *"250 shown, 68 more not shown."*
2. **Upstream truncation (theirs).** The provider capped the response before we
   saw it — ArcGIS `exceededTransferLimit: true`. We do **not** know the total
   from the payload alone, and must not imply we do.

**Ratified policy:**

- **NWS and IEM legs:** cap client-side against a complete set. Disclose an
  **exact** count. No extra request, no `250+` hedge — the information is already
  in hand.
- **ArcGIS legs:** if `exceededTransferLimit` is **absent**, the set is complete
  → exact disclosure as above. If **present**, issue **one** `returnCountOnly`
  request against the identical `where`/geometry to resolve the true total. That
  request is cheap (no geometry transferred) and shares the layer's cache key.
- **If the count request itself fails:** disclose **`"250+ shown, more not
  shown"`** — an explicit unknown. Never render an exact number we did not
  verify, and never fall back to the capped count as though it were the total.
- **We do not page.** Fetching past `maxRecordCount` to assemble a full set
  contradicts §8.1's whole load posture. The cap is a display decision; paging to
  render more than 250 polygons serves nobody.

This is what `truncated.exact` and `truncated.upstreamTruncated` encode in
§10.2.

### 8.3 Cache keys and TTLs

Following the existing proxy pattern in `netlify/functions/alerts.mjs` — CDN
`s-maxage` plus `stale-while-revalidate`, with coordinate bucketing so nearby
users coalesce.

| Layer | Cache key | `s-maxage` | `stale-while-revalidate` |
|---|---|---|---|
| Warnings | `region + event-filter` | 30 s | 60 s |
| SPC outlook | `day + hazard + region` | 300 s | 600 s |
| LSR | `window` | 60 s | 120 s |
| Storm attributes | singleton source | 120 s | 240 s |
| Reflectivity | tile/WMS-native | provider default | — |

**Wave-D executable profile.** The recorded IEM contracts establish a six-hour
`sts`/`ets` LSR window and a parameterless attributes source, but do **not**
establish a server-side region filter. The desk therefore makes no regional
claim about either upstream request: reports use `window`, attributes use a
singleton source key, and both marker sets are restricted to the visible map
only after normalisation in the browser. The source line says so explicitly.
Panning merely redraws that bounded client-side view; it never becomes an IEM
request. A future regional IEM query needs its own recorded request contract
before this profile can change.

**`[corrected v1.2]`** v1.1 justified these as *"roughly half the upstream
cadence."* That rationale is true for two rows and false for two, so it is
restated per class rather than asserted globally:

| Layer | TTL basis | Holds? |
|---|---|---|
| Storm attributes (120 s) | ~half the ~4–6 min volume scan | ✅ half-cadence |
| LSR (60 s) | our declared poll cadence (§7.2), not an upstream cadence | ⚠️ *poll-rate*, not half-cadence |
| Warnings (30 s) | our self-imposed NWS cadence (§3.7) — the source is event-driven and **has no cadence to halve** | ❌ half-cadence rationale does not apply |
| SPC outlook (300 s) | issuance is **hours** apart; 300 s is nowhere near half. Chosen so a *new issuance* surfaces within ~5 min | ❌ deliberately far tighter than half-cadence |

The TTL **values** are unchanged and remain correct. Only the stated reason
changes: cadenced layers halve their cadence; event-driven and issuance-driven
layers use a **detection-latency budget** — how long we are willing to let a new
event go unseen — which is the right question for a source that can publish at
any moment.

---

## 9. D-SD-04 and D-SD-05 — status after research

**`D-SD-04` (MESH delivery): unchanged and still blocking Wave E.** §3.6
verified there is no hosted NOAA MESH service. The decision remains
self-process GRIB2 versus a paid host, and §7 of the research doc is right that
Netlify functions are the wrong runtime for GRIB decoding. No new information
moves this.

**`D-SD-05` (interrogation and lightning): reshaped for lightning, unchanged
for interrogation.**

- *Lightning* is no longer "choose a vendor." Per §3.3 it is now **GLM
  self-process (free data, ops cost) versus a vendor CG network (paid,
  ground-based, higher geolocation precision)**. The two answer materially
  different questions and the UI would label them differently. Still blocked —
  but the question is now worth asking, which it previously was not.
- *NEXRAD interrogation* is untouched: free Level II/III data, very high
  engineering cost, no shortcut found.

Both remain gated behind Phase 2 proving useful, per the original ordering.

---

## 10. Architecture (**ratified 2026-08-10**)

### 10.1 Shape

Four layers, with a hard rule at each boundary. This mirrors the existing
`forecastContract.js` / `api.js` / `alerts.mjs` split rather than introducing a
new pattern.

```
┌─ Provider ──────────────────────────────────────────────────┐
│  NWS API · NOAA MapServices · IEM · RainViewer              │
│  Untrusted. Heterogeneous. Independently failing.           │
└────────────────────────┬────────────────────────────────────┘
                         │  HTTP, per-provider auth/UA/format
┌─ Proxy (netlify/functions/severeDesk/*.mjs) ────────────────┐
│  Cache · bucket region key · set User-Agent · timeout       │
│  Map upstream failure → typed unavailable. Never synthesise.│
└────────────────────────┬────────────────────────────────────┘
                         │  provider-shaped JSON
┌─ Adapter (src/lib/severeDesk/adapters/*.js) ────────────────┐
│  ONE adapter per source. Normalises to LayerState.          │
│  The ONLY code that knows a provider's field names.         │
└────────────────────────┬────────────────────────────────────┘
                         │  LayerState — provider-agnostic
┌─ Registry + composition (layerState.js, RadarPanel) ────────┐
│  z-order · per-layer clock · legend · toggles               │
│  Knows layers. Knows NO provider.                           │
└─────────────────────────────────────────────────────────────┘
```

**The load-bearing rule:** no provider-specific field name may appear above the
adapter line. If `RadarPanel` ever needs to know that IEM spells a field
`magnitude` and NWS spells it `severity`, the abstraction has failed and the
fallback legs in §6 become unimplementable — because swapping canonical for
fallback would then mean editing the composition root.

### 10.2 The `LayerState` contract

`src/lib/severeDesk/layerState.js` — the `SC-SD-LAYER` seam. A discriminated
union, so an unavailable layer is structurally incapable of carrying stale
features:

```js
// ready
{
  status: 'ready',
  layerId: 'nws-warnings',
  source:  {
    name: 'NWS API',
    attribution: '…',
    authority: 'warning',
    product: 'watches-warnings-advisories',  // [v1.2] see below
    isFallback: false,                        // [v1.2]
  },
  clock:   { observedAt, receivedAt, polledAt, validFrom, validTo, cadenceMs },
  freshness: 'fresh' | 'aging' | 'stale',
  emptiness: 'populated' | 'no-data-in-window',   // [v1.2] §7.2 rule 3
  features: [...],                                 // [] iff no-data-in-window
  truncated: {
    shown: 250,
    total: 318 | null,          // [v1.2] null iff not verifiable
    exact: true | false,        // [v1.2] false → render "250+"
    upstreamTruncated: false,   // [v1.2] provider capped before we saw it
  } | null,
}

// unavailable — carries NO features field at all
{
  status: 'unavailable',
  layerId: 'nws-warnings',
  source:  { name: 'NWS API', … },
  reason:  'upstream-error' | 'out-of-window'
         | 'stale-expired' | 'not-configured',
  lastKnownAt: <timestamp|null>,   // for copy only, never for rendering
}
```

`authority` is a required field, not decoration. The legend renders from it.
This is how the research doc's §3 "do not mix layers" rule becomes mechanically
enforced instead of a convention a future contributor can forget.

**`[v1.2]` Three amendments, each closing a hole found in review:**

**1. `authority` gains `observation`.** v1.1's enum was `warning | report |
estimate | signature | outlook` — which could not type **reflectivity**, the
layer §6 spends the most words on. Worse, §10.3 rule 1 permits fallback only
*within* an authority class, so the one fallback pair the ratification actually
debated was unenforceable. The enum is now:

| Value | Layers |
|---|---|
| `warning` | NWS alerts, NOAA WWA |
| `outlook` | SPC categorical + probabilistic |
| `report` | IEM LSR |
| `signature` | IEM NEXRAD storm attributes |
| `observation` | **reflectivity (RainViewer, NOAA MRMS)** — sensed, not adjudicated |
| `estimate` | MESH, and any future derived product |

**2. `product` is required, and fallback may change it.** `authority` alone
cannot distinguish *composite* from *base* reflectivity — both are
`observation`, and §3.1 established they are different products whose pixels
mean different things. `product` carries that, and the legend must render it.
Without this field, the §6 fallback silently changes the meaning of the map.

**3. `emptiness` separates "nothing happened" from "we failed."** Per §7.2 rule
3. Note the consequence: **`reason: 'no-data'` is deleted from the `unavailable`
variant.** It was the encoding of exactly the conflation §7.2 forbids — a
successfully-fetched empty feed is `ready` with `emptiness:
'no-data-in-window'`, and nothing else. Leaving `no-data` available as an
`unavailable` reason would let the bug back in through the type system.

### 10.3 Fallback mechanics

Fallback is **explicit and visible**, never silent. The roadmap forbids "silent
fallback from one authority class to another," and this design respects that by
narrowing when fallback is even permitted:

1. Fallback may only occur **within the same `authority` class.** NOAA WWA may
   back NWS alerts (both `warning`); NOAA MRMS may back RainViewer (both
   `observation`, per the §10.2 enum amendment). Nothing may ever back LSR
   (`report`) with an `estimate`.
2. A layer served by its fallback renders a **visible source line naming the
   fallback**, and sets `source.isFallback = true`. The user always knows which
   source they are looking at.
3. **`[v1.2]` If the fallback's `product` differs from the canonical's, the
   product change must be surfaced too** — not just the source. Reflectivity is
   the live case: failing from RainViewer (composite) to NOAA (base) changes what
   a pixel means and can drop an elevated core (§3.1). A source line alone would
   satisfy rule 2 while still misleading the user, because they would reasonably
   assume they were looking at the same product from a different host. The legend
   must read *"base reflectivity"*, not merely *"source: NOAA."*
4. **`[v1.2]` Fallback never crosses a time-semantics boundary silently.**
   RainViewer's nowcast frames are *forecast*; the NOAA service has none. While
   on the fallback leg, nowcast frames are **absent, and their absence is
   stated** — the timeline does not quietly end at "now" as though no forecast
   frames ever existed.
5. If both legs fail, the result is `unavailable` — not the last good data.

### 10.4 Contract fixture set (**status corrected in v1.2**)

**`[v1.2]` These fixtures are a prerequisite, not residual evidence; closure was
recorded on 2026-08-11.** v1.1
described them as hardening that "does not re-open §6–8." The first half was
wrong. Source *decisions* are closed — that part stands — but `SC-SD-PROVIDER`'s
own completion evidence requires recorded fixtures, and **no adapter may be
written against a schema nobody has captured.** The corrected gating:

| Work | Blocked on fixtures? |
|---|---|
| Wave B — `layerState.js` + registry | **No.** Touches no provider payload; it is the provider-agnostic seam. Approvable independently. |
| Waves C / D — source adapters | **Yes.** Each adapter needs its source's fixtures recorded first. |
| Wave A — T-SD-01 honesty | **No.** Copy-only, current sources. |

Minimum per source: one **nominal**, one **empty**, one **malformed**, one
**upstream-failure**. The **empty** fixture is not optional bookkeeping — §7.2
rule 3 is only testable against it. Plus these targeted captures:

- **R-3 (§3.5) — probe answered 2026-08-10; capture still required.**
  `WWA/watch_warn_adv` **does** serve `f=geojson`, so no Esri-JSON conversion is
  needed. But the service's metadata still advertises `JSON` only, so the
  behaviour is **undocumented and therefore uncontracted**. Capture a
  `f=geojson` response as a regression fixture so a silent withdrawal is caught
  by our tests rather than during a live event.
- **`[v1.2]` WWA truncation:** capture a response carrying
  `exceededTransferLimit: true` plus its matching `returnCountOnly` result —
  §8.2's two-request path is otherwise untested.
- SPC: capture a genuinely *active* Day 1 with probabilistic layers populated,
  and an off-season quiet day — the quiet day is the one that breaks naive code.
- IEM LSR: capture a real severe-event burst **and** a calm-day empty result.
  v1.1 said "not a calm-day empty result"; **v1.2 requires both.** The calm day
  is the fixture that proves `ready` + `emptiness: 'no-data-in-window'` is not
  rendered as `unavailable` (§7.2 rule 3).
- Reflectivity: capture a WMS `GetCapabilities` to pin the time dimension format,
  and record the **product name** the service reports so the base-vs-composite
  distinction (§3.1) is pinned by a fixture rather than by prose.
- **`[v1.2]` NWS request model:** capture a multi-state `area=` response and a
  400 from a malformed `area` — §6.4's request model is otherwise unproven.

**Closure evidence (2026-08-11):** `node scripts/severe-desk-fixture-check.mjs`
verifies **42** checksummed artifacts: every source has nominal, empty,
malformed, and upstream-failure coverage; the targeted NWS, WWA, SPC, LSR, and
MRMS captures above are present. Live artifacts are public provider responses;
constructed entries are labelled in the manifest and are limited to failure or
otherwise unavailable input shapes. The live WWA capture records
`exceededTransferLimit: true` and the paired live `returnCountOnly` response.

#### Fixture capture contract

Recorded artifacts live under `fixtures/severe-desk/<source-id>/`; every entry
is declared in `fixtures/severe-desk/manifest.json`. `source-id` is one of
`nws-alerts`, `noaa-wwa`, `noaa-spc`, `iem-spc`, `iem-lsr`, `iem-attributes`,
`rainviewer`, or `noaa-mrms`. A manifest entry records the source id, case
(`nominal`, `empty`, `malformed`, or `upstream-failure`), whether it is a live
capture or deliberately constructed failure input, a redacted request, UTC
capture time, HTTP status, content type, artifact path, SHA-256, and the
contract properties it proves. The manifest is the provenance record; payload
filenames are not evidence by themselves.

Live captures contain only public provider responses. Do not record credentials,
cookies, IP addresses, user-entered locations, or unredacted provider headers.
Malformed and upstream-failure cases are deliberately constructed public-safe
inputs, labelled as such, never represented as live provider failures. Validate
the inventory with `node scripts/severe-desk-fixture-check.mjs`; it fails until
every required case and targeted regression capture is present, so an empty
fixture directory can never close `T-SD-00`.

---

## 11. Path forward (post-ratification)

| Step | Work | Gate | Blocked by |
|---|---|---|---|
| **Done** | Ratify this document (2026-08-10, v1.1); amend (v1.2) | `FND-SD-PROVIDER-CONTRACTS` **closed for decisions** | — |
| **Now** | **T-SD-01** (Wave A) — current-source honesty | browser + contrast proof | *nothing* |
| **Now** | **T-SD-00** fixture capture (§10.4) | recorded fixtures per source | — (does not re-open §6–8) |
| Then | Explicit approval of **Wave B** → **T-SD-02** (`layerState.js` + registry) | no-network contract fixtures | Wave 0 decisions (done) — **not** fixture capture |
| Then | Explicit approval of **Wave C** → **T-SD-10 ∥ T-SD-11** then **T-SD-12** | official desk proof | Wave B **+ §10.4 fixtures for its sources** |
| Then | Explicit approval of **Wave D** → **T-SD-20 ∥ T-SD-21** then **T-SD-22** | tracking desk proof | Wave C **+ §10.4 fixtures for its sources** |
| Blocked | Waves E / F / G | `D-SD-04`, `D-SD-05` | unresolved |

**T-SD-01 is dispatchable today.** So is §10.4 fixture capture, and the two do
not contend. **`[v1.2]`** Wave B is *not* gated on fixtures — it builds the
provider-agnostic seam and can proceed on decisions alone — but **Waves C and D
are**, per §10.4. Recommended order: Wave A honesty now, fixture capture in
parallel, then Wave B approval.

Roadmap rule still holds: **closing Wave 0 decisions does not approve Waves
B–D code.** Each named Wave still needs its own explicit implementation
approval.

---

## 12. Residual open items and risks

### Wave 0 closure (does not re-open ratified sources)

**`[v1.2]`** Public-safe contract fixtures in §10.4 gate **Waves C and D**
adapter work — not Wave A or Wave B. The inventory is now present and
hash-verified, so `SC-SD-PROVIDER` is **decision-accepted, fixture-closed**.

**R-3 is closed as a blocker.** The probe ran on 2026-08-10:
`WWA/watch_warn_adv` **does** serve `f=geojson`, so no Esri-JSON→GeoJSON step is
needed and the fallback leg's cost estimate stands. It persists only as a
regression fixture, because the behaviour is undocumented (§3.5).

### Still open (later foundations)

- **D-SD-04** — MESH delivery (self-process vs paid host); blocks Wave E
- **D-SD-05** — NEXRAD interrogation + lightning (GLM free-data vs paid CG);
  blocks Waves F and G

### Risks

| ID | Risk | Mitigation |
|---|---|---|
| R-1 | IEM single-sourced for LSR + attributes; as-is, no warranty | Accepted and recorded. Aggressive caching; fail-closed unavailable states. No free substitute exists. |
| R-2 | NWS rate limit is unpublished — cannot design precisely against it | Keep the self-imposed 30 s cadence; CDN-coalesce; treat 429/403 as first-class unavailable. |
| R-3 | ~~WWA geoJSON support unverified~~ — **closed `[v1.2]`**; `f=geojson` verified working, but **undocumented** in service metadata | Downgraded from blocker to regression risk. Capture a `f=geojson` fixture (§10.4) so silent withdrawal fails our tests, not a live event. |
| R-4 | ArcGIS service schemas can drift without notice | Contract fixtures per adapter; adapter is the only code that breaks. |
| R-5 | RainViewer explicitly disclaims availability | Fallback leg is specified (§6). |
| R-6 | GLM would be mislabelled as ground-strike lightning | `authority` field + explicit copy rules if Wave G ever unblocks. |
| R-7 | **`[v1.2]`** Reflectivity fallback is **base**, canonical is **composite** — failing over changes what a pixel means and can drop elevated cores (§3.1) | `source.product` is required and legend-rendered; §10.3 rules 3–4 force the product change and the nowcast loss to be visible. |
| R-8 | **`[v1.2]`** A calm day and a broken feed both produce zero features | `emptiness` discriminator (§7.2 rule 3); `reason: 'no-data'` removed from the `unavailable` variant so the type system cannot express the conflation. Calm-day fixture required (§10.4). |
| R-9 | **`[v1.2]`** ArcGIS `exceededTransferLimit` could be read as a complete set, disclosing a false exact count | §8.2: `truncated.exact = false` → render `"250+"`; never present an unverified total as exact. |

### Rejected

**Blitzortung / LightningMaps — rejected, not merely non-commercial.** Its terms
restrict use to *"private and entertainment purposes,"* limit raw data to
network participants, and **explicitly prohibit use for storm warning systems.**
That last clause is a direct conflict with this product's stated purpose. It
should not be reconsidered on the grounds that it is free.

---

## 13. Document history

| Version | Date | Notes |
|---|---|---|
| 1.0 | 2026-08-10 | Initial proposal. Primary-source verification of all Wave 0–2 providers; six findings against the research inventory; proposed D-SD-01/02/03 resolutions, architecture, and sequencing. Not ratified. |
| 1.1 | 2026-08-10 | **Accepted.** Jared ratified D-SD-01–03, selection criteria, LayerState architecture (required `authority`; `unavailable` without `features`), four-layer stack, and RainViewer-canonical reflectivity with NOAA WMS fallback. D-SD-04/05 remain open. Residual fixture capture does not re-open source choices. |
| 1.2 | 2026-08-10 | **Post-ratification review amendment. No source choice changed.** Corrected: the NOAA service is **base**, not composite, reflectivity (§3.1) — the fallback is a product substitution, so §6.1, §10.3, and R-7 now require the product change and nowcast loss to be user-visible. Closed four dispatch-blocking gaps: NWS request model (§6.4 — `area=` state codes only; `region` verified **marine-only**), event-driven clocks (§7.2 — feed clock vs. content clock, and empty ≠ unavailable), count/pagination policy (§8.2 — NWS/IEM exact, ArcGIS `returnCountOnly`, `"250+"` on failure), and the §8.3 TTL rationale. `LayerState` gains `authority: 'observation'`, required `product`, `isFallback`, `emptiness`, and a richer `truncated`; `reason: 'no-data'` deleted. **R-3 closed by live probe** — WWA serves `f=geojson`, though undocumented. Fixtures reclassified from residual evidence to a **prerequisite for Waves C/D** (§10.4); Wave B remains independently approvable. |
| 1.3 | 2026-08-10 | **Wave C/D execution amendment.** Ratifies the initial contiguous-state + DC `Place.admin1` desk registry and fixed Census envelopes, with 750 ms selected-place settling and no viewport query. Makes the IEM runtime model explicit: the recorded source contracts provide global LSR-window and global attributes requests only; all map scope is visibly client-side after normalisation. Unsupported noncontiguous, territorial, foreign, and unknown places fail closed. |
