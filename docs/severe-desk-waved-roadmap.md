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
- `docs/severe-desk-radar-hail-tornado.md` §3 (layer meanings), §4 (surface and
  authority rules), §8 (phases), and §9 (candidate seams).
- `docs/api-and-product-brainstorm.md` §2 (product traits) and §10.3
  (severe desk explicitly deferred pending product approval).
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
| FND-SD-PROVIDER-CONTRACTS | Foundation | docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#9 | Phase 0.5 | 0 | Approved canonical source, scope, cache, freshness, attribution, and unavailable-state contract per layer | Current provider boundaries | Foundation root | Decision record names one canonical source and one fallback/no-data rule for warnings, SPC, LSR, and storm attributes |
| CAP-SD-PROVENANCE | Capability | docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8 | Phase 0 | A | A visible distinction between current model hail code, official alert geometry, and radar reflectivity | Existing Radar and Alerts surfaces | Foundation root | Fixture-backed copy and source labels never call code 96/99 hail tracking or composite reflectivity a tornado/hail product |
| FND-SD-LAYER-REGISTRY | Foundation | docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#9 | Phase 1 | B | A normalised layer-state/time contract and z-order registry | Approved provider contracts; Leaflet Radar surface | FND-SD-PROVIDER-CONTRACTS | No layer can render without source, observed/issued time, freshness state, and explicit unavailable state |
| CAP-SD-OFFICIAL-GEOMETRY | Capability | docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8 | Phase 1 | C | Regional official warning/watch geometry with event filtering | NWS adapter; layer registry | FND-SD-PROVIDER-CONTRACTS, FND-SD-LAYER-REGISTRY | Recorded regional fixtures prove active/cancelled/expired/missing-geometry handling and no fabricated polygon |
| CAP-SD-SPC-OUTLOOK | Capability | docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#8 | Phase 1 | C | Day 1 outlook geometry plus issuance time | Approved SPC adapter; layer registry | FND-SD-PROVIDER-CONTRACTS, FND-SD-LAYER-REGISTRY | Recorded categorical and probabilistic fixtures render source, issuance time, and unavailable state |
| FEAT-SD-OFFICIAL-DESK | Feature | docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8 | Phase 1 | C | Toggleable official geometry and SPC context over existing reflectivity | Official geometry, SPC outlook, layer registry, existing Radar | CAP-SD-OFFICIAL-GEOMETRY, CAP-SD-SPC-OUTLOOK | Browser proof shows source-labelled layers, deterministic z-order, and honest unavailable states at desktop and mobile widths |
| CAP-SD-LSR | Capability | docs/severe-desk-radar-hail-tornado.md#3, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8 | Phase 2 | D | Normalised Local Storm Report points, qualifiers, and report timestamps | Approved IEM LSR adapter | FND-SD-PROVIDER-CONTRACTS | Recorded report fixture preserves phenomenon, qualifier, report time, coordinates, and an empty/unavailable result |
| CAP-SD-STORM-ATTRIBUTES | Capability | docs/severe-desk-radar-hail-tornado.md#3, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8 | Phase 2 | D | Normalised per-volume storm attributes and motion vectors | Approved IEM attributes adapter | FND-SD-PROVIDER-CONTRACTS | Recorded scan fixtures prove timestamp, source volume, and vector-unavailable handling; no persistent track path is claimed |
| FEAT-SD-TRACKING-DESK | Feature | docs/severe-desk-radar-hail-tornado.md#3, docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#8 | Phase 2 | D | Source-labelled LSR and attribute overlays with bounded time coordination | Official desk, LSR, storm attributes, layer registry | FEAT-SD-OFFICIAL-DESK, CAP-SD-LSR, CAP-SD-STORM-ATTRIBUTES | Browser proof demonstrates divergent source clocks, report/estimate/warning legend, and no data invented outside each layer's valid window |
| FND-SD-MESH-DELIVERY | Foundation | docs/severe-desk-radar-hail-tornado.md#54, docs/severe-desk-radar-hail-tornado.md#7, docs/severe-desk-radar-hail-tornado.md#8 | Phase 3 | E | Approved MESH delivery architecture: self-processing pipeline or named host | MRMS data or approved host | FND-SD-PROVIDER-CONTRACTS; explicit architecture approval | Decision record establishes ownership, processor/runtime, cache, latency budget, product units, and failure state |
| FEAT-SD-MESH | Feature | docs/severe-desk-radar-hail-tornado.md#3, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#7 | Phase 3 | E | Timestamped MESH layer and distinct reported-versus-estimated legend | MESH delivery foundation; tracking desk; layer registry | FND-SD-MESH-DELIVERY, FEAT-SD-TRACKING-DESK | Fixture plus rendered proof never labels MESH as observed hail and keeps it separate from LSRs |
| FND-SD-NEXRAD-INTERROGATION | Foundation | docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#54, docs/severe-desk-radar-hail-tornado.md#8 | Phase 4 | F | Approved single-site radar architecture and operator interaction model | Raw Level II/III data or approved service | Explicit architecture and product approval | Decision record defines site selection, product set, processing path, retention, and required expertise copy |
| FEAT-SD-INTERROGATION | Feature | docs/severe-desk-radar-hail-tornado.md#3, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8 | Phase 4 | F | Single-site reflectivity, velocity, CC, and cautious TDS cue | Interrogation foundation; layer registry | FND-SD-NEXRAD-INTERROGATION, FEAT-SD-TRACKING-DESK | Recorded products and browser proof distinguish signatures from confirmation and fail closed on a missing product |
| FND-SD-LIGHTNING-SOURCE | Foundation | docs/severe-desk-radar-hail-tornado.md#56, docs/severe-desk-radar-hail-tornado.md#8 | Phase 5 | G | Approved lightning source and licensing/freshness contract | Provider decision | Explicit source/terms approval | Decision record establishes coverage, strike latency, cost, attribution, and unavailable state |
| FEAT-SD-LIGHTNING | Feature | docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#8 | Phase 5 | G | Optional source-labelled lightning overlay | Lightning foundation; layer registry | FND-SD-LIGHTNING-SOURCE, FEAT-SD-TRACKING-DESK | Rendered proof distinguishes lightning observations from radar and shows source timestamp |

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
| docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#9 | Canonical-provider and operational contract before code | T-SD-00 | `docs/severe-desk-provider-contracts.md`; committed recorded fixtures | Authority review and contract-fixture validation | product/provider lane |
| docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8 | Existing signals retain their actual authority | T-SD-01 | `RadarPanel`, `AlertsPanel`, source/copy tests | Browser and contrast proof of source labels | radar-ux lane |
| docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#9 | Every map layer has source, time, freshness, and safe unavailable state | T-SD-02 | `src/lib/severeDesk/*`, `RadarPanel` composition root | No-network layer-state fixtures and Radar lifecycle smoke | layer-foundation lane |
| docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8 | Official geometry is filtered, source-labelled, and never invented | T-SD-10 / T-SD-11 | approved NWS/SPC proxy clients and layer adapters | Handler contract plus active/cancelled/expired/missing-geometry and issued-time fixtures | official-data lanes |
| docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8 | Official desk renders legitimate independent layers together | T-SD-12 | `RadarPanel`, `src/styles.css`, Radar browser seam | Desktop/mobile layer-stack, controls, unavailable, and contrast proof | radar-composition lane |
| docs/severe-desk-radar-hail-tornado.md#3, docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8 | LSR and attributes preserve their source clocks before map composition | T-SD-20 / T-SD-21 / T-SD-22 | approved IEM adapters and `RadarPanel` time controls | Recorded adapter contracts, divergent-clock fixture, and no-invented-data assertions | tracking lanes |
| docs/severe-desk-radar-hail-tornado.md#3, docs/severe-desk-radar-hail-tornado.md#7, docs/severe-desk-radar-hail-tornado.md#8 | MESH is a processing/hosted-layer decision and is visibly an estimate | T-SD-30 / T-SD-40 / T-SD-50 | approved later delivery paths | Decision records and later product fixtures | later-wave lanes |

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

- **D-SD-01 — canonical sources:** choose the exact NWS regional query model,
  one SPC geometry source, one IEM LSR endpoint, and one IEM attributes endpoint.
  The research inventory lists alternatives; it does not authorize a coder to choose.
- **D-SD-02 — time contract:** approve per-layer source clock, valid window,
  nearest-frame tolerance, stale threshold, and user-facing unavailable copy.
- **D-SD-03 — layer extent and load:** decide viewport versus fixed-region
  queries, maximum geometry/report count, movement debounce, and cache key.
- **D-SD-04 — MESH delivery:** decide self-processing runtime versus a named
  host before Phase 3. The current Netlify functions are not approval for GRIB
  processing or a new always-on service.
- **D-SD-05 — interrogation and lightning:** choose product scope and source
  only after Phase 2 is demonstrably useful. Both remain blocked.

## Scaffold inventory

| Seam ID | Authority refs | Crate / file / symbol | Signature / contract | Safe unresolved state | Owner | Completion evidence |
|---|---|---|---|---|---|---|
| SC-SD-PROVIDER | docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#9 | `docs/severe-desk-provider-contracts.md` | Names one source, request scope, response fixture, cache/freshness, attribution, and fallback for each Wave 1–2 layer | Blocked: no downstream task may start | product/provider lane | Approved decision record and fixtures |
| SC-SD-LAYER | docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#9 | `src/lib/severeDesk/layerState.js` (future) | Source-labelled, timestamped, discriminated ready/unavailable layer state | Fail-closed unavailable state renders a labelled absence, never stale plausible data | layer-foundation lane | Contract fixtures and Radar lifecycle proof |
| SC-SD-WARNINGS | docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8 | approved alert adapter (future) | Normalises only authoritative NWS geometry, event metadata, and temporal status | Fail-closed: no geometry or valid status suppresses the polygon | official-geometry lane | Handler/adapter fixture proof |
| SC-SD-SPC | docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#8 | approved SPC adapter (future) | Normalises outlook geometry with product type and issuance time | Fail-closed unavailable state; no substituted model forecast | spc lane | Adapter fixture proof |
| SC-SD-LSR | docs/severe-desk-radar-hail-tornado.md#3, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8 | approved IEM LSR adapter (future) | Normalises observation type, qualifier, report time, and coordinate | Fail-closed empty/unavailable report layer; no ground-truth claim | reports lane | Recorded IEM-shaped fixture proof |
| SC-SD-ATTR | docs/severe-desk-radar-hail-tornado.md#3, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8 | approved attributes adapter (future) | Normalises a scan-scoped cell attribute and optional motion vector | Fail-closed: no path or vector when the payload cannot prove one | attributes lane | Recorded scan fixture proof |
| SC-SD-TIME | docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8 | layer time coordinator (future) | Resolves selected map time separately per source with declared tolerance | Fail-closed unavailable/out-of-window layer state | tracking-composition lane | Divergent-clock browser fixture |

## Task breakdown and coder handoffs

### T-SD-00: ratify Wave 0 provider contracts

- System node: FND-SD-PROVIDER-CONTRACTS.
- Phase / Wave: 0.5 / 0.
- Hard prerequisites: Foundation root.
- Provides / consumes: provides approved source contracts; consumes only the
  research inventory and live provider documentation.
- Closure gate: D-SD-01 through D-SD-03 are resolved in a reviewed decision
  record with public-safe recorded fixtures.
- Authority refs: docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#9; user private-use clarification.
- Allowed write scope: a new decision record and fixture metadata only.
- Acceptance evidence: source links, a current contract capture per provider,
  and explicit cache/freshness/unavailable rules.
- Coder rule: Implement only cited behavior; every uncited path or solution is a blocker requiring approved authority.

### T-SD-01: retain current-source honesty

- System node: CAP-SD-PROVENANCE.
- Phase / Wave: 0 / A.
- Hard prerequisites: Foundation root.
- Provides / consumes: provides source-accurate current UI copy; consumes only
  existing Radar, Alerts, and weather-code behavior.
- Closure gate: browser and contrast proof establish that a user cannot mistake
  the current hail signal or composite radar for a measured severe product.
- Authority refs: docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8.
- Allowed write scope: `RadarPanel`, `AlertsPanel`, styles, and their existing
  browser/contrast proof only.
- Acceptance evidence: existing `npm run test:smoke`, `npm run test:contrast`,
  and relevant Radar test updates.
- Coder rule: Implement only cited behavior; every uncited path or solution is a blocker requiring approved authority.

### T-SD-02: build the layer foundation

- System node: FND-SD-LAYER-REGISTRY.
- Phase / Wave: 1 / B.
- Hard prerequisites: FND-SD-PROVIDER-CONTRACTS closure.
- Provides / consumes: provides a layer registry and time-state contract;
  consumes approved provider contracts and the existing lazy Radar lifecycle.
- Closure gate: no-network fixtures prove source/time/freshness/unavailable
  states; no provider-specific payload reaches `RadarPanel`.
- Authority refs: docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#9.
- Allowed write scope: new `src/lib/severeDesk/*` domain modules, `RadarPanel`
  composition wiring, and dedicated fixtures/tests.
- Acceptance evidence: contract fixtures, `npm run test:radar`, build, and
  desktop/mobile smoke.
- Coder rule: Implement only cited behavior; every uncited path or solution is a blocker requiring approved authority.

### T-SD-10 / T-SD-11: create independent official-data adapters

- System node: CAP-SD-OFFICIAL-GEOMETRY and CAP-SD-SPC-OUTLOOK.
- Phase / Wave: 1 / C, parallel after Wave B; neither task edits Radar composition.
- Hard prerequisites: FND-SD-PROVIDER-CONTRACTS and FND-SD-LAYER-REGISTRY.
- Provides / consumes: each provides one normalised layer contract and consumes
  only its Wave-0-approved source.
- Closure gate: each adapter passes its recorded contract fixtures, including
  malformed, empty, expired, and upstream-failure states.
- Authority refs: docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8, docs/severe-desk-radar-hail-tornado.md#9.
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
- Authority refs: docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8.
- Allowed write scope: `RadarPanel`, app handoff wiring if necessary, styles,
  and Radar/smoke/contrast tests.
- Acceptance evidence: `npm run test:radar`, `npm run test:smoke`,
  `npm run test:contrast`, and build.
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
- Authority refs: docs/severe-desk-radar-hail-tornado.md#3, docs/severe-desk-radar-hail-tornado.md#41, docs/severe-desk-radar-hail-tornado.md#42, docs/severe-desk-radar-hail-tornado.md#8, docs/severe-desk-radar-hail-tornado.md#9.
- Allowed write scope: each adapter owns its proxy/client/normaliser; only
  T-SD-22 may edit `RadarPanel` and shared map controls.
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
- Authority refs: docs/severe-desk-radar-hail-tornado.md#3, docs/severe-desk-radar-hail-tornado.md#7, docs/severe-desk-radar-hail-tornado.md#8, docs/severe-desk-radar-hail-tornado.md#9.
- Allowed write scope: decision record only until its Foundation gate passes.
- Acceptance evidence: decision record review; later implementation evidence is
  intentionally not specified until an approved source/architecture exists.
- Coder rule: Implement only cited behavior; every uncited path or solution is a blocker requiring approved authority.

## Verification and closure

- Spec structure: `python3 /Users/jared/.openclaw/workspace/foreman/scripts/validate_spec_contract.py docs/severe-desk-waved-roadmap.md`.
- Wave 0 evidence: live provider documentation review plus public-safe recorded
  contract fixtures; it does not establish a live severe-weather deployment.
- Any approved code Wave: behavior-first proof at the declared adapter or map
  consumer seam, `npm run build`, focused relevant checks, desktop/mobile smoke,
  contrast, and `npm test` before the Wave closes.
- User-facing Radar work must be verified against recorded multi-layer fixtures
  and, before release, a user-operated live severe-weather session. Fixture
  proof is not live meteorological validation.
- Stub closure: every scaffold seam is implemented with its cited proof, or is
  explicitly reported as a typed blocked/untrusted state; none is called complete
  merely because it compiles.
