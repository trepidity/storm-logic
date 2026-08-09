/**
 * Cached Open-Meteo proxy.
 *
 * Why this exists: Open-Meteo's free tier is capped (roughly 10k calls/day) and
 * is non-commercial. Routing through the CDN means one upstream call serves every
 * visitor in a region for the cache window, instead of one call per page load.
 *
 * Routed via the /api/* redirect in netlify.toml.
 */

const UPSTREAM = 'https://api.open-meteo.com/v1/forecast'

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
].join(',')

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
].join(',')

const HOURLY_VARS = ['cloud_cover', 'temperature_2m', 'precipitation_probability'].join(',')

const UNIT_PRESETS = {
  imperial: { temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch' },
  metric: { temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm' },
}

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  })
}

export default async function handler(request) {
  const params = new URL(request.url).searchParams
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))

  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return json({ error: 'Invalid or missing lat/lon.' }, 400)
  }

  const units = UNIT_PRESETS[params.get('units')] ?? UNIT_PRESETS.imperial

  const upstream = new URL(UPSTREAM)
  upstream.search = new URLSearchParams({
    // Rounded to ~1km so nearby visitors share one cache entry.
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    current: CURRENT_VARS,
    daily: DAILY_VARS,
    hourly: HOURLY_VARS,
    timezone: 'auto',
    forecast_days: '10',
    ...units,
  }).toString()

  try {
    const res = await fetch(upstream, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(9000),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return json({ error: 'Upstream weather service error.', status: res.status, detail: detail.slice(0, 300) }, 502)
    }

    return json(await res.json(), 200, {
      // Browsers revalidate; the Netlify CDN holds the response for 15 minutes
      // and can serve it stale for an hour while refreshing in the background.
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
    })
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    return json({ error: timedOut ? 'Weather service timed out.' : 'Could not reach the weather service.' }, 504)
  }
}
