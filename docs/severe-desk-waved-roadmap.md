# Implementation Spec: severe weather desk waved roadmap

## Authority and scope

### Approved goal

Create a dependency-ready roadmap for the private, U.S.-only severe-weather
desk described in `docs/severe-desk-radar-hail-tornado.md`. The intended users
are Jared and one other weather-literate friend; no commercial SLA, global
coverage, paid default provider, or broad public-service scale is implied.

This is a roadmap and dispatch contract, **not approval to implement any Wave**.
Only a later, explicit approval of a named Wave authorizes code changes.

### Governing authority

- User direction, 2026-08-10: create a branch and decompose the severe-desk
  research into a waved roadmap; private use by two nerdy weather users.
- [`severe-desk-radar-hail-tornado.md` §3](./severe-desk-radar-hail-tornado.md#3-what-tracking-means-do-not-mix-layers),
  [§4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits),
  [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path), and
  [§9](./severe-desk-radar-hail-tornado.md#9-suggested-technical-seams-when-approved).
- `docs/api-and-product-brainstorm.md` §2 (product traits) and §10.3
  (severe desk explicitly deferred pending product approval).
- [`docs/severe-desk-provider-contracts.md`](./severe-desk-provider-contracts.md)
  v1.3 (2026-08-10, **sources accepted — Wave 0 ratified**): binding
  canonical/fallback sources, time contract, load/cache, and LayerState
  architecture for Waves B–D. Closes `FND-SD-PROVIDER-CONTRACTS` **for decision
  scope only**. §10.4 contract fixtures do not re-open D-SD-01–03, but they
  **do gate source-adapter work in Waves C and D**; Wave B is not gated on them.
  Explicit approval of a named code Wave is still required before implementation.
- Current implementation: `src/components/RadarPanel.jsx`,
  `src/components/AlertsPanel.jsx`, `src/lib/radar.js`,
  `src/lib/api.js`, and `netlify/functions/alerts.mjs`.

### Scope

- Establish the hard dependency graph, Wave order, decision gates, bounded
  implementation lanes, and acceptance evidence for Phase 0 through Phase 5.
- Preserve the separate authority of warning, report, estimate, and radar-signature
  layers.
- Treat provider payloads as untrusted at their adapters; consume normalised,
  timestamped layer data in the Radar surface.
- Keep later MESH, NEXRAD interrogation, and lightning work visibly blocked
  until their delivery choices are approved.

### Non-goals

- Implement a new provider, endpoint, proxy, map layer, persistence key, or UI.
- Add a paid provider, safety score, LLM warning paraphrase, inferred tornado
  track, global desk, or mobile/public scale assumption.
- Treat raw radar frames, LSRs, MESH, or dual-pol signatures as interchangeable
  evidence.

## System progression and dependency map

| Node ID | Node type | Authority refs | Phase | Wave | Provides | Consumes | Hard prerequisites | Closure gate |
|---|---|---|---|---|---|---|---|---|
| FND-SD-PROVIDER-CONTRACTS | Foundation | [research §4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [research §9](./severe-desk-radar-hail-tornado.md#9-suggested-technical-seams-when-approved), [provider contract §6](./severe-desk-provider-contracts.md#6-decision-d-sd-01--canonical-sources-ratified-2026-08-10) | Phase 0.5 | 0 | Approved canonical source, scope, cache, freshness, attribution, and unavailable-state contract per layer | Current provider boundaries | Foundation root | Decision record names one canonical source, one concrete request model, and one fallback/no-data rule for warnings, SPC, reflectivity, LSR, and storm attributes; layers with no available fallback are recorded as accepted single-source risk rather than left implicit; a fallback whose product differs from its canonical is recorded as a product substitution; and public-safe contract fixtures are recorded per source before its adapter is built |
| CAP-SD-PROVENANCE | Capability | [research §4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [research §8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | Phase 0 | A | A visible distinction between current model hail code, official alert geometry, and radar reflectivity | Existing Radar and Alerts surfaces | Foundation root | Fixture-backed copy and source labels never call code 96/99 hail tracking or composite reflectivity a tornado/hail product |
| FND-SD-LAYER-REGISTRY | Foundation | [research §4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [research §4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [research §9](./severe-desk-radar-hail-tornado.md#9-suggested-technical-seams-when-approved) | Phase 1 | B | A normalised layer-state/time contract and z-order registry | Approved provider contracts; Leaflet Radar surface | FND-SD-PROVIDER-CONTRACTS decision closure (fixtures are not consumed) | No layer can render without source, observed/issued time, freshness state, and explicit unavailable state |
| CAP-SD-OFFICIAL-GEOMETRY | Capability | [research §4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | Phase 1 | C | Regional official warning/watch geometry with event filtering | NWS adapter; layer registry | FND-SD-PROVIDER-CONTRACTS, FND-SD-LAYER-REGISTRY | Recorded regional fixtures prove active/cancelled/expired/missing-geometry handling and no fabricated polygon |
| CAP-SD-SPC-OUTLOOK | Capability | [research §4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | Phase 1 | C | Day 1 outlook geometry plus issuance time | Approved SPC adapter; layer registry | FND-SD-PROVIDER-CONTRACTS, FND-SD-LAYER-REGISTRY | Recorded categorical and probabilistic fixtures render source, issuance time, and unavailable state |
| FEAT-SD-OFFICIAL-DESK | Feature | [research §4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | Phase 1 | C | Toggleable official geometry and SPC context over existing reflectivity | Official geometry, SPC outlook, layer registry, existing Radar | CAP-SD-OFFICIAL-GEOMETRY, CAP-SD-SPC-OUTLOOK | Browser proof shows source-labelled layers, deterministic z-order, and honest unavailable states at desktop and mobile widths |
| CAP-SD-LSR | Capability | [research §3](./severe-desk-radar-hail-tornado.md#3-what-tracking-means-do-not-mix-layers), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | Phase 2 | D | Normalised Local Storm Report points, qualifiers, and report timestamps | Approved IEM LSR adapter | FND-SD-PROVIDER-CONTRACTS | Recorded report fixture preserves phenomenon, qualifier, report time, coordinates, and an empty/unavailable result |
| CAP-SD-STORM-ATTRIBUTES | Capability | [research §3](./severe-desk-radar-hail-tornado.md#3-what-tracking-means-do-not-mix-layers), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | Phase 2 | D | Normalised per-volume storm attributes and motion vectors | Approved IEM attributes adapter | FND-SD-PROVIDER-CONTRACTS | Recorded scan fixtures prove timestamp, source volume, and vector-unavailable handling; no persistent track path is claimed |
| FEAT-SD-TRACKING-DESK | Feature | [research §3](./severe-desk-radar-hail-tornado.md#3-what-tracking-means-do-not-mix-layers), [§4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | Phase 2 | D | Source-labelled LSR and attribute overlays with bounded time coordination | Official desk, LSR, storm attributes, layer registry | FEAT-SD-OFFICIAL-DESK, CAP-SD-LSR, CAP-SD-STORM-ATTRIBUTES | Browser proof demonstrates divergent source clocks, report/estimate/warning legend, and no data invented outside each layer's valid window |
| FND-SD-MESH-DELIVERY | Foundation | [research §5.4](./severe-desk-radar-hail-tornado.md#54-hail-tracking), [§7](./severe-desk-radar-hail-tornado.md#7-mrms--mesh-posture-hail-science), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | Phase 3 | E | Approved MESH delivery architecture: self-processing pipeline or named host | MRMS data or approved host | FND-SD-PROVIDER-CONTRACTS; explicit architecture approval | Decision record establishes ownership, processor/runtime, cache, latency budget, product units, and failure state |
| FEAT-SD-MESH | Feature | [research §3](./severe-desk-radar-hail-tornado.md#3-what-tracking-means-do-not-mix-layers), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§7](./severe-desk-radar-hail-tornado.md#7-mrms--mesh-posture-hail-science) | Phase 3 | E | Timestamped MESH layer and distinct reported-versus-estimated legend | MESH delivery foundation; tracking desk; layer registry | FND-SD-MESH-DELIVERY, FEAT-SD-TRACKING-DESK | Fixture plus rendered proof never labels MESH as observed hail and keeps it separate from LSRs |
| FND-SD-NEXRAD-INTERROGATION | Foundation | [research §4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [§5.4](./severe-desk-radar-hail-tornado.md#54-hail-tracking), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | Phase 4 | F | Approved single-site radar architecture and operator interaction model | Raw Level II/III data or approved service | Explicit architecture and product approval | Decision record defines site selection, product set, processing path, retention, and required expertise copy |
| FEAT-SD-INTERROGATION | Feature | [research §3](./severe-desk-radar-hail-tornado.md#3-what-tracking-means-do-not-mix-layers), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | Phase 4 | F | Single-site reflectivity, velocity, CC, and cautious TDS cue | Interrogation foundation; layer registry | FND-SD-NEXRAD-INTERROGATION, FEAT-SD-TRACKING-DESK | Recorded products and browser proof distinguish signatures from confirmation and fail closed on a missing product |
| FND-SD-LIGHTNING-SOURCE | Foundation | [research §5.6](./severe-desk-radar-hail-tornado.md#56-lightning-supporting-not-substitute), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path), [provider contract §6](./severe-desk-provider-contracts.md#6-decision-d-sd-01--canonical-sources-ratified-2026-08-10) | Phase 5 | G | Approved lightning source and licensing/freshness contract | Provider decision | Explicit source/terms approval | Decision record chooses between free satellite total lightning (GOES GLM, free data + ops cost) and a paid ground-based CG network, and establishes coverage, latency, cost, attribution, unavailable state, and copy that never labels optical flash detection as ground-strike data |
| FEAT-SD-LIGHTNING | Feature | [research §4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | Phase 5 | G | Optional source-labelled lightning overlay | Lightning foundation; layer registry | FND-SD-LIGHTNING-SOURCE, FEAT-SD-TRACKING-DESK | Rendered proof distinguishes lightning observations from radar and shows source timestamp |

Hard `requires` edges override desired delivery order and parallelism. A node in
Wave 3–5 is intentionally not dispatchable until its named decision record
exists and its Foundation gate has passed.

Wave 0 ratifies providers without runtime changes. Wave A retains current-data
honesty. Wave B establishes the layer contract. Wave C runs the official
geometry and SPC adapters in parallel before composing the official desk.
Wave D runs the LSR and attributes adapters in parallel before composing the
tracking desk. Waves E, F, and G are deliberately blocked on their MESH,
interrogation, and lightning Foundation decisions respectively.

## Traceability matrix

| Authority ref | Behavior / decision | Task ID | Implementation seam | Acceptance evidence | Owner |
|---|---|---|---|---|---|
| [research §4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§9](./severe-desk-radar-hail-tornado.md#9-suggested-technical-seams-when-approved) | Canonical-provider and operational contract before code | T-SD-00 | `docs/severe-desk-provider-contracts.md`; committed recorded fixtures | Authority review and contract-fixture validation | product/provider lane |
| [research §4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | Existing signals retain their actual authority — **closed 2026-08-10** | T-SD-01 | `RadarPanel`, `AlertsPanel`, source/copy tests | Browser assertions cover WMO 96/99 risk, RainViewer composite-reflectivity limits, and official NWS labels; all-theme contrast proof passes | radar-ux lane |
| [research §4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§9](./severe-desk-radar-hail-tornado.md#9-suggested-technical-seams-when-approved) | Every map layer has source, time, freshness, and safe unavailable state | T-SD-02 | `src/lib/severeDesk/*`, `RadarPanel` composition root | No-network layer-state fixtures and Radar lifecycle smoke | layer-foundation lane |
| [research §4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | Official geometry is filtered, source-labelled, and never invented — **closed 2026-08-10** | T-SD-10 / T-SD-11 | approved NWS/SPC proxy clients and layer adapters | Handler contract plus active/cancelled/expired/missing-geometry and issued-time fixtures | official-data lanes |
| [research §4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | Official desk renders legitimate independent layers together — **closed 2026-08-10** | T-SD-12 | `RadarPanel`, `src/styles.css`, Radar browser seam | Desktop/mobile layer-stack, controls, unavailable, and contrast proof | radar-composition lane |
| [research §3](./severe-desk-radar-hail-tornado.md#3-what-tracking-means-do-not-mix-layers), [§4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | LSR and attributes preserve their source clocks before map composition — **closed 2026-08-10** | T-SD-20 / T-SD-21 / T-SD-22 | approved IEM adapters and `RadarPanel` time controls | Recorded adapter contracts, divergent-clock fixture, and no-invented-data assertions | tracking lanes |
| [research §3](./severe-desk-radar-hail-tornado.md#3-what-tracking-means-do-not-mix-layers), [§7](./severe-desk-radar-hail-tornado.md#7-mrms--mesh-posture-hail-science), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | MESH is a processing/hosted-layer decision and is visibly an estimate | T-SD-30 / T-SD-40 / T-SD-50 | approved later delivery paths | Decision records and later product fixtures | later-wave lanes |

## Implementation boundary

### Allowed changes

- Wave 0 may add only the provider decision record and recorded, public-safe
  fixture metadata needed to validate proposed source contracts.
- A later approved Wave may touch only the files/symbols named in its coder
  handoff and only after every hard prerequisite has passed.
- Adapters may normalise untrusted provider payloads at the boundary; domain and
  Radar composition code may consume only the resulting layer contract.

### Forbidden changes / non-goals

- No direct browser fetch to a new provider in production, silent fallback from
  one authority class to another, fabricated geometry, inferred tornado path,
  or synthetic success on source failure.
- No paid default provider, account/credential flow, user tracking, global
  coverage, safety score, emergency instruction, or LLM-generated NWS rewrite.
- No MESH processing, Level II/III decode, or lightning ingestion before its
  named Foundation decision passes.

**No-invention declaration:** Implement only the cited behavior inside this
boundary. A missing execution path, architecture, API, persistence flow,
provider behavior, or product solution is a blocker requiring an approved
authority update, not a coder decision.

## Decision gaps and blockers

Status as of 2026-08-10. **Wave A / T-SD-01 is closed.** **D-SD-01 through
D-SD-03 are ratified** in
[`docs/severe-desk-provider-contracts.md`](./severe-desk-provider-contracts.md)
v1.3 (Accepted). Wave 0 decision scope is closed. **Wave B** is independently
approvable because it consumes no provider payload. **Waves C and D** are
additionally blocked on **recorded §10.4 contract fixtures** for the sources
they adapt.
Waves E–G remain blocked on D-SD-04 / D-SD-05.

- **D-SD-01 — canonical sources:** **resolved 2026-08-10.** NWS API (fallback
  NOAA `WWA/watch_warn_adv`, `f=geojson` verified); NOAA `SPC_wx_outlks`
  (fallback IEM `spcoutlook`); IEM `lsr.py` and IEM `nexrad_attr.py` (both
  single-sourced, accepted risk); RainViewer **composite** reflectivity canonical
  (fallback NOAA `radar_base_reflectivity_time`, which is **base** reflectivity —
  a different product, not a like-for-like swap) to preserve shipped nowcast
  frames. **Request model** (added v1.2): `/alerts/active?area={state codes}`,
  max 4 states per request; `region`/`region_type` are **marine-only** and must
  not be sent. See provider-contracts §6 and §6.4.
- **D-SD-02 — time contract:** **resolved 2026-08-10.** *Cadenced* layers:
  freshness `fresh`/`aging`/`stale`/`unavailable` at 1×/3×/6× each source's own
  cadence, ±1× nearest-frame tolerance. *Event-driven* layers (LSR, alerts,
  added v1.2 §7.2): a **feed clock** governs freshness against a declared poll
  cadence (LSR 60 s, alerts 30 s) while a **content clock** selects features by
  report or validity time; no nearest-frame borrowing. **A successfully-fetched
  empty feed is `ready` with `emptiness: 'no-data-in-window'`, never
  `unavailable`** — a calm day and a broken pipeline must not render alike.
  Never render last-good data when unavailable. See provider-contracts §7.
- **D-SD-03 — layer extent and load:** **resolved 2026-08-10.** Fixed-region
  queries, 750 ms debounce, disclosed feature caps, cache TTLs per §8.3.
  **Count policy** (added v1.2 §8.2): NWS and IEM return complete sets, so
  disclose an **exact** omitted count; ArcGIS legs resolve totals via
  `returnCountOnly` when `exceededTransferLimit` is set, and disclose **`"250+"`**
  if that request fails. We do not paginate. See provider-contracts §8.
- **D-SD-04 — MESH delivery:** **still open — blocks Wave E.** Decide
  self-processing runtime versus a named host before Phase 3. The current Netlify
  functions are not approval for GRIB processing or a new always-on service.
  Verified 2026-08-10: NOAA's hosted raster catalogue was enumerated exhaustively
  and contains **no MESH or hail service** — the convenient shortcut does not
  exist (provider-contracts §3.6).
- **D-SD-05 — interrogation and lightning:** **still open — blocks Waves F/G.**
  Choose product scope and source only after Phase 2 is demonstrably useful.
  Lightning question shape: **GLM self-process versus a paid ground-based CG
  network**. NEXRAD interrogation: free data, very high engineering cost.

## Scaffold inventory

| Seam ID | Authority refs | Crate / file / symbol | Signature / contract | Safe unresolved state | Owner | Completion evidence |
|---|---|---|---|---|---|---|
| SC-SD-PROVIDER | [research §4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§9](./severe-desk-radar-hail-tornado.md#9-suggested-technical-seams-when-approved), [provider contract §10.4](./severe-desk-provider-contracts.md#104-contract-fixture-set-status-corrected-in-v12) | [`docs/severe-desk-provider-contracts.md`](./severe-desk-provider-contracts.md) v1.3 — **closed 2026-08-10** | Names one source, request scope, response fixture, cache/freshness, attribution, and fallback for each Wave 1–2 layer | Sources and recorded schemas are locked. Adapters may consume only their recorded contract fixtures; uncaptured schema remains fail-closed. | product/provider lane | 42 hash-verified nominal/empty/malformed/upstream-failure and targeted regression fixtures (§10.4) |
| SC-SD-LAYER | [research §4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§9](./severe-desk-radar-hail-tornado.md#9-suggested-technical-seams-when-approved) | `src/lib/severeDesk/layerState.js`, `layerRegistry.js`, `radarLayerStack.js` | Source-labelled, timestamped, discriminated ready/unavailable layer state | Implemented fail-closed: an unavailable or invalid state projects to labelled featureless absence, never plausible stale features | layer-foundation lane | No-network LayerState fixture seam and full consumer/browser suite |
| SC-SD-WARNINGS | [research §4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | approved alert adapter (future) | Normalises only authoritative NWS geometry, event metadata, and temporal status | Fail-closed: no geometry or valid status suppresses the polygon | official-geometry lane | Handler/adapter fixture proof |
| SC-SD-SPC | [research §4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | approved SPC adapter (future) | Normalises outlook geometry with product type and issuance time | Fail-closed unavailable state; no substituted model forecast | spc lane | Adapter fixture proof |
| SC-SD-LSR | [research §3](./severe-desk-radar-hail-tornado.md#3-what-tracking-means-do-not-mix-layers), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | approved IEM LSR adapter (future) | Normalises observation type, qualifier, report time, and coordinate | Fail-closed empty/unavailable report layer; no ground-truth claim | reports lane | Recorded IEM-shaped fixture proof |
| SC-SD-ATTR | [research §3](./severe-desk-radar-hail-tornado.md#3-what-tracking-means-do-not-mix-layers), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | approved attributes adapter (future) | Normalises a scan-scoped cell attribute and optional motion vector | Fail-closed: no path or vector when the payload cannot prove one | attributes lane | Recorded scan fixture proof |
| SC-SD-TIME | [research §4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path) | layer time coordinator (future) | Resolves selected map time separately per source with declared tolerance | Fail-closed unavailable/out-of-window layer state | tracking-composition lane | Divergent-clock browser fixture |

## Task breakdown and coder handoffs

### T-SD-00: ratify Wave 0 provider contracts

- System node: FND-SD-PROVIDER-CONTRACTS.
- Phase / Wave: 0.5 / 0.
- Hard prerequisites: Foundation root.
- Provides / consumes: provides approved source contracts; consumes only the
  research inventory and live provider documentation.
- Closure gate: **two halves, tracked separately.** (a) D-SD-01 through D-SD-03
  resolved in a reviewed decision record — **met**; (b) public-safe contract
  fixtures recorded per source (§10.4) — **met**.
- Status 2026-08-10: **closed.**
  [`docs/severe-desk-provider-contracts.md`](./severe-desk-provider-contracts.md)
  v1.3. Jared ratified D-SD-01–03 (RainViewer-canonical reflectivity + NOAA
  fallback), selection criteria, LayerState architecture, and the four-layer
  stack. v1.2 then closed the request-model, event-driven-clock, and count-policy
  gaps, corrected the NOAA service to **base** reflectivity, and **closed R-3**
  (WWA `f=geojson` verified working). The fixture checker verifies 42 recorded
  public-safe artifacts, so Waves C/D adapter work is no longer fixture-blocked.
- Authority refs: [research §4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§9](./severe-desk-radar-hail-tornado.md#9-suggested-technical-seams-when-approved), [provider contract §10.4](./severe-desk-provider-contracts.md#104-contract-fixture-set-status-corrected-in-v12); user private-use clarification; ratification 2026-08-10.
- Allowed write scope: decision record (done) and fixture metadata only.
- Acceptance evidence: ratified source links, cache/freshness/unavailable rules,
  and 42 hash-verified nominal/empty/malformed/upstream-failure and targeted
  regression fixtures (`node scripts/severe-desk-fixture-check.mjs`) — **met**.
- Coder rule: Implement only cited behavior; every uncited path or solution is a blocker requiring approved authority.

### T-SD-01: retain current-source honesty

- System node: CAP-SD-PROVENANCE.
- Phase / Wave: 0 / A.
- Hard prerequisites: Foundation root.
- Provides / consumes: provides source-accurate current UI copy; consumes only
  existing Radar, Alerts, and weather-code behavior.
- Closure gate: **met 2026-08-10.** Browser and contrast proof establish that a
  user cannot mistake the current WMO 96/99 hail-risk signal, composite radar,
  or an NWS alert for a measured severe product.
- Status: **closed.** The desktop/mobile smoke fixture asserts the exact WMO
  96/99 risk label and no-measured-variable disclosure; the Radar browser
  fixture asserts exact RainViewer composite-reflectivity and official-NWS
  labels; the contrast audit measures the added Radar provenance surface across
  every supported theme.
- Authority refs: [research §4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [research §8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path).
- Allowed write scope: `RadarPanel`, `AlertsPanel`, styles, and their existing
  browser/contrast proof only.
- Acceptance evidence: `npm test` passed 2026-08-10, including build,
  desktop/mobile smoke, all-theme contrast, and the Radar browser test.
- Coder rule: Implement only cited behavior; every uncited path or solution is a blocker requiring approved authority.

### T-SD-02: build the layer foundation

- System node: FND-SD-LAYER-REGISTRY.
- Phase / Wave: 1 / B.
- Hard prerequisites: FND-SD-PROVIDER-CONTRACTS closure — **met**.
- Provides / consumes: provides a layer registry and time-state contract;
  consumes approved provider contracts and the existing lazy Radar lifecycle.
- Closure gate: no-network fixtures prove source/time/freshness/unavailable
  states; no provider-specific payload reaches `RadarPanel`.
- Status: **closed 2026-08-10.** The provider-agnostic LayerState, registry, and
  Radar-facing projector pass their no-network consumer seam; invalid and
  unavailable states project to labelled featureless absence.
- Authority refs: [research §4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§9](./severe-desk-radar-hail-tornado.md#9-suggested-technical-seams-when-approved).
- Allowed write scope: new `src/lib/severeDesk/*` domain modules, `RadarPanel`
  composition wiring, and dedicated fixtures/tests.
- Acceptance evidence: `npm test`, including `test:severe-desk-layer-state`,
  build, desktop/mobile smoke, contrast, and Radar browser proof — **met**.
- Coder rule: Implement only cited behavior; every uncited path or solution is a blocker requiring approved authority.

### T-SD-10 / T-SD-11: create independent official-data adapters

- System node: CAP-SD-OFFICIAL-GEOMETRY and CAP-SD-SPC-OUTLOOK.
- Phase / Wave: 1 / C, parallel after Wave B; neither task edits Radar composition.
- Hard prerequisites: FND-SD-PROVIDER-CONTRACTS and FND-SD-LAYER-REGISTRY.
- Provides / consumes: each provides one normalised layer contract and consumes
  only its Wave-0-approved source.
- Closure gate: each adapter passes its recorded contract fixtures, including
  malformed, empty, expired, and upstream-failure states.
- Status: **closed 2026-08-10.** NWS and SPC proxy/adapter fixture contracts
  pass; invalid, quiet, expired, and failed source states render no fabricated
  geometry.
- Authority refs: [research §4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path), [§9](./severe-desk-radar-hail-tornado.md#9-suggested-technical-seams-when-approved).
- Allowed write scope: its own proxy/client/normaliser and contract fixtures;
  shared `RadarPanel` is forbidden in this Wave.
- Acceptance evidence: focused adapter proof, production-handler contract where
  applicable, and build.
- Coder rule: Implement only cited behavior; every uncited path or solution is a blocker requiring approved authority.

### T-SD-12: compose the official desk

- System node: FEAT-SD-OFFICIAL-DESK.
- Phase / Wave: 1 / C, after T-SD-10 and T-SD-11 close.
- Hard prerequisites: CAP-SD-OFFICIAL-GEOMETRY, CAP-SD-SPC-OUTLOOK, and
  FND-SD-LAYER-REGISTRY.
- Provides / consumes: provides the official Radar stack; consumes only the two
  normalised official-layer contracts.
- Closure gate: user-visible controls, deterministic z-order, source/issued
  time, and unavailable state pass desktop/mobile browser and contrast proof.
- Status: **closed 2026-08-10.** The Radar consumer fetches exactly one fixed
  contiguous-state request pair per selected place, clears prior regional
  geometry during settling, and proves Kansas City, unsupported scope, z-order,
  source/time, controls, and unavailable states through the browser seam.
- Authority refs: [research §4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path).
- Allowed write scope: `RadarPanel`, app handoff wiring if necessary, styles,
  and Radar/smoke/contrast tests.
- Acceptance evidence: `npm run test:radar`, `npm run test:smoke`,
  `npm run test:contrast`, and build.
- Executable scope: fixed contiguous-state desk only — `Place.admin1` maps to
  exactly one NWS state code and its Census-derived SPC envelope after a 750 ms
  settle. There is no cross-border expansion or viewport/map-pan request;
  Alaska, Hawaii, territories, foreign, and unknown places expose typed
  unavailable official layers without a provider request.
- Coder rule: Implement only cited behavior; every uncited path or solution is a blocker requiring approved authority.

### T-SD-20 / T-SD-21 / T-SD-22: add observations, attributes, then time coordination

- System node: CAP-SD-LSR, CAP-SD-STORM-ATTRIBUTES, and FEAT-SD-TRACKING-DESK.
- Phase / Wave: 2 / D; T-SD-20 and T-SD-21 may run in parallel, T-SD-22 follows both.
- Hard prerequisites: FND-SD-PROVIDER-CONTRACTS, FEAT-SD-OFFICIAL-DESK, and
  FND-SD-LAYER-REGISTRY; T-SD-22 also requires both adapter closures.
- Provides / consumes: adapters provide normalised observation and scan data;
  composition provides separately-clocked overlays and a clear authority legend.
- Closure gate: a divergent-clock fixture proves report, attribute, and radar
  data remain separate and out-of-window data is not rendered.
- Status: **closed 2026-08-10.** Recorded IEM contracts and the Radar browser
  seam prove a six-hour report window, independent scan tolerance, client-side
  scope disclosure, no invented track, and featureless out-of-window absence.
- Authority refs: [research §3](./severe-desk-radar-hail-tornado.md#3-what-tracking-means-do-not-mix-layers), [§4](./severe-desk-radar-hail-tornado.md#4-product-shape-fits-stormlogic-traits), [§4.2](./severe-desk-radar-hail-tornado.md#42-authority-rules-non-negotiable), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path), [§9](./severe-desk-radar-hail-tornado.md#9-suggested-technical-seams-when-approved).
- Allowed write scope: each adapter owns its proxy/client/normaliser; only
  T-SD-22 may edit `RadarPanel` and shared map controls.
- Executable scope: the recorded IEM contracts have no server-side regional
  filter. LSR is a six-hour `sts`/`ets` source window and attributes are a
  singleton source; both are visibly bounded to the current map only after
  normalisation. Pan/zoom redraws markers but never issues an IEM request.
- Acceptance evidence: focused adapter contracts, Radar/browser/contrast proof,
  and full `npm test` before Wave 2 closes.
- Coder rule: Implement only cited behavior; every uncited path or solution is a blocker requiring approved authority.

### T-SD-30 / T-SD-40 / T-SD-50: later foundations remain blocked

- System node: FND-SD-MESH-DELIVERY, FND-SD-NEXRAD-INTERROGATION, and
  FND-SD-LIGHTNING-SOURCE, followed by their respective Features.
- Phase / Wave: 3 / E, 4 / F, and 5 / G.
- Hard prerequisites: the named decision gaps plus the prior Feature closure.
- Provides / consumes: each Foundation provides only an approved delivery/source
  contract; its Feature consumes that contract and the layer registry.
- Closure gate: no code begins until the explicit decision record has passed
  review; Feature closure requires recorded product fixtures and user-visible
  source/freshness proof.
- Authority refs: [research §3](./severe-desk-radar-hail-tornado.md#3-what-tracking-means-do-not-mix-layers), [§7](./severe-desk-radar-hail-tornado.md#7-mrms--mesh-posture-hail-science), [§8](./severe-desk-radar-hail-tornado.md#8-recommended-build-path), [§9](./severe-desk-radar-hail-tornado.md#9-suggested-technical-seams-when-approved).
- Allowed write scope: decision record only until its Foundation gate passes.
- Acceptance evidence: decision record review; later implementation evidence is
  intentionally not specified until an approved source/architecture exists.
- Coder rule: Implement only cited behavior; every uncited path or solution is a blocker requiring approved authority.

## Verification and closure

- Spec structure: `python3 /Users/jared/.openclaw/workspace/foreman/scripts/validate_spec_contract.py docs/severe-desk-waved-roadmap.md`.
- Wave 0 evidence: live provider documentation review and ratified decision
  record
  ([`severe-desk-provider-contracts.md`](./severe-desk-provider-contracts.md)
  v1.3). Public-safe contract fixtures are **required, not recommended** — the
  42-entry checker passes and completes the second half of T-SD-00. Wave 0 is
  not live meteorological validation in either half.
- Any approved code Wave: behavior-first proof at the declared adapter or map
  consumer seam, `npm run build`, focused relevant checks, desktop/mobile smoke,
  contrast, and `npm test` before the Wave closes.
- User-facing Radar work must be verified against recorded multi-layer fixtures
  and, before release, a user-operated live severe-weather session. Fixture
  proof is not live meteorological validation.
- Stub closure: every scaffold seam is implemented with its cited proof, or is
  explicitly reported as a typed blocked/untrusted state; none is called complete
  merely because it compiles.
