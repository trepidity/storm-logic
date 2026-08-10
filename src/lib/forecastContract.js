/**
 * Open-Meteo forecast request contract.
 *
 * Single source of truth for the upstream query shape. Both the browser path
 * (dev: direct Open-Meteo) and the Netlify proxy (prod: /api/forecast → upstream)
 * must build from here. Duplicating the variable lists was the main structural
 * risk: a field added on one side only ships green in one environment and wrong
 * in the other.
 */

import { UNIT_PRESETS } from './format.js'

export const OPEN_METEO_FORECAST = 'https://api.open-meteo.com/v1/forecast'

/**
 * Eleven, not ten. The list skips today (the current-conditions card covers it),
 * so one extra day keeps a full ten showing ahead. days[0] is still used — it
 * feeds the card's high/low, sun times, UV and rain chance.
 */
export const FORECAST_DAYS = 11

/**
 * One past calendar day of hourly data so we can sum precipitation over the
 * rolling last 24 hours ending at the latest completed hourly boundary. Daily series also gains that day —
 * api.js drops it so days[0] remains today.
 */
export const PAST_DAYS = 1

export const CURRENT_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'is_day',
  'precipitation',
  'rain',
  'showers',
  'snowfall',
  'weather_code',
  'cloud_cover',
  'pressure_msl',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
]

export const DAILY_VARS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'apparent_temperature_min',
  'sunrise',
  'sunset',
  'daylight_duration',
  'sunshine_duration',
  'uv_index_max',
  'precipitation_sum',
  'rain_sum',
  'showers_sum',
  'snowfall_sum',
  'precipitation_hours',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'wind_direction_10m_dominant',
]

// Open-Meteo has no daily cloud-cover variable, so we pull it hourly and
// average it per day ourselves (see summariseCloudCover in api.js).
// `precipitation` is the preceding-hour sum — used for last-24h totals on the card.
export const HOURLY_VARS = [
  'cloud_cover',
  'temperature_2m',
  'precipitation_probability',
  'precipitation',
  'weather_code',
]

/**
 * Build the Open-Meteo forecast query shared by browser (dev) and Netlify proxy.
 *
 * @param {object} opts
 * @param {number} opts.latitude
 * @param {number} opts.longitude
 * @param {string} [opts.unitId]  'imperial' | 'metric'
 * @param {number} [opts.coordDecimals]
 *   Dev uses 4 (~11 m). The proxy uses 2 (~1 km) so nearby visitors share a CDN
 *   cache entry — intentional, not a parity bug.
 */
export function buildUpstreamForecastParams({
  latitude,
  longitude,
  unitId = 'imperial',
  coordDecimals = 4,
}) {
  const units = UNIT_PRESETS[unitId] ?? UNIT_PRESETS.imperial
  return new URLSearchParams({
    latitude: Number(latitude).toFixed(coordDecimals),
    longitude: Number(longitude).toFixed(coordDecimals),
    current: CURRENT_VARS.join(','),
    daily: DAILY_VARS.join(','),
    hourly: HOURLY_VARS.join(','),
    timezone: 'auto',
    forecast_days: String(FORECAST_DAYS),
    past_days: String(PAST_DAYS),
    temperature_unit: units.temperature_unit,
    wind_speed_unit: units.wind_speed_unit,
    precipitation_unit: units.precipitation_unit,
  })
}

export function buildUpstreamForecastUrl(opts) {
  return `${OPEN_METEO_FORECAST}?${buildUpstreamForecastParams(opts)}`
}
