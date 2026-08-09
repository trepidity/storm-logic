/**
 * WMO 4677 weather interpretation codes as returned by Open-Meteo.
 *
 * Open-Meteo has no standalone "hail" variable — hail is only ever reported
 * through codes 96 and 99 ("thunderstorm with slight / heavy hail"). That is
 * the single source of truth for the hail badge in this app.
 */

const CLEAR = 'clear'
const CLOUD = 'cloud'
const FOG = 'fog'
const DRIZZLE = 'drizzle'
const RAIN = 'rain'
const SNOW = 'snow'
const THUNDER = 'thunder'

export const WEATHER_CODES = {
  0: { label: 'Clear sky', short: 'Clear', group: CLEAR, day: '☀️', night: '🌙' },
  1: { label: 'Mainly clear', short: 'Mostly clear', group: CLEAR, day: '🌤️', night: '🌙' },
  2: { label: 'Partly cloudy', short: 'Partly cloudy', group: CLOUD, day: '⛅', night: '☁️' },
  3: { label: 'Overcast', short: 'Overcast', group: CLOUD, day: '☁️', night: '☁️' },

  45: { label: 'Fog', short: 'Fog', group: FOG, day: '🌫️', night: '🌫️' },
  48: { label: 'Depositing rime fog', short: 'Rime fog', group: FOG, day: '🌫️', night: '🌫️' },

  51: { label: 'Light drizzle', short: 'Drizzle', group: DRIZZLE, day: '🌦️', night: '🌧️' },
  53: { label: 'Moderate drizzle', short: 'Drizzle', group: DRIZZLE, day: '🌦️', night: '🌧️' },
  55: { label: 'Dense drizzle', short: 'Drizzle', group: DRIZZLE, day: '🌧️', night: '🌧️' },
  56: { label: 'Light freezing drizzle', short: 'Freezing drizzle', group: DRIZZLE, freezing: true, day: '🌧️', night: '🌧️' },
  57: { label: 'Dense freezing drizzle', short: 'Freezing drizzle', group: DRIZZLE, freezing: true, day: '🌧️', night: '🌧️' },

  61: { label: 'Slight rain', short: 'Light rain', group: RAIN, day: '🌦️', night: '🌧️' },
  63: { label: 'Moderate rain', short: 'Rain', group: RAIN, day: '🌧️', night: '🌧️' },
  65: { label: 'Heavy rain', short: 'Heavy rain', group: RAIN, day: '🌧️', night: '🌧️' },
  66: { label: 'Light freezing rain', short: 'Freezing rain', group: RAIN, freezing: true, day: '🌧️', night: '🌧️' },
  67: { label: 'Heavy freezing rain', short: 'Freezing rain', group: RAIN, freezing: true, day: '🌧️', night: '🌧️' },

  71: { label: 'Slight snowfall', short: 'Light snow', group: SNOW, day: '🌨️', night: '🌨️' },
  73: { label: 'Moderate snowfall', short: 'Snow', group: SNOW, day: '❄️', night: '❄️' },
  75: { label: 'Heavy snowfall', short: 'Heavy snow', group: SNOW, day: '❄️', night: '❄️' },
  77: { label: 'Snow grains', short: 'Snow grains', group: SNOW, day: '🌨️', night: '🌨️' },

  80: { label: 'Slight rain showers', short: 'Showers', group: RAIN, day: '🌦️', night: '🌧️' },
  81: { label: 'Moderate rain showers', short: 'Showers', group: RAIN, day: '🌧️', night: '🌧️' },
  82: { label: 'Violent rain showers', short: 'Downpours', group: RAIN, day: '⛈️', night: '⛈️' },

  85: { label: 'Slight snow showers', short: 'Snow showers', group: SNOW, day: '🌨️', night: '🌨️' },
  86: { label: 'Heavy snow showers', short: 'Snow showers', group: SNOW, day: '❄️', night: '❄️' },

  95: { label: 'Thunderstorm', short: 'Thunderstorm', group: THUNDER, day: '⛈️', night: '⛈️' },
  96: { label: 'Thunderstorm with slight hail', short: 'Storm + hail', group: THUNDER, hail: true, day: '⛈️', night: '⛈️' },
  99: { label: 'Thunderstorm with heavy hail', short: 'Storm + heavy hail', group: THUNDER, hail: true, day: '⛈️', night: '⛈️' },
}

const UNKNOWN = { label: 'Unknown', short: 'Unknown', group: CLOUD, day: '❔', night: '❔' }

export function describeCode(code) {
  return WEATHER_CODES[code] ?? UNKNOWN
}

export function iconFor(code, isDay = true) {
  const entry = describeCode(code)
  return isDay ? entry.day : entry.night
}

/** True when the code itself reports hail (96, 99 only). */
export function hasHail(code) {
  return Boolean(describeCode(code).hail)
}

export function isSnowCode(code) {
  return describeCode(code).group === SNOW
}

export function isRainCode(code) {
  const g = describeCode(code).group
  return g === RAIN || g === DRIZZLE
}

export function isThunderCode(code) {
  return describeCode(code).group === THUNDER
}

export function isFreezing(code) {
  return Boolean(describeCode(code).freezing)
}

/**
 * Background theme key for the sky gradient. Kept deliberately coarse so the
 * palette stays legible rather than turning into 30 near-identical gradients.
 */
export function skyTheme(code, isDay) {
  const group = describeCode(code).group
  if (!isDay) return group === THUNDER ? 'night-storm' : 'night'
  switch (group) {
    case CLEAR:
      return 'clear'
    case CLOUD:
      return 'cloudy'
    case FOG:
      return 'fog'
    case SNOW:
      return 'snow'
    case THUNDER:
      return 'storm'
    default:
      return 'rain'
  }
}

export const GROUPS = { CLEAR, CLOUD, FOG, DRIZZLE, RAIN, SNOW, THUNDER }
