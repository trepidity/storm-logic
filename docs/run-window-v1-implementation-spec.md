# Run windows v1 implementation specification

## Authority and scope

Authority: [`run-window-decision.md`](./run-window-decision.md) §§1, 3–8 and
the 2026-08-11 user approval to proceed. V1 ranks **remaining starts in the
current local day** as least constrained, never safest or ideal.

Resolved v1 decisions: fixed two-hour windows with no duration chooser; a Current-day
Forecast surface; no future-day ranking; heat/cold and wind/gust remain visible
evidence only; every tied worst constraint is shown. Ranking factors are wet
precipitation (tier 3), thunder/hail (tier 3), US AQI (EPA bands 0/1/2/3), UV
(WHO bands 0/1/2/3), and disclosed dewpoint convention (≤55/≤60/≤70/>70 °F,
tiers 0/1/2/3). Starts are the next local hour at or after now; incomplete,
gapped, or non-US-AQI evidence is not ranked.

## System progression and dependency map

| Node ID | Node type | Authority refs | Phase | Wave | Provides | Consumes | Hard prerequisites | Closure gate |
|---|---|---|---|---|---|---|---|---|
| FND-RUN-HOURLY-EVIDENCE | Foundation | docs/run-window-decision.md#3 | Phase 1 | Wave A | hourly forecast fields and time-aligned AQI | forecast and Air provider payloads | approved factor evidence | proxy/client contract proof |
| CAP-RUN-RANKING | Capability | docs/run-window-decision.md#4 | Phase 2 | Wave B | complete or partial ranked windows and tied constraints | normalized hourly evidence | FND-RUN-HOURLY-EVIDENCE | independent boundary fixtures |
| FEAT-RUN-WINDOWS | Feature | docs/run-window-decision.md#8 | Phase 3 | Wave C | visible current-day Run windows surface | ranked window states | CAP-RUN-RANKING | rendered desktop/mobile proof |

## Traceability matrix

| Authority ref | Behavior / decision | Task ID | Implementation seam | Acceptance evidence | Owner |
|---|---|---|---|---|---|
| docs/run-window-decision.md#3.1 | carry hourly dewpoint/UV/weather evidence | T-RUN-01 | `forecastContract` → `api.normalise` | forecast contract plus browser fixture | run-windows lane |
| docs/run-window-decision.md#3.2 | time-aligned U.S. AQI or unranked partial state | T-RUN-01 | `/api/air?hourly=us_aqi` | Air proxy/client contract | run-windows lane |
| docs/run-window-decision.md#4 | max tier, remaining starts, no invented score, tied bindings | T-RUN-02 | `deriveRunWindows` | independent boundary fixture | run-windows lane |
| docs/run-window-decision.md#8 | visible current-day result, no safety copy | T-RUN-03 | `RunWindows` | browser smoke desktop/mobile | run-windows lane |

## Implementation boundary

Allowed: `forecastContract.js`, `api.js`, `usAqi.js`, `air.mjs`,
`runWindows.js`, `RunWindows.jsx`, `App.jsx`, styles, fixtures, and focused
tests. No new provider, key, proxy route, persistence, future-day ranking,
medical/training copy, WBGT estimate, or composite score.

Coders may implement only cited behavior inside this boundary. New execution
paths, provider semantics, persistence flows, or product solutions require an
approved authority update before code changes.

No-invention declaration: any uncited behavior, execution path, provider
semantic, or product solution is a blocker until the authority is amended.

## Decision gaps and blockers

None for V1. D-RUN-05 remains deferred: future-day policy is explicitly out of
scope. The listed dewpoint convention is product copy, not medical authority.

## Scaffold inventory

None.

## Task breakdown and coder handoffs

### Task 1: T-RUN-01 hourly evidence foundation

- System node: FND-RUN-HOURLY-EVIDENCE
- Phase / wave: Phase 1 / Wave A
- Hard prerequisites: approved factor evidence and the existing forecast/Air routes
- Provides / consumes: provides normalized hourly evidence; consumes forecast and Air payloads
- Closure gate: `npm run test:contract` and `npm run test:air` prove exact request and malformed-input behavior
- Authority refs: docs/run-window-decision.md#3.1 and docs/run-window-decision.md#3.2
- Allowed write scope: `src/lib/forecastContract.js`, `src/lib/api.js`, `src/lib/usAqi.js`, `netlify/functions/air.mjs`, and focused fixtures/tests
- Acceptance evidence: hourly fields are contract-locked; hourly AQI request is exact and invalid/misaligned input fails closed
- Coder rule: implement cited authority only; any uncited provider behavior is a blocker.

### Task 2: T-RUN-02 ranking capability

- System node: CAP-RUN-RANKING
- Phase / wave: Phase 2 / Wave B
- Hard prerequisites: FND-RUN-HOURLY-EVIDENCE closure
- Provides / consumes: provides ranked or typed-partial windows; consumes normalized hourly evidence
- Closure gate: `npm run test:run-windows` proves remaining-day, gap, tie, and maximum-tier boundaries
- Authority refs: docs/run-window-decision.md#4 and docs/run-window-decision.md#7
- Allowed write scope: `src/lib/runWindows.js` and `scripts/run-windows-test.mjs`
- Acceptance evidence: no past or partial window is offered; all co-binding maxima remain visible; no composite score exists
- Coder rule: implement cited authority only; any uncited factor, weighting, or ranking solution is a blocker.

### Task 3: T-RUN-03 current-day feature surface

- System node: FEAT-RUN-WINDOWS
- Phase / wave: Phase 3 / Wave C
- Hard prerequisites: CAP-RUN-RANKING closure
- Provides / consumes: provides the current-day visual result; consumes typed ranked-window states
- Closure gate: `npm run test:smoke` proves complete and partial desktop/mobile rendering
- Authority refs: docs/run-window-decision.md#1 and docs/run-window-decision.md#8
- Allowed write scope: `src/components/RunWindows.jsx`, `src/App.jsx`, `src/styles.css`, and browser fixtures/tests
- Acceptance evidence: fixed two-hour span, constraints, daylight property, and explicit unavailable/partial copy are visible without safety, ideal, or best language
- Coder rule: implement cited authority only; any uncited visual state or safety interpretation is a blocker.

## Verification and closure

Run `npm run test:contract`, `npm run test:air`, `npm run test:run-windows`,
`npm run build`, `npm run test:smoke`, `npm run test:contrast`, and
`git diff --check`. A browser fixture must prove complete ranking and the
unranked partial state. The feature is not release-ready until all gates pass.
