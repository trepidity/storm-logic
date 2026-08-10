export const ENSEMBLE_MEMBER_COUNT = 30

function hourlyIndexesForDate(times, date) {
  if (!Array.isArray(times) || typeof date !== 'string') return null

  const indexes = []
  const seenHours = new Set()
  for (let index = 0; index < times.length; index += 1) {
    const stamp = times[index]
    if (typeof stamp !== 'string' || !stamp.startsWith(`${date}T`)) continue
    const match = stamp.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):00$/)
    if (!match || seenHours.has(match[1])) return null
    seenHours.add(match[1])
    indexes.push(index)
  }

  // `timezone=auto` returns local wall-clock hours. A normal local day has 24
  // slots; suppress the reading on DST-transition days rather than quietly
  // treating a 23/25-hour day as an equivalent ensemble aggregate.
  return indexes.length === 24 ? indexes : null
}

function percentile(values, fraction) {
  const ordered = [...values].sort((a, b) => a - b)
  const position = (ordered.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return ordered[lower]
  const progress = position - lower
  return ordered[lower] + (ordered[upper] - ordered[lower]) * progress
}

function cleanNumber(value) {
  return Number(value.toFixed(6))
}

/**
 * Derive the forecast range from the central 80% of NCEP GEFS members.
 *
 * This intentionally does not use Open-Meteo's deterministic/mean columns:
 * `high` is each member's local-day high, while `precipitation` is each
 * member's local-day total. A missing member or hourly slot yields `null`, so
 * an incomplete source never appears as unusually strong agreement.
 */
export function deriveTomorrowConfidence(payload, date) {
  const hourly = payload?.hourly
  const indexes = hourlyIndexesForDate(hourly?.time, date)
  if (!indexes) return null

  const memberHighs = []
  const memberPrecipitation = []

  for (let memberIndex = 1; memberIndex <= ENSEMBLE_MEMBER_COUNT; memberIndex += 1) {
    const member = String(memberIndex).padStart(2, '0')
    const temperatures = hourly[`temperature_2m_member${member}`]
    const precipitation = hourly[`precipitation_member${member}`]
    if (!Array.isArray(temperatures) || !Array.isArray(precipitation)) return null

    let high = -Infinity
    let total = 0
    for (const index of indexes) {
      const temperature = temperatures[index]
      const amount = precipitation[index]
      if (!Number.isFinite(temperature) || !Number.isFinite(amount)) return null
      high = Math.max(high, temperature)
      total += amount
    }
    memberHighs.push(high)
    memberPrecipitation.push(total)
  }

  const temperatureLow = percentile(memberHighs, 0.1)
  const temperatureHigh = percentile(memberHighs, 0.9)
  const precipitationLow = percentile(memberPrecipitation, 0.1)
  const precipitationHigh = percentile(memberPrecipitation, 0.9)
  if (![temperatureLow, temperatureHigh, precipitationLow, precipitationHigh].every(Number.isFinite)) {
    return null
  }

  return {
    date,
    memberCount: ENSEMBLE_MEMBER_COUNT,
    temperature: { low: Math.round(temperatureLow), high: Math.round(temperatureHigh) },
    precipitation: { low: cleanNumber(precipitationLow), high: cleanNumber(precipitationHigh) },
  }
}
