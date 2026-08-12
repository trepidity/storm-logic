---
title: "Implementation Spec: Open-Meteo Tier 1 field closure"
date: 2026-08-12
version: 1.2
status: Draft — dispatch contract, not approval to implement
owner: Jared
category: adr
tags:
  - open-meteo
  - forecast-contract
  - precipitation-type
  - visibility
  - convective-ingredients
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
T-OM-20 additionally requires an approved Severe Desk Wave. T-OM-11 remains
blocked on the unresolved winter rule D-OM-06; all other Tier 1 forecast-copy
rules are recorded in [`api-and-product-brainstorm.md` §10.3](./api-and-product-brainstorm.md#103-tier-1-forecast-language-decisions--locked-2026-08-12).

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
- [`api-and-product-brainstorm.md` §10.3](./api-and-product-brainstorm.md#103-tier-1-forecast-language-decisions--locked-2026-08-12)
  — binding Tier 1 rules for hourly resolution, visibility terminology,
  zero-amount precipitation fallback, and daily precipitation language.
- `README.md` "The hail caveat" — the hail signal is categorical, derived from
  WMO 96/99, and is explicitly not an amount or a probability.
- `README.md` "Daily conditions are derived, not reported" — `weather_code` is
  the most *severe* code of the period, not a representative one.
- [`severe-desk-waved-roadmap.md`](./severe-desk-waved-roadmap.md) — governs any
  change to Severe Desk surfaces. Constrains T-OM-20.
- [`outdoor-plan-decision.md`](./outdoor-plan-decision.md) — longest dry
  *daylight hour* window. Its hourly resolution remains unchanged.
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
- Record — but leave visibly blocked — convective-ingredient work whose
  authority is owned by the Severe Desk roadmap.

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
| **Rain, snow, and showers through the day** | The hourly forecast can show whether precipitation is rain, snow, showers, or a transition between them, based on the forecast amounts rather than a broad weather icon. When an amount is zero but forecast evidence still signals precipitation, it uses qualified, useful “possible” copy. | The existing hourly forecast strip. | It does not turn a model forecast into an observation or turn an unavailable amount into zero. | Planned after the shared forecast contract closes. |
| **Better winter context** | On snowy days, the forecast can show snow on the ground and explain the local freezing-level context in the selected unit system. | Existing forecast-day detail and badges. | It does not make a road-condition claim, a safety recommendation, or a snow forecast from an unratified wet-bulb rule. | Planned; we first decide whether and how to use wet-bulb temperature to describe rain versus snow, and the exact wording for the freezing-level context. |
| **Visibility and fog context** | Fog and rime fog use their WMO names; dense fog is reserved for a fog-code hour at 400 m / one-quarter mile or less. Other low-visibility conditions are described without falsely calling them fog. | Existing forecast-day detail and badges. | It does not infer fog or mist from a raw visibility distance. | Planned after the shared forecast contract and unit formatter close. |
| **What kind of cloudy day it is** | The forecast distinguishes clouds overhead at different heights: low gray cloud, mid-level cloud, or high cloud. Two days with the same total cloud percentage no longer have to read the same. | Existing cloud meter and daily explanation. | It does not replace the current daylight-only cloud average with Open-Meteo’s all-day aggregate. | Planned after the shared forecast contract closes. |
| **A more honest daily rain-chance story** | A corroborated chance of 40% or more reads “likely,” “likely much of the day,” “likely at times,” or a local-daypart phrase such as “likely in the afternoon,” according to complete forecast evidence. | Existing daily forecast row and its explanation. | It does not replace the current accumulated-precipitation corroboration rule or turn a probability into a promise. | Planned after the shared forecast contract closes. |

### Decision still needed before those features can be built

These are product choices, not technical cleanup. The technical IDs remain in
the implementation plan; this table states what a person needs to decide.

| Product decision | The plain-language question | Why it matters |
|---|---|---|
| **How to describe winter precipitation** (`D-OM-06`) | Should we use wet-bulb temperature to say a near-freezing hour is more likely rain or snow? If so, what boundary and what “unknown/mixed” wording are acceptable? | This determines whether winter copy is useful evidence or an overconfident claim. |

### Work users will not see directly, but which keeps the feature set honest

| Foundation | Why it exists | User outcome |
|---|---|---|
| **Provider behavior probe** | We first measure which fields are safe across representative locations and how the provider fails. | An optional field cannot silently make the core temperature forecast disappear. |
| **One shared forecast contract** | Browser development and the deployed Netlify function request the same field set and normalize it the same way. | A capability does not work locally but vanish in production. |
| **Metres converted for the selected unit system** | Snow depth, visibility, and freezing-level height are native metres even when the rest of the forecast is Fahrenheit/inches/miles. | No plausible-looking but wrong raw-metre value reaches the screen. |
| **Accurate cloud documentation** | The existing daylight-only cloud average is still correct, but its explanation must no longer claim Open-Meteo has no daily cloud fields at all. | Future maintainers preserve the intentional daylight calculation. |

### Explicitly outside the delivered Tier 1 slice for now

These ideas are recorded because they are attractive, not because this spec
authorizes their implementation. Their disposition is explicit: convective
work remains blocked behind separate authority; sub-hourly Outdoor-plan work is
rejected for Tier 1.

| Deferred idea | The eventual user value | Why it is not being built now |
|---|---|---|
| **Convective ingredients in Severe Desk** | A severe-weather panel could show model ingredients such as instability and inhibition beside official severe-weather context. | It needs a separate conditional-request design and an explicitly approved Severe Desk Wave. It must never be presented as a hail probability, observation, or storm guarantee. |
| **Native 15-minute precipitation and finer Outdoor-plan windows** | Native data could show a dry-window edge between two hours. | Rejected for Tier 1: Outdoor-plan windows are never smaller than one hour. |

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
| CAP-OM-PRECIP-TYPE | Capability | [`api-and-product-brainstorm.md` §10.3](./api-and-product-brainstorm.md#103-tier-1-forecast-language-decisions--locked-2026-08-12); [`README.md` §Daily conditions](../README.md#daily-conditions-are-derived-not-reported) | Phase 2 | B | Hourly precipitation type from measured amounts, with qualified WMO fallback only when all measured amounts are zero | Normalized hourly rain/showers/snowfall; WMO code; probability | FND-OM-CONTRACT | An hour whose measured split contradicts its `weather_code` is classified from the measured split; a zero-amount WMO event uses the ratified qualified fallback |
| CAP-OM-WINTER | Capability | [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor) | Phase 2 | B | Approved winter evidence presentation | Normalized wet-bulb, freezing level, snow depth, payload `elevation` | FND-OM-CONTRACT, FND-OM-UNITS, **D-OM-06** | Snow depth and freezing level render in the active unit system; only the approved wet-bulb/snow-line rule is shown |
| CAP-OM-VISIBILITY | Capability | [`api-and-product-brainstorm.md` §10.3](./api-and-product-brainstorm.md#103-tier-1-forecast-language-decisions--locked-2026-08-12) | Phase 2 | B | WMO-named fog/rime-fog state with a dense-fog qualifier and evidence-only low-visibility fallback | Normalized hourly visibility; WMO code | FND-OM-CONTRACT, FND-OM-UNITS | A fog-code hour at 400 m renders dense fog; a non-fog-code hour with the same visibility does not render fog; visibility renders in the active unit system |
| CAP-OM-SKY-LAYERS | Capability | [`api-and-product-brainstorm.md` §2](./api-and-product-brainstorm.md#2-product-traits-to-protect); [`CloudMeter.jsx`](../src/components/CloudMeter.jsx#L1) | Phase 2 | B | Low/mid/high cloud distribution per hour and per day | Normalized layered cloud cover | FND-OM-CONTRACT | Two days at identical total cloud cover but inverted layer distribution do not produce the same description |
| CAP-OM-DAILY-AGGREGATES | Capability | [`api-and-product-brainstorm.md` §10.3](./api-and-product-brainstorm.md#103-tier-1-forecast-language-decisions--locked-2026-08-12); [`daySummary.js`](../src/lib/daySummary.js#L1) | Phase 2 | B | Daily dewpoint/probability evidence with duration and local-daypart language | Normalized daily mean/max aggregates and complete hourly evidence | FND-OM-CONTRACT | A corroborated 40%+ day renders `likely much of the day` at 40%+ mean, a daypart qualifier when confined, and `likely at times` when it crosses dayparts |
| CAP-OM-CONVECTIVE | Capability | [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); [`README.md` §Hail caveat](../README.md#the-hail-caveat) | Phase 3 | C | CAPE, lifted index, CIN, and daily max updraft as *ingredients* | Conditional forecast request | FND-OM-CONTRACT; **D-OM-02**; severe-desk Wave approval | High CAPE under strong CIN produces no storm signal; no ingredient is presented as a hail amount, probability, or observation |

Hard prerequisites override desired delivery order. Phase 3 is **not
dispatchable** until its named decision gap and Severe Desk Wave approval close,
regardless of Phase 1–2 progress.

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
| **badges lane** | T-OM-12, then T-OM-11 | `visibility.js` / `winterConditions.js`, shared `ConditionBadges.jsx` | **T-OM-12 ↔ T-OM-11** — serial; visibility runs first because its product rule is ratified |
| **summary lane** | T-OM-13, then T-OM-14 | shared `daySummary.js`, plus `CloudMeter.jsx` / `DayRow.jsx` and task-specific scripts | **T-OM-13 ↔ T-OM-14** — serial |
| **convective lane** | T-OM-20 | `severeDesk/convectiveIngredients.js`, conditional proxy | contract lane |

### Concurrency schedule

```
Phase 0   ├─ T-OM-00 (probe) ───────────────┐
          └─ T-OM-01 (seam declaration) ────┤   both must close
                                            ▼
Phase 1   ├─ T-OM-02 (contract) ────────────┐   shared-file serialization point
          └─ T-OM-03 (units) ───────────────┤   disjoint; may run with T-OM-02
                                            ▼
Phase 2   ├─ T-OM-10  precip type ──────────┐
          ├─ T-OM-12 → T-OM-11 badges ──────┤   three collision-free lanes
          └─ T-OM-13 → T-OM-14 summary ─────┘
                                            ▼
Phase 3   └─ T-OM-20  convective ── BLOCKED on D-OM-02 + severe-desk Wave approval
```

Phase 2 has three concurrent lanes after T-OM-02: T-OM-10, the badges lane,
and the summary lane. The two tasks in each shared-component/shared-derivation
lane are deliberately serial. T-OM-12 and T-OM-11 both consume the T-OM-03
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
| [`api-and-product-brainstorm.md` §10.3](./api-and-product-brainstorm.md#103-tier-1-forecast-language-decisions--locked-2026-08-12) | Precipitation type comes from measured amounts; an all-zero event uses qualified WMO fallback copy | T-OM-10 | `precipType.js` → `HourlyStrip` | A zero-amount WMO rain hour renders `Possible rain`, while missing amounts do not become zero | precip-type lane |
| [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); **D-OM-06** | Approved rain/snow and snow-line presentation | T-OM-11 | `winterConditions.js` → `ConditionBadges` | The ratified boundary and relative-elevation copy pass their fixtures | badges lane |
| [`api-and-product-brainstorm.md` §10.3](./api-and-product-brainstorm.md#103-tier-1-forecast-language-decisions--locked-2026-08-12) | Fog names come from WMO codes; visibility qualifies density but does not invent fog | T-OM-12 | `visibility.js` → `ConditionBadges`, `skyTheme` | A ≤400 m fog-code case is dense fog; a no-fog-code case is reduced visibility | badges lane |
| [`api-and-product-brainstorm.md` §2](./api-and-product-brainstorm.md#2-product-traits-to-protect) | Total cloud cover is decomposed into layers | T-OM-13 | `api.js` layered means (via T-OM-02) → `CloudMeter` | 80 % high cloud and 80 % low cloud produce different descriptions | summary lane |
| [`api-and-product-brainstorm.md` §10.3](./api-and-product-brainstorm.md#103-tier-1-forecast-language-decisions--locked-2026-08-12) | Daily probability copy uses duration and evidence-supported local-daypart language | T-OM-14 | `daySummary.js` | A high-mean fixture renders `likely much of the day`; a one-daypart fixture renders `likely in the afternoon`; incomplete evidence stays `likely` | summary lane |
| [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); [`README.md` §Hail caveat](../README.md#the-hail-caveat) | Ingredients are ingredients; CIN suppresses the signal | T-OM-20 | `severeDesk/convectiveIngredients.js` | A named focused fixture command proves CAPE/CIN suppression | convective lane |
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
| **D-OM-05** | `README.md` states *"Open-Meteo has no daily cloud variable."* `mean_cloud_cover` / `maximum_cloud_cover` / `minimum_cloud_cover` now exist. The **reasoning remains correct** — the client-side mean is daylight-bounded and the provider's is 24-hour — but the stated fact is wrong | Documentation accuracy only | Correct the claim to "no daylight-restricted daily cloud variable" in `README.md` and `forecastContract.js`. **Do not** substitute the provider variable |
| **D-OM-06** | `api-and-product-brainstorm.md` names snow depth, not a wet-bulb cutoff, snow-line calculation, or user-facing winter copy. Those are product decisions, not a formatter choice | T-OM-11 | Decision record defines whether wet-bulb discrimination is in scope, its exact boundary and mixed/unknown state, the snow-line calculation, and bounded copy relative to payload elevation |

### Ratified decisions — 2026-08-12

| ID | Decision | Implementation consequence |
|---|---|---|
| **D-OM-03** | Outdoor-plan windows are never smaller than one hour. | T-OM-30–33 and Phase 4 are removed from Tier 1. No `minutely_15` request, normalized 15-minute series, or sub-hourly window surface is authorized. |
| **D-OM-07** | Use `Fog` / `Rime fog` only for WMO 45 / 48. At ≤400 m, qualify the applicable fog label as `Dense`; otherwise low visibility is `Reduced visibility`, never inferred fog or mist. | T-OM-12 validates code-first terminology, the 400 m dense qualifier, unit rendering, and explicit unavailable state. |
| **D-OM-08** | Amounts are authoritative. When all three are exactly zero but WMO code or 40%+ probability signals precipitation, show `Possible {WMO type}` if known, otherwise `Precipitation possible`; unavailable amount is not zero. | T-OM-10 retains amount-first type classification and adds only the qualified fallback. |
| **D-OM-09** | A corroborated 40%+ chance is `likely`; a 40%+ daily mean is `likely much of the day`; otherwise complete same-daypart hourly evidence qualifies it with morning, afternoon, evening, or overnight, and cross-daypart evidence is `likely at times`. Missing hourly evidence remains `likely`. | T-OM-14 uses daily mean for duration language and existing complete hourly evidence for a daypart. |

---

## Scaffold inventory

| Seam ID | Authority refs | Crate / file / symbol | Signature / contract | Safe unresolved state | Owner | Completion evidence |
|---|---|---|---|---|---|---|
| SC-OM-PROBE | [`README.md` §Upstream request contract](../README.md#upstream-request-contract) | `scripts/openmeteo-variable-probe.mjs`; `docs/openmeteo-variable-availability.md` | Probe 4 coordinates × 3 variable classes and record status plus null/absent/error result per field | **Blocked** until live measurements are committed; creates no product behavior | probe lane | Committed results table and deletion of the throwaway script in the same commit |
| SC-OM-SEAMS | [`test-selection` §Required](/Users/jared/.codex/skills/test-selection/SKILL.md#required-per-project-seam-declaration) | `README.md` L0 seam section | Names concrete entry points and consumer-visible artifacts | **Not implemented** until the README section is committed; later test tasks remain blocked | standards lane | Reviewer can classify every task test against a named L0/L1/L2 seam |
| SC-OM-CONTRACT | [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor) | `src/lib/forecastContract.js`; `src/lib/api.js`; `scripts/forecast-contract-test.mjs` | Each approved provider field maps to one normalized key with `null` for omitted payload values | **Fail-closed**: omitted values remain `null`; no synthetic default | contract lane | URL goldens and normalized-payload fixture pass |
| SC-OM-UNITS | [`api-and-product-brainstorm.md` §2](./api-and-product-brainstorm.md#2-product-traits-to-protect) | `src/lib/format.js` length/height formatter | Accepts provider metres and active unit preset; returns labelled display text or unavailable marker | **Fail-closed**: non-finite input renders unavailable, never raw metres | units lane | `node scripts/format-test.mjs` passes |
| SC-OM-PRECIP-TYPE | [`api-and-product-brainstorm.md` §10.3](./api-and-product-brainstorm.md#103-tier-1-forecast-language-decisions--locked-2026-08-12) | `src/lib/precipType.js` | Produces an amount-first precipitation type, qualified WMO fallback, or explicit unavailable state | **Fail-closed**: unavailable amount never becomes zero | precip-type lane | `node scripts/precip-type-test.mjs` passes |
| SC-OM-WINTER | [`api-and-product-brainstorm.md` §3.1](./api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor); **D-OM-06** | `src/lib/winterConditions.js` | Produces only ratified winter evidence/copy from normalized inputs | **Blocked** until D-OM-06 defines the product rule | badges lane | `node scripts/winter-conditions-test.mjs` passes |
| SC-OM-VISIBILITY | [`api-and-product-brainstorm.md` §10.3](./api-and-product-brainstorm.md#103-tier-1-forecast-language-decisions--locked-2026-08-12) | `src/lib/visibility.js` | Produces WMO-named fog/rime-fog, a dense qualifier, reduced visibility, or explicit unavailable | **Fail-closed**: visibility alone never becomes fog or mist | badges lane | `node scripts/visibility-test.mjs` passes |
| SC-OM-CONVECTIVE | [`severe-desk-waved-roadmap.md` §Task breakdown](./severe-desk-waved-roadmap.md#task-breakdown-and-coder-handoffs); **D-OM-02** | `src/lib/severeDesk/convectiveIngredients.js` | Pair CAPE/CIN ingredients without presenting an observation or probability | **Blocked** until the conditional-request decision and named Severe Desk Wave approval exist | convective lane | Named fixture command plus rendered Severe Desk proof pass |

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
  `derivePrecipEvent`, `derivePrecipTiming`); the rendered
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
- Hard prerequisites: FND-OM-CONTRACT
- Provides / consumes: provides hourly precipitation type from measured
  amounts; consumes normalized hourly `rain` / `showers` / `snowfall`
- Rationale: `current` already requests all three components; hourly does not,
  so hourly type is inferred from `weather_code` — the exact inference
  `daySummary.js` was written to distrust at daily altitude. The distrust
  applies identically at hourly altitude
- Fallback rule: if all measured components are exactly zero but the WMO code
  or a 40%+ probability signals precipitation, return `Possible {WMO type}`
  when the code supplies a type, otherwise `Precipitation possible`. A missing
  component remains unavailable and never enters this fallback.
- Closure gate: `node scripts/precip-type-test.mjs` proves an hour with
  `snowfall > 0`, `rain = 0`, `weather_code: 63` classifies as snow; a zero-
  amount WMO rain case is `Possible rain`; and a rain→snow transition inside
  one event is preserved rather than flattened
- Authority refs: [`api-and-product-brainstorm.md` §10.3](./api-and-product-brainstorm.md#103-tier-1-forecast-language-decisions--locked-2026-08-12); [`README.md` §Daily conditions](../README.md#daily-conditions-are-derived-not-reported)
- Allowed write scope: `src/lib/precipType.js`, `src/lib/precipEvent.js`,
  `src/components/HourlyStrip.jsx`, `scripts/precip-type-test.mjs`
- Acceptance evidence: the contradicting-code case and the transition case
- Test posture: **L0.** Seam: the derived product object. Mutation caught:
  reverting to `weather_code` inference.
- Coder rule: implement only cited measured-split behavior and the ratified fallback; any uncited confidence heuristic is a blocker requiring authority.

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
- Hard prerequisites: FND-OM-CONTRACT, FND-OM-UNITS
- Provides / consumes: provides WMO-named fog/rime-fog, dense qualifier, or
  reduced-visibility state; consumes normalized hourly `visibility` and code
- Rationale: `skyTheme()` already returns `'fog'` with a palette behind it,
  driven by codes 45/48. Preserve that meteorological identity; visibility
  qualifies density but never infers fog.
- Closure gate: `node scripts/visibility-test.mjs` proves a ≤400 m WMO fog case
  is dense fog, the no-fog-code equivalent is reduced visibility, and
  unavailable/unit-rendering cases are explicit
- Authority refs: [`api-and-product-brainstorm.md` §10.3](./api-and-product-brainstorm.md#103-tier-1-forecast-language-decisions--locked-2026-08-12)
- Allowed write scope: `src/lib/visibility.js`,
  `src/components/ConditionBadges.jsx`, `src/lib/dayExplanation.js`,
  `scripts/visibility-test.mjs`
- Acceptance evidence: dense-fog, reduced-visibility, unavailable, and both
  unit cases
- Test posture: **L0.** Mutation caught: inferring fog from visibility alone,
  or omitting the dense qualifier.
- Coder rule: implement only cited WMO terminology and 400 m qualifier; any uncited fog or visibility copy is an authority blocker.

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
- Hard prerequisites: FND-OM-CONTRACT, T-OM-13
- Provides / consumes: provides the ratified daily aggregate and local-daypart
  copy; consumes normalized daily aggregates and complete existing hourly evidence
- Rationale: `precipitation_probability_max` is the only daily probability
  carried today, so a day peaking at 60 % for one hour and a day sitting at
  55 % all afternoon read identically. Hourly dewpoint is fetched and then
  discarded at day level even though the hourly strip now presents it directly
- Closure gate: `node scripts/daily-aggregates-test.mjs` proves a corroborated,
  40%+ daily mean renders `likely much of the day`; a single-daypart chance
  renders `likely in the afternoon`; cross-daypart evidence renders `likely at
  times`; and incomplete evidence remains `likely`
- Authority refs: [`api-and-product-brainstorm.md` §10.3](./api-and-product-brainstorm.md#103-tier-1-forecast-language-decisions--locked-2026-08-12); [`daySummary.js`](../src/lib/daySummary.js#L1)
- Allowed write scope: `src/lib/daySummary.js`, `src/components/DayRow.jsx`,
  `scripts/daily-aggregates-test.mjs`
- Acceptance evidence: the high-mean, same-daypart, cross-daypart, and
  unavailable cases
- Test posture: **L0.** Mutation caught: assigning a daypart from partial
  evidence, ignoring the mean, or replacing existing corroboration.
- Coder rule: implement only cited aggregate/copy behavior; an uncited threshold or replacement of existing corroboration is an authority blocker.

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
| **T-OM-10** precip type | CAP-OM-PRECIP-TYPE | 2 | precip-type | T-OM-02 | `blocked` | `node scripts/precip-type-test.mjs` |
| **T-OM-11** winter | CAP-OM-WINTER | 2 | badges | T-OM-02, T-OM-03, **D-OM-06** | `blocked` | `node scripts/winter-conditions-test.mjs` |
| **T-OM-12** visibility | CAP-OM-VISIBILITY | 2 | badges | T-OM-02, T-OM-03 | `blocked` | `node scripts/visibility-test.mjs` |
| **T-OM-13** cloud layers | CAP-OM-SKY-LAYERS | 2 | summary | T-OM-02 | `blocked` | `node scripts/cloud-layers-test.mjs` |
| **T-OM-14** daily aggregates | CAP-OM-DAILY-AGGREGATES | 2 | summary | T-OM-02, T-OM-13 | `blocked` | `node scripts/daily-aggregates-test.mjs` |
| **T-OM-20** convective | CAP-OM-CONVECTIVE | 3 | convective | T-OM-02, **D-OM-02**, severe-desk Wave approval | `blocked` | `node scripts/convective-ingredients-test.mjs && npm run test:smoke` |
| **D-OM-05** README correction | FND-OM-DOCUMENTATION-ACCURACY | 0 | standards | — | `ready` | committed documentation correction |

**Conceptually ready after explicit named-task approval: T-OM-00, T-OM-01,
D-OM-05.** D-OM-03, D-OM-07, D-OM-08, and D-OM-09 are ratified; the remaining
work is correctly blocked by named provider, winter-rule, Severe Desk, or
upstream-task gates. This is a dependency state, not a scheduling problem to
route around.

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
8. **Blocked work still visibly blocked.** T-OM-20 remains blocked, with
   D-OM-02 and a named Severe Desk Wave approval open. Tier 1 closure does
   **not** silently absorb it; D-OM-03 is closed by retaining one-hour
   Outdoor-plan windows.

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

which chains `test:summary`, `test:contract`, `test:reverse`,
`test:precip`, `test:precip-event`, `test:timing`,
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
| 1.2 | 2026-08-12 | Jared locked one-hour Outdoor-plan resolution and the D-OM-07–09 forecast-language rules. Phase 4 and T-OM-30–33 were removed; visibility now uses WMO terminology without inferring fog from visibility. |
| 1.1 | 2026-08-12 | Run Window removed from the product. Dew point is now visible beside hourly temperature; Phase 4 concerns only the Outdoor plan's locked hourly time axis. |
| 1.0 | 2026-08-11 | Initial decomposition. |
