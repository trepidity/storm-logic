/**
 * Derive precip start/end timing from the rolling next-24h hourly series.
 * Pure — no fetch, no DOM. Hours come from buildNextHours / hourEntry.
 *
 * Wet-hour rule:
 *   - If `precipitation` is a finite number on the entry → wet when > 0
 *   - Else fall back to precipChance >= 40 (daySummary LIKELY threshold)
 */

import { parseLocalIso } from './format.js'

/** Probability at which chance alone counts as a wet signal (matches daySummary). */
export const PRECIP_LIKELY = 40

/**
 * Compact wall-clock like "3pm" / "11am" from a local ISO string.
 * Uses parseLocalIso so bare Open-Meteo stamps aren't shifted by the browser zone.
 */
export function formatApproxHour(iso) {
  const parsed = parseLocalIso(iso)
  if (!parsed) return null
  return parsed.asLocalDate
    .toLocaleTimeString(undefined, { hour: 'numeric', hour12: true })
    .replace(/\s?([AP])M/i, (_, m) => m.toLowerCase() + 'm')
}

/**
 * True when this hour counts as precipitating for timing purposes.
 * @param {{ precipitation?: number|null, precipChance?: number|null }} hour
 */
export function isPrecipitatingHour(hour) {
  if (!hour || typeof hour !== 'object') return false

  const amount = hour.precipitation
  if (amount != null && Number.isFinite(Number(amount))) {
    return Number(amount) > 0
  }

  const chance = Number(hour.precipChance)
  return Number.isFinite(chance) && chance >= PRECIP_LIKELY
}

/**
 * Scan next-24 hours for precip timing.
 *
 * @param {Array<{ time: string, precipitation?: number|null, precipChance?: number|null, isNow?: boolean }>} hours
 * @returns {{ kind: 'none'|'ongoing'|'starts', startsAt: string|null, endsAt: string|null, label: string }}
 */
export function precipTiming(hours) {
  const empty = {
    kind: 'none',
    startsAt: null,
    endsAt: null,
    label: 'No precip expected next 24h',
  }

  if (!Array.isArray(hours) || hours.length === 0) return empty

  const wet = hours.map(isPrecipitatingHour)

  const firstDryAfter = (fromIdx) => {
    for (let i = fromIdx; i < hours.length; i += 1) {
      if (!wet[i]) return hours[i].time ?? null
    }
    return null
  }

  // Current / first column wet → precip already under way.
  if (wet[0]) {
    const endsAt = firstDryAfter(1)
    const endClock = endsAt ? formatApproxHour(endsAt) : null
    return {
      kind: 'ongoing',
      startsAt: null,
      endsAt,
      label: endClock
        ? `Rain ending ~${endClock}`
        : 'Rain continuing next 24h',
    }
  }

  // First hour dry — find first wet hour later in the window.
  let startIdx = -1
  for (let i = 1; i < hours.length; i += 1) {
    if (wet[i]) {
      startIdx = i
      break
    }
  }

  if (startIdx < 0) return empty

  const startsAt = hours[startIdx].time ?? null
  const endsAt = firstDryAfter(startIdx + 1)
  const startClock = startsAt ? formatApproxHour(startsAt) : null

  return {
    kind: 'starts',
    startsAt,
    endsAt,
    label: startClock
      ? `Rain starting ~${startClock}`
      : 'Rain expected next 24h',
  }
}
