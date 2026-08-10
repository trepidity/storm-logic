import { UNIT_PRESETS } from './format.js'
import {
  FORECAST_DAYS,
  buildUpstreamForecastUrl,
} from './forecastContract.js'
import { isUsAqiCoverage, normaliseCurrentAirQuality } from './usAqi.js'

export { FORECAST_DAYS }

/** Hours included in the "last 24 hours" precipitation total. */
export const PRECIP_LOOKBACK_HOURS = 24

const OPEN_METEO_GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search'
// Open-Meteo has search + get-by-id only — no reverse. This client endpoint is
// keyless and CORS-friendly; used solely to name a geolocated fix.
const REVERSE_GEOCODE = 'https://api.bigdatacloud.net/data/reverse-geocode-client'
const NWS_ACTIVE_ALERTS = 'https://api.weather.gov/alerts/active'
const OPEN_METEO_AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality'
// A city name is helpful, but never worth holding the location flow hostage.
const REVERSE_GEOCODE_TIMEOUT_MS = 2_000

/**
 * In production the request goes through the Netlify function at /api/forecast,
 * which adds shared CDN caching so repeat visitors don't each hit Open-Meteo.
 * In `vite dev` there is no function runtime, so we call the API directly —
 * Open-Meteo sends permissive CORS headers, so this works from the browser.
 *
 * Upstream field lists live in forecastContract.js (shared with the proxy).
 *
 * @param {{ latitude: number, longitude: number, unitId: string }} opts
 * @param {{ mode?: 'direct' | 'proxy' }} [options]
 *   Defaults from Vite's import.meta.env.DEV. Pass `mode` explicitly in tests
 *   so Node can exercise the direct path without a Vite runtime.
 */
export function buildForecastUrl({ latitude, longitude, unitId }, options = {}) {
  const units = UNIT_PRESETS[unitId] ?? UNIT_PRESETS.imperial
  const mode =
    options.mode ??
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV
      ? 'direct'
      : 'proxy')

  if (mode === 'direct') {
    return buildUpstreamForecastUrl({ latitude, longitude, unitId, coordDecimals: 4 })
  }

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
    const error = new Error(detail || `Request failed (${res.status})`)
    error.status = res.status
    throw error
  }
  return res.json()
}

/**
 * Combine an optional caller abort with a local deadline. The browser fetch
 * observes the returned signal; clearing both registrations avoids keeping a
 * completed lookup alive in the background.
 */
function boundedSignal(parent, timeoutMs) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = setTimeout(abort, timeoutMs)

  if (parent?.aborted) abort()
  else parent?.addEventListener?.('abort', abort, { once: true })

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer)
      parent?.removeEventListener?.('abort', abort)
    },
  }
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
 * Convert Open-Meteo's offset-free local hourly stamp to a comparable wall-clock
 * value. `timezone=auto` deliberately gives local times, so validate continuity
 * without letting the browser's own timezone reinterpret them.
 */
function localHourlyStamp(time) {
  const match = typeof time === 'string' && time.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):00$/)
  if (!match) return null

  const [, year, month, day, hour] = match
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour))
}

/**
 * One hourly column. Day/night comes from that date's sunrise/sunset rather
 * than requesting hourly `is_day` — one fewer variable that can invalidate the
 * whole request, and the sun times are already on hand.
 */
function hourEntry(hourly, index, sunByDate, { isNow = false } = {}) {
  const time = hourly.time[index]
  if (typeof time !== 'string') return null

  const date = time.slice(0, 10)
  const hour = Number(time.slice(11, 13))
  const day = sunByDate.get(date)
  const rise = typeof day?.sunrise === 'string' ? Number(day.sunrise.slice(11, 13)) : 6
  const set = typeof day?.sunset === 'string' ? Number(day.sunset.slice(11, 13)) : 20

  return {
    time,
    hour,
    isNow,
    temperature: hourly.temperature_2m?.[index] ?? null,
    weatherCode: hourly.weather_code?.[index] ?? null,
    precipChance: hourly.precipitation_probability?.[index] ?? null,
    // Already requested for last-24h totals; retained for precip timing / wet hours.
    precipitation: hourly.precipitation?.[index] ?? null,
    cloudCover: hourly.cloud_cover?.[index] ?? null,
    isDay: hour >= rise && hour <= set,
  }
}

/**
 * Index every hourly step by local calendar date (YYYY-MM-DD).
 * The forecast already requests the full multi-day hourly series for cloud
 * cover; retaining it here powers the per-day strip without another request.
 */
function buildHoursByDate(payload, days) {
  const hourly = payload.hourly ?? {}
  const times = hourly.time ?? []
  const sunByDate = new Map(days.map((d) => [d.date, d]))
  const byDate = new Map()

  for (let i = 0; i < times.length; i += 1) {
    const entry = hourEntry(hourly, i, sunByDate)
    if (!entry) continue
    const date = entry.time.slice(0, 10)
    const bucket = byDate.get(date)
    if (bucket) bucket.push(entry)
    else byDate.set(date, [entry])
  }
  return byDate
}

/**
 * The rolling next 24 hours starting from the current hour — feeds the card,
 * not the day list. Future days use their full local day from hoursByDate.
 */
function buildNextHours(payload, days) {
  const hourly = payload.hourly ?? {}
  const times = hourly.time ?? []
  const nowIso = payload.current?.time
  if (!times.length || typeof nowIso !== 'string') return []

  // ISO prefixes compare correctly as strings, so no Date parsing is needed.
  const nowKey = nowIso.slice(0, 13)
  let start = times.findIndex((t) => t.slice(0, 13) >= nowKey)
  if (start < 0) start = 0

  const sunByDate = new Map(days.map((d) => [d.date, d]))
  const out = []
  for (let offset = 0; offset < HOURLY_WINDOW; offset += 1) {
    const i = start + offset
    if (i >= times.length) break
    const entry = hourEntry(hourly, i, sunByDate, { isNow: offset === 0 })
    if (entry) out.push(entry)
  }
  return out
}

/**
 * Sum hourly precipitation ending at the current hour (inclusive).
 * Each Open-Meteo hourly `precipitation` value is the preceding-hour total.
 * Requires past_days on the request so enough history exists before "now".
 *
 * Integrity: only returns a number when the full lookback window is present
 * with a finite precip value in every consecutive hour. Incomplete history, gaps, or
 * non-finite slots yield null — never a partial sum presented as a full day.
 * A complete window of zeros is real dry weather and returns 0.
 */
export function sumPrecipLast24h(payload, lookback = PRECIP_LOOKBACK_HOURS) {
  const times = payload?.hourly?.time ?? []
  const values = payload?.hourly?.precipitation ?? []
  const nowIso = payload?.current?.time
  if (!times.length || typeof nowIso !== 'string') return null

  const nowKey = nowIso.slice(0, 13)
  let end = -1
  for (let i = 0; i < times.length; i += 1) {
    if (typeof times[i] === 'string' && times[i].slice(0, 13) <= nowKey) end = i
  }
  if (end < 0) return null

  // Need lookback consecutive hours ending at end; do not clamp to 0.
  const start = end - (lookback - 1)
  if (start < 0 || end - start + 1 < lookback) return null

  let sum = 0
  let previousStamp = null
  for (let i = start; i <= end; i += 1) {
    const stamp = localHourlyStamp(times[i])
    const value = values[i]
    // A numeric slot without its matching hourly timestamp would silently
    // substitute an adjacent hour into the total. Prefer unavailable to a
    // plausible but dishonest 24-hour value.
    if (
      !Number.isFinite(value) ||
      stamp == null ||
      (previousStamp != null && stamp - previousStamp !== 60 * 60 * 1000)
    ) {
      return null
    }
    previousStamp = stamp
    sum += value
  }
  return sum
}

/**
 * past_days prepends yesterday to daily.time. The rest of the app treats
 * days[0] as today (card high/low, forecast list offset) — drop any dates
 * before the current local calendar day, then keep FORECAST_DAYS ahead.
 */
function forecastDayIndexes(daily, currentTime) {
  const times = daily?.time ?? []
  if (!times.length) return []

  const todayKey =
    typeof currentTime === 'string' && currentTime.length >= 10
      ? currentTime.slice(0, 10)
      : times[0]

  let start = times.findIndex((date) => date >= todayKey)
  if (start < 0) start = 0

  const indexes = []
  for (let i = start; i < times.length && indexes.length < FORECAST_DAYS; i += 1) {
    indexes.push(i)
  }
  return indexes
}

/** Reshape the parallel-array payload into one object per day. */
function normalise(payload) {
  const daily = payload.daily ?? {}
  const cloudByDate = summariseCloudCover(payload.hourly, daily)
  const pick = (key, i) => daily[key]?.[i] ?? null
  const dayIndexes = forecastDayIndexes(daily, payload.current?.time)

  // Build days without hours first so sun times are available for day/night.
  const daysBase = dayIndexes.map((i) => {
    const date = daily.time[i]
    return {
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
    }
  })

  const hoursByDate = buildHoursByDate(payload, daysBase)
  const days = daysBase.map((day) => ({
    ...day,
    hours: hoursByDate.get(day.date) ?? [],
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
    hours: buildNextHours(payload, days),
    precipLast24h: sumPrecipLast24h(payload),
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

/**
 * Active NWS alerts are their own provider and deliberately stay out of the
 * forecast payload. In dev there is no Netlify function runtime; production
 * uses the cached proxy so the browser never hammers the NWS service directly.
 */
function buildAlertsUrl({ latitude, longitude }) {
  const point = `${latitude.toFixed(4)},${longitude.toFixed(4)}`
  const direct =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV

  if (direct) return `${NWS_ACTIVE_ALERTS}?${new URLSearchParams({ point })}`
  return `/api/alerts?${new URLSearchParams({ lat: latitude.toFixed(4), lon: longitude.toFixed(4) })}`
}

function normaliseAlerts(payload) {
  return (payload.features ?? [])
    .filter((feature) => {
      const props = feature?.properties ?? {}
      // /active should already enforce this, but a stale edge response or a
      // cancellation message must never be presented as a live warning.
      if (String(props.messageType ?? '').toLowerCase() === 'cancel') return false
      const expiry = Date.parse(props.expires ?? props.ends ?? '')
      return !Number.isFinite(expiry) || expiry > Date.now()
    })
    .map((feature, index) => {
      const props = feature?.properties ?? {}
      return {
        id: feature?.id ?? props.id ?? `${props.event ?? 'alert'}-${props.effective ?? index}`,
        event: props.event ?? 'Weather alert',
        headline: props.headline ?? props.event ?? 'Weather alert',
        severity: props.severity ?? 'Unknown',
        urgency: props.urgency ?? null,
        certainty: props.certainty ?? null,
        effective: props.effective ?? props.onset ?? null,
        expires: props.expires ?? props.ends ?? null,
        area: props.areaDesc ?? null,
        description: props.description ?? null,
        instruction: props.instruction ?? null,
        sourceUrl: props['@id'] ?? null,
      }
    })
}

export async function fetchAlerts({ latitude, longitude }, signal) {
  try {
    const payload = await getJson(buildAlertsUrl({ latitude, longitude }), signal)
    return normaliseAlerts(payload)
  } catch (err) {
    // NWS rejects points outside its U.S. coverage. Keep that expected domain
    // state distinct from a temporary service failure without coupling the UI
    // to an upstream error string.
    if (err.status === 400 || err.status === 404 || err.status === 422) {
      err.code = 'coverage'
    }
    throw err
  }
}

/**
 * Current US AQI for the selected coordinates. Stays out of the forecast
 * payload (lazy Air tab only). Dev hits Open-Meteo AQ directly; production
 * uses the cached /api/air proxy.
 *
 * Product scope is U.S. coverage only — outside that, throws with
 * `code: 'coverage'` without calling the upstream (Open-Meteo would answer
 * worldwide; we choose not to).
 *
 * Returns null when the upstream payload has no usable us_aqi value (no-data).
 * Throws on transport/service failures so the panel can show an error state.
 *
 * @param {{ latitude: number, longitude: number }} opts
 * @param {AbortSignal} [signal]
 * @param {{ mode?: 'direct' | 'proxy' }} [options]
 */
export function buildAirQualityUrl({ latitude, longitude }, options = {}) {
  const mode =
    options.mode ??
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV
      ? 'direct'
      : 'proxy')

  if (mode === 'direct') {
    const params = new URLSearchParams({
      latitude: latitude.toFixed(4),
      longitude: longitude.toFixed(4),
      current: 'us_aqi',
      timezone: 'auto',
    })
    return `${OPEN_METEO_AIR}?${params}`
  }

  return `/api/air?${new URLSearchParams({
    lat: latitude.toFixed(4),
    lon: longitude.toFixed(4),
  })}`
}

export async function fetchAirQuality({ latitude, longitude }, signal, options = {}) {
  if (!isUsAqiCoverage(latitude, longitude)) {
    const err = new Error('US AQI is available only for locations in U.S. coverage.')
    err.code = 'coverage'
    throw err
  }

  const payload = await getJson(buildAirQualityUrl({ latitude, longitude }, options), signal)
  return normaliseCurrentAirQuality(payload)
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

/** BigDataCloud appends " (the)" to some country names; strip for readable labels. */
function cleanCountryName(name) {
  if (typeof name !== 'string' || !name) return ''
  return name.replace(/\s*\(the\)\s*$/i, '').trim()
}

/**
 * Name a lat/lon fix. Keeps the GPS coordinates (not the city centroid) so the
 * place key stays at the actual position.
 *
 * Returns null when the service has no usable place name — caller falls back.
 */
export async function reverseGeocode(latitude, longitude, signal) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    localityLanguage: 'en',
  })
  const deadline = boundedSignal(signal, REVERSE_GEOCODE_TIMEOUT_MS)
  let data
  try {
    data = await getJson(`${REVERSE_GEOCODE}?${params}`, deadline.signal)
  } finally {
    deadline.dispose()
  }

  const name = data.city || data.locality || data.principalSubdivision || ''
  if (!name) return null

  const admin1 = data.principalSubdivision ?? ''
  const country = cleanCountryName(data.countryName)

  return {
    name,
    label: [name, admin1, country].filter(Boolean).join(', '),
    latitude,
    longitude,
    admin1,
    country,
    countryCode: data.countryCode ?? '',
  }
}

function readBrowserPosition() {
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

/**
 * Resolve the browser fix and reverse-geocode it to a city name.
 * On reverse failure the coordinates still win with a generic label — weather
 * works either way; only the display name is weaker.
 */
export async function currentPosition(signal) {
  const coords = await readBrowserPosition()
  try {
    const named = await reverseGeocode(coords.latitude, coords.longitude, signal)
    if (named) return { ...named, id: 'geo' }
  } catch {
    /* reverse is best-effort */
  }
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    name: 'My location',
    label: 'My location',
    id: 'geo',
  }
}
