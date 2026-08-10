const HOUR_MS = 60 * 60 * 1000

function hourlyStamp(time) {
  const match = typeof time === 'string' && time.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):00$/)
  if (!match) return null
  const [, year, month, day, hour] = match
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour))
}

function amount(hour) {
  const value = hour?.precipitation
  return Number.isFinite(value) && value >= 0 ? value : null
}

function isWet(hour) {
  return (amount(hour) ?? 0) > 0
}

function isDry(hour) {
  return amount(hour) === 0
}

function consecutive(hours, start, end) {
  let previous = null
  for (let i = start; i <= end; i += 1) {
    const stamp = hourlyStamp(hours[i]?.time)
    if (stamp == null || (previous != null && stamp - previous !== HOUR_MS)) return false
    previous = stamp
  }
  return true
}

function sumAmounts(hours, start, end) {
  let total = 0
  for (let i = start; i <= end; i += 1) {
    const value = amount(hours[i])
    if (value == null) return null
    total += value
  }
  return total
}

/**
 * Derive a complete, ongoing precipitation event from retained hourly history
 * and the card's rolling forecast. Returns null until both event boundaries
 * are known, so a partial aggregate cannot pose as an event total.
 *
 * `history` must end immediately before `nextHours[0]`. The first next hour is
 * the current completed hourly boundary, so its amount belongs to "so far";
 * following wet hours are forecast remaining.
 */
export function derivePrecipEvent(history, nextHours) {
  if (!Array.isArray(history) || !Array.isArray(nextHours) || nextHours.length < 2) return null

  const hours = [...history, ...nextHours]
  const nowIndex = history.length
  if (!isWet(hours[nowIndex])) return null

  let eventStart = nowIndex
  while (eventStart > 0 && isWet(hours[eventStart - 1])) eventStart -= 1

  // A wet run that reaches our retained-history edge has an unknown beginning.
  // Do not call the known portion an event total.
  if (eventStart === 0 || !isDry(hours[eventStart - 1])) return null

  let firstDryIndex = -1
  for (let i = nowIndex + 1; i < hours.length; i += 1) {
    if (isDry(hours[i])) {
      firstDryIndex = i
      break
    }
    if (!isWet(hours[i])) return null
  }

  // The rolling forecast did not reach the end of this event.
  if (firstDryIndex < 0) return null

  // The dry boundary is part of the proof: a missing timestamp before it could
  // hide a wet hour and make both the event amount and dry time look certain.
  if (!consecutive(hours, eventStart - 1, firstDryIndex)) return null

  const soFar = sumAmounts(hours, eventStart, nowIndex)
  const remaining = sumAmounts(hours, nowIndex + 1, firstDryIndex - 1)
  if (soFar == null || remaining == null) return null

  return {
    startedAt: hours[eventStart].time,
    firstDryAt: hours[firstDryIndex].time,
    soFar,
    remaining,
    total: soFar + remaining,
  }
}
