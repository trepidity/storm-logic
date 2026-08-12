---
title: "Requirements and Implementation Spec: Open-Meteo Tier 1 Wave 0"
date: 2026-08-12
version: 1.0
status: Draft — dispatch contract, not approval to implement
owner: Jared
category: requirements-and-spec
tags:
  - open-meteo
  - tier-1
  - wave-0
  - provider-safety
  - forecast-contract
---

# Requirements and Implementation Spec: Open-Meteo Tier 1 Wave 0

## Product requirements — plain English

### Goal

Wave 0 makes later Tier 1 forecast improvements safe to build. Before the app
asks Open-Meteo for any new optional field, it proves that field cannot take
down the ordinary forecast. It also makes the test boundaries explicit and
corrects one inaccurate cloud-data statement in the documentation.

### Why this exists

The temperature forecast is the product's core promise. A useful optional
field—such as visibility, snow depth, or cloud layers—must never make that
forecast disappear because it is unsupported at a location or by a model.
Without this wave, adding a field would be an assumption about a third-party
provider rather than a proven contract.

### Expected outcomes

| Requirement | Human outcome | Objective outcome |
|---|---|---|
| **REQ-W0-01 — core forecast is protected** | An optional field cannot break the temperature forecast. | Every candidate is marked `core-admitted` only after a non-fatal result at all four probe locations; every other candidate is `excluded`. |
| **REQ-W0-02 — unavailable stays honest** | A supported request may say a field is unavailable; it never fabricates a value. | An admitted field's omitted provider value is represented as `null` by later normalization work. Wave 0 adds no normalization code. |
| **REQ-W0-03 — later proof has a real target** | Tests will show what a person actually receives, not internal implementation details. | The README names the concrete consumer seams and the artifacts tests may assert. |
| **REQ-W0-04 — cloud documentation is accurate** | The documented reason for the daylight cloud calculation remains trustworthy. | Documentation says Open-Meteo lacks a *daylight-restricted* daily cloud variable; it does not claim there are no daily cloud variables. |

### What is being implemented, and why

| Work | What changes | Why it matters to the product | What does not change |
|---|---|---|---|
| **Provider safety proof** | A temporary live probe and a committed field-admission results table. The temporary probe is deleted when the table is committed. | Establishes an evidence-backed allowlist for the future shared forecast request. | No request contract, UI, fallback request, or new feature. |
| **Consumer-seam declaration** | A README section naming real product-facing seams. | Makes later tests prove a request, response, normalized forecast, derived product object, or rendered DOM—not incidental source structure. | No production behavior or test suite rewrite. |
| **Daily-cloud documentation correction** | README and existing forecast-contract comment wording only. | Preserves the intentional daylight-only cloud calculation without repeating a false provider claim. | No cloud calculation, provider field list, or UI behavior. |

### Scope boundary

Wave 0 is preparation and proof. It does not make the forecast richer yet.
No new forecast field is admitted to the request contract until a later task
uses this wave's committed allowlist.

## Authority and scope

### Approved goal

Establish the Tier 1 Wave 0 evidence and documentation foundations required to
admit only provider-safe optional fields to the shared Open-Meteo forecast
request.

This is a requirements and implementation-spec document, **not approval to
implement any task**. Only explicit approval of a named task ID authorizes
code or documentation changes.

### Governing authority

- User direction, 2026-08-12: provider safety is the only allowable path;
  unsupported or unproven optional fields are excluded from the core request.
- [`openmeteo-tier-1-field-closure-spec.md` §Provider-safety invariant](./openmeteo-tier-1-field-closure-spec.md#provider-safety-invariant--locked-2026-08-12)
  — binding admission rule and Tier 1 parent plan.
- [`README.md` §What it shows](../README.md#what-it-shows) — the existing
  daylight-only cloud statement that D-OM-05 corrects.
- [`README.md` §Daily conditions are derived, not reported](../README.md#daily-conditions-are-derived-not-reported)
  — existing forecast evidence is consumer-visible product behavior.
- [`test-selection` §Required](/Users/jared/.codex/skills/test-selection/SKILL.md#required-per-project-seam-declaration)
  — requires concrete product-consumer seams before later test work is
  dispatched.

### Scope

- Measure provider behavior for candidate fields at Kansas City, London,
  Nairobi, and Sydney.
- Record HTTP result and per-field value / `null` / absent / error behavior.
- Produce a committed `core-admitted` / `excluded` admission table.
- Name the repository's product-consumer test seams in the README.
- Correct the daily-cloud documentation fact without changing the daylight-only
  calculation.

### Non-goals

- No change to `forecastContract.js` field lists, `api.js` normalization, UI,
  Netlify function behavior, cache policy, or provider request routing.
- No new Open-Meteo endpoint, provider, API key, model selection, persistence,
  tab, or navigation.
- No product claim that an excluded field is “temporarily unavailable”; it is
  simply outside the core request.
- No replacement of the daylight-only cloud calculation with a 24-hour provider
  aggregate.
- No test added merely for a documentation or one-time measurement task.

## System progression and dependency map

| Node ID | Node type | Authority refs | Phase | Wave | Provides | Consumes | Hard prerequisites | Closure gate |
|---|---|---|---|---|---|---|---|---|
| FND-OM-PROVIDER-BEHAVIOR | Foundation | [`Tier 1 parent plan` §Provider-safety invariant](./openmeteo-tier-1-field-closure-spec.md#provider-safety-invariant--locked-2026-08-12) | Phase 0 | 0 | Field-by-field core-admission allowlist; exclusion reasons | Live Open-Meteo forecast endpoint | Foundation root | `docs/openmeteo-variable-availability.md` records all 4 locations × 3 field classes and disposition per candidate; temporary probe deleted in the same commit |
| FND-OM-SEAM-DECLARATION | Foundation | [`test-selection` §Required](/Users/jared/.codex/skills/test-selection/SKILL.md#required-per-project-seam-declaration) | Phase 0 | 0 | Named L0 product-consumer seam list | Existing application/test architecture | Foundation root | `README.md` names each concrete entry point and consumer-visible assertion artifact |
| FND-OM-DOCUMENTATION-ACCURACY | Foundation | [`README.md` §What it shows](../README.md#what-it-shows) | Phase 0 | 0 | Accurate daylight-cloud explanation | Existing README and forecast-contract comment | Foundation root | Committed README and contract comment say Open-Meteo lacks a daylight-restricted daily cloud variable; behavior remains unchanged |

Hard `requires` edges override scheduling. The three Wave 0 nodes have no
write-scope overlap and may run in parallel. `FND-OM-CONTRACT` in the parent
plan requires both the provider-admission allowlist and seam declaration.

## Traceability matrix

| Authority ref | Behavior / decision | Task ID | Implementation seam | Acceptance evidence | Owner |
|---|---|---|---|---|---|
| [`Tier 1 parent plan` §Provider-safety invariant](./openmeteo-tier-1-field-closure-spec.md#provider-safety-invariant--locked-2026-08-12) | Only proven non-fatal fields can enter the future core request; all others are excluded | T-OM-00 | throwaway probe → `docs/openmeteo-variable-availability.md` | Committed 4 × 3 table with per-field disposition and observed reason; probe deleted | probe lane |
| [`test-selection` §Required](/Users/jared/.codex/skills/test-selection/SKILL.md#required-per-project-seam-declaration) | Later Tier 1 tests use declared product-consumer seams | T-OM-01 | `README.md` | A reviewer can classify every named later test artifact against a declared L0 seam | standards lane |
| [`README.md` §What it shows](../README.md#what-it-shows) | Correct the daily-cloud statement without changing behavior | D-OM-05 | `README.md`; `src/lib/forecastContract.js` comment | Committed wording says “no daylight-restricted daily cloud variable”; no field list or calculation diff | standards lane |

## Implementation boundary

### Allowed changes

- `scripts/openmeteo-variable-probe.mjs` may exist only while gathering the
  Wave 0 measurements; it is deleted in the closeout commit.
- `docs/openmeteo-variable-availability.md` may record the raw measurement
  summary and the field admission disposition.
- `README.md` may receive the L0 seam declaration and daily-cloud correction.
- `src/lib/forecastContract.js` may receive the daily-cloud comment correction
  only; executable code and field lists are out of scope.

### Forbidden changes / non-goals

- No executable changes to `src/lib/forecastContract.js`, `src/lib/api.js`,
  `netlify/functions/forecast.mjs`, or any component.
- No addition of a candidate field to a request, golden list, normalized object,
  fixture, or surface.
- No provider-behavior assumption outside the recorded four-coordinate probe.
- No test that calls a provider in the ordinary suite; measurement is a bounded
  manual/one-time evidence task, not a repeatable product test.

**No-invention declaration:** Implement only the cited behavior inside this
boundary. A missing execution path, architecture, API, persistence flow,
provider behavior, or product solution is a blocker requiring an approved
authority update, not a coder decision.

## Decision gaps and blockers

- **No product decision is open in Wave 0.** Provider safety is a binding
  admission invariant, not a choice.
- A candidate whose behavior is not measured at every required coordinate is
  `excluded`; it cannot be promoted by a coder judgment.
- If the measured payload shape cannot distinguish an omitted field from a
  provider error, record the ambiguity and exclude the field. Do not add a
  fallback request path.

## Scaffold inventory

| Seam ID | Authority refs | Crate / file / symbol | Signature / contract | Safe unresolved state | Owner | Completion evidence |
|---|---|---|---|---|---|---|
| SC-W0-PROBE | [`Tier 1 parent plan` §Provider-safety invariant](./openmeteo-tier-1-field-closure-spec.md#provider-safety-invariant--locked-2026-08-12) | `scripts/openmeteo-variable-probe.mjs`; `docs/openmeteo-variable-availability.md` | Four locations × three field classes; records request status, per-field result, and `core-admitted` / `excluded` disposition | **Fail-closed:** excluded; creates no application behavior | probe lane | Results table committed and temporary probe deleted |
| SC-W0-SEAMS | [`test-selection` §Required](/Users/jared/.codex/skills/test-selection/SKILL.md#required-per-project-seam-declaration) | `README.md` L0 seams | Names issued upstream URL, Netlify HTTP response, normalized forecast object, derived product objects, and rendered DOM | Later test task remains blocked at this seam | standards lane | Reviewer can classify later test artifacts against the list |
| SC-W0-CLOUD-DOCS | [`README.md` §What it shows](../README.md#what-it-shows) | `README.md`; `src/lib/forecastContract.js` comment | Documentation says provider has no daylight-restricted daily cloud variable | **Fail-closed:** existing calculation remains untouched | standards lane | Text review and `git diff --check` show documentation-only change |

## Task breakdown and coder handoffs

### T-OM-00 — provider safety proof

- System node: FND-OM-PROVIDER-BEHAVIOR
- Phase / Wave: 0 / 0
- Hard prerequisites: Foundation root
- Provides / consumes: provides the core-admission allowlist for T-OM-02;
  consumes the live Open-Meteo forecast endpoint
- Closure gate: `docs/openmeteo-variable-availability.md` records HTTP status
  and per-field value / `null` / absent / error behavior for Kansas City,
  London, Nairobi, and Sydney across core-candidate, model-dependent, and
  region-locked field classes; every candidate is `core-admitted` or `excluded`
- Authority refs: [`Tier 1 parent plan` §Provider-safety invariant](./openmeteo-tier-1-field-closure-spec.md#provider-safety-invariant--locked-2026-08-12)
- Allowed write scope: `scripts/openmeteo-variable-probe.mjs` (throwaway),
  `docs/openmeteo-variable-availability.md`
- Acceptance evidence: committed allowlist; every excluded candidate has its
  observed reason; probe script deleted in the same commit
- Test posture: no automated product test owed; this is a bounded live
  measurement, not product behavior
- Coder rule: Implement only the cited measurement behavior; any unproven field, uncited provider behavior, or unprobed coordinate is a blocker requiring an approved authority update.

### T-OM-01 — L0 seam declaration

- System node: FND-OM-SEAM-DECLARATION
- Phase / Wave: 0 / 0
- Hard prerequisites: Foundation root
- Provides / consumes: provides the declared seam list that later test tasks
  consume; consumes existing application/test architecture
- Closure gate: `README.md` names the concrete L0 entry points and the
  consumer-visible artifact each seam makes assertable
- Authority refs: [`test-selection` §Required](/Users/jared/.codex/skills/test-selection/SKILL.md#required-per-project-seam-declaration)
- Allowed write scope: `README.md`
- Acceptance evidence: the README lists: issued upstream URL; Netlify function
  HTTP response; normalized forecast object from `api.js`; derived product
  objects (`summariseDay`, `deriveOutdoorPlan`, `derivePrecipEvent`,
  `derivePrecipTiming`); rendered DOM via Playwright smoke test
- Test posture: no test owed; this is test authority documentation
- Coder rule: Implement only the cited seam declaration; any proposed seam without a consumer is a blocker requiring an approved authority update.

### D-OM-05 — daily-cloud documentation correction

- System node: FND-OM-DOCUMENTATION-ACCURACY
- Phase / Wave: 0 / 0
- Hard prerequisites: Foundation root
- Provides / consumes: provides accurate daylight-cloud documentation; consumes
  the existing README and forecast-contract comment
- Closure gate: committed text says Open-Meteo lacks a **daylight-restricted**
  daily cloud variable and retains the client-side daylight calculation
- Authority refs: [`README.md` §What it shows](../README.md#what-it-shows)
- Allowed write scope: `README.md`, `src/lib/forecastContract.js` comment only
- Acceptance evidence: a diff proves no executable code, provider field list,
  or daylight-window behavior changed
- Test posture: no test owed; documentation-only correction
- Coder rule: Implement only the cited documentation correction; any behavioral or provider-contract change is a blocker requiring an approved authority update.

## Verification and closure

- Spec structure: `python3 /Users/jared/.openclaw/workspace/foreman/scripts/validate_spec_contract.py docs/openmeteo-tier-1-wave-0-requirements-spec.md`
- Documentation integrity: `git diff --check`
- T-OM-00 closure: inspect the committed results table for all 12 class/location
  cells, per-field dispositions, observed reasons for exclusions, and absence of
  the throwaway probe script.
- T-OM-01 closure: inspect that every listed seam is concrete and has a
  consumer-visible artifact; do not accept source-file names alone.
- D-OM-05 closure: inspect the diff to confirm the daylight-only calculation
  and requested fields are unchanged.
- No scaffold seam is complete without its cited proof. Wave 0 does not make
  any later Tier 1 feature ready on prose alone; the parent plan's hard
  prerequisites still apply.

## Document history

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-08-12 | Extracted Tier 1 Wave 0 into a standalone human-facing requirements and implementation-spec document. |
