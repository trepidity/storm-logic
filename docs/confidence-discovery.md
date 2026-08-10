# Forecast-confidence decision record

Authority: `docs/api-and-product-brainstorm.md#31-open-meteo-highest-leverage-no-new-vendor`,
`docs/api-and-product-brainstorm.md#42-confidence-and-disagreement`, phase 6
in `docs/implementation-roadmap-phases-4-8.md`, and user approval on
2026-08-10.

## Accepted product boundary

- **Surface:** one compact block in Tomorrow's already-expanded forecast row.
  It has no tab, navigation item, persistence, or request while that row is
  closed, keeping Forecast's normal list clean.
- **Source:** Open-Meteo Ensemble API, fixed to the global NCEP GEFS Seamless
  model (`ncep_gefs_seamless`). Dev calls the API directly; production calls
  the cached `/api/confidence` proxy.
- **Wording:** `Ensemble spread`; `High low–high`; `Rain low–high`; and
  `Middle 80% of 30 NCEP GEFS members`. There is deliberately no subjective
  “high/moderate/low confidence” label or threshold.
- **Freshness:** the CDN keeps a response for three hours and may serve it
  stale for another three. NCEP GEFS Seamless updates every 12 hours, so this
  avoids both per-user fan-out and a full-run stale cache.

## Provider contract and derivation

Open-Meteo's ensemble service uses
`https://ensemble-api.open-meteo.com/v1/ensemble`. The fixed request is:

```text
hourly=temperature_2m,precipitation
models=ncep_gefs_seamless
forecast_days=2
timezone=auto
temperature_unit=<active preset>
precipitation_unit=<active preset>
```

The NCEP GEFS response supplies the model mean plus 30 numbered member columns.
The mean/spread documentation describes aggregate fields, but the verified NCEP
response did not populate the requested `*_spread` arrays. V1 therefore uses
the actual member series rather than displaying a missing or fabricated spread:

1. Take the full local tomorrow (24 hourly slots) for each of the 30 members.
2. Calculate each member's daily high and daily precipitation total.
3. Report the 10th–90th percentile of those 30 values as the middle-80% range.

This makes both values truthful ensemble summaries: high-temperature variation
is based on daily highs, and rain variation is based on daily accumulated rain,
not an unrelated maximum hourly deviation.

## Integrity and failure policy

The reading is unavailable when the source lacks any numbered member, any
tomorrow value is non-numeric, or tomorrow does not contain exactly 24 local
hourly slots. The last rule intentionally fail-closes DST transition days in
v1 instead of silently treating a 23- or 25-hour day as an ordinary daily
aggregate. Transport/service failure uses the same visible unavailable state.

Sources:

- [Open-Meteo Ensemble API](https://open-meteo.com/en/docs/ensemble-api)
- [Open-Meteo Ensemble Mean API](https://open-meteo.com/en/docs/ensemble-mean-api)
