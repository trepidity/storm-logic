# Run-window decision record

**Status: APPROVED BOUNDARY — 2026-08-11.** This is authority for the data
foundation and the v1 integrity model. The remaining presentation choices in
§9 must be specified before a user-facing surface ships. Drafted 2026-08-10
following the user question "can we track the dew point throughout the day and
use that to provide a runner with the optimal run time based on all the factors
combined?"

Precedent: [`outdoor-plan-decision.md`](./outdoor-plan-decision.md) (the first
decision helper) and [`confidence-discovery.md`](./confidence-discovery.md).
This helper is the second, and it deliberately reuses the first's shape.

---

## 1. Question answered

**"Given a run length, which windows in the current local day are least
constrained, and by what?"**

Not "is it safe to run." Not "how good is this run out of 100." The block ranks
windows and names the binding constraint for each. The user makes the call.

The existing Outdoor-plan block answers *"when is the longest dry daylight
stretch?"* — a precipitation question. This one answers a physiological-load
question and is therefore a separate helper rather than more copy inside that
block. Its product name is **Run windows**, never "ideal" or "best" running
time.

---

## 2. Why dewpoint is the added variable

A running body sheds heat mainly by evaporating sweat, and evaporation is driven
by the vapor-pressure gradient between wet skin and ambient air. Dewpoint reads
that ambient term almost directly.

Relative humidity does not substitute for it. RH is a ratio against saturation
pressure, which climbs steeply with temperature, so equal RH describes
different air at different temperatures. RH also moves mainly *because
temperature moves*, making its hourly curve close to an inverted temperature
curve — near-useless for choosing between hours. Dewpoint is roughly conserved
across a day absent a frontal passage, which is what makes it plannable.

Heat index is not a substitute either: it models a shaded, roughly walking
person in light wind, is undefined below ~80 °F where much running happens, and
blends temperature with moisture so that "hot and dry" and "warm and swampy" —
which call for different pacing — report the same number.

**Stated limit.** The validated aggregate is WBGT, which weights natural wet
bulb 0.7, black globe 0.2, dry bulb 0.1. We do not have WBGT and will not
estimate it (§8). Dewpoint is defensible here precisely because the moisture
term dominates that formula — it is a good proxy for the heaviest term, not a
replacement for the index.

---

## 3. Data contract

**No new provider, key, or proxy function.** The forecast contract gains hourly
columns; the existing Air function gains an hourly response contract.

### 3.1 Forecast (`forecastContract.js` → `HOURLY_VARS`)

Add: `dew_point_2m`, `apparent_temperature`, `relative_humidity_2m`,
`wind_speed_10m`, `wind_gusts_10m`, `uv_index`.

Each value must be carried into the normalised per-hour record with its local
source timestamp. Requesting the columns alone is insufficient: the current
hourly record exposes none of these fields, even where an equivalent current or
daily aggregate already exists.

Verified live 2026-08-10 (Kansas City, `forecast_days=1`): all six return
hourly. Illustrative — and itself an argument for the helper:

| Hour | Dewpoint | Apparent temp | UV |
|---|---|---|---|
| 06:00 | 68.3 °F | 79.2 °F | 0 |
| 17:00 | 76.7 °F | 99.7 °F | 4.75 |

The existing daily `uv_index_max` for such a day reports a single number that
distinguishes neither hour.

### 3.2 Air quality (`air.mjs`)

Today: `current: us_aqi` — a single scalar. Add `hourly: us_aqi` as the
time-aligned ranking input. `pm2_5` and `ozone` may be added as visible
supporting evidence, with their units and source timestamp.

`pm2_5` and `ozone` are concentrations, not US AQI values. They must never be
put through `usAqiCategory` or assigned an EPA AQI label without a separately
approved, pollutant-specific conversion and the required averaging interval.

**This is a response-shape change, not a parameter addition.** `air.mjs`
currently returns a current reading normalised by `normaliseCurrentAirQuality`.
An hourly series needs its own normaliser, local-time alignment, and unavailable
states. This is the majority of the engineering in this record.

### 3.3 Reused as-is, not re-decided

- `precipTiming.isPrecipitatingHour` — the wet-hour rule. Unchanged.
- `usAqi.usAqiCategory` — EPA bands already implemented.
- `usAqi.isUsAqiCoverage` — the existing US-only product gate (§7.3).
- `isDay` — derived per hour from sunrise/sunset (`api.js:195`).
- `weatherCodes.isThunderCode` / `hasHail`.

---

## 4. The rating model — limiting factor, not weighted sum

**A complete hour's tier is the maximum tier across its applicable, present
ranking factors.** Not an average, not a weighted blend.

```
hourTier   = max(factorTier for each applicable, present ranking factor)
windowTier = max(hourTier for each touched hour in a complete window)
```

Three reasons this is the correct model and not merely the conservative one:

1. **No invented weights.** Assigning "UV 20%, dewpoint 35%" is precisely what
   makes a thing a safety score, which the brainstorm's non-goals forbid. A max
   has nothing to arbitrate.
2. **Averaging is physiologically wrong.** A weighted sum lets favourable
   factors mask a disqualifying one — AQI 160 is not redeemed by a pleasant
   breeze. Masking is the specific failure a blend introduces.
3. **The explanation is free.** The factor achieving the max *is* the binding
   constraint, so "limited by dewpoint 77 °F" needs no separate derivation.

### 4.1 Tier vocabulary

Tiers are named for how strongly a **published scale marks the value**, never
for personal risk:

| Tier | Name | Meaning |
|---|---|---|
| 0 | `unrestricted` | no factor is in a marked band |
| 1 | `noted` | a factor sits in the first marked band of its scale |
| 2 | `marked` | a factor sits in a strongly marked band |
| 3 | `severe` | a factor sits in the top marked band |

**Copy renders the source scale's own label, not ours** — "Unhealthy for
Sensitive Groups (EPA)", "Very High (WHO UV)". The user reads the publishing
body's words. We supply the ordering, not the adjective.

### 4.2 Ranking and ties

Only **complete** windows sort by tier ascending. Ties break lexicographically on the
second-worst factor tier, then third — never by a weighted sum. Remaining ties
break by earliest start.

### 4.3 Hourly resolution is not interpolated

Ratings are hourly because the sources are hourly. Starts are offered only at a
local hourly boundary; a run touches every hourly bucket whose interval overlaps
its requested duration. A 45-minute run spanning two buckets takes the worse of
the two. We do not interpolate between hours to manufacture a finer answer —
the same posture the severe desk takes in
[`severe-desk-provider-contracts.md`](./severe-desk-provider-contracts.md) §7.

---

## 5. Threshold table

**Every row declares its provenance.** This is the load-bearing distinction in
this record: cited thresholds are a lookup, invented ones are a safety score.

| Factor | Bands from | Provenance |
|---|---|---|
| Precipitation | existing `precipTiming` rule | **already decided** in this repo |
| US AQI | EPA AQI bands via `usAqiCategory` | **published**, already implemented |
| UV | WHO/WMO Global Solar UV Index | **published**; mapping must be explicit |
| Heat / cold | Heat index / wind chill values | **evidence only in v1**; no universal tier mapping is yet ratified |
| Thunder / hail | existing weather-code helpers | **already decided** |
| **Dewpoint** | fixed running-community bands | ⚠️ **CONVENTION — not validated science** |
| Wind / gusts | observed/forecast value | **evidence only in v1**; no published runner basis selected |

The implementation specification must include one machine-readable mapping for
each ranking factor: valid input range, exact threshold edges, tier, displayed
source label, provenance URL, and boundary tests. A value has no ranking effect
until that mapping exists. Apparent temperature, relative humidity, temperature,
wind, gusts, cloud cover, `pm2_5`, and ozone are explanatory evidence unless
and until separately approved as ranking factors.

### 5.1 The dewpoint caveat, stated where it will be read

The familiar dewpoint bands (roughly: below 55 °F unremarkable, 60–65
noticeable, 65–70 difficult, 70–75 oppressive, 75+ severe) are **coaching
convention circulated among runners, not a validated physiological standard with
those cutpoints.** They are useful and they are not science.

Consequences, all binding:

- The UI must not present dewpoint bands with the same authority as EPA or NWS
  bands. Provenance is visible per factor.
- V1 uses one fixed, visibly labelled convention. It has no personal setting or
  persistence key; that avoids implying an individually calibrated model.
- Dewpoint must never be the *only* thing shown. Temperature, cloud cover (our
  available radiation proxy), and wind stay visible alongside it so the user can
  see when moisture is the binding term versus sun or heat.

### 5.2 Heat and cold evidence coverage

Heat index is undefined below ~80 °F and wind chill above 50 °F. V1 shows those
values only within their valid domains and assigns neither a tier. It does not
extrapolate either formula merely to keep a ranking factor populated.

---

## 6. Window selection

- The user picks a **run duration**; a window is a contiguous span of that
  length beginning on an offered local hourly boundary.
- **Night hours are included by default.** Plenty of people run in the dark, and
  excluding them would be us making the user's choice. Daylight is shown as a
  visible property of each window, filterable by the user, not a hard exclusion.
  This is a deliberate divergence from the Outdoor-plan block, which is
  daylight-only because it answers a different question.
- Thunder/hail-coded hours are tier 3. **NWS Alerts remains the authoritative
  severe surface** — this block exposes the forecast day's existing signal and
  invents no lightning rule of its own.

---

## 7. Integrity and unavailable states

The governing rule from the Outdoor-plan record carries over unchanged: **a
labelled absence beats a plausible guess.**

### 7.1 Evidence states — the governing ranking boundary

V1 is limited to the current local day; it does not expose the forecast's
11-day horizon as ranked running advice. Every candidate window has exactly one
of these states:

| State | Meaning | May rank? |
|---|---|---|
| `complete` | Every applicable ranking factor has valid, time-aligned evidence for every touched hour | Yes |
| `partial` | At least one otherwise-applicable factor is missing or outside product coverage | No; render the missing factor plainly |
| `unavailable` | Required local time or core forecast evidence is malformed, gapped, or the request failed | No; render labelled absence |

`unrestricted` is a tier within a **complete** window only. It can never mean
"no evidence was available." A partial window is visible only to explain its
missing evidence and must not be interleaved with the ranked result.

### 7.2 Pollen is unavailable, and says so

Open-Meteo's pollen variables are documented **Europe-only**. There is no US
pollen from this provider. V1 makes no pollen or comprehensive "breathing
conditions" claim, and does not approximate pollen from humidity, wind, or
season.

### 7.3 Air quality is US-only by existing product gate

`isUsAqiCoverage` already restricts Air to CONUS/AK/HI/PR-USVI. Outside it the
US-AQI factor makes candidate windows `partial` under §7.1. This is an inherited
boundary, not a new decision.

### 7.4 Forecast error grows with lead time

V1 does not rank future calendar days. The existing tomorrow-only confidence
surface is not reused as a false confidence measure for later days.

### 7.5 Missing-hour handling

Following `deriveOutdoorPlan`: any hour lacking a valid local time or its
required evidence makes affected windows unavailable. **A window never joins
across a missing hour.**

---

## 8. Non-goals

- No new provider, no API key, no new proxy function, no Radar or Alerts
  request, no persistence key, no natural-language model.
- **No single composite score.** "Run score: 82" is forbidden; a tier plus its
  named binding constraint is the contract. If the binding constraint is ever
  not visible, this helper has become the safety score the non-goals forbid.
- **No WBGT estimate.** Derivable in principle, but it would be our number
  wearing a validated index's name — the wrong side of the cited/invented line
  every other row in §5 respects.
- **No medical, safety, or training advice.** No "skip this run", no hydration
  or pacing guidance, no heat-illness copy.
- No personal physiology model or dewpoint personalization in v1.
- No historical or vs-normal comparison in this helper.

---

## 9. Remaining implementation decisions

| ID | Decision | Why it needs the owner |
|---|---|---|
| **D-RUN-01** | Exact fixed dewpoint band edges and display labels | Convention (§5.1); specify once in the implementation contract, with no per-user setting. |
| **D-RUN-02** | Whether to promote heat/cold or wind/gust evidence into ranking factors | Requires an exact, disclosed mapping; otherwise they remain evidence-only. |
| **D-RUN-03** | Default run duration and offered set (30/45/60/90?) | Product shape; all starts remain hourly under §4.3. |
| **D-RUN-04** | Surface: extend the Outdoor-plan block, add a mode inside it, or a new tab | Affects scope materially. The Outdoor-plan block currently makes **no network request**; this helper does, so folding it in changes that block's contract. |
| **D-RUN-05** | Post-v1 future-day policy | It cannot rank beyond full evidence coverage or reuse tomorrow confidence as a distant-day claim. |
| **D-RUN-06** | Added hourly payload delivery | V1 displays only the current local day, but Open-Meteo applies `forecast_days` to the whole request. Choose explicitly between carrying the six new columns in the existing 11-day response and a separate day-scoped same-provider request. |

---

## 10. Sequencing note

§3.1 is not merely a parameter change: the new fields must cross the forecast
normalisation boundary. §3.2 is a response-shape change and carries most of the
cost. Build the typed, time-aligned hourly evidence layer first; build the Run
windows surface only after its remaining factor mappings and presentation choices
are specified.

This work is independent of the severe desk. It does not touch
`FND-SD-PROVIDER-CONTRACTS`, its sources, or any severe-desk Wave, and it
competes with them only for attention.
