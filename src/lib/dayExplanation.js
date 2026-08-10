/**
 * A deliberately small, deterministic reading of an expanded forecast day.
 * It only consumes numbers already visible in the day row and its hourly
 * strip; it never invents a provider interpretation or free-form prose.
 */
import { compassPoint, roundTemp } from './format.js'
import { precipTiming, formatApproxHour } from './precipTiming.js'
import { summariseDay } from './daySummary.js'

const BREEZY_MPH = 15
const BREEZY_KMH = 24

function breezyThreshold(units) {
  return units?.windSuffix === 'km/h' ? BREEZY_KMH : BREEZY_MPH
}

function conditionClause(day) {
  const summary = summariseDay(day)
  const timing = precipTiming(day.hours)

  if (summary.precip === 'likely') {
    const at = timing.kind === 'starts' ? formatApproxHour(timing.startsAt) : null
    return at ? `${summary.short} likely around ${at}` : `${summary.short} likely`
  }

  if (summary.precip === 'possible') {
    const at = timing.kind === 'starts' ? formatApproxHour(timing.startsAt) : null
    return at ? `${summary.short} around ${at}` : summary.short
  }

  return summary.short
}

/**
 * Return a bounded explanation for one selected calendar day, or null when a
 * trustworthy high and local hourly context are unavailable.
 *
 * @param {object|null|undefined} day normalised forecast day
 * @param {{ windSuffix?: string }|null|undefined} units active display units
 * @returns {string|null}
 */
export function explainDay(day, units) {
  if (!day || !Number.isFinite(day.tempMax) || !Array.isArray(day.hours) || !day.hours.length) {
    return null
  }

  const clauses = [conditionClause(day)]
  if (Number.isFinite(day.windMax) && day.windMax >= breezyThreshold(units)) {
    const direction = compassPoint(day.windDirection)
    clauses.push(direction === '—' ? 'breezy winds' : `breezy ${direction} winds`)
  }
  clauses.push(`high near ${roundTemp(day.tempMax)}°`)

  return `${clauses.join(', ')}.`
}
