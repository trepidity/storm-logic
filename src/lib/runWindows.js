import { isPrecipitatingHour } from './precipTiming.js'
import { hasHail, isThunderCode } from './weatherCodes.js'
import { usAqiCategory } from './usAqi.js'

const HOUR_MS = 60 * 60 * 1000
const FACTOR_ORDER = ['precipitation', 'thunder', 'dewpoint', 'uv', 'aqi']

function localStamp(time) {
  const match = typeof time === 'string' && time.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return null
  const [, year, month, day, hour, minute] = match.map(Number)
  const value = Date.UTC(year, month - 1, day, hour, minute)
  return Number.isFinite(value) ? value : null
}

function localTimeAt(stamp) {
  return new Date(stamp).toISOString().slice(0, 16)
}

function fahrenheit(value, unitId) {
  return unitId === 'metric' ? (value * 9) / 5 + 32 : value
}

function dewpointFactor(value, unitId) {
  const dewpoint = fahrenheit(value, unitId)
  if (!Number.isFinite(dewpoint)) return null
  if (dewpoint <= 55) return { id: 'dewpoint', tier: 0, label: 'Dewpoint ≤55°F' }
  if (dewpoint <= 60) return { id: 'dewpoint', tier: 1, label: 'Dewpoint 56–60°F' }
  if (dewpoint <= 70) return { id: 'dewpoint', tier: 2, label: 'Dewpoint 61–70°F' }
  return { id: 'dewpoint', tier: 3, label: 'Dewpoint >70°F' }
}

function uvFactor(value) {
  if (!Number.isFinite(value) || value < 0) return null
  if (value < 3) return { id: 'uv', tier: 0, label: 'UV Low' }
  if (value < 6) return { id: 'uv', tier: 1, label: 'UV Moderate' }
  if (value < 8) return { id: 'uv', tier: 2, label: 'UV High' }
  return { id: 'uv', tier: 3, label: 'UV Very High' }
}

function aqiFactor(value) {
  const category = usAqiCategory(value)
  if (!category) return null
  const tier = category.key === 'good' ? 0 : category.key === 'moderate' ? 1 : category.key === 'usg' ? 2 : 3
  return { id: 'aqi', tier, label: `US AQI ${category.label}` }
}

function factorsFor(hour, aqi, unitId) {
  if (!hour || !Number.isFinite(aqi) || !Number.isFinite(hour.weatherCode) || !Number.isFinite(hour.dewPoint) || !Number.isFinite(hour.uvIndex) || typeof hour.isDay !== 'boolean') {
    return null
  }
  if (!Number.isFinite(hour.precipitation) && !Number.isFinite(hour.precipChance)) return null

  const factors = [
    {
      id: 'precipitation',
      tier: isPrecipitatingHour(hour) ? 3 : 0,
      label: isPrecipitatingHour(hour) ? 'Precipitation' : 'No precipitation',
    },
    {
      id: 'thunder',
      tier: isThunderCode(hour.weatherCode) || hasHail(hour.weatherCode) ? 3 : 0,
      label: hasHail(hour.weatherCode) ? 'Thunderstorm hail signal' : isThunderCode(hour.weatherCode) ? 'Thunder signal' : 'No thunder signal',
    },
    dewpointFactor(hour.dewPoint, unitId),
    uvFactor(hour.uvIndex),
    aqiFactor(aqi),
  ]
  return factors.every(Boolean) ? factors : null
}

function nextHourStart(currentTime) {
  const stamp = localStamp(currentTime)
  if (stamp === null) return null
  return stamp % HOUR_MS === 0 ? stamp : Math.ceil(stamp / HOUR_MS) * HOUR_MS
}

/**
 * Rank remaining-local-day candidate starts by their worst evidenced factor.
 * This is intentionally not a health score: tied worst factors stay visible.
 */
export function deriveRunWindows({ hours, aqiByTime, currentTime, durationMinutes, unitId = 'imperial' }) {
  if (!Array.isArray(hours) || !(aqiByTime instanceof Map) || !Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    return { status: 'unavailable', windows: [] }
  }
  const firstStart = nextHourStart(currentTime)
  if (firstStart === null) return { status: 'unavailable', windows: [] }
  const ordered = hours
    .map((hour) => ({ hour, stamp: localStamp(hour?.time) }))
    .filter(({ stamp }) => stamp !== null)
    .sort((left, right) => left.stamp - right.stamp)
  if (!ordered.length) return { status: 'unavailable', windows: [] }

  const byStamp = new Map(ordered.map((entry) => [entry.stamp, entry.hour]))
  const lastDayStamp = ordered[ordered.length - 1].stamp + HOUR_MS
  const windows = []
  let hasPartial = false

  for (const { stamp } of ordered) {
    if (stamp < firstStart) continue
    const endStamp = stamp + durationMinutes * 60_000
    if (endStamp > lastDayStamp) continue
    const touched = []
    for (let bucket = stamp; bucket < endStamp; bucket += HOUR_MS) {
      const hour = byStamp.get(bucket)
      const factors = hour ? factorsFor(hour, aqiByTime.get(hour.time), unitId) : null
      if (!factors) {
        hasPartial = true
        touched.length = 0
        break
      }
      touched.push({ hour, factors })
    }
    if (!touched.length) continue
    const allFactors = touched.flatMap(({ factors }) => factors)
    const tier = Math.max(...allFactors.map((factor) => factor.tier))
    const constraints = FACTOR_ORDER
      .map((id) => allFactors.find((factor) => factor.id === id && factor.tier === tier))
      .filter(Boolean)
    const rankingTiers = FACTOR_ORDER
      .map((id) => Math.max(...allFactors.filter((factor) => factor.id === id).map((factor) => factor.tier)))
      .sort((left, right) => right - left)
    windows.push({
      startsAt: localTimeAt(stamp),
      endsAt: localTimeAt(endStamp),
      durationMinutes,
      tier,
      rankingTiers,
      constraints,
      daylight: touched.every(({ hour }) => hour.isDay),
    })
  }

  if (!windows.length && hasPartial) return { status: 'partial', windows: [] }
  windows.sort((left, right) => {
    if (left.tier !== right.tier) return left.tier - right.tier
    for (let index = 1; index < left.rankingTiers.length; index += 1) {
      if (left.rankingTiers[index] !== right.rankingTiers[index]) {
        return left.rankingTiers[index] - right.rankingTiers[index]
      }
    }
    return left.startsAt.localeCompare(right.startsAt)
  })
  return {
    status: 'ready',
    windows: windows.map(({ rankingTiers, ...window }) => window),
  }
}
