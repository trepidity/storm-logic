/**
 * Cached Open-Meteo proxy.
 *
 * Why this exists: Open-Meteo's free tier is capped (roughly 10k calls/day) and
 * is non-commercial. Routing through the CDN means one upstream call serves every
 * visitor in a region for the cache window, instead of one call per page load.
 *
 * Upstream query shape (variables, forecast_days, unit maps) comes from
 * src/lib/forecastContract.js — the same module the browser uses in dev — so
 * prod and dev cannot drift on requested fields.
 *
 * Routed via the /api/* redirect in netlify.toml.
 */

import { buildUpstreamForecastUrl } from '../../src/lib/forecastContract.js'

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

  // Rounded to ~1km so nearby visitors share one cache entry.
  const upstream = buildUpstreamForecastUrl({
    latitude: lat,
    longitude: lon,
    unitId: params.get('units') ?? 'imperial',
    coordDecimals: 2,
  })

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
