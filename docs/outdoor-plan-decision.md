# Outdoor-plan decision record

Authority: user approval to implement roadmap Phase 8 on 2026-08-10, following
the approved recommendation that the first decision helper is the Outdoor-plan
flow inside an expanded forecast day.

## Product boundary

- **Surface:** an **Outdoor plan** block in every expanded forecast-day detail,
  above that day's metrics and hourly strip. It is not a tab and makes no new
  network request.
- **Question answered:** when is the longest dry daylight stretch on this day?
  The block does not label weather “safe”, “unsafe”, or make the user's choice.
- **Visible evidence:** longest dry daylight interval; the selected day’s
  maximum gust, UV index, and thunder/hail signal.
- **Weather rule:** an hour is wet exactly when the shared `precipTiming`
  rule says it is wet—measured precipitation above zero, or, only when the
  amount is unavailable, precipitation chance at least 40%.
- **Integrity:** the helper is unavailable unless every daylight hour has a
  valid local time and usable precipitation evidence. It never joins across a
  missing/unknown hour. A fully wet daylight period truthfully says that no dry
  daylight window is shown.

## Non-goals

- No new provider, Radar or Alerts request, persistence key, tab, safety score,
  medical/safety advice, or natural-language model.
- NWS alerts remain their own authoritative Alerts surface; this block only
  exposes the forecast day’s existing thunder/hail signal.
