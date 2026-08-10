import { UNIT_PRESETS } from './format.js'

const OPEN_METEO_FORECAST = 'https://api.open-meteo.com/v1/forecast'
const OPEN_METEO_GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search'

export const FORECAST_DAYS = 10

const CURRENT_VARS = [
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

const DAILY_VARS = [
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
// average it per day ourselves (see summariseCloudCover below).
const HOURLY_VARS = ['cloud_cover', 'temperature_2m', 'precipitation_probability', 'weather_code']

/**
 * In production the request goes through the Netlify function at /api/forecast,
 * which adds shared CDN caching so repeat visitors don't each hit Open-Meteo.
 * In `vite dev` there is no function runtime, so we call the API directly —
 * Open-Meteo sends permissive CORS headers, so this works from the browser.
 */
function buildForecastUrl({ latitude, longitude, unitId }) {
  const units = UNIT_PRESETS[unitId] ?? UNIT_PRESETS.imperial
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current: CURRENT_VARS.join(','),
    daily: DAILY_VARS.join(','),
    hourly: HOURLY_VARS.join(','),
    timezone: 'auto',
    forecast_days: String(FORECAST_DAYS),
    temperature_unit: units.temperature_unit,
    wind_speed_unit: units.wind_speed_unit,
    precipitation_unit: units.precipitation_unit,
  })

  if (import.meta.env.DEV) return `${OPEN_METEO_FORECAST}?${params}`

  return `/api/forecast?${new URLSearchParams({
    lat: latitude.toFixed(4),
    lon: longitude.toFixed(4),
    units: units.id,
  })}`
}

async function getJson(url, signal) {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = body?.reason || body?.error || ''
    } catch {
      /* response wasn't JSON — fall back to the status line */
    }
    throw new Error(detail || `Request failed (${res.status})`)
  }
  return res.json()
}

/**
 * Average the hourly cloud cover series into per-day values.
 *
 * Two means are produced: the full 24h average, and a daylight-only average
 * bounded by that day's sunrise and sunset. The daylight figure is what gets
 * shown, because overnight cloud isn't what anyone means when they ask how
 * cloudy a day will be.
 */
function summariseCloudCover(hourly, daily) {
  const sunriseHour = new Map()
  const sunsetHour = new Map()
  const dates = daily?.time ?? []

  dates.forEach((date, i) => {
    const rise = daily?.sunrise?.[i]
    const set = daily?.sunset?.[i]
    if (typeof rise === 'string') sunriseHour.set(date, Number(rise.slice(11, 13)))
    if (typeof set === 'string') sunsetHour.set(date, Number(set.slice(11, 13)))
  })

  const byDate = new Map()
  const times = hourly?.time ?? []
  const values = hourly?.cloud_cover ?? []

  for (let i = 0; i < times.length; i += 1) {
    const value = values[i]
    if (!Number.isFinite(value)) continue

    const stamp = times[i]
    const date = stamp.slice(0, 10)
    const hour = Number(stamp.slice(11, 13))
    const bucket = byDate.get(date) ?? { allSum: 0, allCount: 0, daySum: 0, dayCount: 0 }

    bucket.allSum += value
    bucket.allCount += 1

    const rise = sunriseHour.get(date)
    const set = sunsetHour.get(date)
    // Polar day/night and missing sun times fall back to the 24h window.
    const inDaylight =
      !Number.isFinite(rise) || !Number.isFinite(set) || (hour >= rise && hour <= set)
    if (inDaylight) {
      bucket.daySum += value
      bucket.dayCount += 1
    }

    byDate.set(date, bucket)
  }

  const means = new Map()
  for (const [date, b] of byDate) {
    means.set(date, {
      all: b.allCount ? Math.round(b.allSum / b.allCount) : null,
      day: b.dayCount ? Math.round(b.daySum / b.dayCount) : null,
    })
  }
  return means
}

export const HOURLY_WINDOW = 24

/**
 * The next 24 hours starting from the current hour.
 *
 * Day/night is derived from each date's sunrise/sunset rather than requesting
 * the hourly `is_day` field — one fewer variable that can invalidate the whole
 * request, and we already have the sun times.
 */
function buildHours(payload, days) {
  const hourly = payload.hourly ?? {}
  const times = hourly.time ?? []
  const nowIso = payload.current?.time
  if (!times.length || typeof nowIso !== 'string') return []

  // ISO prefixes compare correctly as strings, so no Date parsing is needed.
  const nowKey = nowIso.slice(0, 13)
  let start = times.findIndex((t) => t.slice(0, 13) >= nowKey)
  if (start < 0) start = 0

  const sun = new Map(days.map((d) => [d.date, d]))

  return times.slice(start, start + HOURLY_WINDOW).map((time, offset) => {
    const i = start + offset
    const date = time.slice(0, 10)
    const hour = Number(time.slice(11, 13))
    const day = sun.get(date)
    const rise = typeof day?.sunrise === 'string' ? Number(day.sunrise.slice(11, 13)) : 6
    const set = typeof day?.sunset === 'string' ? Number(day.sunset.slice(11, 13)) : 20

    return {
      time,
      hour,
      isNow: offset === 0,
      temperature: hourly.temperature_2m?.[i] ?? null,
      weatherCode: hourly.weather_code?.[i] ?? null,
      precipChance: hourly.precipitation_probability?.[i] ?? null,
      cloudCover: hourly.cloud_cover?.[i] ?? null,
      isDay: hour >= rise && hour <= set,
    }
  })
}

/** Reshape the parallel-array payload into one object per day. */
function normalise(payload) {
  const daily = payload.daily ?? {}
  const cloudByDate = summariseCloudCover(payload.hourly, daily)
  const pick = (key, i) => daily[key]?.[i] ?? null

  const days = (daily.time ?? []).map((date, i) => ({
    date,
    weatherCode: pick('weather_code', i),
    tempMax: pick('temperature_2m_max', i),
    tempMin: pick('temperature_2m_min', i),
    feelsMax: pick('apparent_temperature_max', i),
    feelsMin: pick('apparent_temperature_min', i),
    sunrise: pick('sunrise', i),
    sunset: pick('sunset', i),
    daylightSeconds: pick('daylight_duration', i),
    sunshineSeconds: pick('sunshine_duration', i),
    uvIndexMax: pick('uv_index_max', i),
    precipSum: pick('precipitation_sum', i),
    rainSum: pick('rain_sum', i),
    showersSum: pick('showers_sum', i),
    snowSum: pick('snowfall_sum', i),
    precipHours: pick('precipitation_hours', i),
    precipChance: pick('precipitation_probability_max', i),
    windMax: pick('wind_speed_10m_max', i),
    gustMax: pick('wind_gusts_10m_max', i),
    windDirection: pick('wind_direction_10m_dominant', i),
    cloudCoverMean: cloudByDate.get(date)?.all ?? null,
    cloudCoverDay: cloudByDate.get(date)?.day ?? cloudByDate.get(date)?.all ?? null,
  }))

  const c = payload.current ?? {}
  const current = {
    time: c.time ?? null,
    temperature: c.temperature_2m ?? null,
    feelsLike: c.apparent_temperature ?? null,
    humidity: c.relative_humidity_2m ?? null,
    isDay: c.is_day === 1,
    precipitation: c.precipitation ?? null,
    rain: c.rain ?? null,
    showers: c.showers ?? null,
    snowfall: c.snowfall ?? null,
    weatherCode: c.weather_code ?? null,
    cloudCover: c.cloud_cover ?? null,
    pressure: c.pressure_msl ?? null,
    windSpeed: c.wind_speed_10m ?? null,
    windDirection: c.wind_direction_10m ?? null,
    windGusts: c.wind_gusts_10m ?? null,
  }

  return {
    current,
    days,
    hours: buildHours(payload, days),
    timezone: payload.timezone ?? null,
    timezoneAbbreviation: payload.timezone_abbreviation ?? null,
    elevation: payload.elevation ?? null,
    fetchedAt: Date.now(),
  }
}

export async function fetchForecast({ latitude, longitude, unitId }, signal) {
  const payload = await getJson(buildForecastUrl({ latitude, longitude, unitId }), signal)
  return normalise(payload)
}

export async function searchPlaces(query, signal) {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const params = new URLSearchParams({
    name: trimmed,
    count: '6',
    language: 'en',
    format: 'json',
  })
  const payload = await getJson(`${OPEN_METEO_GEOCODE}?${params}`, signal)

  return (payload.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    country: r.country ?? '',
    countryCode: r.country_code ?? '',
    admin1: r.admin1 ?? '',
    label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
  }))
}

export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This browser does not support location access.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          label: 'My location',
          id: 'geo',
        }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission was denied.'
              : 'Could not determine your location.',
          ),
        ),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    )
  })
}
