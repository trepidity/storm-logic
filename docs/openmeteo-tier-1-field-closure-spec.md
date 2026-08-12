---
title: "Implementation Spec: Open-Meteo Tier 1 field closure"
date: 2026-08-11
version: 1.0
status: Draft — dispatch contract, not approval to implement
owner: Jared
category: adr
tags:
  - open-meteo
  - forecast-contract
  - precipitation-type
  - visibility
  - convective-ingredients
  - sub-hourly
  - units
---

# Implementation Spec: Open-Meteo Tier 1 field closure

## Authority and scope

### Approved goal

Close the set of Open-Meteo forecast fields that are available on endpoints
StormLogic already calls, and that the product has already identified as
wanted, but that the request contract does not carry today.

This is a decomposition and dispatch contract, **not approval to implement any
Task**. Only explicit approval of a named Task ID authorizes code changes.
Tasks T-OM-20 and T-OM-30–33 additionally require amendment of prior locked
authority. T-OM-10, T-OM-11, T-OM-12, and T-OM-14 require new product decisions
before dispatch (see [Decision gaps and blockers](#decision-gaps-and-blockers)).

### Governing authority

- User direction, 2026-08-11: *"What does Open-Meteo provide that we are not
  using?"* followed by *"Fully decompose Tier 1 so that we can close Tier 1
  items."*
- [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor)
  — precip type timeline, dewpoint, visibility/fog narrative, convective
  ingredients, snow depth, and 15-minute precipitation are already recorded as
  wanted, no-new-vendor ideas.
- [`api-and-product-brainstorm.md` §2](./api-and-product-brainstorm.md#2-product-traits-to-protect)
  — trust over severity theater; thin chrome; clear provider boundaries;
  free-tier realism.
- [`api-and-product-brainstorm.md` §10.1](./api-and-product-brainstorm.md#101-air-quality--locked-scale-and-scope)
  — the coverage-gate precedent: outside coverage, explicit message and **no
  upstream call**. Binding pattern for T-OM-30.
- `README.md` "The hail caveat" — the hail signal is categorical, derived from
  WMO 96/99, and is explicitly not an amount or a probability.
- `README.md` "Daily conditions are derived, not reported" — `weather_code` is
  the most *severe* code of the period, not a representative one.
- [`severe-desk-waved-roadmap.md`](./severe-desk-waved-roadmap.md) — governs any
  change to Severe Desk surfaces. Constrains T-OM-20.
- [`run-window-v1-implementation-spec.md`](./run-window-v1-implementation-spec.md)
  and [`run-window-decision.md`](./run-window-decision.md) §§4, 9 — v1 resolved
  hourly starts. Constrains T-OM-30–33.
- [`outdoor-plan-decision.md`](./outdoor-plan-decision.md) — longest dry
  *daylight hour* window. Constrains T-OM-32.
- Current implementation: `src/lib/forecastContract.js`, `src/lib/api.js`,
  `src/lib/format.js`, `scripts/forecast-contract-test.mjs`.

### Scope

- Establish the empirical provider behavior that determines request
  partitioning, before any field is added.
- Add globally-safe hourly and daily fields to the shared forecast contract and
  normalization layer.
- Establish a unit-conversion path for provider fields that `UNIT_PRESETS` does
  not cover.
- Derive and surface precipitation type, winter rain/snow discrimination,
  visibility, cloud layering, and daily dewpoint/probability aggregates.
- Record — but leave visibly blocked — the convective-ingredient and sub-hourly
  work whose authority is owned by other specs.

### Non-goals

- No new provider, endpoint, API key, account, or vendor.
- No new navigation tab or persistence key.
- No model selection (`models=`), ensemble change, historical/normals data, or
  any Tier 2/Tier 3 item. Those are separate authority.
- No LLM-generated prose. Derivations are numeric, as in `dayExplanation.js`.
- No composite severity score, safety language, or hail probability. The hail
  caveat stands unchanged by this spec.
- No change to the daylight-bounded daily cloud mean. See D-OM-05.

---

## Product picture — Tier 1 in plain English

Tier 1 makes the existing Forecast experience more specific without turning it
into a dashboard, a safety adviser, or a new provider integration. It answers
questions that the forecast already contains but currently collapses into a
generic weather code or a single daily number.

### What a person will notice

| Deliverable | In plain English | Where it appears | What it will not claim | Delivery state |
|---|---|---|---|---|
| **Rain, snow, and showers through the day** | The hourly forecast can show whether precipitation is rain, snow, showers, or a transition between them, based on the forecast amounts rather than a broad weather icon. | The existing hourly forecast strip. | It does not turn a model forecast into an observation or invent a type when the measured components are inconclusive. | Planned; we first decide what to show when the forecast says precipitation is possible but reports zero rain, shower, and snow amounts. |
| **Better winter context** | On snowy days, the forecast can show snow on the ground and explain the local freezing-level context in the selected unit system. | Existing forecast-day detail and badges. | It does not make a road-condition claim, a safety recommendation, or a snow forecast from an unratified wet-bulb rule. | Planned; we first decide whether and how to use wet-bulb temperature to describe rain versus snow, and the exact wording for the freezing-level context. |
| **Visibility and fog context** | A user can see poor visibility as evidence for fog-like conditions even when the weather code does not say “fog.” | Existing forecast-day detail and badges. | It does not assert fog from an arbitrary cutoff or override a defined unavailable state. | Planned; we first decide what visibility counts as fog, and what wins if visibility and the weather code disagree. |
| **What kind of cloudy day it is** | The forecast distinguishes clouds overhead at different heights: low gray cloud, mid-level cloud, or high cloud. Two days with the same total cloud percentage no longer have to read the same. | Existing cloud meter and daily explanation. | It does not replace the current daylight-only cloud average with Open-Meteo’s all-day aggregate. | Planned after the shared forecast contract closes. |
| **A more honest daily rain-chance story** | A day that briefly reaches a high rain chance can be described differently from a day with a sustained chance. Daily moisture evidence is retained instead of being discarded. | Existing daily forecast row and its explanation. | It does not replace the current accumulated-precipitation corroboration rule or turn a probability into a promise. | Planned; we first decide the exact difference in wording between a brief chance and a sustained chance. |

### Decisions still needed before those features can be built

These are product choices, not technical cleanup. The technical IDs remain in
the implementation plan; this table states what a person needs to decide.

| Product decision | The plain-language question | Why it matters |
|---|---|---|
| **When forecast amounts disagree with the weather icon** (`D-OM-08`) | If the icon/probability suggests precipitation but rain, showers, and snow amounts are all zero, should the forecast say “possible precipitation,” identify a type from the icon, or stay silent? | Choosing a type without evidence can make rain read as snow, or vice versa. |
| **How to describe winter precipitation** (`D-OM-06`) | Should we use wet-bulb temperature to say a near-freezing hour is more likely rain or snow? If so, what boundary and what “unknown/mixed” wording are acceptable? | This determines whether winter copy is useful evidence or an overconfident claim. |
| **What “fog” means in the product** (`D-OM-07`) | At what visibility should the app call conditions foggy? If the weather code says fog but visibility does not, or the reverse, which evidence should the app trust? | A visible fog badge needs a stable, explainable rule instead of an arbitrary number in code. |
| **How daily rain chance should read** (`D-OM-09`) | What should the forecast say when rain chance peaks briefly versus stays elevated for much of the day? | This determines the user-facing language; the extra aggregate alone is not a feature. |

### Work users will not see directly, but which keeps the feature set honest

| Foundation | Why it exists | User outcome |
|---|---|---|
| **Provider behavior probe** | We first measure which fields are safe across representative locations and how the provider fails. | An optional field cannot silently make the core temperature forecast disappear. |
| **One shared forecast contract** | Browser development and the deployed Netlify function request the same field set and normalize it the same way. | A capability does not work locally but vanish in production. |
| **Metres converted for the selected unit system** | Snow depth, visibility, and freezing-level height are native metres even when the rest of the forecast is Fahrenheit/inches/miles. | No plausible-looking but wrong raw-metre value reaches the screen. |
| **Accurate cloud documentation** | The existing daylight-only cloud average is still correct, but its explanation must no longer claim Open-Meteo has no daily cloud fields at all. | Future maintainers preserve the intentional daylight calculation. |

### Explicitly outside the delivered Tier 1 slice for now

These ideas are recorded because they are attractive, not because this spec
authorizes their implementation. They remain visibly blocked until their
separate product and authority decisions exist.

| Deferred idea | The eventual user value | Why it is not being built now |
|---|---|---|
| **Convective ingredients in Severe Desk** | A severe-weather panel could show model ingredients such as instability and inhibition beside official severe-weather context. | It needs a separate conditional-request design and an explicitly approved Severe Desk Wave. It must never be presented as a hail probability, observation, or storm guarantee. |
| **Native 15-minute precipitation and finer windows** | In supported areas, the Outdoor plan and Run windows could end at a true 15-minute boundary instead of the nearest hour. | It changes the locked hourly time model for two existing decision helpers, and the 15-minute feed omits factors those helpers currently require. |

### The one-sentence product promise

**Tier 1 makes the existing forecast explain what is happening more precisely —
what kind of precipitation, visibility, winter context, cloud structure, and
daily rain pattern — while preserving clear uncertainty and avoiding new safety
or severe-weather claims.**

---

## System progression and dependency map

| Node ID | Node type | Authority refs | Phase | Wave | Provides | Consumes | Hard prerequisites | Closure gate |
|---|---|---|---|---|---|---|---|---|
| FND-OM-PROVIDER-BEHAVIOR | Foundation | [`README.md` §Upstream request contract](../README.md#upstream-request-contract) | Phase 0 | 0 | Measured provider response to unsupported, model-dependent, and region-locked variables | Live Open-Meteo forecast endpoint | Foundation root | A committed results table records, per variable class × 4 coordinates, the HTTP status and whether unsupported fields return null arrays or hard-fail the whole request; D-OM-01 is ratified from it |
| FND-OM-SEAM-DECLARATION | Foundation | [`test-selection` §Required](/Users/jared/.codex/skills/test-selection/SKILL.md#required-per-project-seam-declaration) | Phase 0 | 0 | The repo's declared L0 consumer seam list | Existing test suite | Foundation root | `README.md` names the concrete entry points a test may drive and the artifacts it may assert against; no test task dispatches before it exists |
| FND-OM-CONTRACT | Foundation | [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); [`forecastContract.js`](../src/lib/forecastContract.js#L1) | Phase 1 | A | All globally-safe Tier 1 fields on the wire and in the normalized object | Forecast endpoint; D-OM-01 | FND-OM-PROVIDER-BEHAVIOR, FND-OM-SEAM-DECLARATION | `npm run test:contract` proves both issued URLs carry the new golden lists **and a recorded payload normalizes every added field to its declared key or `null`** |
| FND-OM-UNITS | Foundation | [`api-and-product-brainstorm.md` §2](./api-and-product-brainstorm.md#2-product-traits-to-protect); [`format.js`](../src/lib/format.js#L1) | Phase 1 | A | A unit-aware length/height formatter for metre-denominated provider fields | `UNIT_PRESETS` | FND-OM-SEAM-DECLARATION | A rendered metre value is converted per active unit preset; no metre-denominated field reaches a surface unconverted |
| FND-OM-DOCUMENTATION-ACCURACY | Foundation | [`README.md` §What it shows](../README.md#what-it-shows); [`forecastContract.js`](../src/lib/forecastContract.js#L68) | Phase 0 | 0 | Accurate description of the client-side daylight mean | Existing documentation and contract comments | Foundation root | Committed README and contract-comment correction says Open-Meteo lacks a **daylight-restricted** daily cloud variable; no provider 24-hour aggregate replaces the client derivation |
| CAP-OM-PRECIP-TYPE | Capability | [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); [`README.md` §Daily conditions](../README.md#daily-conditions-are-derived-not-reported) | Phase 2 | B | Hourly precipitation type from measured amounts, not `weather_code` | Normalized hourly rain/showers/snowfall | FND-OM-CONTRACT, **D-OM-08** | An hour whose measured split contradicts its `weather_code` is classified from the measured split; a mixed-type event preserves its transition |
| CAP-OM-WINTER | Capability | [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor) | Phase 2 | B | Approved winter evidence presentation | Normalized wet-bulb, freezing level, snow depth, payload `elevation` | FND-OM-CONTRACT, FND-OM-UNITS, **D-OM-06** | Snow depth and freezing level render in the active unit system; only the approved wet-bulb/snow-line rule is shown |
| CAP-OM-VISIBILITY | Capability | [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor) | Phase 2 | B | Approved threshold-based fog state | Normalized hourly visibility | FND-OM-CONTRACT, FND-OM-UNITS, **D-OM-07** | The ratified visibility threshold produces a fog state with no supporting fog `weather_code`; visibility renders in the active unit system |
| CAP-OM-SKY-LAYERS | Capability | [`api-and-product-brainstorm.md` §2](./api-and-product-brainstorm.md#2-product-traits-to-protect); [`CloudMeter.jsx`](../src/components/CloudMeter.jsx#L1) | Phase 2 | B | Low/mid/high cloud distribution per hour and per day | Normalized layered cloud cover | FND-OM-CONTRACT | Two days at identical total cloud cover but inverted layer distribution do not produce the same description |
| CAP-OM-DAILY-AGGREGATES | Capability | [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); [`daySummary.js`](../src/lib/daySummary.js#L1) | Phase 2 | B | Approved daily dewpoint/probability evidence presentation | Normalized daily aggregates | FND-OM-CONTRACT, **D-OM-09** | The ratified copy rule distinguishes a brief probability spike from a sustained equal-mean probability |
| CAP-OM-CONVECTIVE | Capability | [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); [`README.md` §Hail caveat](../README.md#the-hail-caveat) | Phase 3 | C | CAPE, lifted index, CIN, and daily max updraft as *ingredients* | Conditional forecast request | FND-OM-CONTRACT; **D-OM-02**; severe-desk Wave approval | High CAPE under strong CIN produces no storm signal; no ingredient is presented as a hail amount, probability, or observation |
| FND-OM-SUBHOURLY-AUTHORITY | Foundation | [`run-window-decision.md` §4.3](./run-window-decision.md#43-hourly-resolution-is-not-interpolated); [`run-window-decision.md` §9](./run-window-decision.md#9-v1-implementation-decisions); [`outdoor-plan-decision.md` §Product boundary](./outdoor-plan-decision.md#product-boundary) | Phase 4 | D | Amended authority permitting sub-hourly start granularity | Run-window and outdoor-plan decision records | **D-OM-03** | An amended decision record supersedes the locked hourly-start and hourly-window resolutions and states the sub-hourly presentation rule |
| CAP-OM-SUBHOURLY-EVIDENCE | Capability | [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); [`api-and-product-brainstorm.md` §10.1](./api-and-product-brainstorm.md#101-air-quality--locked-scale-and-scope) | Phase 4 | D | A native 15-minute series where natively available, and an explicit hourly-resolution state elsewhere | `minutely_15` block; coverage predicate | FND-OM-SUBHOURLY-AUTHORITY, FND-OM-CONTRACT | Outside native coverage no `minutely_15` request is issued and the surface reports hourly resolution; interpolated data is never presented as observed sub-hourly detail |
| FEAT-OM-SUBHOURLY-WINDOWS | Feature | [`run-window-decision.md` §8](./run-window-decision.md#8-non-goals); [`outdoor-plan-decision.md` §Product boundary](./outdoor-plan-decision.md#product-boundary) | Phase 4 | D | Run and outdoor windows at native resolution where available | Sub-hourly evidence; existing window derivations | CAP-OM-SUBHOURLY-EVIDENCE | A window boundary falling mid-hour is reported at its true sub-hourly edge; the resolution in use is visible; out-of-coverage locations still produce hourly windows |

Hard prerequisites override desired delivery order. Phase 3 and Phase 4 nodes
are **not dispatchable** until their named decision gaps close, regardless of
Phase 1–2 progress.

---

## Parallelization design

### The collision surface

Every Tier 1 field, taken naively, touches the same three artifacts:
`src/lib/forecastContract.js`, its independent golden lists in
`scripts/forecast-contract-test.mjs`, and `hourEntry()` / `normalise()` in
`src/lib/api.js`. Six lanes editing three shared files is not parallelism; it
is six merge conflicts and a golden list that drifts from the contract it is
supposed to independently verify.

**Design decision:** the shared-file work is deliberately *serialized into a
single foundation task* (T-OM-02), which adds every globally-safe field at
once. Derivation and surface work then fans out across files that do not
overlap.

### Lane assignment and write scope

| Lane | Tasks | Exclusive write scope | Collides with |
|---|---|---|---|
| **probe lane** | T-OM-00 | `scripts/` throwaway probe, `docs/` results table | none |
| **standards lane** | T-OM-01 | `README.md` seam section | none |
| **contract lane** | T-OM-02 | `forecastContract.js`, `forecast-contract-test.mjs`, `api.js` | Every task that needs these files — serialized, but T-OM-03 may run concurrently |
| **units lane** | T-OM-03 | `format.js`, `scripts/format-test.mjs` | none (disjoint from contract lane) |
| **precip-type lane** | T-OM-10 | `precipType.js`, `precipEvent.js`, `HourlyStrip.jsx` | none |
| **badges lane** | T-OM-11, then T-OM-12 | `winterConditions.js` / `visibility.js`, shared `ConditionBadges.jsx` | **T-OM-11 ↔ T-OM-12** — serial |
| **summary lane** | T-OM-13, then T-OM-14 | shared `daySummary.js`, plus `CloudMeter.jsx` / `DayRow.jsx` and task-specific scripts | **T-OM-13 ↔ T-OM-14** — serial |
| **convective lane** | T-OM-20 | `severeDesk/convectiveIngredients.js`, conditional proxy | contract lane |
| **subhourly lane** | T-OM-30–33 | `runWindows.js`, `outdoorPlan.js`, their tests | contract lane |

### Concurrency schedule

```
Phase 0   ├─ T-OM-00 (probe) ───────────────┐
          └─ T-OM-01 (seam declaration) ────┤   both must close
                                            ▼
Phase 1   ├─ T-OM-02 (contract) ────────────┐   shared-file serialization point
          └─ T-OM-03 (units) ───────────────┤   disjoint; may run with T-OM-02
                                            ▼
Phase 2   ├─ T-OM-10  precip type ──────────┐
          ├─ T-OM-11 → T-OM-12 badges ──────┤   three collision-free lanes
          └─ T-OM-13 → T-OM-14 summary ─────┘
                                            ▼
Phase 3   └─ T-OM-20  convective ── BLOCKED on D-OM-02 + severe-desk Wave approval
                                            ▼
Phase 4   └─ T-OM-30…33 sub-hourly ─ BLOCKED on D-OM-03 authority amendment
```

Phase 2 has three concurrent lanes after T-OM-02: T-OM-10, the badges lane,
and the summary lane. The two tasks in each shared-component/shared-derivation
lane are deliberately serial. T-OM-11 and T-OM-12 both consume the T-OM-03
formatter read-only, but they also both modify `ConditionBadges.jsx`; T-OM-13
and T-OM-14 both modify `daySummary.js`. Those collisions are now explicit
rather than hidden behind lane labels.

**Serialization rationale, recorded:** T-OM-02 is a bottleneck by design. The
alternative — each lane appending its own fields to the contract — reintroduces
exactly the dev/prod drift risk that `forecastContract.js` exists to prevent,
and it would let a lane edit the golden list to match code it just wrote,
destroying the independence that makes `test:contract` a real contract test
rather than a tautology.

---

## Traceability matrix

| Authority ref | Behavior / decision | Task ID | Implementation seam | Acceptance evidence | Owner |
|---|---|---|---|---|---|
| [`README.md` §Upstream request contract](../README.md#upstream-request-contract) | Provider failure mode for unsupported variables is measured, not assumed | T-OM-00 | throwaway probe → `docs/` results table | Committed status/response table across 4 coordinates × 3 variable classes | probe lane |
| [`test-selection` §Required](/Users/jared/.codex/skills/test-selection/SKILL.md#required-per-project-seam-declaration) | L0 seams are declared before test work is dispatched | T-OM-01 | `README.md` | A named seam list a reviewer can hold a test against | standards lane |
| [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor) | Globally-safe fields reach both the browser and proxy paths identically | T-OM-02 | `forecastContract.js` → `forecast-contract-test.mjs` → `api.js` | `npm run test:contract` proves both issued URLs and a recorded payload's normalized fields | contract lane |
| [`api-and-product-brainstorm.md` §2](./api-and-product-brainstorm.md#2-product-traits-to-protect) | Metre-denominated provider fields are never rendered raw | T-OM-03 | `format.js` | An imperial `snow_depth` of 0.03 renders as ~1 in, not 0.03 | units lane |
| [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); **D-OM-08** | Precipitation type comes from measured amounts, not the severity code | T-OM-10 | `precipType.js` → `HourlyStrip` | An hour with `snowfall > 0`, `rain = 0`, `weather_code: 63` classifies as snow | precip-type lane |
| [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); **D-OM-06** | Approved rain/snow and snow-line presentation | T-OM-11 | `winterConditions.js` → `ConditionBadges` | The ratified boundary and relative-elevation copy pass their fixtures | badges lane |
| [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); **D-OM-07** | Fog is a ratified visibility threshold, not a code lookup | T-OM-12 | `visibility.js` → `ConditionBadges`, `skyTheme` | The ratified no-fog-code case and unit rendering pass their fixtures | badges lane |
| [`api-and-product-brainstorm.md` §2](./api-and-product-brainstorm.md#2-product-traits-to-protect) | Total cloud cover is decomposed into layers | T-OM-13 | `api.js` layered means (via T-OM-02) → `CloudMeter` | 80 % high cloud and 80 % low cloud produce different descriptions | summary lane |
| [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); **D-OM-09** | Ratified daily probability evidence distinguishes a spike from a sustained chance | T-OM-14 | `daySummary.js` | The decision record's spike-versus-sustained fixture passes | summary lane |
| [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); [`README.md` §Hail caveat](../README.md#the-hail-caveat) | Ingredients are ingredients; CIN suppresses the signal | T-OM-20 | `severeDesk/convectiveIngredients.js` | A named focused fixture command proves CAPE/CIN suppression | convective lane |
| [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); [`api-and-product-brainstorm.md` §10.1](./api-and-product-brainstorm.md#101-air-quality--locked-scale-and-scope) | Native sub-hourly only; interpolation is never sold as observation | T-OM-30 | coverage predicate → proxy contract | A coverage fixture proves no out-of-coverage request | subhourly lane |
| [`run-window-decision.md` §4.3](./run-window-decision.md#43-hourly-resolution-is-not-interpolated); **D-OM-03** | Normalize native 15-minute evidence alongside hourly evidence | T-OM-31 | `api.js` normalized `quarterHours` | A fixture proves source timestamps and explicit nulls | subhourly lane |
| [`run-window-decision.md` §4.3](./run-window-decision.md#43-hourly-resolution-is-not-interpolated); **D-OM-03**, **D-OM-04** | Derive native-resolution windows only after authority is amended | T-OM-32 | `quarterHours` → `runWindows`, `outdoorPlan` | Fixture proves the 06:45 boundary and the null-factor policy | subhourly lane |
| [`run-window-decision.md` §9](./run-window-decision.md#9-v1-implementation-decisions); **D-OM-03**, **D-OM-04** | Display native or hourly resolution honestly | T-OM-33 | window derivations → named consumer surfaces | Browser fixture proves visible resolution and the true boundary | subhourly lane |
| [`README.md` §What it shows](../README.md#what-it-shows) | Correct the inaccurate daily-cloud statement without changing behavior | D-OM-05 | `README.md`, `forecastContract.js` comment | Committed documentation correction retains the daylight-bounded derivation | standards lane |

---

## Implementation boundary

### Allowed changes

- T-OM-00 may add only a throwaway probe script and a results table; it makes
  no product change and its script is deleted on close.
- T-OM-02 may edit `forecastContract.js`, its golden test, and `api.js`
  normalization — and nothing else.
- A Phase 2 task may touch only the files named in its lane row above.
- New derivation modules may be created under `src/lib/`.
- Fixtures and focused test scripts may be added for the behavior under test.

### Forbidden changes / non-goals

- No new provider, endpoint, proxy route, API key, navigation tab, or
  persistence key, except the conditional forecast proxy explicitly authorized
  by D-OM-02.
- No re-deriving a golden list in `forecast-contract-test.mjs` from the module
  under test. Golden lists are edited deliberately, by hand.
- No presentation of CAPE, updraft, or any model field as an observation, a
  hail size, or a probability.
- No presentation of interpolated hourly data as sub-hourly resolution.
- No safety, "ideal", "best", or medical language on any new surface.
- No change to the daylight-bounded cloud mean or to the hail-code rule.

**No-invention declaration:** implement only the cited behavior inside this
boundary. A missing execution path, provider semantic, unit, coverage rule, or
product solution is a blocker requiring an authority amendment — not a coder
judgment call.

---

## Decision gaps and blockers

| ID | Gap | Blocks | Closure requirement |
|---|---|---|---|
| **D-OM-01** | Does an unsupported variable return null arrays or hard-fail the whole request? | T-OM-02 scope; T-OM-20 architecture | Ratified from T-OM-00's measured results table |
| **D-OM-02** | Single request vs. core + conditional request partition | T-OM-20 | Decision record naming the partition, the conditional route (if any), its cache policy, and its independent-failure behavior. **Standing recommendation: core + conditional regardless of D-OM-01**, so that severe-weather fields cannot take down the request that renders the current temperature |
| **D-OM-03** | `run-window-decision.md` §9 resolved **hourly** starts; `outdoor-plan-decision.md` resolved daylight **hour** windows. `outdoorPlan.js:localHourNumber()` rejects any timestamp with `minute !== 0` by design. Sub-hourly windows contradict locked authority | T-OM-30–33 (all of Phase 4) | An amended run-window and outdoor-plan decision record superseding the hourly-start resolution, with an explicit sub-hourly presentation and mixed-resolution rule |
| **D-OM-04** | `runWindows.js:factorsFor()` is an all-or-nothing gate: any null factor drops the hour. The 15-minute series carries no `dew_point_2m`, `uv_index`, or `weather_code`, so a naive swap silently zeroes every run window | T-OM-30–33 | An explicit null-tolerance policy: which factors are required at sub-hourly resolution, which degrade, and what the user is told |
| **D-OM-05** | `README.md` states *"Open-Meteo has no daily cloud variable."* `mean_cloud_cover` / `maximum_cloud_cover` / `minimum_cloud_cover` now exist. The **reasoning remains correct** — the client-side mean is daylight-bounded and the provider's is 24-hour — but the stated fact is wrong | Documentation accuracy only | Correct the claim to "no daylight-restricted daily cloud variable" in `README.md` and `forecastContract.js`. **Do not** substitute the provider variable |
| **D-OM-06** | `api-and-product-brainstorm.md` names snow depth, not a wet-bulb cutoff, snow-line calculation, or user-facing winter copy. Those are product decisions, not a formatter choice | T-OM-11 | Decision record defines whether wet-bulb discrimination is in scope, its exact boundary and mixed/unknown state, the snow-line calculation, and bounded copy relative to payload elevation |
| **D-OM-07** | The brainstorm permits a visibility/fog narrative but names no fog threshold, hysteresis, precedence with WMO fog codes, or unavailable state | T-OM-12 | Decision record states the exact threshold(s), code/visibility precedence, unavailable state, and product copy. The `300 m` fixture becomes valid only if ratified there |
| **D-OM-08** | Measured amounts are authoritative, but no authority selects the fallback when all three components are zero while precipitation probability/code indicates an event | T-OM-10 | Decision record defines the zero-amount fallback, mixed precipitation representation, and unavailable state; it may choose no fallback |
| **D-OM-09** | The brainstorm identifies dewpoint but does not authorize a daily probability aggregate to change `summariseDay` copy or define the spike-versus-sustained rule | T-OM-14 | Decision record defines which daily aggregates surface, the exact copy/threshold rule, and the unavailable state |

D-OM-03 and D-OM-04 were not visible until the existing window code was read
against a sub-hourly time axis. Phase 4 is **not** a field addition; it is a
time-axis change to two features that are already at locked v1.

---

## Scaffold inventory

| Seam ID | Authority refs | Crate / file / symbol | Signature / contract | Safe unresolved state | Owner | Completion evidence |
|---|---|---|---|---|---|---|
| SC-OM-PROBE | [`README.md` §Upstream request contract](../README.md#upstream-request-contract) | `scripts/openmeteo-variable-probe.mjs`; `docs/openmeteo-variable-availability.md` | Probe 4 coordinates × 3 variable classes and record status plus null/absent/error result per field | **Blocked** until live measurements are committed; creates no product behavior | probe lane | Committed results table and deletion of the throwaway script in the same commit |
| SC-OM-SEAMS | [`test-selection` §Required](/Users/jared/.codex/skills/test-selection/SKILL.md#required-per-project-seam-declaration) | `README.md` L0 seam section | Names concrete entry points and consumer-visible artifacts | **Not implemented** until the README section is committed; later test tasks remain blocked | standards lane | Reviewer can classify every task test against a named L0/L1/L2 seam |
| SC-OM-CONTRACT | [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor) | `src/lib/forecastContract.js`; `src/lib/api.js`; `scripts/forecast-contract-test.mjs` | Each approved provider field maps to one normalized key with `null` for omitted payload values | **Fail-closed**: omitted values remain `null`; no synthetic default | contract lane | URL goldens and normalized-payload fixture pass |
| SC-OM-UNITS | [`api-and-product-brainstorm.md` §2](./api-and-product-brainstorm.md#2-product-traits-to-protect) | `src/lib/format.js` length/height formatter | Accepts provider metres and active unit preset; returns labelled display text or unavailable marker | **Fail-closed**: non-finite input renders unavailable, never raw metres | units lane | `node scripts/format-test.mjs` passes |
| SC-OM-PRECIP-TYPE | [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); **D-OM-08** | `src/lib/precipType.js` | Produces a measured precipitation-type state or explicit unavailable state | **Blocked** until D-OM-08 defines the zero-amount fallback | precip-type lane | `node scripts/precip-type-test.mjs` passes |
| SC-OM-WINTER | [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); **D-OM-06** | `src/lib/winterConditions.js` | Produces only ratified winter evidence/copy from normalized inputs | **Blocked** until D-OM-06 defines the product rule | badges lane | `node scripts/winter-conditions-test.mjs` passes |
| SC-OM-VISIBILITY | [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); **D-OM-07** | `src/lib/visibility.js` | Produces only a ratified fog state from visibility and code | **Blocked** until D-OM-07 defines thresholds and precedence | badges lane | `node scripts/visibility-test.mjs` passes |
| SC-OM-CONVECTIVE | [`severe-desk-waved-roadmap.md` §Task breakdown](./severe-desk-waved-roadmap.md#task-breakdown-and-coder-handoffs); **D-OM-02** | `src/lib/severeDesk/convectiveIngredients.js` | Pair CAPE/CIN ingredients without presenting an observation or probability | **Blocked** until the conditional-request decision and named Severe Desk Wave approval exist | convective lane | Named fixture command plus rendered Severe Desk proof pass |
| SC-OM-SUBHOURLY | [`run-window-decision.md` §9](./run-window-decision.md#9-v1-implementation-decisions); **D-OM-03**, **D-OM-04** | `src/lib/api.js` `quarterHours`; `runWindows.js`; `outdoorPlan.js` | Keeps hourly and 15-minute evidence separate and preserves resolution in the consumer state | **Blocked** until authority and null-tolerance policy are ratified | subhourly lane | Task-specific coverage, normalization, window, and browser gates pass |

---

## Task breakdown and coder handoffs

### T-OM-00 — provider behavior probe

- System node: FND-OM-PROVIDER-BEHAVIOR
- Phase / wave: Phase 0 / Wave 0
- Hard prerequisites: none — foundation root
- Provides / consumes: provides the measured basis for D-OM-01 and D-OM-02;
  consumes the live forecast endpoint
- Closure gate: `docs/openmeteo-variable-availability.md` records HTTP status
  and per-field null/absent/error behavior for 4 coordinates (Kansas City,
  London, Nairobi, Sydney) × 3 classes (globally safe, model-dependent,
  region-locked), and D-OM-01 is ratified from it
- Authority refs: [`README.md` §Upstream request contract](../README.md#upstream-request-contract)
- Allowed write scope: `scripts/openmeteo-variable-probe.mjs` (throwaway),
  `docs/openmeteo-variable-availability.md`
- Acceptance evidence: the committed table; the probe script deleted in the
  same commit that records the results
- Test posture: **no test owed.** This is measurement, not product behavior.
- Coder rule: implement only cited measurement behavior; any uncited provider behavior or unprobed coordinate is a blocker requiring authority.

### T-OM-01 — L0 seam declaration

- System node: FND-OM-SEAM-DECLARATION
- Phase / wave: Phase 0 / Wave 0
- Hard prerequisites: none — foundation root
- Provides / consumes: provides the declared seam list every later test task is
  reviewed against
- Closure gate: `README.md` names each L0 seam as a concrete entry point and
  the artifact a test may assert against
- Authority refs: [`test-selection` §Required](/Users/jared/.codex/skills/test-selection/SKILL.md#required-per-project-seam-declaration)
- Allowed write scope: `README.md`
- Proposed seam list (for ratification): the issued upstream URL; the Netlify
  function HTTP response; the normalized forecast object from `api.js`; the
  derived product objects (`summariseDay`, `deriveOutdoorPlan`,
  `deriveRunWindows`, `derivePrecipEvent`, `derivePrecipTiming`); the rendered
  DOM via the Playwright smoke test
- Acceptance evidence: a reviewer can classify any existing test as at, above,
  or below a named seam
- Test posture: **no test owed.** Documentation.
- Coder rule: implement only cited seam declaration; any proposed seam without a consumer is a blocker requiring authority.

### T-OM-02 — contract and normalization foundation

- System node: FND-OM-CONTRACT
- Phase / wave: Phase 1 / Wave A
- Hard prerequisites: FND-OM-PROVIDER-BEHAVIOR (D-OM-01 ratified),
  FND-OM-SEAM-DECLARATION
- Provides / consumes: provides every globally-safe Tier 1 field on the wire
  and in the normalized object; consumes the forecast endpoint
- **Runs alone.** No Phase 1 or Phase 2 task may hold a concurrent edit to
  `forecastContract.js`, `forecast-contract-test.mjs`, or `api.js`.
- Field set — hourly: `rain`, `showers`, `snowfall`,
  `wet_bulb_temperature_2m`, `freezing_level_height`, `snow_depth`,
  `visibility`, `cloud_cover_low`, `cloud_cover_mid`, `cloud_cover_high`
- Field set — daily: `mean_dewpoint_2m`, `maximum_dewpoint_2m`,
  `temperature_2m_mean`, `precipitation_probability_mean`
- Also in scope: generalize `summariseCloudCover()` to accept a variable name
  so the three cloud layers reuse one daylight-bounded averager rather than
  three copies; expose the payload's existing `elevation` on the normalized
  object (returned today, consumed nowhere)
- Closure gate: `npm run test:contract` proves both the browser-direct and
  proxy-upstream URLs carry the new golden lists; every added field is present
  on the normalized hour or day object with `null` where the provider omitted it
- Authority refs: [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); [`forecastContract.js`](../src/lib/forecastContract.js#L1)
- Allowed write scope: `src/lib/forecastContract.js`,
  `scripts/forecast-contract-test.mjs`, `src/lib/api.js`
- Acceptance evidence: contract test green with hand-edited goldens **and a
  recorded-payload normalization fixture**; a recorded payload-size measurement
  before and after, against the proxy's 9 s upstream timeout and 15-minute CDN hold
- Test posture: **L1, earned.** The seam is a wire format crossing to a third
  party, consumed by two independently-built request paths. The golden lists
  are the independent expectation. **Edit the golden lists first, watch
  `test:contract` fail on the missing params, then add the fields** — the
  golden edit is the red for the whole task.
- Coder rule: implement only cited contract behavior; any uncited field, mapping, or derived golden is a blocker requiring authority. Hand-edit goldens and drive normalization through its consumer seam.

### T-OM-03 — unit formatter foundation

- System node: FND-OM-UNITS
- Phase / wave: Phase 1 / Wave A — concurrent with T-OM-02
- Hard prerequisites: FND-OM-SEAM-DECLARATION
- Provides / consumes: provides unit-aware length/height formatting; consumes
  `UNIT_PRESETS`
- **Why this is a foundation, not a detail:** `buildUpstreamForecastParams`
  sets exactly three unit knobs — `temperature_unit`, `wind_speed_unit`,
  `precipitation_unit`. `snow_depth`, `freezing_level_height`, and `visibility`
  are metre-denominated and **bypass the unit system entirely**. A `snow_depth`
  of 0.03 m is ~1.2 in; rendering the raw value is a plausible-looking wrong
  number, which is precisely the failure class this codebase exists to refuse
- Closure gate: `node scripts/format-test.mjs` proves metre→ft, metre→in (depth), and
  metre→mi/km (visibility) conversion under both presets, including a
  sub-inch depth and a >10 km visibility
- Authority refs: [`api-and-product-brainstorm.md` §2](./api-and-product-brainstorm.md#2-product-traits-to-protect)
- Allowed write scope: `src/lib/format.js`, `scripts/format-test.mjs`
- Acceptance evidence: no metre-denominated field can reach a surface without
  passing the formatter; verified by inspection of T-OM-11 and T-OM-12 diffs
- Test posture: **L2, earned — boundary/rounding/precision.** Named category.
  Localization earns it: an L0 failure would say the badge text is wrong, not
  that the conversion is.
- Coder rule: implement only cited formatter behavior; an uncited unit/display rule is a blocker requiring authority. Convert at the formatter, never at the call site.

### T-OM-10 — precipitation type timeline

- System node: CAP-OM-PRECIP-TYPE
- Phase / wave: Phase 2 / Wave B
- Hard prerequisites: FND-OM-CONTRACT, **D-OM-08**
- Provides / consumes: provides hourly precipitation type from measured
  amounts; consumes normalized hourly `rain` / `showers` / `snowfall`
- Rationale: `current` already requests all three components; hourly does not,
  so hourly type is inferred from `weather_code` — the exact inference
  `daySummary.js` was written to distrust at daily altitude. The distrust
  applies identically at hourly altitude
- Fallback rule: selected only by D-OM-08; until then, the zero-amount/code
  combination remains an explicit blocked product rule
- Closure gate: `node scripts/precip-type-test.mjs` proves an hour with
  `snowfall > 0`, `rain = 0`, `weather_code: 63` classifies as snow, and that a
  rain→snow transition inside one event is preserved rather than flattened
- Authority refs: [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); [`README.md` §Daily conditions](../README.md#daily-conditions-are-derived-not-reported); **D-OM-08**
- Allowed write scope: `src/lib/precipType.js`, `src/lib/precipEvent.js`,
  `src/components/HourlyStrip.jsx`, `scripts/precip-type-test.mjs`
- Acceptance evidence: the contradicting-code case and the transition case
- Test posture: **L0.** Seam: the derived product object. Mutation caught:
  reverting to `weather_code` inference.
- Coder rule: implement only cited measured-split behavior and D-OM-08's selected fallback; any uncited confidence heuristic is a blocker requiring authority.

### T-OM-11 — winter conditions

- System node: CAP-OM-WINTER
- Phase / wave: Phase 2 / Wave B
- Hard prerequisites: FND-OM-CONTRACT, FND-OM-UNITS, **D-OM-06**
- Provides / consumes: provides the ratified winter evidence/copy; consumes
  normalized wet-bulb, `freezing_level_height`, `snow_depth`, and payload `elevation`
- Closure gate: `node scripts/winter-conditions-test.mjs` proves D-OM-06's
  boundary, unavailable state, and unit-rendering cases
- Authority refs: [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); **D-OM-06**
- Allowed write scope: `src/lib/winterConditions.js`,
  `src/components/ConditionBadges.jsx`, `scripts/winter-conditions-test.mjs`
- Acceptance evidence: the D-OM-06 boundary/unavailable cases and both unit cases
- Test posture: **L0.** Mutation caught: discriminating on air temperature, or
  rendering a metre value raw.
- Coder rule: implement only cited D-OM-06 winter behavior; any uncited wet-bulb cutoff, snow-line calculation, or copy is a blocker requiring authority.

### T-OM-12 — visibility and fog

- System node: CAP-OM-VISIBILITY
- Phase / wave: Phase 2 / Wave B
- Hard prerequisites: FND-OM-CONTRACT, FND-OM-UNITS, **D-OM-07**
- Provides / consumes: provides a ratified threshold-based fog state; consumes
  normalized hourly `visibility`
- Rationale: `skyTheme()` already returns `'fog'` with a palette behind it,
  driven only by codes 45/48. Visibility converts a categorical guess into a
  measured threshold
- Closure gate: `node scripts/visibility-test.mjs` proves D-OM-07's
  no-fog-code, precedence, unavailable, and unit-rendering cases
- Authority refs: [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); **D-OM-07**
- Allowed write scope: `src/lib/visibility.js`,
  `src/components/ConditionBadges.jsx`, `src/lib/dayExplanation.js`,
  `scripts/visibility-test.mjs`
- Acceptance evidence: D-OM-07's no-fog-code/precedence cases and both unit cases
- Test posture: **L0.** Mutation caught: continuing to derive fog from the code
  alone.
- Coder rule: implement only cited D-OM-07 threshold/precedence; any uncited fog threshold or copy is a blocker requiring authority.

### T-OM-13 — cloud layers

- System node: CAP-OM-SKY-LAYERS
- Phase / wave: Phase 2 / Wave B
- Hard prerequisites: FND-OM-CONTRACT (which delivers the generalized averager)
- Provides / consumes: provides low/mid/high cloud distribution; consumes the
  normalized layered daylight means
- Rationale: 80 % high cirrus and 80 % low stratus are opposite experiences
  reported as one number
- Closure gate: `node scripts/cloud-layers-test.mjs` proves two days at identical total cloud
  cover with inverted layer distribution do not produce the same description
- Authority refs: [`api-and-product-brainstorm.md` §2](./api-and-product-brainstorm.md#2-product-traits-to-protect); [`CloudMeter.jsx`](../src/components/CloudMeter.jsx#L1)
- Allowed write scope: `src/components/CloudMeter.jsx`,
  `src/lib/daySummary.js` cloud fallback path, `scripts/cloud-layers-test.mjs`
- Acceptance evidence: the inverted-distribution case
- Test posture: **L0.** Mutation caught: the generalized averager silently
  reading the wrong series — a real risk once one function has four callers.
- Coder rule: implement only cited layered-cloud behavior; any uncited cloud-copy or fallback change is a blocker requiring authority. Do not change daylight-bounded windowing.

### T-OM-14 — daily aggregates

- System node: CAP-OM-DAILY-AGGREGATES
- Phase / wave: Phase 2 / Wave B
- Hard prerequisites: FND-OM-CONTRACT, **D-OM-09**
- Provides / consumes: provides the daily aggregates ratified by D-OM-09; consumes
  the normalized daily aggregates
- Rationale: `precipitation_probability_max` is the only daily probability
  carried today, so a day peaking at 60 % for one hour and a day sitting at
  55 % all afternoon read identically. Hourly dewpoint is fetched and then
  discarded at day level while `runWindows` reasons in dewpoint tiers
- Closure gate: `node scripts/daily-aggregates-test.mjs` proves D-OM-09's
  spike-versus-sustained behavior
- Authority refs: [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); [`daySummary.js`](../src/lib/daySummary.js#L1); **D-OM-09**
- Allowed write scope: `src/lib/daySummary.js`, `src/components/DayRow.jsx`,
  `scripts/daily-aggregates-test.mjs`
- Acceptance evidence: the D-OM-09 spike-versus-sustained and unavailable cases
- Test posture: **L0.** Mutation caught: continuing to describe both days from
  the max alone.
- Coder rule: implement only cited D-OM-09 aggregate/copy behavior; an uncited threshold or replacement of existing corroboration is a blocker requiring authority.

### T-OM-20 — convective ingredients — **BLOCKED**

- System node: CAP-OM-CONVECTIVE
- Phase / wave: Phase 3 / Wave C
- Hard prerequisites: FND-OM-CONTRACT; **D-OM-02 ratified**; explicit
  severe-desk Wave approval per `severe-desk-waved-roadmap.md`
- Provides / consumes: provides CAPE, lifted index, CIN, and daily maximum
  updraft as ingredients; consumes the conditional forecast request
- Rationale: the entire Open-Meteo severe signal today is `hasHail()` → WMO
  96/99, which `README.md` correctly calls categorical and not an amount or a
  probability. These are actual ingredients
- **Integrity rule, binding:** CAPE alone is not a storm forecast. High CAPE
  under strong CIN is capped and quiet. A bare CAPE number presented as a
  severe signal is exactly the severity theater brainstorm §2.1 protects
  against. Pair with CIN or do not ship
- Surface: the Severe Desk panel. **Not** the current card, not the forecast
  list
- Closure gate: `node scripts/convective-ingredients-test.mjs && npm run test:smoke`
  proves the approved CAPE/CIN fixtures and rendered labels
- Authority refs: [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); [`README.md` §Hail caveat](../README.md#the-hail-caveat); [`severe-desk-waved-roadmap.md` §Task breakdown](./severe-desk-waved-roadmap.md#task-breakdown-and-coder-handoffs)
- Allowed write scope: `src/lib/severeDesk/convectiveIngredients.js`, the
  conditional proxy authorized by D-OM-02, Severe Desk panel,
  `scripts/convective-ingredients-test.mjs`, focused fixtures
- Acceptance evidence: 3000 J/kg CAPE with the D-OM-02-approved strong-CIN
  value produces no storm signal; the approved low-CIN pair does; the rendered
  panel never labels a model ingredient an observation, hail size, or probability
- Test posture: **L0.** The CAPE/CIN pair is the whole behavior and the most
  likely mutation to ship.
- Coder rule: implement only cited behavior after D-OM-02 and the named Severe Desk Wave are approved; every uncited field, threshold, proxy behavior, or surface path is a blocker requiring authority.

### T-OM-30 — sub-hourly coverage and conditional contract — **BLOCKED**

- System node: CAP-OM-SUBHOURLY-EVIDENCE
- Phase / wave: Phase 4 / Wave D
- Hard prerequisites: FND-OM-CONTRACT, **D-OM-03**
- Provides / consumes: provides a ratified native-coverage predicate and a
  conditional request contract; consumes location and the forecast contract
- Closure gate: `node scripts/subhourly-coverage-test.mjs` proves an
  out-of-coverage location causes no `minutely_15` upstream request and
  reports hourly resolution
- Authority refs: [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); [`api-and-product-brainstorm.md` §10.1](./api-and-product-brainstorm.md#101-air-quality--locked-scale-and-scope); **D-OM-03**
- Allowed write scope: coverage predicate, conditional forecast contract/proxy
  authorized by D-OM-03, `scripts/subhourly-coverage-test.mjs`
- Acceptance evidence: committed coverage fixture covers native and
  out-of-coverage locations, including the absence of an upstream request
- Coder rule: implement only cited native-coverage behavior after D-OM-03; any uncited region, model, request, or fallback is a blocker requiring authority.

### T-OM-31 — normalize parallel sub-hourly evidence — **BLOCKED**

- System node: CAP-OM-SUBHOURLY-EVIDENCE
- Phase / wave: Phase 4 / Wave D
- Hard prerequisites: T-OM-30
- Provides / consumes: provides a normalized 15-minute series alongside, never
  instead of, hourly `hours`; consumes the approved conditional payload
- Closure gate: `node scripts/subhourly-normalization-test.mjs` proves native
  entries retain source timestamps and omitted fields remain `null`
- Authority refs: [`run-window-decision.md` §4.3](./run-window-decision.md#43-hourly-resolution-is-not-interpolated); **D-OM-03**
- Allowed write scope: `src/lib/api.js`, `scripts/subhourly-normalization-test.mjs`
- Acceptance evidence: committed native-coverage fixture proves `quarterHours`
  exists beside unchanged hourly evidence and missing fields are explicit
- Coder rule: implement only cited parallel-series contract after D-OM-03; replacement of hourly evidence or an uncited normalized value is a blocker requiring authority.

### T-OM-32 — sub-hourly window time axis — **BLOCKED**

- System node: FEAT-OM-SUBHOURLY-WINDOWS
- Phase / wave: Phase 4 / Wave D
- Hard prerequisites: T-OM-31, **D-OM-04**
- Provides / consumes: provides ratified sub-hourly window derivations;
  consumes parallel evidence and D-OM-04's factor policy
- Closure gate: `node scripts/subhourly-window-test.mjs` proves dry
  06:00–06:45 then wet 07:00 ends at 06:45, and D-OM-04's missing-factor state
  cannot fabricate a run window
- Authority refs: [`run-window-decision.md` §4.3](./run-window-decision.md#43-hourly-resolution-is-not-interpolated); [`outdoor-plan-decision.md` §Product boundary](./outdoor-plan-decision.md#product-boundary); **D-OM-03**, **D-OM-04**
- Allowed write scope: `src/lib/runWindows.js`, `src/lib/outdoorPlan.js`,
  `scripts/subhourly-window-test.mjs`
- Acceptance evidence: committed fixture proves the true boundary and explicit
  null-policy outcome for both consumer derivations
- Coder rule: implement only cited amended time axis and D-OM-04 policy; an uncited interpolation, factor default, or time rule is a blocker requiring authority.

### T-OM-33 — resolution-aware window surfaces — **BLOCKED**

- System node: FEAT-OM-SUBHOURLY-WINDOWS
- Phase / wave: Phase 4 / Wave D
- Hard prerequisites: T-OM-32
- Provides / consumes: presents native sub-hourly windows where available and
  explicit hourly resolution elsewhere; consumes the two derivations
- Closure gate: `node scripts/subhourly-surface-test.mjs && npm run test:smoke`
  proves visible resolution and the 06:45 boundary in native coverage
- Authority refs: [`run-window-decision.md` §9](./run-window-decision.md#9-v1-implementation-decisions); [`outdoor-plan-decision.md` §Product boundary](./outdoor-plan-decision.md#product-boundary); **D-OM-03**, **D-OM-04**
- Allowed write scope: only the named Run windows and Outdoor plan consumer
  components, `scripts/subhourly-surface-test.mjs`, and their focused fixtures
- Acceptance evidence: rendered native and out-of-coverage fixtures show the
  active resolution; hourly locations retain hourly windows
- Coder rule: implement only cited resolution-aware presentation after amended authority; any uncited surface, wording, or resolution claim is a blocker requiring authority.

### D-OM-05 — correct daily-cloud documentation

- System node: FND-OM-DOCUMENTATION-ACCURACY
- Phase / wave: Phase 0 / Wave 0
- Hard prerequisites: Foundation root
- Provides / consumes: provides accurate documentation of the existing
  daylight-bounded cloud derivation; consumes current README and contract comment
- Closure gate: committed `README.md` and `forecastContract.js` comment say
  Open-Meteo lacks a **daylight-restricted** daily cloud variable
- Authority refs: [`README.md` §What it shows](../README.md#what-it-shows); [`forecastContract.js`](../src/lib/forecastContract.js#L68)
- Allowed write scope: `README.md`, `src/lib/forecastContract.js` comment only
- Acceptance evidence: review of the committed text confirms no provider daily
  cloud aggregate was substituted for the client-side daylight derivation
- Coder rule: implement only cited documentation correction; any behavioral or provider-contract change is a blocker requiring authority.

---

## Action board

Status values: `blocked` · `ready` · `in progress` · `closed`.
A task moves to `ready` only when every hard prerequisite is `closed`.

| Task | Node | Phase | Lane | Prereqs | Status | Closure gate |
|---|---|---|---|---|---|---|
| **T-OM-00** probe | FND-OM-PROVIDER-BEHAVIOR | 0 | probe | — | `ready` | results table committed; D-OM-01 ratified |
| **T-OM-01** seam declaration | FND-OM-SEAM-DECLARATION | 0 | standards | — | `ready` | committed `README.md` seam list |
| **T-OM-02** contract | FND-OM-CONTRACT | 1 | contract | T-OM-00, T-OM-01 | `blocked` | `npm run test:contract` |
| **T-OM-03** units | FND-OM-UNITS | 1 | units | T-OM-01 | `blocked` | `node scripts/format-test.mjs` |
| **T-OM-10** precip type | CAP-OM-PRECIP-TYPE | 2 | precip-type | T-OM-02, **D-OM-08** | `blocked` | `node scripts/precip-type-test.mjs` |
| **T-OM-11** winter | CAP-OM-WINTER | 2 | badges | T-OM-02, T-OM-03, **D-OM-06** | `blocked` | `node scripts/winter-conditions-test.mjs` |
| **T-OM-12** visibility | CAP-OM-VISIBILITY | 2 | badges | T-OM-02, T-OM-03, T-OM-11, **D-OM-07** | `blocked` | `node scripts/visibility-test.mjs` |
| **T-OM-13** cloud layers | CAP-OM-SKY-LAYERS | 2 | summary | T-OM-02 | `blocked` | `node scripts/cloud-layers-test.mjs` |
| **T-OM-14** daily aggregates | CAP-OM-DAILY-AGGREGATES | 2 | summary | T-OM-02, T-OM-13, **D-OM-09** | `blocked` | `node scripts/daily-aggregates-test.mjs` |
| **T-OM-20** convective | CAP-OM-CONVECTIVE | 3 | convective | T-OM-02, **D-OM-02**, severe-desk Wave approval | `blocked` | `node scripts/convective-ingredients-test.mjs && npm run test:smoke` |
| **T-OM-30** coverage + contract | CAP-OM-SUBHOURLY-EVIDENCE | 4 | subhourly | **D-OM-03**, T-OM-02 | `blocked` | `node scripts/subhourly-coverage-test.mjs` |
| **T-OM-31** sub-hourly normalize | CAP-OM-SUBHOURLY-EVIDENCE | 4 | subhourly | T-OM-30 | `blocked` | `node scripts/subhourly-normalization-test.mjs` |
| **T-OM-32** window time axis | FEAT-OM-SUBHOURLY-WINDOWS | 4 | subhourly | T-OM-31, **D-OM-04** | `blocked` | `node scripts/subhourly-window-test.mjs` |
| **T-OM-33** window surfaces | FEAT-OM-SUBHOURLY-WINDOWS | 4 | subhourly | T-OM-32 | `blocked` | `node scripts/subhourly-surface-test.mjs && npm run test:smoke` |
| **D-OM-05** README correction | FND-OM-DOCUMENTATION-ACCURACY | 0 | standards | — | `ready` | committed documentation correction |

**Conceptually ready after explicit named-task approval: T-OM-00, T-OM-01,
D-OM-05.** The remaining twelve tasks are correctly blocked by named provider,
decision, or upstream-task gates. This is a dependency state, not a scheduling
problem to route around.

---

## Success criteria

### Per-task

Each task's closure gate above is its definition of done. A task is not closed
until its gate command passes **and** its acceptance evidence exists as a
committed artifact.

### Tier-level

Tier 1 is closed when all of the following hold:

1. **Contract parity.** `npm run test:contract` proves the browser-direct and
   proxy-upstream URLs carry identical golden field lists, differing only in
   the deliberate coordinate precision (4 dp dev / 2 dp CDN).
2. **No unconverted units.** No metre-denominated provider field reaches any
   surface without passing the T-OM-03 formatter. Verified by diff inspection,
   recorded in the closing commit.
3. **No inferred precipitation type.** `weather_code` is consulted for
   precipitation type only when every measured amount is zero. Proven by the
   contradicting-code fixture.
4. **No unavailable state regressions.** Every new field's absence produces the
   existing explicit unavailable state, never a fabricated or partial value.
   The `sumPrecipLast24h` fail-closed posture is the standard.
5. **No severity theater.** No new surface presents a model field as an
   observation, a probability, or a hail amount. The `README.md` hail caveat is
   unchanged and still accurate.
6. **Payload within budget.** Measured forecast response size is recorded before
   and after, and the proxy's 9 s upstream timeout and 15-minute CDN hold remain
   adequate. If not, `forecast_hours` / `past_hours` trim per-field windows —
   CAPE at day 9 is noise regardless.
7. **Suite green.** `npm test` passes end to end, including `build`, `smoke`,
   `contrast`, and `persistence`.
8. **Blocked work still visibly blocked.** T-OM-20 and T-OM-30–33 remain
   blocked, with D-OM-02, D-OM-03, and D-OM-04 open and named. Tier 1 closure
   does **not** silently absorb them.

### Explicitly not a success criterion

- Number of fields added. Three fields that change a description honestly beat
  ten that widen a payload.
- Test count. Per `test-selection`, a test earns its place only if a plausible
  product bug would make it fail.

---

## Verification and closure

Per task: run the task's named gate command, plus `npm run build` and
`git diff --check`.

At Tier close, run the full suite:

```bash
npm test
```

which chains `test:summary`, `test:contract`, `test:run-windows`,
`test:reverse`, `test:precip`, `test:precip-event`, `test:timing`,
`test:explain`, `test:outdoor-plan`, `test:alerts`, `test:aqi`, `test:air`,
`test:confidence`, `test:confidence-data`, the severe-desk suites, `build`,
`test:smoke`, `test:contrast`, `test:persistence`, and `test:radar`. Tier close
also runs the named direct task gates from the action board; they are not added
to `package.json` merely to make unrelated lanes edit the same script.

A rendered browser proof is required for any task touching a component
(T-OM-11, T-OM-12, T-OM-13, T-OM-14). Tier 1 is not release-ready until every
gate above passes and success criteria 1–8 are demonstrably met.

---

## Document history

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-08-11 | Initial decomposition. Records D-OM-03 and D-OM-04 as newly-discovered blockers: sub-hourly windows contradict locked run-window and outdoor-plan v1 authority, and `factorsFor`'s all-or-nothing gate silently voids run windows under a sub-hourly series |
