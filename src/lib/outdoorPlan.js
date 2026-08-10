import { isPrecipitatingHour } from './precipTiming.js'
import { hasHail, isThunderCode } from './weatherCodes.js'

function localHourNumber(time, date) {
  if (typeof time !== 'string' || typeof date !== 'string') return null
  const match = time.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/)
  if (!match || match[1] !== date) return null

  const hour = Number(match[2])
  const minute = Number(match[3])
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || minute !== 0) return null

  const [year, month, day] = date.split('-').map(Number)
  const epoch = Date.UTC(year, month - 1, day, hour)
  const parsed = new Date(epoch)
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour
  ) {
    return null
  }

  return epoch / 3_600_000
}

function hasPrecipEvidence(hour) {
  if (!hour || typeof hour !== 'object') return false
  if (hour.precipitation != null && Number.isFinite(Number(hour.precipitation))) return true
  return hour.precipChance != null && Number.isFinite(Number(hour.precipChance))
}

/**
 * Find the longest continuous dry daylight window for a normalised forecast
 * day. An unknown or gapped daylight hour makes the result unavailable rather
 * than allowing a misleading window to bridge it.
 */
export function deriveOutdoorPlan(day) {
  if (!day || !Array.isArray(day.hours) || day.hours.length === 0 || typeof day.date !== 'string') return null

  const daylight = day.hours
    .map((hour, index) => ({ hour, index, localHour: localHourNumber(hour?.time, day.date) }))
    .filter(({ hour }) => hour?.isDay)

  if (
    daylight.length === 0 ||
    daylight.some(({ hour, localHour }, index) =>
      localHour == null ||
      !hasPrecipEvidence(hour) ||
      (index > 0 && localHour !== daylight[index - 1].localHour + 1),
    )
  ) {
    return null
  }

  let best = null
  let runStart = null

  for (const entry of daylight) {
    if (isPrecipitatingHour(entry.hour)) {
      runStart = null
      continue
    }

    if (runStart == null) runStart = entry
    const hours = entry.localHour - runStart.localHour + 1
    if (!best || hours > best.hours) best = { start: runStart, end: entry, hours }
  }

  let window = null
  if (best) {
    const endBoundary = day.hours[best.end.index + 1]
    if (!endBoundary || localHourNumber(endBoundary.time, day.date) !== best.end.localHour + 1) return null
    window = {
      startsAt: best.start.hour.time,
      endsAt: endBoundary.time,
      hours: best.hours,
    }
  }

  return {
    window,
    gustMax: Number.isFinite(Number(day.gustMax)) ? Number(day.gustMax) : null,
    uvIndexMax: Number.isFinite(Number(day.uvIndexMax)) ? Number(day.uvIndexMax) : null,
    thunder: isThunderCode(day.weatherCode),
    hail: hasHail(day.weatherCode),
  }
}
