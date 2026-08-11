/**
 * Cached regional NWS warning/watch GeoJSON proxy for the severe desk.
 * It is deliberately separate from the existing point-based Alerts panel.
 */
import { buildNwsActiveAlertsUrl, normaliseNwsAreaCodes } from '../../src/lib/severeDesk/nwsWarningRequest.js'

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  })
}

function eventFilter(value) {
  if (value === null || value === '') return null
  if (value.length > 120) return undefined
  return value.trim() || null
}

export default async function handler(request) {
  const params = new URL(request.url).searchParams
  // `region` and `region_type` are NWS marine-only parameters. Reject them so
  // this land-only desk can never silently construct a marine request.
  if (params.has('region') || params.has('region_type')) {
    return json({ error: 'Marine region parameters are not valid for the land warning desk.' }, 400)
  }

  const areaCodes = normaliseNwsAreaCodes(params.get('area'))
  const event = eventFilter(params.get('event'))
  if (!areaCodes || event === undefined) {
    return json({ error: 'area must contain one to four supported land state or territory codes.' }, 400)
  }

  const upstream = buildNwsActiveAlertsUrl(areaCodes, event)
  try {
    const response = await fetch(upstream, {
      headers: {
        Accept: 'application/geo+json',
        'User-Agent': 'StormLogic weather alert viewer',
      },
      signal: AbortSignal.timeout(9000),
    })

    if (!response.ok) return json({ error: 'NWS warning service error.' }, 502)
    return json(await response.json(), 200, {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
    })
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    return json({ error: timedOut ? 'NWS warning service timed out.' : 'Could not reach NWS warnings.' }, 504)
  }
}
