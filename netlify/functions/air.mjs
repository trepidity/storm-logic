/**
 * Cached proxy for Open-Meteo Air Quality (US AQI current reading).
 *
 * Same shape as forecast.mjs: validate lat/lon, round to 2dp so nearby
 * visitors share a CDN entry, hold the response for 15 minutes. Air quality
 * models update on the order of hours, so s-maxage=900 is fine.
 *
 * Routed via the /api/* redirect in netlify.toml.
 */

const OPEN_METEO_AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality'

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  })
}

export function buildUpstreamAirQualityUrl({ latitude, longitude, coordDecimals = 2, hourly = false }) {
  const params = new URLSearchParams({
    latitude: Number(latitude).toFixed(coordDecimals),
    longitude: Number(longitude).toFixed(coordDecimals),
    ...(hourly ? { hourly: 'us_aqi' } : { current: 'us_aqi' }),
    timezone: 'auto',
  })
  return `${OPEN_METEO_AIR}?${params}`
}

export default async function handler(request) {
  const params = new URL(request.url).searchParams
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))
  const requestedHourly = params.get('hourly')
  if (requestedHourly !== null && requestedHourly !== 'us_aqi') {
    return json({ error: 'Unsupported hourly request.' }, 400)
  }
  const hourly = requestedHourly === 'us_aqi'

  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return json({ error: 'Invalid or missing lat/lon.' }, 400)
  }

  // Rounded to ~1 km so nearby visitors share one cache entry.
  const upstream = buildUpstreamAirQualityUrl({ latitude: lat, longitude: lon, coordDecimals: 2, hourly })

  try {
    const res = await fetch(upstream, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(9000),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return json(
        { error: 'Upstream air quality service error.', status: res.status, detail: detail.slice(0, 300) },
        502,
      )
    }

    return json(await res.json(), 200, {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
    })
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    return json(
      { error: timedOut ? 'Air quality service timed out.' : 'Could not reach the air quality service.' },
      504,
    )
  }
}
