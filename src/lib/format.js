/** Presentation helpers. All formatting lives here so components stay declarative. */

export const UNIT_PRESETS = {
  imperial: {
    id: 'imperial',
    label: '°F',
    symbol: 'F',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    tempSuffix: '°',
    windSuffix: 'mph',
    precipSuffix: 'in',
    precipDigits: 2,
  },
  metric: {
    id: 'metric',
    label: '°C',
    symbol: 'C',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
    tempSuffix: '°',
    windSuffix: 'km/h',
    precipSuffix: 'mm',
    precipDigits: 1,
  },
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

export function compassPoint(degrees) {
  if (!Number.isFinite(degrees)) return '—'
  return COMPASS[Math.round(degrees / 22.5) % 16]
}

export function roundTemp(value) {
  return Number.isFinite(value) ? Math.round(value) : null
}

export function formatTemp(value, units) {
  const t = roundTemp(value)
  return t === null ? '—' : `${t}${units.tempSuffix}`
}

export function formatWind(value, units) {
  return Number.isFinite(value) ? `${Math.round(value)} ${units.windSuffix}` : '—'
}

export function formatPrecip(value, units) {
  if (!Number.isFinite(value) || value <= 0) return null
  return `${value.toFixed(units.precipDigits)} ${units.precipSuffix}`
}

/**
 * Open-Meteo returns local wall-clock ISO strings with no timezone offset
 * (e.g. "2026-08-09T06:12") when timezone=auto. Parsing them with `new Date()`
 * would apply the *browser's* zone, so we read the parts directly instead.
 */
export function parseLocalIso(iso) {
  if (typeof iso !== 'string') return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h = '0', mi = '0'] = m
  return {
    year: +y,
    month: +mo,
    day: +d,
    hour: +h,
    minute: +mi,
    /** Minutes since local midnight — used for the sun-arc position. */
    minutesOfDay: +h * 60 + +mi,
    /** A Date in the *browser's* zone whose fields match the local wall clock. */
    asLocalDate: new Date(+y, +mo - 1, +d, +h, +mi),
  }
}

export function formatClock(iso, hour12 = true) {
  const parsed = parseLocalIso(iso)
  if (!parsed) return '—'
  return parsed.asLocalDate.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
  })
}

export function formatDayName(iso, index) {
  if (index === 0) return 'Today'
  if (index === 1) return 'Tomorrow'
  const parsed = parseLocalIso(iso)
  if (!parsed) return '—'
  return parsed.asLocalDate.toLocaleDateString(undefined, { weekday: 'long' })
}

export function formatShortDate(iso) {
  const parsed = parseLocalIso(iso)
  if (!parsed) return ''
  return parsed.asLocalDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—'
  const total = Math.round(seconds / 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function cloudLabel(percent) {
  if (!Number.isFinite(percent)) return 'Unknown'
  if (percent < 12) return 'Clear'
  if (percent < 35) return 'Mostly clear'
  if (percent < 65) return 'Partly cloudy'
  if (percent < 88) return 'Mostly cloudy'
  return 'Overcast'
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
