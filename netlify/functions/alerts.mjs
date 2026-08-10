/**
 * Cached proxy for active National Weather Service alerts.
 *
 * NWS asks clients not to poll its alert feed more often than every 30 seconds.
 * Keeping that short cache at the CDN gives the Alerts tab a timely answer while
 * coalescing nearby visitors instead of sending one upstream request per click.
 */

const NWS_ACTIVE_ALERTS = 'https://api.weather.gov/alerts/active'

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

  // Match the forecast proxy's ~1 km buckets so nearby visitors share cache.
  const point = `${lat.toFixed(2)},${lon.toFixed(2)}`
  const upstream = `${NWS_ACTIVE_ALERTS}?${new URLSearchParams({ point })}`

  try {
    const res = await fetch(upstream, {
      headers: {
        Accept: 'application/geo+json',
        'User-Agent': 'StormLogic weather alert viewer',
      },
      signal: AbortSignal.timeout(9000),
    })

    if (res.status === 400 || res.status === 404) {
      return json({ error: 'NWS alerts are unavailable for this location.' }, 422)
    }
    if (!res.ok) return json({ error: 'NWS alert service error.' }, 502)

    return json(await res.json(), 200, {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
    })
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    return json({ error: timedOut ? 'NWS alert service timed out.' : 'Could not reach NWS alerts.' }, 504)
  }
}
