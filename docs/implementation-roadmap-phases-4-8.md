# Implementation Spec: roadmap phases 4–8

## Authority and scope

### Approved goal

Implement the next StormLogic capabilities in dependency order: event-centric
precipitation, the U.S. severe-weather desk connection, forecast confidence,
numeric day explanations, and decision helpers whose evidence is visible to the
user.

### Governing authority

- User direction, 2026-08-10: roadmap phases 4–8.
- `docs/api-and-product-brainstorm.md` §2 Product traits to protect.
- `docs/api-and-product-brainstorm.md` §3.1 Open-Meteo ideas.
- `docs/api-and-product-brainstorm.md` §3.2 RainViewer ideas.
- `docs/api-and-product-brainstorm.md` §3.3 NWS ideas.
- `docs/api-and-product-brainstorm.md` §4.1–§4.5 StormLogic-shaped ideas.
- `docs/api-and-product-brainstorm.md` §6 Constraints to keep in mind.

### Scope

- Event precipitation total so far, expected remaining total, and first dry
  hour, derived from the existing forecast hourly series.
- Alert-to-Radar navigation and active NWS alert polygons on the lazy Radar
  surface.
- A decision-ready ensemble-confidence capability for tomorrow's temperature
  and precipitation after the provider contract and display boundary are
  ratified.
- A selected-day explanation derived only from the day and hourly numbers.
- Decision helpers only after a named user flow and evidence presentation are
  ratified.

### Non-goals

- New paid providers, alerts outside U.S. coverage, medical/safety advice,
  provider calls from Forecast that are not lazy or cached, LLM-written weather
  prose, a generic dashboard, and persistence of new user roles/preferences.

## System progression and dependency map

| Node ID | Node type | Authority refs | Phase | Wave | Provides | Consumes | Hard prerequisites | Closure gate |
|---|---|---|---|---|---|---|---|---|
| CAP-P4-EVENT-PRECIP | Capability | `docs/api-and-product-brainstorm.md#43-event-centric-precip-not-only-calendar-centric`; user roadmap phase 4 | Phase 4 | Wave A | Honest event total/remaining/dry-hour model and Forecast presentation | Existing hourly forecast, `precipTiming` | Existing forecast contract + current-card seam | Pure numeric/boundary proof plus desktop/mobile smoke |
| FEAT-P5-SEVERE-DESK | Feature | `docs/api-and-product-brainstorm.md#32-rainviewer`, `docs/api-and-product-brainstorm.md#33-nws-us-only--already-framed-correctly`, `docs/api-and-product-brainstorm.md#45-alert-intelligence-without-stealing-authority`; user roadmap phase 5 | Phase 5 | Wave A | Alert-to-Radar transition and official active-alert polygon overlay | Alerts provider, Radar Leaflet surface | Active alert normalisation; lazy Radar surface | Alert-to-Radar smoke and Radar polygon lifecycle proof |
| CAP-P7-EXPLAIN-DAY | Capability | `docs/api-and-product-brainstorm.md#44-explain-this-day`; user roadmap phase 7 | Phase 7 | Wave A | Deterministic, numbers-only selected-day explanation | Day summary + selected day hourly series | Existing day object and DayRow expansion seam | Independent literal cases plus expanded-row browser proof |
| CAP-P6-CONFIDENCE | Capability | `docs/api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor`, `docs/api-and-product-brainstorm.md#42-confidence-and-disagreement`; user roadmap phase 6; `docs/confidence-discovery.md` | Phase 6 | Wave B | Honest Tomorrow temperature/precip ensemble spread | NCEP GEFS member contract, cached proxy | User-approved source, surface, wording, and cache | Numeric integrity + proxy + desktop/mobile smoke + contrast |
| FEAT-P8-DECISION-HELPER | Feature | `docs/api-and-product-brainstorm.md#41-decision-modes-should-i`; user roadmap phase 8 | Phase 8 | Blocked | A named commute or outdoor-event decision surface with visible evidence | Forecast/radar/alerts as applicable | Approved first flow, thresholds, and presentation boundary | Consumer-visible evidence and no-network smoke |

Hard `requires` edges override desired delivery order and parallelism. P8 is
intentionally blocked, not scaffolded as fake-success UI, until its product
decision is recorded.

## Traceability matrix

| Authority ref | Behavior / decision | Task ID | Implementation seam | Acceptance evidence | Owner |
|---|---|---|---|---|---|
| `docs/api-and-product-brainstorm.md#43-event-centric-precip-not-only-calendar-centric` | Event total, expected remaining, first dry hour; unavailable when history is insufficient | T-P4 | `src/lib/precipEvent.js`, forecast normalisation, `CurrentCard` | Literal numeric/boundary proof; browser smoke | precip-story lane |
| `docs/api-and-product-brainstorm.md#32-rainviewer` and `docs/api-and-product-brainstorm.md#33-nws-us-only--already-framed-correctly` | Official active NWS polygon on Radar and alert → radar jump | T-P5 | alerts handler/client, `AlertsPanel`, `RadarPanel`, app tab handoff | Handler contract + Radar lifecycle smoke | severe-desk lane |
| `docs/api-and-product-brainstorm.md#44-explain-this-day` | Deterministic explanation from numbers only | T-P7 | `src/lib/dayExplanation.js`, `DayRow` | Literal rule proof + selected-day smoke | explain-day lane |
| `docs/api-and-product-brainstorm.md#42-confidence-and-disagreement`; `docs/confidence-discovery.md` | Numeric middle-80% member range for tomorrow's high and rain | T-P6 | `forecastConfidence`, confidence proxy/client, Tomorrow expanded detail | Numeric integrity, proxy contract, rendered desktop/mobile, contrast | confidence lane |
| `docs/api-and-product-brainstorm.md#41-decision-modes-should-i` | Commute/outdoor-event decision helpers with cited evidence | T-P8 | New named surface, only after approval | Blocked pending decision record | product owner |

## Implementation boundary

### Allowed changes

- T-P4: forecast normalisation only as needed to retain honest event history;
  `src/lib/precipEvent.js`, `CurrentCard`, dedicated behavior tests and smoke
  fixtures.
- T-P5: NWS alert payload preservation/normalisation, `AlertsPanel`,
  `RadarPanel`, app tab transition wiring, dedicated handler/radar/smoke tests.
- T-P7: `src/lib/dayExplanation.js`, `DayRow`, dedicated proof and smoke
  fixture/assertion.
- T-P6: `src/lib/forecastConfidence.js`, the confidence client/proxy,
  `TomorrowConfidence`, Tomorrow `DayRow` integration, behavior tests and
  smoke/contrast fixtures.

### Forbidden changes / non-goals

- No new provider, persistence key, tab, subjective confidence threshold, or
  unapproved natural-language generation for P6/P8.
- No alert paraphrase that appears to supersede the official NWS source.
- No partial precipitation-event total displayed as a complete total.

**No-invention declaration:** Implement only the cited behavior inside this
boundary. A missing execution path, architecture, API, persistence flow,
provider behavior, or product solution is a blocker requiring an approved
authority update, not a coder decision.

## Decision gaps and blockers

- **P8:** The brainstorm names commute and outdoor-event as separate flows but
  does not select the first flow, its decision horizon, thresholds, evidence
  layout, or whether it is a tab or contextual panel. Product-owner choice is
  required before implementation.

## Scaffold inventory

| Seam ID | Authority refs | Crate / file / symbol | Signature / contract | Safe unresolved state | Owner | Completion evidence |
|---|---|---|---|---|---|---|
| SC-P4-EVENT | `docs/api-and-product-brainstorm.md#43-event-centric-precip-not-only-calendar-centric` | `src/lib/precipEvent.js::derivePrecipEvent` | Receives retained hourly history and next hours; returns a complete event model or `null` | Fail-closed `null` suppresses totals; no partial aggregate | precip-story lane | Literal boundary proof + smoke |
| SC-P5-RADAR-JUMP | `docs/api-and-product-brainstorm.md#32-rainviewer` | `App` alert navigation callback | Receives selected official alert geometry/area and opens Radar | Fail-closed: missing geometry opens Radar at selected place only | severe-desk lane | Alert-to-Radar smoke |
| SC-P7-EXPLANATION | `docs/api-and-product-brainstorm.md#44-explain-this-day` | `src/lib/dayExplanation.js::explainDay` | Receives existing selected-day data and returns bounded derived sentence or `null` | Fail-closed `null` renders no prose | explain-day lane | Literal rules + smoke |
| SC-P6-CONFIDENCE | `docs/api-and-product-brainstorm.md#42-confidence-and-disagreement`; `docs/confidence-discovery.md` | `src/lib/forecastConfidence.js::deriveTomorrowConfidence` | Receives NCEP GEFS tomorrow member arrays and date; returns middle-80% high/rain model or `null` | Fail-closed `null` renders explicit unavailable copy | confidence lane | Numeric boundary proof + proxy + smoke |

## Task breakdown and coder handoffs

### T-P4: honest event precipitation

- System node: CAP-P4-EVENT-PRECIP
- Phase / Wave: 4 / A
- Hard prerequisites: existing hourly forecast and `precipTiming` behavior.
- Provides / consumes: complete event model from retained history and next-24h
  hours; consumes current forecast normalisation.
- Closure gate: history-started event shows so-far/remaining/first-dry values;
  an event that runs off retained history suppresses totals; browser smoke proves
  the rendered user story.
- Authority refs: `docs/api-and-product-brainstorm.md#43-event-centric-precip-not-only-calendar-centric`; user roadmap phase 4.
- Allowed write scope: T-P4 scope above only.
- Acceptance evidence: behavior-first test, existing test suite, build, smoke,
  and relevant contrast check.
- Coder rule: Implement only cited behavior; every uncited path or solution is a blocker requiring an approved authority update.

### T-P5: U.S. severe desk connection

- System node: FEAT-P5-SEVERE-DESK
- Phase / Wave: 5 / A
- Hard prerequisites: existing active-alert provider and lazy Radar component.
- Provides / consumes: official geometry transfer from alert list to Radar;
  consumes NWS fields and Leaflet map lifecycle.
- Closure gate: selecting an alert opens Radar with its official active polygon;
  unavailable geometry remains honest and never fabricates a shape.
- Authority refs: `docs/api-and-product-brainstorm.md#32-rainviewer`, `docs/api-and-product-brainstorm.md#33-nws-us-only--already-framed-correctly`, `docs/api-and-product-brainstorm.md#45-alert-intelligence-without-stealing-authority`; user roadmap phase 5.
- Allowed write scope: T-P5 scope above only.
- Acceptance evidence: handler/client proof, rendered alert-to-radar proof, and
  existing Radar lifecycle regression.
- Coder rule: Implement only cited behavior; every uncited path or solution is a blocker requiring an approved authority update.

### T-P7: explain the selected day

- System node: CAP-P7-EXPLAIN-DAY
- Phase / Wave: 7 / A
- Hard prerequisites: existing day summary and `day.hours` selected-day seam.
- Provides / consumes: bounded sentence generated solely from existing day
  numbers; consumes `DayRow` expanded detail.
- Closure gate: browser-expanded day displays a fixture-derived explanation;
  literal cases prove clear, precip, wind, and no-data honesty.
- Authority refs: `docs/api-and-product-brainstorm.md#44-explain-this-day`; user roadmap phase 7.
- Allowed write scope: T-P7 scope above only.
- Acceptance evidence: behavior-first rules and expanded-day smoke.
- Coder rule: Implement only cited behavior; every uncited path or solution is a blocker requiring an approved authority update.

### T-P6: forecast confidence

- System node: CAP-P6-CONFIDENCE
- Phase / Wave: 6 / B
- Hard prerequisites: approved P6 decision record.
- Provides / consumes: a numeric, transparent Tomorrow ensemble-spread range;
  consumes NCEP GEFS member data through a cached production boundary.
- Closure gate: complete 30-member/24-hour data renders the middle-80% high and
  rain ranges only in Tomorrow's expanded detail; incomplete/failed data is
  visibly unavailable.
- Authority refs: `docs/api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor`, `docs/api-and-product-brainstorm.md#42-confidence-and-disagreement`, `docs/confidence-discovery.md`; user roadmap phase 6 and approval.
- Allowed write scope: T-P6 boundary above only.
- Acceptance evidence: numeric integrity, production proxy contract,
  desktop/mobile browser smoke, and contrast.
- Coder rule: Implement only cited behavior; every uncited path or solution is a blocker requiring an approved authority update.

### T-P8: decision-helper product decision discovery

- System node: FEAT-P8-DECISION-HELPER
- Phase / Wave: Phase 8 / Blocked
- Hard prerequisites: product decision gaps above resolved.
- Provides / consumes: a decision record only; consumes the approved roadmap and existing consumer surfaces.
- Closure gate: product owner approves one named flow, evidence, thresholds, and display boundary.
- Authority refs: `docs/api-and-product-brainstorm.md#41-decision-modes-should-i`; user roadmap phase 8.
- Allowed write scope: decision record under `docs/` only.
- Acceptance evidence: explicit approved decision; no code.
- Coder rule: Implement only cited behavior; every uncited path or solution is a blocker requiring an approved authority update.

## Verification and closure

- Spec structure: `python3 /Users/jared/.openclaw/workspace/foreman/scripts/validate_spec_contract.py docs/implementation-roadmap-phases-4-8.md`
- Implementation evidence: behavior-first tests for each lane, `npm run build`,
  `npm run test:smoke`, relevant contrast/radar checks, and then `npm test`.
- Stub closure: every scaffold seam is implemented with its cited proof, or is
  explicitly reported as a typed blocked/untrusted state; none is called
  complete merely because it compiles.
